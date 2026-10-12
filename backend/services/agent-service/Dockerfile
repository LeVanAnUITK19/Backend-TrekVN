# Full Map Builder image: compile Tilemaker 3 and include GDAL + osmium.
FROM python:3.11-slim-bookworm AS tilemaker-builder
ARG TILEMAKER_VERSION=3.0.0
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl build-essential cmake liblua5.1-0-dev libsqlite3-dev \
    libshp-dev libboost-program-options-dev libboost-filesystem-dev \
    libboost-system-dev libboost-iostreams-dev rapidjson-dev zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://github.com/systemed/tilemaker/archive/refs/tags/v${TILEMAKER_VERSION}.tar.gz \
    | tar -xz -C /tmp
RUN cmake -S /tmp/tilemaker-${TILEMAKER_VERSION} -B /tmp/tilemaker-build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build /tmp/tilemaker-build --target tilemaker -j2 \
    && strip /tmp/tilemaker-build/tilemaker

FROM python:3.11-slim-bookworm AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends build-essential libssl-dev \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.11-slim-bookworm AS runtime
ENV APP_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl osmium-tool gdal-bin liblua5.1-0 libshp2 \
    libboost-filesystem1.74.0 libboost-program-options1.74.0 libboost-iostreams1.74.0 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=tilemaker-builder /tmp/tilemaker-build/tilemaker /usr/local/bin/tilemaker
COPY --from=builder /install /usr/local
COPY app/ app/
COPY scripts/ scripts/
COPY knowledge/ knowledge/
RUN python scripts/check_dependencies.py \
    && addgroup --system appgroup && adduser --system --ingroup appgroup appuser \
    && mkdir -p /tmp/trekviet-agent && chown appuser:appgroup /tmp/trekviet-agent
USER appuser
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
