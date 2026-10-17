variable "availability_zone" {
  description = "Availability Zone for TrekVN public subnet"
  type        = string
  default     = "ap-southeast-1a"
}

variable "aws_region" {
  type    = string
  default = "ap-southeast-1"
}

variable "project" {
  type    = string
  default = "trekvn"
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

variable "subnet_cidr" {
  type    = string
  default = "10.20.1.0/24"
}

variable "instance_type" {
  type    = string
  default = "t3.medium"
}

variable "root_volume_gib" {
  type    = number
  default = 20

  validation {
    condition     = var.root_volume_gib >= 8
    error_message = "EBS root volume must be at least 8 GiB."
  }
}
