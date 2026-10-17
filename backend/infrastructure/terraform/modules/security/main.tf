resource "aws_security_group" "k3s" {
  name_prefix = "${var.name}-k3s-"
  description = "HTTP and HTTPS public; no public SSH or Kubernetes API"
  vpc_id      = var.vpc_id
  tags        = { Name = "${var.name}-k3s-sg" }
}
resource "aws_vpc_security_group_ingress_rule" "http" {
  security_group_id = aws_security_group.k3s.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
  description       = "HTTP and ACME"
}
resource "aws_vpc_security_group_ingress_rule" "https" {
  security_group_id = aws_security_group.k3s.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  description       = "HTTPS ingress"
}
resource "aws_vpc_security_group_egress_rule" "all_ipv4" {
  security_group_id = aws_security_group.k3s.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
  description       = "Outbound updates ECR and SSM"
}
