/* ============================================================
   CLINICAL HUB · RANKING DE TEMAS PEDIDOS (dentro de Métricas)
   Réplica del ranking de la Temas pedidos vieja, sobre los datos
   de la IA. Histórico completo; un único filtro: con / sin mejora.

   Cada fila es un tema del catálogo (categorias_para_ia) con al menos
   un comentario ya clasificado (auto o revisado):
     ✏️  Renombrar   cambia el nombre bonito del tema; el código que
                     usa la IA no cambia y el nombre viejo queda como
                     sinónimo.
     🗑️  Desetiquetar le quita el tema a todos sus comentarios. No
                     borra nada; lo que queda sin clasificar vuelve
                     al Inbox.
     "N formas de decirlo"  abre los comentarios reales; desde ahí se
                     reclasifica o se saca uno del tema.
     Mejora          se crea o se enlaza una mejora (mejoras_ia) al
                     tema completo; se ve y se desvincula sin borrarla.
                     La mejora también lleva su indicador (una mejora
                     global, de entrada "Cantidad de temas"), que es lo
                     que mide Impacto.
     Nueva etiqueta  crea un tema nuevo en el catálogo.
   Ruido no va aquí: vive en el Ranking de críticas (en la base es un
   tipo de mejora global).
   ============================================================ */
import { $, escapar, fecha, num, pct, abrirVentana, avisar, cerrarVentana, leer,
  traducirError } from "./nucleo.js";
import { catalogo, nombreDe, nombrePais, nombreOrigen, quitarTema, renombrarTema,
  mejorasPorSlug } from "./ia.js";
import { ventanaClasificar } from "./ia-ventanas.js";
import { ventanaCrearMejora, ventanaNuevaEtiqueta, ventanaMejorasDe } from "./mejora-ventanas.js";

let filas = [];                 // v_ia_feedback ya clasificado
let mejoras = [];               // mejoras_ia
let mejorasDe = new Map();      // tema -> todas sus mejoras (sin descartadas)
let datosMej = null;
let grupos = [];
let verTodos = false;
let qTemas = "";
let recargar = async () => {};
const f = { foco:"todas" };

const FOCOS = [["todas","Todos"], ["sin_accion","Sin mejora"], ["con_accion","Con mejora"]];
const TOPE = 10;

/* Iconos del ranking: el lápiz renombra, la caneca desetiqueta */
const LAPIZ = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L18 10l-4-4L4 16v4z"/>' +
  '<path d="M13.5 6.5l4 4"/></svg>';
const CANECA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M10 4h4"/>' +
  '<path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/></svg>';

/* Reclasificar lleva la misma etiqueta que Clasificar en el Inbox */
const ETIQUETA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/>' +
  '<circle cx="7.5" cy="7.5" r="1.5"/></svg>';

/* ============================================================
   1. Armazón y eventos
   Mismas clases e ids que el ranking viejo (#panel-ranking,
   #f-foco, #ranking, data-tema-accion…) para heredar su CSS.
   ============================================================ */
