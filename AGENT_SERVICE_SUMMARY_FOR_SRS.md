# 🤖 Agent Service - Tóm tắt cho tài liệu SRS

## 📋 PROMPT CHO GPT - BỔ SUNG VÀO SRS

```
Bổ sung module Agent Service vào tài liệu SRS của hệ thống TrekVN với thông tin sau:

## 1. TỔNG QUAN AGENT SERVICE

Agent Service là hệ thống AI tích hợp với Web Admin, cung cấp 2 khả năng chính:

### 1.1. AI Assistant (Chat với Admin)
- **Mục đích**: Trợ lý AI giúp admin phân tích dữ liệu, trả lời câu hỏi về hệ thống
- **LLM Providers**: 
  - UIT LLM (endpoint trường ĐH Công nghệ Thông tin)
  - Groq (fast inference API)
  - OpenAI (optional)
  - Auto-selection với fallback strategy
- **Khả năng**:
  - Chat/Q&A về kiến trúc, business logic, tính năng TrekViet
  - Phân tích dữ liệu read-only (địa điểm, tuyến đường, check-in, thống kê người dùng)
  - Tìm kiếm trong tài liệu hệ thống (local markdown search)
  - Gợi ý badge, tính năng, UX
  - Đề xuất tạo/sửa huy hiệu (yêu cầu admin phê duyệt)
- **Giới hạn V1**: 
  - ❌ Không được tạo/sửa/xóa dữ liệu production trực tiếp
  - ❌ Không chạy Map Builder từ chat
  - ❌ Không upload lên R2 hoặc kết nối trực tiếp MongoDB production
  - ❌ Không tạo địa điểm tự động (admin tạo thủ công để đảm bảo chính xác)

### 1.2. Map Builder (Active)
- **Mục đích**: Tạo gói bản đồ offline (.zip) cho Flutter app
- **Input**: 
  - BBOX (bounding box tọa độ)
  - Min/max zoom level
  - Place ID hoặc Route ID (optional - để lấy routes/milestones)
- **Pipeline**:
  1. VALIDATE_INPUT (bbox, zoom, injection check)
  2. PREPARE_WORKDIR (temp folder `/tmp/trekviet-agent/map-jobs/{jobId}/`)
  3. EXTRACT_OSM (Overpass API → .osm.xml → .osm.pbf)
  4. BUILD_MBTILES (Tilemaker 3 → vector tiles MBTiles)
  5. BUILD_TERRAIN (DEM processing - optional)
  6. BUILD_CONTOURS (GDAL contour lines → vector MBTiles)
  7. BUILD_HILLSHADE (GDAL hillshade → raster MBTiles)
  8. BUILD_GEOJSON (lấy routes/milestones từ trekking-service)
  9. BUILD_STYLE (generate style.json for MapLibre)
  10. PACKAGE_ZIP (bundle tất cả → .zip)
  11. VALIDATE_ZIP (checksum SHA-256, manifest validation)
  12. → PENDING_REVIEW
- **Admin review**: Download, preview bản đồ trong Web Admin (in-browser với sql.js/WASM)
- **Publish flow**:
  - Admin approve → upload Cloudflare R2 → update offlineMap metadata trong trekking-service
  - Admin reject → xóa temp files, không upload

---

## 2. KIẾN TRÚC VÀ LUỒNG DỮ LIỆU

### 2.1. Architecture Diagram
```
Admin Web (React)
    ↓ Bearer token
