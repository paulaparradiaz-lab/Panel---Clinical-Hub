/* ============================================================
   CLINICAL HUB · FEEDBACK › INBOX
   Lo que la IA no pudo clasificar con seguridad.

   La IA clasifica sola todo el feedback que llega. Lo que tuvo
   claro queda en estado "auto" y va directo a Métricas; lo que no,
   queda "por_revisar" y aparece aquí, sin importar si es reseña,
   tema pedido o mejora global. Histórico completo, sin filtros.
   Solo entra lo que trae texto: lo que llega con estrellas y nada
   más no tiene qué clasificar y suma directo en Métricas.

   Clasificar es decir qué es (tema pedido, mejora global o las dos)
   y en qué subcategoría cae. Al guardar, la fila pasa a "revisado",
   sale del inbox y empieza a sumar en Métricas. "Es ruido" es el
   atajo para lo que no dice nada aprovechable.

   Lee public.v_ia_por_revisar; escribe en
   feedback_prueba_clasificacion_por_ia por medio de ia.js.
   ============================================================ */
import { sb, $, escapar, num, avisar, traducirError } from "./nucleo.js";
import { cargarCatalogo, clasificar, nombrePais, RUIDO } from "./ia.js";
import { ventanaClasificar, metaDe, textoDe } from "./ia-ventanas.js";

let filas = [];
let seleccion = new Set();
let visibles = [];
let q = "";

/* Íconos: etiqueta = clasificar; archivar = descartar como ruido (se
   guarda aparte, no se borra); casilla = elegir todas; X = soltar. */
const ETIQUETA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/>' +
  '<circle cx="7.5" cy="7.5" r="1.5"/></svg>';
const ARCHIVAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="4" rx="1"/>' +
  '<path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M12 11v6M9.5 14.5L12 17l2.5-2.5"/></svg>';
const TODAS = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/>' +
  '<path d="M8 12l3 3 5-6"/></svg>';
const SOLTAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

/* ============================================================
   1. Armazón de la subpestaña
   Vive dentro de la pestaña Feedback (pestana-feedback.js), que pone
   el título, el botón Actualizar y las subpestañas Inbox | Métricas.
   ============================================================ */
export async function render(caja){
  caja.innerHTML = armazon();
  conectar();
  await cargar();
}

export function recargar(){ return cargar(); }

function armazon(){
  return `
<p class="aviso" id="aviso-panel" role="status"></p>
<section class="caja" style="margin-top:14px">
  <!-- Título y ayuda plegable: arranca cerrada
       y "¿Cómo funciona?" la abre o la cierra. -->
  <div class="fila-entre cabeza-seccion">
    <div><h2 class="titulo-seccion">Por clasificar</h2>
      <p class="subtitulo-seccion">Lo que la IA no tuvo claro</p></div>
    <button class="enlace-ayuda" id="btn-ayuda" aria-expanded="false" aria-controls="ayuda-inbox">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>
      ¿Cómo funciona?</button>
  </div>
  <div class="ayuda-plegable" id="ayuda-inbox" hidden>
    <p class="mini">Aquí llega lo que la IA no tuvo claro. Cada tarjeta trae lo que escribió el médico, tal cual.
    Dile qué es (tema pedido, mejora global o las dos) y en qué subcategoría cae. Al guardar desaparece del
    Inbox y empieza a sumar en Métricas y en Impacto. Si no dice nada aprovechable, márcalo como ruido: no se
    borra, queda en la fila de Ruido del ranking por si fue un error.</p>
    <p class="mini">Lo que llega <b>solo con estrellas</b>, sin texto, no pasa por aquí porque no hay nada que
    clasificar; sus estrellas sí cuentan en el Ranking de estrellas.</p>
    <p class="mini"><b>El buscador</b> solo sirve para encontrar y agrupar; con <b>☑</b> eliges todas las que se ven
    para clasificarlas o descartarlas juntas.</p>
  </div>
  <!-- Buscador y ☑ en una sola fila -->
  <div class="fila-buscar" id="fila-buscar">
    <label class="buscador-lupa">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      <input id="q-inbox" type="search" placeholder="Buscar: sepsis, interfaz, protocolos…" aria-label="Buscar en el inbox">
    </label>
    <span class="barra-seleccion" style="margin:0;padding:0" id="caja-todas"></span>
  </div>
  <p class="resumen-sub" id="resumen-inbox" hidden></p>
  <div id="barra-bandeja"></div>
  <!-- #comentarios: la lista en estilo chat de la Reseñas vieja (banda gris,
       globo blanco con el texto y botones que responden por la derecha) -->
  <div id="comentarios"><p class="vacio">Cargando…</p></div>
</section>
`;
}

