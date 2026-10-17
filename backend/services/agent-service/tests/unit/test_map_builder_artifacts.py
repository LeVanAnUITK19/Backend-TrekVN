"""Regression tests for actual map contents, clipping and publication guards."""
from __future__ import annotations

import gzip
import hashlib
import json
import sqlite3
import zipfile
from contextlib import closing
from unittest.mock import AsyncMock, patch

import pytest

from app.workflows.map_builder.artifacts import bounds_of, inspect_mbtiles, tile_range, restrict_generated_mbtiles
from app.workflows.map_builder.pipeline import run_map_builder_pipeline
from app.workflows.map_builder.steps.build_geojson import clip_geojson
from app.workflows.map_builder.steps.build_terrain import dem_tile_names
from app.workflows.map_builder.steps.clip_source_package import clip_source_package
from app.workflows.map_builder.steps.validate_input import validate_input
from app.workflows.map_builder.steps.validate_output import validate_output
from app.workflows.map_builder.state import MapBuilderState


def state_for(tmp_path, **overrides):
    values = dict(job_id="MAP-test", trekking_place_id="", place_name="Ba Den", place_slug="ba-den",
                  publish_target_type="PLACE", publish_target_id="", admin_id="admin-1", work_dir=tmp_path,
                  bbox_min_lon=106.13943, bbox_min_lat=11.36157, bbox_max_lon=106.19162, bbox_max_lat=11.41239,
                  min_zoom=10, max_zoom=17)
    values.update(overrides)
    return MapBuilderState(**values)


def _field(number, payload):
    # Fixture fields are all shorter than 128 bytes.
    return bytes([number << 3 | 2, len(payload)]) + payload


def _make_mbtiles(path, layer, kind, bounds):
    if kind == "vector":
        # Valid MVT LineString: MoveTo(0,0), LineTo(1,1), type=LINESTRING.
        feature = bytes([24, 2]) + _field(4, bytes([9, 0, 0, 10, 2, 2]))
        mvt = _field(3, _field(1, layer.encode()) + _field(2, feature) + bytes([120, 2]))
        data = gzip.compress(mvt)
        metadata = {"format": "pbf", "json": json.dumps({"vector_layers": [{"id": layer, "fields": {}}]})}
    else:
        import base64
        data = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=")
        metadata = {"format": "png"}
    metadata.update(bounds="106,11,107,12", minzoom="10", maxzoom="14")
    with closing(sqlite3.connect(path)) as db:
        db.executescript("CREATE TABLE metadata(name TEXT,value TEXT); "
                         "CREATE TABLE tiles(zoom_level INTEGER,tile_column INTEGER,tile_row INTEGER,tile_data BLOB);")
        db.executemany("INSERT INTO metadata VALUES (?,?)", metadata.items())
        for zoom in range(10, 15):
            xmin, xmax, rmin, rmax = tile_range(bounds, zoom)
            for col in range(xmin, xmax + 1):
                for row in range(rmin, rmax + 1):
                    db.execute("INSERT INTO tiles VALUES (?,?,?,?)", (zoom, col, row, data))
            # Extra tile outside requested bbox verifies that the workflow really cuts tiles.
            db.execute("INSERT INTO tiles VALUES (?,?,?,?)", (zoom, xmax + 1, rmin, data))
        db.commit()


@pytest.fixture
def source_package(tmp_path):
    state = state_for(tmp_path)
    files = []
    for key, suffix, layer, kind in (("base", "", "transportation", "vector"),
                                    ("contours", "-contours", "contour", "vector"),
                                    ("hillshade", "-hillshade", "", "raster")):
        path = tmp_path / f"source{suffix}.mbtiles"
        _make_mbtiles(path, layer, kind, bounds_of(state))
        files.append(path)
    routes = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"name": "Trail"},
              "geometry": {"type": "LineString", "coordinates": [[106.1, 11.38], [106.16, 11.38], [106.3, 11.38]]}}]}
    milestones = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"name": "Peak"}, "geometry": {"type": "Point", "coordinates": [106.16, 11.38]}}]}
    for key, data in (("routes", routes), ("milestones", milestones)):
        path = tmp_path / f"source-{key}.geojson"
        path.write_text(json.dumps(data), encoding="utf-8")
        files.append(path)
    # Legacy manifest intentionally has no layers or geojson field (same as user's ba-den-v1).
    manifest = {"bounds": [106, 11, 107, 12], "sha256": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in files}}
    output = tmp_path / "source.zip"
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr("manifest.json", json.dumps(manifest))
        for path in files:
            archive.write(path, path.name)
    return output


