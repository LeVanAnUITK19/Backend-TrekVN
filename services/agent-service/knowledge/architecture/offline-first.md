---
title: TrekViet Offline-First Architecture
category: architecture
active: true
---

# Offline-First Architecture

## Nguyên tắc

TrekViet được thiết kế để hoạt động đầy đủ khi không có mạng.
Server chỉ là nơi đồng bộ và validation sau cùng.

## Flutter Local Storage

- SQLite cho: journeys, markers, checkins, journey state
- Hive/SharedPrefs cho: user settings, cache
- Offline map: MBTiles files (MapLibre)

## Offline Map Flow

```
Admin → Map Builder (agent-service)
      → bbox + zoom → tạo MBTiles
      → Admin approve
      → R2 upload
      → Update trekking-service offlineMap metadata (objectKey + version)

Flutter:
  → GET /routes/:id/offline-package
  → nhận mapManifest.downloadUrl
  → download ZIP trực tiếp từ R2 (không qua gateway)
  → verify checksum
  → unzip → lưu local
  → MapLibre render offline
```

**Quan trọng:**
- DB lưu `objectKey` (không lưu `downloadUrl`)
- `downloadUrl = R2_PUBLIC_BASE_URL + "/" + objectKey` (build tại runtime)
- Flutter chỉ dùng `downloadUrl` từ API response
- R2_PUBLIC_BASE_URL chỉ cấu hình server-side

## Map Update Detection

```
Flutter → GET /routes/:id/offline-package/check?version=<current>
        → { hasUpdate: true, serverVersion: N }
        → user chọn update → download ZIP mới
```

## Check-in Sync

```
Offline check-in:
  → lưu SQLite với clientCheckinId
  → khi online → POST /checkins/sync
  → server xử lý idempotent (cùng clientCheckinId → trả serverCheckinId cũ)

Online check-in:
  → POST /checkins
  → verify GPS, milestoneId
  → lưu server immediately
```

## Journey Sync

- `clientJourneyId` generated trước khi tạo journey → idempotency key
- Journey markers: `clientMarkerId` per journey+user
- Complete journey: gửi `encodedPolyline` (không gửi raw GPS array)

## Idempotency Keys

| Entity | Key field |
|--------|----------|
| Journey | `clientJourneyId` |
| MilestoneCheckin | `clientCheckinId` |
| JourneyMarker | `clientMarkerId` |
| Contribution | `clientOperationId` |
