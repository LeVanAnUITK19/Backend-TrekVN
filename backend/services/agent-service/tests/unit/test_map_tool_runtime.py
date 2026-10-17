"""Windows/Docker bridging must use the real tools and correctly bind job files."""
from __future__ import annotations

import asyncio
import sys
from unittest.mock import AsyncMock, patch

import pytest

from app.tools.command_runner import run_command
from app.tools.map_tool_runtime import (container_command, windows_to_wsl, resolve_backend,
                                         check_map_tools)


def test_windows_path_translation():
    assert windows_to_wsl(r"C:\tmp\TrekVN maps\job-1") == "/mnt/c/tmp/TrekVN maps/job-1"
    assert windows_to_wsl("D:/maps/job") == "/mnt/d/maps/job"
    with pytest.raises(ValueError):
        windows_to_wsl(r"\\server\share\job")


def test_auto_windows_uses_wsl_when_native_tools_missing(test_settings):
    test_settings.map_tool_backend = "auto"
    with patch("app.tools.map_tool_runtime.platform.system", return_value="Windows"), \
         patch("app.tools.map_tool_runtime.shutil.which", side_effect=lambda t: "wsl.exe" if t == "wsl" else None):
        assert resolve_backend(test_settings) == "wsl-docker"


def test_linux_auto_preserves_native_execution(test_settings):
    test_settings.map_tool_backend = "auto"
    with patch("app.tools.map_tool_runtime.platform.system", return_value="Linux"):
        assert resolve_backend(test_settings) == "native"


def test_docker_binds_only_job_and_rewrites_paths(test_settings, tmp_path):
    test_settings.map_tool_backend = "docker"
    source, dest = tmp_path / "input with spaces.pbf", tmp_path / "output.mbtiles"
    with patch("app.tools.map_tool_runtime.shutil.which", return_value="docker"):
        argv = container_command(("tilemaker", "--input", str(source), "--output", str(dest)),
                                 tmp_path, test_settings, "docker", "trekvn-map-test")
    assert argv[-5:] == ["tilemaker", "--input", "/map-work/input with spaces.pbf", "--output", "/map-work/output.mbtiles"]
    assert f"type=bind,source={tmp_path.resolve()},target=/map-work" in argv
    assert "--pull=never" in argv and "none" in argv
    with patch("app.tools.map_tool_runtime.shutil.which", return_value="docker"), pytest.raises(PermissionError):
        container_command(("osmium", str(tmp_path.parent / "outside.pbf")), tmp_path,
                          test_settings, "docker", "trekvn-map-test")


@pytest.mark.asyncio
async def test_remote_preflight_checks_inside_image(test_settings):
    test_settings.map_tool_backend = "wsl-docker"
    with patch("app.tools.map_tool_runtime.platform.system", return_value="Windows"), \
         patch("app.tools.map_tool_runtime.shutil.which", return_value="wsl.exe"), \
         patch("app.tools.command_runner.run_command", new_callable=AsyncMock, return_value=("[]", "")) as run:
        missing, backend = await check_map_tools(test_settings)
    assert missing == [] and backend == "wsl-docker"
    assert run.call_args.args[:5] == ("wsl", "--distribution", "Ubuntu", "--exec", "docker")
    assert test_settings.map_tool_image in run.call_args.args


@pytest.mark.asyncio
async def test_remote_runtime_failure_is_actionable(test_settings):
    test_settings.map_tool_backend = "docker"
    with patch("app.tools.map_tool_runtime.shutil.which", return_value="docker"), \
         patch("app.tools.command_runner.run_command", new_callable=AsyncMock, side_effect=RuntimeError("daemon unavailable")):
        with pytest.raises(RuntimeError, match="Map tools runtime.*daemon unavailable"):
            await check_map_tools(test_settings)


@pytest.mark.asyncio
async def test_native_runner_still_executes_argument_list(tmp_path):
    stdout, _ = await run_command(sys.executable, "-c", "print('native works')", cwd=tmp_path,
                                  allowed_root=tmp_path, timeout=10)
    assert stdout.strip() == "native works"


@pytest.mark.skipif(sys.platform != "win32", reason="Uvicorn reload uses this Windows loop")
def test_runner_supports_windows_selector_loop(tmp_path):
    previous = asyncio.get_event_loop_policy()
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        stdout, _ = asyncio.run(run_command(
            sys.executable, "-c", "print('reload works')", cwd=tmp_path,
            allowed_root=tmp_path, timeout=10))
        assert stdout.strip() == "reload works"
    finally:
        asyncio.set_event_loop_policy(previous)


@pytest.mark.asyncio
async def test_runner_timeout_terminates_process(tmp_path):
    with pytest.raises(asyncio.TimeoutError, match="timed out"):
        await run_command(sys.executable, "-c", "import time; time.sleep(30)",
                          cwd=tmp_path, allowed_root=tmp_path, timeout=0.1)
