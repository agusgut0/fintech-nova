# Postmortem: `image-scan` fallaba "a veces" con `x509`, y el primer arreglo no era el arreglo

- **Fecha:** 2026-11 (en dos episodios)
- **Impacto:** pipelines bloqueados en `security`: sin `publish` no había deploy. No llegó ninguna imagen sin escanear a producción, porque el control falló cerrado.
- **Formato:** sin culpables (*blameless*).

## Qué pasó

**Episodio 1.** En 3 de los 7 jobs de `image-scan`, Trivy terminó con `x509: certificate signed by unknown authority` al descargar la imagen del registry interno. Los otros 4 jobs de la misma corrida pasaron.

**Episodio 2.** Días después, `image-scan` de `api-pagos` falló **siempre**, con el mismo error, mientras las otras 6 imágenes pasaban. El reintento automático no lo resolvía.

## Diagnóstico

| Hipótesis | Cómo se verificó | Resultado |
|---|---|---|
| Certificado del registry vencido | Intentamos obtenerlo con `openssl s_client` desde nuestras PCs. | No se pudo: el host solo se resuelve dentro de la red de la facultad. |
| Falla intermitente del registry | Cada job descargaba la imagen 3 veces (reporte, tabla y corte). Bajamos a una sola descarga. | El error **dejó de aparecer**, y se dio por resuelto. ❌ Era una conclusión equivocada. |
| Trivy no descarga del registry, sino que lee la imagen del Docker del runner | En el log de los jobs que pasaban figuraba `docker error: ... No such image`. Es una respuesta del Docker: el socket estaba montado. | ✅ **Causa raíz.** |

**Causa raíz:** Trivy busca la imagen en varias fuentes, en orden. Los jobs que pasaban la encontraban en el Docker del runner, donde `build-image` la había dejado. Los que fallaban no la encontraban ahí e iban al registry, y esa descarga directa **fallaba siempre**, porque el certificado de la facultad no está en el almacén de confianza de Trivy. La "intermitencia" dependía de si la imagen seguía en caché en el runner.

## Causas que contribuyeron

- El error decía `x509` y orientaba a buscar en el certificado, no en **de dónde** se estaba leyendo la imagen.
- El primer cambio coincidió con una corrida en la que todas las imágenes estaban en caché. Fue un falso positivo de "resuelto".

## Qué salió bien

- **Nunca se desactivó la verificación TLS** (`TRIVY_INSECURE`), aunque era el atajo obvio.
- El gate falló cerrado: sin escaneo no hubo publicación.
- Cada intento quedó registrado en [ERRORES.md](../../ERRORES.md) (errores 33 y 42). Eso permitió unir los dos episodios.

## Solución

`image-scan` hace `docker login` y `docker pull` con el Docker del runner, que sí confía en el certificado porque `build-image` sube por él. Después ejecuta `trivy image --image-src docker`, que solo lee de ahí. Un `trap` hace `docker logout` y borra la imagen aunque el escaneo falle.

## Lecciones

- **"Intermitente" suele significar "depende de un estado que no estoy mirando".** Antes de dar algo por resuelto, conviene reproducir la falla a propósito.
- Fijar la fuente de datos de una herramienta (`--image-src docker`) hace el comportamiento determinista.
