# Map Builder: gói bản đồ offline có dữ liệu thật

## Chẩn đoán hai ZIP mẫu

- `ba-den-v1-flutter.zip`: base vector MBTiles, contour vector MBTiles, hillshade raster MBTiles, routes và milestones GeoJSON. Manifest cũ không khai báo `layers`; Flutter tự nhận từ tên file/checksum.
- `nui-ba-den-v1-flutter.zip` của workflow cũ: chỉ `style.json` và `manifest.json`, `layers: []`, `sources: {}`. Không có tile để hiển thị offline.
- Workflow cũ bỏ qua Tilemaker khi thiếu binary, ba bước địa hình chỉ là TODO, chưa xuất GeoJSON, validator chấp nhận ZIP không có tile. Docker cũ cũng không cài công cụ bản đồ.
- Bbox gói lỗi `[107.35136, 10.91612, 107.4032, 10.96402]` khác bbox Bà Đen trong file mẫu `[106.13943, 11.36157, 106.19162, 11.41239]`. Workflow dùng bbox được nhập; tên địa điểm không tự đổi tọa độ.

## Pipeline mới

`MAP_PIPELINE_MODE=full` (mặc định):

```
VALIDATE_INPUT → PREPARE_WORKDIR → EXTRACT_OSM → BUILD_MBTILES
→ BUILD_TERRAIN → BUILD_CONTOURS → BUILD_HILLSHADE → BUILD_GEOJSON
→ BUILD_STYLE → PACKAGE_ZIP → VALIDATE_ZIP → PENDING_REVIEW
```

- OSM: ưu tiên `MAP_OSM_PBF_PATH` để `osmium extract --strategy smart` cắt trực tiếp nguồn PBF khu vực. Không gọi Overpass khi đã cấu hình PBF. Nếu không có nguồn cục bộ, tải XML qua Overpass rồi chuyển PBF bằng osmium.
- Base: Tilemaker 3, JSON có `settings` và `bounding_box` đúng API; xuất tên lớp OpenMapTiles mà Flutter dùng: `landcover`, `landuse`, `water`, `building`, `waterway`, `transportation`, `transportation_name`, `boundary`, `place`, `mountain_peak`.
- Terrain: dùng `MAP_DEM_PATH` (GeoTIFF/HGT) hoặc tải Skadi HGT công khai, ghép các ô 1 độ và cắt theo bbox.
- Contours: `gdal_contour`, khoảng cách mặc định 20 m, `ogr2ogr -clipsrc` cắt hình học theo bbox và xuất vector MBTiles với source-layer `contour`, trường độ cao `ele`. Sau đó lọc tile ngoài phạm vi bbox/zoom, giữ buffer trong những tile còn lại.
- Hillshade: `gdaldem`, chiếu EPSG:3857 với extent bbox, xuất PNG MBTiles và tạo các mức zoom nhỏ hơn; lọc tile đệm/padding ngoài phạm vi bbox/zoom trước validation.
- GeoJSON: lấy tuyến ACTIVE và cột mốc từ trekking-service, cắt tuyến/mốc theo bbox. Không có tuyến/mốc thì FeatureCollection rỗng hợp lệ; không tạo dữ liệu giả. Lỗi API sẽ báo FAILED.
- Bất kỳ bước bắt buộc nào lỗi: dừng và báo FAILED, không đưa ZIP thiếu bản đồ tới review.

Không cần LLM để cắt bản đồ.

### Nguồn OSM ổn định khi Overpass trả 500/504

Tải nguồn Việt Nam từ Geofabrik một lần; script kiểm tra MD5 do nhà cung cấp công bố và chỉ thay file sau khi checksum khớp:

```powershell
.venv/Scripts/python.exe scripts/download_osm_source.py --output artifacts/osm-source/vietnam-latest.osm.pbf
```

Đặt trong `.env` rồi khởi động lại agent:

```dotenv
MAP_OSM_PBF_PATH=C:/doan1/TrekVN/Backend-TrekVN/services/agent-service/artifacts/osm-source/vietnam-latest.osm.pbf
```

Nguồn hiện tại đã tải trên máy này là `artifacts/osm-source/vietnam-261009.osm.pbf` (330.248.138 byte, timestamp dữ liệu `2026-10-09T20:21:04Z`), `.env` trỏ tới file đó. Chạy script tải với URL mặc định để cập nhật nguồn khi cần; thay PATH nếu chọn tên file khác. Không tự coi bản snapshot cũ là dữ liệu vừa cập nhật.

PBF là dữ liệu OSM đầu vào, khác `MAP_SOURCE_PACKAGE` là ZIP MBTiles đã render. Workflow kiểm tra bbox trong header nguồn, từ chối nguồn history, cắt ways/multipolygons đầy đủ rồi Tilemaker tạo tile trong vùng job. Runtime Docker chỉ mount đúng file PBF read-only vào `/map-source/input.osm.pbf`; không sao chép 330 MB vào từng job. Job/manifest ghi tên nguồn và timestamp, không ghi đường dẫn máy chủ.

Khi chạy cả agent trong Docker, bind mount file PBF read-only vào container và đặt `MAP_OSM_PBF_PATH` là đường dẫn trong container, ví dụ `/map-source/vietnam.osm.pbf`; đường dẫn Windows không tồn tại trong Linux container. Docker Compose chọn `MAP_TOOL_BACKEND=native` vì image đã có đủ binary.

Nhánh Overpass kiểm tra XML thực sự có root `osm`, không có `remark` lỗi và có OSM objects. Không chấp nhận trang HTML 200 hay thông báo timeout XML làm bản đồ. Lỗi 500/504 chỉ hiển thị mã lỗi máy chủ, không đưa HTML dài lên UI.

### Cắt từ một gói bản đồ có sẵn

Đặt `MAP_SOURCE_PACKAGE` tới ZIP chứa MBTiles thật, ví dụ file mẫu của người dùng. Nhánh này dùng Python + SQLite, chạy cả trên Windows không có GDAL/Tilemaker:

```
VALIDATE_INPUT → PREPARE_WORKDIR → CLIP_SOURCE_PACKAGE
→ BUILD_STYLE → PACKAGE_ZIP → VALIDATE_ZIP → PENDING_REVIEW
```

Chọn tile giao với bbox tại từng zoom, giữ TMS row, cập nhật metadata/checksum, cắt GeoJSON. Bbox phải nằm trong phạm vi nguồn. Nguồn phải có cả base, contours và hillshade, checksum hợp lệ. Hỗ trợ manifest cũ không có `layers`/`geojson` như `ba-den-v1`.

Nếu job có Place ID / Route ID, thêm BUILD_GEOJSON để lấy dữ liệu hiện tại từ trekking-service thay cho tuyến/mốc trong ZIP nguồn. ZIP nguồn nên là bản đồ đầy đủ của khu vực cần xây dựng, không phải file style-only.

## Format output

Tất cả file tại root ZIP:

```
{slug}-v{N}-flutter.zip
├── {slug}.mbtiles
├── {slug}-contours.mbtiles
├── {slug}-hillshade.mbtiles
├── {slug}-routes.geojson
├── {slug}-milestones.geojson
├── style.json
└── manifest.json
```

Manifest có `packageId`, version số nguyên, `bounds`, `center`, `centerLat`, `centerLng`, `minZoom`, `maxZoom`, `maxNativeZoom`, `layers`, `geojson`, `style`, `sha256`. Mỗi layer khai báo file, type, native zoom và số tile thực tế. SHA-256 bao gồm cả style và GeoJSON.

