/* ============================================================
   CLINICAL HUB · FEEDBACK › MÉTRICAS
   El tablero: todo histórico, sin selector de fechas.

   ESTRELLAS   Promedio de estrellas por mes, en chupetes con la nota,
               la ★ y cuántas reseñas, sobre un área sombreada del
               color de cada nivel.
   CRÍTICAS    Ranking de críticas: los tipos de mejora global en la
               misma tabla que temas (veces, países, estrellas con su
               color y globito), cada uno con sus mejoras: crear, ver y
               desvincular, con el filtro con / sin mejora.
   TEMAS       El ranking de temas pedidos, al final, con sus mejoras y
               acciones (vive en ranking-temas.js).

   Los rankings cuentan solo lo ya clasificado (auto o revisado): lo
   que la IA dejó por revisar vive en el Inbox y suma aquí en cuanto
   se clasifica. Las estrellas cuentan todas, porque la nota del
   médico no depende de la clasificación.

   Lee public.v_ia_feedback, public.v_ia_mejoras, mejoras_ia y
   mejora_ia_tema.
   ============================================================ */
import { sb, $, COLORES, escapar, num, pct, avisar, traducirError, abrirVentana, cerrarVentana,
  leer } from "./nucleo.js";
import { RUIDO, cargarCatalogo, cargarMejoras, mejorasPorSlug, nombreDe, renombrarTema, tieneTexto,
  quitarMejoraTecnica } from "./ia.js";
import { ventanaComentarios, plural } from "./ia-ventanas.js";
import { ventanaCrearMejora, ventanaVerMejora, ventanaDesvincular, ventanaNuevaEtiqueta, ventanaMejorasDe } from "./mejora-ventanas.js";
import * as rankingTemas from "./ranking-temas.js";

/* ============================================================
   1. Armazón de la subpestaña (vive dentro de Feedback)
   ============================================================ */
export async function render(caja){
  caja.innerHTML = armazon();
  rankingTemas.conectar(cargar);
  $("#btn-ayuda-estrellas").addEventListener("click", () => {
    const ayuda = $("#ayuda-estrellas");
    ayuda.hidden = !ayuda.hidden;
    $("#btn-ayuda-estrellas").setAttribute("aria-expanded", String(!ayuda.hidden));
  });
  $("#btn-ayuda-mejoras").addEventListener("click", () => {
    const ayuda = $("#ayuda-mejoras");
    ayuda.hidden = !ayuda.hidden;
    $("#btn-ayuda-mejoras").setAttribute("aria-expanded", String(!ayuda.hidden));
  });
  pintarChipsMejoras();
  $("#btn-nueva-global").addEventListener("click", () => ventanaNuevaEtiqueta({ tipo: "mejora",
    alCambiar: async texto => { avisar(texto, "ok", "#aviso-panel"); await cargar(); } }));
  $("#ranking-criticas").addEventListener("click", e => {
    const ver = e.target.closest("[data-ver-critica]");
    if (ver){ ocultarGloboCritica(); abrirCritica(ordenCriticas[Number(ver.dataset.verCritica)]); return; }
    const nota = e.target.closest("[data-globo-critica]");
    if (nota){ mostrarGloboCritica(nota); return; }
    const bt = e.target.closest("button[data-tema-accion]");
    const tr = bt && bt.closest("tr");
    if (!bt || !tr) return;
    const i = Array.from(tr.parentNode.children).indexOf(tr);
    accionMejora(bt.dataset.temaAccion, ordenCriticas[i], clasificadasCriticas);
  });
  $("#ranking-criticas").addEventListener("mouseover", e => {
    const nota = e.target.closest("[data-globo-critica]");
    if (nota) mostrarGloboCritica(nota);
  });
  $("#ranking-criticas").addEventListener("mouseout", e => {
    if (e.target.closest("[data-globo-critica]")) ocultarGloboCritica();
  });
  $("#f-foco-mejoras").addEventListener("click", e => {
    const b = e.target.closest("button[data-v]");
    if (!b) return;
    focoMejoras = b.dataset.v;
    pintarChipsMejoras();
    if (ultimo) pintarMejoras(ultimo.lista, ultimo.filas);
  });
  await cargar();
}

export function recargar(){ return cargar(); }

