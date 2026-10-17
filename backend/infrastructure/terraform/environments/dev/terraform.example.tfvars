# Copy to terraform.tfvars (ignored by Git) and adjust for your environment.
aws_region        = "ap-southeast-1"
availability_zone = "ap-southeast-1a"
project           = "trekvn"
environment       = "dev"
vpc_cidr          = "10.20.0.0/16"
subnet_cidr       = "10.20.1.0/24"
instance_type     = "t3.medium"
root_volume_gib   = 20
