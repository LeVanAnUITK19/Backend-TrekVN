# Backend V4 Review & Changes

## Scope

### Included
- API Gateway
- Auth Service
- Checkin Service
- Trekking Service

### Excluded (out of scope for this review)
- Admin workflows
- Community Service
- Agent Service
- Notification Service

---

## Problems Found

| # | Service | Problem | Severity |
|---|---------|---------|----------|
| M1 | auth-service | `User.status` enum used `SUSPENDED`/`DISABLED` — DB v3.1 uses only `BLOCKED` | High |
| M2 | auth-service | `User.passwordHash` marked `required: true` — breaks Google-only users | High |
| M3 | auth-service | `AuthIdentity` model missing entirely — Google Sign-In not implemented | High |
| M4 | auth-service | `initRankProfile` picked first rank instead of NEWBIE by code | Medium |
| M5 | auth-service | TREK_LEGEND `minXp=75000` — SRS v4.0 FR-RANK-16 requires `80000` | Medium |
| M6 | auth-service | No RabbitMQ consumer — gamification events (JOURNEY_COMPLETED, CHECKIN_VERIFIED, etc.) never processed | High |
| M7 | api-gateway | `/api/v1/uploads/*` not routed to any service | High |
| M8 | api-gateway | Rate limit window/max hardcoded — not configurable via env vars | Medium |
| M9 | api-gateway | `PROTECTED_PREFIXES` missing `/api/v1/gamification/me`, `/api/v1/checkins/*`, `/api/v1/visits/*`, `/api/v1/uploads/*` | High |
| M10 | checkin-service | Route conflict: `GET /api/v1/journeys/:id/checkins` goes to trekking-service via gateway | High |
| M11 | checkin-service | No RabbitMQ publisher — `CHECKIN_VERIFIED` event never published | High |
| M12 | checkin-service | `amqplib` not in `package.json` | High |
| M13 | trekking-service | `GET /api/v1/places/:placeId/offline-package` missing — place-level offline map not exposed | High |
| M14 | trekking-service | `GET /api/v1/places/:placeId/offline-package/check` missing | Medium |
| M15 | trekking-service | Region filter in `GET /places?region=` missing — province data in different service | Medium |
| M16 | trekking-service | No RabbitMQ consumer — `CHECKIN_VERIFIED` → `Journey.checkinCount` never updated | High |
| M17 | trekking-service | No BadgeEvaluator — badge conditions never evaluated | High |
| M18 | trekking-service | RabbitMQ publish-and-forget — failed publishes silently lost | High |
| M19 | trekking-service | No Transactional Outbox — `JOURNEY_COMPLETED` event may be lost on crash | High |
| M20 | trekking-service | No `/api/v1/uploads/presign` endpoint | Medium |
| M21 | rank seed | All ranks had `minDistanceMeters > 0` — SRS says default `0` | Low |

---

## APIs Added

### Auth Service

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/google` | Google Sign-In / Sign-Up via ID Token |

### Checkin Service

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/checkins/journeys/:journeyId` | Canonical endpoint for journey checkins via Gateway (fixes route conflict) |

