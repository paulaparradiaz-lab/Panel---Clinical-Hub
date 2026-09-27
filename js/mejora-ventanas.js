/* ============================================================
   CLINICAL HUB · VENTANAS DE LA MEJORA
   Las usan los dos rankings de Métricas (temas pedidos y mejoras
   globales) y la pestaña Mejoras. Cada fila del ranking es un código
   del catálogo (slug): un tema o un tipo de mejora global.

   Crear       Nueva mejora, o enlazar la fila a una que ya existe.
               Al crearla se le asignan una o varias personas.
   Nueva       Desde la pestaña Mejoras, sin salir de un feedback: se
               enlaza a su indicador (una mejora global) y puede ser
               del pasado, con su fecha de completada.
   Ver         Título, detalle, estado y fecha de completada, editables.
   Desvincular Le quita la mejora a la fila, sin borrarla.
   Etiqueta    Crea un tema pedido o una mejora global en el catálogo.
   ============================================================ */
import { escapar, fecha, abrirVentana, avisar, cerrarVentana, leer } from "./nucleo.js";
import { catalogo, cargarCatalogo, nombreDe, RUIDO, ESTADOS, indicadoresDe, nombreEstado, crearMejoraCompleta, enlazarMejora,
  desvincularMejora, editarMejora, cargarUsuarios, asignarPersona, crearEtiqueta } from "./ia.js";
import { plural } from "./ia-ventanas.js";

/* Crear mejora desde un ranking: nueva, o enlazar una que ya existe.
   Desde el de mejoras globales, «Impacta en» arranca con la fila donde
   se tocó. Desde el de temas (tema: true), la mejora queda enlazada al
   tema y además a su indicador, que de entrada es «Cantidad de temas».
   La nueva lleva estado y, si ya se hizo, su fecha. */
export async function ventanaCrearMejora({ slug, tema = false, n, mejoras, alCambiar }){
  await cargarCatalogo();
  const sugerido = nombreDe(slug).slice(0, 80);
  const clave = crypto.randomUUID();   // una por ventana: un reintento no crea otra mejora
  abrirVentana({
    titulo: tema ? "Mejora del tema" : "Crear mejora",
    guia: sugerido + " · " + plural(n, "comentario", "comentarios"),
    cuerpo:
      (tema ? '<p class="mini explica">La mejora queda enlazada a este tema completo: hoy lo piden ' +
        plural(n, "comentario", "comentarios") + ', y los que lleguen después quedan cubiertos igual.</p>' : '') +
      campoIndicador("m-indicador", tema ? "cantidad_temas" : slug) +
      '<span class="etiqueta">A qué mejora pertenece</span>' +
      '<select class="campo" id="m-mejora">' +
      '<option value="">Crear una mejora nueva</option>' +
      mejoras.map(m => '<option value="' + m.id + '">#' + m.id + ' · ' + escapar(m.titulo) +
        ' · ' + escapar(nombreEstado(m.estado)) + '</option>').join("") +
      '</select>' +
      '<p class="mini explica">Si esto ya lo estás trabajando en otra mejora, elígela y queda enlazada a este indicador.</p>' +
      '<div id="m-nueva">' +
      '<span class="etiqueta">Título</span>' +
      '<input class="campo" id="m-titulo" placeholder="Título de la mejora" value="' + escapar(sugerido) + '">' +
      '<span class="etiqueta">Detalle</span>' +
      '<textarea class="campo" id="m-detalle" placeholder="Qué vamos a cambiar y por qué"></textarea>' +
      campoEstado("m-estado") + campoCompletada("m-fecha") +
      CAMPO_PERSONAS +
      '</div>',
    aceptar: "Guardar",
    ancha: true,
    alAceptar: async () => {
      const indicador = leer("m-indicador");
      if (!indicador){ avisar("Elige el indicador en el que impacta.", "mal", "#aviso-forma"); return false; }
      let id = leer("m-mejora");
      if (!id){
        const titulo = leer("m-titulo");
        if (!titulo){ avisar("Ponle un título a la mejora.", "mal", "#aviso-forma"); return false; }
        const extra = leerEstado("m-estado", "m-fecha");
        if (!extra) return false;
        /* Nueva: se crea, se enlaza y se asignan personas en un solo paso */
        id = await crearMejoraCompleta({ clave: clave, titulo: titulo, detalle: leer("m-detalle"), extra: extra,
          enlaces: tema ? [indicador, slug] : [indicador], personas: Array.from(elegidas) });
      } else {
        /* Una que ya existe: solo se enlaza (repetirlo no duplica nada) */
        await enlazarMejora(Number(id), indicador);
        if (tema) await enlazarMejora(Number(id), slug);
      }
      cerrarVentana();
      await alCambiar("Mejora #" + id + (tema ? " enlazada a “" + nombreDe(slug) + "”" : "") +
        ": impacta en “" + nombreDe(indicador) + "”.");
      return false;
    }
  });
  const sel = document.getElementById("m-mejora");
  sel.addEventListener("change", () => { document.getElementById("m-nueva").hidden = !!sel.value; });
  mostrarCompletada(document.getElementById("m-estado"), "m-fecha");
  const elegidas = elegirPersonas(document.getElementById("m-personas"));
}

