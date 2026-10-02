/* ============================================================
   CLINICAL HUB · PESTAÑA DINERO (Ingresos | Egresos | Rentabilidad)
   Dos subpestañas del mismo peso, como Feedback y Soluciones:

   INGRESOS  Lo que llega de Hotmart: ventas por día (calendario y
             devoluciones), países, formas de pago (ventas-resumen.js);
             MRR, nuevos contra bajas, cohortes y atrasados
             (ventas-suscripciones.js). Cálculos en ventas-calculos.js.
   EGRESOS   Los gastos que ustedes anotan a mano, con su soporte
             (ventas-egresos.js; tabla egresos, sql/egresos.sql).
   RENTABILIDAD  Estimada: ingresos − egresos por mes, en US$
             (ventas-rentabilidad.js).

   Lee hotmart_eventos (lo llena n8n desde Hotmart; historial cargado
   el 28-sep-2026). Ingresos en US$ netos; egresos en pesos (con su TRM).
   ============================================================ */
import { sb, $, escapar, avisar } from "./nucleo.js";
import { modelo } from "./ventas-calculos.js";
import * as resumen from "./ventas-resumen.js";
import * as suscripciones from "./ventas-suscripciones.js";
import * as egresos from "./ventas-egresos.js";
import * as rentabilidad from "./ventas-rentabilidad.js";

let datos = null;   // { eventos, modelo, gastos } de Hotmart, compartido
let sub = "ingresos";

const COLUMNAS = "evento,fecha,transaccion,suscriptor,correo,nombre,telefono,pais,plan,cupon,forma_pago,neto_usd,cobro_numero";

/* Turno de carga: si se sale y se vuelve a Dinero mientras carga, solo sigue la última */
let turno = 0;
let errorCarga = null;   // si la carga falló, las subpestañas lo dicen (no se quedan en «Cargando…»)

export async function render(){
  const mio = ++turno;
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
  <button class="subpestana" role="tab" data-sub="rentabilidad" aria-selected="false" aria-controls="sub-vista">Rentabilidad</button>
</div>

<p class="aviso" id="aviso-dinero" role="status"></p>
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
    avisar("", "", "#aviso-dinero");
    try {
      if (sub === "egresos") await egresos.recargar();
      else if (sub === "rentabilidad") { await cargar(); await rentabilidad.render($("#sub-vista"), datos); }
      else { await cargar(); await pintar(); }
    } catch (err){
      const { data: ses } = await sb.auth.getSession();
      if (!ses.session){ location.reload(); return; }   // la sesión se cerró: al inicio de sesión
      /* Sin conexión o Supabase no respondió: se avisa y se deja lo que ya estaba */
      avisar("No se pudo actualizar: " + (err.message || err) + ". Revisa la conexión y vuelve a intentar.", "mal", "#aviso-dinero");
    } finally { b.classList.remove("girando"); }
  });

  errorCarga = null;
  /* Si ya se bajaron las ventas antes, se muestran al instante y se actualizan
     por detrás; solo se vuelve a pintar si llegó algo nuevo (y si sigues en Dinero).
     Si la actualización falla, queda lo que ya se veía; ↻ lo intenta de nuevo. */
  if (datos){
    const antes = huella(datos.eventos);
    await abrir(sub);
    try { await cargar(); } catch (err){ return; }
    if (mio !== turno || huella(datos.eventos) === antes || !$("#subpestanas[aria-label='Secciones de dinero']")) return;
    await abrir(sub);
    return;
  }
  try { await cargar(); }
  catch (err){
    if (mio !== turno) return;
    /* Sin sesión (se cerró en otro equipo o venció): de vuelta al inicio de sesión */
    const { data: s } = await sb.auth.getSession();
    if (!s.session){ location.reload(); return; }
    errorCarga = err.message || String(err);
    if (!$("#sub-vista")) return;
    $("#sub-vista").innerHTML = '<p class="vacio">No se pudieron leer las ventas. ' + escapar(errorCarga) + '</p>';
    return;
  }
  if (mio !== turno) return;
  await abrir(sub);
}

async function abrir(id){
  sub = id;
  if (!$("#sub-vista")) return;   // mientras cargaba se abrió otra pestaña
  document.querySelectorAll("#subpestanas .subpestana").forEach(b =>
    b.setAttribute("aria-selected", String(b.dataset.sub === sub)));
  moverGoma();
  /* Si todavía no llegan las ventas, la carga inicial abre la subpestaña elegida al terminar */
  if (!datos){
    $("#sub-vista").innerHTML = errorCarga
      ? '<p class="vacio">No se pudieron leer las ventas. ' + escapar(errorCarga) + ' Usa ↻ para intentar de nuevo.</p>'
      : '<p class="vacio">Cargando…</p>';
    return;
  }
  if (sub === "egresos") await egresos.render($("#sub-vista"), datos);
  else if (sub === "rentabilidad") await rentabilidad.render($("#sub-vista"), datos);
  else await pintar();
}

/* Ingresos: la página de ventas de Hotmart */
async function pintar(){
  const vista = $("#sub-vista");
  if (!vista) return;
  vista.dataset.vista = "ingresos";
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

/* Cambia si llegó un aviso nuevo (la bitácora solo crece, nunca se edita) */
const huella = ev => ev.length + ":" + (ev.length ? ev[ev.length - 1].fecha : "");

/* Todos los avisos, de a 1.000 (Supabase entrega máximo 1.000 por consulta) */
async function cargar(){
  const eventos = [];
  const PAGINA = 1000;
  for (let desde = 0; ; desde += PAGINA){
    const { data, error } = await sb.from("hotmart_eventos").select(COLUMNAS)
      /* Desempate por la clave (única): con la misma hora exacta, el orden
         sería distinto en cada tanda y un evento podría salir dos veces o ninguna */
      .order("fecha", { ascending:true }).order("clave", { ascending:true }).range(desde, desde + PAGINA - 1);
    if (error) throw error;
    eventos.push(...data);
    if (data.length < PAGINA) break;
  }
  /* El registro de gastos en anuncios todavía no existe: se agrega después */
  datos = { eventos, modelo: modelo(eventos), gastos: null };
}

