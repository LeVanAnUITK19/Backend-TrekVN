---
title: Journey Business Rules
category: business-rules
active: true
---

# Journey Business Rules

## State Machine

```
PLANNED ──start──► ACTIVE ──pause──► PAUSED
   │                  │                 │
cancel             complete           resume → ACTIVE
   │                  │                 │
   ▼                  ▼               cancel
CANCELLED          COMPLETED        CANCELLED
```

## Rules

### BR-01 Journey ownership
- User chỉ xem/sửa Journey của chính mình (404 nếu không phải owner)

### BR-02 clientJourneyId idempotency
- `clientJourneyId` unique per user — dùng để map offline ↔ server ID
- Retry với cùng `clientJourneyId` trả về kết quả cũ

### BR-03 Complete journey
- Không nhận raw GPS array — chỉ nhận `encodedPolyline` + statistics
- Retry complete với `Idempotency-Key` → không emit XP event trùng

### BR-04 Journey → XP
- Journey COMPLETED → publish `TREKKING_JOURNEY_COMPLETED` lên RabbitMQ
- auth-service consume → cộng XP: JOURNEY_COMPLETED + JOURNEY_DISTANCE + JOURNEY_ELEVATION

### BR-05 Journey markers
- Chỉ tạo marker khi Journey ở ACTIVE hoặc PAUSED
- `clientMarkerId` unique per journey+user
- Xóa marker → `journey.markerCount` giảm atomically

### BR-06 Contribution từ journey
- Route submission chỉ tạo được từ Journey ở trạng thái COMPLETED
- Marker trong submission là snapshot — sửa marker gốc sau không ảnh hưởng review data

## Check-in Rules

### BR-10 GPS check-in validation
- `accuracyMeters ≤ CHECKIN_MAX_GPS_ACCURACY_METERS` (default 50m)
- Haversine distance userGPS ↔ milestoneGPS ≤ `checkinRadiusMeters`
- Duplicate check: `(journeyId, milestoneId, userId)` unique

### BR-11 PlaceVisit từ check-in
- `qualifiesPlaceVisit=true` → update/create PlaceVisit
- Mỗi Journey mới tại một Place → `visitCount += 1`
- Cùng Journey có nhiều qualifying milestone → chỉ tính 1 lần

### BR-12 ProvinceVisit không downgrade
- VERIFIED chỉ từ GPS check-in hợp lệ — không thể downgrade
- User bỏ tick VERIFIED → record giữ nguyên với `manualMarked=false`
- SELF_REPORTED tự upgrade thành VERIFIED khi có check-in tại tỉnh đó

## Offline sync rules

### BR-20 Checkin sync idempotency
- `clientCheckinId` bắt buộc cho sync items
- Retry cùng `clientCheckinId` → trả `serverCheckinId` cũ, không tạo bản ghi mới
- Một item fail không làm batch fail — xử lý độc lập
