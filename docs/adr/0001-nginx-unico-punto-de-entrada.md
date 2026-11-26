# ADR-0001: NGINX como único punto de entrada, por HTTPS en el puerto 8443

- **Estado:** aceptada
- **Fecha:** 2026-09 (Parte 1); se endureció en 2026-11 (Parte 2)

## Contexto

La plataforma tiene 5 APIs escritas en 5 lenguajes y un frontend. Si cada API publica su propio puerto, hay que abrir 6 puertos en el Security Group, configurar TLS en 5 frameworks distintos y exponer servidores que no están pensados para recibir tráfico de internet (por ejemplo, el servidor de desarrollo de Flask).

## Alternativas consideradas

| Alternativa | Por qué se descartó |
|---|---|
| Publicar un puerto por API | Seis puertos abiertos y TLS configurado seis veces. Además deja expuesto el servidor de desarrollo de Flask. |
| Traefik | Descubre los servicios con etiquetas de Docker, pero nadie del equipo lo había usado y no hacía falta ruteo dinámico. |
| HAProxy | Balancea muy bien, pero no sirve los archivos estáticos del frontend. Habría hecho falta un segundo contenedor. |

## Decisión

Un solo contenedor `web` con NGINX (`nginx:1.25-alpine`, `USER nginx`):

- Sirve el frontend y rutea `/api/<svc>` a `http://api-<svc>:8080/<svc>` por la red interna `fintech_net`.
- Escucha en `8443`, un puerto no privilegiado, así que no necesita root ni la capacidad `NET_BIND_SERVICE`.
- Resuelve los upstreams con `resolver 127.0.0.11` y una variable `$upstream`. Si una API se reinicia y cambia de IP, NGINX la vuelve a encontrar sin reiniciarse.
- El certificado se genera en el host durante el deploy y se monta como solo lectura. Nunca entra en la imagen.

## Consecuencias

- ➕ Una sola regla de entrada pública en el Security Group (`8443`). Ni las APIs ni la base publican puertos, y `compose-validate` lo exige en cada pipeline.
- ➕ Un solo lugar para el hardening del borde: TLS 1.2/1.3, headers de seguridad y 10 peticiones por segundo por IP (devuelve `429` al superarlo).
- ➖ Cada API nueva obliga a editar `nginx.conf` a mano.
- ➖ Es un punto único de falla. Si `web` cae, cae todo, aunque `restart: always` lo levanta solo.
- 🔁 En Kubernetes este rol lo cumpliría un Ingress o la Gateway API.
