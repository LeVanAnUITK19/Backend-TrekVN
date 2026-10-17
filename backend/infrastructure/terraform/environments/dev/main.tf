module "network" {
  source            = "../../modules/network"
  name              = "${var.project}-${var.environment}"
  vpc_cidr          = var.vpc_cidr
  subnet_cidr       = var.subnet_cidr
  availability_zone = var.availability_zone
}

module "security" {
  source = "../../modules/security"
  name   = "${var.project}-${var.environment}"
  vpc_id = module.network.vpc_id
}

module "iam" {
  source = "../../modules/iam"
  name   = "${var.project}-${var.environment}"
}

module "ecr" {
  source   = "../../modules/ecr"
  name     = var.project
  services = ["auth-service", "checkin-service", "trekking-service", "agent-service", "community-service", "api-gateway"]
}

module "storage" {
  source = "../../modules/storage"
  # EBS root is defined inside the EC2 instance module to avoid creating an unattached volume.
  root_volume_gib = var.root_volume_gib
}

module "ec2" {
  source                = "../../modules/ec2"
  name                  = "${var.project}-${var.environment}-k3s"
  instance_type         = var.instance_type
  subnet_id             = module.network.subnet_id
  security_group_id     = module.security.security_group_id
  instance_profile_name = module.iam.instance_profile_name
  root_volume_gib       = module.storage.root_volume_gib
  depends_on            = [module.network]
}