function conectar(){
  /* Cada vez que se abre el Inbox, el buscador arranca vacío (si no, al
     volver de Métricas la caja salía vacía pero la lista seguía filtrada) */
  q = "";
  $("#q-inbox").addEventListener("input", e => { q = e.target.value || ""; pintar(); });
  $("#comentarios").addEventListener("click", alClic);
  $("#barra-bandeja").addEventListener("click", alClic);
  $("#fila-buscar").addEventListener("click", alClic);
  $("#btn-ayuda").addEventListener("click", () => {
    const ayuda = $("#ayuda-inbox");
    ayuda.hidden = !ayuda.hidden;
    $("#btn-ayuda").setAttribute("aria-expanded", String(!ayuda.hidden));
  });
}

/* ============================================================
   2. Datos
   ============================================================ */
async function cargar(){
  try {
    await cargarCatalogo();
    const { data, error } = await sb.from("v_ia_por_revisar").select("*").order("fecha", { ascending:false });
    if (error) throw error;
    filas = data || [];
  } catch (err){
    if (!$("#comentarios")) return;
    $("#comentarios").innerHTML = '<p class="vacio">No se pudo leer el inbox. ' +
      escapar(traducirError(err && err.message)) + '</p>';
    return;
  }
  /* Si mientras cargaba te fuiste a Métricas, no hay dónde pintar */
  if (!$("#comentarios")) return;
  seleccion = new Set();
  pintar();
}

function buscableDe(x){
  return [x.mejora_texto, x.tema_puntual, x.guia_de_referencia,
    nombrePais(x.pais)].join(" ").toLowerCase();
}

/* ============================================================
   3. Pintado
   ============================================================ */
function pintar(){
  const busca = q.trim().toLowerCase();
  const vistas = busca ? filas.filter(x => buscableDe(x).indexOf(busca) > -1) : filas;
  /* Solo quedan elegidas las que se ven: si el buscador esconde una
     tarjeta marcada, se desmarca, para no clasificarla sin verla */
  const ids = new Set(vistas.map(x => String(x.id)));
  seleccion = new Set(Array.from(seleccion).filter(id => ids.has(id)));
  visibles = vistas.map(x => String(x.id));
  /* El globito de la subpestaña Inbox dice cuántas quedan */
  document.dispatchEvent(new CustomEvent("ch-pendientes", { detail: filas.length }));

  /* El total ya se ve en rojo en la subpestaña y en el menú; debajo del
     buscador solo se dice cuántas coinciden cuando estás buscando. */
  const res = $("#resumen-inbox");
  res.hidden = !busca;
  res.innerHTML = busca ? "Buscando “" + escapar(q.trim()) + "”: <b>" + num(vistas.length) + "</b> de " +
    num(filas.length) + (vistas.length === 1 ? " coincide" : " coinciden") : "";

  if (!filas.length){
    $("#comentarios").innerHTML = '<p class="vacio">Inbox vacío: no queda nada por revisar.</p>';
    pintarBarra();
    return;
  }
  $("#comentarios").innerHTML = vistas.length
    ? vistas.map(tarjeta).join("")
    : '<p class="vacio">Nada del inbox dice eso. Prueba con otra palabra o borra la búsqueda.</p>';
  pintarBarra();
}

