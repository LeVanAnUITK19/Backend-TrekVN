---
title: Badge Design & Management Rules
category: business-rules
active: true
---

# Badge Design & Management

## Badge Fields

```json
{
  "badgeId": "...",
  "code": "FIRST_SUMMIT",
  "name": "Đỉnh Đầu Tiên",
  "description": "Hoàn thành check-in SUMMIT lần đầu tiên",
  "iconUrl": "https://cdn.../badges/first_summit.png",
  "category": "TREKKING",
  "rarity": "COMMON",
  "condition": {
    "type": "SUMMIT_CHECKIN_COUNT",
    "value": 1
  },
  "status": "ACTIVE"
}
```

## Categories

- **TREKKING** — check-in, milestone, journey completion
- **EXPLORATION** — khám phá địa điểm mới, provinces
- **DISTANCE** — tổng km trekking
- **PROVINCE** — số tỉnh đã đến

## Rarities & XP Multiplier (guideline)

| Rarity | Color | Guideline |
|--------|-------|----------|
| COMMON | Xám | Badge dễ đạt, milestone đầu tiên |
| RARE | Xanh | Cần effort nhất định |
| EPIC | Tím | Cần nhiều nỗ lực, hiếm user đạt |
| LEGENDARY | Vàng | Chỉ những trekker hardcore mới đạt |

## Admin Badge Management

### Tạo badge mới
`POST /admin/badges` — yêu cầu: code, name, description, iconUrl, category, rarity, condition, status

### Cập nhật badge
`PUT /admin/badges/:badgeId` — có thể cập nhật tất cả fields

### Deactivate badge
`PATCH /admin/badges/:badgeId/status` → `{ "status": "INACTIVE" }`
- Deactivate không xóa badge
- User đã đạt vẫn giữ badge

## Badge Award Flow

```
TREKKING_JOURNEY_COMPLETED event (RabbitMQ)
    │
    ▼
auth-service consumer
    │
    ├── cộng XP (idempotent)
    ├── check badge conditions
    ├── award new badges (if conditions met)
    └── update UserRankProfile
```

## Change Request Workflow (Agent)

Admin muốn thay đổi badge conditions → tạo `gamification_change_request` trong agent DB:
1. Admin mô tả thay đổi muốn làm
2. Agent tạo draft change request (lưu agent MongoDB)
3. Admin review draft
4. Admin approve → gọi `PUT /admin/badges/:id` trên trekking-service

**Agent KHÔNG tự sửa badge production — phải qua approval.**

## Guidelines cho Admin khi thiết kế badge

1. Đặt condition value dựa trên data thực tế (dùng `get_badges` + `get_system_overview` để tham chiếu)
2. Mỗi category nên có progression: COMMON → RARE → EPIC → LEGENDARY
3. Ít nhất 1 badge COMMON để user mới có thể đạt nhanh (onboarding)
4. LEGENDARY nên rất hiếm — kiểm tra `get_rank_distribution` để ước tính % user có thể đạt
5. `code` phải uppercase_snake_case, unique, mô tả rõ ràng
