/* ============================================================
   CLINICAL HUB · DINERO › RENTABILIDAD ESTIMADA
   Por mes: ingresos netos de Hotmart (lo que le queda a Clinical Hub,
   ventas-calculos.js) menos los egresos anotados a mano (tabla egresos,
   en dólares con la TRM de su día). Es una ESTIMACIÓN: los ingresos
   están en dólares y los egresos en pesos, y el cambio real varía.

   · La cuenta del mes en curso: ingresos − egresos = utilidad (y margen)
   · Gráfica por mes: barras de ingresos y egresos, línea de utilidad
   · Tabla por mes con el margen; avisa los meses sin gastos anotados
   ============================================================ */
import { sb, escapar } from "./nucleo.js";
import { meses } from "./ventas-calculos.js";
import { usd, porcentaje, grafica, cabecera, armarAyudas } from "./ventas-comun.js";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
const MESES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre"];

let caja = null;
let periodoGrafica = "12";   // «3», «6», «12» (últimos meses) o un año («2026»); se conserva al volver

let datosVentas = null;

export async function render(c, datos){
  caja = c;
  datosVentas = datos;
  caja.dataset.vista = "rentabilidad";
  await recargar();
}

export async function recargar(){
  const { data, error } = await sb.from("egresos").select("fecha,monto_usd");
  /* Si mientras llegaban los datos se cambió de subpestaña, no se dibuja encima */
  if (!caja || !caja.isConnected || caja.dataset.vista !== "rentabilidad") return;
  if (error){ caja.innerHTML = '<p class="vacio">No se pudieron leer los egresos. ' + escapar(error.message) + '</p>'; return; }
  pintar(calcular(data || []));
}

/* Un renglón por mes, desde la primera venta o el primer gasto (lo que
   ocurra primero) hasta hoy: un gasto de antes de vender también resta */
function calcular(egresos){
  const ventas = meses(datosVentas.modelo, Date.now());
  const clave = (a, m) => a + "-" + String(m + 1).padStart(2, "0");
  const hoy = new Date(Date.now() - 5 * 3600e3);
  const fin = ventas.length ? ventas[0] : { anio: hoy.getUTCFullYear(), mes: hoy.getUTCMonth() };
  const primerGasto = egresos.map(e => e.fecha.slice(0, 7)).sort()[0];
  const antes = [];
  if (primerGasto && primerGasto < clave(fin.anio, fin.mes)){
    let [a, m] = primerGasto.split("-").map(Number); m -= 1;
    while (clave(a, m) < clave(fin.anio, fin.mes)){
      antes.push({ anio: a, mes: m, cerrado: true, ingresos: 0 });
      m === 11 ? (a++, m = 0) : m++;
    }
    /* Sin ventas todavía: se llega hasta el mes en curso */
    if (!ventas.length) antes.push({ anio: fin.anio, mes: fin.mes, cerrado: false, ingresos: 0 });
  }
  return [...antes, ...ventas].map(x => {
    const clave = x.anio + "-" + String(x.mes + 1).padStart(2, "0");
    const delMes = egresos.filter(e => e.fecha.startsWith(clave));
    const gasto = delMes.reduce((s, e) => s + Number(e.monto_usd), 0);
    const utilidad = x.ingresos - gasto;
    return {
      anio: x.anio, mes: x.mes, cerrado: x.cerrado,
      ingresos: x.ingresos, gasto, utilidad,
      margen: x.ingresos ? utilidad / x.ingresos : null,
      sinGastos: !delMes.length
    };
  });
}

const signo = (n, formato = usd) => '<span class="' + (n >= 0 ? "vt-rent-mas" : "vt-rent-menos") + '">' + (n < 0 ? "− " + formato(-n) : formato(n)) + '</span>';
/* En la tabla, sin «US$» en cada celda (el subtítulo lo dice) */
const cifra = n => Number(n).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nombre = f => MESES_LARGO[f.mes] + " " + f.anio + (f.cerrado ? "" : " *");

