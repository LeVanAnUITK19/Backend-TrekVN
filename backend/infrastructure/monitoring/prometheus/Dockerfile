FROM prom/prometheus:v2.48.0

# Copy configuration files
COPY prometheus.yml /etc/prometheus/prometheus.yml
COPY alerts.yml /etc/prometheus/alerts.yml

# Create directory for data
RUN mkdir -p /prometheus

# Expose Prometheus port
EXPOSE 9090

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:9090/-/healthy || exit 1

# Start Prometheus with configuration
CMD ["--config.file=/etc/prometheus/prometheus.yml", \
     "--storage.tsdb.path=/prometheus", \
     "--storage.tsdb.retention.time=7d", \
     "--storage.tsdb.retention.size=2GB", \
     "--web.console.libraries=/etc/prometheus/console_libraries", \
     "--web.console.templates=/etc/prometheus/consoles", \
     "--web.enable-lifecycle", \
     "--web.enable-admin-api"]