export function armazon(){
  return `
<section id="panel-ranking">
  <p class="resumen-sub" id="resumen-ranking"></p>
  <div class="filtros-fila">
    <span class="rotulo">Mejora</span>
    <div class="filtros" id="f-foco" role="group" aria-label="Estado de mejora"></div>
  </div>
  <section class="caja" style="margin-top:14px">
    <div class="fila-entre cabeza-seccion">
      <div><h2 class="titulo-seccion">Ranking de temas pedidos</h2><p class="subtitulo-seccion">Tus temas, por cuánta gente los pide</p></div>
      <button class="enlace-ayuda" id="btn-ayuda-ranking" aria-expanded="false" aria-controls="ayuda-ranking">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>
        ¿Cómo funciona?</button>
    </div>
    <div class="ayuda-plegable" id="ayuda-ranking" hidden>
      <p class="mini">Tus temas, ordenados por cuántos comentarios los piden (<b>Piden</b>) y desde cuántos
      países (<b>Países</b>). Solo aparecen los que ya tienen comentarios clasificados; se ven los 10 más pedidos
      y el botón de abajo muestra todos. El filtro de arriba deja ver <b>Todos</b>, solo los que están
      <b>Sin mejora</b> o solo los que ya tienen <b>Con mejora</b>.</p>
      <p class="mini"><b>El texto subrayado</b> abre los comentarios reales de ese tema; desde ahí puedes
      reclasificar cualquiera o sacarlo del tema. <b>El lápiz</b> cambia el nombre del tema (la IA sigue
      usando el mismo). <b>La caneca</b> le quita el tema a sus comentarios sin borrar nada: lo que queda
      sin clasificar vuelve al Inbox.</p>
      <p class="mini"><b>La mejora</b> se enlaza al tema completo. <b>El ojo</b> abre la lista de sus mejoras: cada
      una con <b>Ver</b> y <b>Desvincular</b>, que se la quita al tema sin borrarla. Al crearla eliges también su indicador (de entrada «Cantidad de temas»), que es lo que mide
      Impacto. <b>Las referencias</b> son las guías que el médico quiere que se citen. <b>Nueva etiqueta</b>
      crea un tema en el catálogo: aparece aquí cuando tenga su primer comentario.</p>
      <p class="mini"><b>El buscador</b> mira el nombre del tema, sus sinónimos y lo que escribieron los
      médicos. Lo descartado como <b>Ruido</b> se revisa en el Ranking de críticas.</p>
    </div>
    <div class="fila-buscar" style="margin-top:4px">
      <label class="buscador-lupa">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input id="q-ranking" type="search" placeholder="Buscar un tema: sepsis, dengue, falla cardiaca…" aria-label="Buscar en el ranking de temas">
      </label>
      <button class="boton-chico boton-nueva" id="btn-nuevo-tema">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Nueva etiqueta</button>
    </div>
    <div id="ranking"><p class="vacio">Cargando…</p></div>
  </section>
</section>`;
}

export function conectar(alRecargar){
  recargar = alRecargar;
  verTodos = false;
  qTemas = "";
  pintarChips();
  $("#q-ranking").addEventListener("input", e => { qTemas = e.target.value || ""; pintarRanking(); });
  $("#btn-nuevo-tema").addEventListener("click", () => ventanaNuevaEtiqueta({ tipo: "tema", alCambiar: trasCambio }));
  $("#btn-ayuda-ranking").addEventListener("click", () => {
    const ayuda = $("#ayuda-ranking");
    ayuda.hidden = !ayuda.hidden;
    $("#btn-ayuda-ranking").setAttribute("aria-expanded", String(!ayuda.hidden));
  });
  $("#f-foco").addEventListener("click", e => {
    const b = e.target.closest("button[data-v]");
    if (!b) return;
    f.foco = b.dataset.v;
    pintarChips();
    pintarRanking();
  });
  $("#ranking").addEventListener("click", e => {
    if (e.target.closest("#btn-ver-todos")){ verTodos = !verTodos; pintarRanking(); return; }
    const ver = e.target.closest("button[data-ver]");
    if (ver){ ventanaVerTema(ver.dataset.ver); return; }
    const bt = e.target.closest("button[data-tema-accion]");
    if (bt) accionDeTema(bt);
  });
}

function pintarChips(){
  $("#f-foco").innerHTML = FOCOS.map(par =>
    '<button class="chip" data-v="' + par[0] + '" aria-pressed="' + (par[0] === f.foco) + '">' +
    escapar(par[1]) + '</button>').join("");
}

/* ============================================================
   2. Datos
   ============================================================ */
export function pintar(todas, datosMejoras){
  filas = (todas || []).filter(x => x.estado !== "por_revisar");
  mejoras = datosMejoras.mejoras;
  datosMej = datosMejoras;
  mejorasDe = mejorasPorSlug(datosMejoras);
  grupos = agrupar();
  pintarRanking();
}

function comentariosDe(slug){
  return filas.filter(x => (x.temas || []).indexOf(slug) > -1);
}

function textoPedido(x){
  return String(x.tema_puntual || x.mejora_texto || "").trim();
}

function agrupar(){
  const mapa = new Map();
  filas.forEach(x => (x.temas || []).forEach(slug => {
    const o = mapa.get(slug) || { slug: slug, n:0, paises:new Set(), formas:new Set(), refs:new Set() };
    o.n++;
    if (x.pais) o.paises.add(x.pais);
    const t = textoPedido(x).toLowerCase();
    if (t) o.formas.add(t);
    const r = String(x.guia_de_referencia || "").trim();
    if (r) o.refs.add(r);
    mapa.set(slug, o);
  }));
  return Array.from(mapa.values()).sort((a, b) => (b.n - a.n) || nombreDe(a.slug).localeCompare(nombreDe(b.slug)));
}

