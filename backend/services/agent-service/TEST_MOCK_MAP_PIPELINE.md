# Test Mock Map Builder Pipeline

> Mock ZIPs only test the UI and cannot be approved/published as offline maps.
> For real artifacts use the full pipeline or MAP_SOURCE_PACKAGE; see `../../docs/agent/map-builder.md`.
> The older approve/upload instructions below describe the former mock behavior.

## Overview
Mock pipeline mode allows testing the complete map builder workflow without installing external tools (osmium, tippecanoe, gdal). It creates dummy files and moves jobs to PENDING_REVIEW status immediately.

## Setup

### 1. Verify Mock Mode is Enabled
Check `.env`:
```bash
MAP_PIPELINE_MODE=mock
```

### 2. Start Agent Service
```powershell
cd Backend-TrekVN/services/agent-service
.venv/Scripts/Activate.ps1
python -m uvicorn app.main:app --reload --port 8000
```

## Test Workflow

### Step 1: Create Map Job (via Web-Admin)
1. Login to Web-Admin: http://localhost:5173
2. Navigate to Agent → Map Builder
3. Fill form:
   - Place Name: "Test Area"
   - Min Longitude: 106.0
   - Min Latitude: 10.0
   - Max Longitude: 106.1
   - Max Latitude: 10.1
   - Min Zoom: 10
   - Max Zoom: 14
4. Click "Create Map"

**Expected**: Job created with status QUEUED

### Step 2: Watch Pipeline Execute
The mock pipeline will:
- Validate input (instant)
- Create workdir (instant)
- Create dummy OSM data (~100ms)
- Create dummy MBTiles (~100ms)
- Create dummy style.json (~50ms)
- Package ZIP (~50ms)
- Move to PENDING_REVIEW (~50ms)

**Total time**: ~500ms (vs. 5-30 minutes for full pipeline)

### Step 3: Check Job Status
```powershell
curl http://localhost:8000/api/v1/agent/map-jobs | ConvertFrom-Json | Select -ExpandProperty data | Select jobId, status, @{Name='progress';Expression={$_.progress.percent}}
```

**Expected Output**:
```json
{
  "jobId": "...",
  "status": "PENDING_REVIEW",
  "progress": {
    "percent": 100,
    "currentStep": "WAITING_REVIEW"
  }
}
```

### Step 4: Approve Map
1. In Web-Admin, go to Map Builder list
2. Find your job with status "PENDING_REVIEW"
3. Click "Review" → "Approve"

**Expected**: Job moves to APPROVED status

### Step 5: Publish Map
1. Click "Publish" button
2. System should:
   - Upload ZIP to R2
   - Call trekking-service to register map
   - Move job to PUBLISHED status

### Step 6: Verify in Task History
1. Go to Agent → Task History
2. Find your map task
3. Click to view details

**Expected**: Full task details with all steps shown

## API Testing

### Create Job via API
```powershell
$headers = @{
    "Authorization" = "Bearer YOUR_TOKEN"
    "Content-Type" = "application/json"
}

$body = @{
    placeName = "Mock Test"
    bboxMinLon = 106.0
    bboxMinLat = 10.0
    bboxMaxLon = 106.1
    bboxMaxLat = 10.1
    minZoom = 10
    maxZoom = 14
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/agent/map-jobs" -Method POST -Headers $headers -Body $body
$response.data
```

### Check Events Log
```powershell
curl "http://localhost:8000/api/v1/agent/map-jobs/$jobId/events" -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Events**:
```json
[
  {"event": "JOB_CREATED", "level": "INFO"},
  {"event": "PIPELINE_START", "level": "INFO"},
  {"event": "MOCK_VALIDATE", "level": "INFO"},
  {"event": "MOCK_WORKDIR", "level": "INFO"},
  {"event": "MOCK_OSM", "level": "INFO"},
  {"event": "MOCK_MBTILES", "level": "INFO"},
  {"event": "MOCK_STYLE", "level": "INFO"},
  {"event": "MOCK_ZIP", "level": "INFO"},
  {"event": "MOCK_COMPLETE", "level": "INFO"}
]
```

### Approve via API
```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/v1/agent/map-jobs/$jobId/approve" -Method POST -Headers @{"Authorization"="Bearer YOUR_TOKEN"}
```

### Publish via API
```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/v1/agent/map-jobs/$jobId/publish" -Method POST -Headers @{"Authorization"="Bearer YOUR_TOKEN"}
```

## Switching to Full Pipeline

When ready to use real tools:

1. Install dependencies:
```bash
# Ubuntu/Debian
sudo apt-get install osmium-tool tippecanoe gdal-bin

# macOS
brew install osmium-tool tippecanoe gdal

# Windows (WSL recommended)
# Use WSL Ubuntu and run apt-get commands above
```

2. Update `.env`:
```bash
MAP_PIPELINE_MODE=full
```

3. Restart agent-service

## Mock vs Full Mode Comparison

| Feature | Mock Mode | Full Mode |
|---------|-----------|-----------|
| Tools Required | None | osmium, tippecanoe, gdal |
| Execution Time | ~500ms | 5-30 minutes |
| Output Quality | Dummy files | Real map tiles |
| Use Case | UI testing | Production use |
| File Size | ~1-2 KB | 10-500 MB |

## Troubleshooting

### Job Stuck in QUEUED
- Check agent-service logs: `tail -f logs/app.log`
- Verify MAP_PIPELINE_MODE=mock in .env
- Restart agent-service

### Pipeline Fails with "OSM data failed"
- This means mock mode is NOT enabled
- Double-check .env file
- Make sure you restarted service after changing .env

### Approve Returns 422
- Job must be in PENDING_REVIEW status
- Check current status: GET /api/v1/agent/map-jobs/{id}
- If stuck in PROCESSING, check logs for errors

### ZIP File is Empty/Corrupt
- In mock mode, ZIP only contains dummy data
- This is expected - mock mode is for workflow testing only
- Use full mode for production-ready map tiles

## Notes

- Mock mode creates real files but with dummy content
- ZIP files are valid but contain placeholder data
- R2 upload will work but uploaded files are not usable maps
- Trekking service will accept the map registration but won't have real tiles
- This is intentional - mock mode is for integration testing, not production use