function armazon(){
  return `
<p class="aviso" id="aviso-panel" role="status"></p>
<p class="resumen-sub" id="resumen-metricas"></p>

<section class="caja" style="margin-top:14px">
  <div class="fila-entre cabeza-seccion">
    <div><h2 class="titulo-seccion">Ranking de estrellas</h2><p class="subtitulo-seccion">Promedio de estrellas por mes</p></div>
    <button class="enlace-ayuda" id="btn-ayuda-estrellas" aria-expanded="false" aria-controls="ayuda-estrellas">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>
      ¿Cómo funciona?</button>
  </div>
  <div class="ayuda-plegable" id="ayuda-estrellas" hidden>
    <p class="mini">Cada <b>bolita es un mes</b> y su altura es el promedio de estrellas que pusieron los
    médicos ese mes (de 1 a 5). Cuenta todas las calificaciones, también las que llegan solo con estrellas.</p>
    <p class="mini"><b>El número de arriba</b> ("3,9 ★") es ese promedio y <b>el de abajo</b>, cuántas reseñas lo
    forman: con pocas reseñas el promedio puede engañar.</p>
    <p class="mini"><b>El color</b> de cada bolita indica qué tan bien calificaron ese mes:</p>
    <ul class="lista-niveles">
      <li><i style="background:#1fa15a"></i><b>Excelente:</b> de 4,5 a 5 estrellas</li>
      <li><i style="background:#2f6fed"></i><b>Muy bien:</b> de 4 a 4,5</li>
      <li><i style="background:#e5a117"></i><b>Regular:</b> de 3,5 a 4</li>
      <li><i style="background:#dc4a3d"></i><b>Malo:</b> menos de 3,5</li>
    </ul>
    <p class="mini"><b>El área sombreada</b> une los meses para ver si la nota sube o baja, y <b>el palito
    punteado</b> ubica cada mes en la línea de abajo. Solo salen los meses que tuvieron feedback.</p>
    <p class="mini"><b>Pasa el mouse</b> (o toca) una bolita para ver cuántas notas hubo de cada estrella ese mes
    y el total.</p>
  </div>
  <div id="tendencia"><p class="vacio">Cargando…</p></div>
</section>


<section class="caja" style="margin-top:16px">
  <div class="fila-entre cabeza-seccion">
    <div><h2 class="titulo-seccion">Ranking de críticas</h2><p class="subtitulo-seccion">Lo que dicen de la plataforma</p></div>
    <button class="enlace-ayuda" id="btn-ayuda-mejoras" aria-expanded="false" aria-controls="ayuda-mejoras">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>
      ¿Cómo funciona?</button>
  </div>
  <div class="ayuda-plegable" id="ayuda-mejoras" hidden>
    <p class="mini">Cada fila es una <b>crítica</b>: un tipo de lo que los médicos dicen de la plataforma (no de un
    tema clínico), ya clasificado por la IA o por ti. Es la misma tabla del ranking de temas: <b>Veces</b> es cuántos
    comentarios cayeron ahí, <b>Países</b> desde cuántos países, y <b>Estrellas</b> el promedio que pusieron esos
    médicos al comentar (solo cuentan los que calificaron). El color de las estrellas usa la misma escala de la
    gráfica de estrellas:</p>
    <ul class="lista-niveles">
      <li><i style="background:#1fa15a"></i><b>Excelente:</b> de 4,5 a 5 estrellas</li>
      <li><i style="background:#2f6fed"></i><b>Muy bien:</b> de 4 a 4,5</li>
      <li><i style="background:#e5a117"></i><b>Regular:</b> de 3,5 a 4</li>
      <li><i style="background:#dc4a3d"></i><b>Malo:</b> menos de 3,5</li>
    </ul>
    <p class="mini"><b>Pasa el mouse</b> (o toca) las estrellas para ver cuántas notas hubo de cada una: con pocas
    notas el promedio puede engañar. <b>El texto subrayado</b> abre los comentarios reales; desde ahí puedes
    reclasificar cualquiera o devolverlo al Inbox.</p>
    <p class="mini"><b>La mejora</b> se enlaza a la crítica completa, que es su indicador en Impacto: <b>Crear
    mejora</b> hace una nueva (con esta crítica ya marcada como su indicador, su estado y, si ya se hizo, la fecha
    en que se completó) o la enlaza a una que ya existe; <b>el ojo</b> la ve y edita y <b>la cadena rota</b> se la
    quita sin borrarla. Si una crítica tiene varias mejoras (por ejemplo, «Cantidad de temas», donde cada guía
    publicada es una), dice cuántas y el ojo abre la lista para elegir cuál ver o desvincular. No se puede
    desvincular el único indicador de una mejora: quedaría sin nada que medir en Impacto; se cambia en la pestaña
    Mejoras. El filtro deja ver <b>Todos</b>, solo los <b>Sin mejora</b> o solo los <b>Con mejora</b>.</p>
    <p class="mini"><b>El lápiz</b> cambia el nombre (la IA sigue usando el mismo) y <b>la caneca</b> le quita
    esa crítica a sus comentarios sin borrar nada: lo que queda sin clasificar vuelve al Inbox. <b>Nueva
    etiqueta</b> crea una crítica nueva: aparece aquí cuando tenga su primer comentario.</p>
    <p class="mini"><b>Ruido</b> es la última fila, en gris: lo que se descartó porque no decía nada aprovechable. Solo
    cuenta lo que trae texto: lo que llega solo con estrellas es una calificación, no ruido. Tócala para revisarlo;
    solo sale con el filtro Todos.</p>
  </div>
  <div class="filtros-fila">
    <span class="rotulo">Mejora</span>
    <div class="filtros" id="f-foco-mejoras" role="group" aria-label="Estado de mejora"></div>
    <button class="boton-chico boton-nueva" id="btn-nueva-global">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Nueva etiqueta</button>
  </div>
  <div id="ranking-criticas"><p class="vacio">Cargando…</p></div>
</section>

${rankingTemas.armazon()}
`;
}

