# AWS infrastructure

Terraform provisions the AWS infrastructure for a single EC2 host intended to run K3s. It does not install K3s, Argo CD, RabbitMQ or the application. The GitOps directory is currently a scaffold.

## Layout

- `bootstrap-state/`: optional creation of a versioned, encrypted, private S3 state bucket. Its initial state is local until migrated; keep that state secure and outside Git.
- `environments/dev/`: S3-backed Terraform root for VPC/subnet/routing, security group, IAM/SSM, ECR repositories and EC2/EIP.
- `modules/`: reusable network, security, IAM, ECR, storage sizing and EC2 components.

## Local configuration

From `backend/infrastructure/terraform/environments/dev`:

```powershell
Copy-Item terraform.example.tfvars terraform.tfvars
Copy-Item backend.hcl.example backend.hcl
# Edit both local files before initializing. The S3 bucket must already exist.
terraform init -backend-config=backend.hcl
terraform validate
terraform plan -var-file=terraform.tfvars -out=tfplan
```

Use an AWS CLI profile or another supported credential provider; do not hard-code AWS keys in `.tf`, `.tfvars` or the backend configuration. `backend.hcl` uses the S3 bucket's region, which may differ from `aws_region` in `terraform.tfvars`.

Commit `.tf`, sanitized examples and `.terraform.lock.hcl`. Do not commit `.terraform/`, state/lock files, saved plans, crash logs, real `.tfvars`, real `backend.hcl`, AWS credentials or kubeconfig. `.gitignore` covers these common local artifacts; it cannot detect credentials embedded in arbitrarily named source files.

The EC2 security group allows public HTTP/HTTPS only. SSH and the Kubernetes API are not publicly exposed; access is intended through SSM. RabbitMQ's AMQP port should remain internal when deployed in K3s.
