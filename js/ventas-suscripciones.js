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
import { cohortes, mrrDiario, activa, PASOS_COHORTE, finDelDia, inicioMes } from "./ventas-calculos.js";
import { porcentaje, grafica, cabecera, armarAyudas } from "./ventas-comun.js";

const DIA = 864e5;
const ICONO_WHATSAPP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35zM12.04 2C6.5 2 2 6.48 2 12c0 1.77.46 3.5 1.34 5.02L2 22l5.12-1.34A10 10 0 0 0 12.04 22C17.56 22 22 17.52 22 12S17.56 2 12.04 2zm0 18.3c-1.5 0-2.97-.4-4.25-1.16l-.3-.18-3.04.8.81-2.96-.2-.31A8.3 8.3 0 1 1 12.04 20.3z"/></svg>';
const ZONA = -5 * 3600e3;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
const nombreMes = (anio, mes) => MESES[mes] + " " + anio;

/* MRR: un punto por día del rango */
function pintarMrr(m, a, b){
  const puntos = mrrDiario(m.subs, a, b);
  grafica("vs-mrr", {
    type: "line",
    data: {
      labels: puntos.map(p => { const d = new Date(p.t + ZONA); return d.getUTCDate() + " " + MESES[d.getUTCMonth()]; }),
      datasets: [{ label: "MRR (US$)", data: puntos.map(p => Math.round(p.mrr * 100) / 100),
        borderColor: "#2a4927", backgroundColor: "rgba(193,225,135,.35)", fill: true, pointRadius: 0, tension: .25 }]
    },
    options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } }, y: { beginAtZero: true } } }
  });
}

/* Nuevos (+) contra bajas (−): por día hasta 45 días, por semana hasta
   6 meses y por mes si el rango es más largo */
function pintarMovimientos(m, a, b, ahora){
  const dias = (b - a) / DIA;
  const modo = dias <= 45 ? "día" : dias <= 186 ? "semana" : "mes";
  const grupos = [];
  const d0 = new Date(a + ZONA);
  let ini = modo === "mes" ? inicioMes(d0.getUTCFullYear(), d0.getUTCMonth())
    : modo === "semana" ? finDelDia(a) - DIA + 1 - ((d0.getUTCDay() + 6) % 7) * DIA   // lunes de esa semana
    : finDelDia(a) - DIA + 1;
  while (ini <= b){
    const d = new Date(ini + ZONA);
    const sig = modo === "mes" ? inicioMes(d.getUTCMonth() === 11 ? d.getUTCFullYear() + 1 : d.getUTCFullYear(), (d.getUTCMonth() + 1) % 12)
      : ini + (modo === "semana" ? 7 : 1) * DIA;
    const desde = Math.max(ini, a), hasta = Math.min(sig - 1, b);
    grupos.push({
      etiqueta: modo === "mes" ? nombreMes(d.getUTCFullYear(), d.getUTCMonth()) : d.getUTCDate() + " " + MESES[d.getUTCMonth()],
      abierto: sig - 1 > ahora,
      nuevos: m.subs.filter(x => x.alta >= desde && x.alta <= hasta).length,
      bajas: m.subs.filter(x => x.baja != null && x.baja >= desde && x.baja <= hasta).length
    });
    ini = sig;
  }
  document.getElementById("vs-mov-sub").textContent = "Por " + modo + (grupos.some(g => g.abierto) ? " · * todavía no cierra" : "");
  grafica("vs-movimientos", {
    type: "bar",
    data: {
      labels: grupos.map(g => g.etiqueta + (g.abierto ? " *" : "")),
      datasets: [
        { label: "Nuevos", data: grupos.map(g => g.nuevos), backgroundColor: "#7ab447", borderRadius: 6 },
        { label: "Bajas", data: grupos.map(g => -g.bajas), backgroundColor: "#d9654d", borderRadius: 6 }
      ]
    },
    options: { scales: { x: { stacked: true, ticks: { maxRotation: 0, autoSkip: true } }, y: { stacked: true, ticks: { precision: 0 } } } }
  });
}

/* Selector de fechas de las dos gráficas (como el de Ventas por día):
   calendario desde / hasta y atajos. Cada gráfica guarda su rango. */
