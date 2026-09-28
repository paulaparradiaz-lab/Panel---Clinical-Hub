/* ============================================================
   CLINICAL HUB · DATOS DE LA IA
   Lo que comparten Inbox y Métricas. Todo sale de las dos tablas
   que llena la IA, nunca de las tablas viejas del panel:

   feedback_prueba_clasificacion_por_ia  cada feedback ya clasificado.
                                         Se lee por la vista v_ia_feedback
                                         (fechas y estrellas de verdad,
                                         listas separadas, sin correo).
   categorias_para_ia                    catálogo de temas y de tipos de
                                         solución, con su nombre bonito.

   El panel solo puede editar cuatro columnas de la primera tabla:
   tipos, tema_slug, mejora_slug y estado. Lo demás es del médico.
   ============================================================ */
import { sb, sesionSegura } from "./nucleo.js";

const TABLA = "feedback_prueba_clasificacion_por_ia";

export const TIPOS = [["tema_pedido", "Tema pedido"], ["mejora_tecnica", "Crítica global"]];
export const RUIDO = "ruido";

/* Catálogo: se lee una vez y se guarda aquí */
export const catalogo = { temas: [], mejoras: [], nombres: new Map() };

/* ============================================================
   1. Lectura
   ============================================================ */
export async function cargarCatalogo(){
  if (catalogo.temas.length) return;
  const { data, error } = await sb.from("categorias_para_ia")
    .select("id, slug, nombre, tipo, sinonimos").eq("activo", true).order("nombre");
  if (error) throw error;
  catalogo.temas   = (data || []).filter(c => c.tipo === "tema");
  catalogo.mejoras = (data || []).filter(c => c.tipo === "mejora");
  catalogo.nombres = new Map((data || []).map(c => [c.slug, c.nombre]));
}

/* Color de cada indicador (crítica global). Sigue al indicador, nunca a
   su puesto: los de hoy tienen el suyo fijo y los que se creen después
   toman los siguientes en orden de creación. Es la paleta categórica
   validada para daltonismo; el nombre siempre va escrito al lado. */
const COLOR_FIJO = { cantidad_temas:"#2a78d6", ideas_innovadoras:"#eb6834", interfaz_estetica:"#1baf7a",
  redaccion:"#eda100", soporte:"#e87ba4" };
const COLOR_SIGUIENTE = ["#008300", "#4a3aa7"];
const COLOR_OTRO = "#8a8a8a";   // si algún día hay más indicadores que colores

export function colorIndicador(slug){
  if (COLOR_FIJO[slug]) return COLOR_FIJO[slug];
  const nuevos = catalogo.mejoras.filter(c => !COLOR_FIJO[c.slug] && c.slug !== RUIDO)
    .sort((a, b) => a.id - b.id);
  const i = nuevos.findIndex(c => c.slug === slug);
  return i > -1 && i < COLOR_SIGUIENTE.length ? COLOR_SIGUIENTE[i] : COLOR_OTRO;
}

/* ¿Trae algo escrito? Lo que llega solo con estrellas no tiene nada que
   clasificar: no entra al Inbox, no se reclasifica y no cuenta como
   «Ruido» (sus estrellas sí cuentan en el Ranking de estrellas). */
export function tieneTexto(x){
  return [x.tema_puntual, x.mejora_texto, x.guia_de_referencia].some(t => String(t || "").trim());
}

export function nombreDe(slug){
  return catalogo.nombres.get(slug) || slug;
}

export function nombreTipo(clave){
  if (clave === "resena") return "Reseña";
  const par = TIPOS.find(t => t[0] === clave);
  return par ? par[1] : clave;
}

/* ============================================================
   2. Escritura: clasificar
   Cada fila guarda sus listas como texto separado por comas, igual
   que las deja la IA, para que los dos escriban en el mismo formato.
   La etiqueta "resena" no la decide el panel: si la fila la traía,
   se conserva.
   ============================================================ */
export async function clasificar(filas, temas, mejoras){
  const cambios = filas.map(x => {
    const tipos = [];
    if (temas.length) tipos.push("tema_pedido");
    if (mejoras.length) tipos.push("mejora_tecnica");
    if ((x.tipos || []).indexOf("resena") > -1) tipos.push("resena");
    return sb.from(TABLA).update({
      tipos: tipos.join(","),
      tema_slug: temas.join(","),
      mejora_slug: mejoras.join(","),
      estado: "revisado"
    }).eq("id", x.id).select("id");
  });
  const respuestas = await Promise.all(cambios);
  const fallo = respuestas.find(r => r.error);
  if (fallo) throw fallo.error;
  /* Con RLS, una fila sin permiso no da error: simplemente no cambia. */
  if (respuestas.some(r => !(r.data || []).length)){
    throw new Error("row-level security: no se guardó");
  }
}

