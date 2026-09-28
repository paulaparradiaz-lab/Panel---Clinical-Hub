/* ============================================================
   CLINICAL HUB · PESTAÑA DINERO (Ingresos | Egresos)
   Dos subpestañas del mismo peso, como Feedback y Mejoras:

   INGRESOS  Lo que llega de Hotmart: ventas por día (calendario y
             devoluciones), países, formas de pago (ventas-resumen.js);
             MRR, nuevos contra bajas, cohortes y atrasados
             (ventas-suscripciones.js). Cálculos en ventas-calculos.js.
   EGRESOS   Los gastos que ustedes anotan a mano, con su soporte
             (ventas-egresos.js; tabla egresos, sql/egresos.sql).

   Lee hotmart_eventos (lo llena n8n desde Hotmart; historial cargado
   el 28-sep-2026). Ingresos en US$ netos; egresos en pesos (con su TRM).
   ============================================================ */
import { sb, $, escapar } from "./nucleo.js";
import { modelo } from "./ventas-calculos.js";
import * as resumen from "./ventas-resumen.js";
import * as suscripciones from "./ventas-suscripciones.js";
import * as egresos from "./ventas-egresos.js";

let datos = null;   // { eventos, modelo, gastos } de Hotmart, compartido
let sub = "ingresos";

const COLUMNAS = "evento,fecha,transaccion,suscriptor,correo,nombre,telefono,pais,plan,cupon,forma_pago,neto_usd,cobro_numero";

export async function render(){
  $("#vista").innerHTML = `
<div class="cabecera cabecera-compacta">
  <div>
    <div class="mast"><span class="etiqueta">Ingresos y egresos</span><h1>Dinero</h1></div>
    <p>Lo que entra, lo que sale y si las suscripciones se sostienen.</p>
  </div>
  <button class="boton-recargar" id="btn-recargar" data-tip="Actualizar" aria-label="Actualizar">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 13A8.5 8.5 0 1 1 18 6.6L20.5 9"/><path d="M20.5 4v5h-5"/></svg>
  </button>
</div>

<div class="subpestanas con-goma" id="subpestanas" role="tablist" aria-label="Secciones de dinero">
  <span class="goma" aria-hidden="true"></span>
  <button class="subpestana" role="tab" data-sub="ingresos" aria-selected="false" aria-controls="sub-vista">Ingresos</button>
  <button class="subpestana" role="tab" data-sub="egresos" aria-selected="false" aria-controls="sub-vista">Egresos</button>
</div>

<div id="sub-vista" role="tabpanel"><p class="vacio">Cargando…</p></div>`;

  $("#subpestanas").addEventListener("click", e => {
    const b = e.target.closest("button[data-sub]");
    if (!b || b.dataset.sub === sub) return;
    abrir(b.dataset.sub);
  });
  if (window.ResizeObserver){
    const vigia = new ResizeObserver(() => moverGoma());
    document.querySelectorAll("#subpestanas .subpestana").forEach(b => vigia.observe(b));
  }

  $("#btn-recargar").addEventListener("click", async () => {
    const b = $("#btn-recargar");
    if (b.classList.contains("girando")) return;
    b.classList.add("girando");
    try {
      if (sub === "egresos") await egresos.recargar();
      else { await cargar(); await pintar(); }
    } finally { b.classList.remove("girando"); }
  });

  try { await cargar(); }
  catch (err){
    if (!$("#sub-vista")) return;
    $("#sub-vista").innerHTML = '<p class="vacio">No se pudieron leer las ventas. ' + escapar(err.message || err) + '</p>';
    return;
  }
  await abrir(sub);
}

async function abrir(id){
  sub = id;
  if (!$("#sub-vista")) return;   // mientras cargaba se abrió otra pestaña
  document.querySelectorAll("#subpestanas .subpestana").forEach(b =>
    b.setAttribute("aria-selected", String(b.dataset.sub === sub)));
  moverGoma();
  if (sub === "egresos") await egresos.render($("#sub-vista"), datos);
  else await pintar();
}

/* Ingresos: la página de ventas de Hotmart */
async function pintar(){
  const vista = $("#sub-vista");
  if (!vista) return;
  vista.innerHTML = '<div id="ventas-resumen"></div><div id="ventas-suscripciones"></div>';
  await resumen.render($("#ventas-resumen"), datos);
  await suscripciones.render($("#ventas-suscripciones"), datos);
}

/* La pastilla lima (.goma) viaja a la subpestaña elegida */
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

/* Todos los avisos, de a 1.000 (Supabase entrega máximo 1.000 por consulta) */
async function cargar(){
  const eventos = [];
  const PAGINA = 1000;
  for (let desde = 0; ; desde += PAGINA){
    const { data, error } = await sb.from("hotmart_eventos").select(COLUMNAS)
      .order("fecha", { ascending:true }).range(desde, desde + PAGINA - 1);
    if (error) throw error;
    eventos.push(...data);
    if (data.length < PAGINA) break;
  }
  /* El registro de gastos en anuncios todavía no existe: se agrega después */
  datos = { eventos, modelo: modelo(eventos), gastos: null };
}