@pytest.mark.asyncio
async def test_pipeline_cuts_real_tiles_and_bundles_all_layers(test_settings, tmp_path, source_package):
    test_settings.map_source_package = str(source_package)
    test_settings.map_work_root = str(tmp_path / "jobs")
    jobs, events = AsyncMock(), AsyncMock()
    state = await run_map_builder_pipeline(state_for(tmp_path), test_settings, jobs, events)
    assert state.final_status == "PENDING_REVIEW", state.errors
    with zipfile.ZipFile(state.zip_path) as archive:
        assert len(archive.namelist()) == 7
        manifest = json.loads(archive.read("manifest.json"))
        assert {l["id"] for l in manifest["layers"]} == {"base", "contours", "hillshade"}
        assert manifest["maxNativeZoom"] == 14 and manifest["maxZoom"] == 17
        assert set(manifest["sha256"]) == set(archive.namelist()) - {"manifest.json"}
        style = json.loads(archive.read("style.json"))
        assert any(l.get("source-layer") == "contour" for l in style["layers"])
        route = json.loads(archive.read("ba-den-routes.geojson"))["features"][0]
        assert route["geometry"]["coordinates"][0][0] == state.bbox_min_lon
        assert route["geometry"]["coordinates"][-1][0] == state.bbox_max_lon
    source_count = inspect_mbtiles(tmp_path / "source.mbtiles", "vector")["count"]
    output_count = inspect_mbtiles(state.base_mbtiles_path, "vector", bounds_of(state))["count"]
    assert output_count < source_count


@pytest.mark.asyncio
async def test_missing_tools_fails_before_osm_or_packaging(test_settings, tmp_path):
    test_settings.map_source_package = ""
    jobs, events = AsyncMock(), AsyncMock()
    with patch("app.workflows.map_builder.steps.validate_input.shutil.which", return_value=None), \
         patch("app.workflows.map_builder.pipeline.extract_osm", new_callable=AsyncMock) as extract:
        state = await run_map_builder_pipeline(state_for(tmp_path), test_settings, jobs, events)
    assert state.final_status == "FAILED"
    assert "Missing map tools" in state.errors[0]
    extract.assert_not_awaited()
    assert state.zip_path is None
    assert not any(call.args[1].get("status") == "PENDING_REVIEW" for call in jobs.update.call_args_list)


@pytest.mark.asyncio
async def test_source_package_rejects_wrong_bbox(test_settings, tmp_path, source_package):
    test_settings.map_source_package = str(source_package)
    state = state_for(tmp_path, bbox_min_lon=107.35136, bbox_max_lon=107.4032,
                      bbox_min_lat=10.91612, bbox_max_lat=10.96402)
    await clip_source_package(state, test_settings)
    assert state.final_status == "FAILED"
    assert "outside" in state.errors[0]


@pytest.mark.asyncio
async def test_style_manifest_only_zip_fails(tmp_path):
    state = state_for(tmp_path)
    path = tmp_path / "broken.zip"
    style = json.dumps({"version": 8, "sources": {}, "layers": []}).encode()
    manifest = {"packageId": "ba-den-v1", "version": 1, "bounds": bounds_of(state),
                "minZoom": 10, "maxZoom": 17, "layers": [],
                "sha256": {"style.json": hashlib.sha256(style).hexdigest()}}
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("manifest.json", json.dumps(manifest))
        archive.writestr("style.json", style)
    state.zip_path = path
    await validate_output(state)
    assert state.final_status == "FAILED"


