/* ============================================================
   CLINICAL HUB · VENTAS › AYUDAS COMPARTIDAS
   Formato en dólares y porcentajes, flecha de comparación contra el
   periodo anterior y gráficas (Chart.js) con los colores del panel.
   ============================================================ */
import { finDelDia } from "./ventas-calculos.js";

/* US$ con coma decimal, como se escribe en español */
export const usd = n => n == null ? "—"
  : "US$ " + Number(n).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const porcentaje = (n, d = 1) => n == null ? "—"
  : (n * 100).toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d }) + " %";

/* ↑ / ↓ contra el periodo anterior. alReves: bajar es bueno (reembolsos, bajas) */
export function variacion(ahora, antes, alReves){
  if (!antes && !ahora) return '<span class="vt-var">sin movimiento</span>';
  if (!antes) return '<span class="vt-var sube">nuevo · antes 0</span>';
  const cambio = ahora / antes - 1;
  const bueno = alReves ? cambio < 0 : cambio > 0;
  const clase = cambio === 0 ? "" : (bueno ? " sube" : " baja");
  return '<span class="vt-var' + clase + '">' + (cambio > 0 ? "↑ " : cambio < 0 ? "↓ " : "= ") +
    porcentaje(Math.abs(cambio), 0) + ' vs anterior</span>';
}

/* Cabecera de sección con «¿Cómo funciona?» (como en Impacto y Hitos):
   el texto va plegado debajo y se abre con el botón. */
const ICONO_AYUDA = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';
export function cabecera(id, titulo, subtitulo, ayuda){
  return '<div class="fila-entre cabeza-seccion"><div><h2 class="titulo-seccion">' + titulo + '</h2>' +
      (subtitulo ? '<p class="subtitulo-seccion"' + (subtitulo.id ? ' id="' + subtitulo.id + '"' : '') + '>' + (subtitulo.texto || subtitulo) + '</p>' : '') + '</div>' +
      '<button class="enlace-ayuda" type="button" data-ayuda="' + id + '" aria-expanded="false" aria-controls="' + id + '">' +
      ICONO_AYUDA + '¿Cómo funciona?</button></div>' +
    '<div class="ayuda-plegable" id="' + id + '" hidden>' + ayuda.map(p => '<p class="mini">' + p + '</p>').join("") + '</div>';
}
export function armarAyudas(caja){
  caja.addEventListener("click", e => {
    const b = e.target.closest("[data-ayuda]");
    if (!b) return;
    const c = document.getElementById(b.dataset.ayuda);
    c.hidden = !c.hidden;
    b.setAttribute("aria-expanded", String(!c.hidden));
  });
}

/* La librería de gráficas (Chart.js, versión fija) se baja una sola vez:
   en segundo plano cuando se carga este archivo, o al pedir la primera gráfica */
let pedidoGraficas = null;
function cargarGraficas(){
  if (window.Chart) return Promise.resolve();
  if (!pedidoGraficas) pedidoGraficas = new Promise((ok, mal) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js";
    s.onload = ok;
    s.onerror = () => { pedidoGraficas = null; s.remove(); mal(); };
    document.head.appendChild(s);
  });
  return pedidoGraficas;
}
if (window.requestIdleCallback) requestIdleCallback(() => cargarGraficas().catch(() => {}), { timeout: 3000 });
else setTimeout(() => cargarGraficas().catch(() => {}), 1500);

