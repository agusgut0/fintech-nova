variable "region" {
  description = "Region de AWS del sandbox de AWS Academy"
  type        = string
  default     = "us-east-1"
}

variable "proyecto" {
  description = "Nombre base de los recursos (instancia, Security Group, key pair)"
  type        = string
  default     = "fintech-nova-grupo6"
}

variable "instance_type" {
  description = "Tipo de instancia EC2. Los limites del docker-compose.yml estan pensados para t3.medium"
  type        = string
  default     = "t3.medium"

  # Frena un tipo invalido antes de llamar a AWS (shift-left)
  validation {
    condition     = contains(["t3.medium", "t3.large"], var.instance_type)
    error_message = "Solo se permiten t3.medium o t3.large."
  }
}

variable "volume_size" {
  description = "Tamano del disco raiz en GiB"
  type        = number
  default     = 8

  validation {
    condition     = var.volume_size >= 8 && var.volume_size <= 30
    error_message = "El disco debe tener entre 8 y 30 GiB."
  }
}

variable "runner_cidr" {
  description = "IP de salida del runner de GitLab en formato /32. La calcula el pipeline en cada corrida"
  type        = string

  validation {
    condition     = can(regex("^([0-9]{1,3}\\.){3}[0-9]{1,3}/32$", var.runner_cidr))
    error_message = "runner_cidr debe ser una IP /32, por ejemplo 200.1.2.3/32."
  }
}

variable "admin_cidr" {
  description = "IP /32 de un integrante para entrar por SSH (opcional, vacio = sin acceso extra)"
  type        = string
  default     = ""

  validation {
    condition     = var.admin_cidr == "" || can(regex("^([0-9]{1,3}\\.){3}[0-9]{1,3}/32$", var.admin_cidr))
    error_message = "admin_cidr debe estar vacio o ser una IP /32, por ejemplo 181.1.2.3/32."
  }
}
