output "instance_id" { value = aws_instance.k3s.id }
output "elastic_ip" { value = aws_eip.k3s.public_ip }
