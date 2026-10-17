output "repository_urls" {
  value = { for key, repo in aws_ecr_repository.service : key => repo.repository_url }
}
