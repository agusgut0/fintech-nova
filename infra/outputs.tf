# Datos que el pipeline le pasa a los jobs deploy y verify-deployment
output "public_ip" {
  description = "IP publica de la instancia"
  value       = aws_instance.app.public_ip
}

output "instance_id" {
  description = "ID de la instancia (para leer la clave del host desde la API de AWS)"
  value       = aws_instance.app.id
}

output "url" {
  description = "URL de la aplicacion"
  value       = "https://${aws_instance.app.public_ip}:8443"
}
