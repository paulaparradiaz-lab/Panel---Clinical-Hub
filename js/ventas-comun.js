/* ============================================================
   CLINICAL HUB · VENTAS › AYUDAS COMPARTIDAS
   Formato en dólares y porcentajes, flecha de comparación contra el
   periodo anterior y gráficas (Chart.js) con los colores del panel.
   ============================================================ */

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

/* Una gráfica por lienzo: si ya había una, se reemplaza */
const graficas = new Map();
export function grafica(id, config){
  const lienzo = document.getElementById(id);
  if (!lienzo) return;
  if (graficas.has(id)) graficas.get(id).destroy();
  if (!window.Chart){
    lienzo.replaceWith(Object.assign(document.createElement("p"), { className: "vacio", textContent: "No se pudo cargar la librería de gráficas." }));
    return;
  }
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
