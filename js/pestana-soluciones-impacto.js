/* ============================================================
   CLINICAL HUB · PESTAÑA SOLUCIONES (Tablero | Impacto)
   Lo que vamos a cambiar y si funcionó, en un solo lugar, con dos
   subpestañas del mismo peso (igual que Feedback: Inbox | Métricas):

   TABLERO   Las soluciones con su estado, indicador y personas
             (pestana-soluciones.js).
   IMPACTO   Qué parte de las críticas es de cada indicador y cómo
             cambia después de cada solución (pestana-impacto.js).

   Esta pestaña solo pone el título, el botón Actualizar y las
   subpestañas; cada subpestaña se pinta dentro de #sub-vista.
   ============================================================ */
import { $, estado } from "./nucleo.js";
import * as tablero from "./pestana-soluciones.js";
import * as impacto from "./pestana-impacto.js";

const SUBS = {
  tablero: { modulo: tablero, etiqueta: "Lo que vamos a cambiar",
    texto: "Cambia el estado, desvincula temas o críticas globales y asigna quién la hace." },
  impacto: { modulo: impacto, etiqueta: "Lo que cambió después de cada solución",
    texto: "Qué parte de las críticas que llegan es de cada indicador, y cómo cambia después de cada solución." }
};
let sub = "tablero";

export async function render(){
  /* Si se llegó desde otra pestaña para resaltar una solución, va al tablero */
  if (estado.foco) sub = "tablero";
  $("#vista").innerHTML = `
<div class="cabecera cabecera-compacta">
  <div>
    <div class="mast"><span class="etiqueta" id="mi-etiqueta"></span><h1>Soluciones</h1></div>
    <p id="mi-texto"></p>
  </div>
  <button class="boton-recargar" id="btn-recargar" data-tip="Actualizar" aria-label="Actualizar">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 13A8.5 8.5 0 1 1 18 6.6L20.5 9"/><path d="M20.5 4v5h-5"/></svg>
  </button>
</div>

<div class="subpestanas con-goma" id="subpestanas" role="tablist" aria-label="Secciones de soluciones">
  <span class="goma" aria-hidden="true"></span>
  <button class="subpestana" role="tab" data-sub="tablero" aria-selected="false" aria-controls="sub-vista">Tablero</button>
  <button class="subpestana" role="tab" data-sub="impacto" aria-selected="false" aria-controls="sub-vista">Impacto</button>
</div>

<div id="sub-vista" role="tabpanel"><p class="vacio">Cargando…</p></div>`;

  $("#subpestanas").addEventListener("click", e => {
    const b = e.target.closest("button[data-sub]");
    if (!b || b.dataset.sub === sub) return;
    abrir(b.dataset.sub);
  });
  /* El ↻ gira mientras recarga la subpestaña abierta */
  $("#btn-recargar").addEventListener("click", async () => {
    const b = $("#btn-recargar");
    if (b.classList.contains("girando")) return;
    b.classList.add("girando");
    try { await SUBS[sub].modulo.recargar(); } finally { b.classList.remove("girando"); }
  });
  if (window.ResizeObserver){
    const vigia = new ResizeObserver(() => moverGoma());
    document.querySelectorAll("#subpestanas .subpestana").forEach(b => vigia.observe(b));
  }
  await abrir(sub);
}

async function abrir(id){
  sub = id;
  document.querySelectorAll("#subpestanas .subpestana").forEach(b =>
    b.setAttribute("aria-selected", String(b.dataset.sub === sub)));
  $("#mi-etiqueta").textContent = SUBS[sub].etiqueta;
  $("#mi-texto").textContent = SUBS[sub].texto;
  moverGoma();
  await SUBS[sub].modulo.render($("#sub-vista"));
}

/* La pastilla lima (.goma) viaja a la subpestaña elegida, como en Feedback */
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
