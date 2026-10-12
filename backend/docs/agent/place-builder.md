# Place Builder Workflow

## Mục tiêu

Tự động thu thập và chuẩn hoá dữ liệu **một địa điểm trekking cụ thể** từ OSM, Wikidata, web.
Không quét toàn bộ tỉnh/khu vực.

## Input

```json
{
  "placeName": "Núi Bà Đen",
  "locationHint": "Tây Ninh",
  "operation": "CREATE",
  "targetPlaceId": null
}
```

Hoặc UPDATE:

```json
{
  "placeName": "Núi Bà Đen",
  "locationHint": "Tây Ninh",
  "operation": "UPDATE",
  "targetPlaceId": "existing-place-id"
}
```

## Pipeline

```
validate_input
     ↓
discover_osm          ← Overpass API (IMPORTANT)
     ↓
enrich_wikidata       ← Wikidata API (optional/soft-fail)
     ↓
crawl_web             ← Wikipedia API (optional/soft-fail)
     ↓
normalize             ← deterministic, no LLM
     ↓
duplicate_check       ← trekking-service read-only
     ↓
validate_candidate    ← rule-based confidence score
     ↓
save_candidate        → status=PENDING_REVIEW
```

**Soft-fail steps:** wikidata, crawl_web — nếu fail, pipeline vẫn tiếp tục với warning.

**OSM là bước quan trọng** — nếu fail, confidence score giảm đáng kể nhưng pipeline vẫn có thể lưu candidate với warning.

## Candidate Schema

`productionPayload` map chính xác vào `trekking_places` schema:

| Field | Source | Note |
|---|---|---|
| `name` | OSM `name:vi` > OSM `name` > Wikidata label | |
| `slug` | Derived from name | `slugify("Núi Bà Đen")` → `"nui-ba-den"` |
| `provinceId` | Must be resolved before approve | Không approve nếu còn null |
| `location` | OSM coordinates (lon, lat) | GeoJSON Point |
| `elevationMeters` | OSM `ele` > Wikidata P2044 | |
| `description` | Wikidata vi > Wikipedia extract > Wikidata en | |
| `difficulty` | Rule-based từ OSM tags | |
| `tags` | Rule-based từ OSM natural/tourism | |
| `dataOrigin` | Always `"AI_AGENT"` | |
| `externalRefs` | `{ osm: { type, id }, wikidataId }` | |
| `lastVerifiedAt` | Set tại approval time | |

**LLM không được tự bịa:** GPS, elevation, source, map URL.

## Confidence Score (Rule-Based)

| Field | Weight |
|---|---|
| name | 20 |
| location | 20 |
| provinceId | 15 |
| elevationMeters | 10 |
| description | 10 |
| difficulty | 5 |
| tags | 5 |
| externalRefs.osm | 10 |
| externalRefs.wikidataId | 5 |

Score LLM không được tự assign — tính từ rules.

## Duplicate Detection

Priority:

1. `externalRefs.osm.id` match → score 95
2. `externalRefs.wikidataId` match → score 90
3. Exact normalized name → score 80
4. Nearby coordinate (TODO: requires nearby endpoint)
5. Fuzzy name

Phát hiện duplicate → warning + flag, **không tự merge**.

## Candidate States

```
PROCESSING → PENDING_REVIEW
          → FAILED

PENDING_REVIEW → APPROVED
              → REJECTED
              → NEEDS_FIX (Admin sửa rồi về PENDING_REVIEW)
```

## Approve Flow

```
1. Load candidate
2. Must be PENDING_REVIEW
3. provinceId must be resolved
4. name must exist
5. Call trekking-service:
   CREATE → POST /api/v1/admin/trekking/places
   UPDATE → PUT  /api/v1/admin/trekking/places/:targetPlaceId
6. On success: status=APPROVED, productionSync.synced=true
7. On failure: NOT marked APPROVED, error logged, retry allowed
```

**Production write xảy ra DUY NHẤT sau approve.**

## APIs

```
POST  /api/v1/agent/place-builder/jobs
GET   /api/v1/agent/place-builder/jobs/:jobId
GET   /api/v1/agent/place-builder/candidates
GET   /api/v1/agent/place-builder/candidates/:id
PATCH /api/v1/agent/place-builder/candidates/:id
POST  /api/v1/agent/place-builder/candidates/:id/approve
POST  /api/v1/agent/place-builder/candidates/:id/reject
```

## provinceId Resolution

Trước khi approve, Admin phải đảm bảo `provinceId` đã được điền vào candidate.

Workflow:
1. Agent normalize xong — `provinceId = null`
2. Admin review candidate
3. Admin sửa `provinceId` qua `PATCH /candidates/:id`
4. Admin approve

TODO: Tự động resolve `provinceId` từ `locationHint` bằng API checkin-service.
