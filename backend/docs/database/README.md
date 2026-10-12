# Database documentation

Updated against the working tree on 2026-10-12.

The **physical Node schemas** are generated directly from Mongoose model definitions:

- [auth-service](runtime/auth-service.dbml)
- [checkin-service](runtime/checkin-service.dbml)
- [trekking-service](runtime/trekking-service.dbml)
- [Complete fields, enum values, defaults, subdocuments and index options](runtime/schemas.json)

Regenerate with `node scripts/export-contracts.js`. No MongoDB connection or migration is performed. Runtime collection names are Mongoose's actual names (for example `trekkingplaces`), not the snake-case names in older conceptual diagrams. `_id` is the stored ObjectId; names such as `userId`, `journeyId` and `milestoneCheckinId` may also be response aliases. Dotted names in generated DBML describe nested MongoDB fields, not relational columns.

[Agent schema](services/agent.dbml) and [Agent collection/index reference](../agent/database.md) describe its separate database. The runtime index snapshot [agent-indexes.json](runtime/agent-indexes.json) is generated from `app/db/indexes.py`.

Existing `server.dbml` and `services/*.dbml` are **conceptual product diagrams** with logical cross-service references. Keep them for architectural review; use the runtime snapshots when checking exact deployed fields/indexes. Community is a proposed schema with no implemented service. Mobile diagrams are client-side design references, not backend migration files.

Recent persisted entities include transactional event outboxes, processed event receipts, route submission marker snapshots, review uniqueness, badge evaluation/idempotency, and Agent pending approvals. Pending approvals have a unique `approvalId`, 24-hour `expiresAt` TTL, and atomic `PENDING → EXECUTING → APPROVED/FAILED` or `PENDING → REJECTED` transitions. Existing approvals without `expiresAt` are retained for compatibility; new approvals always expire.

Auth also persists `users.tokenVersion` (default 0; incremented on password changes) and `passwordresettokens` (unique SHA-256 token hash, user reference, expiresAt TTL). Reset consumption uses `findOneAndDelete` with an explicit expiry condition. These changes require no rewrite of existing user records; absent versions are treated as zero. Previously issued stateless reset tokens must be replaced by requesting a new reset OTP.

MongoDB TTL deletion is asynchronous. Application checks expiry when consuming approvals and refresh tokens instead of relying on TTL cleanup. DBML describes schema; it does not create collections/indexes. Review index migrations and existing duplicates before deploying new unique indexes.
