/* ============================================================
   CLINICAL HUB · VENTANAS DE LA IA
   Ventanas que usan varias pestañas del panel nuevo.

   Clasificar  La usan el Inbox (clasificar lo que la IA no tuvo
               claro) y el ranking de temas de Métricas (reclasificar
               un comentario). Guarda en
               feedback_prueba_clasificacion_por_ia por medio de ia.js.
   Comentarios La lista de comentarios de un grupo (la fila de Ruido,
               un tipo de solución global), cada uno con Reclasificar y
               Devolver al Inbox.
   ============================================================ */
import { $, escapar, fecha, num, abrirVentana, avisar, cerrarVentana, traducirError } from "./nucleo.js";
import { catalogo, clasificar, devolverAlInbox, nombrePais, nombreOrigen, TIPOS, tieneTexto } from "./ia.js";

/* ============================================================
   0. La tarjeta del comentario (estilo chat)
   El Inbox y la ventana de clasificar muestran lo mismo: los datos
   arriba y lo que escribió el médico en el globo.
   ============================================================ */
export function metaDe(x){
  return '<span class="nota">' + (x.estrellas ? x.estrellas + " ★" : "sin nota") + '</span>' +
    '<span class="canal">' + escapar(nombreOrigen(x.origen)) + '</span>' +
    '<span class="fecha">' + fecha(x.fecha) + (x.pais ? " · " + escapar(nombrePais(x.pais)) : "") + '</span>';
}

/* Todo lo que escribió el médico va en un mismo globo: el comentario
   arriba y, separados por una línea fina, el tema que pidió y la guía
   de referencia. Así se lee como una sola respuesta, sin clasificar. */
export function textoDe(x){
  const partes = [];
  if (x.mejora_texto) partes.push('<span class="parte-globo">' + escapar(x.mejora_texto) + '</span>');
  if (x.tema_puntual) partes.push('<span class="parte-globo"><b>' + (x.mejora_texto ? "Tema que pidió" : "Pidió un tema") +
    ':</b> ' + escapar(x.tema_puntual) + '</span>');
  if (x.guia_de_referencia) partes.push('<span class="parte-globo"><b>Guía de referencia:</b> ' +
    escapar(x.guia_de_referencia) + '</span>');
  if (!partes.length) return '<p class="mini">Llegó sin texto: no escribió ni tema ni comentario.</p>';
  return '<p>' + partes.join("") + '</p>';
}

/* ============================================================
   1. Ventana de clasificar
   Desde el Inbox arranca en blanco y sin sugerencias de la IA, para no
   sesgar a quien clasifica; al reclasificar abre con lo que ya tiene. Primero solo pregunta qué es (tema
   pedido, solución global o las dos); al marcar una opción se
   despliega debajo su parte. Estética del resto del panel: el
   control de las subpestañas y la bandeja del ranking. Lo que elijas reemplaza lo que tuviera
   cada comentario. Lo marcado vive en «marcadas» y no en el DOM,
   porque la lista de temas se repinta al buscar.
   ============================================================ */
const TOPE_TEMAS = 40;

/* Íconos de línea de "¿Qué es?": documento con + (una guía nueva) y
   engranaje (cómo funciona la plataforma) */
const ICONO_TIPO = {
  tema_pedido: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>' +
    '<path d="M14 3v5h5"/><path d="M12 11v6M9 14h6"/></svg>',
  mejora_tecnica: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>'
};