/* ============================================================
   2. Datos
   ============================================================ */
async function cargar(){
  let fb, mj, datosMejoras;
  try {
    [fb, mj, datosMejoras] = await Promise.all([
      sb.from("v_ia_feedback").select("*"),
      sb.from("v_ia_mejoras").select("*").order("veces", { ascending:false }),
      cargarMejoras(),
      cargarCatalogo()
    ]);
    const error = fb.error || mj.error;
    if (error) throw error;
  } catch (err){
    if (!$("#tendencia")) return;
    const aviso = '<p class="vacio">No se pudieron leer las métricas. ' + escapar(traducirError(err && err.message)) + '</p>';
    ["#tendencia", "#ranking", "#ranking-criticas"].forEach(s => { $(s).innerHTML = aviso; });
    return;
  }
  /* Si mientras cargaba te fuiste al Inbox, no hay dónde pintar */
  if (!$("#tendencia")) return;
  pintarResumen(fb.data || []);
  pintarEstrellas(fb.data || []);
  rankingTemas.pintar(fb.data || [], datosMejoras);
  mejorasIA = datosMejoras.mejoras;
  datosMej = datosMejoras;
  mejorasDe = mejorasPorSlug(datosMejoras);
  pintarMejoras(mj.data || [], fb.data || []);
}

function pintarResumen(filas){
  const notas = filas.filter(x => x.estrellas != null);
  const prom = notas.length ? notas.reduce((a, x) => a + x.estrellas, 0) / notas.length : null;
  /* Misma regla que v_ia_por_revisar: solo cuenta lo que tiene texto */
  const pendientes = filas.filter(x => x.estado === "por_revisar" &&
    [x.tema_puntual, x.mejora_texto, x.guia_de_referencia].some(t => String(t || "").trim())).length;
  /* Si algo volvió al Inbox (por ejemplo, al quitar un tema), el globito se entera */
  document.dispatchEvent(new CustomEvent("ch-pendientes", { detail: pendientes }));
  $("#resumen-metricas").innerHTML = "<b>" + num(filas.length) + "</b> feedbacks · <b>" +
    (prom == null ? "—" : prom.toFixed(2).replace(".", ",")) + "</b> estrellas de promedio con " +
    num(notas.length) + " calificaciones" +
    (pendientes ? " · <b>" + num(pendientes) + "</b> en el Inbox, sin sumar todavía" : "");
}

/* ============================================================
   3. Ranking de estrellas: chupetes por mes
   Cada mes es una bolita con un palito punteado fino hasta la base, con
   la nota, la ★ y cuántas reseñas encima. Debajo, un área sombreada
   que une los meses en línea recta, del color de cada nivel.
   ============================================================ */
function porMes(filas){
  const mapa = new Map();
  filas.forEach(x => {
    if (!x.fecha) return;
    const m = String(x.fecha).slice(0, 7);
    const o = mapa.get(m) || { mes:m, n:0, suma:0, con:0, notas:{ 1:0, 2:0, 3:0, 4:0, 5:0 } };
    o.n++;
    if (x.estrellas != null){ o.suma += x.estrellas; o.con++; o.notas[x.estrellas]++; }
    mapa.set(m, o);
  });
  return Array.from(mapa.values()).sort((a, b) => a.mes < b.mes ? -1 : 1);
}

let ultimasFilas = null;
let esperaAncho = null;
window.addEventListener("resize", () => {
  clearTimeout(esperaAncho);
  esperaAncho = setTimeout(() => {
    if (ultimasFilas && $("#tendencia") && $("#tendencia .lineas")) pintarEstrellas(ultimasFilas);
  }, 150);
});

