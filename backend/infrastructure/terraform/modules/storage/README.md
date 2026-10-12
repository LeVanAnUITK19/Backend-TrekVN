# Storage module

This lightweight module centralizes storage sizing for phase 1. **Root EBS is defined within `modules/ec2`** because it is part of the EC2 resource lifecycle. Do not create a second unattached EBS volume here. S3 Terraform state is bootstrapped separately in `bootstrap-state/` because Terraform cannot use an S3 backend bucket before it exists. This can later be extended for application buckets and independent EBS data volumes.