export function ventanaClasificar(lista, alTerminar, opciones){
  const una = lista.length === 1;
  /* Desde el Inbox arranca en blanco (lo que la IA no tuvo claro, sin
     sesgo). Al reclasificar algo ya clasificado ({ conActual:true }) abre
     con lo que tiene, para corregir solo lo que sobra o falta. */
  const actual = una && opciones && opciones.conActual ? lista[0] : null;
  const marcadas = {
    temas: new Set(actual ? (actual.temas || []) : []),
    mejoras: new Set(actual ? (actual.mejoras || []) : [])
  };
  const tipos = new Set();
  if (marcadas.temas.size) tipos.add("tema_pedido");
  if (marcadas.mejoras.size) tipos.add("mejora_tecnica");
  let buscaTema = "";

  /* Arriba, lo que escribió el médico completo, para clasificar
     leyéndolo. Si son varias, salen todas en una lista con scroll.
     Debajo, "¿Qué es?" con el control de las subpestañas (se pueden
     marcar las dos) y las listas en la bandeja gris del ranking. */
  const cuerpo =
    '<div class="caja-estirable">' +
      '<div class="lista-chat" id="c-lectura">' +
        lista.map(r => '<article class="comentario"><div class="comentario-meta">' + metaDe(r) + '</div>' +
          textoDe(r) + '</article>').join("") +
      '</div>' +
      '<span class="esquina-estirar" id="c-esquina" title="Arrastra para leer completo" aria-hidden="true"></span>' +
    '</div>' +
    '<span class="etiqueta">¿Qué es?</span>' +
    '<div class="subpestanas que-es" id="c-tipos" role="group" aria-label="Qué es"></div>' +
    '<p class="mini explica" id="c-ayuda">Puedes marcar las dos si pide un tema y además comenta la plataforma.</p>' +
    '<div id="c-bloque-temas">' +
      '<span class="etiqueta">¿Qué tema pide?</span>' +
      '<input class="campo" id="c-busca-tema" placeholder="Buscar en los ' + catalogo.temas.length +
        ' temas: sepsis, dengue, falla cardiaca…">' +
      '<div class="bandeja-opciones" id="c-temas" style="max-height:300px"></div>' +
      '<div id="c-temas-nota"></div>' +
    '</div>' +
    '<div id="c-bloque-soluciones">' +
      '<span class="etiqueta">¿Qué tipo de solución?</span>' +
      '<div class="bandeja-opciones" id="c-soluciones"></div>' +
    '</div>' +
    (una ? '' : '<p class="mini">Se aplica a las ' + lista.length +
      ' elegidas y reemplaza lo que tuvieran.</p>');

  abrirVentana({
    titulo: actual ? "Reclasificar" : (una ? "Clasificar" : "Clasificar " + lista.length + " juntas"),
    guia: una ? "" : "Lo que elijas se le pone a las " + lista.length,
    cuerpo: cuerpo,
    aceptar: "Guardar",
    ancha: true,
    alAceptar: async () => {
      const temas = tipos.has("tema_pedido") ? Array.from(marcadas.temas) : [];
      const mejoras = tipos.has("mejora_tecnica") ? Array.from(marcadas.mejoras) : [];
      if (!tipos.size){ avisar("Elige si es tema pedido, solución global o las dos.", "mal", "#aviso-forma"); return false; }
      if (tipos.has("tema_pedido") && !temas.length){ avisar("Elige al menos un tema.", "mal", "#aviso-forma"); return false; }
      if (tipos.has("mejora_tecnica") && !mejoras.length){ avisar("Elige al menos un tipo de solución.", "mal", "#aviso-forma"); return false; }
      await clasificar(lista, temas, mejoras);
      cerrarVentana();
      if (alTerminar) await alTerminar(lista.length);
      return false;
    }
  });

  /* Una fila de la bandeja: nombre a la izquierda, circulito a la
     derecha que se pone lima con ✓ cuando está elegida. */
  function fila(tipo, valor, nombre, detalle, elegida){
    return '<button type="button" class="fila-opcion" data-' + tipo + '="' + escapar(valor) + '" aria-pressed="' + elegida + '">' +
      '<span><b>' + escapar(nombre) + '</b>' + (detalle ? '<span class="mini">' + escapar(detalle) + '</span>' : '') + '</span>' +
      '<span class="marca-opcion" aria-hidden="true"></span></button>';
  }

  /* "¿Qué es?" se pinta una sola vez: al marcar solo cambian los
     atributos, para que la goma (.goma) pueda deslizarse y estirarse. */
  function armarTipos(){
    $("#c-tipos").innerHTML = '<span class="goma" aria-hidden="true"></span>' + TIPOS.map(t =>
      '<button type="button" class="subpestana" data-tipo="' + t[0] + '" aria-pressed="false" aria-selected="false">' +
      ICONO_TIPO[t[0]] + escapar(t[1]) + '</button>').join("");
  }

  function pintarTipos(){
    document.querySelectorAll("#c-tipos .subpestana").forEach(b => {
      const on = tipos.has(b.dataset.tipo);
      b.setAttribute("aria-pressed", String(on));
      b.setAttribute("aria-selected", String(on));
    });
    $("#c-bloque-temas").hidden = !tipos.has("tema_pedido");
    $("#c-bloque-soluciones").hidden = !tipos.has("mejora_tecnica");
    moverGoma();
  }

  /* La goma lima va de la primera a la última opción marcada: con una
     sola se desliza hasta ella; con las dos se estira sobre ambas. */
  function moverGoma(){
    const caja = $("#c-tipos");
    const goma = caja && caja.querySelector(".goma");
    if (!goma) return;
    const marcadas = Array.prototype.filter.call(caja.querySelectorAll(".subpestana"), b => tipos.has(b.dataset.tipo));
    if (!marcadas.length){ goma.style.opacity = "0"; goma.style.width = "0px"; return; }
    /* offsetLeft/offsetWidth miden el diseño real, sin que les afecte la
       animación de entrada de la ventana (que la escala mientras abre). */
    const a = marcadas[0], z = marcadas[marcadas.length - 1];
    goma.style.opacity = "1";
    goma.style.left = a.offsetLeft + "px";
    goma.style.width = (z.offsetLeft + z.offsetWidth - a.offsetLeft) + "px";
  }

  /* El circulito salta solo en la opción que se acaba de tocar */
  function saltar(selector){
    const b = document.querySelector(selector);
    if (b && b.getAttribute("aria-pressed") === "true") b.classList.add("recien");
  }

  /* Arriba lo marcado; debajo lo que coincide con la búsqueda. */
  function pintarTemas(){
    const b = buscaTema.trim().toLowerCase();
    const elegidos = catalogo.temas.filter(c => marcadas.temas.has(c.slug));
    const resto = catalogo.temas.filter(c => !marcadas.temas.has(c.slug) &&
      (!b || (c.nombre + " " + c.slug + " " + (c.sinonimos || "")).toLowerCase().indexOf(b) > -1));
    const muestra = resto.slice(0, TOPE_TEMAS);
    $("#c-temas").innerHTML = elegidos.concat(muestra)
      .map(c => fila("tema", c.slug, c.nombre, "", marcadas.temas.has(c.slug))).join("");
    $("#c-temas").hidden = !elegidos.length && !muestra.length;
    $("#c-temas-nota").innerHTML =
      (resto.length > muestra.length ? '<p class="mini">Se ven ' + muestra.length + ' de ' + resto.length +
        '. Escribe para encontrar el que buscas.</p>' : '') +
      (b && !resto.length ? '<p class="mini">Ningún tema del catálogo coincide con “' + escapar(buscaTema.trim()) + '”.</p>' : '');
  }

  function pintarSoluciones(){
    $("#c-soluciones").innerHTML = catalogo.mejoras.map(c =>
      fila("mejora", c.slug, c.nombre, (c.sinonimos || "").split("|").slice(0, 3).join(" · "),
        marcadas.mejoras.has(c.slug))).join("");
  }

  /* Botones del final pequeños y en una sola línea (ver .botones-cortos) */
  $("#velo-forma .ventana").classList.add("botones-cortos");

  estirable($("#c-lectura"), $("#c-esquina"));

  armarTipos();
  pintarTipos();
  /* Si los botones cambian de tamaño después de pintarse (termina de
     cargar la tipografía, la ventana se acomoda), la goma se vuelve a medir. */
  if (window.ResizeObserver){
    const vigia = new ResizeObserver(() => moverGoma());
    document.querySelectorAll("#c-tipos .subpestana").forEach(b => vigia.observe(b));
  }
  requestAnimationFrame(moverGoma);
  pintarTemas();
  pintarSoluciones();

  /* Se escucha en .ventana, que nace con cada apertura: #velo-forma
     vive siempre y ahí se irían sumando los oyentes de ventanas viejas. */
  const ventana = $("#velo-forma .ventana");
  ventana.addEventListener("click", e => {
    const b = e.target.closest("button[data-tipo], button[data-tema], button[data-mejora]");
    if (!b) return;
    if (b.dataset.tipo){
      const t = b.dataset.tipo;
      if (tipos.has(t)) tipos.delete(t); else tipos.add(t);
      pintarTipos();
    } else if (b.dataset.tema){
      const t = b.dataset.tema;
      if (marcadas.temas.has(t)) marcadas.temas.delete(t); else marcadas.temas.add(t);
      pintarTemas();
      saltar('#c-temas button[data-tema="' + t + '"]');
    } else {
      const t = b.dataset.mejora;
      if (marcadas.mejoras.has(t)) marcadas.mejoras.delete(t); else marcadas.mejoras.add(t);
      b.setAttribute("aria-pressed", String(marcadas.mejoras.has(t)));
      b.classList.remove("recien");
      saltar('#c-soluciones button[data-mejora="' + t + '"]');
    }
  });
  $("#c-busca-tema").addEventListener("input", e => { buscaTema = e.target.value || ""; pintarTemas(); });
  gomaActual = moverGoma;
}

