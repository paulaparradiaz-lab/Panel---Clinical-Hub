# Clinical Hub · Panel

Backoffice de **Sustancia Pro** para leer el feedback de los médicos sobre las guías
clínicas, convertirlo en decisiones y llevar la cuenta de lo que se va arreglando.

En vivo: https://admn-clinicalhub.sustanciapro.com

---

## Qué hace

El panel sigue una cadena de cuatro pasos:

1. **Entra el feedback** (web y WhatsApp) a la tabla `feedback`, alimentada desde n8n.
2. **Alguien lo clasifica**: a cada reseña le pone una categoría; a cada búsqueda sin
resultado le pone un tema.
3. **Se agrupan los casos parecidos** en una solución: una decisión concreta.
4. **La solución se parte en tareas** con responsable, prioridad y estado.

El feedback llega de dos maneras muy distintas, así que hay una pestaña para cada una:

- **Reseñas** — las opiniones con estrellas: qué tan bien califican las guías.
- **Temas pedidos** — las búsquedas que no encontraron nada: qué falta.

La pestaña **Soluciones** es la "hoja de vida" de la plataforma: qué cambiamos, por qué
feedback lo cambiamos, quién lo hizo y qué pasó con las notas después.

Ojo con el origen: las filas cuyo `origen` empieza por `buscador-` no son opiniones
sino búsquedas sin resultado y no traen estrellas. Por eso viven en Temas pedidos y
no ensucian el promedio de Reseñas.

---

## Inbox y Ranking

Reseñas y Temas pedidos están armadas igual, con dos subpestañas:

- **Inbox** — solo lo que falta clasificar, desde siempre y sin filtros de periodo.
El globo de la subpestaña dice cuántas quedan. Se puede trabajar de una en una o en
lote, y hay buscador para encontrar las parecidas y clasificarlas juntas.
- **Ranking** — el histórico completo, con los filtros de siempre, los KPIs y las
gráficas.

Lo que saca algo del inbox es haberlo clasificado:

| Pestaña | Sale del inbox cuando… | Qué entra al inbox |
| --- | --- | --- |
| Reseñas | se le pone una **categoría** (o se descarta como *Sin sentido*) | reseñas con comentario y sin categoría |
| Temas pedidos | se le asigna un **tema** (o se descarta) | búsquedas que todavía no tienen tema |

Las reseñas sin comentario no entran al inbox —no hay nada que categorizar— pero sí
cuentan para el promedio y para el reparto de estrellas.

Los filtros del ranking de Reseñas son **Fuente** (web o WhatsApp), **Periodo**,
**Reseñas** (estrellas) y una fila de **Filtros** con foco, categoría, país y texto
libre. Todos se combinan y los que estén puestos aparecen en la barra *Filtrando
por*, con una ficha por filtro y un botón para quitarlos. El inbox en cambio no se
filtra: muestra siempre todo lo pendiente.

---

## Categorías de reseñas

El catálogo vive en la tabla `etiquetas` y se administra desde el panel, en la caja
**Tipo de problema** del ranking:

- **Nueva categoría** crea una. La `clave` se deriva del nombre y, si ya existía
archivada, se reactiva en vez de duplicarse.
- El **lápiz** cambia el nombre y la descripción. La `clave` nunca se toca, porque es
a lo que apuntan las reseñas ya categorizadas.
- La **caneca** borra de verdad, pero primero obliga a decidir a dónde se mueven las
reseñas que la tenían: a otra categoría, a una nueva, o de vuelta al inbox. Así
ninguna reseña queda huérfana.

También se puede crear una categoría al vuelo desde la ventana de Categorizar, sin
salir del inbox.

Clasificar solo escribe en `feedback_etiquetas` y `feedback_triage`. El texto original
del médico vive en `feedback` y no se edita nunca.

---

## Cómo está organizado

Sitio estático, sin build ni dependencias que compilar. Módulos ES nativos y
`supabase-js` desde CDN.

| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | Todo el HTML base y **todo el CSS** (tokens, componentes, responsive). |
| `js/nucleo.js` | Cliente de Supabase, estado compartido, catálogos, ventanas modales y utilidades (fechas, números, escapado). |
| `js/panel.js` | Acceso con 2FA, barra superior y carga de cada pestaña como módulo. |
| `js/resenas.js` | Pestaña Reseñas: subpestañas Inbox y Ranking, filtros, KPIs, gráficas y lista. |
| `js/triage.js` | Acciones sobre reseñas: categorizar (una o en lote), descartar, marcar revisado y crear la solución. |
| `js/categorias.js` | Crear, renombrar y borrar categorías de reseñas. |
| `js/temas.js` | Pestaña Temas pedidos: subpestañas Inbox y Ranking de temas. |
| `js/temas-clasificar.js` | Ventanas para asignar tema a una petición y para renombrar o borrar temas. |
| `js/temas-triage.js` | Acciones por tema: crear la solución y marcar revisado. |
| `js/soluciones.js` | Pestaña Soluciones: hoja de vida, tareas e impacto. |
| `CNAME` | Dominio propio de GitHub Pages. |

Cada archivo de pestaña exporta una función `render()` que pinta dentro de `#vista`.
Añadir una pestaña nueva es crear un módulo con ese contrato y registrarlo en
`panel.js`. Para saltar de una pestaña a otra desde dentro se dispara el evento
`ch-ir` con la sección y, si hace falta, el id que hay que resaltar.

---

## Qué usa de Supabase

Proyecto: **Clinical hub - Backoffice**.

**Tablas**

| Tabla | Qué guarda |
| --- | --- |
| `feedback` | Las respuestas de los médicos. La llena n8n. |
| `feedback_triage` | Si un comentario ya fue revisado y por quién. |
| `etiquetas` | Catálogo de categorías de reseñas. Se administra desde el panel. |
| `feedback_etiquetas` | Qué categoría tiene cada reseña. |
| `tema_canonico` | Los temas pedidos, ya con nombre. |
| `tema_peticion` | Qué búsqueda quedó dentro de cada tema. |
| `acciones` | Las soluciones decididas. |
| `accion_feedback` | Qué feedback originó cada solución. |
| `tareas` | Las tareas de cada solución, con responsable y estado. |
| `equipo` | Las personas que pueden ser responsables. |

**Vistas que lee el panel**

- `v_resenas` — las opiniones con estrellas, su triage, sus categorías y si ya tienen solución.
- `v_temas_pedidos` — las búsquedas sin resultado con su tema y su conteo.
- `v_hoja_de_vida` — las soluciones con su contexto.
- `v_tareas_detalle` — las tareas con su responsable y su solución.

**Seguridad**

- Todas las tablas tienen RLS activo.
- Política permisiva para el rol `authenticated` y política **restrictiva** que exige
`aal2`: sin segundo factor no se ve nada.
- Las vistas se crearon con `security_invoker = true`, así que respetan el RLS de
quien consulta en vez de saltárselo.
- No se concede `delete` sobre `acciones` ni `tareas`: para descartar algo se usa el
estado `descartada`, de modo que la historia nunca se pierde.
- Sí hay `delete` en `etiquetas` y en `tema_canonico`, porque esos dos catálogos se
administran desde el panel. Antes de borrar, el panel siempre reubica lo que
apuntaba a lo borrado. El feedback del médico nunca se borra.

---

## Despliegue

GitHub Pages desde la rama `main`. Cada commit dispara el workflow
*pages-build-deployment*; tarda entre uno y cinco minutos. No hay que compilar nada.

Después de un despliegue conviene recargar con **Cmd+Shift+R** para que el navegador
suelte la versión cacheada de los módulos.

---

## Convenciones

- Nombres, comentarios y textos de interfaz en español.
- Cada módulo está dividido en secciones numeradas con un comentario de cabecera.
- El CSS vive únicamente en `index.html`; los módulos no inyectan estilos.
- Las animaciones respetan `prefers-reduced-motion`.
- El correo y el teléfono de quien deja feedback no se muestran por defecto.

---

## Pendientes conocidos

- La clasificación es manual en las dos pestañas: el panel ayuda a buscar, agrupar y
trabajar en lote, pero no hay clasificación automática todavía.
- `js/feedback.js` es de la versión anterior, cuando Reseñas y Temas pedidos eran una
sola pestaña llamada Feedback. Ya nadie lo importa: se puede borrar junto con la
vista `v_feedback_detalle` si nada más la consulta.
- Las pestañas **Ventas**, **Contenido** y **Administrativo** están en la barra pero
todavía sin conectar.
