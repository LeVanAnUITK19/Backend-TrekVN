FROM grafana/grafana:13.2.4

COPY provisioning/ /etc/grafana/provisioning/
COPY dashboards/ /etc/grafana/dashboards/

# Set PROMETHEUS_URL, GF_SECURITY_ADMIN_PASSWORD and GF_SERVER_ROOT_URL at runtime.
# Persist /var/lib/grafana; dashboards stay in /etc and survive a data-disk mount.
ENV GF_USERS_ALLOW_SIGN_UP=false
EXPOSE 3000