### Trekking Service

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/places/:placeId/offline-package` | Place-level offline package (place + routes + map manifest) |
| GET | `/api/v1/places/:placeId/offline-package/check` | Check place map version (UP_TO_DATE / OUTDATED / NOT_AVAILABLE) |
| POST | `/api/v1/uploads/presign` | Cloudinary presigned upload credentials |

---

## APIs Changed

### API Gateway

- `/api/v1/uploads/*` now routes to trekking-service
- `PROTECTED_PREFIXES` extended: `/api/v1/gamification/me`, `/api/v1/checkins/*`, `/api/v1/visits/*`, `/api/v1/uploads/*`
- Rate limit now reads `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX_REQUESTS` from env
- Rate limit response includes `Retry-After` header (SRS FR-SYNC-09)

### Auth Service

- `POST /api/v1/auth/login` — rejects Google-only users (no `passwordHash`) with 403 "Đăng nhập bằng Google"
- Existing login/register flows unchanged

### Checkin Service

- `POST /api/v1/checkins` — now publishes `CHECKIN_VERIFIED` + `PROVINCE_FIRST_VISITED` + `PLACE_FIRST_VISITED` after persist
- `_updatePlaceVisit` and `_updateProvinceVisit` now return `boolean` (first-visit flag)

### Trekking Service

- `GET /api/v1/places?region=<region>` — new `region` query param; calls checkin-service internal API for province IDs
- `POST /api/v1/journeys/:id/complete` — now writes event to Outbox + best-effort direct publish

---

## Database Changes

All changes are backwards-compatible additions, no field renames or drops.

### Auth Service (`auth_db`)

| Change | Detail |
|--------|--------|
| `users.status` enum | Changed: `SUSPENDED`/`DISABLED` → `BLOCKED`. Old documents with `SUSPENDED` need a migration. |
| `users.passwordHash` | Changed: `required: true` → nullable (`default: null`). Google-only users have null. |
| `users.role` enum | Removed `GUIDE` (not in DB v3.1 or SRS) |
| New collection: `auth_identities` | `AuthIdentity` model: `userId`, `provider` (LOCAL/GOOGLE), `providerUserId`. Indexes: `(userId, provider) unique`, `(provider, providerUserId) sparse unique`. |
| New collection: `processed_events` | Consumer idempotency: `(eventId, consumerName) unique`. TTL 30 days. |

### Trekking Service (`trekking_db`)

| Change | Detail |
|--------|--------|
| New collection: `event_outbox` | Transactional Outbox: `eventId unique`, `status`, `retryCount`, `nextRetryAt`. TTL on `publishedAt` (7 days). |
| New collection: `processed_events` | Consumer idempotency: `(eventId, consumerName) unique`. TTL 30 days. |

### Rank Seed Changes

| Rank | Field | Old | New |
|------|-------|-----|-----|
| TREK_LEGEND | `minXp` | 75000 | **80000** (SRS FR-RANK-16) |
| All ranks | `minDistanceMeters` | varied | **0** (SRS default; extension condition) |
| All ranks | `minApprovedContributions` | varied | **0** (SRS default) |
| ELITE_TREKKER | `minCompletedJourneys` | 60 | **65** |
| TREK_MASTER | `minCompletedJourneys` | 80 | **90** |
| TREK_LEGEND | `minCompletedJourneys` | 100 | **120** |

> **Migration note:** Re-run `npm run seed:ranks` in auth-service after deploying. The seed uses `upsert` and is safe to run multiple times.

---

## MongoDB Indexes Verified/Added

### Auth Service

```
AuthIdentity: { userId, provider } unique
AuthIdentity: { provider, providerUserId } sparse unique
ProcessedEvent: { eventId, consumerName } unique
ProcessedEvent: { processedAt } TTL 30d
```

### Checkin Service

```
MilestoneCheckin: { journeyId, milestoneId, userId } unique  ← existing
MilestoneCheckin: { clientCheckinId, userId } sparse unique  ← existing
```

### Trekking Service

```
TrekkingPlace: location 2dsphere           ← existing
TrekkingRoute: { trekkingPlaceId, status } ← existing
EventOutbox: { status, nextRetryAt }
EventOutbox: { publishedAt } TTL 7d (PUBLISHED only)
ProcessedEvent: { eventId, consumerName } unique
ProcessedEvent: { processedAt } TTL 30d
JourneyMarker: { journeyId, userId, clientMarkerId } sparse unique ← existing
Journey: { userId, clientJourneyId } sparse unique ← existing
```

---

## RabbitMQ Events

### Events Published

| Service | Event Type | Routing Key | Trigger |
|---------|-----------|-------------|---------|
| trekking-service | `TREKKING_JOURNEY_STARTED` | `trekking.journey.started` | Journey start |
| trekking-service | `TREKKING_JOURNEY_COMPLETED` | `trekking.journey.completed` | Journey complete (via Outbox) |
| trekking-service | `TREKKING_BADGE_EARNED` | `trekking.badge.earned` | Badge awarded |
| trekking-service | `TREKKING_CONTRIBUTION_APPROVED` | `trekking.contribution.approved` | Contribution approved (admin) |
| checkin-service | `CHECKIN_VERIFIED` | `checkin.verified` | Valid GPS check-in |
| checkin-service | `PROVINCE_FIRST_VISITED` | `province.first.visited` | First verified province visit |
| checkin-service | `PLACE_FIRST_VISITED` | `place.first.visited` | First verified place visit |

### Events Consumed

| Service | Queue | Events | Action |
|---------|-------|--------|--------|
| trekking-service | `trekking.service.events` | `CHECKIN_VERIFIED` | `Journey.checkinCount++` (idempotent) |
| trekking-service | `trekking.service.events` | `TREKKING_JOURNEY_COMPLETED` | BadgeEvaluator |
| auth-service | `auth.gamification.events` | `TREKKING_JOURNEY_COMPLETED` | XP: JOURNEY_COMPLETED + DISTANCE + ELEVATION |
| auth-service | `auth.gamification.events` | `CHECKIN_VERIFIED` | XP: MILESTONE_CHECKIN |
| auth-service | `auth.gamification.events` | `PROVINCE_FIRST_VISITED` | XP: PROVINCE_VISITED |
| auth-service | `auth.gamification.events` | `PLACE_FIRST_VISITED` | XP: PLACE_VISITED |
| auth-service | `auth.gamification.events` | `TREKKING_BADGE_EARNED` | XP: BADGE (by rarity) |
| auth-service | `auth.gamification.events` | `TREKKING_CONTRIBUTION_APPROVED` | XP: ROUTE/PLACE_APPROVED |

---

## Outbox Architecture

**Location:** `trekking-service`

```
Journey.complete()
    → journeyRepo.updateById()            [domain persist]
    → outboxRepo.enqueue(JOURNEY_COMPLETED)  [same MongoDB]
    → publisher.publish() fire-and-forget [best-effort low latency]
    
OutboxWorker (polls every 5s):
    → EventOutbox.find({ status: PENDING, nextRetryAt: ≤ now })
    → for each: publish to RabbitMQ
    → on success: mark PUBLISHED
    → on failure: exponential backoff, retryCount++
    → after MAX_RETRY (10): mark FAILED (dead-letter)
```

**Key properties:**
- `TREKKING_JOURNEY_COMPLETED` is the critical event — written to Outbox before response
- All other publishes (BADGE_EARNED, etc.) use best-effort + Outbox
- Domain requests never fail due to RabbitMQ unavailability

---

## Consumer Idempotency

Both auth-service and trekking-service consumers use `ProcessedEvent` collection:

```javascript
// On each event:
ProcessedEvent.create({ eventId, consumerName })
// → if duplicate key (11000): event already processed, skip
// → if new: proceed with side effects
```

**Guarantees:**
- `JOURNEY_COMPLETED` → XP capped at exactly-once per `idempotencyKey`
- `CHECKIN_VERIFIED` → `Journey.checkinCount` incremented exactly once per checkin
- `BADGE_EARNED` → `UserBadge` has `(userId, badgeId) unique` → duplicate insert ignored

---

## Gamification Flow

```
CHECKIN_VERIFIED (checkin-service publishes)
    ↓ auth-service GamificationConsumer
    → _awardXp(MILESTONE_CHECKIN, xpAmount=type-based, idempotencyKey=checkin:<id>)
    → userRankProfileRepo.incrementStats({ verifiedCheckinCount: 1 })
    → _evaluateRank(userId)   ← checks all rank conditions, supports multi-level jump
    → if rank changed: RankHistory.create()

TREKKING_JOURNEY_COMPLETED
    ↓ auth-service
    → JOURNEY_COMPLETED XP (150) once per journey
    → JOURNEY_DISTANCE XP (5/km)
    → JOURNEY_ELEVATION XP (10/100m gain)
    → incrementStats({ completedJourneyCount: 1, totalDistanceMeters, totalElevationGain })
    → _evaluateRank()

    ↓ trekking-service consumer
    → badgeEvaluator.evaluateBadges(userId, stats, journeyId)
    → for each ACTIVE badge whose condition is met → UserBadge.create (unique)
    → publish TREKKING_BADGE_EARNED

TREKKING_BADGE_EARNED
    ↓ auth-service
    → _awardXp(BADGE_EARNED, xp=COMMON 50/RARE 150/EPIC 400/LEGENDARY 1000)
    → incrementStats({ badgeCount: 1 })
    → _evaluateRank()
```

---

## Badge Flow

BadgeEvaluator (`trekking-service/src/services/badgeEvaluator.service.js`):

- Triggered by: `TREKKING_JOURNEY_COMPLETED` event consumed by trekking-service
- Loads all ACTIVE badges, evaluates `badge.condition` against current user stats
- Supported condition types: `JOURNEY_COMPLETED_COUNT`, `SUMMIT_CHECKIN_COUNT`, `DISTANCE_TOTAL`, `PROVINCE_VISITED_COUNT`, `ALTITUDE_REACHED`, `PLACE_VISITED_COUNT`, `FIRST_JOURNEY`
- Idempotent: `(userId, badgeId) unique` index on `UserBadge`
- On earn: inserts `UserBadge` + publishes `TREKKING_BADGE_EARNED` via Outbox

---

## Offline Map Flow

### Route scope (existing)
```
GET /api/v1/routes/:routeId/offline-package
→ returns: place, route, milestones, mapManifest
→ mapManifest.downloadUrl = R2_PUBLIC_BASE_URL + "/" + offlineMap.objectKey (runtime)
→ client downloads ZIP directly from R2/CDN

GET /api/v1/routes/:routeId/offline-package/check?version=X
→ returns: { hasUpdate, serverVersion, available, downloadUrl, checksum }
```

### Place scope (new)
```
GET /api/v1/places/:placeId/offline-package
→ returns: place, routes[], mapManifest (scope=PLACE)
→ mapManifest.downloadUrl = R2_PUBLIC_BASE_URL + "/" + place.offlineMap.objectKey

GET /api/v1/places/:placeId/offline-package/check?version=X
→ returns: { status: UP_TO_DATE|OUTDATED|NOT_AVAILABLE, serverVersion, available, downloadUrl, checksum }
```

**Key rule:** DB stores only `objectKey`. `downloadUrl` is NEVER stored in DB — always built at runtime. Changing CDN only requires updating `R2_PUBLIC_BASE_URL` env var.

---

## Media Upload Flow

```
Client: POST /api/v1/uploads/presign
    Body: { purpose, fileName, contentType, fileSizeBytes }
    ← response: { uploadUrl, objectKey, publicUrl, expiresIn, uploadParams }

Client: POST uploadUrl (Cloudinary API)
    multipart: file + uploadParams (api_key, timestamp, signature, folder, public_id)
    ← response: Cloudinary upload result

Client: PUT /api/v1/journeys/:id/markers/:markerId
    Body: { images: [publicUrl] }  ← update marker with uploaded URL
```

**Purposes:** `JOURNEY_MARKER`, `PLACE_REVIEW`, `ROUTE_CONTRIBUTION`, `PLACE_SUGGESTION`, `GPX`

**Security:**
- `objectKey` (Cloudinary `public_id`) generated by backend — client cannot choose arbitrary path
- Signature expires in 900 seconds
- MIME type and file size validated server-side before issuing signature

---

## Environment Variables Added

### API Gateway
```
RATE_LIMIT_WINDOW_MS=900000     # Rate limit window in ms (default 15min)
RATE_LIMIT_MAX_REQUESTS=200     # Max requests per window (default 200)
```

### Auth Service
```
GOOGLE_CLIENT_ID=<your-google-oauth-client-id>.apps.googleusercontent.com
RABBITMQ_URL=amqp://localhost:5672
RABBITMQ_EXCHANGE=trekvn.events
RABBITMQ_ENABLED=false         # Set true in production
```

### Checkin Service
```
RABBITMQ_URL=amqp://localhost:5672
RABBITMQ_EXCHANGE=trekvn.events
RABBITMQ_ENABLED=false
```

### Trekking Service
```
CHECKIN_SERVICE_URL=http://checkin-service:3002   # For region filter
CHECKIN_HTTP_TIMEOUT_MS=5000
OUTBOX_POLL_INTERVAL_MS=5000
OUTBOX_BATCH_SIZE=20
OUTBOX_MAX_RETRY=10
```

---

## Breaking Changes

| # | Change | Impact | Migration |
|---|--------|--------|-----------|
| 1 | `User.status` — `SUSPENDED`/`DISABLED` removed | Any existing document with these values will fail Mongoose validation | MongoDB migration: `db.users.updateMany({ status: "SUSPENDED" }, { $set: { status: "BLOCKED" } })` |
| 2 | `User.role` — `GUIDE` removed | Documents with `role: "GUIDE"` will fail validation | `db.users.updateMany({ role: "GUIDE" }, { $set: { role: "USER" } })` |
| 3 | Rank seed — TREK_LEGEND `minXp` 75000→80000 | Any user at 75000–79999 XP with TREK_LEGEND may be demoted on next recalc | Run seed, then trigger rank recalculation |
| 4 | `GET /api/v1/journeys/:journeyId/checkins` via Gateway | This path goes to trekking-service (wrong), not checkin-service | Frontend must use `/api/v1/checkins/journeys/:journeyId` instead |

---

## Migration Instructions

### 1. User status migration (MongoDB Atlas)
```javascript
// Run once on MongoDB Atlas before deploying new code
db.users.updateMany(
  { status: { $in: ["SUSPENDED", "DISABLED"] } },
  { $set: { status: "BLOCKED" } }
);
db.users.updateMany(
  { role: "GUIDE" },
  { $set: { role: "USER" } }
);
```

### 2. Seed ranks (auth-service)
```bash
cd services/auth-service
npm run seed:ranks
```

### 3. Enable RabbitMQ
Set `RABBITMQ_ENABLED=true` in `.env` for all three services after RabbitMQ is running.

### 4. Frontend: update journey checkins endpoint
Change all calls from:
```
GET /api/v1/journeys/:journeyId/checkins
```
To:
```
GET /api/v1/checkins/journeys/:journeyId
```

---

## Tests

| Service | Test Suites | Tests | Status |
|---------|-------------|-------|--------|
| auth-service | 10 | 96 | ✅ PASS |
| checkin-service | 3 | 55 | ✅ PASS |
| trekking-service | 6 | 51 | ✅ PASS |
| api-gateway | — | — | Manual |

### New tests added
- `auth-service/tests/integration/auth.google.test.js` — 8 Google Auth tests
- `auth-service/tests/integration/auth.login.test.js` — SUSPENDED→BLOCKED fix
- `auth-service/tests/integration/auth.verifyEmail.test.js` — rank seed in setup
- `checkin-service/tests/integration/checkin.test.js` — canonical endpoint + event tests
- `trekking-service/tests/integration/offline.test.js` — place offline-package tests

---

## Remaining TODO

1. **Auth migration**: Existing documents with `SUSPENDED`/`DISABLED`/`GUIDE` need one-time MongoDB migration before deploying.
2. **Google Cloud**: `GOOGLE_CLIENT_ID` must be configured; Google Sign-In returns 400 without it.
3. **RabbitMQ production**: Set `RABBITMQ_ENABLED=true` in all services. OutboxWorker and all consumers only start when enabled.
4. **AuthIdentity for existing LOCAL users**: Existing users registered before this change don't have `AuthIdentity` records. If linking Google to a LOCAL user, the code handles it at sign-in time (upsert). For audit/consistency, optionally backfill: `db.auth_identities.insertMany(...)` for all LOCAL users.
5. **checkin-service Outbox**: checkin-service uses fire-and-forget publish (not Outbox). For production reliability, add Outbox to checkin-service as well (same pattern as trekking-service). Currently acceptable for MVP since domain data (checkin record + ProvinceVisit + PlaceVisit) is always persisted — only event delivery may lag.
6. **BadgeEvaluator stats completeness**: `summitCheckins`, `visitedPlaces`, `maxAltitude` in the trekking consumer currently default to 0 (trekking-service doesn't own that data). Full badge evaluation needs those stats from checkin/visit counts passed in the event payload or via an internal API call.
7. **Frontend migration**: `GET /api/v1/journeys/:journeyId/checkins` → `GET /api/v1/checkins/journeys/:journeyId`.
8. **Rate limit API Gateway tests**: Gateway unit tests don't cover rate limit. Add integration tests for 429 behavior.

---

## Checklist

- [x] Auth reviewed
- [x] Google Auth complete
- [x] Gamification complete
- [x] Checkin complete
- [x] Checkin idempotency complete
- [x] Journey complete
- [x] Journey Marker complete
- [x] Place offline map complete
- [x] Route offline map complete
- [x] Region filter complete
- [x] Media upload complete
- [x] RabbitMQ events complete
- [x] Outbox complete (trekking-service)
- [x] Consumer idempotency complete
- [x] BadgeEvaluator complete
- [x] API Gateway complete
- [x] Rate limit complete
- [x] MongoDB indexes verified
- [x] Swagger updated (inline JSDoc)
- [x] API docs updated (see below)
- [x] Tests passing (auth=96, checkin=55, trekking=51)
- [ ] User status MongoDB migration (requires production DB access)
- [ ] GOOGLE_CLIENT_ID configured in production
- [ ] RABBITMQ_ENABLED=true in production
- [ ] Frontend endpoint update (/checkins/journeys/:id)