/* Desetiquetar: le quita un tema a varias filas. Si una fila tenía
   varios temas, conserva los demás. Si se queda sin tema y sin tipo de
   solución, no está clasificada en nada: vuelve al Inbox (por_revisar). */
export async function quitarTema(filas, slug){
  const cambios = filas.map(x => {
    const temas = (x.temas || []).filter(t => t !== slug);
    const mejoras = x.mejoras || [];
    const tipos = (x.tipos || []).filter(t => t !== "tema_pedido" || temas.length);
    const cambio = { tema_slug: temas.join(","), tipos: tipos.join(",") };
    if (!temas.length && !mejoras.length) cambio.estado = "por_revisar";
    return sb.from(TABLA).update(cambio).eq("id", x.id).select("id");
  });
  const respuestas = await Promise.all(cambios);
  const fallo = respuestas.find(r => r.error);
  if (fallo) throw fallo.error;
  if (respuestas.some(r => !(r.data || []).length)) throw new Error("row-level security: no se guardó");
}

/* Lo mismo con un tipo de crítica global: se le quita a sus comentarios
   y conservan lo demás. Sin tema ni solución, vuelven al Inbox. */
export async function quitarCriticaGlobal(filas, slug){
  const cambios = filas.map(x => {
    const temas = x.temas || [];
    const mejoras = (x.mejoras || []).filter(m => m !== slug);
    const tipos = (x.tipos || []).filter(t => t !== "mejora_tecnica" || mejoras.length);
    const cambio = { mejora_slug: mejoras.join(","), tipos: tipos.join(",") };
    if (!temas.length && !mejoras.length) cambio.estado = "por_revisar";
    return sb.from(TABLA).update(cambio).eq("id", x.id).select("id");
  });
  const respuestas = await Promise.all(cambios);
  const fallo = respuestas.find(r => r.error);
  if (fallo) throw fallo.error;
  if (respuestas.some(r => !(r.data || []).length)) throw new Error("row-level security: no se guardó");
}

/* Devolver al Inbox: la fila vuelve a "por_revisar" para clasificarla de
   nuevo. No se borra nada; al clasificarla, lo nuevo reemplaza lo de antes. */
export async function devolverAlInbox(filas){
  const ids = filas.map(x => x.id);
  const { data, error } = await sb.from(TABLA).update({ estado: "por_revisar" }).in("id", ids).select("id");
  if (error) throw error;
  if ((data || []).length !== ids.length) throw new Error("row-level security: no se guardó");
}

/* Renombrar un tema o un tipo de crítica global: cambia solo el nombre bonito. El código (slug)
   sigue igual, así la IA sigue clasificando con él. El nombre viejo se
   guarda en los sinónimos para que la IA lo siga reconociendo. */
export async function renombrarTema(slug, nuevo, tipo){
  /* tipo: "tema" desde temas pedidos, "mejora" desde críticas. Si la
     etiqueta no está en el catálogo activo se busca en Supabase, para no
     renombrar otra ni dar un falso «no tienes permiso». */
  const deTipo = c => c.slug === slug && (!tipo || c.tipo === tipo);
  let actual = (tipo === "mejora" ? catalogo.mejoras : tipo === "tema" ? catalogo.temas
    : catalogo.temas.concat(catalogo.mejoras)).find(deTipo);
  if (!actual){
    let q = sb.from("categorias_para_ia").select("slug, nombre, sinonimos, tipo").eq("slug", slug);
    if (tipo) q = q.eq("tipo", tipo);
    const { data, error } = await q.limit(1);
    if (error) throw error;
    actual = (data || [])[0];
    if (!actual) throw new Error("No se encontró la etiqueta «" + slug + "» en el catálogo.");
  }
  const lista = String(actual.sinonimos || "").split("|").map(t => t.trim()).filter(Boolean);
  const viejo = String(actual.nombre || "").trim();
  if (viejo && viejo.toLowerCase() !== nuevo.trim().toLowerCase() &&
      !lista.some(t => t.toLowerCase() === viejo.toLowerCase())) lista.push(viejo);
  const { data, error } = await sb.from("categorias_para_ia")
    .update({ nombre: nuevo.trim(), sinonimos: lista.join(" | ") })
    .eq("slug", slug).eq("tipo", actual.tipo).select("slug");
  if (error) throw error;
  if (!(data || []).length) throw new Error("row-level security: no se guardó");
  catalogo.temas = [];   // el catálogo se vuelve a leer con el nombre nuevo
}

