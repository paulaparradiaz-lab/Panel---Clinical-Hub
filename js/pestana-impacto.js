/* ============================================================
   CLINICAL HUB · PESTAÑA IMPACTO (panel nuevo)
   ¿Bajaron las críticas después de cada mejora? Una tarjeta por cada
   indicador (mejora global: lo que dicen de toda la plataforma), con
   las mejoras completadas puestas sobre su línea de tiempo.

   TODO VA EN PORCENTAJE: de los médicos que opinaron en cada semana
   (los que respondieron la encuesta del sitio o escribieron por
   WhatsApp), qué parte se quejó de ese indicador. Así, si llegan más
   médicos (y con ellos más críticas), la gráfica no sube sola. El
   buscador no cuenta: ahí nadie opina, solo se buscan temas. Una semana
   con menos de 10 opiniones no se calcula: sale en gris, «pocos datos».

   GRÁFICA      Porcentaje por semana y, pasados 6 meses de historia, por
                mes, desde el 15 de agosto de 2026; en el color del indicador.
                La línea punteada es la tendencia: el porcentaje de las
                últimas 4 semanas (o 3 meses) juntas.
   MEJORAS      Sobre la gráfica, solo las completadas: una raya con su
                número el día en que se completó cada una. Debajo, la
                lista de esas mejoras para saber qué es cada número.

   La fecha que manda es completada_en de la mejora (se pone sola al
   completarla y se puede escribir a mano para mejoras del pasado).
   Lee v_ia_feedback, mejoras_ia, mejora_ia_tema y mejora_ia_historial.
   ============================================================ */
import { sb, $, escapar, fechaCorta, num, avisar, traducirError } from "./nucleo.js";
import { catalogo, cargarCatalogo, cargarMejoras, nombreDe, RUIDO, colorIndicador } from "./ia.js";
import { ventanaComentarios, plural } from "./ia-ventanas.js";

const DIAS_PARA_IR_POR_MES = 182;     // pasados ~6 meses de historia, la gráfica va por mes
const MINIMO = 10;                    // con menos opiniones que esto, «pocos datos»
/* Las gráficas arrancan el 15 de agosto de 2026: lo de antes era muy poco
   y suelto (dos feedbacks de abril) y solo alargaba la línea en cero. */
const DESDE = new Date(2026, 7, 15).getTime();
/* Los canales donde el médico opina (y puede quejarse). El buscador
   queda fuera: solo registra temas buscados, nunca críticas. */
const CANALES_OPINION = ["encuesta-modal", "whatsapp"];
const DIA = 864e5;
const ICONO_INDICADOR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>';

let indicadores = [];
let escuchando = false;           // el aviso de cambio de tamaño se pone una sola vez

/* Alto de cada gráfica: el mismo de la de estrellas en Métricas. Se
   dibuja al ancho real de su tarjeta (también como aquella), así la letra
   no se achica en pantallas angostas. */
const ALTO = 210;

/* ============================================================
   1. Armazón
   ============================================================ */
