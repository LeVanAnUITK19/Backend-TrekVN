output "instance_id" { value = module.ec2.instance_id }
output "elastic_ip" { value = module.ec2.elastic_ip }
output "vpc_id" { value = module.network.vpc_id }
output "subnet_id" { value = module.network.subnet_id }
output "ecr_repositories" { value = module.ecr.repository_urls }
output "ssm_start_session" {
  value = "aws ssm start-session --target ${module.ec2.instance_id} --region ${var.aws_region}"
}