/* Una gráfica por lienzo: si ya había una, se reemplaza */
const graficas = new Map();
export function grafica(id, config){
  const lienzo = document.getElementById(id);
  if (!lienzo) return;
  if (!window.Chart){
    /* Todavía no llega la librería: se dibuja apenas llegue */
    cargarGraficas().then(() => grafica(id, config), () => {
      const l = document.getElementById(id);
      if (l) l.replaceWith(Object.assign(document.createElement("p"), { className: "vacio", textContent: "No se pudo cargar la librería de gráficas." }));
    });
    return;
  }
  if (graficas.has(id)) graficas.get(id).destroy();
  const base = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { labels: { font: { family: "DM Sans" }, boxWidth: 12 } } },
    scales: {}
  };
  config.options = Object.assign(base, config.options || {});
  /* En celular: sin títulos de eje, menos fechas y derechas, letra más chica */
  const cel = window.matchMedia("(max-width: 760px)").matches;
  if (cel && !config.options.scales.x) config.options.scales.x = {};
  Object.entries(config.options.scales || {}).forEach(([clave, e]) => {
    e.ticks = Object.assign({ font: { family: "DM Sans", size: cel ? 10 : 11 }, color: "#6b6b76" }, e.ticks || {});
    e.grid = Object.assign({ color: "rgba(24,24,27,.06)" }, e.grid || {});
    if (cel){
      if (e.title) e.title.display = false;
      if (clave === "x") Object.assign(e.ticks, { maxRotation: 0, autoSkip: true, maxTicksLimit: e.ticks.maxTicksLimit ? Math.min(e.ticks.maxTicksLimit, 5) : 6 });
    }
  });
  graficas.set(id, new window.Chart(lienzo, config));
}

/* ------------------------------------------------------------
   Selector de fechas de las gráficas (MRR, nuevos contra bajas,
   rentabilidad): calendario desde / hasta y atajos. Igual al de
   Ventas por día, con atajos que sirven para ver tendencias.
   ------------------------------------------------------------ */
const DIA = 864e5, ZONA = -5 * 3600e3;
const ATAJOS = [["30", "30 días"], ["3m", "3 meses"], ["6m", "6 meses"], ["12m", "12 meses"], ["todo", "Todo"]];
const aDia = t => new Date(t + ZONA).toISOString().slice(0, 10);
const deDia = (s, fin) => Date.parse(s + "T00:00:00Z") - ZONA + (fin ? DIA - 1 : 0);
function rangoDe(atajo, ahora, primero){
  const hoyIni = finDelDia(ahora) - DIA + 1;
  if (atajo === "30") return [hoyIni - 29 * DIA, ahora];
  if (atajo === "todo") return [Math.min(primero, hoyIni), ahora];
  const d = new Date(ahora + ZONA), n = Number(atajo.replace("m", ""));
  return [Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, d.getUTCDate()) - ZONA + DIA, ahora];
}
export function selectorFechas(clave){
  return '<div class="vt-fechas vt-fechas-resumen vt-fechas-chica" data-selector="' + clave + '">' +
    '<label>Desde <input class="campo" type="date" data-desde></label><label>Hasta <input class="campo" type="date" data-hasta></label>' +
    '<div class="filtros">' + ATAJOS.map(([k, t]) => '<button class="chip" data-atajo="' + k + '">' + t + '</button>').join("") + '</div></div>';
}
/* Conecta un selector: estado = { atajo, rango } (se conserva al volver a la
   pestaña); primero = desde cuándo hay datos (para «Todo»); dibujar(a, b) */
export function armarSelector(caja, clave, estado, primero, dibujar){
  const sel = caja.querySelector('[data-selector="' + clave + '"]');
  const aplicar = () => {
    sel.querySelector("[data-desde]").value = aDia(estado.rango[0]);
    sel.querySelector("[data-hasta]").value = aDia(estado.rango[1]);
    sel.querySelectorAll("[data-atajo]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.atajo === estado.atajo)));
    dibujar(estado.rango[0], estado.rango[1]);
  };
  if (!estado.rango || estado.atajo) estado.rango = rangoDe(estado.atajo || "todo", Date.now(), primero);
  sel.querySelector(".filtros").addEventListener("click", e => {
    const b = e.target.closest("[data-atajo]"); if (!b) return;
    estado.atajo = b.dataset.atajo; estado.rango = rangoDe(estado.atajo, Date.now(), primero); aplicar();
  });
  sel.querySelectorAll("input").forEach(inp => inp.addEventListener("change", () => {
    const a = sel.querySelector("[data-desde]").value, b = sel.querySelector("[data-hasta]").value;
    if (!a || !b || a > b) return;
    estado.atajo = null; estado.rango = [deDia(a), Math.min(deDia(b, true), Date.now())]; aplicar();
  }));
  aplicar();
}
