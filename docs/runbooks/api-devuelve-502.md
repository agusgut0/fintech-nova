# Runbook: una ruta `/api/<svc>` devuelve 502 Bad Gateway

**Síntoma:** el frontend carga, pero una o más pestañas quedan vacías, y `curl -k https://<HOST>:8443/api/<svc>` devuelve `502`.
**Qué significa:** NGINX funciona, pero no consigue hablar con esa API.

Todos los comandos se corren en la EC2, desde `~/aplicaciones-contenedores` (con `sudo` si hace falta).

## 1. ¿El contenedor está vivo?

```bash
docker compose ps
```

| Estado de la API | Siguiente paso |
|---|---|
| `Up` (o `healthy`) | Ir al paso 3. |
| `Restarting` o `Exited` | Ir al paso 2. |
| `Created`, nunca arrancó | Revisar `db`: las APIs esperan a que esté `healthy`. Ir al paso 4. |

## 2. ¿Por qué se reinicia?

```bash
docker compose logs --tail=50 api-<svc>
```

| Mensaje en el log | Causa probable | Acción |
|---|---|---|
| `Access denied for user` | El `.env` no coincide con el de `db`, o la base se inicializó con otra contraseña. | Comparar `db/.env` con `api-<svc>/.env`. Si se cambió la contraseña después del primer arranque, hace falta `docker compose down -v` (**borra los datos**). |
| `Unknown database 'db_<svc>'` | `00-databases.sh` no corrió: el volumen ya existía o el script tenía CRLF. | `docker compose logs db`. Si aparece `bad interpreter`, el script tiene CRLF ([ERRORES.md](../../ERRORES.md), error 30). |
| `Read-only file system` | Falta un `tmpfs` para una ruta en la que la API escribe. | Agregar el `tmpfs` en el compose con el dueño correcto ([ERRORES.md](../../ERRORES.md), errores 44 y 45). |
| Variables vacías o con `\r` | El `.env` se creó en Windows con CRLF. | `sed -i 's/\r$//' api-*/.env db/.env` y después `docker compose up -d`. |

## 3. Está `Up`: ¿responde dentro de la red?

```bash
# Desde el contenedor web, que tiene wget (busybox) y está en la misma red
docker compose exec web wget -qO- http://api-<svc>:8080/<svc>
```

- **Responde JSON:** la API anda y el problema está en NGINX. Revisar el `location` y el nombre en `nginx.conf`. NGINX resuelve por **nombre de servicio** del compose (`api-clientes`), no por `container_name` (`api_clientes`).
- **`Connection refused`:** la API todavía arranca (`api-facturas` tarda más por la JVM) o escucha en otro puerto. Esperar 30 segundos y repetir.
- **`bad address`:** el servicio no está en la red `fintech_net`.

## 4. ¿La base está sana?

```bash
docker compose ps db
docker compose logs --tail=30 db
```

Si `db` no llega a `healthy`, ninguna API arranca: arreglar `db` primero.

## 5. Si nada de lo anterior lo resuelve

```bash
docker compose up -d --force-recreate api-<svc>
```

Si sigue fallando, guardar `docker compose logs --tail=200 > incidente.log`, avisar al equipo con el log adjunto y, si el problema llegó con un deploy nuevo, volver a desplegar el SHA anterior.

## Para descartar

- **`429 Too Many Requests` en lugar de `502`:** es el límite de 10 peticiones por segundo por IP de NGINX, no una caída.
- **Error de certificado en el navegador:** el certificado es autofirmado. Es esperado y no es la causa de un `502`.