/* Si cambia el ancho de la pantalla, la goma de la ventana abierta se
   vuelve a acomodar. Un solo oyente para todas las aperturas. */
let gomaActual = null;
window.addEventListener("resize", () => { if (gomaActual) gomaActual(); });

/* ============================================================
   2. Cajita que se estira desde la esquina
   Arranca con un alto cómodo; si el mensaje es más largo, la esquinita
   de abajo a la derecha se arrastra para estirarla, pero solo hasta
   donde se ve todo el mensaje (nunca más). Funciona con mouse y dedo.
   Doble clic en la esquina: abre todo o vuelve al alto inicial.
   ============================================================ */
const ALTO_INICIAL = 200;

function estirable(caja, esquina){
  if (!caja || !esquina) return;
  const total = () => caja.scrollHeight;
  const inicial = Math.min(ALTO_INICIAL, total());
  caja.style.height = inicial + "px";
  if (total() <= ALTO_INICIAL + 4){ esquina.hidden = true; caja.style.height = ""; return; }

  esquina.addEventListener("pointerdown", e => {
    e.preventDefault();
    try { esquina.setPointerCapture(e.pointerId); } catch (_) {}
    const y0 = e.clientY, h0 = caja.offsetHeight;
    caja.classList.add("estirando");
    const mover = ev => {
      caja.style.height = Math.max(90, Math.min(total(), h0 + ev.clientY - y0)) + "px";
    };
    const soltar = () => {
      caja.classList.remove("estirando");
      esquina.removeEventListener("pointermove", mover);
      esquina.removeEventListener("pointerup", soltar);
      esquina.removeEventListener("pointercancel", soltar);
    };
    esquina.addEventListener("pointermove", mover);
    esquina.addEventListener("pointerup", soltar);
    esquina.addEventListener("pointercancel", soltar);
  });
  esquina.addEventListener("dblclick", () => {
    caja.style.height = (caja.offsetHeight < total() - 2 ? total() : inicial) + "px";
  });
}