`maxZoom` là mức hiển thị; tile vector gốc mặc định tới zoom 14, Flutter overzoom lên 17 nếu yêu cầu. Hillshade mặc định native zoom 12. Không tải các tile zoom 15–17 trùng dữ liệu chỉ để tăng kích thước gói.

`style.json` là template nội bộ: `mbtiles://filename` được gắn vào LocalTileServer khi sử dụng. Không phải URL mạng hay giao thức mà MapLibre tự đọc trực tiếp. Flutter hiện dùng MapStyleBuilder với cùng source-layer, chạy tile server và dùng glyphs được bundle trong app; tuyến/mốc trong style cũng được embed GeoJSON để không gọi mạng.

## Kiểm tra trước review và trước publish

GDAL vector `BOUNDS` chỉ ghi metadata, không giới hạn các tile thực tế được tạo. Buffer MVT mặc định có thể sinh tile kế bên dù tile đó không giao bbox. Lỗi đã tái hiện với job `MAP-20261010-81E507DE`, bbox `[107.3529, 10.9159, 107.4005, 10.9634]`: contours có 23 tile, trong đó tile TMS `(z=11, x=1635, y=1086)` nằm ngoài vùng cột `1634` được yêu cầu. Lọc tile thực sự giữ 22 tile đúng vùng. Không nới lỏng validator để chấp nhận tile ngoài bbox.

Helper `restrict_generated_mbtiles` kiểm tra toàn bộ SQLite/payload trước khi lọc, giữ nguyên byte payload của tile giao bbox, cập nhật bounds/native zoom/center/scheme và kiểm tra lại. Thay đổi metadata trong transaction, rollback nếu không còn tile. Áp dụng cả contour và hillshade để xử lý padding ở mép vùng.

- ZIP unique files ở root; manifest, style và đủ 3 MBTiles + 2 GeoJSON.
- Tất cả checksum, bbox, zoom, version khớp job.
- MBTiles là SQLite đọc được, có bảng metadata/tiles, có tile payload thực sự; kiểm tra tọa độ TMS và dữ liệu MVT/ảnh, không chấp nhận byte placeholder.
- Style có lớp hiển thị cho từng nguồn và source-layer tồn tại trong metadata.
- Contour dùng `contour`; base dùng schema tương thích Flutter.
- Revalidate khi approve cả job cũ để chặn ZIP rỗng đã từng PENDING_REVIEW.
- Mock chỉ phục vụ thử giao diện, có cờ `mock`, không được approve/publish.

Publish giữ luồng hiện có: admin duyệt → R2 → cập nhật offlineMap cho PLACE/ROUTE. Lưu objectKey, build downloadUrl runtime. Không tự publish bằng script kiểm tra cục bộ.

## Chạy bằng Docker (cắt khu vực bất kỳ)

Dockerfile runtime mới cài osmium, GDAL và compile Tilemaker 3. Build sẽ kiểm tra đủ công cụ, thư mục làm việc cấp quyền cho appuser.

```bash
cd services/agent-service
docker compose -f docker-compose.dev.yml up --build -d
```

Để dùng Docker gọi các service chạy ngoài container, cấu hình `TREKKING_SERVICE_URL`, `AUTH_SERVICE_URL`, `CHECKIN_SERVICE_URL` phù hợp host/network (localhost bên trong container là container). Không cần MAP_SOURCE_PACKAGE khi cắt mới từ OSM+DEM.

Cấu hình trong `.env.example`: `MAP_PIPELINE_MODE`, `MAP_SOURCE_PACKAGE`, `MAP_DEM_PATH`, `MAP_DEM_URL_TEMPLATE`, `MAP_CONTOUR_INTERVAL_M`, `MAP_NATIVE_MAX_ZOOM`, `MAP_HILLSHADE_MAX_ZOOM`.

```bash
python scripts/check_dependencies.py
```

Script kiểm tra runtime thực sự được chọn trong `.env`, kể cả công cụ bên trong Docker/WSL. Thiếu công cụ khiến full OSM+DEM job FAILED ngay ở VALIDATE_INPUT.