const ATAJOS = [["30", "30 días"], ["3m", "3 meses"], ["6m", "6 meses"], ["12m", "12 meses"], ["todo", "Todo"]];
const elegido = { mrr: { atajo: "todo", rango: null }, mov: { atajo: "todo", rango: null } };   // de entrada, desde la primera venta
const aDia = t => new Date(t + ZONA).toISOString().slice(0, 10);
const deDia = (s, fin) => Date.parse(s + "T00:00:00Z") - ZONA + (fin ? DIA - 1 : 0);
function rangoDe(atajo, ahora, primero){
  const hoyIni = finDelDia(ahora) - DIA + 1;
  if (atajo === "30") return [hoyIni - 29 * DIA, ahora];
  if (atajo === "todo") return [Math.min(primero, hoyIni), ahora];
  const d = new Date(ahora + ZONA), n = Number(atajo.replace("m", ""));
  return [Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, d.getUTCDate()) - ZONA + DIA, ahora];
}
function selectorFechas(clave){
  return '<div class="vt-fechas vt-fechas-resumen vt-fechas-chica" data-selector="' + clave + '">' +
    '<label>Desde <input class="campo" type="date" data-desde></label><label>Hasta <input class="campo" type="date" data-hasta></label>' +
    '<div class="filtros">' + ATAJOS.map(([k, t]) => '<button class="chip" data-atajo="' + k + '">' + t + '</button>').join("") + '</div></div>';
}

export async function render(caja, datos){
  caja.innerHTML = `
<div class="vt-dos">
  <section class="caja">${cabecera("ayuda-mrr", "MRR", "Ingreso mensual recurrente, en US$ netos", [
    "El <b>MRR</b> es cuánto entraría cada mes si todos los médicos al día siguieran pagando. Se suma el <b>último pago</b> de cada médico con su suscripción al día.",
    "No cuentan los que tienen un pago atrasado ni los que cancelaron. Va en dólares netos: lo que le queda a Clinical Hub después de Hotmart.",
    "Hay un punto por día; si la línea sube, entran más médicos de los que se van. Elige las fechas o usa los atajos."])}
    ${selectorFechas("mrr")}
    <div class="vt-grafica"><canvas id="vs-mrr" aria-label="MRR diario"></canvas></div></section>
  <section class="caja">${cabecera("ayuda-movimientos", "Nuevos contra bajas", { id: "vs-mov-sub", texto: "Por mes" }, [
    "<b>Verde (arriba):</b> médicos que pagaron por primera vez en ese día, semana o mes.",
    "<b>Rojo (abajo):</b> bajas: canceló, Hotmart lo dio de baja por pago fallido, o se le reembolsó. Un pago atrasado todavía no es baja.",
    "Se agrupa según el rango: <b>por día</b> hasta 45 días, <b>por semana</b> hasta 6 meses y <b>por mes</b> si es más largo. * el periodo en curso todavía no cierra.",
    "Si el rojo crece más que el verde, se están yendo más médicos de los que llegan."])}
    ${selectorFechas("mov")}
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

  /* Las dos gráficas con su selector de fechas */
  const primero = m.subs.length ? m.subs.reduce((x, sub) => Math.min(x, sub.alta), Infinity) : ahora;
  const dibujar = { mrr: pintarMrr, mov: pintarMovimientos };
  caja.querySelectorAll("[data-selector]").forEach(sel => {
    const clave = sel.dataset.selector, e = elegido[clave];
    const aplicar = () => {
      sel.querySelector("[data-desde]").value = aDia(e.rango[0]);
      sel.querySelector("[data-hasta]").value = aDia(e.rango[1]);
      sel.querySelectorAll("[data-atajo]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.atajo === e.atajo)));
      dibujar[clave](m, e.rango[0], e.rango[1], ahora);
    };
    if (!e.rango || e.atajo) e.rango = rangoDe(e.atajo || "12m", ahora, primero);
    sel.querySelector(".filtros").addEventListener("click", ev => {
      const b = ev.target.closest("[data-atajo]"); if (!b) return;
      e.atajo = b.dataset.atajo; e.rango = rangoDe(e.atajo, Date.now(), primero); aplicar();
    });
    sel.querySelectorAll("input").forEach(inp => inp.addEventListener("change", () => {
      const a = sel.querySelector("[data-desde]").value, b = sel.querySelector("[data-hasta]").value;
      if (!a || !b || a > b) return;
      e.atajo = null; e.rango = [deDia(a), Math.min(deDia(b, true), Date.now())]; aplicar();
    }));
    aplicar();
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
  /* Solo el ícono de WhatsApp, sin fondo; el nombre va en el globito y para lectores de pantalla */
  const whatsapp = s => s.telefono
    ? '<a class="vt-whatsapp" href="https://wa.me/' + escapar(String(s.telefono).replace(/\D/g, "")) + '" target="_blank" rel="noopener"' +
      ' title="Escribir por WhatsApp" aria-label="Escribir por WhatsApp a ' + escapar(s.nombre || "este médico") + '">' + ICONO_WHATSAPP + '</a>' : '';
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
