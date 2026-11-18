locals {
  tags_comunes = {
    Proyecto = var.proyecto
    Gestion  = "terraform"
  }

  # Origenes permitidos para SSH: siempre el runner; el admin solo si se cargo
  ssh_cidrs = compact([var.runner_cidr, var.admin_cidr])
}

# ---------------------------------------------------------------------------
# Datos existentes en el sandbox (no se crean, se consultan)
# ---------------------------------------------------------------------------

# VPC por defecto de la cuenta del sandbox
data "aws_vpc" "default" {
  default = true
}

# Zonas de disponibilidad donde existe el tipo de instancia elegido
# (no todas las zonas de us-east-1 ofrecen todos los tipos)
data "aws_ec2_instance_type_offerings" "disponibles" {
  location_type = "availability-zone"

  filter {
    name   = "instance-type"
    values = [var.instance_type]
  }
}

# Subredes por defecto de la VPC, solo en esas zonas
data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }

  filter {
    name   = "default-for-az"
    values = ["true"]
  }

  filter {
    name   = "availability-zone"
    values = data.aws_ec2_instance_type_offerings.disponibles.locations
  }
}

# Imagen oficial mas reciente de Amazon Linux 2023 (la misma familia que la Parte 1)
data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-kernel-*-x86_64"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
}

# ---------------------------------------------------------------------------
# Security Group: unica puerta de entrada (Clase 09, seccion 3.2)
# ---------------------------------------------------------------------------

resource "aws_security_group" "app" {
  name        = "${var.proyecto}-sg"
  description = "SSH restringido y HTTPS 8443 para FinTech Nova"
  vpc_id      = data.aws_vpc.default.id

  tags = {
    Name = "${var.proyecto}-sg"
  }
}

# SSH (22) solo desde el runner de GitLab y, opcionalmente, desde un integrante
resource "aws_vpc_security_group_ingress_rule" "ssh" {
  for_each = toset(local.ssh_cidrs)

  security_group_id = aws_security_group.app.id
  description       = each.value == var.runner_cidr ? "SSH runner GitLab" : "SSH administracion"
  ip_protocol       = "tcp"
  from_port         = 22
  to_port           = 22
  cidr_ipv4         = each.value
}

# HTTPS de la app (8443) abierto a internet: es el unico servicio publico.
# El 80 y el 3306 no tienen regla, por lo tanto quedan cerrados.
resource "aws_vpc_security_group_ingress_rule" "https_app" {
  security_group_id = aws_security_group.app.id
  description       = "HTTPS de la app"
  ip_protocol       = "tcp"
  from_port         = 8443
  to_port           = 8443
  cidr_ipv4         = "0.0.0.0/0"
}

# Salida libre: la instancia descarga paquetes, el plugin de Compose y las imagenes
resource "aws_vpc_security_group_egress_rule" "salida" {
  security_group_id = aws_security_group.app.id
  description       = "Salida a internet"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

# ---------------------------------------------------------------------------
# Llave SSH del deploy
# ---------------------------------------------------------------------------

# Se sube la llave PUBLICA propia del pipeline. La privada vive solo en la variable
# de CI/CD EC2_SSH_PRIVATE_KEY, asi que no hace falta descargar labsuser.pem en cada sesion.
resource "aws_key_pair" "deploy" {
  key_name   = "${var.proyecto}-deploy"
  public_key = trimspace(file("${path.module}/deploy-key.pub"))
}

# ---------------------------------------------------------------------------
# Instancia EC2
# ---------------------------------------------------------------------------

resource "aws_instance" "app" {
  ami                         = data.aws_ami.al2023.id
  instance_type               = var.instance_type
  subnet_id                   = sort(data.aws_subnets.default.ids)[0]
  vpc_security_group_ids      = [aws_security_group.app.id]
  key_name                    = aws_key_pair.deploy.key_name
  associate_public_ip_address = true

  # IMDSv2 obligatorio: protege las credenciales del metadata service ante SSRF
  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  # Disco cifrado en reposo
  root_block_device {
    volume_type = "gp3"
    volume_size = var.volume_size
    encrypted   = true
  }

  tags = {
    Name = var.proyecto
  }

  lifecycle {
    # Si AWS publica una AMI nueva, no reemplazar una instancia que ya funciona:
    # volver a ejecutar el pipeline en la misma sesion solo redespliega.
    ignore_changes = [ami]
  }
}