export async function render(){
  $("#vista").innerHTML = `
<div class="cabecera cabecera-compacta">
  <div>
    <div class="mast"><span class="etiqueta">Lo que cambió después de cada mejora</span><h1>Impacto</h1></div>
    <p>Qué parte de los médicos que opinan se queja de cada indicador, y cómo cambia después de cada mejora.</p>
  </div>
  <button class="boton-recargar" id="btn-recargar" data-tip="Actualizar" aria-label="Actualizar">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 13A8.5 8.5 0 1 1 18 6.6L20.5 9"/><path d="M20.5 4v5h-5"/></svg>
  </button>
</div>

<p class="aviso" id="aviso-panel" role="status"></p>
<p class="resumen-sub" id="resumen-impacto"></p>

<section class="caja" style="margin-top:14px">
  <div class="fila-entre cabeza-seccion">
    <div><h2 class="titulo-seccion">Críticas y mejoras por indicador</h2><p class="subtitulo-seccion" id="impacto-desde">Toda la historia</p></div>
    <button class="enlace-ayuda" id="btn-ayuda-impacto" aria-expanded="false" aria-controls="ayuda-impacto">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>
      ¿Cómo funciona?</button>
  </div>
  <div class="ayuda-plegable" id="ayuda-impacto" hidden>
    <p class="mini">Cada tarjeta es un <b>indicador</b>: una mejora global, lo que dicen los médicos de toda la
    plataforma. <b>La línea</b> es el <b>porcentaje de los médicos que opinaron</b> esa semana (o ese mes, cuando la
    historia pase de 6 meses) que se quejó de ese indicador. Por ejemplo, si una semana 20 médicos respondieron la
    encuesta o escribieron por WhatsApp y 3 se quejaron de falta de temas, ese punto marca 15 %. Se mide en
    porcentaje para que, si llegan más médicos, la gráfica no suba solo por eso.</p>
    <p class="mini"><b>Quiénes cuentan:</b> solo la <b>encuesta del sitio</b> y <b>WhatsApp</b>, que es donde el médico
    opina. El buscador no cuenta: ahí solo se buscan temas, nunca llegan críticas, y si se usa mucho una semana
    haría parecer que las críticas bajaron.</p>
    <p class="mini"><b>Cada punto es una semana de lunes a domingo</b>, fija: no se corre de un día para otro. Cada
    lunes aparece un punto nuevo. El último es la <b>semana en curso</b> (punto hueco): todavía le faltan días, así
    que su porcentaje puede cambiar hasta el domingo.</p>
    <p class="mini"><b>«Pocos datos»</b> (punto gris): semanas en que opinaron menos de 10 médicos. Con tan pocos, una
    sola crítica da un porcentaje que asusta y no significa nada, así que no se calcula.</p>
    <p class="mini"><b>La línea punteada</b> es la tendencia: el porcentaje de las últimas 4 semanas juntas (o 3
    meses). Suaviza los altibajos para ver si, con el tiempo, las críticas van bajando.</p>
    <p class="mini"><b>Las mejoras completadas</b> se ven sobre la línea: una <b>raya con su número</b> el día en
    que se completó. Mira qué hace la línea después de cada raya: si baja y se queda abajo, las críticas de ese
    indicador disminuyeron. <b>Debajo</b> está la lista de esas mejoras, para saber qué es cada número. La fecha
    es la de «Completada el», que puedes escribir a mano si se hizo antes, por fuera del sistema.</p>
    <p class="mini"><b>«Ver comentarios»</b> abre lo que escribieron los médicos sobre ese indicador.</p>
    <p class="mini"><b>Fechas:</b> el número de críticas de cada indicador y «Ver comentarios» incluyen <b>todo el
    historial</b>; la gráfica muestra <b>desde el 15 de agosto</b>. Por eso los números no siempre cuadran exactamente
    con lo que se ve en la línea.</p>
  </div>
  <div id="impacto-indicadores" class="impacto-indicadores"><p class="vacio">Cargando…</p></div>
</section>`;

  $("#btn-recargar").addEventListener("click", async () => {
    const b = $("#btn-recargar");
    if (b.classList.contains("girando")) return;
    b.classList.add("girando");
    try { await cargar(); } finally { b.classList.remove("girando"); }
  });
  $("#btn-ayuda-impacto").addEventListener("click", () => {
    const ayuda = $("#ayuda-impacto");
    ayuda.hidden = !ayuda.hidden;
    $("#btn-ayuda-impacto").setAttribute("aria-expanded", String(!ayuda.hidden));
  });
  $("#impacto-indicadores").addEventListener("click", e => {
    const b = e.target.closest("[data-comentarios]");
    if (b) abrirComentarios(indicadores[Number(b.dataset.comentarios)]);
  });

  await cargar();
}

/* ============================================================
   2. Datos
   ============================================================ */
