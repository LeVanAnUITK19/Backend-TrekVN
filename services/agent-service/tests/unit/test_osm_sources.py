"""Use regional PBFs even when every Overpass server is unavailable."""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest

from app.tools.map_tool_runtime import container_command
from app.workflows.map_builder.state import MapBuilderState
from app.workflows.map_builder.steps.extract_osm import extract_osm, _validate_osm_xml


def state_for(path):
    return MapBuilderState(job_id="MAP-test", trekking_place_id="", place_name="Ba Den",
                           place_slug="ba-den", publish_target_type="PLACE", publish_target_id="",
                           bbox_min_lon=106.13943, bbox_min_lat=11.36157,
                           bbox_max_lon=106.19162, bbox_max_lat=11.41239,
                           min_zoom=10, max_zoom=14, admin_id="admin-1", work_dir=path,
                           osmium_available=True)


@pytest.mark.asyncio
async def test_regional_pbf_succeeds_without_any_overpass_call(test_settings, tmp_path):
    source = tmp_path / "regional.osm.pbf"
    source.write_bytes(b"source")
    test_settings.map_osm_pbf_path = str(source)
    header = {"header": {"boxes": [[102, 7, 115, 24]], "option": {"timestamp": "2026-10-09"}}}

    async def command(*args, **kwargs):
        if args[1] == "fileinfo":
            return json.dumps(header), ""
        (tmp_path / "ba-den.osm.pbf").write_bytes(b"extracted")
        return "", ""

    with patch("app.workflows.map_builder.steps.extract_osm.run_command", side_effect=command) as run, \
         patch("app.workflows.map_builder.steps.extract_osm._download_from_overpass", new_callable=AsyncMock,
               side_effect=RuntimeError("all servers down")) as overpass:
        state = await extract_osm(state_for(tmp_path), test_settings)
    assert state.final_status != "FAILED", state.errors
    assert state.osm_pbf_path.read_bytes() == b"extracted"
    assert state.osm_source == {"type": "regional-pbf", "file": source.name, "timestamp": "2026-10-09"}
    overpass.assert_not_awaited()
    assert "smart" in run.call_args.args
    assert run.call_args.kwargs["read_only_input"] == source.resolve()


@pytest.mark.asyncio
@pytest.mark.parametrize("header", [
    {"boxes": [[0, 0, 1, 1]]},
    {"boxes": []},
    {"boxes": [[102, 7, 115, 24]], "with_history": True},
])
async def test_regional_source_rejects_unknown_or_wrong_coverage(test_settings, tmp_path, header):
    source = tmp_path / "regional.osm.pbf"
    source.write_bytes(b"source")
    test_settings.map_osm_pbf_path = str(source)
    with patch("app.workflows.map_builder.steps.extract_osm.run_command", new_callable=AsyncMock,
               return_value=(json.dumps({"header": header}), "")) as run:
        state = await extract_osm(state_for(tmp_path), test_settings)
    assert state.final_status == "FAILED"
    assert state.osm_pbf_path is None
    assert run.await_count == 1


def test_docker_mounts_exact_source_read_only_and_preserves_job_isolation(test_settings, tmp_path):
    job = tmp_path / "job"
    job.mkdir()
    source = tmp_path / "regional.osm.pbf"
    source.write_bytes(b"source")
    with patch("app.tools.map_tool_runtime.shutil.which", return_value="docker"):
        argv = container_command(("osmium", "extract", str(source), "-o", str(job / "small.pbf")),
                                 job, test_settings, "docker", "map-test", source)
        assert f"type=bind,source={source.resolve()},target=/map-source/input.osm.pbf,readonly" in argv
        assert argv[-5:] == ["osmium", "extract", "/map-source/input.osm.pbf", "-o", "/map-work/small.pbf"]
        with pytest.raises(PermissionError):
            container_command(("osmium", str(tmp_path / "other-private-file")), job,
                              test_settings, "docker", "map-test", source)


@pytest.mark.parametrize("content", [
    b'<?xml version="1.0"?><html><body>Gateway timeout</body></html>',
    b'<osm><remark>runtime error: Query timed out</remark></osm>',
    b'<osm></osm>',
    b'<osm><node',
])
def test_overpass_does_not_accept_error_pages_as_map_data(content):
    with pytest.raises(RuntimeError):
        _validate_osm_xml(content, "test")


def test_valid_osm_xml_is_accepted():
    _validate_osm_xml(b'<osm version="0.6"><node id="1" lat="11.38" lon="106.16"/></osm>', "test")
