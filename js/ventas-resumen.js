/* ============================================================
   CLINICAL HUB · VENTAS › RESUMEN
   Como el inicio de Hotmart: la gráfica de ventas por día con un
   calendario (desde / hasta) y atajos de periodo; países y formas de
   pago del mismo rango (top 5 países y «Mostrar más»).
   Venta = cobro aprobado y no reembolsado (compra nueva o renovación).
   ============================================================ */
import { escapar, num } from "./nucleo.js";
import { nombrePais } from "./ia.js";
import { finDelDia } from "./ventas-calculos.js";
import { usd, grafica, cabecera, armarAyudas } from "./ventas-comun.js";

const DIA = 864e5;
const ZONA = -5 * 3600e3;
const PERIODOS = [
  ["hoy", "Hoy"], ["7", "7 días"], ["30", "30 días"], ["mes", "Este mes"], ["mesAnterior", "Mes anterior"]
];
const FORMAS = { CREDIT_CARD:"Tarjeta de crédito", DEBIT_CARD:"Tarjeta de débito", PAYPAL:"PayPal",
  "Apple Pay":"Apple Pay", "Google Pay":"Google Pay", PIX:"PIX", BILLET:"Boleto" };

let periodo = "30";
let rangoElegido = null;   // [desde, hasta] del calendario
let datos = null;
const aDia = t => new Date(t + ZONA).toISOString().slice(0, 10);
const deDia = (s, fin) => Date.parse(s + "T00:00:00Z") - ZONA + (fin ? DIA - 1 : 0);

export async function render(caja, d){
  datos = d;
  caja.innerHTML = `
<section class="caja" style="margin-top:18px">
  ${cabecera("ayuda-ventas-dia", "Ventas por día", { id: "vr-rango", texto: "" }, [
    "Cada <b>barra</b> son las ventas del día: cobros aprobados en Hotmart, tanto <b>compras nuevas</b> como <b>renovaciones</b> mensuales. Los reembolsos no cuentan.",
    "La <b>línea</b> es la <b>facturación neta</b> del día: lo que le queda a Clinical Hub en dólares, ya sin la tarifa de Hotmart ni los impuestos de cada país.",
    "Las <b>barras rojas hacia abajo</b> son el dinero que salió ese día por <b>reembolsos y contracargos</b> (en dólares netos).",
    "Elige las fechas en el calendario o usa los atajos (Hoy, 7 días…). Países y formas de pago usan el mismo rango."])}
  <div class="vt-fechas vt-fechas-resumen">
    <label>Desde <input class="campo" type="date" id="vr-desde"></label>
    <label>Hasta <input class="campo" type="date" id="vr-hasta"></label>
    <div class="filtros" id="vr-periodos">${PERIODOS.map(([k, t]) =>
      '<button class="chip" data-periodo="' + k + '" aria-pressed="' + (k === periodo) + '">' + t + '</button>').join("")}</div>
  </div>
  <div class="vt-grafica"><canvas id="vr-grafica" aria-label="Ventas por día"></canvas></div>
</section>
<div class="vt-dos">
  <section class="caja">${cabecera("ayuda-paises", "Por país", "", [
    "Ventas del rango elegido arriba, según el país desde donde pagó el médico: la <b>cantidad de ventas</b> y su <b>facturación neta</b> en dólares.",
    "Se ven los 5 países con más ventas; «Mostrar más» abre el resto."])}<div id="vr-paises"></div></section>
  <section class="caja">${cabecera("ayuda-formas", "Por forma de pago", "", [
    "Con qué pagaron los médicos en el rango elegido arriba: tarjeta, PayPal, Apple Pay, Google Pay… con la <b>cantidad de ventas</b> y su <b>facturación neta</b>.",
    "Sirve para ver qué medios de pago usan más y cuáles vale la pena ofrecer."])}<div id="vr-formas"></div></section>
</div>
`;
  armarAyudas(caja);
  /* Los atajos llenan el calendario; tocar el calendario quita el atajo */
  caja.querySelector("#vr-periodos").addEventListener("click", e => {
    const b = e.target.closest("[data-periodo]");
    if (!b) return;
    periodo = b.dataset.periodo;
    rangoElegido = rango(periodo, Date.now());
    pintar();
  });
  ["#vr-desde", "#vr-hasta"].forEach(sel => caja.querySelector(sel).addEventListener("change", () => {
    const a = caja.querySelector("#vr-desde").value, b = caja.querySelector("#vr-hasta").value;
    if (!a || !b || a > b) return;
    periodo = null;
    rangoElegido = [deDia(a), Math.min(deDia(b, true), Date.now())];
    pintar();
  }));
  if (!rangoElegido || periodo) rangoElegido = rango(periodo || "30", Date.now());
  pintar();
}

