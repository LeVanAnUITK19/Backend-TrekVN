"""Use native map binaries or a local Docker image, including Docker inside WSL."""
from __future__ import annotations

import json
import platform
import shutil
from pathlib import Path, PureWindowsPath

from app.config import Settings

MAP_TOOLS = ("osmium", "tilemaker", "gdalbuildvrt", "gdalwarp", "gdal_contour",
             "gdaldem", "gdal_translate", "gdaladdo", "ogr2ogr")


def resolve_backend(settings: Settings | None) -> str:
    if settings is None:
        return "native"
    if settings.map_tool_backend != "auto":
        return settings.map_tool_backend
    if platform.system() != "Windows" or all(shutil.which(tool) for tool in MAP_TOOLS):
        return "native"
    if shutil.which("docker"):
        return "docker"
    if shutil.which("wsl"):
        return "wsl-docker"
    return "native"


def docker_prefix(settings: Settings, backend: str) -> list[str]:
    if backend == "wsl-docker":
        if platform.system() != "Windows" or not shutil.which("wsl"):
            raise RuntimeError("WSL is unavailable; configure MAP_TOOL_BACKEND=native or docker")
        return ["wsl", "--distribution", settings.map_wsl_distribution, "--exec", "docker"]
    if not shutil.which("docker"):
        raise RuntimeError("Docker CLI is unavailable")
    return ["docker"]


def windows_to_wsl(path: str) -> str:
    value = PureWindowsPath(path)
    if len(value.drive) != 2 or value.drive[1] != ":" or not value.is_absolute():
        raise ValueError("WSL map tools require an absolute local Windows drive path")
    return f"/mnt/{value.drive[0].lower()}/" + "/".join(value.parts[1:])


def container_command(args: tuple[str, ...], cwd: Path, settings: Settings,
                      backend: str, container_name: str, read_only_input: Path | None = None) -> list[str]:
    root = cwd.resolve()
    host_root = windows_to_wsl(str(root)) if backend == "wsl-docker" else str(root)
    if "," in host_root:
        raise ValueError("Map work directory cannot contain commas (Docker mount syntax)")
    source = read_only_input.resolve() if read_only_input else None
    mounts = ["--mount", f"type=bind,source={host_root},target=/map-work"]
    if source:
        if not source.is_file():
            raise ValueError("Regional OSM input file does not exist")
        host_source = windows_to_wsl(str(source)) if backend == "wsl-docker" else str(source)
        if "," in host_source:
            raise ValueError("Regional OSM path cannot contain commas (Docker mount syntax)")
        mounts += ["--mount", f"type=bind,source={host_source},target=/map-source/input.osm.pbf,readonly"]
    translated = []
    for arg in args:
        value = str(arg)
        path = Path(value)
        if path.is_absolute():
            if source and path.resolve() == source:
                translated.append("/map-source/input.osm.pbf")
                continue
            try:
                relative = path.resolve().relative_to(root)
            except ValueError:
                raise PermissionError(f"Map tool path is outside job directory: {value}")
            value = "/map-work" + ("/" + relative.as_posix() if relative.parts else "")
        translated.append(value)
    return docker_prefix(settings, backend) + [
        "run", "--rm", "--pull=never", "--name", container_name,
        "--user", settings.map_tool_container_user, "--network", "none",
        *mounts, "--workdir", "/map-work",
        settings.map_tool_image, *translated,
    ]


async def check_map_tools(settings: Settings) -> tuple[list[str], str]:
    backend = resolve_backend(settings)
    if backend == "native":
        return [tool for tool in MAP_TOOLS if not shutil.which(tool)], backend
    from app.tools.command_runner import run_command
    prefix = docker_prefix(settings, backend)
    code = ("import json,shutil; print(json.dumps([t for t in " + repr(MAP_TOOLS) +
            " if shutil.which(t) is None]))")
    try:
        stdout, _ = await run_command(*prefix, "run", "--rm", "--pull=never", "--network", "none",
                                     settings.map_tool_image, "python", "-c", code, timeout=45)
        return json.loads(stdout.strip()), backend
    except Exception as exc:
        raise RuntimeError(
            f"Map tools runtime ({backend}) is unavailable: {exc}. "
            f"Check WSL/Docker and build local image '{settings.map_tool_image}'."
        ) from exc