async function cargar(){
  let fb, hist, datos;
  try {
    [fb, hist, datos] = await Promise.all([
      sb.from("v_ia_feedback").select("*"),
      sb.from("mejora_ia_historial").select("mejora_id, estado, cambiado_en").order("cambiado_en"),
      cargarMejoras(),
      cargarCatalogo()
    ]);
    if (fb.error) throw fb.error;
    if (hist.error) throw hist.error;
  } catch (err){
    if (!$("#impacto-indicadores")) return;
    $("#impacto-indicadores").innerHTML = '<p class="vacio">No se pudo leer el impacto. ' +
      escapar(traducirError(err && err.message)) + '</p>';
    return;
  }
  if (!$("#impacto-indicadores")) return;
  /* Los que opinaron: encuesta y WhatsApp, también lo que sigue en el
     Inbox (son médicos que escribieron). De ahí salen el total y las
     críticas, para que el porcentaje nunca pase de 100. */
  const opinaron = (fb.data || []).filter(x => CANALES_OPINION.indexOf(x.origen) > -1);
  const todos = opinaron.map(x => new Date(x.fecha).getTime()).filter(t => !isNaN(t));
  const clasificadas = opinaron.filter(x => x.estado !== "por_revisar");

  /* Fechas de cada mejora: la última vez que entró a cada estado. La
     de completada escrita en la mejora manda sobre el historial. */
  const fechas = new Map();
  (hist.data || []).forEach(h => {
    const o = fechas.get(h.mejora_id) || {};
    o[h.estado] = new Date(h.cambiado_en);
    fechas.set(h.mejora_id, o);
  });
  const fechasDe = m => {
    const f = Object.assign({ pendiente: new Date(m.creado_en) }, fechas.get(m.id) || {});
    if (m.completada_en) f.hecha = new Date(m.completada_en);
    return f;
  };

  /* Todas las gráficas arrancan el mismo día (el 15 de agosto, o la
     primera opinión si es después) para poder compararlas; si la
     historia pasa de 6 meses, van por mes */
  const fin = Date.now();
  const inicio = Math.min(fin - 7 * DIA, Math.max(DESDE, Math.min(...todos.concat([fin]))));
  const modo = (fin - inicio) / DIA > DIAS_PARA_IR_POR_MES ? "mes" : "semana";
  $("#impacto-desde").textContent = "Desde el " + fechaCorta(new Date(inicio)) + ", por " +
    (modo === "semana" ? "semana (lunes a domingo)" : "mes") +
    " · % de los médicos que opinaron (encuesta y WhatsApp)";
  indicadores = catalogo.mejoras.filter(c => c.slug !== RUIDO).map(c => {
    const lista = clasificadas.filter(x => (x.mejoras || []).indexOf(c.slug) > -1);
    const dias = lista.map(x => new Date(x.fecha).getTime()).filter(t => !isNaN(t));
    const ids = new Set(datos.enlaces.filter(e => e.tema_slug === c.slug).map(e => e.mejora_id));
    /* Solo las completadas, de la más antigua a la más reciente */
    const mejoras = datos.mejoras
      .filter(m => ids.has(m.id) && m.estado === "hecha")
      .map(m => ({ mejora: m, fechas: fechasDe(m) }))
      .filter(r => r.fechas.hecha)
      .sort((a, b) => a.fechas.hecha - b.fechas.hecha);
    return { slug: c.slug, lista: lista, mejoras: mejoras, modo: modo,
      periodos: periodos(dias, todos, inicio, fin, modo) };
  })
  /* Primero los que tienen mejoras; luego los más criticados */
  .sort((a, b) => (Math.min(b.mejoras.length, 1) - Math.min(a.mejoras.length, 1)) || (b.lista.length - a.lista.length));
  pintar();
}

/* Los puntos de la gráfica: periodos FIJOS del calendario, que no se
   corren de un día para otro.
   Por semana: de lunes a domingo, desde la semana que contiene la fecha
   de inicio; cada lunes aparece un punto nuevo.
   Por mes: meses del calendario.
   El último periodo es el que va corriendo («en curso»): todavía le
   faltan días y su porcentaje puede cambiar.
   Cada punto: n críticas del indicador, total de opiniones y el %
   (null si opinaron menos de 10). */