/* Personas: los usuarios del panel, se marcan una o varias. Devuelve
   el conjunto de las marcadas, que se va llenando al tocar. */
const CAMPO_PERSONAS =
  '<span class="etiqueta">Quién la hace</span>' +
  '<p class="mini explica">Marca una o varias personas. Puedes cambiarlas después en la pestaña Mejoras.</p>' +
  '<div class="bandeja-opciones" id="m-personas" style="max-height:32vh"><p class="vacio">Cargando…</p></div>';

function elegirPersonas(bandeja){
  const elegidas = new Set();
  cargarUsuarios().then(usuarios => {
    if (!document.body.contains(bandeja)) return;
    bandeja.innerHTML = usuarios.length ? usuarios.map(u =>
      '<button type="button" class="fila-opcion" data-usuario="' + escapar(u.id) + '" aria-pressed="false">' +
      '<span><b>' + escapar(u.nombre) + '</b><span class="mini">' + escapar(u.correo) + '</span></span>' +
      '<span class="marca-opcion" aria-hidden="true"></span></button>').join("")
      : '<p class="vacio">No hay usuarios en el panel.</p>';
  }).catch(() => {
    bandeja.innerHTML = '<p class="vacio">No se pudo leer la lista de personas. La mejora se crea igual y ' +
      'puedes asignarla después en la pestaña Mejoras.</p>';
  });
  bandeja.addEventListener("click", e => {
    const b = e.target.closest("button[data-usuario]");
    if (!b) return;
    const u = b.dataset.usuario;
    if (elegidas.has(u)) elegidas.delete(u); else elegidas.add(u);
    b.setAttribute("aria-pressed", String(elegidas.has(u)));
    b.classList.toggle("recien", elegidas.has(u));
  });
  return elegidas;
}

/* Fechas del formulario: el campo de fecha da "2026-06-10"; se guarda
   a mediodía de Colombia para que no se corra de día. */
function hoyTexto(){
  return new Date().toLocaleDateString("en-CA", { timeZone:"America/Bogota" });
}
function fechaTexto(iso){
  return iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone:"America/Bogota" }) : "";
}
function fechaISO(texto){
  return texto ? new Date(texto + "T12:00:00-05:00").toISOString() : null;
}

/* Campo "Completada el": solo se ve si el estado es Completada */
function campoCompletada(id, valor){
  return '<div id="' + id + '-caja" hidden>' +
    '<span class="etiqueta">Completada el</span>' +
    '<input class="campo" type="date" id="' + id + '" max="' + hoyTexto() + '" value="' + (valor || hoyTexto()) + '">' +
    '<p class="mini explica">Si se hizo antes, por fuera del sistema, pon el día real: Impacto mide el antes y el ' +
    'después desde esa fecha.</p></div>';
}
function mostrarCompletada(selEstado, id){
  const caja = document.getElementById(id + "-caja");
  const ver = () => { caja.hidden = selEstado.value !== "hecha"; };
  selEstado.addEventListener("change", ver);
  ver();
}