function pintarEstrellas(filas){
  const meses = porMes(filas);
  if (!meses.length){ $("#tendencia").innerHTML = '<p class="vacio">Todavía no hay calificaciones.</p>'; return; }

  const puntos = meses.map((m, i) => ({ i: i, mes: m.mes, n: m.n, con: m.con, notas: m.notas, prom: m.con ? m.suma / m.con : null }));
  const conValor = puntos.filter(p => p.prom != null);
  /* Se dibuja al ancho real de la caja (no se estira): así las letras
     miden lo mismo que el resto del panel, en computador y en celular.
     Si cambia el ancho de la pantalla, se vuelve a dibujar. */
  ultimasFilas = filas;
  const W = Math.max(280, Math.round($("#tendencia").clientWidth || 720), puntos.length * 64);
  const H = 210, ix = 34, dx = 18, ay = 50, ab = 34;   // ay: aire para la nota y las reseñas sobre la bolita de 5
  const ancho = W - ix - dx, alto = H - ay - ab;
  const margen = 36;   // los chupetes no se pegan al eje ni al borde
  const px = i => puntos.length === 1 ? ix + ancho / 2 : ix + margen + (i / (puntos.length - 1)) * (ancho - 2 * margen);
  const py = v => ay + (5 - v) / 4 * alto;

  let s = '<svg class="lineas" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Promedio de estrellas por mes">';
  [5, 4, 3, 2, 1].forEach(v => {
    s += '<line class="guia" x1="' + ix + '" y1="' + py(v) + '" x2="' + (W - dx) + '" y2="' + py(v) + '"></line>';
    s += '<text class="eje" x="' + (ix - 8) + '" y="' + (py(v) + 4) + '" text-anchor="end">' + v + '</text>';
  });
  s += '<line class="base" x1="' + ix + '" y1="' + py(1) + '" x2="' + (W - dx) + '" y2="' + py(1) + '"></line>';

  /* Área sombreada bajo los meses con nota, unidos en línea recta. El
     color va de un mes al otro según su nivel (rojo, amarillo, azul,
     verde), en un degradado de izquierda a derecha. */
  if (conValor.length > 1){
    const x0 = px(conValor[0].i), x1 = px(conValor[conValor.length - 1].i);
    s += '<defs><linearGradient id="area-niveles" gradientUnits="userSpaceOnUse" x1="' + x0 + '" y1="0" x2="' + x1 + '" y2="0">' +
      conValor.map(p => '<stop offset="' + ((px(p.i) - x0) / (x1 - x0)) + '" stop-color="' + colorNota(p.prom) + '"></stop>').join("") +
      '</linearGradient></defs>';
    s += '<path class="area" fill="url(#area-niveles)" d="M' + x0 + ' ' + py(1) + ' ' +
      conValor.map(p => 'L' + px(p.i) + ' ' + py(p.prom)).join(' ') + ' L' + x1 + ' ' + py(1) + 'Z"></path>';
  }
  const R = 8;
  puntos.forEach(p => {
    const x = px(p.i);
    if (p.prom == null){
      s += '<g class="punto"><circle class="punto-vacio" cx="' + x + '" cy="' + py(1) + '" r="3"></circle>' +
        '<title>' + etqMes(p.mes) + ': sin calificaciones, ' + p.n + ' feedbacks</title></g>';
    } else {
      const c = colorNota(p.prom);
      const fiesta = p.prom >= 4.5;
      s += '<g class="punto' + (fiesta ? ' festeja' : '') + '" data-i="' + p.i + '" tabindex="0">';
      s += '<line class="tallo fino" x1="' + x + '" y1="' + py(1) + '" x2="' + x + '" y2="' + (py(p.prom) + R) + '" stroke="' + c + '"></line>';
      if (fiesta) s += '<circle class="aura" cx="' + x + '" cy="' + py(p.prom) + '" r="9" fill="' + c + '"></circle>';
      s += '<circle class="bolita" cx="' + x + '" cy="' + py(p.prom) + '" r="' + R + '" fill="' + c + '"></circle>';
      s += '<text class="valor" x="' + x + '" y="' + (py(p.prom) - R - 19) + '" text-anchor="middle" fill="' + c + '">' +
        p.prom.toFixed(1).replace(".", ",") + ' ★</text>';
      s += '<text class="cuantas" x="' + x + '" y="' + (py(p.prom) - R - 6) + '" text-anchor="middle">' +
        num(p.con) + (p.con === 1 ? ' reseña' : ' reseñas') + '</text>';
      s += '</g>';
    }
    s += '<text class="eje" x="' + x + '" y="' + (H - 12) + '" text-anchor="middle">' + etqMes(p.mes) + '</text>';
  });
  s += '</svg>';

  const ultimo = conValor.length ? conValor[conValor.length - 1] : null;
  let fiesta = '';
  if (ultimo && ultimo.prom >= 4.5){
    fiesta = '<div class="festejo"><span class="chispas"><i></i><i></i><i></i><i></i><i></i><i></i></span>' +
      '<b>Mes en verde: ' + etqMes(ultimo.mes) + ' cerró en ' + ultimo.prom.toFixed(2) + '</b></div>';
  }
  $("#tendencia").innerHTML = s + '<div class="globo-mes" id="globo-mes" role="tooltip" hidden></div>' + fiesta +
    '<div class="leyenda-notas">' + NIVELES.map(n =>
      '<span><i style="background:' + colorNota(n[2]) + '"></i>' + n[0] + ' <b>' + n[1] + '</b></span>').join("") + '</div>';
  conectarGlobo(puntos);
}