/* ============================================================
   3. Pintado
   ============================================================ */
function pintarRanking(){
  pintarResumen();
  /* El buscador mira el nombre del tema, su código, sus sinónimos y lo
     que escribieron los médicos. Mientras buscas se ven todos los que
     coinciden, no solo los 10 primeros. */
  const busca = qTemas.trim().toLowerCase();
  const lista = grupos.filter(o => {
    if (f.foco === "sin_accion" && mejorasDe.has(o.slug)) return false;
    if (f.foco === "con_accion" && !mejorasDe.has(o.slug)) return false;
    if (busca && buscableTema(o).indexOf(busca) === -1) return false;
    return true;
  });

  if (!grupos.length){
    $("#ranking").innerHTML = '<p class="vacio">Todavía no hay temas clasificados.</p>';
    return;
  }
  if (!lista.length){
    $("#ranking").innerHTML = busca
      ? '<p class="vacio">Ningún tema coincide con “' + escapar(qTemas.trim()) + '”. Prueba con otra palabra.</p>'
      : '<p class="vacio">Ningún tema cumple ese filtro. Prueba con Todos.</p>';
    return;
  }

  const visibles = (verTodos || busca) ? lista : lista.slice(0, TOPE);
  const ocultos = lista.length - visibles.length;

  const cuerpo = visibles.map(o => {
    const clave = escapar(o.slug);
    const cubierto = mejorasDe.has(o.slug);
    const marca = cubierto
      ? '<span class="etq lima">con mejora</span>'
      : '<span class="etq alerta">sin mejora</span>';
    const refs = Array.from(o.refs).join(" / ");
    const formas = o.formas.size;
    const textoFormas = formas > 1 ? formas + " formas de decirlo"
      : (o.n > 1 ? o.n + " comentarios" : "1 comentario");
    const enlace = '<button class="enlace-formas" data-ver="' + clave +
      '" title="Ver los comentarios reales de este tema">' + textoFormas + '</button>';
    const iconos =
      '<button class="icono-btn" data-tema-accion="renombrar" data-clave="' + clave +
      '" title="Renombrar tema" aria-label="Renombrar tema">' + LAPIZ + '</button>' +
      '<button class="icono-btn peligro" data-tema-accion="borrar" data-clave="' + clave +
      '" title="Quitar este tema de sus comentarios" aria-label="Quitar este tema de sus comentarios">' + CANECA + '</button>';
    /* Igual que en el Ranking de críticas: solo el ojo, que abre la lista
       de sus mejoras con Ver y Desvincular */
    const botones = cubierto
      ? '<button class="boton-chico" data-tema-accion="vermejora" data-clave="' + clave +
        '" title="Ver mejoras">Ver mejoras</button>'
      : '<button class="boton-chico" data-tema-accion="mejora" data-clave="' + clave +
        '">Crear mejora</button>';
    return '<tr>' +
      '<td><span class="tema-nombre">' + escapar(corto(nombreDe(o.slug), 60)) + iconos + '</span><br>' + enlace + '</td>' +
      '<td class="tabular"><b>' + o.n + '</b></td>' +
      '<td class="tabular">' + o.paises.size + '</td>' +
      '<td><span class="mini">' + (refs ? escapar(corto(refs, 44)) : "—") + '</span></td>' +
      '<td>' + marca + '</td>' +
      '<td>' + botones + '</td></tr>';
  }).join("");

  const alterna = !busca && (lista.length > TOPE || verTodos)
    ? '<button class="boton-chico" id="btn-ver-todos">' +
      (verTodos ? "Ver solo los 10 más pedidos" : "Ver todos los temas (" + lista.length + ")") + '</button>'
    : '';

  $("#ranking").innerHTML =
    '<table class="tabla"><thead><tr><th>Tema</th><th>Piden</th><th>Países</th>' +
    '<th>Referencias que piden</th><th>Mejora</th><th>Acciones</th></tr></thead><tbody>' +
    cuerpo + '</tbody></table>' + alterna +
    /* Solo el conteo; la explicación vive en "¿Cómo funciona?" */
    (busca ? '<p class="mini">' + plural(lista.length, "tema coincide", "temas coinciden") + ' con “' +
        escapar(qTemas.trim()) + '”</p>' :
      (ocultos > 0 ? '<p class="mini">Se muestran los ' + TOPE + ' más pedidos de ' + lista.length + '</p>' : ''));
}