function periodos(dias, todos, inicio, fin, modo){
  const lista = [];
  if (modo === "semana"){
    const d = new Date(inicio);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));        // el lunes de esa semana
    while (d.getTime() <= fin){
      const desde = d.getTime();
      d.setDate(d.getDate() + 7);
      lista.push({ desde: desde, hasta: d.getTime() });
    }
  } else {
    const d = new Date(inicio);
    let a = d.getFullYear(), m = d.getMonth();
    while (new Date(a, m, 1).getTime() <= fin){
      lista.push({ desde: new Date(a, m, 1).getTime(), hasta: new Date(a, m + 1, 1).getTime() });
      m++; if (m > 11){ m = 0; a++; }
    }
  }
  lista.forEach(p => {
    p.enCurso = p.hasta > fin;
    p.n = dias.filter(t => t >= p.desde && t < p.hasta).length;
    p.total = todos.filter(t => t >= p.desde && t < p.hasta).length;
    p.pct = p.total >= MINIMO ? p.n / p.total * 100 : null;
  });
  return lista;
}

const pct = v => (v < 10 && v > 0 ? v.toFixed(1).replace(".", ",") : Math.round(v)) + " %";

/* ============================================================
   3. Pintado
   ============================================================ */
function pintar(){
  const conMejoras = indicadores.filter(o => o.mejoras.length).length;
  const completadas = indicadores.reduce((s, o) => s + o.mejoras.length, 0);
  $("#resumen-impacto").innerHTML = "<b>" + num(indicadores.length) + "</b> indicadores · <b>" + num(conMejoras) +
    "</b> con mejoras completadas · <b>" + num(completadas) + "</b> mejoras completadas";

  if (!indicadores.length){
    $("#impacto-indicadores").innerHTML = '<p class="vacio">Todavía no hay indicadores. Créalos con «Nueva etiqueta» ' +
      'en el ranking de mejoras globales de Feedback › Métricas.</p>';
    return;
  }
  /* El ancho real de la gráfica: el de la lista menos el relleno de la tarjeta */
  anchoGrafica = Math.max(280, Math.round(($("#impacto-indicadores").clientWidth || 640) - 32));
  $("#impacto-indicadores").innerHTML = indicadores.map(tarjeta).join("");
  if (!escuchando){
    escuchando = true;
    let espera;
    window.addEventListener("resize", () => {
      clearTimeout(espera);
      espera = setTimeout(() => { if ($("#impacto-indicadores") && indicadores.length) pintar(); }, 150);
    });
  }
}
let anchoGrafica = 640;

function tarjeta(o, i){
  return '<article class="impacto-indicador" style="--c:' + colorIndicador(o.slug) + '">' +
    '<div class="impacto-indicador-cab">' +
      '<span class="indicador-item">' + ICONO_INDICADOR + '<b>' + escapar(nombreDe(o.slug)) + '</b></span>' +
      '<span class="mini">' + plural(o.lista.length, "crítica", "críticas") + ' · ' +
        plural(o.mejoras.length, "mejora completada", "mejoras completadas") + '</span>' +
      '<button class="enlace-formas" data-comentarios="' + i + '">Ver comentarios</button>' +
    '</div>' +
    grafica(o) + leyenda(o) +
    (o.mejoras.length
      ? '<ul class="impacto-mejoras">' + o.mejoras.map(renglon).join("") + '</ul>'
      : '<p class="mini impacto-sin">Todavía no hay mejoras completadas en este indicador.</p>') +
  '</article>';
}

/* Qué es cada cosa de la gráfica, en una línea */
function leyenda(o){
  const por = o.modo === "mes" ? "mes" : "semana";
  const k = o.modo === "mes" ? "3 meses" : "4 semanas";
  return '<div class="impacto-leyenda">' +
    '<span><i class="ley-linea"></i>% de los que opinaron cada ' + por + ' que se quejó de esto</span>' +
    '<span><i class="ley-tendencia"></i>Tendencia: las últimas ' + k + ' juntas</span>' +
    (o.periodos.some(p => p.pct === null) ? '<span><i class="ley-pocos"></i>Pocos datos (opinaron menos de ' + MINIMO + ')</span>' : '') +
    '<span><i class="ley-curso"></i>' + (o.modo === "mes" ? "Mes" : "Semana") + ' en curso (puede cambiar)</span>' +
    (o.mejoras.length ? '<span><i class="ley-hito">#</i>Mejora completada</span>' : '') +
  '</div>';
}

