/* ============================================================
   CLINICAL HUB · VENTAS › SUSCRIPCIONES
   Segunda parte de la página de Ventas:
   · MRR de los últimos 12 meses (un punto por día)
   · Nuevos contra bajas por mes (el mes en curso todavía no cierra)
   · Cohortes: % de cada mes de entrada que sigue vigente a 1, 3, 6 y 12 meses
   · Atrasados para contactar
   Los cálculos están en ventas-calculos.js.
   ============================================================ */
import { escapar, fecha, num } from "./nucleo.js";
import { nombrePais } from "./ia.js";
import { meses, cohortes, mrrDiario, activa, PASOS_COHORTE } from "./ventas-calculos.js";
import { porcentaje, grafica, cabecera, armarAyudas } from "./ventas-comun.js";

const DIA = 864e5;
const ZONA = -5 * 3600e3;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
const nombreMes = (anio, mes) => MESES[mes] + " " + anio;

export async function render(caja, datos){
  caja.innerHTML = `
<div class="vt-dos">
  <section class="caja">${cabecera("ayuda-mrr", "MRR de los últimos 12 meses", "Ingreso mensual recurrente, en US$ netos", [
    "El <b>MRR</b> es cuánto entraría cada mes si todos los médicos al día siguieran pagando. Se suma el <b>último pago</b> de cada médico con su suscripción al día.",
    "No cuentan los que tienen un pago atrasado ni los que cancelaron. Va en dólares netos: lo que le queda a Clinical Hub después de Hotmart.",
    "Hay un punto por día; si la línea sube, entran más médicos de los que se van."])}
    <div class="vt-grafica"><canvas id="vs-mrr" aria-label="MRR diario"></canvas></div></section>
  <section class="caja">${cabecera("ayuda-movimientos", "Nuevos contra bajas", "Por mes · * el mes en curso todavía no cierra", [
    "<b>Verde (arriba):</b> médicos que pagaron por primera vez ese mes.",
    "<b>Rojo (abajo):</b> bajas del mes: canceló, Hotmart lo dio de baja por pago fallido, o se le reembolsó. Un pago atrasado todavía no es baja.",
    "Si el rojo crece más que el verde, se están yendo más médicos de los que llegan."])}
    <div class="vt-grafica"><canvas id="vs-movimientos" aria-label="Nuevos y bajas por mes"></canvas></div></section>
</div>
<section class="caja" style="margin-top:14px">
  ${cabecera("ayuda-cohortes", "Cohortes", "Qué % de los médicos de cada mes sigue suscrito con el tiempo", [
    "Cada <b>fila</b> es el grupo de médicos que entró el mismo mes. Las columnas dicen qué <b>% de ese grupo sigue suscrito</b> al cumplir 1, 3, 6 y 12 meses.",
    "«Aún no» quiere decir que ese grupo todavía no ha cumplido ese tiempo. Entre más verde, más médicos se quedan.",
    "Sirve para comparar: si los grupos nuevos se quedan más que los viejos, la plataforma está mejorando."])}
  <div class="vt-tabla" id="vs-cohortes"></div>
</section>
<section class="caja" style="margin-top:14px">
  ${cabecera("ayuda-atrasados", "Atrasados para contactar", "Hotmart no pudo cobrarles; todavía pueden pagar", [
    "Médicos a los que Hotmart intentó cobrar la mensualidad y <b>no pudo</b>: tarjeta vencida, sin fondos, banco que rechazó el pago…",
    "Hotmart sigue intentando unos días. Si no logra cobrar, da de baja la suscripción y el médico pierde el acceso.",
    "Escríbeles por WhatsApp para que actualicen su medio de pago antes de que eso pase."])}
  <div class="vt-tabla" id="vs-atrasados"></div>
</section>`;

  armarAyudas(caja);
  const ahora = Date.now();
  const m = datos.modelo;

  /* MRR diario de 12 meses */
  const puntos = mrrDiario(m.subs, ahora - 364 * DIA, ahora);
  grafica("vs-mrr", {
    type: "line",
    data: {
      labels: puntos.map(p => { const d = new Date(p.t + ZONA); return d.getUTCDate() + " " + MESES[d.getUTCMonth()]; }),
      datasets: [{ label: "MRR (US$)", data: puntos.map(p => Math.round(p.mrr * 100) / 100),
        borderColor: "#2a4927", backgroundColor: "rgba(193,225,135,.35)", fill: true, pointRadius: 0, tension: .25 }]
    },
    options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 12 } }, y: { beginAtZero: true } } }
  });

  /* Nuevos (+) contra bajas (−), últimos 12 meses */
  const ult12 = meses(m, ahora).slice(-12);
  grafica("vs-movimientos", {
    type: "bar",
    data: {
      labels: ult12.map(x => nombreMes(x.anio, x.mes) + (x.cerrado ? "" : " *")),
      datasets: [
        { label: "Nuevos", data: ult12.map(x => x.nuevos), backgroundColor: "#7ab447", borderRadius: 6 },
        { label: "Bajas", data: ult12.map(x => -x.bajas), backgroundColor: "#d9654d", borderRadius: 6 }
      ]
    },
    options: { scales: { x: { stacked: true }, y: { stacked: true, ticks: { precision: 0 } } } }
  });

  /* Cohortes como mapa de calor */
  const lista = cohortes(m, ahora);
  const color = v => v == null ? "" : ' style="background:rgba(122,180,71,' + (0.12 + v * 0.75).toFixed(2) + ')"';
  document.getElementById("vs-cohortes").innerHTML = lista.length
    ? '<table class="tabla vt-cohortes"><thead><tr><th><span class="vt-largo">Entraron en</span><span class="vt-corto">Mes</span></th><th class="vt-col-n">Médicos</th>' +
      PASOS_COHORTE.map(p => '<th><span class="vt-largo">' + p + (p === 1 ? ' mes' : ' meses') + '</span><span class="vt-corto">' + p + ' m</span></th>').join("") +
      '</tr></thead><tbody>' +
      lista.slice().reverse().map(c => '<tr><td>' + nombreMes(c.anio, c.mes) + '<span class="mini vt-corto">' + num(c.n) + (c.n === 1 ? ' médico' : ' médicos') + '</span></td>' +
        '<td class="vt-col-n">' + num(c.n) + '</td>' +
        c.pasos.map(v => '<td' + color(v) + '>' + (v == null ? '<span class="mini">aún no</span>' : porcentaje(v, 0)) + '</td>').join("") +
        '</tr>').join("") + '</tbody></table>'
    : '<p class="vacio">Todavía no hay médicos.</p>';

  /* Atrasados: vigentes cuyo último movimiento de cobro fue un atraso */
  const atrasados = m.subs.filter(s => s.baja == null && s.atrasos.length && !activa(s, ahora))
    .sort((a, b) => Math.max(...b.atrasos) - Math.max(...a.atrasos));
  const whatsapp = s => s.telefono
    ? '<a class="boton-chico" href="https://wa.me/' + escapar(String(s.telefono).replace(/\D/g, "")) + '" target="_blank" rel="noopener">WhatsApp</a>' : '';
  const plan = s => (s.plan || "—").replace("Miembro founder ", "Founder ");
  document.getElementById("vs-atrasados").innerHTML = atrasados.length
    /* En celular, una tarjeta por médico; en computador, la tabla */
    ? '<div class="vt-tarjetas-cel">' + atrasados.map(s => '<div class="vt-tarjeta-atraso"><div><b>' + escapar(s.nombre || "—") + '</b>' +
        '<span class="mini">' + escapar(s.correo || "") + '</span>' +
        '<span class="mini">' + escapar(s.pais ? nombrePais(s.pais) : "—") + ' · ' + escapar(plan(s)) + ' · atrasado desde ' +
        escapar(fecha(Math.max(...s.atrasos))) + ' · ' + num(s.pagos.length) + (s.pagos.length === 1 ? ' cobro pagado' : ' cobros pagados') + '</span></div>' +
        whatsapp(s) + '</div>').join("") + '</div>' +
      '<table class="tabla vt-solo-compu"><thead><tr><th>Médico</th><th>País</th><th>Plan</th><th>Atrasado desde</th><th>Cobros pagados</th><th>Contacto</th></tr></thead><tbody>' +
      atrasados.map(s => '<tr><td>' + escapar(s.nombre || "—") + '<span class="mini">' + escapar(s.correo || "") + '</span></td><td>' +
        escapar(s.pais ? nombrePais(s.pais) : "—") + '</td><td>' + escapar((s.plan || "—").replace("Miembro founder ", "Founder ")) + '</td><td>' +
        escapar(fecha(Math.max(...s.atrasos))) + '</td><td>' + num(s.pagos.length) + '</td><td>' +
        (whatsapp(s) || '—') +
        '</td></tr>').join("") + '</tbody></table>'
    : '<p class="vacio">No hay médicos atrasados.</p>';
}
