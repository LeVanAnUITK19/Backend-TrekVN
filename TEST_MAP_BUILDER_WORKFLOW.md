# Test Map Builder Workflow - Agent Service

## 🎯 Mục đích
Kiểm tra workflow tạo bản đồ offline từ đầu đến cuối trong agent-service.

## ✅ Đã fix
- ✅ Thêm `JSONResponse` import vào `map_builder.py`
- ✅ Xóa code duplicate trong map_builder.py
- ✅ Service-to-service authentication đã hoạt động

## 🔄 Workflow Map Builder

### 1. Tạo Map Job
```http
POST /api/v1/agent/map-jobs
Authorization: Bearer <admin_jwt_token>
Content-Type: application/json

{
  "trekkingPlaceId": "67800f2e1c32c9fce1ed76e8",
  "placeName": "Núi Bà Đen (Tây Ninh)",
  "publishTarget": {
    "type": "PLACE",
    "targetId": "67800f2e1c32c9fce1ed76e8"
  },
  "bbox": {
    "minLon": 106.08,
    "minLat": 11.23,
    "maxLon": 106.12,
    "maxLat": 11.27
  },
  "minZoom": 10,
  "maxZoom": 14
}
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "mapJobId": "MAP-20261006-XXXXXXXX",
    "status": "PENDING",
    "placeName": "Núi Bà Đen (Tây Ninh)",
    "createdAt": "2026-10-06T10:11:50Z",
    ...
  }
}
```

### 2. Kiểm tra trạng thái Job

```http
GET /api/v1/agent/map-jobs/{mapJobId}
Authorization: Bearer <admin_jwt_token>
```

**Các trạng thái:**
- `PENDING` - Job vừa tạo, đang chờ xử lý
- `PROCESSING` - Đang download tiles và tạo MBTiles
- `PENDING_REVIEW` - Hoàn tất, đang chờ admin review
- `APPROVED` - Admin đã approve, đã publish lên R2
- `REJECTED` - Admin từ chối

### 3. List tất cả Jobs

```http
GET /api/v1/agent/map-jobs?status=PENDING_REVIEW&page=1&limit=10
Authorization: Bearer <admin_jwt_token>
```

### 4. Download artifact để review (khi status = PENDING_REVIEW)

```http
GET /api/v1/agent/map-artifacts/{mapJobId}/download
Authorization: Bearer <admin_jwt_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "url": "/api/v1/agent/map-builder/jobs/{mapJobId}/artifact"
  }
}
```

### 5. Approve Job

```http
POST /api/v1/agent/map-jobs/{mapJobId}/approve
Authorization: Bearer <admin_jwt_token>
Content-Type: application/json

{
  "note": "Bản đồ chất lượng tốt, approve để publish"
}
```

**Actions khi approve:**
- Upload file .mbtiles lên Cloudflare R2
- Cập nhật trekking-service với offline map metadata
- Chuyển status thành `APPROVED`

### 6. Reject Job (nếu không hài lòng)

```http
POST /api/v1/agent/map-jobs/{mapJobId}/reject
Authorization: Bearer <admin_jwt_token>
Content-Type: application/json

{
  "note": "Độ phủ chưa đủ, cần tăng bbox"
}
```

## 🧪 Test từ Web Admin

### Bước 1: Tạo job từ UI
1. Vào Map Builder page
2. Chọn địa điểm (Núi Bà Đen)
3. Vẽ bbox trên bản đồ
4. Chọn zoom level (10-14)
5. Click "Create Map Job"

### Bước 2: Monitor progress
- Job list sẽ hiện job mới với status PENDING
- Sau vài phút → PROCESSING
- Sau 5-15 phút (tùy bbox size) → PENDING_REVIEW

### Bước 3: Review & Approve
1. Click vào job để xem chi tiết
2. Download artifact (.mbtiles file)
3. Test bản đồ offline bằng QGIS hoặc tool khác
4. Nếu OK → Click "Approve"
5. Nếu không OK → Click "Reject" với lý do

### Bước 4: Verify published map
1. Check trekking-service API:
```http
GET /api/v1/admin/trekking/routes/{routeId}/offline-map
```

2. Verify R2 storage có file:
```
https://pub-c429007bbe324419a00997f91770fc06.r2.dev/offline-maps/{filename}.mbtiles
```

## 🔍 Kiểm tra Log

### Agent-service logs:
```
[INFO] app.workflows.map_builder.service: Map Builder job created: MAP-20261006-XXXXXXXX
[INFO] app.workflows.map_builder.worker: Starting map generation for MAP-20261006-XXXXXXXX
[INFO] app.workflows.map_builder.pipeline: Downloaded 1234 tiles
[INFO] app.workflows.map_builder.pipeline: MBTiles created: 45.2 MB
[INFO] app.workflows.map_builder.service: Job approved, publishing to R2...
[INFO] app.workflows.map_builder.r2: Uploaded to R2: offline-maps/ba-den-v2.mbtiles
```

### Trekking-service logs (sau approve):
```
[INFO] PUT /api/v1/admin/trekking/routes/{routeId}/offline-map 200
```

## ⚠️ Troubleshooting

### Job stuck ở PENDING
- Kiểm tra worker có chạy không: `ps aux | grep worker`
- Check MongoDB connection
- Xem log worker: `tail -f /tmp/trekviet-agent/logs/worker.log`

### Job failed ở PROCESSING
- **OSM Overpass timeout**: Bbox quá lớn → giảm bbox hoặc tăng timeout
- **Disk space**: Không đủ dung lượng → clean up `/tmp/trekviet-agent`
- **Network error**: Không download được tiles → retry hoặc check proxy

### Cannot download artifact
- Job phải ở status `PENDING_REVIEW`
- File phải tồn tại: `ls /tmp/trekviet-agent/jobs/{jobId}/`
- Check permissions

### Approve failed
- **R2 credentials invalid**: Check `.env` R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
- **Trekking-service không update**: Check service-to-service auth token
- **Network timeout**: Tăng timeout hoặc retry

## 📊 Expected Performance

| Bbox Size | Zoom Levels | Tiles Count | Processing Time | File Size |
|-----------|-------------|-------------|-----------------|-----------|
| 0.04°×0.04° | 10-14 | ~500-1000 | 2-5 phút | 5-15 MB |
| 0.1°×0.1° | 10-14 | ~2000-5000 | 5-15 phút | 20-50 MB |
| 0.2°×0.2° | 10-14 | ~8000-20000 | 15-45 phút | 80-200 MB |

**Note:** 
- Zoom 10-12: Phủ rộng, độ chi tiết thấp
- Zoom 13-14: Chi tiết cao, file size lớn
- Khuyến nghị: 10-14 cho trekking places

## ✅ Success Criteria

- [ ] Job được tạo thành công (status 201, có mapJobId)
- [ ] Job chuyển từ PENDING → PROCESSING
- [ ] Tiles được download (check log)
- [ ] MBTiles file được tạo (check filesystem)
- [ ] Job chuyển sang PENDING_REVIEW
- [ ] Download artifact thành công
- [ ] Approve thành công, upload lên R2
- [ ] Trekking-service có offline map metadata
- [ ] Flutter app có thể download và sử dụng map

---

**Ngày tạo:** 2026-10-06  
**Người thực hiện:** Kiro AI  
**Status:** ✅ READY TO TEST
