# Versiones fijadas: Terraform y el provider de AWS.
# "~> 6.0" acepta cualquier 6.x pero no la 7 (evita cambios incompatibles).
# La version exacta del provider queda fijada en .terraform.lock.hcl, que se versiona.
terraform {
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # El estado se guarda en GitLab (Operate > Terraform states), no en AWS: el sandbox
  # borra todos sus recursos en cada relanzamiento, incluido un bucket S3.
  # La direccion y las credenciales (token del job) las pasa el pipeline en "terraform init".
  backend "http" {}
}
