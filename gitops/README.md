# GitOps scaffold

This directory reserves space for Argo CD applications, Helm charts and environment values. `argocd/root-app.yaml` is currently empty; there is no deployable Argo CD application or Helm chart yet. Kubernetes deployment and RabbitMQ manifests still need to be implemented.

Keep plaintext credentials and local kubeconfig outside Git. Commit only sanitized values or encrypted secrets managed by an explicitly configured secret-management solution.
