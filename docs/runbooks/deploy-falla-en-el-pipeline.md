# Runbook: falla `infra-apply`, `deploy` o `verify-deployment`

**Contexto:** la infraestructura vive en el sandbox de AWS Academy, que se apaga al cerrar la sesión y cambia de credenciales en cada una. El pipeline la recrea con Terraform cuando alguien ejecuta ▶ `infra-apply`.

## Antes de empezar

- ¿Se ejecutó ▶ en el **job** `infra-apply` y no en el botón de la **etapa** `infra`? El botón de la etapa también ejecuta `infra-destroy` ([postmortem](../postmortems/2026-11-19-infra-destroy-borro-produccion.md)).
- ¿La sesión del sandbox está activa (círculo verde en AWS Academy)?

## `infra-apply` falla

| Mensaje | Causa | Acción |
|---|---|---|
| `ExpiredToken` / `InvalidClientTokenId` | Las credenciales del sandbox cambiaron con la sesión nueva. | Actualizar `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` y `AWS_SESSION_TOKEN` en las variables de CI/CD y reintentar. |
| `InvalidKeyPair.Duplicate` / `InvalidGroup.Duplicate` | Quedaron recursos de una sesión anterior que el estado de Terraform no conoce. | Borrarlos desde la consola, o ejecutar `infra-destroy` y después `infra-apply`. |
| `No valid credential sources found` (en una PC) | El archivo se llama `credentials.txt`. | Renombrarlo a `credentials`, sin extensión ([ERRORES.md](../../ERRORES.md), error 41). |

## `deploy` falla

| Mensaje | Causa | Acción |
|---|---|---|
| `No llego INFRA_EC2_HOST` / `known_hosts` | `infra-apply` no corrió en este pipeline, o sus artifacts vencieron. | Ejecutar `infra-apply` en el mismo pipeline. |
| `Host key verification failed` | La identidad de la EC2 no coincide con el `known_hosts` obtenido de la API de AWS. | **No desactivar `StrictHostKeyChecking`.** Reintentar `infra-apply`: si la instancia es nueva, se genera un `known_hosts` nuevo. Si vuelve a fallar, investigar. |
| `Connection timed out` en el puerto 22 | El Security Group permite SSH solo desde la IP de salida del runner (`runner_cidr`). `infra-apply` la calcula en cada corrida, pero `deploy` salió por otra IP. | Volver a ejecutar `infra-apply` en el mismo pipeline para que el SG tome la IP actual. Si se repite, el runner tiene más de una IP de salida y hay que agregarlas al SG. |
| `unauthorized` en `docker login` | El token de Docker Hub de solo lectura venció. | Generar uno nuevo con permiso *Read-only* y vencimiento, y actualizar `DOCKERHUB_PULL_TOKEN`. |
| `manifest unknown` en `docker compose pull` | `publish-image` no subió ese SHA a Docker Hub. | Revisar el stage `publish` del mismo pipeline. |
| `sha256sum: WARNING: 1 computed checksum did NOT match` | El binario de Compose descargado no coincide con su checksum. | **No instalarlo.** Reintentar; si persiste, es una descarga alterada o corrupta. |

## `verify-deployment` falla

| Mensaje | Causa | Acción |
|---|---|---|
| `/api/<svc> -> HTTP 502` | La API no arrancó. | Seguir el [runbook de 502](./api-devuelve-502.md). |
| `ERROR: el puerto 80 responde` | Alguien abrió el `80` en el Security Group o en el compose. | Cerrarlo: el único puerto público es `8443`. |
| Timeout en todos los endpoints | El `8443` está cerrado en el Security Group, o `web` no arrancó. | Revisar el SG en la consola y `docker compose ps web`. |

## Al terminar la sesión

No hace falta ejecutar `infra-destroy`: el sandbox borra los recursos al cerrar la sesión. Si se necesita liberar recursos antes, ejecutar el job `infra-destroy` de forma explícita.