/* Globito del chupete: al pasar el mouse (o tocarlo en el celular)
   dice cuántas calificaciones hubo de cada estrella ese mes y el total. */
function conectarGlobo(puntos){
  const caja = $("#tendencia");
  const globo = $("#globo-mes");
  function mostrar(g){
    const p = puntos[Number(g.dataset.i)];
    if (!p) return;
    const tope = Math.max(1, ...[1, 2, 3, 4, 5].map(n => p.notas[n]));
    globo.innerHTML =
      '<div class="globo-mes-cab"><b>' + etqMes(p.mes) + '</b><span style="color:' + colorNota(p.prom) + '">' +
        p.prom.toFixed(1).replace(".", ",") + ' ★ promedio</span></div>' +
      [5, 4, 3, 2, 1].map(n =>
        '<div class="globo-mes-fila"><span>' + n + ' ★</span>' +
        '<span class="globo-mes-barra"><i style="width:' + (p.notas[n] / tope * 100) + '%;background:' + COLORES[n] + '"></i></span>' +
        '<b>' + num(p.notas[n]) + '</b><small>' + pct(p.notas[n], p.con) + '%</small></div>').join("") +
      '<div class="globo-mes-total">Total: <b>' + num(p.con) + '</b> ' + (p.con === 1 ? "calificación" : "calificaciones") +
        (p.n > p.con ? ' · ' + num(p.n) + ' feedbacks en el mes' : '') + '</div>';
    globo.hidden = false;
    const base = caja.getBoundingClientRect();
    const b = g.querySelector(".bolita").getBoundingClientRect();
    const x = b.left + b.width / 2 - base.left;
    const ancho = globo.offsetWidth;
    globo.style.left = Math.max(0, Math.min(x - ancho / 2, base.width - ancho)) + "px";
    /* Encima de la bolita; si no cabe (chupetes altos), debajo */
    const arriba = b.top - base.top - globo.offsetHeight - 10;
    globo.style.top = (arriba >= 0 ? arriba : b.bottom - base.top + 10) + "px";
  }
  function ocultar(){ globo.hidden = true; }
  caja.querySelectorAll(".punto[data-i]").forEach(g => {
    g.addEventListener("mouseenter", () => mostrar(g));
    g.addEventListener("mouseleave", ocultar);
    g.addEventListener("focus", () => mostrar(g));
    g.addEventListener("blur", ocultar);
    g.addEventListener("click", () => globo.hidden ? mostrar(g) : ocultar());
  });
}

/* ============================================================
   5. Ranking de mejoras globales
   Barras como las de Tipo de problema. Ruido va en gris al final:
   se cuenta, pero no es una mejora que haya que hacer.
   ============================================================ */
let focoMejoras = "todas";
let mejorasIA = [];              // mejoras_ia
let ordenCriticas = [];         // filas pintadas del ranking de críticas
let clasificadasCriticas = [];   // comentarios que cuenta (para abrir cada crítica)
let notasCriticas = new Map();   // crítica -> notas por estrella (globito)
let mejorasDe = new Map();       // indicador -> todas sus mejoras (sin descartadas)
let datosMej = null;             // mejoras y enlaces, para no dejar una mejora sin indicador
let ultimo = null;               // lo último pintado, para volver a filtrar

function pintarChipsMejoras(){
  $("#f-foco-mejoras").innerHTML = [["todas","Todos"], ["sin_accion","Sin mejora"], ["con_accion","Con mejora"]]
    .map(par => '<button class="chip" data-v="' + par[0] + '" aria-pressed="' + (par[0] === focoMejoras) + '">' +
      escapar(par[1]) + '</button>').join("");
}

