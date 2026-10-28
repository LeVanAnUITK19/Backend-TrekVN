# Backend services — current implementation

Reviewed against the working tree on 2026-10-12. Package versions (`1.0.0` for Node services, `1.1.0` for Agent API) describe individual services; SRS `v4.0` describes the product requirements. They are different version systems.

| Service | Port | Implemented scope | Data owner | Docs |
|---|---|---|---|---|
| api-gateway | 3000 | REST/stream proxy, current-account verification, ADMIN guard, CORS, rate limiting; strips client service credentials | No database | [route inventory](api-route-inventory.md) |
| auth-service | 3001 | Local/Google login, OTP, single-use password reset, refresh rotation, session revocation, users/settings, XP/ranks, admin/dashboard/audit | User, identity, refresh/reset token, OTP, rank, XP, event receipt and audit collections | [API](auth-service-api.md), [OpenAPI](openapi/auth-service.json) |
| checkin-service | 3002 | GPS check-in, offline sync, journey check-ins, province/place visits, internal stats/events, event outbox | Province, ProvinceVisit, PlaceVisit, MilestoneCheckin, EventOutbox | [API](checkin-service-api.md), [OpenAPI](openapi/checkin-service.json) |
| trekking-service | 3003 | Places/routes/milestones, journeys/markers, reviews, contributions, badges, offline-map metadata/files, admin/dashboard, outbox/events | Catalog, journey, contribution, review, badge and offline-map collections | [API](trekking-service-api.md), [OpenAPI](openapi/trekking-service.json) |
| agent-service | 8000 | Admin assistant, knowledge tools, badge proposals/approval, map pipeline, task history, LLM provider selection | Separate agent database; no direct production DB writes | [Agent docs](agent/README.md), [API](agent/api.md) |
| community-service | 3004 | Posts, threaded comments, idempotent likes, privacy/ownership, WebSocket invalidations, optional Redis fan-out | posts, comments, reactions, comment_reactions in community_db | [API](community-service-api.md), [OpenAPI](openapi/community-service.json), [Setup](../services/community-service/README.md) |

## Runtime and infrastructure

- Node services: Node 22; `npm ci`, `npm run dev` (`node --watch`), `npm run lint`, `npm run test:ci`.
- Agent: Python 3.11+; `pip install -r requirements.txt -r requirements-dev.txt`; `ruff check app tests`; `pytest`. Tests/tooling are excluded from production requirements.
- Swagger UI: `/api-docs` on auth/checkin/trekking/community. Agent `/docs`, `/redoc` and `/openapi.json` are disabled when `APP_ENV=production`.
- Node Swagger includes all implemented routes. Existing JSDoc and Joi schemas provide typed request contracts. Entries labelled `x-contract-detail: route-only` still have routing/auth documentation only; consult the Markdown API guides for business rules. Do not treat those entries as a complete typed SDK contract.
- `node scripts/export-contracts.js` regenerates Node OpenAPI snapshots, route inventory and physical Mongoose schema snapshots without a database connection. Commit both `docs/openapi/` and service `src/config/openapi.json` after route changes.
- `python scripts/export-agent-openapi.py` regenerates Agent's public OpenAPI without starting MongoDB or LLM providers.
- Deploy only Gateway publicly. Keep auth/checkin/trekking/agent and `/internal/v1` on a private network. Direct Node service calls validate JWT signatures but cannot independently query account state in auth DB; current-account checks apply through Gateway.
- `TRUSTED_PROXIES` accepts specific proxy IPs/CIDRs on Node upstream services. Leave it blank to ignore forwarded client IP headers; configure it to the actual Gateway address when deploying. Do not trust all incoming forwarding headers.
- RabbitMQ and HTTP event delivery are optional/configurable. MongoDB replica sets are required for transactions used by gamification/outbox paths.
- GitHub Actions runs auth/checkin/trekking/community/gateway/agent. Sonar gates remain mandatory: configure `SONAR_TOKEN`, `SONAR_HOST_URL` and the matching Sonar projects before expecting remote CI to pass.
- No full-stack production deployment or monitoring configuration exists yet; `deployment/` and `infrastructure/` are placeholders.

## Local RabbitMQ troubleshooting

`[GamificationConsumer] Failed to connect` repeating every 10 seconds means the auth consumer is retrying its RabbitMQ connection. With `RABBITMQ_ENABLED=true` and `RABBITMQ_URL=amqp://localhost:5672`, a RabbitMQ broker must be listening locally on port 5672. `ECONNREFUSED` for both `::1` and `127.0.0.1` means neither local address accepts the connection. MongoDB and the HTTP auth server can still be healthy while this consumer is unavailable.

Start the configured broker, or set `RABBITMQ_ENABLED=false` in auth-service's `.env` and restart it if the local development session does not use RabbitMQ. Disabling the consumer stops RabbitMQ XP event processing. To preserve event delivery without a broker, checkin/trekking also support `GAMIFICATION_HTTP_ENABLED=true` with `RABBITMQ_ENABLED=false`, reachable `AUTH_SERVICE_URL`/`TREKKING_SERVICE_URL`, and matching internal service tokens on the senders and receivers. Do not simply disable every transport if testing XP/ranks.

Node's localhost connection failure can be an `AggregateError` whose top-level message is empty; auth-service logs the individual causes to show the refused addresses.

## Gateway path details

- Journey check-ins: `/api/v1/checkins/journeys/{journeyId}`. Direct checkin-service `/api/v1/journeys/{journeyId}/checkins` is a compatibility path; Gateway `/api/v1/journeys/*` goes to trekking-service.
- Admin catalog milestones/journeys/offline maps: `/api/v1/admin/trekking/...`. Generic `/api/v1/admin/milestones/...` is not a implemented alias.
- Admin statistics alias `/api/v1/admin/statistics` goes to auth-service.
- Agent Place Builder HTTP routes are disabled in `app/api/router.py`; the workflow and unit tests remain in source. Map Builder and approved badge actions are active.
- `/api/v1/auth/login`, `/logout` and `/refresh` are the mobile/shared handlers mounted first. The duplicate cookie-based admin handlers in the root admin router are shadowed. Web Admin currently uses the shared token flow; do not rely on the shadowed HttpOnly-cookie flow.