/* «Otras formas de decirlo»: se pueden separar con comas o con barras |.
   Se guardan siempre con barras, que es como las lee la IA. */
export const separarFormas = texto => String(texto || "").split(/[|,]/).map(t => t.trim()).filter(Boolean).join(" | ");

/* Etiqueta nueva en el catálogo: un tema pedido (tipo "tema") o una
   crítica global (tipo "mejora"). El código (slug) sale del nombre, sin
   tildes ni espacios; si ya existe, se le pone un número al final. */
export async function crearEtiqueta(tipo, nombre, sinonimos){
  const base = nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "etiqueta";
  for (let i = 1; i <= 20; i++){
    const slug = i === 1 ? base : base + "_" + i;
    const { error } = await sb.from("categorias_para_ia")
      .insert({ slug: slug, nombre: nombre.trim(), tipo: tipo, sinonimos: sinonimos || null });
    if (!error){ catalogo.temas = []; return slug; }   // el catálogo se vuelve a leer con la nueva
    if (error.code !== "23505") throw error;           // 23505: ese código ya existe, prueba el siguiente
    /* Si ese código ya es esta misma etiqueta (un intento anterior sí se
       guardó y se perdió la respuesta), no se crea otra */
    const { data: ya } = await sb.from("categorias_para_ia").select("nombre, tipo").eq("slug", slug).limit(1);
    const previa = (ya || [])[0];
    if (previa && previa.tipo === tipo && String(previa.nombre).trim().toLowerCase() === nombre.trim().toLowerCase()){
      catalogo.temas = [];
      return slug;
    }
  }
  throw new Error("No se pudo crear la etiqueta.");
}

/* ============================================================
   3. Soluciones (mejoras_ia), su enlace con los temas y las soluciones
   globales (mejora_ia_tema) y sus personas (mejora_ia_persona).
   Una solución no se borra: para descartarla se cambia su estado.
   Desvincular solo quita el enlace con el tema o la crítica global.
   ============================================================ */
export const ESTADOS = [["pendiente", "Pendiente"], ["en_curso", "En curso"],
  ["hecha", "Completada"], ["descartada", "Descartada"]];

export function nombreEstado(e){
  const par = ESTADOS.find(x => x[0] === e);
  return par ? par[1] : e;
}

export async function cargarSoluciones(){
  const [m, e, p] = await Promise.all([
    sb.from("mejoras_ia").select("*").order("creado_en", { ascending:false }),
    sb.from("mejora_ia_tema").select("*"),
    sb.from("mejora_ia_persona").select("*")
  ]);
  if (m.error) throw m.error;
  if (e.error) throw e.error;
  if (p.error) throw p.error;
  return { mejoras: m.data || [], enlaces: e.data || [], personas: p.data || [] };
}

/* De cada tema o indicador, TODAS sus soluciones (sin las descartadas),
   de la más antigua a la más nueva. Un indicador como «Cantidad de
   temas» suele tener varias: cada guía publicada es una solución. */
export function solucionesPorSlug(datos){
  const porId = new Map(datos.mejoras.map(m => [m.id, m]));
  const mapa = new Map();
  datos.enlaces.forEach(e => {
    const m = porId.get(e.mejora_id);
    if (!m || m.estado === "descartada") return;
    if (!mapa.has(e.tema_slug)) mapa.set(e.tema_slug, []);
    mapa.get(e.tema_slug).push(m);
  });
  mapa.forEach(lista => lista.sort((a, b) => a.id - b.id));
  return mapa;
}

/* Cuántos indicadores (críticas globales) tiene una solución: si es uno
   solo, no se puede desvincular desde un ranking (quedaría sin nada que
   medir en Impacto). */
export function indicadoresDe(datos, solucionId){
  const globales = new Set(catalogo.mejoras.map(c => c.slug).filter(x => x !== RUIDO));
  return datos.enlaces.filter(e => e.mejora_id === solucionId && globales.has(e.tema_slug)).map(e => e.tema_slug);
}

/* extra: estado, y para una solución del pasado su fecha de completada
   (completada_en) y de creación (creado_en), para que Impacto mida
   desde el día en que de verdad se hizo. */
export async function crearSolucion(titulo, detalle, extra){
  const fila = Object.assign({ titulo: titulo, detalle: detalle || null }, extra || {});
  const { data, error } = await sb.from("mejoras_ia").insert(fila).select("id").single();
  if (error) throw error;
  return data.id;
}