API Gateway (:3000)
    ↓ /api/v1/agent/*
Agent Service (:8000 - Python FastAPI)
    ├─→ Agent MongoDB (trekviet_agent - riêng biệt)
    ├─→ LLM Providers (UIT/Groq/OpenAI)
    ├─→ External APIs (OSM, Wikidata, Wikipedia) [read-only]
    ├─→ Trekking Service (:3003) [read-only, write after approval]
    └─→ Cloudflare R2 [write after approval]
```

### 2.2. Database Schema (MongoDB - trekviet_agent)

**Collections:**

#### conversations
- Chat sessions của admin với AI Assistant
- Fields: conversationId, adminId, title, status, selectedProvider, messageCount, lastMessageAt, createdAt, updatedAt

#### messages
- Individual chat messages
- Fields: messageId, conversationId, adminId, role (USER/ASSISTANT/SYSTEM/TOOL), content, llm metadata (provider, model, latency, usage), toolCalls, pendingApprovals, createdAt

#### agent_runs
- Execution audit log cho mỗi LLM call
- Fields: agentRunId, runType (ASSISTANT_CHAT/MAP_BUILDER), workflowId, provider, model, status, duration, usage, toolSummary, error
- TTL: 60-90 ngày

#### map_jobs
- Map Builder job tracking
- Fields: mapJobId, jobId, adminId, trekkingPlaceId, publishTarget, input (bbox, zoom), status, progress, output (artifactType, tempPath, metadata), review, publish (R2 info)
- **Lưu ý**: Binary map file KHÔNG lưu MongoDB, chỉ lưu tempPath metadata

#### workflow_events
- Audit log từng step của pipeline
- Fields: workflowEventId, jobId, workflowType, event, level (DEBUG/INFO/WARN/ERROR), message, metadata, createdAt
- TTL index

---

## 3. USE CASES CHI TIẾT

### 3.1. UC-AGENT-01: Admin Chat với AI Assistant

**Actors**: Admin

**Preconditions**: Admin đã đăng nhập Web Admin

**Main Flow**:
1. Admin mở trang AI Assistant
2. Chọn LLM provider (Auto/UIT/Groq/OpenAI)
3. Tạo conversation mới hoặc chọn conversation cũ
4. Nhập câu hỏi (ví dụ: "Hệ thống ranking TrekViet hoạt động thế nào?")
5. System gửi request tới Agent Service với JWT token
6. Agent Service:
   - Verify JWT, check role=ADMIN
   - Build LLM context (system prompt + capped history, max 20 messages gần nhất)
   - Call LLMProviderManager (auto-select hoặc provider được chỉ định)
   - Nếu provider fail và mode=auto → fallback sang provider khác
   - Execute tools nếu cần (read-only: search docs, get stats, etc.)
   - Persist user + assistant messages vào MongoDB
7. Return response với metadata (provider, model, latency, token usage)
8. Admin xem phản hồi với formatting (text/stats/charts/tables)

**Alternative Flows**:
- A1: Provider unavailable + không có fallback → error message
- A2: Token expired → redirect to login
- A3: Tool execution error → Assistant giải thích lỗi và suggest alternatives

**Postconditions**: Conversation history được lưu, admin có thể tiếp tục chat

---

### 3.2. UC-AGENT-02: Admin Approve Badge Proposal từ AI

**Actors**: Admin

**Preconditions**: 
- Admin đang chat với AI Assistant
- AI đề xuất tạo/sửa huy hiệu (mục đích: giảm workload admin)

**Main Flow**:
1. Admin hỏi: "Tạo huy hiệu cho người check-in 10 địa điểm"
2. AI Assistant phân tích và generate badge proposal:
   - Đề xuất code, name, description, conditionType, conditionValue, rarity
   - Giải thích lý do (reason)
   - Trả về với `pendingApprovals` array trong message
3. Web Admin hiển thị ApprovalCard với status=PENDING
4. Admin xem chi tiết đề xuất:
   - Code: `EXPLORER_10`
   - Name: "Nhà khám phá"
   - Condition: CHECKIN_COUNT ≥ 10
   - Rarity: COMMON
   - Status: ACTIVE
5. Admin bấm "Phê duyệt"
6. System gọi API approve endpoint với approvalId
7. Agent Service:
   - Verify approval chưa expired/resolved
   - Execute badge create/update qua trekking-service API
   - Update approval status → APPROVED
   - Log audit trail
8. Web Admin update UI → hiển thị badge "Đã phê duyệt" (xanh)
9. Badge được tạo trong production DB, available ngay cho users

**Alternative Flows**:
- A1: Admin bấm "Từ chối" → status=REJECTED, không tạo badge
- A2: API call failed → status=FAILED, hiển thị error message
- A3: Approval expired (timeout) → status=EXPIRED, không thể approve

**Postconditions**: Badge mới được tạo và active trong hệ thống production

---

### 3.3. UC-AGENT-03: Tạo bản đồ offline cho địa điểm

**Actors**: Admin

**Preconditions**: Admin có thông tin địa điểm và BBOX

**Main Flow**:
1. Admin mở Map Builder form
2. Nhập thông tin:
   - Place name: "Núi Bà Đen"
   - Place ID: (optional - để lấy routes/milestones)
   - BBOX: `[106.13943, 11.36157, 106.19162, 11.41239]`
   - Min zoom: 10
   - Max zoom: 17
   - Publish target: PLACE / ROUTE
3. Submit form
4. Agent Service tạo job với status=QUEUED (202 Accepted)
5. Background task chạy pipeline:
   - VALIDATE_INPUT: kiểm tra bbox hợp lệ, zoom range, no command injection
   - PREPARE_WORKDIR: tạo temp folder với jobId
   - EXTRACT_OSM: download OSM data (ưu tiên PBF local, fallback Overpass API)
   - BUILD_MBTILES: Tilemaker compile vector tiles
   - BUILD_CONTOURS: GDAL tạo contour lines từ DEM (nếu có)
   - BUILD_HILLSHADE: GDAL tạo hillshade raster (nếu có)
   - BUILD_GEOJSON: lấy routes/milestones từ trekking-service (nếu có Place/Route ID)
   - BUILD_STYLE: generate style.json for MapLibre
   - PACKAGE_ZIP: bundle {slug}.mbtiles, {slug}-contours.mbtiles, {slug}-hillshade.mbtiles, {slug}-routes.geojson, {slug}-milestones.geojson, style.json, manifest.json
   - VALIDATE_ZIP: verify checksum SHA-256, bbox match, zoom levels, tile counts
   - → status=PENDING_REVIEW
6. Admin nhận notification, mở job detail page
7. Admin download artifact hoặc preview in-browser:
   - Web Admin dùng JSZip unzip .zip trong browser
   - sql.js/WASM đọc SQLite MBTiles
   - MapLibre render tiles với style.json
   - Bật/tắt layers, zoom/pan, fullscreen
8. Admin satisfied → bấm "Duyệt & Lưu"
9. Publish dialog confirm:
   - File info, bbox, zoom, R2 object key preview
   - Confirm: upload R2 + update trekking-service offlineMap metadata
10. Agent Service:
    - Upload .zip lên Cloudflare R2 bucket
    - Call trekking-service API: update place.offlineMap với objectKey, version, bounds, layers
    - Mark job as PUBLISHED
11. Flutter app có thể download map package qua R2_PUBLIC_BASE_URL + objectKey

**Alternative Flows**:
- A1: OSM Overpass timeout/error → fail step EXTRACT_OSM, status=FAILED
- A2: Tilemaker build error → fail step BUILD_MBTILES, status=FAILED
- A3: Validation failed (missing tiles, wrong bbox) → fail step VALIDATE_ZIP, status=FAILED
- A4: Admin reject → DELETE temp files, status=REJECTED, không upload R2
- A5: R2 upload failed → retry 3 lần, nếu vẫn fail → status=FAILED, admin có thể retry

**Postconditions**: 
- Map package available trên R2 CDN
- Flutter app có thể download offline map
- Temp files được cleanup sau TTL (72h default)

---

### 3.4. UC-AGENT-04: Xem trước bản đồ offline in-browser

**Actors**: Admin

**Preconditions**: 
- Map Builder job đã hoàn thành (status=PENDING_REVIEW hoặc PUBLISHED)
- .zip artifact tồn tại trong temp storage

**Main Flow**:
1. Admin mở Map Builder job detail page
2. Click "Xem trước bản đồ"
3. Web Admin load MapPreview component:
   - Download .zip qua `/api/v1/agent/map-artifacts/:jobId/file` (Bearer token auth)
   - Unzip .zip trong browser memory (JSZip)
   - Load sql.js WASM module
   - Open SQLite MBTiles files với sql.js
   - Parse manifest.json (bounds, center, zoom, layers, checksums)
   - Verify SHA-256 checksums với Web Crypto API
   - Load style.json
   - Convert `mbtiles://` protocol → custom URL handler
   - Initialize MapLibre GL JS
   - Add vector tile sources (base, contours)
   - Add raster tile source (hillshade)
   - Add GeoJSON sources (routes, milestones)
   - Render map tại center coordinates với zoom level từ manifest
4. Admin tương tác:
   - Zoom in/out, pan
   - Toggle layers (roads, POI, contours, hillshade, routes, milestones)
   - Fullscreen mode
   - Inspect tile coordinates, bounds
5. Tất cả tiles được serve từ browser memory, không cần network sau lần load đầu
6. Admin đóng preview hoặc chuyển sang approve/reject

**Technical Details**:
- JSZip: ~1MB library, unzip trong 1-2s cho 20MB map package
- sql.js: ~3MB WASM, SQLite engine trong browser
- MapLibre GL JS: open-source map renderer, tương thích với Mapbox GL JS v1
- TMS to XYZ coordinate conversion: `xyz_y = 2^zoom - 1 - tms_y`
- Memory usage: ~50-100MB cho map package 20MB (uncompressed tiles + SQL overhead)
- Performance: smooth 60fps pan/zoom trên desktop, ~30fps trên mobile

**Alternative Flows**:
- A1: .zip corrupt → show error, suggest re-build
- A2: Checksum mismatch → warning banner, still allow preview
- A3: Browser không support WASM → fallback message, suggest download và test trên Flutter

**Postconditions**: Admin có confidence về map quality trước khi approve publish

---

## 4. API ENDPOINTS

### 4.1. LLM Providers
- `GET /api/v1/agent/llm/providers` - List providers + availability
- `GET /api/v1/agent/llm/providers/:id/health` - Check provider health

### 4.2. AI Assistant
- `POST /api/v1/agent/assistant/conversations` - Tạo conversation mới
- `GET /api/v1/agent/assistant/conversations` - List conversations (paginated)
- `GET /api/v1/agent/assistant/conversations/:id` - Get conversation detail
- `GET /api/v1/agent/assistant/conversations/:id/messages` - List messages
- `POST /api/v1/agent/assistant/conversations/:id/messages` - Send message (chat)
- `PATCH /api/v1/agent/assistant/conversations/:id` - Rename conversation
- `DELETE /api/v1/agent/assistant/conversations/:id` - Delete conversation

### 4.3. Badge Approvals (trong Assistant)
- `POST /api/v1/agent/assistant/approvals/:approvalId/approve` - Approve badge proposal
- `POST /api/v1/agent/assistant/approvals/:approvalId/reject` - Reject badge proposal

### 4.4. Map Builder
- `POST /api/v1/agent/map-builder/jobs` - Start map build job
- `GET /api/v1/agent/map-builder/jobs` - List jobs (paginated)
- `GET /api/v1/agent/map-builder/jobs/:jobId` - Get job detail + progress
- `POST /api/v1/agent/map-builder/jobs/:jobId/approve` - Approve → publish to R2
- `POST /api/v1/agent/map-builder/jobs/:jobId/reject` - Reject → cleanup files
- `GET /api/v1/agent/map-artifacts/:jobId` - Get artifact metadata
- `GET /api/v1/agent/map-artifacts/:jobId/file` - Download .zip artifact (Bearer auth)

### 4.5. Agent Tasks (Unified view)
- `GET /api/v1/agent/tasks` - List all tasks (assistant runs, map jobs)
- `GET /api/v1/agent/tasks/:id` - Get task detail with steps/logs

---

## 5. ASSISTANT TOOLS (Read-Only + Write Proposals)

### 5.1. Knowledge Tools
- `list_knowledge_documents` - List available markdown docs
- `search_knowledge` - Full-text search trong docs
- `read_knowledge_document` - Read specific doc content

### 5.2. Trekking Tools
- `search_places` - Tìm kiếm địa điểm theo tên, tỉnh, type
- `get_place` - Chi tiết 1 địa điểm (name, coordinates, elevation, difficulty, routes, reviews)
- `get_routes_by_place` - List routes của 1 địa điểm
- `get_route` - Chi tiết 1 route (distance, elevation gain, milestones)
- `get_milestones` - List milestones của 1 route
- `get_place_reviews` - Đánh giá của users cho địa điểm
- `get_badges` - List huy hiệu (code, name, condition, rarity)
- `get_contributions` - User contributions (routes, reviews, photos)

### 5.3. Check-in Tools
- `get_provinces` - List tỉnh/thành phố Việt Nam
- `get_checkin_stats` - Thống kê check-in theo time range
- `get_place_visit_stats` - Top địa điểm được check-in nhiều nhất

### 5.4. User & Gamification Tools
- `search_users` - Tìm user theo username, email
- `get_user_summary` - Tóm tắt profile user (rank, badges, stats)
- `get_user_statistics` - Chi tiết thống kê user (journeys, check-ins, distance, elevation)
- `get_ranks` - List rank levels trong hệ thống
- `get_rank_distribution` - Phân bố users theo rank

### 5.5. Analytics Tools
- `get_system_overview` - Tổng quan hệ thống (total places, users, check-ins, active journeys)

### 5.6. Badge Write Proposal Tools (yêu cầu admin approval)
- `propose_badge_create` - Đề xuất tạo huy hiệu mới (returns pendingApproval)
- `propose_badge_update` - Đề xuất sửa huy hiệu (returns pendingApproval)

**Lưu ý**: Tools không được trực tiếp write production DB. Tools chỉ:
- Read-only: gọi API get/list
- Write proposals: tạo approval record, chờ admin confirm

---

## 6. SECURITY & BOUNDARIES

### 6.1. Authentication Flow
```
Admin Web → Bearer JWT token
  ↓
API Gateway → verify token qua auth-service GET /api/v1/auth/verify
  ↓
Agent Service → decode JWT (python-jose), check role=ADMIN, extract adminId từ payload
```

### 6.2. Permission Matrix
| Capability | Assistant | Map Builder |
|------------|-----------|-------------|
| LLM chat | ✓ | ✗ |
| Search docs | ✓ | ✗ |
| Read-only analytics | ✓ | ✗ |
| OSM data access | ✗ | ✓ |
| Agent DB write | ✗ | ✓ |
| Production read | via API | via API |
| Production write (badge) | After approve | ✗ |
| Map pipeline cmds | ✗ | ✓ |
| Temp file write | ✗ | Workdir only |
| R2 upload | ✗ | After approve |

### 6.3. Command Injection Protection
- Map Builder executes external commands: osmium, tilemaker, GDAL
- **Luôn dùng** `asyncio.create_subprocess_exec(*args)` - KHÔNG BAO GIỜ `shell=True`
- Arguments pass dưới dạng list, không concatenate string
- `placeName` được sanitize, strip dangerous chars: `; & | \` $ ( ) < > \\ " \n`
- Path traversal protection: verify paths nằm trong `MAP_WORK_ROOT`

### 6.4. Secrets Management
| Secret | Nơi lưu | Không được |
|--------|---------|------------|
| JWT_SECRET | Env var | Hard-code, commit .env |
| TREKVIET_INTERNAL_TOKEN | Env var | Trả về frontend, log |
| GROQ_API_KEY, UIT_LLM_API_KEY | Env var | Trả về API response, log |
| R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY | Env var | Trả về frontend, log |
| AGENT_MONGODB_URI | Env var | Log (có thể chứa password) |

### 6.5. Audit Trail
- Mọi production write operation được log:
  - `workflow_events` collection (Agent DB)
  - `harness.audit.log_production_write()` (application log)
  - `harness.audit.log_r2_upload()` (application log)
- Agent runs được track trong `agent_runs` collection với TTL 60-90 ngày

---

## 7. TECHNICAL STACK

### Backend (Agent Service)
- **Language**: Python 3.12
- **Framework**: FastAPI (async web framework)
- **Database**: MongoDB (trekviet_agent - riêng biệt với production DB)
- **LLM**: OpenAI-compatible APIs (UIT LLM, Groq, OpenAI)
- **Map Tools**:
  - Osmium (OSM data processing)
  - Tilemaker 3 (vector tile generation, OpenMapTiles schema)
  - GDAL (DEM, contours, hillshade, coordinate transforms)
- **Storage**: Cloudflare R2 (S3-compatible object storage)
- **Deployment**: Docker (Dockerfile includes all map tools)

### Frontend (Web Admin - Agent Features)
- **Framework**: React 18 + TypeScript
- **State**: TanStack Query (React Query v5)
- **Map Rendering**: MapLibre GL JS (open-source Mapbox alternative)
- **In-browser processing**:
  - JSZip (~1MB) - unzip map packages
  - sql.js (~3MB WASM) - SQLite engine in browser
  - Web Crypto API - SHA-256 verification
- **UI Components**: Radix UI + Tailwind CSS
- **Real-time updates**: Polling (khong dùng WebSocket cho V1)

### External Dependencies
- **OpenStreetMap**: Overpass API (hoặc local PBF file)
- **Wikidata**: SPARQL API (optional enrichment)
- **Wikipedia**: REST API (optional descriptions)
- **DEM Data**: SRTM/ALOS via Skadi tiles hoặc local GeoTIFF

---

## 8. CONFIGURATION (Environment Variables)

### Core Settings
```env
# JWT
JWT_SECRET=<secret-key>
JWT_ALGORITHM=HS256

# MongoDB
AGENT_MONGODB_URI=mongodb://localhost:27017/trekviet_agent

# LLM Providers
UIT_LLM_ENABLED=true
UIT_LLM_BASE_URL=https://...
UIT_LLM_API_KEY=<key>
UIT_LLM_MODEL=<model-name>

GROQ_ENABLED=true
GROQ_API_KEY=<key>
GROQ_MODEL=llama3-8b-8192

OPENAI_ENABLED=false
OPENAI_API_KEY=<key>
OPENAI_MODEL=gpt-4o-mini

LLM_DEFAULT_PROVIDER=auto
LLM_PROVIDER_PRIORITY=uit,groq,openai

# Service URLs
TREKKING_SERVICE_URL=http://localhost:3003
AUTH_SERVICE_URL=http://localhost:3001
CHECKIN_SERVICE_URL=http://localhost:3004
TREKVIET_INTERNAL_TOKEN=<service-to-service-auth-token>

# Map Builder
MAP_WORK_ROOT=/tmp/trekviet-agent
MAP_PIPELINE_MODE=full  # full | clip-from-source
MAP_SOURCE_PACKAGE=  # path to reference .zip (for clip mode)
MAP_OSM_PBF_PATH=  # path to local vietnam-latest.osm.pbf
MAP_DEM_PATH=  # path to local DEM GeoTIFF
MAP_CONTOUR_INTERVAL_M=20
MAP_NATIVE_MAX_ZOOM=14
MAP_HILLSHADE_MAX_ZOOM=12
MAP_TOOL_BACKEND=auto  # auto | native | docker | wsl-docker

# Cloudflare R2
R2_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<access-key>
R2_SECRET_ACCESS_KEY=<secret-key>
R2_BUCKET_NAME=trekviet-maps
R2_PUBLIC_BASE_URL=https://maps.trekviet.com
R2_REGION=auto
```

---

## 9. DEPLOYMENT & OPERATIONS

### Docker Compose (Development)
```yaml
services:
  agent-service:
    build: ./services/agent-service
    ports:
      - "8000:8000"
    environment:
      - AGENT_MONGODB_URI=mongodb://mongodb:27017/trekviet_agent
      - TREKKING_SERVICE_URL=http://trekking-service:3003
      - MAP_WORK_ROOT=/tmp/trekviet-agent
    volumes:
      - ./artifacts/osm-source:/map-source:ro
      - agent-work:/tmp/trekviet-agent
    depends_on:
      - mongodb

volumes:
  agent-work:
```

### Health Checks
- **Liveness**: `GET /health` → `{ "status": "ok" }`
- **Readiness**: `GET /health/ready` → checks MongoDB + LLM config (không fail nếu provider unavailable)

### Monitoring & Logging
- **Metrics**: (Future) Prometheus metrics cho LLM latency, tool usage, job success rate
- **Logging**: Structured JSON logs (level, timestamp, context)
- **Tracing**: (Future) OpenTelemetry distributed tracing

### Background Job Management
- Map Builder jobs: async tasks với progress tracking
- Timeout: default 30 minutes per job
- Retry: 0 retries (manual re-trigger by admin)
- Cleanup: temp files TTL 72h, auto-delete sau khi expired

---

## 10. FUTURE ENHANCEMENTS (Not in V1)

### 10.1. Enhanced AI Assistant
- ✓ Multi-turn reasoning với agent framework (LangChain/LlamaIndex)
- ✓ Memory system (long-term context beyond 20 messages)
- ✓ Proactive suggestions (analyze trends → suggest new badges)
- ✓ Multi-language support (EN/VI)
- ✓ Voice chat (speech-to-text, text-to-speech)

### 10.2. Map Builder V2
- ✓ 3D terrain rendering (Mapbox 3D tiles)
- ✓ Offline navigation (turn-by-turn directions)
- ✓ Incremental updates (diff-based map patches)
- ✓ Custom styling (admin-defined map themes)
- ✓ Real-time collaboration (multiple admins review same map)

### 10.3. New Agents
- ✓ Route Builder: AI suggests optimal trekking routes based on difficulty, scenery
- ✓ Content Generator: auto-generate place descriptions, SEO content
- ✓ Analytics Agent: proactive insights, anomaly detection, forecasting
- ✓ Place Data Enrichment: AI suggests improvements for existing places (better descriptions, tags, photos)

---

## 11. TESTING STRATEGY

### Unit Tests
- LLM provider fallback logic
- Tool input validation + sanitization
- Approval workflow state transitions
- Map pipeline step functions (extract, build, validate)

### Integration Tests
- End-to-end chat flow (user message → assistant response)
- Map Builder pipeline (mocked OSM/GDAL → ZIP artifact)
- Badge approval flow (proposal → approve → production write)
- R2 upload + trekking-service sync

### Manual Tests
- Admin chat với các use cases thực tế
- Map preview in-browser trên nhiều devices
- Badge approval UI workflow
- Map download + test trên Flutter app

---

BỔ SUNG CÁC PHẦN SAU VÀO SRS:
1. Module mới: "6. Agent Service & AI Features"
2. Use Cases: UC-AGENT-01 đến UC-AGENT-04
3. Database Schema: thêm Agent MongoDB collections
4. API Endpoints: section mới cho /api/v1/agent/*
5. Security: bổ sung Agent Service vào security matrix
6. Deployment: thêm agent-service vào Docker Compose
7. Tech Stack: bổ sung Python/FastAPI/MongoDB/GDAL/MapLibre
8. Future Roadmap: AI enhancements

Đảm bảo nhấn mạnh:
- ✅ Agent Service là module độc lập, không ảnh hưởng hệ thống core
- ✅ Production writes LUÔN yêu cầu admin approval (không có auto-write)
- ✅ Read-only by default (security-first design)
- ✅ Audit trail đầy đủ cho mọi operation
- ✅ Graceful degradation (hệ thống chạy bình thường khi LLM providers unavailable)
- ✅ Địa điểm được tạo thủ công bởi admin (không có Place Builder automation) để đảm bảo chất lượng và độ chính xác cao
```

---

## 📌 NOTES CHO BẠN

1. **Copy toàn bộ nội dung trong khung ``` trên** và dán cho GPT
2. GPT sẽ format và bổ sung vào SRS với structure đúng chuẩn
3. Nếu GPT cần clarify gì, refer lại file này
4. File này đã cover đầy đủ:
   - ✅ Architecture & data flow
   - ✅ Use cases chi tiết
   - ✅ API endpoints
   - ✅ Security boundaries
   - ✅ Tools & capabilities
   - ✅ Database schema
   - ✅ Technical stack
   - ✅ Future enhancements

Bạn có thể customize thêm hoặc yêu cầu GPT adjust tone/format cho phù hợp với SRS hiện tại của bạn!