/* Indicador: la mejora global en la que impacta (sin Ruido) */
function campoIndicador(id, seleccionado){
  return '<span class="etiqueta">Impacta en: ¿qué mejora global mide su efecto?</span>' +
    '<select class="campo" id="' + id + '">' +
      '<option value="">Elige un indicador</option>' +
      catalogo.mejoras.filter(c => c.slug !== RUIDO).map(c => '<option value="' + escapar(c.slug) + '"' +
        (c.slug === seleccionado ? " selected" : "") + '>' + escapar(c.nombre) + '</option>').join("") +
    '</select>' +
    '<p class="mini explica">En Impacto se verá si bajaron las críticas de ese indicador. Por ejemplo, publicar una ' +
    'guía nueva impacta en «Cantidad de temas». Si no está, créalo con «Nueva etiqueta» en el ranking de ' +
    'mejoras globales.</p>';
}

function campoEstado(id){
  return '<span class="etiqueta">Estado</span>' +
    '<select class="campo" id="' + id + '">' + ESTADOS.filter(e => e[0] !== "descartada").map(e =>
      '<option value="' + e[0] + '">' + e[1] + '</option>').join("") + '</select>';
}

/* Estado y fechas de una mejora nueva; si algo falta avisa y da null */
function leerEstado(idEstado, idFecha){
  const estadoNuevo = leer(idEstado) || "pendiente";
  const extra = { estado: estadoNuevo };
  if (estadoNuevo === "hecha"){
    const dia = leer(idFecha);
    if (!dia){ avisar("Pon la fecha en que se completó.", "mal", "#aviso-forma"); return null; }
    if (dia > hoyTexto()){ avisar("La fecha de completada no puede ser en el futuro.", "mal", "#aviso-forma"); return null; }
    extra.completada_en = fechaISO(dia);
    /* Una mejora del pasado nace el mismo día en que se completó */
    if (dia < hoyTexto()) extra.creado_en = extra.completada_en;
  }
  return extra;
}

/* ➕ Nueva mejora: sin salir de un feedback. Se enlaza a su indicador
   (una mejora global) y puede ser una que ya se hizo. */
export async function ventanaNuevaMejora({ alCambiar }){
  await cargarCatalogo();
  const clave = crypto.randomUUID();   // una por ventana: un reintento no crea otra mejora
  abrirVentana({
    titulo: "Nueva mejora",
    guia: "Para algo que no nació de un feedback, o que ya se hizo",
    cuerpo:
      '<span class="etiqueta">Título</span>' +
      '<input class="campo" id="n-titulo" placeholder="Por ejemplo: Nuevo diseño de las guías">' +
      '<span class="etiqueta">Detalle</span>' +
      '<textarea class="campo" id="n-detalle" placeholder="Qué cambiamos y por qué"></textarea>' +
      campoIndicador("n-enlace") +
      campoEstado("n-estado") + campoCompletada("n-fecha") +
      CAMPO_PERSONAS,
    aceptar: "Crear mejora",
    ancha: true,
    alAceptar: async () => {
      const titulo = leer("n-titulo");
      if (!titulo){ avisar("Ponle un título a la mejora.", "mal", "#aviso-forma"); return false; }
      const slug = leer("n-enlace");
      if (!slug){ avisar("Elige el indicador en el que impacta.", "mal", "#aviso-forma"); return false; }
      const extra = leerEstado("n-estado", "n-fecha");
      if (!extra) return false;
      const id = await crearMejoraCompleta({ clave: clave, titulo: titulo, detalle: leer("n-detalle"), extra: extra,
        enlaces: [slug], personas: Array.from(elegidas) });
      cerrarVentana();
      await alCambiar("Mejora #" + id + " creada: impacta en “" + nombreDe(slug) + "”.");
      return false;
    }
  });
  mostrarCompletada(document.getElementById("n-estado"), "n-fecha");
  const elegidas = elegirPersonas(document.getElementById("m-personas"));
}

/* 🏷 Nueva etiqueta: un tema pedido o una mejora global nuevos en el
   catálogo. Los sinónimos ayudan a la IA a reconocerla. */
