# Postmortem: `infra-destroy` borró la EC2 justo después de un despliegue exitoso

- **Fecha:** 2026-11-19
- **Duración:** unos 15 minutos, hasta recrear la infraestructura
- **Impacto:** la aplicación quedó fuera de línea en el entorno de laboratorio. Se perdieron los datos de prueba de la base; no había datos reales.
- **Formato:** sin culpables (*blameless*). Se buscan causas en el sistema, no en personas.

## Qué pasó

En el pipeline #17424 de `main`, `infra-apply`, `deploy` y `verify-deployment` terminaron en verde. Inmediatamente después, `infra-destroy` destruyó los 6 recursos de AWS (`Destroy complete! Resources: 6 destroyed.`), aunque nadie quería borrar la infraestructura.

## Línea de tiempo

| Hora | Evento |
|---|---|
| T+0 | Para desplegar se usa el botón ▶ de la **etapa** `infra`. |
| T+3 min | Corre `infra-apply`: crea el Security Group, el key pair y la EC2. |
| T+8 min | `deploy` levanta los 7 contenedores y `verify-deployment` pasa con 6 × HTTP 200. |
| T+9 min | Corre `infra-destroy` y borra todo. |
| T+10 min | Se detecta que la URL de `production` no responde. |
| T+25 min | Se ejecuta ▶ solo sobre el **job** `infra-apply`. El pipeline recrea todo desde cero y `verify` vuelve a pasar. |

## Causas que contribuyeron

1. **En GitLab, el botón de la etapa ejecuta *todos* los jobs manuales de esa etapa.** `infra-apply` e `infra-destroy` estaban en la misma etapa.
2. **Los dos jobs comparten `resource_group: production`.** Eso es correcto, porque evita que dos operaciones toquen la misma EC2 a la vez. Pero las puso en cola: el destroy esperó a que terminaran `deploy` y `verify` y se ejecutó después.
3. **Nada distinguía la acción destructiva:** `infra-destroy` no tenía ninguna confirmación adicional.
4. **El procedimiento decía "ejecutar `infra-apply`"** sin aclarar cuál de los dos botones usar.

## Qué salió bien

- `verify-deployment` había dejado evidencia de que la versión funcionaba: el problema no era el código.
- Terraform recreó los 6 recursos sin pasos manuales. Con eso quedó probado que la infraestructura se puede reconstruir de punta a punta.
- La identidad SSH de la nueva instancia se obtuvo de la API de AWS y se verificó. No hizo falta aceptar una clave a ciegas.

## Acciones

- [x] Documentar en [AWS_EC2.md](../../AWS_EC2.md) que se ejecuta el **job** `infra-apply`, no la etapa.
- [x] Registrar el error en [ERRORES.md](../../ERRORES.md) (error 46).
- [ ] Mover `infra-destroy` a una etapa propia (`teardown`) que no se pueda disparar junto con `infra-apply`.
- [ ] Pedir una variable de confirmación para el destroy (por ejemplo, `CONFIRM_DESTROY=yes`) o limitarlo a ciertos roles con un entorno protegido.

## Lección

Un pipeline que puede destruir infraestructura necesita que la acción destructiva sea **difícil de disparar por accidente**, no solo manual.
