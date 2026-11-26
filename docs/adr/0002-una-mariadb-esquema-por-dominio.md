# ADR-0002: Una sola MariaDB con un esquema por dominio

- **Estado:** aceptada
- **Fecha:** 2026-09

## Contexto

Cada una de las 5 APIs necesita su propia base: clientes, pagos, facturas, transacciones y tarjetas. Todo corre en una sola `t3.medium` (2 vCPU y 4 GiB de RAM), compartida con 7 contenedores.

## Alternativas consideradas

| Alternativa | Por qué se descartó |
|---|---|
| Un contenedor de base por API | Cinco motores de MariaDB con su propio buffer pool no entran en 4 GiB junto con la JVM de `api-facturas`. También serían cinco volúmenes y cinco healthchecks. |
| Un usuario de base por API | Aísla mejor, pero suma cinco credenciales para cargar, proteger y rotar en el pipeline. La base no publica puertos y solo se alcanza desde la red interna. |
| Base gestionada (RDS) | Es lo correcto para producción. El sandbox de AWS Academy se borra al cerrar la sesión, y el objetivo del proyecto era el ciclo de contenedores y el pipeline. |

## Decisión

- Una instancia de MariaDB (`mariadb:11.8-ubi9`) con 5 esquemas: `db_clientes`, `db_pagos`, `db_facturas`, `db_transacciones` y `db_tarjetas`.
- `db/init-scripts/00-databases.sh` crea los esquemas y le da permisos al usuario de aplicación. Ninguna API usa `root`.
- Las 5 APIs esperan a que `db` esté `service_healthy` antes de arrancar.

## Consecuencias

- ➕ Entra con holgura en los límites de recursos de una `t3.medium`.
- ➕ Cada dominio tiene sus datos separados lógicamente. Pasar a bases separadas solo requiere cambiar `DB_HOST`.
- ➖ La base vive en la misma EC2 y no tiene backups: si se pierde la instancia, se pierden los datos. Es la primera mejora pendiente para producción.
- ➖ Los scripts de inicio solo corren con el volumen vacío. Para re-inicializar hay que hacer `docker compose down -v` (ver [ERRORES.md](../../ERRORES.md), errores 20 y 30).