/* Rango del periodo elegido y el anterior de igual duración */
function rango(clave, ahora){
  const hoyIni = finDelDia(ahora) - DIA + 1;
  if (clave === "hoy") return [hoyIni, ahora];
  if (clave === "7" || clave === "30") return [hoyIni - (Number(clave) - 1) * DIA, ahora];
  const d = new Date(ahora + ZONA);
  if (clave === "mes") return [Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - ZONA, ahora];
  const ini = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1) - ZONA;
  const fin = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - ZONA - 1;
  return [ini, fin];
}

function cifras(m, a, b){
  const pagos = m.pagos.filter(p => p.t >= a && p.t <= b);
  return {
    pagos,
    ventas: pagos.length,
    facturacion: pagos.reduce((x, p) => x + p.valor, 0),
    nuevos: pagos.filter(p => p.nuevo).length,
    renovaciones: pagos.filter(p => !p.nuevo).length,
    reembolsos: m.reembolsos.filter(r => r.t >= a && r.t <= b).length,
    devuelto: m.reembolsos.filter(r => r.t >= a && r.t <= b).reduce((x, r) => x + r.valor, 0)
  };
}

function pintar(){
  const m = datos.modelo;
  const [a, b] = rangoElegido;
  const act = cifras(m, a, b);
  document.getElementById("vr-desde").value = aDia(a);
  document.getElementById("vr-hasta").value = aDia(b);
  document.querySelectorAll("#vr-periodos .chip").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.periodo === periodo)));
  document.getElementById("vr-rango").textContent = num(act.ventas) + " ventas · " + usd(act.facturacion) +
    " netos · " + num(act.nuevos) + " nuevos y " + num(act.renovaciones) + " renovaciones" +
    (act.reembolsos ? " · " + usd(act.devuelto) + " devueltos (" + num(act.reembolsos) + ")" : "");

  /* Ventas por día del rango elegido */
  const dias = [];
  for (let t = a; t <= b; t += DIA){
    const fin = finDelDia(t);
    const del = m.pagos.filter(p => p.t >= fin - DIA + 1 && p.t <= fin);
    const salen = m.reembolsos.filter(r => r.t >= fin - DIA + 1 && r.t <= fin);
    dias.push({ t, ventas: del.length, fact: del.reduce((x, p) => x + p.valor, 0),
                devuelto: salen.reduce((x, r) => x + r.valor, 0) });
  }
  /* Los dos ejes con el cero a la misma altura: las devoluciones bajan desde
     la misma línea donde suben las ventas */
  const maxVentas = Math.max(1, ...dias.map(d => d.ventas)) * 1.1;
  const maxFact = Math.max(1, ...dias.map(d => d.fact)) * 1.1;
  const maxSale = Math.max(0, ...dias.map(d => d.devuelto)) * 1.1;
  const parte = maxSale / maxFact;
  grafica("vr-grafica", {
    type: "bar",
    data: {
      labels: dias.map(d => new Date(d.t + ZONA).getUTCDate() + "/" + (new Date(d.t + ZONA).getUTCMonth() + 1)),
      /* La línea de facturación va dibujada por encima de las barras (order 0) */
      datasets: [
        { type: "line", label: "Facturación neta (US$)", data: dias.map(d => Math.round(d.fact * 100) / 100),
          borderColor: "#2a4927", backgroundColor: "#2a4927", borderWidth: 2.5, pointRadius: 2.5,
          pointBackgroundColor: "#fff", pointBorderWidth: 1.5, tension: .3, yAxisID: "y2", order: 0 },
        { type: "bar", label: "Ventas", data: dias.map(d => d.ventas), backgroundColor: "rgba(193,225,135,.75)",
          borderRadius: 6, yAxisID: "y", order: 1 },
        { type: "bar", label: "Devoluciones (US$)", data: dias.map(d => d.devuelto ? -Math.round(d.devuelto * 100) / 100 : null),
          backgroundColor: "#d9654d", borderRadius: 6, minBarLength: 6, yAxisID: "y2", order: 2 }
      ]
    },
    options: {
      plugins: {
        legend: { labels: { font: { family: "DM Sans" }, boxWidth: 12 } },
        tooltip: { callbacks: { label: c => c.dataset.yAxisID === "y2"
          ? " " + (c.raw < 0 ? usd(-c.raw) + " devueltos" : "Facturación neta: " + usd(c.raw))
          : " " + num(c.raw) + (c.raw === 1 ? " venta" : " ventas") } }
      },
      scales: {
        y: { min: -maxVentas * parte, max: maxVentas, title: { display: true, text: "Ventas" },
             ticks: { precision: 0, callback: v => v < 0 || !Number.isInteger(v) ? "" : v } },
        y2: { min: -maxSale, max: maxFact, position: "right", grid: { display: false }, title: { display: true, text: "US$" },
              /* solo números redondos: los bordes calculados (260,8…) no se escriben */
              ticks: { callback: v => v < 0 || Math.abs(v - Math.round(v / 10) * 10) > .01 ? "" : Math.round(v).toLocaleString("es-CO") } }
      }
    }
  });

  /* Países y formas de pago del periodo */
  /* limite: cuántas filas se ven de entrada; el resto, con «Mostrar más» */
  const agrupar = (clave, nombre, limite) => {
    const g = new Map();
    act.pagos.forEach(p => {
      const k = p[clave] || "—";
      if (!g.has(k)) g.set(k, { ventas: 0, fact: 0 });
      g.get(k).ventas++; g.get(k).fact += p.valor;
    });
    const filas = [...g.entries()].sort((x, y) => y[1].ventas - x[1].ventas);
    if (!filas.length) return '<p class="vacio">No hay ventas en este periodo.</p>';
    const max = filas[0][1].ventas;
    const resto = limite ? filas.length - limite : 0;
    return '<div class="vt-barras">' + filas.map(([k, v], i) =>
      '<div class="vt-barra-fila"' + (limite && i >= limite ? ' data-resto hidden' : '') + '><span class="vt-barra-nombre">' + escapar(nombre(k)) + '</span>' +
      '<span class="vt-barra"><span style="width:' + (v.ventas / max * 100) + '%"></span></span>' +
      '<span class="vt-barra-num">' + num(v.ventas) + ' · ' + escapar(usd(v.fact)) + '</span></div>').join("") + '</div>' +
      (resto > 0 ? '<button class="enlace vt-mas" type="button" data-mas>Mostrar ' + resto + ' más</button>' : '');
  };
  const paises = document.getElementById("vr-paises");
  paises.innerHTML = agrupar("pais", k => k === "—" ? "Sin país" : nombrePais(k), 5);
  const mas = paises.querySelector("[data-mas]");
  if (mas) mas.addEventListener("click", () => {
    const ocultos = paises.querySelectorAll("[data-resto]");
    const abrir = ocultos[0].hidden;
    ocultos.forEach(f => { f.hidden = !abrir; });
    mas.textContent = abrir ? "Mostrar menos" : "Mostrar " + ocultos.length + " más";
  });
  document.getElementById("vr-formas").innerHTML = agrupar("forma", k => FORMAS[k] || (k === "—" ? "Sin dato" : k));
}