/* La tarjeta no muestra lo que dijo, lo que sugiere ni la confianza de
   la IA: así la clasificación de quien revisa no arranca sesgada. */
function tarjeta(x){
  const id = escapar(String(x.id));

  return '<article class="comentario">' +
    '<div class="comentario-meta">' +
      '<label class="mini"><input type="checkbox" autocomplete="off" data-sel="' + id + '"' +
        (seleccion.has(String(x.id)) ? " checked" : "") + '> elegir</label>' +
      metaDe(x) +
    '</div>' +
    textoDe(x) +
    '<div class="comentario-pie">' +
      '<button class="boton-chico" data-accion="clasificar" data-id="' + id + '">' + ETIQUETA + 'Clasificar</button>' +
      '<button class="boton-chico" data-accion="ruido" data-id="' + id + '">Es ruido</button>' +
    '</div></article>';
}

/* La barra de selección va en una sola línea: solo íconos, y cada uno
   dice qué hace en un globito al pasar el mouse (data-tip, en el CSS). */
function icono(id, tip, svg, principal){
  return '<button class="boton-chico icono' + (principal ? ' principal' : '') + '" id="' + id +
    '" data-tip="' + escapar(tip) + '" aria-label="' + escapar(tip) + '">' + svg + '</button>';
}

/* El ☑ (elegir todas las que se ven) vive junto al buscador. La barra
   con Clasificar juntas / Descartar / Quitar solo aparece si eliges algo. */
function pintarBarra(){
  const n = seleccion.size;
  const v = visibles.length;
  $("#caja-todas").innerHTML = v ? icono("btn-sel-todas", "Elegir las " + v + " que se ven", TODAS) : "";
  const caja = $("#barra-bandeja");
  if (!n){ caja.innerHTML = ""; return; }
  caja.innerHTML = '<div class="barra-seleccion">' +
    '<span class="mini"><b>' + n + '</b> ' + (n === 1 ? "elegida" : "elegidas") + '</span>' +
    icono("btn-clas-sel", "Clasificar juntas", ETIQUETA, true) +
    icono("btn-ruido-sel", "Descartar (es ruido)", ARCHIVAR) +
    icono("btn-sel-nada", "Quitar selección", SOLTAR) +
    '</div>';
}

/* ============================================================
   4. Acciones
   ============================================================ */
function alClic(e){
  const cb = e.target.closest("input[data-sel]");
  if (cb){
    if (cb.checked) seleccion.add(cb.dataset.sel); else seleccion.delete(cb.dataset.sel);
    pintarBarra();
    return;
  }
  if (e.target.closest("#btn-sel-todas")){ visibles.forEach(id => seleccion.add(id)); pintar(); return; }
  if (e.target.closest("#btn-sel-nada")){ seleccion = new Set(); pintar(); return; }
  if (e.target.closest("#btn-clas-sel")){ if (elegidas().length) ventanaClasificar(elegidas(), trasClasificar); return; }
  if (e.target.closest("#btn-ruido-sel")){ if (elegidas().length) marcarRuido(elegidas()); return; }

  const bt = e.target.closest("button[data-accion]");
  if (!bt) return;
  const x = filas.find(r => String(r.id) === bt.dataset.id);
  if (!x) return;
  if (bt.dataset.accion === "clasificar") ventanaClasificar([x], trasClasificar);
  if (bt.dataset.accion === "ruido") marcarRuido([x]);
}

function elegidas(){
  return filas.filter(x => seleccion.has(String(x.id)));
}

async function trasClasificar(n){
  avisar(n === 1 ? "Clasificado. Ya suma en Métricas." : n + " clasificadas. Ya suman en Métricas.", "ok", "#aviso-panel");
  await cargar();
}

async function marcarRuido(lista){
  try {
    await clasificar(lista, [], [RUIDO]);
    avisar(lista.length === 1 ? "Marcado como ruido." : lista.length + " marcados como ruido.", "ok", "#aviso-panel");
    await cargar();
  } catch (err){
    avisar(traducirError(err && err.message), "mal", "#aviso-panel");
  }
}