function pintarMejoras(todasVista, filas){
  ultimo = { lista: todasVista, filas: filas };
  /* Ruido: solo lo que trae texto. Lo que llega solo con estrellas no es
     ruido, es una calificación; la vista lo cuenta, aquí se recalcula. */
  const ruidoTexto = filas.filter(x => x.estado !== "por_revisar" && (x.mejoras || []).indexOf(RUIDO) > -1 && tieneTexto(x));
  const conNota = ruidoTexto.filter(x => x.estrellas != null);
  const todas = todasVista.map(m => m.slug !== RUIDO ? m : Object.assign({}, m, {
    veces: ruidoTexto.length, con_estrellas: conNota.length,
    promedio_estrellas: conNota.length ? conNota.reduce((a, x) => a + x.estrellas, 0) / conNota.length : null
  })).filter(m => m.slug !== RUIDO || m.veces > 0);
  if (!todas.length){
    $("#ranking-criticas").innerHTML = '<p class="vacio">Todavía no hay críticas clasificadas.</p>';
    return;
  }
  /* Las mismas filas que cuenta la vista (todo menos lo que sigue por
     revisar), sin lo que llega solo con estrellas marcado como ruido */
  clasificadasCriticas = filas.filter(x => x.estado !== "por_revisar" &&
    (tieneTexto(x) || (x.mejoras || []).indexOf(RUIDO) === -1));
  /* De cada crítica: notas por estrella (para el globito), formas de
     decirlo y países, como en el ranking de temas */
  notasCriticas = new Map();
  const formasDe = new Map(), paisesDe = new Map();
  clasificadasCriticas.forEach(x => (x.mejoras || []).forEach(m => {
    const o = notasCriticas.get(m) || { 1:0, 2:0, 3:0, 4:0, 5:0 };
    if (x.estrellas != null) o[x.estrellas]++;
    notasCriticas.set(m, o);
    const texto = String(x.mejora_texto || x.tema_puntual || "").trim().toLowerCase();
    if (!formasDe.has(m)) formasDe.set(m, new Set());
    if (texto) formasDe.get(m).add(texto);
    if (!paisesDe.has(m)) paisesDe.set(m, new Set());
    if (x.pais) paisesDe.get(m).add(x.pais);
  }));

  /* El filtro deja fuera Ruido: no es una mejora por hacer */
  const criticas = todas.filter(m => m.slug !== RUIDO && (focoMejoras === "todas" ||
    (focoMejoras === "con_accion") === mejorasDe.has(m.slug)));
  const ruido = focoMejoras === "todas" ? todas.find(m => m.slug === RUIDO) : null;
  ordenCriticas = criticas.concat(ruido ? [ruido] : []);
  if (!ordenCriticas.length){
    $("#ranking-criticas").innerHTML = '<p class="vacio">Ninguna crítica cumple ese filtro. Prueba con Todos.</p>';
    return;
  }

  const estrellas = (m, i) => {
    const prom = m.promedio_estrellas != null ? Number(m.promedio_estrellas) : null;
    return prom == null ? '<span class="mini">—</span>'
      : '<button type="button" class="nota-critica" data-globo-critica="' + i + '" style="--n:' +
          (m.slug === RUIDO ? "var(--border2)" : colorNota(prom)) + '">' + prom.toFixed(1).replace(".", ",") + ' ★</button>';
  };
  const cuerpo = ordenCriticas.map((m, i) => {
    const formas = (formasDe.get(m.slug) || new Set()).size;
    const texto = formas > 1 ? formas + " formas de decirlo" : (m.veces === 1 ? "1 comentario" : m.veces + " comentarios");
    const enlace = '<button class="enlace-formas" data-ver-critica="' + i + '" title="Ver los comentarios reales">' + texto + '</button>';
    const paises = (paisesDe.get(m.slug) || new Set()).size;
    if (m.slug === RUIDO) return '<tr class="fila-ruido">' +
      '<td><span class="tema-nombre">Ruido</span><br>' + enlace + '</td>' +
      '<td class="tabular"><b>' + num(m.veces) + '</b></td>' +
      '<td class="tabular">' + paises + '</td>' +
      '<td><span class="mini">Descartados: no decían nada aprovechable</span></td>' +
      '<td><span class="etq">descartado</span></td>' +
      '<td><button class="boton-chico" data-ver-critica="' + i + '">Revisar</button></td></tr>';
    const n = (mejorasDe.get(m.slug) || []).length;
    return '<tr>' +
      '<td><span class="tema-nombre">' + escapar(m.nombre) + ICONOS + '</span><br>' + enlace + '</td>' +
      '<td class="tabular"><b>' + num(m.veces) + '</b></td>' +
      '<td class="tabular">' + paises + '</td>' +
      '<td>' + estrellas(m, i) + '</td>' +
      '<td>' + (n > 1 ? '<span class="etq lima">' + n + ' mejoras</span>'
        : n ? '<span class="etq lima">con mejora</span>' : '<span class="etq alerta">sin mejora</span>') + '</td>' +
      '<td>' + accionesMejora(m, i) + '</td></tr>';
  }).join("");

  $("#ranking-criticas").innerHTML =
    '<table class="tabla"><thead><tr><th>Crítica</th><th>Veces</th><th>Países</th><th>Estrellas</th>' +
    '<th>Mejora</th><th>Acciones</th></tr></thead><tbody>' + cuerpo + '</tbody></table>' +
    '<div class="globo-mes" id="globo-mejora" role="tooltip" hidden></div>';
}