function pintar(filas){
  if (!filas.length){ caja.innerHTML = '<p class="vacio">Todavía no hay ventas.</p>'; return; }
  const hoy = filas[filas.length - 1];
  /* Totales desde el primer mes con venta o gasto */
  const hist = filas.reduce((t, f) => ({ ingresos: t.ingresos + f.ingresos, gasto: t.gasto + f.gasto }), { ingresos: 0, gasto: 0 });
  hist.utilidad = hist.ingresos - hist.gasto;
  hist.margen = hist.ingresos ? hist.utilidad / hist.ingresos : null;
  const primerMes = filas[0];
  /* Un solo recuadro: la utilidad histórica destacada, la franja del mes en curso y la gráfica mes a mes */
  const desde = MESES_LARGO[primerMes.mes] + " " + primerMes.anio;
  const enCurso = hoy.cerrado ? "" : " · en curso";
  const aviso = '<p class="vt-rent-aviso"><b>Es una estimación.</b> Los ingresos están en dólares y los egresos en pesos: ' +
    'cada gasto se pasa a dólares con la TRM de su día, pero el valor real varía según el momento en que se cambia la plata, ' +
    'el momento puntual del gasto y las tasas de los bancos.</p>';
  const arriba =
    '<div class="vu-grande"><span class="mini">Utilidad estimada histórica · desde ' + escapar(desde) + '</span><b>' + signo(hist.utilidad) + '</b>' +
      '<span class="mini">Ingresos ' + usd(hist.ingresos) + ' − egresos ' + usd(hist.gasto) + ' · margen ' + porcentaje(hist.margen, 0) + '</span></div>' +
    /* El mes en curso, con la misma organización pero en gris */
    '<div class="vu-grande vu-mes"><span class="mini">Utilidad estimada · ' + escapar(MESES_LARGO[hoy.mes] + " " + hoy.anio) + enCurso + '</span><b>' + signo(hoy.utilidad) + '</b>' +
      '<span class="mini">Ingresos ' + usd(hoy.ingresos) + ' − egresos ' + usd(hoy.gasto) + ' · margen ' + porcentaje(hoy.margen, 0) + '</span></div>';
  caja.innerHTML =
    '<section class="caja" style="margin-top:18px">' +
      cabecera("ayuda-rent", "Ingresos, egresos y rentabilidad", "En US$", [
        "<b>Ingresos:</b> lo que le queda a Clinical Hub de Hotmart (netos, sin las compras reembolsadas).",
        "<b>Egresos:</b> los gastos anotados en Egresos, de todas las categorías, pasados a dólares con la TRM del día de cada uno.",
        "<b>Utilidad estimada</b> = ingresos − egresos. <b>Margen</b> = qué parte de los ingresos queda como utilidad.",
        "<b>Histórico</b> suma desde la primera venta; el <b>mes en curso</b> va del día 1 a hoy. La gráfica muestra cada mes: elige los últimos 3, 6 o 12 meses, o un año. * el mes en curso todavía no cierra."]) +
      aviso + arriba +
      '<div class="vu-sep"><b>Mes a mes</b><span class="mini">* el mes en curso todavía no cierra</span></div>' +
      '<div class="filtros vt-rent-periodos" id="vrent-periodos"></div>' +
      '<div class="vt-grafica"><canvas id="vrent-grafica" aria-label="Ingresos, egresos y utilidad"></canvas></div>' +
    '</section>' +
    '<section class="caja" style="margin-top:14px">' +
      cabecera("ayuda-rent-mes", "Por mes", "Ingresos, egresos y utilidad, en US$", [
        "Una fila por mes, desde la primera venta. El mes en curso lleva *.",
        "El <b>margen</b> es qué parte de los ingresos queda como utilidad."]) +
      '<div class="vt-tabla"><table class="tabla vt-rent-tabla"><thead><tr><th>Mes</th><th>Ingresos</th><th>Egresos</th><th>Utilidad</th><th>Margen</th></tr></thead><tbody>' +
      filas.slice().reverse().map(f => '<tr><td><span class="vt-largo">' + escapar(nombre(f)) + '</span><span class="vt-corto">' + escapar(MESES[f.mes] + " " + String(f.anio).slice(2) + (f.cerrado ? "" : " *")) + '</span>' +
        (f.sinGastos ? '<span class="mini">sin gastos anotados</span>' : '') + '</td>' +
        '<td>' + cifra(f.ingresos) + '</td><td>' + cifra(f.gasto) + '</td><td><b>' + signo(f.utilidad, cifra) + '</b></td><td>' + porcentaje(f.margen, 0) + '</td></tr>').join("") +
      '</tbody></table></div>' +
    '</section>';
  armarAyudas(caja);

  /* Opciones: últimos 3, 6 o 12 meses, y cada año con datos (el más reciente primero) */
  const anios = [...new Set(filas.map(f => f.anio))].sort((x, y) => y - x);
  const periodos = [["3", "3 meses"], ["6", "6 meses"], ["12", "12 meses"], ...anios.map(a => [String(a), String(a)])];
  if (!periodos.some(p => p[0] === periodoGrafica)) periodoGrafica = "12";
  const botones = caja.querySelector("#vrent-periodos");
  const pintarGrafica = () => {
    botones.innerHTML = periodos.map(([k, t]) => '<button class="chip" data-periodo="' + k + '" aria-pressed="' + (k === periodoGrafica) + '">' + t + '</button>').join("");
    const n = Number(periodoGrafica);
    graficaMeses(n > 999 ? filas.filter(f => f.anio === n) : filas.slice(-n));
  };
  botones.addEventListener("click", e => {
    const b = e.target.closest("[data-periodo]");
    if (b){ periodoGrafica = b.dataset.periodo; pintarGrafica(); }
  });
  pintarGrafica();
}

/* Barras de ingresos y egresos por mes, con la línea de utilidad */
function graficaMeses(filas){
  const redondo = n => Math.round(n * 100) / 100;
  grafica("vrent-grafica", {
    type: "bar",
    data: { labels: filas.map(f => MESES[f.mes] + (f.cerrado ? "" : " *")), datasets: [
      { type: "line", label: "Utilidad", data: filas.map(f => redondo(f.utilidad)), borderColor: "#2a4927", backgroundColor: "#2a4927", pointRadius: 4, tension: .25, order: 0 },
      { label: "Ingresos", data: filas.map(f => redondo(f.ingresos)), backgroundColor: "#7ab447", borderRadius: 6, order: 1 },
      { label: "Egresos", data: filas.map(f => redondo(f.gasto)), backgroundColor: "#d9654d", borderRadius: 6, order: 1 }
    ] },
    options: { scales: { x: { ticks: { maxRotation: 0, autoSkip: true } }, y: { ticks: { callback: v => "US$ " + Math.round(v).toLocaleString("es-CO") } } } }
  });
}
