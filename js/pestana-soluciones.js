/* ============================================================
   CLINICAL HUB · PESTAÑA SOLUCIONES (panel nuevo)
   Todas las soluciones en un solo lugar. Se crean desde los rankings de
   Feedback › Métricas; aquí solo se manejan:

   ESTADO       Pendiente, En curso, Completada o Descartada (un toque).
   INDICADOR    La crítica global en la que impacta (Cantidad de temas,
                Interfaz/estética…): se ve arriba y se cambia tocándolo.
                Es lo que mide Impacto.
   PERSONAS     Una o varias por solución, elegidas de los usuarios del
                panel (función usuarios_panel): cada usuario nuevo
                aparece solo.

   Lee mejoras_ia, mejora_ia_tema, mejora_ia_persona y v_ia_feedback
   (para contar cuántos comentarios tiene cada tema).
   ============================================================ */
import { sb, $, estado, escapar, fecha, num, abrirVentana, avisar, cerrarVentana,
  traducirError } from "./nucleo.js";
import { catalogo, cargarCatalogo, cargarSoluciones, nombreDe, nombreEstado, editarSolucion, RUIDO, colorIndicador,
  enlazarSolucion, desvincularSolucion,
  cargarUsuarios, asignarPersona, quitarPersona } from "./ia.js";
import { plural } from "./ia-ventanas.js";
import { ventanaVerSolucion, ventanaNuevaSolucion } from "./solucion-ventanas.js";

let mejoras = [];
let enlaces = [];
let personas = [];
let usuarios = [];
let cuenta = new Map();          // slug -> cuántos comentarios clasificados
const f = { estado:"todas", persona:"todas" };
let escuchando = false;           // los avisos de fuera del menú se ponen una sola vez

/* Dos desplegables: Estado y Responsable. "Activas" es lo que está por
   hacer (pendientes y en curso); "Todas" va aparte, al final. */
const FILTRO_ESTADO = [["activas","Activas"], ["pendiente","Pendientes"], ["en_curso","En curso"],
  ["hecha","Completadas"], ["descartada","Descartadas"], ["todas","Todas"]];
const FILTRO_PERSONA = [["todas","Todas las personas"], ["mias","Mías"], ["sin","Sin asignar"]];

const FLECHA = '<svg class="desplegable-flecha" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';


/* ============================================================
   1. Armazón
   ============================================================ */
export function recargar(){ return cargar(); }

/* Se pinta dentro de la subpestaña de Soluciones (pestana-soluciones-impacto.js),
   que pone el título y el botón Actualizar. */
