"""
Safe async command runner for Map Builder pipeline.

Rules:
- NEVER concatenate shell strings from user input
- Always pass argument lists without shell=True
- Set timeout on every command
- Capture stdout/stderr with size limit
- Validate all path arguments against the allowed workdir
- Never allow path traversal
"""

from __future__ import annotations

import asyncio
import logging
import os
import platform
import subprocess
import threading
from pathlib import Path
from typing import Optional
from uuid import uuid4

from app.config import Settings
from app.tools.map_tool_runtime import container_command, docker_prefix, resolve_backend

logger = logging.getLogger(__name__)

_MAX_OUTPUT_BYTES = 64 * 1024  # 64 KB captured per command
_DEFAULT_TIMEOUT = 300         # 5 minutes


class CommandError(Exception):
    """Raised when a command exits with non-zero code."""

    def __init__(self, cmd: str, exit_code: int, stderr: str):
        super().__init__(f"Command '{cmd}' failed (exit {exit_code}): {stderr[:500]}")
        self.exit_code = exit_code
        self.stderr = stderr


def _assert_safe_path(path: Path, allowed_root: Path) -> None:
    """Raise if *path* escapes *allowed_root* (path traversal guard)."""
    try:
        path.resolve().relative_to(allowed_root.resolve())
    except ValueError:
        raise PermissionError(
            f"Path traversal detected: '{path}' is outside allowed root '{allowed_root}'"
        )


async def _capture_command(command, cwd, env, timeout):
    # Uvicorn --reload uses SelectorEventLoop on Windows, which cannot create
    # asyncio subprocesses. Run Popen in a thread there, keeping the API responsive.
    if platform.system() == "Windows":
        cancelled = threading.Event()
        holder = {}

        def execute():
            with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                  cwd=str(cwd) if cwd else None, env=env) as process:
                holder["process"] = process
                if cancelled.is_set():
                    process.kill()
                try:
                    out, err = process.communicate(timeout=timeout)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.communicate()
                    raise asyncio.TimeoutError(f"Command timed out after {timeout}s")
                return process.returncode, out, err

        try:
            return await asyncio.to_thread(execute)
        except asyncio.CancelledError:
            cancelled.set()
            process = holder.get("process")
            if process is not None and process.poll() is None:
                process.kill()
            raise
    process = await asyncio.create_subprocess_exec(
        *command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        cwd=str(cwd) if cwd else None, env=env,
    )
    try:
        out, err = await asyncio.wait_for(process.communicate(), timeout=timeout)
        return process.returncode, out, err
    except (asyncio.TimeoutError, asyncio.CancelledError):
        process.kill()
        await process.communicate()
        raise


async def run_command(
    *args: str,
    cwd: Optional[Path] = None,
    allowed_root: Optional[Path] = None,
    timeout: float = _DEFAULT_TIMEOUT,
    env: Optional[dict[str, str]] = None,
    settings: Optional[Settings] = None,
    read_only_input: Optional[Path] = None,
) -> tuple[str, str]:
    """
    Execute a command as a subprocess safely.

    Parameters
    ----------
    *args:        Command and arguments as separate strings (NO shell=True).
    cwd:          Working directory for the subprocess.
    allowed_root: If set, cwd must be under this root (anti-traversal check).
    timeout:      Seconds before process is killed (SIGKILL).
    env:          Override environment variables.
    settings:     Select native tools or Docker/WSL map tools.
    read_only_input: Optional regional OSM file, mounted read-only for Docker tools.

    Returns
    -------
    (stdout, stderr) as strings (truncated to _MAX_OUTPUT_BYTES each).

    Raises
    ------
    CommandError:    Non-zero exit code.
    asyncio.TimeoutError: Process timed out.
    PermissionError: Path traversal attempt.
    """
    if cwd and allowed_root:
        _assert_safe_path(cwd, allowed_root)

    backend = resolve_backend(settings)
    container_name = None
    command = list(map(str, args))
    if backend != "native":
        if not cwd or not allowed_root:
            raise ValueError("Docker map tools require an isolated job directory")
        container_name = f"trekvn-map-{uuid4().hex}"
        command = container_command(args, cwd, settings, backend, container_name, read_only_input)
    cmd_str = " ".join(command)
    logger.info("Running command: %s (cwd=%s, timeout=%ss)", cmd_str, cwd, timeout)

    proc_env = os.environ.copy()
    if env:
        proc_env.update(env)

    try:
        exit_code, stdout_bytes, stderr_bytes = await _capture_command(command, cwd, proc_env, timeout)
    except (asyncio.TimeoutError, asyncio.CancelledError) as exc:
        if container_name:
            try:
                await _capture_command(docker_prefix(settings, backend) + ["rm", "--force", container_name],
                                       None, proc_env, 15)
            except Exception as cleanup_error:
                logger.warning("Could not clean up map tool container %s: %s", container_name, cleanup_error)
        if isinstance(exc, asyncio.CancelledError):
            raise
        raise asyncio.TimeoutError(
            f"Command timed out after {timeout}s: {cmd_str}"
        )

    stdout = stdout_bytes[:_MAX_OUTPUT_BYTES].decode("utf-8", errors="replace")
    stderr = stderr_bytes[:_MAX_OUTPUT_BYTES].decode("utf-8", errors="replace")

    if exit_code != 0:
        logger.error(
            "Command failed (exit %d): %s\nstderr: %s",
            exit_code, cmd_str, stderr[:500],
        )
        raise CommandError(cmd_str, exit_code, stderr)

    logger.debug("Command succeeded: %s\nstdout: %s", cmd_str, stdout[:200])
    return stdout, stderr