/* Solución nueva en un solo paso (función crear_mejora_completa en
   Supabase): la crea, la enlaza y le asigna personas en una sola
   transacción. «clave» nace al abrir la ventana: si Guardar llega dos
   veces (doble clic o reintento tras un corte), Supabase devuelve la
   solución ya creada en vez de hacer otra. */
export async function crearSolucionCompleta({ clave, titulo, detalle, extra, enlaces, personas }){
  const e = extra || {};
  const { data, error } = await sb.rpc("crear_mejora_completa", {
    p_clave: clave, p_titulo: titulo, p_detalle: detalle || null,
    p_estado: e.estado || "pendiente", p_completada_en: e.completada_en || null,
    p_creado_en: e.creado_en || null, p_enlaces: enlaces, p_personas: personas || []
  });
  if (error) throw error;
  return data;
}

export async function enlazarSolucion(solucionId, slug){
  const { error } = await sb.from("mejora_ia_tema").insert({ mejora_id: solucionId, tema_slug: slug });
  /* 23505: ya estaba enlazada (una solución que existía); no es un error */
  if (error && error.code !== "23505") throw error;
}

export async function desvincularSolucion(solucionId, slug){
  const { data, error } = await sb.from("mejora_ia_tema").delete()
    .eq("mejora_id", solucionId).eq("tema_slug", slug).select("mejora_id");
  if (error) throw error;
  if (!(data || []).length) await siguePuesto("mejora_ia_tema", { mejora_id: solucionId, tema_slug: slug });
}

export async function editarSolucion(solucionId, cambios){
  const { data, error } = await sb.from("mejoras_ia").update(cambios).eq("id", solucionId).select("id");
  if (error) throw error;
  if (!(data || []).length) throw new Error("row-level security: no se guardó");
}

/* Personas de cada solución (mejora_ia_persona): una o varias. La lista
   sale de los usuarios del panel (función usuarios_panel), así cada
   usuario nuevo aparece solo. */
export async function cargarUsuarios(){
  const { data, error } = await sb.rpc("usuarios_panel");
  if (error) throw error;
  return data || [];
}

export async function asignarPersona(solucionId, usuarioId){
  const { error } = await sb.from("mejora_ia_persona").insert({ mejora_id: solucionId, usuario_id: usuarioId });
  /* 23505: ya estaba asignada (un intento anterior sí se guardó); no es un error */
  if (error && error.code !== "23505") throw error;
}

export async function quitarPersona(solucionId, usuarioId){
  const { data, error } = await sb.from("mejora_ia_persona").delete()
    .eq("mejora_id", solucionId).eq("usuario_id", usuarioId).select("mejora_id");
  if (error) throw error;
  if (!(data || []).length) await siguePuesto("mejora_ia_persona", { mejora_id: solucionId, usuario_id: usuarioId });
}

/* Un borrado que no tocó filas: si la fila ya no existe (un intento
   anterior sí la quitó) está bien; si sigue ahí, fue falta de permiso. */
async function siguePuesto(tabla, filtro){
  /* Sin el código de la app la fila tampoco se ve: no se puede dar por
     quitada, así que se avisa de que falta verificar el código */
  if (!(await sesionSegura())) throw new Error("aal2 requerido");
  let q = sb.from(tabla).select("mejora_id");
  Object.keys(filtro).forEach(k => { q = q.eq(k, filtro[k]); });
  const { data, error } = await q.limit(1);
  if (error) throw error;
  if ((data || []).length) throw new Error("row-level security: no se guardó");
}

/* ============================================================
   4. Ayudas de presentación
   ============================================================ */
const PAISES = { CO:"Colombia", MX:"México", PE:"Perú", ES:"España", CL:"Chile", EC:"Ecuador",
  PA:"Panamá", US:"Estados Unidos", AR:"Argentina", BO:"Bolivia", BR:"Brasil", CR:"Costa Rica",
  DO:"República Dominicana", GT:"Guatemala", HN:"Honduras", NI:"Nicaragua", PY:"Paraguay",
  SV:"El Salvador", UY:"Uruguay", VE:"Venezuela" };

export function nombrePais(c){
  const k = String(c || "").toUpperCase();
  return PAISES[k] || k;
}

const ORIGENES = { "whatsapp":"WhatsApp", "encuesta-modal":"Encuesta del sitio", "sitio-web":"Sitio web",
  "buscador-sugerencia-tema":"Buscador · sugerencia", "buscador-sin-resultados":"Buscador · sin resultados",
  "buscador-sin-resultados-libre":"Buscador · texto libre" };

export function nombreOrigen(o){
  return o ? (ORIGENES[o] || o) : "Sin origen";
}
