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
const corto = f => MESES[f.mes] + (f.cerrado ? "" : " *");

function pintar(filas){
  if (!filas.length){ caja.innerHTML = '<p class="vacio">Todavía no hay ventas.</p>'; return; }
  const hoy = filas[filas.length - 1];
  caja.innerHTML =
    '<section class="caja" style="margin-top:18px">' +
      cabecera("ayuda-rent", "Rentabilidad estimada", "Ingresos menos egresos, en US$", [
        "<b>Ingresos:</b> lo que le queda a Clinical Hub de Hotmart en el mes (netos, sin las compras reembolsadas). Es lo mismo que suma la subpestaña Ingresos.",
        "<b>Egresos:</b> los gastos anotados en Egresos, pasados a dólares con la TRM del día de cada uno.",
        "<b>Utilidad estimada</b> = ingresos − egresos. <b>Margen</b> = qué parte de los ingresos queda como utilidad.",
        "Un mes con «sin gastos anotados» puede verse mejor de lo que fue: anota sus gastos para que el cálculo sea real. * el mes en curso todavía no cierra."]) +
      '<p class="vt-rent-aviso"><b>Es una estimación.</b> Los ingresos están en dólares y los egresos en pesos: ' +
        'cada gasto se pasa a dólares con la TRM de su día, pero el valor real varía según el momento en que se cambia la plata, ' +
        'el momento puntual del gasto y las tasas de los bancos.</p>' +
      /* Los tres cuadros son del mismo mes: el título lo dice una vez */
      '<p class="vt-rent-periodo"><b>' + escapar(MESES_LARGO[hoy.mes].charAt(0).toUpperCase() + MESES_LARGO[hoy.mes].slice(1) + " " + hoy.anio) + '</b>' +
        (hoy.cerrado ? '' : ' · en curso') + '</p>' +
      '<div class="vt-rent-ecuacion">' +
        '<div><span class="mini">Ingresos</span><b>' + usd(hoy.ingresos) + '</b></div><span class="vt-rent-op">−</span>' +
        '<div><span class="mini">Egresos</span><b>' + usd(hoy.gasto) + '</b></div><span class="vt-rent-op">=</span>' +
        '<div class="vt-rent-total"><span class="mini">Utilidad estimada</span><b>' + signo(hoy.utilidad) + '</b>' +
          '<span class="mini">Margen ' + porcentaje(hoy.margen, 0) + '</span></div></div>' +
      '<div class="vt-grafica"><canvas id="vr-grafica" aria-label="Ingresos, egresos y utilidad por mes"></canvas></div>' +
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

  const redondo = n => Math.round(n * 100) / 100;
  grafica("vr-grafica", {
    type: "bar",
    data: { labels: filas.map(corto), datasets: [
      { type: "line", label: "Utilidad", data: filas.map(f => redondo(f.utilidad)), borderColor: "#2a4927", backgroundColor: "#2a4927", pointRadius: 4, tension: .25, order: 0 },
      { label: "Ingresos", data: filas.map(f => redondo(f.ingresos)), backgroundColor: "#7ab447", borderRadius: 6, order: 1 },
      { label: "Egresos", data: filas.map(f => redondo(f.gasto)), backgroundColor: "#d9654d", borderRadius: 6, order: 1 }
    ] },
    options: { scales: { y: { ticks: { callback: v => "US$ " + Math.round(v).toLocaleString("es-CO") } } } }
  });
}
