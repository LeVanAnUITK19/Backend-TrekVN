---
title: Gamification Business Rules
category: business-rules
active: true
---

# Gamification Business Rules

## XP System

### XP Sources

| Source | Event | XP Rule |
|--------|-------|---------|
| `JOURNEY_COMPLETED` | Journey status → COMPLETED | Fixed XP per journey |
| `JOURNEY_DISTANCE` | Journey COMPLETED | XP per km |
| `JOURNEY_ELEVATION` | Journey COMPLETED | XP per 100m elevation gain |
| `MILESTONE_CHECKIN` | Milestone GPS check-in | XP per milestone type |
| `PROVINCE_VISITED` | First VERIFIED visit to a province | Fixed XP |
| `PLACE_VISITED` | First VERIFIED visit to a place | Fixed XP |
| `BADGE_EARNED` | Badge awarded | Varies by rarity |
| `ROUTE_APPROVED` | Route submission APPROVED | Fixed XP |
| `PLACE_APPROVED` | Place suggestion APPROVED | Fixed XP |
| `ADMIN_ADJUSTMENT` | Manual admin XP change | Custom |

### Idempotency
- `idempotencyKey` unique trên `xp_transactions` — chống cộng XP nhiều lần khi retry/offline sync
- Processed events tracked trong `processed_events` collection

## Rank System

### 10 Ranks (level 1→10)

| Level | Code | Tên |
|-------|------|-----|
| 1 | NEWBIE | Người mới |
| 2 | HIKER | Hiker |
| 3 | EXPLORER | Explorer |
| 4 | TREKKER | Trekker |
| 5 | PATHFINDER | Pathfinder |
| 6 | MOUNTAINEER | Mountaineer |
| 7 | ADVENTURER | Adventurer |
| 8 | ELITE_TREKKER | Elite Trekker |
| 9 | TREK_MASTER | Trek Master |
| 10 | TREK_LEGEND | Trek Legend |

### Rank Conditions

Mỗi rank có các điều kiện tối thiểu:
- `minXp` — XP tích lũy
- `minCompletedJourneys` — số journey hoàn thành
- `minVisitedProvinces` — số tỉnh đã đến
- `minBadgeCount` — số badge đạt được
- `minDistanceMeters` — tổng khoảng cách trekking
- `minApprovedContributions` — số đóng góp được duyệt

### UserRankProfile

Mỗi user có `user_rank_profiles`:
- `totalXp`, `currentRankId`
- `completedJourneyCount`, `totalDistanceMeters`, `totalElevationGain`
- `verifiedCheckinCount`, `visitedProvinceCount`, `visitedPlaceCount`
- `badgeCount`, `approvedContributionCount`
- `lastCalculatedAt`

## Badge System

### Badge structure
- `code` — unique identifier (e.g. `FIRST_SUMMIT`, `SUMMIT_MASTER`)
- `category`: TREKKING | EXPLORATION | DISTANCE | PROVINCE
- `rarity`: COMMON | RARE | EPIC | LEGENDARY
- `condition`: `{ type, value }` — điều kiện để đạt badge
- `status`: ACTIVE | INACTIVE

### Badge Condition Types

| Type | Mô tả |
|------|-------|
| `SUMMIT_CHECKIN_COUNT` | Số lần check-in SUMMIT |
| `ALTITUDE_REACHED` | Đạt độ cao X mét |
| `DISTANCE_TOTAL` | Tổng khoảng cách trekking (mét) |
| `PROVINCE_COUNT` | Số tỉnh VERIFIED visit |
| `PLACE_COUNT` | Số địa điểm đã visit |
| `JOURNEY_COMPLETED_COUNT` | Số journey hoàn thành |

### UserBadge
- Mỗi user-badge pair là unique `(userId, badgeId)`
- `earnedAt` + `journeyId` (journey giúp user đạt badge)

## Rank Change History

- `rank_history` ghi lại mọi thay đổi rank
- `changeType`: PROMOTION | DEMOTION | RECALCULATION
- Demotion có thể xảy ra khi admin điều chỉnh conditions