function pintarResumen(){
  const res = $("#resumen-ranking");
  if (!res) return;
  const conMej = grupos.filter(o => mejorasDe.has(o.slug)).length;
  const conTema = filas.filter(x => (x.temas || []).length).length;
  res.innerHTML = "<b>" + num(grupos.length) + "</b> temas pedidos · <b>" +
    num(conTema) + "</b> comentarios clasificados · <b>" + (grupos.length ? pct(conMej, grupos.length) : 0) +
    "%</b> con mejora (" + num(conMej) + " de " + num(grupos.length) + ")";
}

/* ============================================================
   4. Acciones del ranking
   ============================================================ */
function accionDeTema(bt){
  const slug = bt.dataset.clave;
  const accion = bt.dataset.temaAccion;
  if (accion === "renombrar") ventanaRenombrar(slug);
  if (accion === "borrar") ventanaDesetiquetar(slug);
  const lista = mejorasDe.get(slug) || [];
  if (accion === "mejora" || (accion === "vermejora" && !lista.length))
    ventanaCrearMejora({ slug: slug, tema: true, n: comentariosDe(slug).length, mejoras: mejoras, alCambiar: trasCambio });
  else if (accion === "vermejora")
    ventanaMejorasDe({ slug: slug, lista: lista, datos: datosMej, que: "tema", alCambiar: trasCambio });
}

async function trasCambio(texto){
  avisar(texto, "ok", "#aviso-panel");
  await recargar();
}

/* ✏️ Renombrar: solo el nombre bonito */
function ventanaRenombrar(slug){
  const actual = nombreDe(slug);
  abrirVentana({
    titulo: "Renombrar tema",
    guia: actual,
    cuerpo:
      '<input class="campo" id="r-nombre" value="' + escapar(actual) + '">' +
      '<p class="mini">Cambia solo el nombre que ves en el panel. La IA sigue clasificando con el mismo ' +
      'código del tema (' + escapar(slug) + '), así que lo que ya llegó y lo que llegue después se queda ' +
      'junto aquí. El nombre viejo se guarda como sinónimo para que la IA lo siga reconociendo.</p>',
    aceptar: "Guardar nombre",
    alAceptar: async () => {
      const nuevo = leer("r-nombre");
      if (!nuevo){ avisar("Escribe el nombre nuevo.", "mal", "#aviso-forma"); return false; }
      if (nuevo === actual){ return; }
      await renombrarTema(slug, nuevo);
      cerrarVentana();
      await trasCambio("Tema renombrado: “" + nuevo + "”.");
      return false;
    }
  });
}

/* 🗑️ Desetiquetar: quita el tema de todos sus comentarios */
function ventanaDesetiquetar(slug){
  const lista = comentariosDe(slug);
  const vuelven = lista.filter(x => (x.temas || []).length === 1 && !(x.mejoras || []).length).length;
  abrirVentana({
    titulo: "Quitar tema",
    guia: nombreDe(slug) + " · " + plural(lista.length, "comentario", "comentarios"),
    cuerpo:
      '<p>¿Quitar “' + escapar(nombreDe(slug)) + '” de sus ' + plural(lista.length, "comentario", "comentarios") + '?</p>' +
      '<p class="mini">No se borra ningún comentario ni el tema del catálogo: la IA lo puede seguir usando. ' +
      'Los que tenían otros temas los conservan.' +
      (vuelven ? ' <b>' + plural(vuelven, "comentario se queda", "comentarios se quedan") +
        ' sin clasificar y vuelve' + (vuelven === 1 ? '' : 'n') + ' al Inbox</b> para que lo reclasifiques.' : '') +
      '</p>',
    aceptar: "Quitar tema",
    alAceptar: async () => {
      await quitarTema(lista, slug);
      cerrarVentana();
      await trasCambio("“" + nombreDe(slug) + "” quitado de " + plural(lista.length, "comentario", "comentarios") +
        (vuelven ? " · " + vuelven + " volvieron al Inbox" : "") + ".");
      return false;
    }
  });
}

