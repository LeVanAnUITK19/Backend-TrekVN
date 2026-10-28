FROM prom/prometheus:v3.13.5

COPY prometheus.yml /etc/prometheus/prometheus.yml
COPY alerts.yml /etc/prometheus/alerts.yml

# Supply /etc/secrets/metrics_token at runtime (Render Secret File or volume).
EXPOSE 9090
CMD ["--config.file=/etc/prometheus/prometheus.yml", \
     "--storage.tsdb.path=/prometheus", \
     "--storage.tsdb.retention.time=7d", \
     "--storage.tsdb.retention.size=2GB"]
