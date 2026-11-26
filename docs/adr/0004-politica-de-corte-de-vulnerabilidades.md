# ADR-0004: El pipeline corta solo ante vulnerabilidades críticas que tienen parche

- **Estado:** aceptada
- **Fecha:** 2026-11
- **Próxima revisión de los riesgos aceptados:** 2026-12-15

## Contexto

La primera corrida con Trivy (pipeline #16892) dejó en rojo 5 de las 7 imágenes. Algunas vulnerabilidades críticas tenían parche, pero otras no: una estaba en `gosu`, un binario de la imagen oficial de MariaDB, y la corrección de otra solo existía en un cambio mayor de Spring Boot ([ERRORES.md](../../ERRORES.md), error 31).

Si cortamos ante cualquier `CRITICAL`, un CVE sin parche bloquea todos los deploys, incluidos los que traen otros arreglos de seguridad. Si no cortamos, el control es decorativo.

## Alternativas consideradas

| Alternativa | Por qué se descartó |
|---|---|
| Cortar ante cualquier `HIGH` o `CRITICAL` | Bloquea el pipeline por problemas que no se pueden resolver de nuestro lado. |
| `allow_failure: true` en el escaneo | El pipeline queda en verde aunque haya críticas. Es el anti-patrón clásico: el control informa, pero no protege. |
| `TRIVY_INSECURE` para esquivar el certificado del registry | Desactiva la verificación TLS de la descarga que se está escaneando. |

## Decisión

| Control | Corta el pipeline si… |
|---|---|
| Trivy (imágenes) | Hay una vulnerabilidad `CRITICAL` **con versión corregida** (`--ignore-unfixed`). |
| Gitleaks | Encuentra cualquier secreto en todo el historial. |
| Semgrep | Hay hallazgos de severidad `ERROR`. |
| Hadolint | Hay errores, o el último `USER` de un Dockerfile es root. |
| Trivy fs (dependencias) | No corta. Informa `HIGH` y `CRITICAL`. |

Lo que no se puede corregir se registra como **riesgo aceptado** en `ACCEPTED_CVES`, solo para esa imagen, con la justificación en [SEGURIDAD.md](../../SEGURIDAD.md) y una fecha de revisión.

## Consecuencias

- ➕ El primer escaneo encontró 13 vulnerabilidades críticas que ya estaban en las imágenes de la primera entrega sin que nadie lo supiera. Se corrigieron todas las que tenían parche.
- ➕ Cada excepción tiene dueño, motivo y vencimiento: no es un `ignore` permanente.
- ➖ Con `--ignore-unfixed`, el reporte JSON ya no lista las vulnerabilidades sin parche. Conservarlas exigiría una política Rego.
- ➖ Las excepciones hay que revisarlas a mano en la fecha pactada.
