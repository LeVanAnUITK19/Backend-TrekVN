"""Step: create isolated working directory for this job."""

from __future__ import annotations

import shutil
from pathlib import Path

from app.config import Settings

from ..state import MapBuilderState


async def prepare_workdir(state: MapBuilderState, settings: Settings) -> MapBuilderState:
    """
    Create a per-job working directory under MAP_WORK_ROOT.

    Path: {MAP_WORK_ROOT}/map-jobs/{jobId}/

    NEVER writes outside this directory.
    """
    work_root = Path(settings.map_work_root).resolve()
    jobs_dir = work_root / "map-jobs"
    job_dir = (jobs_dir / state.job_id).resolve()
    if job_dir.parent != jobs_dir.resolve():
        raise ValueError("Map job directory must be a direct child of MAP_WORK_ROOT/map-jobs")

    # Ensure parent exists
    jobs_dir.mkdir(parents=True, exist_ok=True)

    # Clean up any leftover from a previous failed run
    if job_dir.exists():
        shutil.rmtree(job_dir)

    job_dir.mkdir(parents=True, exist_ok=True)

    state.work_dir = job_dir

    # Derive zip file name from slug and version (matching existing convention)
    state.zip_file_name = f"{state.place_slug}-v{state.map_version}-flutter.zip"

    state.update_step("PREPARE_WORKDIR", "DONE")
    return state