@pytest.mark.asyncio
async def test_native_failure_stops_pipeline_before_review(test_settings, tmp_path):
    test_settings.map_source_package = ""
    test_settings.map_work_root = str(tmp_path / "jobs")
    jobs, events = AsyncMock(), AsyncMock()
    async def broken_contours(state, settings):
        raise RuntimeError("GDAL failed")
    with patch("app.workflows.map_builder.steps.validate_input.shutil.which", return_value="/usr/bin/tool"), \
         patch("app.workflows.map_builder.pipeline.extract_osm", new_callable=AsyncMock, side_effect=lambda s, _: s), \
         patch("app.workflows.map_builder.pipeline.build_mbtiles", new_callable=AsyncMock, side_effect=lambda s, _: s), \
         patch("app.workflows.map_builder.pipeline.build_terrain", new_callable=AsyncMock, side_effect=lambda s, _: s), \
         patch("app.workflows.map_builder.pipeline.build_contours", side_effect=broken_contours), \
         patch("app.workflows.map_builder.pipeline.build_hillshade", new_callable=AsyncMock) as hillshade:
        state = await run_map_builder_pipeline(state_for(tmp_path), test_settings, jobs, events)
    assert state.final_status == "FAILED"
    assert "BUILD_CONTOURS" in state.errors[0]
    hillshade.assert_not_awaited()


def test_placeholder_bytes_are_not_mbtiles(tmp_path):
    path = tmp_path / "fake.mbtiles"
    path.write_bytes(b"MOCK MBTILES DATA")
    with pytest.raises(sqlite3.DatabaseError):
        inspect_mbtiles(path, "vector")


@pytest.mark.parametrize("kind", ["vector", "raster"])
def test_generated_mbtiles_remove_border_tiles_and_preserve_payloads(tmp_path, kind):
    # Exact bbox from the failed UI job: its east edge is near a zoom-11 border.
    bounds = [107.3529, 10.9159, 107.4005, 10.9634]
    path = tmp_path / "generated.mbtiles"
    _make_mbtiles(path, "contour", kind, bounds)
    with closing(sqlite3.connect(path)) as db:
        original = list(db.execute("SELECT zoom_level,tile_column,tile_row,tile_data FROM tiles"))
        # Include raster/vector padding on the north/south edges as well.
        for zoom in range(10, 15):
            xmin, xmax, rmin, rmax = tile_range(bounds, zoom)
            db.execute("INSERT INTO tiles VALUES (?,?,?,?)", (zoom, xmin, rmax + 1, original[0][3]))
        db.commit()
    expected = {}
    for zoom, col, row, payload in original:
        xmin, xmax, rmin, rmax = tile_range(bounds, zoom)
        if 10 <= zoom <= 12 and xmin <= col <= xmax and rmin <= row <= rmax:
            expected[zoom, col, row] = payload
    info = restrict_generated_mbtiles(path, kind, bounds, 10, 12)
    with closing(sqlite3.connect(path)) as db:
        actual = {(z, x, y): payload for z, x, y, payload in db.execute(
            "SELECT zoom_level,tile_column,tile_row,tile_data FROM tiles")}
    assert actual == expected
    assert info["discarded_tiles"] > 0
    assert info["metadata"]["bounds"] == ",".join(map(str, bounds))
    assert info["metadata"]["minzoom"] == "10" and info["metadata"]["maxzoom"] == "12"
    inspect_mbtiles(path, kind, bounds)


def test_generated_mbtiles_reject_empty_result_and_roll_back(tmp_path):
    path = tmp_path / "generated.mbtiles"
    _make_mbtiles(path, "contour", "vector", [107.3529, 10.9159, 107.4005, 10.9634])
    original = inspect_mbtiles(path, "vector")
    with pytest.raises(ValueError, match="No generated tiles intersect"):
        restrict_generated_mbtiles(path, "vector", [0, 0, 1, 1], 10, 14)
    restored = inspect_mbtiles(path, "vector")
    assert restored["count"] == original["count"]
    assert restored["metadata"] == original["metadata"]


def test_border_filter_does_not_hide_corrupt_tile_coordinates(tmp_path):
    bounds = [107.3529, 10.9159, 107.4005, 10.9634]
    path = tmp_path / "generated.mbtiles"
    _make_mbtiles(path, "contour", "vector", bounds)
    with closing(sqlite3.connect(path)) as db:
        db.execute("UPDATE tiles SET tile_row=-1 WHERE zoom_level=10")
        db.commit()
    with pytest.raises(ValueError, match="Invalid tile coordinates"):
        restrict_generated_mbtiles(path, "vector", bounds, 10, 14)


