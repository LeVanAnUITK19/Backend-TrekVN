# Compile native map tools against the same Alpine ABI as the runtime.
FROM python:3.12-alpine3.24 AS map-tools-builder
ARG TILEMAKER_VERSION=3.0.0
ARG OSMIUM_VERSION=1.19.0
RUN apk add --no-cache \
    build-base cmake curl boost-dev lua5.1-dev sqlite-dev shapelib-dev \
    rapidjson-dev zlib-dev libosmium-dev protozero-dev bzip2-dev expat-dev lz4-dev
RUN curl -fsSL https://github.com/systemed/tilemaker/archive/refs/tags/v${TILEMAKER_VERSION}.tar.gz \
    | tar -xz -C /tmp \
    && cmake -S /tmp/tilemaker-${TILEMAKER_VERSION} -B /tmp/tilemaker-build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build /tmp/tilemaker-build --target tilemaker -j2 \
    && strip /tmp/tilemaker-build/tilemaker
RUN apk add --no-cache nlohmann-json \
    && curl -fsSL https://github.com/osmcode/osmium-tool/archive/refs/tags/v${OSMIUM_VERSION}.tar.gz \
    | tar -xz -C /tmp \
    && cmake -S /tmp/osmium-tool-${OSMIUM_VERSION} -B /tmp/osmium-build \
        -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTING=OFF \
    && cmake --build /tmp/osmium-build --target osmium -j2 \
    && strip /tmp/osmium-build/src/osmium

FROM python:3.12-alpine3.24 AS python-deps
WORKDIR /app
RUN apk add --no-cache build-base libffi-dev openssl-dev
COPY requirements.txt .
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt \
    && /opt/venv/bin/pip uninstall -y pip setuptools wheel

FROM python:3.12-alpine3.24 AS runtime
ENV APP_ENV=production \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app
# Native GDAL CLIs do not need a second system Python/bindings installation.
RUN apk upgrade --no-cache \
    && apk add --no-cache ca-certificates gdal-tools \
        libstdc++ lua5.1-libs sqlite-libs shapelib zlib libbz2 libexpat lz4-libs \
        boost1.84-filesystem boost1.84-program_options boost1.84-iostreams \
    && rm -rf /usr/local/lib/python3.12/site-packages/pip* \
        /usr/local/lib/python3.12/site-packages/setuptools* \
        /usr/local/lib/python3.12/site-packages/wheel* \
    && rm -f /usr/local/bin/pip /usr/local/bin/pip3 /usr/local/bin/pip3.12
COPY --from=map-tools-builder /tmp/tilemaker-build/tilemaker /usr/local/bin/tilemaker
COPY --from=map-tools-builder /tmp/osmium-build/src/osmium /usr/local/bin/osmium
COPY --from=python-deps /opt/venv /opt/venv
COPY app/ app/
COPY scripts/ scripts/
COPY knowledge/ knowledge/
RUN python scripts/check_dependencies.py \
    && addgroup -S appgroup && adduser -S -G appgroup appuser \
    && mkdir -p /tmp/trekviet-agent && chown appuser:appgroup /tmp/trekviet-agent
USER appuser
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