/* Globito de las estrellas: cuántas notas hubo de cada una */
function mostrarGloboCritica(bt){
  const m = ordenCriticas[Number(bt.dataset.globoCritica)];
  const globo = $("#globo-mejora"), caja = $("#ranking-criticas");
  if (!m || !globo) return;
  const notas = notasCriticas.get(m.slug) || { 1:0, 2:0, 3:0, 4:0, 5:0 };
  const prom = m.promedio_estrellas != null ? Number(m.promedio_estrellas) : null;
  const topeN = Math.max(1, ...[1, 2, 3, 4, 5].map(n => notas[n]));
  globo.innerHTML =
    '<div class="globo-mes-cab"><b>' + escapar(m.nombre) + '</b>' +
      (prom != null ? '<span style="color:' + (m.slug === RUIDO ? "var(--muted)" : colorNota(prom)) + '">' +
        prom.toFixed(1).replace(".", ",") + ' ★</span>' : '') + '</div>' +
    [5, 4, 3, 2, 1].map(n =>
      '<div class="globo-mes-fila"><span>' + n + ' ★</span>' +
      '<span class="globo-mes-barra"><i style="width:' + (notas[n] / topeN * 100) + '%;background:' + COLORES[n] + '"></i></span>' +
      '<b>' + num(notas[n]) + '</b><small>' + pct(notas[n], m.con_estrellas) + '%</small></div>').join("") +
    '<div class="globo-mes-total"><b>' + num(m.veces) + '</b> ' + (m.veces === 1 ? "comentario" : "comentarios") +
      ' · <b>' + num(m.con_estrellas) + '</b> con nota</div>';
  globo.hidden = false;
  const base = caja.getBoundingClientRect(), f = bt.getBoundingClientRect();
  const ancho = globo.offsetWidth;
  globo.style.left = Math.max(0, Math.min(f.left - base.left + f.width / 2 - ancho / 2, base.width - ancho)) + "px";
  globo.style.top = (f.bottom - base.top + 6) + "px";
}

function ocultarGloboCritica(){
  const globo = $("#globo-mejora");
  if (globo) globo.hidden = true;
}

/* Los comentarios de una crítica (o de Ruido), con Reclasificar y Devolver */
function abrirCritica(m){
  const prom = m.promedio_estrellas != null ? Number(m.promedio_estrellas).toFixed(1).replace(".", ",") + "★" : null;
  ventanaComentarios({
    titulo: m.nombre,
    guia: plural(m.veces, "comentario", "comentarios") +
      (prom ? " · " + prom + " de " + plural(m.con_estrellas, "nota", "notas") : ""),
    intro: m.slug === RUIDO
      ? "Lo que se marcó como ruido, tal cual llegó. Si algo se descartó por error, reclasifícalo aquí mismo o devuélvelo al Inbox."
      : "Lo que escribió cada médico, tal cual llegó. Si alguno no es de esta crítica, reclasifícalo aquí mismo o devuélvelo al Inbox.",
    lista: clasificadasCriticas.filter(x => (x.mejoras || []).indexOf(m.slug) > -1),
    alCambiar: async texto => { avisar(texto, "ok", "#aviso-panel"); await cargar(); }
  });
}

/* Marca y botones de la mejora de cada tipo, como en el ranking de
   temas. Ruido no lleva: no es una mejora por hacer. */
function accionesMejora(m){
  const n = (mejorasDe.get(m.slug) || []).length;
  /* data-tema-accion: los mismos botones del ranking de temas (icono de
     cadena, ojo y cadena rota, con su globito), que salen del CSS. Con
     varias mejoras, el ojo abre la lista para elegir cuál. */
  return n > 1 ? '<button class="boton-chico" data-tema-accion="vermejora">Ver mejoras</button>'
    : n ? '<button class="boton-chico" data-tema-accion="vermejora">Ver mejora</button>' +
          '<button class="boton-chico" data-tema-accion="desvincular">Desvincular</button>'
    : '<button class="boton-chico" data-tema-accion="mejora">Crear mejora</button>';
}