def test_dem_tiles_cover_integer_edges_and_negative_coordinates():
    assert dem_tile_names([106.13943, 11.36157, 106.19162, 11.41239]) == [("N11", "N11E106")]
    assert dem_tile_names([-1.5, -1.5, -1, -1]) == [("S02", "S02W002")]
    assert len(dem_tile_names([106.9, 11.9, 107.1, 12.1])) == 4


def test_geojson_clips_crossing_segment_without_inventing_milestones():
    source = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {},
              "geometry": {"type": "LineString", "coordinates": [[-1, 0.5], [2, 0.5]]}}]}
    result = clip_geojson(source, [0, 0, 1, 1])
    assert result["features"][0]["geometry"]["coordinates"] == [[0, 0.5], [1, 0.5]]
    assert clip_geojson({"type": "FeatureCollection", "features": []}, [0, 0, 1, 1])["features"] == []


@pytest.mark.asyncio
async def test_approve_blocks_mock_without_upload(test_settings):
    from app.workflows.map_builder.service import MapBuilderService
    jobs, events = AsyncMock(), AsyncMock()
    jobs.find_by_job_id.return_value = {"jobId": "MAP-test", "adminId": "admin-1", "status": "PENDING_REVIEW",
                                       "output": {"metadata": {"mock": True}}}
    with pytest.raises(ValueError, match="Mock"):
        await MapBuilderService(test_settings, jobs, events).approve("MAP-test", "admin-1")
    jobs.update.assert_not_awaited()


@pytest.mark.asyncio
async def test_approve_blocks_old_incomplete_artifact(test_settings, tmp_path):
    from app.workflows.map_builder.service import MapBuilderService
    jobs, events = AsyncMock(), AsyncMock()
    state = state_for(tmp_path)
    path = tmp_path / "empty.zip"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("manifest.json", "{}")
    test_settings.map_work_root = str(tmp_path)
    jobs.find_by_job_id.return_value = {
        "jobId": "MAP-test", "adminId": "admin-1", "status": "PENDING_REVIEW",
        "output": {"tempPath": str(path), "metadata": {"bounds": dict(zip(
            ["minLon", "minLat", "maxLon", "maxLat"], bounds_of(state)))}}}
    with pytest.raises(ValueError, match="incomplete"):
        await MapBuilderService(test_settings, jobs, events).approve("MAP-test", "admin-1")
    jobs.update.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("target_type", ["PLACE", "ROUTE"])
async def test_geojson_exports_current_routes_and_milestones(test_settings, tmp_path, target_type):
    from app.workflows.map_builder.steps.build_geojson import build_geojson
    state = state_for(tmp_path, trekking_place_id="place-1", publish_target_type=target_type,
                      publish_target_id="route-1" if target_type == "ROUTE" else "place-1")
    route = {"trekkingRouteId": "route-1", "name": "Trail", "path": {
        "type": "LineString", "coordinates": [[106.1, 11.38], [106.16, 11.38], [106.3, 11.38]]}}
    milestone = {"name": "Peak", "altitude": 986, "sequence": 1,
                 "location": {"type": "Point", "coordinates": [106.16, 11.38]}}
    client = AsyncMock()
    client.get_place_routes.return_value = [route]
    client.get_public_route_by_id.return_value = route
    client.get_route_milestones.return_value = [milestone]
    with patch("app.workflows.map_builder.steps.build_geojson.TrekkingServiceClient", return_value=client):
        await build_geojson(state, test_settings)
    assert state.final_status != "FAILED", state.errors
    assert len(json.loads(state.routes_geojson_path.read_text())["features"]) == 1
    assert json.loads(state.milestones_geojson_path.read_text())["features"][0]["properties"]["elevationM"] == 986
    client.get_route_milestones.assert_awaited_once_with("route-1")
    if target_type == "ROUTE":
        client.get_public_route_by_id.assert_awaited_once_with("route-1")
        client.get_place_routes.assert_not_awaited()