### Agent chạy Python trực tiếp trên Windows

Agent Windows có thể giữ cách chạy Uvicorn hiện tại và gọi các công cụ map trong Docker. Không cần cài GDAL/Tilemaker vào Python virtualenv. `auto` dùng native nếu đủ binary, rồi thử Docker CLI, rồi WSL Docker; có thể chọn runtime rõ ràng bằng `MAP_TOOL_BACKEND`.

Với Docker daemon đang chạy trong WSL Ubuntu, build image một lần (sửa đường dẫn repo nếu khác):

```powershell
wsl --distribution Ubuntu --exec docker build -t trekvn-agent-map-tools:latest /mnt/c/doan1/TrekVN/Backend-TrekVN/services/agent-service
```

`.env` của agent Windows:

```dotenv
MAP_PIPELINE_MODE=full
MAP_TOOL_BACKEND=wsl-docker
MAP_TOOL_IMAGE=trekvn-agent-map-tools:latest
MAP_WSL_DISTRIBUTION=Ubuntu
MAP_TOOL_CONTAINER_USER=1000:1000
MAP_WORK_ROOT=C:/tmp/trekviet-agent
MAP_SOURCE_PACKAGE=
```

Nếu dùng Docker Desktop với `docker` trên Windows, chọn `MAP_TOOL_BACKEND=docker` và build cùng Dockerfile bằng CLI đó. Image phải tồn tại trong đúng Docker daemon; workflow dùng `--pull=never`.

Mỗi lệnh chỉ mount thư mục job vào `/map-work`, đổi đường dẫn Windows sang đường dẫn container, chạy không có mạng, rồi xóa container khi hoàn thành. Tải OSM/DEM và gọi trekking-service vẫn do agent Windows thực hiện nên `localhost:3001/3003` giữ nguyên. Với `--reload` trên Windows, subprocess chạy trong thread vì Windows SelectorEventLoop không hỗ trợ asyncio subprocess.

Sau khi thay `.env`, khởi động lại agent để đọc cấu hình mới, rồi kiểm tra:

```powershell
.venv/Scripts/python.exe scripts/check_dependencies.py
```

## Tạo artifact cục bộ, không kết nối MongoDB/R2

Windows, cắt từ gói mẫu:

```powershell
.venv\Scripts\python.exe scripts/build_map_artifact.py --name "Núi Bà Đen" --source-package "C:/Users/Admin/Downloads/ba-den-v1-flutter.zip" --bbox 106.13943 11.36157 106.19162 11.41239 --min-zoom 10 --max-zoom 17 --work-root artifacts/ba-den-reference-check
```

Linux/Docker, cắt mới từ OSM + DEM (GeoJSON rỗng vì script không có target Place/Route):

```bash
python scripts/build_map_artifact.py --name "Núi Bà Đen" --bbox 106.13943 11.36157 106.19162 11.41239 --min-zoom 10 --max-zoom 17 --work-root artifacts/ba-den-native-check
```

Artifact được tạo tại `{work-root}/map-jobs/MAP-local/{slug}-v1-flutter.zip`. Chạy lại script cùng work-root sẽ thay thư mục MAP-local của lần chạy trước. Pipeline production dùng jobId riêng và TTL 72h mặc định.

## API

```
POST /api/v1/agent/map-jobs
GET  /api/v1/agent/map-jobs
GET  /api/v1/agent/map-jobs/:jobId
GET  /api/v1/agent/map-artifacts/:jobId
GET  /api/v1/agent/map-artifacts/:jobId/file
POST /api/v1/agent/map-jobs/:jobId/approve
POST /api/v1/agent/map-jobs/:jobId/reject
```

Bbox Bà Đen đúng theo file mẫu:

```json
{
  "trekkingPlaceId": "",
  "placeName": "Núi Bà Đen",
  "publishTarget": { "type": "PLACE", "targetId": "" },
  "bbox": { "minLon": 106.13943, "minLat": 11.36157, "maxLon": 106.19162, "maxLat": 11.41239 },
  "minZoom": 10,
  "maxZoom": 17
}
```

Có thể để targetId rỗng để tạo artifact và gán thủ công sau; nếu cần dữ liệu tuyến/cột mốc production phải có Place/Route ID thật.

## Xem trước offline trên Web Admin

Màn kết quả tải ZIP của đúng job qua `/api/v1/agent/map-artifacts/:jobId/file`, dùng Bearer token của phiên admin. Endpoint giữ kiểm tra chủ sở hữu và giới hạn đường dẫn trong MAP_WORK_ROOT; phục vụ gói đã build xong, kể cả sau publish khi ZIP còn được lưu. ZIP hết TTL cần tạo lại. Không đọc thư mục tùy ý hoặc thay ZIP bằng nền online.

Trình duyệt giải nén ZIP bằng JSZip, đọc các SQLite MBTiles bằng sql.js/WASM được bundle cùng web, đối chiếu BBOX và checksum SHA-256 (khi Web Crypto có sẵn). `style.json` của gói được giữ các lớp/paint và chuyển `mbtiles://` thành protocol nội bộ của MapLibre; min/max zoom riêng của mỗi nguồn lấy từ tile thật, hàng TMS chuyển sang XYZ. GeoJSON trong gói được nạp tại chỗ. Bật/tắt lớp và fullscreen tác động lên map thật. Sau lần nạp ZIP/WASM, phóng/thu và đổi lớp không cần tải tile qua mạng.

Không dùng OpenStreetMap raster online để xem kết quả. Nguồn ngoài ZIP, style thiếu, MBTiles thiếu/rỗng, checksum hay BBOX sai đều báo lỗi. Style có glyph/sprite ngoài gói cũng bị từ chối. Gói hiện tại không có glyph/sprite nên preview dùng những lớp có sẵn trong style; không có nhãn chữ của nền OSM online.

Tên địa điểm chỉ là nhãn; BBOX quyết định vị trí cắt. BBOX `[107.3514, 10.9161, 107.4032, 10.964]` trong ảnh báo lỗi nằm ở vùng Chứa Chan; không thể đổi thành Bà Đen bằng cách đặt tên gói. Web form và màn kết quả nhắc khi gói mang tên Bà Đen nhưng vùng cắt không chứa tâm vùng Bà Đen của file mẫu. Dùng nút **Dùng vùng Bà Đen theo gói mẫu** để điền bbox 106.13943, 11.36157, 106.19162, 11.41239 rồi tạo lại.

Kiểm tra: 8 test Web Admin cho ZIP/SQLite, TMS/XYZ, gzip, checksum/BBOX, thiếu tile, chặn online và hủy tải; 48 test backend liên quan, gồm stream ZIP có xác thực/chủ sở hữu/giới hạn đường dẫn. Vite bundle build thành công với WASM local. `tsc` còn 5 lỗi có sẵn trong AssistantPage/useAssistant, không phát sinh lỗi TypeScript trong phần map preview.

Đã kiểm tra MapPreview trong trình duyệt với ZIP Bà Đen 42 tile và đúng ZIP trong ảnh của job `MAP-20261010-A86F8186` (217.680 byte, checksum bắt đầu `520d3b2a`, 32 base + 32 contours + 6 hillshade). Gói thứ hai có BBOX Chứa Chan như trong ảnh. Trên trang thử, chặn cả fetch/XHR sau khi nạp ZIP rồi phóng gần và bật/tắt đồng mức: bản đồ vẫn hiển thị, số yêu cầu mạng mới là 0. Fullscreen resize canvas đúng. Kiểm tra này dùng hai ZIP thật và component MapPreview thật, adapter API của trang thử thay endpoint có xác thực; quyền tải ZIP được kiểm tra riêng bằng các test backend.

