# ADR-0003: Registry interno como cuarentena y Docker Hub como registry de producción

- **Estado:** aceptada
- **Fecha:** 2026-11

## Contexto

El pipeline corre en el GitLab de la facultad, que tiene su propio Container Registry. El plan original era que la EC2 descargara las imágenes de ese registry. Al preparar el despliegue vimos que su nombre no se resuelve desde fuera de la red de la facultad: `nslookup` contra un DNS público devuelve `Non-existent domain`. Desde AWS la EC2 no podía hacer `docker pull` con ninguna credencial ([ERRORES.md](../../ERRORES.md), error 39).

## Alternativas consideradas

| Alternativa | Por qué se descartó |
|---|---|
| Desplegar en un servidor de la facultad en lugar de AWS | Resolvía el acceso, pero perdía el objetivo de desplegar en la nube. |
| Publicar todo directamente en Docker Hub | Una imagen con vulnerabilidades quedaría pública antes de escanearla. |
| Amazon ECR | Las credenciales del sandbox duran una sesión. Habría que recrear el repositorio y reconfigurar el pipeline en cada sesión. |

## Decisión

Dos registries con roles distintos:

1. `build-image` sube cada imagen al registry interno como `<svc>:<SHA>-candidate`. Es la **cuarentena**.
2. `image-scan` la escanea con Trivy.
3. Solo si pasa, `publish-image` la re-etiqueta como `<svc>:<SHA>` y, en `main`, la sube a Docker Hub.
4. La EC2 descarga de Docker Hub con un token **de solo lectura y con vencimiento**. El `trap` del deploy hace `docker logout` aunque el `pull` falle.

## Consecuencias

- ➕ Una imagen que no pasa los controles nunca sale de la red interna.
- ➕ La imagen desplegada es exactamente la escaneada: el digest (`sha256:40a3788d…`) es el mismo en los dos registries.
- ➕ El tag es el SHA del commit, nunca `latest`. Lo que corre en producción se puede rastrear hasta su commit y volver atrás es redesplegar un SHA anterior.
- ➖ Hay dos registries y dos credenciales que mantener.
- ➖ Docker Hub es público. Para código propietario haría falta un registry privado accesible desde la nube, como ECR o GHCR privado.