export function ventanaNuevaEtiqueta({ tipo, alCambiar }){
  const esTema = tipo === "tema";
  abrirVentana({
    titulo: esTema ? "Nuevo tema pedido" : "Nueva mejora global",
    guia: esTema ? "Una etiqueta nueva para los temas que piden los médicos"
                 : "Una etiqueta nueva para lo que dicen de toda la plataforma",
    cuerpo:
      '<span class="etiqueta">Nombre</span>' +
      '<input class="campo" id="e-nombre" placeholder="' + (esTema ? "Por ejemplo: Cetoacidosis diabética" : "Por ejemplo: Velocidad de carga") + '">' +
      '<span class="etiqueta">Otras formas de decirlo</span>' +
      '<input class="campo" id="e-sinonimos" placeholder="' + (esTema ? "CAD | cetoacidosis | crisis hiperglucémica" : "lento | se demora | tarda en cargar") + '">' +
      '<p class="mini explica">Sepáralas con una barra |. Sirven para que la IA la reconozca aunque el médico lo diga ' +
      'de otra manera.</p>' +
      '<p class="mini explica">La etiqueta aparece en el ranking cuando tenga su primer comentario. Ya puedes usarla ' +
      'al clasificar en el Inbox y para enlazar mejoras.</p>',
    aceptar: "Crear etiqueta",
    alAceptar: async () => {
      const nombre = leer("e-nombre");
      if (!nombre){ avisar("Ponle un nombre a la etiqueta.", "mal", "#aviso-forma"); return false; }
      const repetida = catalogo.temas.concat(catalogo.mejoras)
        .find(c => c.nombre.trim().toLowerCase() === nombre.toLowerCase());
      if (repetida){ avisar("Ya existe una etiqueta con ese nombre.", "mal", "#aviso-forma"); return false; }
      const sinonimos = (leer("e-sinonimos") || "").split("|").map(t => t.trim()).filter(Boolean).join(" | ");
      await crearEtiqueta(tipo === "tema" ? "tema" : "mejora", nombre, sinonimos);
      cerrarVentana();
      await alCambiar((esTema ? "Tema" : "Mejora global") + " “" + nombre + "” creado.");
      return false;
    }
  });
}

/* 👁 Ver mejora: sus datos, editables. slug es opcional (desde qué
   fila se abrió), solo para la línea de arriba. */
export function ventanaVerMejora({ mejora: m, slug, alCambiar }){
  abrirVentana({
    titulo: "Mejora #" + m.id,
    guia: "Creada el " + fecha(m.creado_en) + (slug ? " · enlazada a " + nombreDe(slug) : ""),
    cuerpo:
      '<span class="etiqueta">Título</span>' +
      '<input class="campo" id="v-titulo" value="' + escapar(m.titulo) + '">' +
      '<span class="etiqueta">Detalle</span>' +
      '<textarea class="campo" id="v-detalle" placeholder="Qué vamos a cambiar y por qué">' + escapar(m.detalle || "") + '</textarea>' +
      '<span class="etiqueta">Estado</span>' +
      '<select class="campo" id="v-estado">' + ESTADOS.map(e =>
        '<option value="' + e[0] + '"' + (e[0] === m.estado ? " selected" : "") + '>' + e[1] + '</option>').join("") +
      '</select>' +
      /* Si ya está Completada se ve su fecha; si no, al completarla
         arranca en hoy: la fecha es la de la última vez que se completó. */
      campoCompletada("v-fecha", m.estado === "hecha" ? fechaTexto(m.completada_en) : "") +
      '<p class="mini explica">Una mejora no se borra: si ya no va, ponla en Descartada y la historia se conserva.</p>',
    aceptar: "Guardar cambios",
    ancha: true,
    alAceptar: async () => {
      const titulo = leer("v-titulo");
      if (!titulo){ avisar("La mejora necesita un título.", "mal", "#aviso-forma"); return false; }
      const cambios = { titulo: titulo, detalle: leer("v-detalle"), estado: leer("v-estado") || m.estado };
      /* La fecha escrita a mano solo cuenta si quedó Completada y es distinta:
         si no la tocaste, al completarla Supabase pone la de hoy (la de la
         última vez que se completó, no la de una vez anterior). */
      const dia = leer("v-fecha");
      if (cambios.estado === "hecha" && dia){
        if (dia > hoyTexto()){ avisar("La fecha de completada no puede ser en el futuro.", "mal", "#aviso-forma"); return false; }
        if (m.estado === "hecha" ? dia !== fechaTexto(m.completada_en) : dia !== hoyTexto())
          cambios.completada_en = fechaISO(dia);
      }
      await editarMejora(m.id, cambios);
      cerrarVentana();
      await alCambiar("Mejora #" + m.id + " actualizada.");
      return false;
    }
  });
  mostrarCompletada(document.getElementById("v-estado"), "v-fecha");
}