/* Cada mejora completada: su número, su nombre y cuándo se completó */
function renglon(r){
  return '<li>' +
    '<span class="impacto-num">' + r.mejora.id + '</span>' +
    '<span class="impacto-txt"><b>' + escapar(r.mejora.titulo) + '</b><small>completada el ' +
      fechaCorta(r.fechas.hecha) + '</small></span>' +
  '</li>';
}

/* % de los que opinaron por periodo y, encima, las mejoras completadas
   (una raya numerada el día en que se completó cada una). Los periodos
   con pocos datos cortan la línea y salen como un punto gris abajo. La
   línea punteada es la tendencia: las críticas y las opiniones de los
   últimos 4 (semanas) o 3 (meses) periodos juntos. */
function grafica(o){
  const w = anchoGrafica, h = ALTO, izq = 36, der = 14, arr = 34, abj = 28;
  const P = o.periodos, N = P.length;
  const conDato = P.filter(p => p.pct !== null).map(p => p.pct);
  const tope = Math.max(10, Math.ceil(Math.max(0, ...conDato) / 10) * 10);
  const x = i => izq + i * (w - izq - der) / Math.max(1, N - 1);
  const y = v => h - abj - v / tope * (h - arr - abj);
  /* Cada punto va en la mitad de su semana (o mes): una mejora se ubica
     entre los puntos según su fecha */
  const medio = p => (p.desde + p.hasta) / 2;
  const t0 = medio(P[0]), t1 = medio(P[N - 1]);
  const xFecha = t => izq + Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) * (w - izq - der);
  const dentro = t => t >= P[0].desde && t < P[N - 1].hasta;
  const domingo = p => new Date(p.hasta - DIA);
  const etiqueta = p => o.modo === "mes"
    ? new Date(p.desde).toLocaleDateString("es-CO", { month:"short", year:"2-digit" })
    : fechaCorta(new Date(p.desde));

  const salto = Math.max(1, Math.ceil(N / 6));
  const ejes = [0, tope / 2, tope].map(v => '<line class="' + (v ? "guia" : "base") + '" x1="' + izq + '" x2="' + (w - der) +
      '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="eje" x="' + (izq - 6) + '" y="' + (y(v) + 4) +
      '" text-anchor="end">' + Math.round(v) + '%</text>').join("") +
    P.map((p, i) => (N - 1 - i) % salto === 0
      ? '<text class="eje" x="' + x(i) + '" y="' + (h - 6) + '" text-anchor="middle">' + etiqueta(p) + '</text>' : '').join("");

  /* Rayas de las completadas; si dos quedan muy juntas, la etiqueta se corre */
  let ultima = -99, nivel = 0;
  const rayas = o.mejoras.filter(r => dentro(r.fechas.hecha.getTime()))
    .map(r => {
      const px = xFecha(r.fechas.hecha.getTime());
      nivel = px - ultima < 30 ? (nivel + 1) % 2 : 0;
      ultima = px;
      const cx = px + (nivel ? 16 : 0);
      return '<g class="hito"><title>#' + r.mejora.id + ' ' + escapar(r.mejora.titulo) + ' · completada el ' +
          fechaCorta(r.fechas.hecha) + '</title>' +
        '<line x1="' + px + '" x2="' + px + '" y1="' + (arr - 6) + '" y2="' + (h - abj) + '"/>' +
        '<circle cx="' + cx + '" cy="12" r="10"/><text x="' + cx + '" y="16" text-anchor="middle">' +
          r.mejora.id + '</text></g>';
    }).join("");

  /* La línea se corta donde hay pocos datos */
  const tramos = [];
  let tramo = [];
  P.forEach((p, i) => {
    if (p.pct === null){ if (tramo.length) tramos.push(tramo); tramo = []; }
    else tramo.push(i);
  });
  if (tramo.length) tramos.push(tramo);
  const camino = t => t.map((i, j) => (j ? "L" : "M") + x(i).toFixed(1) + " " + y(P[i].pct).toFixed(1)).join(" ");
  const areas = tramos.filter(t => t.length > 1).map(t => '<path class="area" d="' + camino(t) + ' L ' + x(t[t.length - 1]) +
    ' ' + y(0) + ' L ' + x(t[0]) + ' ' + y(0) + ' Z"/>').join("");
  const trazos = tramos.map(t => '<path class="trazo" d="' + camino(t) + '"/>').join("");

  const ancho = Math.min(24, (w - izq - der) / Math.max(1, N - 1));
  const quien = p => (o.modo === "mes" ? "Mes de " + etiqueta(p)
    : "Semana del " + fechaCorta(new Date(p.desde)) + " al " + fechaCorta(domingo(p))) +
    (p.enCurso ? " (en curso: todavía faltan días)" : "");
  const puntos = P.map((p, i) =>
    '<g><rect x="' + (x(i) - ancho / 2) + '" y="' + arr + '" width="' + ancho + '" height="' + (h - arr - abj) + '" fill="transparent">' +
      '<title>' + quien(p) + ': ' + (p.pct === null
        ? 'pocos datos (opinaron ' + p.total + ')'
        : pct(p.pct) + ' · ' + p.n + ' de ' + p.total + ' que opinaron') + '</title></rect>' +
    (p.pct === null
      ? '<circle class="pocos" cx="' + x(i) + '" cy="' + y(0) + '" r="3" pointer-events="none"/>'
      : '<circle class="punto' + (p.enCurso ? ' en-curso' : '') + '" cx="' + x(i) + '" cy="' + y(p.pct) + '" r="' +
          (p.enCurso ? 4.5 : N > 30 ? 2.5 : 3.5) + '" pointer-events="none"/>') +
    '</g>').join("");

  /* Tendencia: críticas y opiniones de los últimos k periodos juntos */
  const k = o.modo === "mes" ? 3 : 4;
  const unidad = o.modo === "mes" ? "meses" : "semanas";
  const tend = P.map((p, i) => {
    if (i < k - 1) return null;
    const v = P.slice(i - k + 1, i + 1);
    const total = v.reduce((s, q) => s + q.total, 0);
    return total >= MINIMO ? v.reduce((s, q) => s + q.n, 0) / total * 100 : null;
  });
  let dT = "", sigue = false;
  tend.forEach((v, i) => {
    if (v === null){ sigue = false; return; }
    dT += (sigue ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1) + " ";
    sigue = true;
  });
  const ult = tend[N - 1];
  const tendencia = dT
    ? '<path class="tendencia" d="' + dT + '"><title>Tendencia: las últimas ' + k + ' ' + unidad + ' juntas</title></path>' +
      (ult !== null ? '<text class="tendencia-txt" x="' + (x(N - 1) - 6) + '" y="' + (y(ult) - 8) +
        '" text-anchor="end">últimas ' + k + ' ' + unidad + ': ' + pct(ult) + '</text>' : '')
    : '';

  return '<svg class="impacto-grafica" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Porcentaje de los médicos que se quejó de ' +
      escapar(nombreDe(o.slug)) + ' y sus mejoras">' +
    ejes + areas + trazos + tendencia + puntos + rayas +
  '</svg>';
}

/* «Ver comentarios»: lo que escribieron sobre ese indicador */
function abrirComentarios(o){
  if (!o) return;
  ventanaComentarios({
    titulo: nombreDe(o.slug),
    guia: plural(o.lista.length, "comentario", "comentarios"),
    intro: "Lo que escribió cada médico sobre esto, tal cual llegó. Si alguno no es de aquí, reclasifícalo o devuélvelo al Inbox.",
    lista: o.lista.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha)),
    alCambiar: async texto => { avisar(texto, "ok", "#aviso-panel"); await cargar(); }
  });
}
