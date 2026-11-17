# Punto 1 — Pipeline de GitLab CI/CD

El pipeline automatiza la validación, construcción, análisis, publicación y despliegue del stack
de FinTech Nova. Está definido en [`.gitlab-ci.yml`](./.gitlab-ci.yml) y utiliza el
[`docker-compose.yml`](./aplicaciones-contenedores/docker-compose.yml) actualizado para obtener
las imágenes del Container Registry del proyecto.

## Flujo

```mermaid
flowchart LR
    V["validate<br/>YAML y Dockerfiles"] --> B["build<br/>7 imágenes en paralelo"]
    B --> S["security<br/>Trivy por imagen"]
    B --> G["security<br/>Semgrep SAST"]
    S --> P["publish<br/>tags por commit"]
    G --> P
    P --> D["deploy<br/>rama default → EC2"]
    D --> T["verify<br/>HTTPS: web y 5 APIs"]
```

- **validate:** Yamllint revisa el pipeline y Compose; Hadolint revisa los Dockerfiles.
- **build:** construye las siete imágenes (`db`, `api-clientes`, `api-pagos`, `api-facturas`,
  `api-transacciones`, `api-tarjetas` y `web`) en paralelo. Las sube al registry con una etiqueta
  candidata asociada al commit.
- **security:** Semgrep analiza el código fuente y Trivy escanea las imágenes candidatas en
  paralelo. Los reportes JSON de ambos controles quedan disponibles como artifacts por una semana.
- **publish:** si los controles anteriores pasan, etiqueta y publica las imágenes con el SHA
  completo del commit. Así, cada despliegue queda vinculado a una revisión concreta y no depende
  de `latest`. En la rama por defecto, además, sube las imágenes aprobadas a Docker Hub
  (`devopsgrupo6`): la EC2 no puede acceder al registry del labsys, que solo existe dentro de la
  red de la facultad. Las imágenes candidatas nunca salen del registry interno.
- **deploy:** solo se ejecuta en la rama por defecto. Se conecta por SSH a EC2, instala Docker y
  el plugin de Compose si hace falta (en versión fija, `v5.5.1`, verificando su checksum SHA-256
  antes de instalarlo), copia el Compose y los archivos de entorno (quitando los saltos de línea
  CRLF de Windows), inicia sesión en Docker Hub
  con un token de solo lectura, descarga las imágenes y levanta los servicios. El cierre de sesión
  se ejecuta siempre, aunque el despliegue falle, para no dejar la credencial guardada en la EC2.
- **verify:** prueba por HTTPS (`8443`) la web y los endpoints de las cinco APIs. El job falla si
  cualquiera no devuelve HTTP 200, o si el puerto `80` responde (debe estar cerrado). El entorno
  `production` muestra en GitLab (Operate → Environments) el enlace a la aplicación desplegada.
- **runners:** `deploy` y `verify` usan el mismo tag de runner (`runner-without-dind`) que el resto
  del pipeline.

El escaneo de Trivy corta el flujo ante vulnerabilidades **HIGH** o **CRITICAL**. Semgrep también
falla ante los hallazgos que reporta con la configuración automática seleccionada. Un fallo en
validación o seguridad impide que se publiquen las etiquetas finales y que avance el despliegue.

## Configuración necesaria en GitLab

El despliegue requiere un runner con soporte para Docker-in-Docker y conectividad SSH hacia la
instancia EC2. Configurar las siguientes variables de CI/CD como **protegidas** y, para valores
secretos compatibles, **enmascaradas**. Los secretos y archivos `.env` no se guardan en el
repositorio:

| Variable | Tipo / contenido |
|---|---|
| `EC2_HOST` | Dirección IP o hostname actual de la instancia del sandbox. |
| `EC2_SSH_PRIVATE_KEY` | Variable de tipo **File** con la clave SSH privada de EC2. |
| `EC2_KNOWN_HOSTS` | Variable de tipo **File** con la clave pública verificada del host. |
| `DOCKERHUB_USER` | Usuario de la cuenta de Docker Hub del grupo. Visible y protegida. |
| `DOCKERHUB_PUSH_TOKEN` | Token de acceso de Docker Hub con permiso **Read & Write** y vencimiento. Solo lo usa `publish`. Enmascarado, oculto y protegido. |
| `DOCKERHUB_PULL_TOKEN` | Token de acceso de Docker Hub con permiso **Read-only** y vencimiento. Limitado al entorno `production`, así que solo lo recibe `deploy`. Enmascarado, oculto y protegido. |
| `DB_ENV_FILE` | Variable de tipo **File** con la configuración de MariaDB. |
| `API_CLIENTES_ENV_FILE` | Variable de tipo **File** con el entorno de `api-clientes`. |
| `API_PAGOS_ENV_FILE` | Variable de tipo **File** con el entorno de `api-pagos`. |
| `API_FACTURAS_ENV_FILE` | Variable de tipo **File** con el entorno de `api-facturas`. |
| `API_TRANSACCIONES_ENV_FILE` | Variable de tipo **File** con el entorno de `api-transacciones`. |
| `API_TARJETAS_ENV_FILE` | Variable de tipo **File** con el entorno de `api-tarjetas`. |

GitLab provee `CI_REGISTRY`, `CI_PROJECT_PATH`, `CI_REGISTRY_USER` y `CI_REGISTRY_PASSWORD`.
El pipeline forma `REGISTRY_IMAGE` con `CI_REGISTRY` y `CI_PROJECT_PATH` para apuntar al
registry del proyecto, donde se guardan y escanean las imágenes candidatas. La cuenta de Docker
Hub (`DOCKERHUB_NAMESPACE`) está definida en el `.gitlab-ci.yml` porque no es un secreto. Los
tokens de Docker Hub son variables protegidas: solo existen en los pipelines de la rama por
defecto, por eso la publicación en Docker Hub se omite en las demás ramas. Como el sandbox renueva sus recursos y credenciales al
iniciar una sesión, hay que actualizar las variables de EC2 y SSH antes de ejecutar el despliegue.

## Estado

La estructura YAML, la correspondencia de servicios entre Compose y las matrices del pipeline, y
la configuración local de Compose fueron validadas. El pipeline completo todavía debe ejecutarse
en GitLab con el runner, las variables y una instancia activa del sandbox; las imágenes y la
verificación de despliegue dependen de esos recursos.
