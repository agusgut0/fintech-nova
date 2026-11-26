# 🎤 Sprint Demo — FinTech Nova (Grupo 6)

Material de apoyo para la presentación de la Parte 2. **Duración máxima: 10 minutos.**

Se presenta en este orden: el repositorio (este archivo y el [README](./README.md)), el pipeline en GitLab y la aplicación funcionando en AWS. Si el sandbox no está disponible, se usan las capturas del [informe del TP §8](./docs/informe-tp.md#-8-evidencia).

Las slides están en [presentacion/demo.html](./presentacion/demo.html): se abren con doble clic en el navegador, sin internet. Se avanza con las flechas o con clic; **N** muestra las notas del orador y **T** inicia el cronómetro.

---

## Guion

| Tiempo | Bloque | Quién | Qué se muestra |
|---|---|---|---|
| 0:00 – 1:00 | Qué construimos | Hernán (validación, mejoras y demo) | README, diagrama de entrega |
| 1:00 – 3:00 | Del commit a producción | Ezequiel (build y registry) | Pipeline en GitLab |
| 3:00 – 5:00 | Seguridad en el pipeline | Fabrizio (seguridad) | Jobs de seguridad y un reporte |
| 5:00 – 7:00 | Despliegue y verificación en AWS | Agustín (despliegue en AWS) | `infra-apply`, `verify-deployment`, la aplicación |
| 7:00 – 8:00 | El error más interesante | Agustín | Diagrama de entrega |
| 8:00 – 9:30 | Riesgos, caídas y mejoras | Hernán | README §6 y §9 |
| 9:30 – 10:00 | Cierre | Hernán | — |

### 1. Qué construimos (1 min)

- En la Parte 1 desplegar dependía de una persona: construía las imágenes en su computadora y ejecutaba un script contra el servidor.
- Ahora cada cambio aprobado en la rama principal pasa por un pipeline que **valida, construye, controla la seguridad, publica, crea la infraestructura, despliega y verifica**, sin pasos manuales salvo un botón.
- El valor para FinTech Nova: nada llega a producción sin control, cualquiera del equipo puede desplegar y cada versión se rastrea hasta su commit.

### 2. Del commit a producción (2 min)

- Recorrer el pipeline en GitLab de izquierda a derecha, mencionando cada etapa en una frase.
- **Paralelismo:** las siete imágenes se construyen, se escanean y se publican al mismo tiempo. Los controles que solo leen el código empiezan con el pipeline, sin esperar al build.
- **Versionado:** cada imagen lleva el identificador del commit. Siempre sabemos qué código está en producción y podemos volver a una versión anterior.
- **Dos registries:** las imágenes se escanean en el registry interno de la facultad y solo las aprobadas se publican para producción.

### 3. Seguridad en el pipeline (2 min)

- Presentar cada herramienta con su rol en una frase: secretos en el historial, análisis del código, buenas prácticas de los Dockerfiles, vulnerabilidades de las imágenes y de las dependencias, y validación de la configuración.
- **Qué encontramos:** ninguna contraseña expuesta en los 45 commits de todas las ramas. En la primera corrida, 5 de las 7 imágenes tenían vulnerabilidades críticas: 15 en total, que estaban en producción desde la Parte 1 sin que lo supiéramos. El pipeline se detuvo antes de publicarlas. Corregimos 13 y aceptamos 2 como riesgo.
- **Política:** se corta lo que tiene solución hoy (un secreto expuesto o una vulnerabilidad crítica con parche). Lo que no tiene parche se analiza, se registra con su justificación y tiene fecha de revisión. Los dos riesgos aceptados (base de datos y API de facturas) quedaron documentados, con revisión el 15 de diciembre, y ninguno es explotable en nuestro uso.
- **En ejecución:** los contenedores no tienen permisos del sistema ni pueden modificar sus propios archivos. La única puerta de entrada exige cifrado moderno y limita las peticiones por usuario. El pipeline rechaza cualquier cambio que quite estas protecciones.
- Mostrar un reporte descargable de un escaneo.

### 4. Despliegue y verificación en AWS (2 min)

- El sandbox borra todo en cada sesión. Por eso **la infraestructura se crea desde el pipeline**: al empezar una sesión solo se actualizan tres credenciales y se ejecuta un job.
- La instancia queda accesible para administración **solo desde el runner**, y antes de conectarse el pipeline verifica la identidad del servidor.
- Las credenciales nunca están en el repositorio. El servidor descarga las imágenes con una credencial de solo lectura que no queda guardada.
- **Verificación:** el pipeline comprueba que la web y las cinco APIs respondan y que el puerto sin cifrar esté cerrado. Si algo falla, el pipeline queda en rojo.
- Mostrar la aplicación funcionando.

### 5. El error más interesante (1 min)

**El servidor de AWS no podía descargar nuestras imágenes.**

- El registry de la facultad solo existe dentro de la red de la facultad, así que la instancia en AWS no lo alcanza.
- Lo resolvimos convirtiéndolo en una ventaja: el registry interno quedó como **cuarentena**, donde se construye y se escanea, y solo lo aprobado se publica en un registry externo del que descarga producción.
- Resultado: una imagen con vulnerabilidades nunca sale de la red de la facultad.

### 6. Riesgos, caídas y mejoras (1,5 min)

- **Si falla un servicio:** los contenedores se reinician solos. Si falla un servicio externo (tipo de cambio o geolocalización), la operación sigue y solo falta ese dato.
- **Si se pierde el servidor:** el pipeline lo recrea con la misma configuración, sin pasos manuales.
- **Downtime:** un despliegue reinicia los contenedores y deja unos segundos sin servicio.
- **Costo (estimación conservadora):** una hora sin servicio cuesta unos US$ 2.500. Con el despliegue manual, 3 de cada 10 despliegues fallaban y volver atrás llevaba unas 2 horas: unos US$ 12.000 por mes. Con el pipeline, unos US$ 1.000 por mes. Ahorro: US$ 11.000 por mes, más de US$ 130.000 por año, sin contar una filtración de datos (unos US$ 6 millones en promedio en el sector financiero).
- **Mejoras de la Parte 1 resueltas:** escaneo automático en el pipeline, credenciales fuera de las computadoras del equipo, versiones rastreables por commit e infraestructura reproducible.
- **Qué falta para producción real:** más de una instancia, una base de datos gestionada con backups y monitoreo con alertas.

### 7. Cierre (30 s)

- En una frase: pasamos de un despliegue manual que dependía de una persona a uno automático, controlado y verificable.
- Próximo paso recomendado: alta disponibilidad y backups de la base de datos.

---

## Reglas para la exposición

- ❌ No explicar teoría, no mencionar modificadores de comandos ni versiones de herramientas o imágenes, no nombrar los proveedores de las APIs externas.
- ❌ No recorrer `ERRORES.md`: se cuenta un solo error.
- ✅ Hablar de impacto y decisiones: qué problema resuelve y por qué lo hicimos así.
- ✅ Lenguaje profesional.

## Checklist antes de la demo

- [ ] Ensayo cronometrado completo (menos de 10 minutos).
- [ ] Sesión del sandbox iniciada, credenciales actualizadas y `infra-apply` ejecutado al menos 15 minutos antes, con el botón del **job**, no el de la etapa (ese también ejecuta `infra-destroy`).
- [ ] Pipeline completo de `main` en verde, abierto en una pestaña.
- [ ] Aplicación abierta en otra pestaña, con el certificado ya aceptado.
- [ ] Un reporte de escaneo descargado, por si GitLab responde lento.
- [ ] Capturas del README a mano como respaldo.
- [ ] Todos los integrantes repasaron el pipeline completo: cualquiera puede ser consultado en el feedback.

## Preguntas probables en el feedback

| Pregunta | Dónde está la respuesta |
|---|---|
| ¿Por qué el deploy es manual y no automático? | [PIPELINE.md](./PIPELINE.md) (infra): el sandbox está apagado casi siempre. |
| ¿Qué pasa si aparece una vulnerabilidad crítica sin parche? | [informe del TP §9](./docs/informe-tp.md#-9-para-pensar--responder), pregunta 2. |
| ¿Cómo se protegen los secretos? | [SEGURIDAD.md §5](./SEGURIDAD.md#5-gestión-de-secretos-en-gitlab-y-autenticación-del-despliegue). |
| ¿Por qué Docker Hub además del registry del labsys? | [ERRORES.md](./ERRORES.md), error 39. |
| ¿Qué runner usan y por qué? | [informe del TP §3.C](./docs/informe-tp.md#c-decisiones-clave). |
| ¿Qué mejoras de la Parte 1 quedaron pendientes o descartadas? | [informe del TP §6](./docs/informe-tp.md#-6-mejoras-respecto-de-la-parte-1). |