/* 👁 Las mejoras de una fila (tema o indicador) cuando tiene varias:
   cada una con Ver y Desvincular. */
export function ventanaMejorasDe({ slug, lista, datos, que = "tema", alCambiar }){
  abrirVentana({
    titulo: "Mejoras de " + nombreDe(slug),
    guia: plural(lista.length, "mejora enlazada", "mejoras enlazadas"),
    cuerpo:
      '<p class="mini explica">' + (que === "tema"
        ? 'Las mejoras que atienden este tema. Desvincular le quita el tema a esa mejora, sin borrarla.'
        : 'Las mejoras que impactan en este indicador. Desvincular le quita el indicador a esa mejora, sin borrarla.') +
      '</p><div class="lista-mejoras-fila">' + lista.map(m =>
        '<div class="mejora-fila"><span class="impacto-num">' + m.id + '</span>' +
        '<span class="mejora-fila-txt"><b>' + escapar(m.titulo) + '</b><small>' + escapar(nombreEstado(m.estado)) + '</small></span>' +
        '<button type="button" class="boton-chico" data-ver="' + m.id + '">Ver</button>' +
        '<button type="button" class="boton-chico secundario" data-desv="' + m.id + '">Desvincular</button></div>').join("") +
      '</div>',
    aceptar: "Cerrar",
    ancha: true,
    alAceptar: async () => {}
  });
  const cancelar = document.querySelector("#velo-forma [data-cerrar]");
  if (cancelar) cancelar.hidden = true;
  document.querySelector("#velo-forma .lista-mejoras-fila").addEventListener("click", e => {
    const b = e.target.closest("button[data-ver], button[data-desv]");
    if (!b) return;
    const m = lista.find(x => String(x.id) === (b.dataset.ver || b.dataset.desv));
    if (!m) return;
    if (b.dataset.ver) ventanaVerMejora({ mejora: m, slug: slug, alCambiar: alCambiar });
    else ventanaDesvincular({ mejora: m, slug: slug, que: que, datos: datos, alCambiar: alCambiar });
  });
}

/* Desvincular: le quita la mejora a la fila, sin borrarla. Si la fila
   es el ÚNICO indicador de esa mejora, no se deja: la mejora quedaría
   sin nada que medir en Impacto; el indicador se cambia en Mejoras. */
export function ventanaDesvincular({ mejora: m, slug, que = "tema", datos, alCambiar }){
  if (que !== "tema" && datos && indicadoresDe(datos, m.id).length <= 1){
    abrirVentana({
      titulo: "No se puede desvincular",
      guia: "#" + m.id + " · " + m.titulo,
      cuerpo: '<p>«' + escapar(nombreDe(slug)) + '» es el único indicador de esta mejora.</p>' +
        '<p class="mini explica">Si se lo quitas, la mejora quedaría sin nada que medir en Impacto. Para cambiarle el ' +
        'indicador, ve a la pestaña Mejoras y toca «Impacta en» en su tarjeta.</p>',
      aceptar: "Entendido",
      alAceptar: async () => {}
    });
    const cancelar = document.querySelector("#velo-forma [data-cerrar]");
    if (cancelar) cancelar.hidden = true;
    return;
  }
  abrirVentana({
    titulo: "Desvincular mejora",
    guia: nombreDe(slug),
    cuerpo:
      '<p>¿Quitarle la mejora “' + escapar(m.titulo) + '” a “' + escapar(nombreDe(slug)) + '”?</p>' +
      '<p class="mini explica">La mejora no se borra y sigue enlazada a lo demás que tenga.</p>',
    aceptar: "Desvincular",
    alAceptar: async () => {
      await desvincularMejora(m.id, slug);
      cerrarVentana();
      await alCambiar("Mejora desvinculada de “" + nombreDe(slug) + "”.");
      return false;
    }
  });
}
