/* ============================================================
   CLINICAL HUB · PESTAÑA FEEDBACK
   Todo lo de los médicos en un solo lugar, con dos subpestañas
   del mismo peso (igual que tenía la Reseñas vieja):

   INBOX     Lo que la IA no pudo clasificar con seguridad; aquí lo
             clasificas tú (inbox.js). El globito rojo dice cuántas
             quedan, y se repite en el ícono de Feedback del menú.
   MÉTRICAS  El resultado: estrellas por mes, ranking de temas
             pedidos y ranking de críticas globales (metricas.js).

   Esta pestaña solo pone el título, el botón Actualizar y las
   subpestañas; cada subpestaña se pinta dentro de #sub-vista.
   ============================================================ */
import { sb, $ } from "./nucleo.js";
import * as inbox from "./inbox.js";
import * as metricas from "./metricas.js";

const SUBS = { inbox: inbox, metricas: metricas };
let sub = "inbox";

export async function render(){
  $("#vista").innerHTML = `
<div class="cabecera cabecera-compacta">
  <div>
    <div class="mast"><span class="etiqueta">Lo que dicen los médicos</span><h1>Feedback</h1></div>
    <p>Clasifica lo que la IA no tuvo claro y mira cómo va todo.</p>
  </div>
  <button class="boton-recargar" id="btn-recargar" data-tip="Actualizar" aria-label="Actualizar">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 13A8.5 8.5 0 1 1 18 6.6L20.5 9"/><path d="M20.5 4v5h-5"/></svg>
  </button>
</div>

<div class="subpestanas con-goma" id="subpestanas" role="tablist" aria-label="Secciones de feedback">
  <span class="goma" aria-hidden="true"></span>
  <button class="subpestana" role="tab" data-sub="inbox" id="sub-inbox"
          aria-selected="false" aria-controls="sub-vista">Inbox
    <span class="globo" id="globo-inbox" hidden>0</span></button>
  <button class="subpestana" role="tab" data-sub="metricas" id="sub-metricas"
          aria-selected="false" aria-controls="sub-vista">Métricas</button>
</div>

<div id="sub-vista" role="tabpanel"><p class="vacio">Cargando…</p></div>`;

  $("#subpestanas").addEventListener("click", e => {
    const b = e.target.closest("button[data-sub]");
    if (!b || b.dataset.sub === sub) return;
    abrir(b.dataset.sub);
  });
  /* El ↻ gira mientras recarga, para que se vea que está trabajando */
  $("#btn-recargar").addEventListener("click", async () => {
    const b = $("#btn-recargar");
    if (b.classList.contains("girando")) return;
    b.classList.add("girando");
    try { await SUBS[sub].recargar(); } finally { b.classList.remove("girando"); }
  });

  /* La goma se vuelve a medir si las subpestañas cambian de tamaño
     (aparece el número rojo, termina de cargar la tipografía…). */
  if (window.ResizeObserver){
    const vigia = new ResizeObserver(() => moverGoma());
    document.querySelectorAll("#subpestanas .subpestana").forEach(b => vigia.observe(b));
  }

  /* El Inbox ya trae los pendientes y pinta el globo al cargar: el conteo
     aparte solo hace falta si se abre en Métricas */
  if (sub !== "inbox") contarPendientes();
  await abrir(sub);
}

async function abrir(id){
  sub = id;
  document.querySelectorAll("#subpestanas .subpestana").forEach(b =>
    b.setAttribute("aria-selected", String(b.dataset.sub === sub)));
  moverGoma();
  await SUBS[sub].render($("#sub-vista"));
}

/* ============================================================
   Goma de las subpestañas
   La pastilla lima (.goma) viaja a la subpestaña elegida con la curva
   elástica del menú, igual que en "¿Qué es?" de Clasificar.
   ============================================================ */
function moverGoma(){
  const caja = $("#subpestanas");
  const goma = caja && caja.querySelector(".goma");
  const activa = caja && caja.querySelector('.subpestana[aria-selected="true"]');
  if (!goma || !activa) return;
  goma.style.left = activa.offsetLeft + "px";
  goma.style.width = activa.offsetWidth + "px";
  goma.style.opacity = "1";
}

window.addEventListener("resize", moverGoma);

/* ============================================================
   Globito de la subpestaña Inbox
   Arranca con un conteo propio (por si se abre en Métricas) y luego
   lo actualiza el Inbox cada vez que se repinta (evento ch-pendientes).
   ============================================================ */
async function contarPendientes(){
  const { count } = await sb.from("v_ia_por_revisar").select("id", { count:"exact", head:true });
  pintarGlobo(count || 0);
}

/* El número va en rojo en la subpestaña Inbox y también en el ícono
   de Feedback del menú, para verlo desde cualquier pestaña. */
function pintarGlobo(n){
  const texto = n > 99 ? "99+" : String(n);
  const g = $("#globo-inbox");
  if (g){
    g.hidden = !n;
    g.textContent = texto;
    moverGoma();   // el número cambia el ancho de "Inbox": la goma se vuelve a medir
  }
  const pestana = document.querySelector('#pestanas .pestana[data-seccion="feedback"]');
  if (!pestana) return;
  let aviso = pestana.querySelector(".aviso-menu");
  if (!aviso){
    aviso = document.createElement("span");
    aviso.className = "aviso-menu";
    pestana.appendChild(aviso);
  }
  aviso.hidden = !n;
  aviso.textContent = texto;
  pestana.setAttribute("aria-label", "Feedback" + (n ? ", " + texto + " por revisar" : ""));
}

document.addEventListener("ch-pendientes", e => pintarGlobo(e.detail || 0));