export async function render(caja){
  caja.innerHTML = `<p class="aviso" id="aviso-panel" role="status"></p>
<p class="resumen-sub" id="resumen-soluciones"></p>

<div class="desplegables" id="filtros-soluciones">
  <div class="desplegable" id="f-estado"></div>
  <div class="desplegable" id="f-persona"></div>
  <button class="boton-chico boton-nueva" id="btn-nueva-solucion">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Nueva solución</button>
</div>

<div id="lista-soluciones" class="lista-soluciones"><p class="vacio">Cargando…</p></div>`;

  /* Tocar la pastilla abre su menú (y cierra el otro); elegir una
     opción filtra y cierra. Fuera del menú o con Escape se cierra. */
  $("#filtros-soluciones").addEventListener("click", e => {
    const caja = e.target.closest(".desplegable");
    if (!caja) return;
    const op = e.target.closest("button[data-v]");
    if (op){
      f[caja.id === "f-estado" ? "estado" : "persona"] = op.dataset.v;
      pintar();
      return;
    }
    if (e.target.closest(".desplegable-boton")){
      const abrir = !caja.classList.contains("abierto");
      cerrarDesplegables();
      caja.classList.toggle("abierto", abrir);
      caja.querySelector(".desplegable-boton").setAttribute("aria-expanded", String(abrir));
    }
  });
  if (!escuchando){
    escuchando = true;
    document.addEventListener("click", e => { if (!e.target.closest("#filtros-soluciones")) cerrarDesplegables(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") cerrarDesplegables(); });
    window.addEventListener("resize", colocarGomas);
  }
  $("#lista-soluciones").addEventListener("click", alTocar);
  $("#btn-nueva-solucion").addEventListener("click", () => ventanaNuevaSolucion({ alCambiar: trasCambio }));

  await cargar();
}

/* ============================================================
   2. Datos
   ============================================================ */
async function cargar(){
  let fb, datos;
  try {
    [datos, usuarios, fb] = await Promise.all([
      cargarSoluciones(),
      cargarUsuarios(),
      sb.from("v_ia_feedback").select("temas, mejoras, estado"),
      cargarCatalogo()
    ]);
    if (fb.error) throw fb.error;
  } catch (err){
    if (!$("#lista-soluciones")) return;
    $("#lista-soluciones").innerHTML = '<p class="vacio">No se pudieron leer las soluciones. ' +
      escapar(traducirError(err && err.message)) + '</p>';
    return;
  }
  if (!$("#lista-soluciones")) return;
  mejoras = datos.mejoras;
  enlaces = datos.enlaces;
  personas = datos.personas;
  cuenta = new Map();
  (fb.data || []).filter(x => x.estado !== "por_revisar").forEach(x =>
    (x.temas || []).concat(x.mejoras || []).forEach(s => cuenta.set(s, (cuenta.get(s) || 0) + 1)));
  pintar();
}

function personasDe(m){
  return personas.filter(p => p.mejora_id === m.id).map(p => p.usuario_id);
}

function nombreUsuario(id){
  const u = usuarios.find(x => x.id === id);
  return u ? u.nombre : "Usuario sin acceso";
}

function esCriticaGlobal(slug){
  return catalogo.mejoras.some(c => c.slug === slug);
}

/* Los indicadores de una solución: las críticas globales a las que está
   enlazada (si quedara algún tema viejo enlazado, no cuenta). */
function temasDe(m){
  return enlaces.filter(e => e.mejora_id === m.id).map(e => e.tema_slug).filter(t => !esCriticaGlobal(t));
}

function indicadoresDe(m){
  return enlaces.filter(e => e.mejora_id === m.id).map(e => e.tema_slug).filter(esCriticaGlobal);
}

/* ============================================================
   3. Pintado
   ============================================================ */
function pintar(){
  const yo = estado.usuario && estado.usuario.id;
  const porEstado = m => f.estado === "todas" ||
    (f.estado === "activas" ? (m.estado === "pendiente" || m.estado === "en_curso") : m.estado === f.estado);
  const porPersona = m => {
    const ps = personasDe(m);
    if (f.persona === "mias") return ps.indexOf(yo) > -1;
    if (f.persona === "sin") return !ps.length;
    if (f.persona.indexOf("u:") === 0) return ps.indexOf(f.persona.slice(2)) > -1;
    return true;
  };

  /* Los números del menú de Estado cuentan con el Responsable puesto */
  const opEstado = FILTRO_ESTADO.map(par => [par[0], par[1], mejoras.filter(m => porPersona(m) && (par[0] === "todas" ||
    (par[0] === "activas" ? (m.estado === "pendiente" || m.estado === "en_curso") : m.estado === par[0]))).length]);
  /* Responsable: las tres fijas y, debajo, cada usuario del panel */
  const opPersona = FILTRO_PERSONA.concat(usuarios.map(u => ["u:" + u.id, u.nombre]));
  if (!opPersona.some(par => par[0] === f.persona)) f.persona = "todas";
  pintarDesplegable($("#f-estado"), "Estado", opEstado, f.estado, [5]);
  pintarDesplegable($("#f-persona"), "Responsable", opPersona, f.persona, usuarios.length ? [3] : []);

  const cuentaDe = e => mejoras.filter(m => m.estado === e).length;
  /* &nbsp;: el número nunca queda solo al final de una línea */
  $("#resumen-soluciones").innerHTML = "<b>" + num(mejoras.length) + "</b>&nbsp;soluciones · <b>" +
    num(cuentaDe("pendiente")) + "</b>&nbsp;pendientes · <b>" + num(cuentaDe("en_curso")) + "</b>&nbsp;en&nbsp;curso · <b>" +
    num(cuentaDe("hecha")) + "</b>&nbsp;completadas";

  if (!mejoras.length){
    $("#lista-soluciones").innerHTML = '<p class="vacio">Todavía no hay soluciones. Crea una con «Nueva solución», ' +
      'o desde Feedback › Métricas con «Crear solución» en los rankings.</p>';
    return;
  }
  /* Primero lo que está por hacer, luego lo completado y al final lo
     descartado: al completar una solución no se esconde, baja. */
  const ORDEN = { en_curso:0, pendiente:1, hecha:2, descartada:3 };
  const lista = mejoras.filter(m => porEstado(m) && porPersona(m))
    .sort((a, b) => (ORDEN[a.estado] - ORDEN[b.estado]) || (b.id - a.id));
  if (!lista.length){
    $("#lista-soluciones").innerHTML = '<p class="vacio">Ninguna solución cumple ese filtro. Prueba con Todas.</p>';
    return;
  }
  $("#lista-soluciones").innerHTML = lista.map(tarjeta).join("");
  colocarGomas();
}

/* ============================================================
   Goma de los pasos
   La pastilla verde oscuro (.goma-paso) marca el estado actual y, al
   tocar otro paso, viaja hasta él estirándose con la misma curva
   elástica de las subpestañas Inbox | Métricas.
   ============================================================ */
function moverGomaPaso(caja){
  const goma = caja.querySelector(".goma-paso");
  const actual = caja.querySelector(".paso-solucion.actual");
  if (!goma) return;
  if (!actual){ goma.style.opacity = "0"; return; }
  goma.style.left = actual.offsetLeft + "px";
  goma.style.width = actual.offsetWidth + "px";
  goma.style.opacity = "1";
}

/* Al pintar (o al cambiar el tamaño) la goma aparece ya en su sitio,
   sin viajar desde el borde. */
function colocarGomas(){
  document.querySelectorAll("#lista-soluciones .pasos-solucion").forEach(caja => {
    caja.classList.add("quieta");
    moverGomaPaso(caja);
    void caja.offsetWidth;
    caja.classList.remove("quieta");
  });
}

/* Marca un paso en pantalla antes de guardar, para que la goma viaje
   de una vez; si no se guarda, se vuelve a marcar el de antes. */
function marcarPaso(caja, estadoNuevo){
  const i = PASOS.indexOf(estadoNuevo);
  caja.querySelectorAll(".paso-solucion").forEach((p, j) => {
    p.classList.toggle("hecho", i > -1 && j <= i);
    p.classList.toggle("actual", j === i);
    p.setAttribute("aria-pressed", String(j === i));
    p.querySelector(".paso-num").textContent = i > -1 && j < i ? "✓" : String(j + 1);
  });
  moverGomaPaso(caja);
}

/* La tarjeta: arriba el indicador (la crítica global en la que impacta)
   y el responsable; en medio el título y los pasos Pendiente → En curso
   → Completada, que se tocan para cambiar el estado; abajo el número,
   la fecha y Descartar / Recuperar. */
const PASOS = ["pendiente", "en_curso", "hecha"];
const ICONO_INDICADOR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>';
const LAPIZ = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L18 10l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>';
const CANDADO = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 1 1 8 0v4"/></svg>';
const MAS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

function tarjeta(m){
  const indicadores = indicadoresDe(m);
  const ps = personasDe(m);
  const id = m.id;
  const paso = PASOS.indexOf(m.estado);          // -1 si está descartada
  /* Descartada: la tarjeta queda bloqueada, en gris. Nada se puede tocar
     salvo «Recuperar», que la devuelve al estado que tenía antes. */
  const bloqueada = paso === -1;
  const off = bloqueada ? ' disabled tabindex="-1"' : '';

  /* El indicador: la crítica global en la que impacta, con la flechita
     en un círculo de su color. Todo el botón abre la ventana para
     elegirlo o cambiarlo. */
  const indicador = '<button type="button" class="indicador-solucion' + (indicadores.length ? '' : ' vacio') +
      '" data-indicador="' + id + '" title="' + (indicadores.length ? "Cambiar indicador" : "Elegir indicador") + '"' + off + '>' +
    '<span class="indicador-rotulo">Impacta en</span>' +
    (indicadores.length
      ? indicadores.map(s => '<span class="indicador-item" style="--c:' + colorIndicador(s) + '">' + ICONO_INDICADOR +
          '<b>' + escapar(nombreDe(s)) + '</b></span>').join("")
      : '<span class="indicador-item">' + ICONO_INDICADOR + '<b>Elegir indicador</b></span>') +
  '</button>';

  /* Responsable: iniciales y nombre; todo el botón abre Asignar */
  const responsable = ps.length
    ? ps.map(u => '<span class="responsable"><span class="inicial" aria-hidden="true">' +
        escapar(nombreUsuario(u).slice(0, 1).toUpperCase()) + '</span>' + escapar(nombreUsuario(u)) + '</span>').join("")
    : '<span class="inicial vacia" aria-hidden="true">' + MAS + '</span><span class="sin-responsable">Asignar responsable</span>';

  const pasos = PASOS.map((e, i) =>
    '<button type="button" class="paso-solucion' + (paso > -1 && i <= paso ? ' hecho' : '') + (i === paso ? ' actual' : '') +
      '" data-estado="' + e + '" data-id="' + id + '" aria-pressed="' + (i === paso) + '"' + off + '>' +
      '<span class="paso-num" aria-hidden="true">' + (paso > -1 && i < paso ? '✓' : i + 1) + '</span>' +
      escapar(nombreEstado(e)) + '</button>').join('<i class="paso-linea" aria-hidden="true"></i>');

  return '<article class="caja tarjeta-solucion' + (bloqueada ? ' bloqueada' : '') + '" data-estado="' + escapar(m.estado) + '">' +
    '<div class="tarjeta-solucion-top">' + indicador +
      '<button type="button" class="boton-responsable" data-asignar="' + id + '" title="Asignar responsable"' + off + '>' +
        responsable + '</button>' +
    '</div>' +
    '<div class="tarjeta-solucion-titulo"><h3>' + escapar(m.titulo) + '</h3>' +
      (bloqueada
        ? '<span class="candado-solucion" title="Descartada: está bloqueada">' + CANDADO + '</span>'
        : '<button class="icono-btn" data-editar="' + id + '" title="Editar" aria-label="Editar solución">' + LAPIZ + '</button>') +
    '</div>' +
    (m.detalle ? '<p class="tarjeta-solucion-detalle">' + escapar(m.detalle) + '</p>' : '') +
    '<div class="pasos-solucion" role="group" aria-label="Estado de la solución">' +
      '<span class="goma-paso" aria-hidden="true"></span>' + pasos +
      (paso === -1 ? '<span class="descartada-marca">Descartada</span>' : '') + '</div>' +
    (temasDe(m).length ? '<p class="mini tarjeta-solucion-tema">Atiende ' + (temasDe(m).length === 1 ? 'el tema' : 'los temas') +
      ': <b>' + temasDe(m).map(t => escapar(nombreDe(t))).join(", ") + '</b></p>' : '') +
    '<div class="tarjeta-solucion-pie">' +
      '<span class="mini tarjeta-solucion-id">#' + id + ' · ' + fecha(m.creado_en) + '</span>' +
      (paso === -1
        ? '<button class="boton-chico recuperar-solucion" data-id="' + id + '">Recuperar</button>'
        : '<button class="enlace-descartar" data-estado="descartada" data-id="' + id + '">Descartar</button>') +
    '</div>' +
  '</article>';
}

/* Un desplegable: la pastilla «Rótulo: elegido ⌄» y su menú. corte dice
   antes de qué opciones va una rayita separadora. */
function pintarDesplegable(caja, rotulo, lista, elegido, corte){
  const actual = lista.find(par => par[0] === elegido) || lista[0];
  const abierto = caja.classList.contains("abierto");
  caja.innerHTML =
    '<button type="button" class="desplegable-boton" aria-haspopup="true" aria-expanded="' + abierto + '">' +
      '<em>' + rotulo + ':</em> <b>' + escapar(actual[1]) + '</b>' + FLECHA + '</button>' +
    '<div class="desplegable-menu" role="menu" aria-label="' + rotulo + '">' +
    lista.map((par, i) =>
      (corte.indexOf(i) > -1 ? '<div class="desplegable-raya"></div>' : '') +
      '<button type="button" role="menuitemradio" class="desplegable-op" data-v="' + escapar(par[0]) + '" aria-checked="' +
        (par[0] === actual[0]) + '"><span class="desplegable-ok" aria-hidden="true">' + (par[0] === actual[0] ? "✓" : "") +
        '</span><span>' + escapar(par[1]) + '</span>' + (par.length > 2 ? '<small>' + num(par[2]) + '</small>' : '') +
      '</button>').join("") +
    '</div>';
  caja.classList.remove("abierto");
}

function cerrarDesplegables(){
  document.querySelectorAll("#filtros-soluciones .desplegable.abierto").forEach(c => {
    c.classList.remove("abierto");
    c.querySelector(".desplegable-boton").setAttribute("aria-expanded", "false");
  });
}

/* ============================================================
   4. Acciones
   ============================================================ */
async function trasCambio(texto){
  avisar(texto, "ok", "#aviso-panel");
  await cargar();
}

function solucionPorId(id){
  return mejoras.find(m => String(m.id) === String(id));
}

async function alTocar(e){
  const b = e.target.closest("button");
  if (!b) return;
  const m = solucionPorId(b.dataset.id || b.dataset.editar || b.dataset.asignar || b.dataset.indicador);
  if (!m) return;

  /* Una descartada está bloqueada: solo responde «Recuperar» */
  if (m.estado === "descartada" && !b.classList.contains("recuperar-solucion")) return;
  if (b.dataset.editar){ ventanaVerSolucion({ mejora: m, alCambiar: trasCambio }); return; }
  if (b.dataset.indicador){ ventanaIndicador(m); return; }
  if (b.dataset.asignar){ ventanaAsignar(m); return; }
  if (b.classList.contains("recuperar-solucion")){ await recuperar(m, b); return; }
  /* El estado se guarda de una: se deshace igual de fácil. En los
     pasos, la goma viaja primero y la lista se repinta cuando termina. */
  if (b.dataset.estado){
    if (b.dataset.estado === m.estado) return;
    const caja = b.classList.contains("paso-solucion") ? b.closest(".pasos-solucion") : null;
    const antes = m.estado;
    if (caja) marcarPaso(caja, b.dataset.estado);
    b.disabled = true;
    try {
      await editarSolucion(m.id, { estado: b.dataset.estado });
      if (caja) await new Promise(r => setTimeout(r, 650));
      await trasCambio("Solución #" + m.id + ": " + nombreEstado(b.dataset.estado).toLowerCase() + ".");
    } catch (err){
      b.disabled = false;
      if (caja) marcarPaso(caja, antes);
      avisar(traducirError(err && err.message), "mal", "#aviso-panel");
    }
    return;
  }
}

/* Recuperar una descartada: vuelve al estado que tenía antes de
   descartarla (sale del historial). Si estaba Completada, conserva su
   fecha de completada: el trigger pone la de hoy al cambiar el estado,
   así que después se le devuelve la que tenía. */
async function recuperar(m, b){
  b.disabled = true;
  try {
    const { data, error } = await sb.from("mejora_ia_historial").select("estado")
      .eq("mejora_id", m.id).order("cambiado_en", { ascending:false }).order("id", { ascending:false });
    if (error) throw error;
    const previo = ((data || []).find(h => h.estado !== "descartada") || {}).estado || "pendiente";
    await editarSolucion(m.id, { estado: previo });
    if (previo === "hecha" && m.completada_en) await editarSolucion(m.id, { completada_en: m.completada_en });
    await trasCambio("Solución #" + m.id + " recuperada: vuelve a " + nombreEstado(previo).toLowerCase() + ".");
  } catch (err){
    b.disabled = false;
    avisar(traducirError(err && err.message), "mal", "#aviso-panel");
  }
}

/* Asignar: la lista de usuarios del panel, se marcan una o varias */
function ventanaAsignar(m){
  const antes = personasDe(m);
  const elegidas = new Set(antes);
  abrirVentana({
    titulo: "Personas de la solución",
    guia: "#" + m.id + " · " + m.titulo,
    cuerpo:
      '<p class="mini explica">Marca una o varias. La lista son los usuarios del panel: cada usuario nuevo aparece aquí solo.</p>' +
      '<div class="bandeja-opciones" id="a-usuarios" style="max-height:50vh">' +
      (usuarios.length ? usuarios.map(u =>
        '<button type="button" class="fila-opcion" data-usuario="' + escapar(u.id) + '" aria-pressed="' + elegidas.has(u.id) + '">' +
        '<span><b>' + escapar(u.nombre) + '</b><span class="mini">' + escapar(u.correo) + '</span></span>' +
        '<span class="marca-opcion" aria-hidden="true"></span></button>').join("")
        : '<p class="vacio">No hay usuarios en el panel.</p>') +
      '</div>',
    aceptar: "Guardar",
    alAceptar: async () => {
      const suman = Array.from(elegidas).filter(u => antes.indexOf(u) === -1);
      const salen = antes.filter(u => !elegidas.has(u));
      for (const u of suman) await asignarPersona(m.id, u);
      for (const u of salen) await quitarPersona(m.id, u);
      cerrarVentana();
      if (suman.length || salen.length)
        await trasCambio("Solución #" + m.id + ": " + (elegidas.size
          ? plural(elegidas.size, "persona asignada", "personas asignadas") : "sin personas") + ".");
      return false;
    }
  });
  $("#a-usuarios").addEventListener("click", e => {
    const b = e.target.closest("button[data-usuario]");
    if (!b) return;
    const u = b.dataset.usuario;
    if (elegidas.has(u)) elegidas.delete(u); else elegidas.add(u);
    b.setAttribute("aria-pressed", String(elegidas.has(u)));
    b.classList.toggle("recien", elegidas.has(u));
  });
}

/* Indicador: las críticas globales, se marcan una o varias. Al guardar
   se enlazan las nuevas y se desvinculan las que se desmarcaron. */
function ventanaIndicador(m){
  const antes = indicadoresDe(m);
  const elegidos = new Set(antes);
  const globales = catalogo.mejoras.filter(c => c.slug !== RUIDO);
  abrirVentana({
    titulo: "Indicador",
    guia: "#" + m.id + " · " + m.titulo,
    cuerpo:
      '<p class="mini explica">¿En qué crítica global impacta? Es lo que mide la pestaña Impacto: si bajan las críticas ' +
      'de ese indicador después de completarla. Puedes marcar más de uno.</p>' +
      '<div class="bandeja-opciones" id="i-globales" style="max-height:50vh">' +
      globales.map(c =>
        '<button type="button" class="fila-opcion" data-slug="' + escapar(c.slug) + '" aria-pressed="' + elegidos.has(c.slug) + '">' +
        '<span class="indicador-item" style="--c:' + colorIndicador(c.slug) + '">' + ICONO_INDICADOR +
        '<span><b>' + escapar(c.nombre) + '</b><span class="mini">' + plural(cuenta.get(c.slug) || 0, "comentario", "comentarios") +
        '</span></span></span><span class="marca-opcion" aria-hidden="true"></span></button>').join("") +
      '</div>' +
      '<p class="mini explica">¿No está? Créalo con «Nueva etiqueta» en Feedback › Métricas, en el ranking de críticas globales.</p>',
    aceptar: "Guardar",
    alAceptar: async () => {
      if (!elegidos.size){ avisar("Elige al menos un indicador.", "mal", "#aviso-forma"); return false; }
      for (const s of elegidos) if (antes.indexOf(s) === -1) await enlazarSolucion(m.id, s);
      for (const s of antes) if (!elegidos.has(s)) await desvincularSolucion(m.id, s);
      cerrarVentana();
      await trasCambio("Solución #" + m.id + ": impacta en " + Array.from(elegidos).map(nombreDe).join(" y ") + ".");
      return false;
    }
  });
  $("#i-globales").addEventListener("click", e => {
    const b = e.target.closest("button[data-slug]");
    if (!b) return;
    const s = b.dataset.slug;
    if (elegidos.has(s)) elegidos.delete(s); else elegidos.add(s);
    b.setAttribute("aria-pressed", String(elegidos.has(s)));
    b.classList.toggle("recien", elegidos.has(s));
  });
}
