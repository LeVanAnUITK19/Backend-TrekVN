# Rate limiting and deployment

Gateway and the four Node services keep independent, in-memory quotas. Existing
maximums are unchanged: Gateway/Trekking/Checkin/Community default to 600,
Auth to 300, per 15-minute window. Each instance has its own counters; use a
shared store before scaling to multiple replicas if a consistent total is required.

## Choosing the bucket

- Signed-in API requests use `user:<id>`. Users behind one Wi-Fi, NAT or reverse
  proxy have separate quotas. Refreshing a token or changing IP does not reset
  the user's bucket. Devices using the same account share that account's quota.
- Gateway verifies the current account through Auth Service before selecting
  the user bucket. Verification is reused for authorization in that request;
  it is not cached across requests. Public API requests with a valid bearer
  token also get a user bucket.
- Downstream services verify the JWT signature (HS256), expiry and string user ID
  for quota partitioning. This does not replace route authentication or populate
  `req.user`: existing account/session checks, permissions and internal service
  tokens still apply.
- Anonymous requests and invalid/expired tokens use `public:ip:<req.ip>`.
  Signed-in users are not affected by an exhausted anonymous bucket.
- Login, register, Google login, refresh and password/OTP credential endpoints
  use an independent `credential:<normalized path>:ip:<req.ip>` bucket per
  operation, even if a bearer token is supplied. Existing OTP attempt/resend
  rules remain in effect. They do not consume the signed-in API bucket.
- Internal HTTP calls without a user identity use a separate
  `internal:ip:<req.ip>` bucket.
- Errors after the limiter still count. Gateway rejects requests over quota
  before proxying. Services retain their own protection for direct access.

Health/readiness and metrics remain outside quotas as registered by each app.
Auth's `/api/v1/auth/verify` is exempt from Auth's quota, so verification traffic
does not deplete ordinary Auth API requests. Community WebSocket limits are
unchanged.

## Environment settings

| Service | Maximum per bucket | Window |
| --- | --- | --- |
| Gateway | `RATE_LIMIT_MAX_REQUESTS` (600) | `RATE_LIMIT_WINDOW_MS` (900000) |
| Auth | `RATE_LIMIT_MAX` (300) | `RATE_LIMIT_WINDOW_MS` (900000) |
| Trekking/Checkin/Community | `RATE_LIMIT_MAX` (600) | `RATE_LIMIT_WINDOW_MS` (900000) |

`DISABLE_RATE_LIMIT=true` is supported by all five Node apps. Leave it false
in production. Test mode excludes quotas unless tests explicitly use development
mode. No maximum was increased to hide the shared-IP issue.

## Proxy configuration on Render or another host

Account quotas work independently of IP, but anonymous and credential quotas
still require an accurate client IP. Source changes cannot determine the actual
proxy addresses or edit the deployed environment.

1. Inspect the deployed network path for each service: the immediate TCP peer
   and the trusted chain of `X-Forwarded-For` addresses. Check server-side
   diagnostics; do not publish a debug endpoint or log authorization tokens.
2. Set `TRUSTED_PROXIES` to the actual trusted proxy IPs/CIDRs (comma-separated).
   Gateway trusts none by default. Auth/Trekking/Checkin fall back to loopback;
   Community trusts none unless configured.
3. If a downstream service is reached through a hosting reverse proxy, include
   the actual trusted proxy chain rather than assuming the immediate peer is
   the Gateway. The Gateway replaces `X-Forwarded-For` with its resolved client
   IP when proxying requests.
4. Do not set universal trust or trust an arbitrary number of hops. The last
   trusted proxy must sanitize forwarded headers. Validate two external client
   IPs and forged forwarded headers in the actual deployment.
5. Deploy Gateway and all four Node services together. Verify that A reaching
   quota does not block B on the same network, and that anonymous/login quotas
   still separate genuinely different client IPs.

Gateway logs a startup warning in production when `TRUSTED_PROXIES` is unset.
Only disable downstream aggregate limiters after direct public access has been
blocked and all external calls are forced through Gateway. This change retains
them because that network restriction has not been verified.

Clients should wait for `Retry-After` on a 429 and avoid immediate retry loops.
The header represents time left in the current bucket window, not a new
15-minute lock for every retry.

## Regression checks

Gateway `tests/integration/user_quota.test.js` covers shared proxy IPs,
signed-in public reads, anonymous/credential separation, forged identity,
token rotation, one verification per request, retry headers and window reset.
Auth/Trekking/Checkin `tests/unit/user_quota.test.js` and Community
`tests/user_quota.test.js` exercise the actual app limiter with signed,
forged, expired and non-expiring tokens. Existing proxy, authorization,
health and metrics tests remain applicable.