## Kết quả kiểm tra ngày 2026-10-10

- 46 test liên quan map builder/runtime/source đều pass trên Windows, gồm kiểm tra SelectorEventLoop của Uvicorn reload, nguồn PBF khi Overpass không hoạt động, bbox nguồn, mount read-only, XML lỗi, mép tile vector/raster, giữ nguyên payload, rollback khi bbox không có tile và timeout subprocess; 23 test pipeline/artifact trước đó cũng pass trong Docker/Linux.
- Cắt bbox đầy đủ từ `ba-den-v1`: 19 tile base, 19 tile contour, 2 tile hillshade; giữ 1 tuyến và 5 mốc; ZIP 251.995 byte.
- Thu nhỏ bbox thành `[106.15, 11.375, 106.17, 11.395]`: còn 7 tile base, 7 tile contour, 1 hillshade, 1 mốc; ZIP 138.939 byte. Xác nhận thực sự lọc tile/GeoJSON.
- Build Docker đầy đủ thành công. Chạy toàn bộ nhánh Overpass → osmium → Tilemaker → DEM → contours/hillshade → style → validate thành công: 19 base, 19 contours, 4 hillshade; ZIP 264.149 byte. Bản thử độc lập chưa có Place/Route ID nên 2 GeoJSON là collection rỗng.
- Artifact cục bộ ở `services/agent-service/artifacts/ba-den-reference-check/` và `artifacts/ba-den-native-check/`. Không upload R2, không cập nhật production.
- Agent Python trên Windows gọi Docker trong WSL thành công qua toàn bộ workflow: 19 base, 19 contours, 4 hillshade, đủ 7 file, ZIP 259.014 byte ở `artifacts/ba-den-windows-check/`. GeoJSON lấy từ trekking-service thật; không có tuyến/mốc trong bbox mẫu nên collections rỗng.
- Job `MAP-20261010-1097EB5F` được khôi phục từ nguồn PBF Việt Nam, không gọi Overpass: PENDING_REVIEW, ZIP 249.740 byte, 19 base + 19 contours + 4 hillshade, đủ 7 file. Input bbox được sửa theo vùng mẫu Bà Đen và bbox cũ lưu trong workflow event.
- Job `MAP-20261010-81E507DE` được khôi phục với nguyên bbox người dùng đã nhập sau khi sửa tile mép BBOX: toàn bộ pipeline tới PENDING_REVIEW, ZIP 186.032 byte, đã qua validation trước review.
- Chạy lại toàn bộ workflow trên bbox Bà Đen của file mẫu sau sửa mép tile cũng thành công; artifact ở `artifacts/ba-den-tile-border-check/`. Cả bbox phát sinh lỗi và bbox mẫu đều đã được kiểm tra với native tools thật.
- Web form có nút dùng bbox Bà Đen theo gói mẫu; polling cho phép 30 phút để không báo timeout giả cho job cắt PBF lớn. Vite bundle build thành công; `npm run build` còn lỗi TypeScript có sẵn ở AssistantPage/useAssistant, ngoài các file Map Builder đã chỉnh.

## Tài liệu công cụ

- [Tilemaker configuration v3](https://github.com/systemed/tilemaker/blob/v3.0.0/docs/CONFIGURATION.md)
- [GDAL MBTiles raster/vector](https://gdal.org/en/stable/drivers/raster/mbtiles.html)
- [Mapzen/Skadi elevation formats](https://github.com/tilezen/joerd/blob/master/docs/formats.md)
- [Geofabrik Vietnam PBF](https://download.geofabrik.de/asia/vietnam.html)
- [Osmium extract strategies](https://docs.osmcode.org/osmium/latest/osmium-extract.html)
- [GDAL MVT bounds metadata và tile buffer](https://gdal.org/en/stable/drivers/vector/mvt.html)