/* ============================================================
   3. Ventana de comentarios de un grupo
   Muestra los comentarios en estilo chat; cada uno con Reclasificar
   (abre la ventana de clasificar en blanco) y Devolver al Inbox (solo
   si tiene texto, porque el Inbox no muestra comentarios vacíos).
   alCambiar(texto) recibe el aviso para mostrar y vuelve a cargar.
   ============================================================ */
const ICONO_ETIQUETA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/>' +
  '<circle cx="7.5" cy="7.5" r="1.5"/></svg>';

export function ventanaComentarios({ titulo, guia, intro, lista, vacio, alCambiar }){
  const orden = lista.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  abrirVentana({
    titulo: titulo,
    guia: guia,
    cuerpo:
      (intro ? '<p class="mini explica">' + intro + '</p>' : '') +
      '<div class="lista-chat" style="max-height:58vh;overflow:auto">' +
      (orden.length ? orden.map(tarjetaGrupo).join("") : '<p class="vacio">' + escapar(vacio || "No hay comentarios.") + '</p>') +
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
    const x = orden.find(p => String(p.id) === b.dataset.id);
    if (!x) return;
    if (b.dataset.accion === "reclasificar"){
      ventanaClasificar([x], () => alCambiar("Comentario reclasificado."), { conActual:true });
      return;
    }
    if (b.dataset.accion === "devolver"){
      b.disabled = true;
      try {
        await devolverAlInbox([x]);
        cerrarVentana();
        await alCambiar("Devuelto al Inbox para clasificarlo de nuevo.");
      } catch (err){
        b.disabled = false;
        avisar(traducirError(err && err.message), "mal", "#aviso-forma");
      }
    }
  });
}

function tarjetaGrupo(x){
  const id = escapar(String(x.id));
  /* Sin texto (solo estrellas) no hay nada que reclasificar ni devolver */
  const conTexto = tieneTexto(x);
  return '<article class="comentario">' +
    '<div class="comentario-meta">' + metaDe(x) + '</div>' +
    textoDe(x) +
    (conTexto ? '<div class="comentario-pie">' +
      '<button class="boton-chico" data-accion="reclasificar" data-id="' + id + '">' + ICONO_ETIQUETA + 'Reclasificar</button>' +
      '<button class="boton-chico" data-accion="devolver" data-id="' + id + '">Devolver al Inbox</button>' +
    '</div>' : '') +
    '</article>';
}

export function plural(n, uno, varios){
  return num(n) + " " + (n === 1 ? uno : varios);
}
