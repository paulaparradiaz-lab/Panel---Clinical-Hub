/* ============================================================
   CLINICAL HUB · PESTAÑA VENTAS (una sola página)
   1. Ventas por día (calendario y atajos), por país y por forma de
      pago .................................... ventas-resumen.js
   2. MRR de 12 meses, nuevos contra bajas, cohortes y atrasados para
      contactar ............................... ventas-suscripciones.js
   Los cálculos están a la vista en ventas-calculos.js.

   Lee hotmart_eventos (lo llena n8n desde Hotmart; historial cargado
   el 28-sep-2026). Todo en US$ netos para Clinical Hub.
   ============================================================ */
import { sb, $, escapar } from "./nucleo.js";
import { modelo } from "./ventas-calculos.js";
import * as resumen from "./ventas-resumen.js";
import * as suscripciones from "./ventas-suscripciones.js";

let datos = null;   // { eventos, modelo, gastos } compartido por las dos partes

const COLUMNAS = "evento,fecha,transaccion,suscriptor,correo,nombre,telefono,pais,plan,cupon,forma_pago,neto_usd,cobro_numero";

export async function render(){
  $("#vista").innerHTML = `
<div class="cabecera cabecera-compacta">
  <div>
    <div class="mast"><span class="etiqueta">Hotmart, en dólares netos</span><h1>Ventas</h1></div>
    <p>Cómo van las ventas y si las suscripciones se sostienen.</p>
  </div>
  <button class="boton-recargar" id="btn-recargar" data-tip="Actualizar" aria-label="Actualizar">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 13A8.5 8.5 0 1 1 18 6.6L20.5 9"/><path d="M20.5 4v5h-5"/></svg>
  </button>
</div>

<div id="ventas-resumen"><p class="vacio">Cargando…</p></div>
<div id="ventas-suscripciones"></div>`;

  $("#btn-recargar").addEventListener("click", async () => {
    const b = $("#btn-recargar");
    if (b.classList.contains("girando")) return;
    b.classList.add("girando");
    try { await cargar(); await pintar(); } finally { b.classList.remove("girando"); }
  });

  try { await cargar(); }
  catch (err){
    if (!$("#ventas-resumen")) return;
    $("#ventas-resumen").innerHTML = '<p class="vacio">No se pudieron leer las ventas. ' + escapar(err.message || err) + '</p>';
    return;
  }
  await pintar();
}

/* Si mientras cargaba se abrió otra pestaña, ya no hay dónde pintar */
async function pintar(){
  if (!$("#ventas-resumen")) return;
  await resumen.render($("#ventas-resumen"), datos);
  await suscripciones.render($("#ventas-suscripciones"), datos);
}

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

