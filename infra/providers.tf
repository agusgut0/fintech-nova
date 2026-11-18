# Las credenciales NO estan aca: el provider las lee de las variables de entorno
# AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY y AWS_SESSION_TOKEN (variables de CI/CD
# que se actualizan al inicio de cada sesion del sandbox).
provider "aws" {
  region = var.region

  # Etiquetas que reciben todos los recursos creados por Terraform
  default_tags {
    tags = local.tags_comunes
  }
}