/* "N formas de decirlo": los comentarios reales del tema */
function catalogoTema(slug){
  return catalogo.temas.find(c => c.slug === slug);
}

function buscableTema(o){
  const cat = catalogoTema(o.slug);
  return [nombreDe(o.slug), o.slug, cat ? cat.sinonimos : "", Array.from(o.formas).join(" ")].join(" ").toLowerCase();
}

function ventanaVerTema(slug){
  const lista = comentariosDe(slug).slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const formas = new Set(lista.map(x => textoPedido(x).toLowerCase()).filter(Boolean)).size;
  abrirVentana({
    titulo: nombreDe(slug),
    guia: plural(lista.length, "comentario", "comentarios") + " · " + plural(formas, "forma de decirlo", "formas de decirlo"),
    cuerpo:
      '<p class="mini">Lo que escribió cada médico, tal cual llegó. Puedes mandar cualquiera a otros ' +
      'temas o sacarlo de este.</p>' +
      /* .lista-chat: la misma lista en estilo chat del Inbox */
      '<div class="lista-chat" style="max-height:58vh;overflow:auto">' +
      (lista.length ? lista.map(x => tarjetaVer(x, slug)).join("") : '<p class="vacio">Sin comentarios.</p>') +
      '</div>',
    aceptar: "Cerrar",
    ancha: true,
    alAceptar: async () => {}
  });
  /* Solo se mira: sobra el Cancelar al lado de Cerrar */
  const cancelar = document.querySelector("#velo-forma [data-cerrar]");
  if (cancelar) cancelar.hidden = true;
  const caja = document.querySelector("#velo-forma .lista-chat");
  if (!caja) return;
  caja.addEventListener("click", async e => {
    const b = e.target.closest("button[data-accion]");
    if (!b) return;
    const x = lista.find(p => String(p.id) === b.dataset.id);
    if (!x) return;
    if (b.dataset.accion === "reclasificar"){
      ventanaClasificar([x], () => trasCambio("Comentario reclasificado."), { conActual:true });
      return;
    }
    if (b.dataset.accion === "quitar"){
      b.disabled = true;
      try {
        await quitarTema([x], slug);
        cerrarVentana();
        const vuelve = (x.temas || []).length === 1 && !(x.mejoras || []).length;
        await trasCambio("Comentario sacado de “" + nombreDe(slug) + "”" + (vuelve ? " · volvió al Inbox" : "") + ".");
      } catch (err){
        b.disabled = false;
        avisar(traducirError(err && err.message), "mal", "#aviso-forma");
      }
    }
  });
}

function tarjetaVer(x, slug){
  const otros = (x.temas || []).filter(t => t !== slug);
  const id = escapar(String(x.id));
  return '<article class="comentario">' +
    '<div class="comentario-meta">' +
    '<span class="nota">' + (x.estrellas ? x.estrellas + " ★" : "sin nota") + '</span>' +
    '<span class="canal">' + escapar(nombreOrigen(x.origen)) + '</span>' +
    '<span class="fecha">' + fecha(x.fecha) + (x.pais ? " · " + escapar(nombrePais(x.pais)) : "") + '</span>' +
    '</div>' +
    '<p>' + escapar(textoPedido(x) || "Sin texto") + '</p>' +
    (x.guia_de_referencia ? '<p class="mini">Referencias que pide: ' + escapar(x.guia_de_referencia) + '</p>' : '') +
    (x.tema_puntual && x.mejora_texto ? '<p class="mini">También comentó: ' + escapar(x.mejora_texto) + '</p>' : '') +
    (otros.length ? '<p class="mini">También cuenta en: ' +
      otros.map(t => '<span class="etq">' + escapar(nombreDe(t)) + '</span>').join(" ") + '</p>' : '') +
    '<div class="comentario-pie">' +
    '<button class="boton-chico" data-accion="reclasificar" data-id="' + id + '">' + ETIQUETA + 'Reclasificar</button>' +
    '<button class="boton-chico" data-accion="quitar" data-id="' + id + '">Quitar de este tema</button>' +
    '</div></article>';
}

/* ============================================================
   5. Ayudas
   ============================================================ */
function plural(n, uno, varios){
  return num(n) + " " + (n === 1 ? uno : varios);
}

function corto(s, n){
  const t = String(s || "").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