function accionMejora(accion, m, clasificadas){
  const alCambiar = async texto => { avisar(texto, "ok", "#aviso-panel"); await cargar(); };
  if (accion === "renombrar"){ ventanaRenombrarTipo(m, alCambiar); return; }
  if (accion === "borrar"){
    ventanaQuitarTipo(m, clasificadas.filter(x => (x.mejoras || []).indexOf(m.slug) > -1), alCambiar);
    return;
  }
  const lista = mejorasDe.get(m.slug) || [];
  if (accion === "mejora" || !lista.length)
    ventanaCrearMejora({ slug: m.slug, n: m.veces, mejoras: mejorasIA, alCambiar: alCambiar });
  else if (lista.length > 1)
    ventanaMejorasDe({ slug: m.slug, lista: lista, datos: datosMej, que: "mejora global", alCambiar: alCambiar });
  else if (accion === "vermejora") ventanaVerMejora({ mejora: lista[0], slug: m.slug, alCambiar: alCambiar });
  else if (accion === "desvincular")
    ventanaDesvincular({ mejora: lista[0], slug: m.slug, que: "mejora global", datos: datosMej, alCambiar: alCambiar });
}

/* ✏️ y 🗑️ de cada tipo, como en el ranking de temas */
const ICONOS =
  '<button class="icono-btn" data-tema-accion="renombrar" title="Renombrar" aria-label="Renombrar">' +
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L18 10l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg></button>' +
  '<button class="icono-btn peligro" data-tema-accion="borrar" title="Quitar esta crítica de sus comentarios" ' +
    'aria-label="Quitar este tipo de sus comentarios">' +
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M10 4h4"/><path d="M6 7l1 13h10l1-13"/>' +
    '<path d="M10 11v6M14 11v6"/></svg></button>';

/* ✏️ Renombrar: solo el nombre bonito; la IA sigue con el mismo código */
function ventanaRenombrarTipo(m, alCambiar){
  const actual = nombreDe(m.slug);
  abrirVentana({
    titulo: "Renombrar mejora global",
    guia: actual,
    cuerpo:
      '<input class="campo" id="r-nombre" value="' + escapar(actual) + '">' +
      '<p class="mini">Cambia solo el nombre que ves en el panel. La IA sigue clasificando con el mismo ' +
      'código (' + escapar(m.slug) + '), así que lo que ya llegó y lo que llegue después se queda junto aquí. ' +
      'El nombre viejo se guarda como sinónimo para que la IA lo siga reconociendo.</p>',
    aceptar: "Guardar nombre",
    alAceptar: async () => {
      const nuevo = leer("r-nombre");
      if (!nuevo){ avisar("Escribe el nombre nuevo.", "mal", "#aviso-forma"); return false; }
      if (nuevo === actual) return;
      await renombrarTema(m.slug, nuevo);
      cerrarVentana();
      await alCambiar("Mejora global renombrada: “" + nuevo + "”.");
      return false;
    }
  });
}

/* 🗑️ Quitar: le quita el tipo a todos sus comentarios, sin borrar nada */
function ventanaQuitarTipo(m, lista, alCambiar){
  const vuelven = lista.filter(x => (x.mejoras || []).length === 1 && !(x.temas || []).length).length;
  abrirVentana({
    titulo: "Quitar mejora global",
    guia: nombreDe(m.slug) + " · " + plural(lista.length, "comentario", "comentarios"),
    cuerpo:
      '<p>¿Quitar “' + escapar(nombreDe(m.slug)) + '” de sus ' + plural(lista.length, "comentario", "comentarios") + '?</p>' +
      '<p class="mini">No se borra ningún comentario ni el tipo del catálogo: la IA lo puede seguir usando. ' +
      'Los que tenían otras clasificaciones las conservan.' +
      (vuelven ? ' <b>' + plural(vuelven, "comentario se queda", "comentarios se quedan") +
        ' sin clasificar y vuelve' + (vuelven === 1 ? '' : 'n') + ' al Inbox</b> para que lo reclasifiques.' : '') +
      '</p>',
    aceptar: "Quitar",
    alAceptar: async () => {
      await quitarMejoraTecnica(lista, m.slug);
      cerrarVentana();
      await alCambiar("“" + nombreDe(m.slug) + "” quitado de " + plural(lista.length, "comentario", "comentarios") +
        (vuelven ? " · " + vuelven + " volvieron al Inbox" : "") + ".");
      return false;
    }
  });
}

/* ============================================================
   6. Ayudas de presentación
   ============================================================ */
/* Cuatro niveles: excelente, muy bien, regular y malo. NIVELES arma la
   leyenda: nombre, rango y un valor de muestra para sacar su color. */
const NIVELES = [["Excelente", "4.5 a 5", 4.75], ["Muy bien", "4 a 4.5", 4.25],
                 ["Regular", "3.5 a 4", 3.75], ["Malo", "menos de 3.5", 3]];

function colorNota(v){
  if (v == null) return "#8a8a8a";
  if (v < 3.5) return "#dc4a3d";
  if (v < 4) return "#e5a117";
  if (v < 4.5) return "#2f6fed";
  return "#1fa15a";
}

function etqMes(m){
  return String(m).slice(5) + "/" + String(m).slice(2, 4);
}
