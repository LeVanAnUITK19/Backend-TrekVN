# Explore pagination and catalog caching

## Request flow

Explore requests two independent summary pages:

- `GET /api/v1/places?summary=true&page=1&limit=20`
- `GET /api/v1/routes?page=1&limit=10&sort=popular`

Both accept `region=NORTH|CENTRAL|SOUTH`, `mien`, `q`, `sort=default|popular`,
`provinceId`, `difficulty`, and `tags`. Paging is validated; limits are capped at 50.
Responses use `data: {items,total,page,limit,hasMore}`. Place and route IDs retain
their existing names (`trekkingPlaceId`, `trekkingRouteId`).

Place cards include one image and the metadata needed by Explore. Route cards
include distance, estimated duration, parent name/address and a thumbnail. They
do not include geometry, descriptions, offline packages or milestones. Route
popularity uses the parent place's review count/rating, since routes have no
independent review score. Both route and parent must be ACTIVE.

The old place list (without `summary=true`), route detail, milestones and offline
package APIs retain their response contracts. Explore no longer downloads every
place/page or sends one route request per place. Place pagination advances when
scrolling near the bottom or tapping "Thêm địa điểm". Routes advance through
"Thêm cung đường". Each section handles failures independently.

## Backend Redis

Install dependencies using `npm ci` in `services/trekking-service`.
Configure these variables in the ignored service `.env`, or in the hosting
provider's environment settings:

```dotenv
REDIS_URL=rediss://default:YOUR_PASSWORD@YOUR_ENDPOINT.upstash.io:6379
CATALOG_CACHE_TTL_SECONDS=30
CATALOG_CACHE_PREFIX=trekvn:catalog:v2
```

Use separate prefixes for environments pointing at different MongoDB databases.
The rediss scheme enables TLS and certificate verification. Never put these
credentials in the mobile app or commit `.env`.

Run `npm run check:redis` to verify PING and a temporary expiring SET/GET/TTL/DEL.
The check prints no URL/password and touches only its own unique temporary key.
Restart trekking-service after configuring its environment.

Cache-aside keys contain the normalized query, filters, sort, page, limit and
catalog generation. Successful summary pages, including empty results, live for
30 seconds. Concurrent misses in the same process share one query. Redis failure
falls back to MongoDB, with offline queuing disabled and bounded command timeouts.
The cache is optional and never a prerequisite for service readiness.

Mongoose hooks on place/route writes bump the shared Redis generation, invalidating
lists after create/update/status changes, review-rating recalculation, and
contribution approval. Old keys expire naturally. Writes performed outside these
models do not execute hooks; their changes appear after the Redis TTL. A cache
outage during invalidation also leaves at most the Redis TTL of cached data.

## Mobile cache

ExploreCacheManager keeps RAM entries plus snapshots in the existing SQLite
`offline_snapshots` table; no schema upgrade is required. Cache keys separate API
origin, section, search, filters, sort, page and limit. Entries are fresh for ten
minutes from the last successful HTTP response. Reading does not extend freshness.

- Fresh page: display without an HTTP request.
- Expired page: display the snapshot immediately and refresh in the background.
- Pull-to-refresh: bypass local freshness and request both first pages.
- Successful first-page refresh: discard later cached pages for that query so old
  ordering cannot be appended to a new first page.
- Network/server error: retain the previous snapshot and display the refresh error.
- Failed refresh: never update the snapshot timestamp.
- Browsing snapshots are bounded to 80 entries in RAM/SQLite; pruning does not
  delete downloaded offline trip packages.

Expiry is checked when the page is accessed, not by continuous background polling.
A manual refresh may still receive a Redis result up to 30 seconds old. An admin
change does not immediately clear snapshots already on phones; they refresh on
expiry/access or pull-to-refresh. Journey mutations still rely on server checks.

Deploy the backend before installing the rebuilt mobile app: the new app needs
the new public GET /routes page endpoint. No authentication, geometry, milestone
or offline-package data is substituted with the summary snapshots.

## Verification

- Redis connection check against the configured Upstash database.
- MongoDB integration tests for filtered pages, ordering, projections, active
  parents and model invalidation hooks.
- Cache unit tests for hits, isolated keys, request coalescing and failure fallback.
- Flutter tests for paging, filter switching, independent section errors,
  SQLite persistence, ten-minute expiry, stale snapshots and manual refresh.
- Offline-store and card-layout regression tests.
