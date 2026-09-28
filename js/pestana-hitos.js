/* ============================================================
   CLINICAL HUB · PESTAÑA HITOS (metro)
   Cada medida es una línea de metro y cada meta una estación. Las
   estaciones se desbloquean solas cuando el número llega a la meta, y
   los dos corredores de Clinical Hub (recortados de la ilustración del
   login) van sobre la línea justo donde está el número hoy.

   LÍNEAS   1 · Calificaciones de 5 ★: de v_ia_feedback (la fecha de cada
                estación es el día en que llegó la calificación número N).
            2 · Ventas y 3 · Facturación acumulada: todavía sin fuente de
                datos; salen «sin conectar» hasta que exista (NEGOCIO).
   ============================================================ */
import { sb, $, escapar, fecha, num } from "./nucleo.js";

/* Ventas y facturación: sin tabla todavía. Cuando haya fuente, se leen
   aquí y se devuelven como { actual, fechaDe(meta) } igual que las 5 ★. */
const NEGOCIO = null;

const usd = n => "US$ " + num(n);
const usdCorto = n => "US$ " + (n >= 1000 ? num(n / 1000) + " mil" : num(n));

const LINEAS = [
  { clave:"cinco", nombre:"5 ★", unidad:"calificaciones de 5 ★", color:"#7ab447",
    metas:[10, 25, 50, 100, 250, 500], valor:num, corto:num },
  { clave:"ventas", nombre:"Ventas", unidad:"ventas", color:"#2fa9a0",
    metas:[10, 50, 100, 250, 500, 1000], valor:num, corto:num },
  { clave:"facturacion", nombre:"Facturación", unidad:"facturados", color:"#e2a83c",
    metas:[100, 500, 1000, 5000, 10000, 50000], valor:usd, corto:usdCorto }
];

/* Posición de cada estación en la línea (en %) */
const X = j => 6 + j * 17.6;

export async function render(){
  $("#vista").innerHTML = `
<div class="cabecera cabecera-compacta">
  <div>
    <div class="mast"><span class="etiqueta">Hoja de vida del proyecto</span><h1>Hitos</h1></div>
    <p>Se desbloquean solos a medida que Clinical Hub crece.</p>
  </div>
</div>
<section class="caja metro-caja">
  <div class="metro-cab"><h2 class="titulo-seccion">Las líneas de Clinical Hub</h2><span class="metro-mini" id="metro-total"></span></div>
  <div id="metro-lineas"><p class="vacio">Cargando…</p></div>
</section>`;

  const [cinco, imagen] = await Promise.all([
    sb.from("v_ia_feedback").select("fecha").eq("estrellas", 5).order("fecha", { ascending:true }),
    corredores().catch(() => null)
  ]);
  if (cinco.error){
    $("#metro-lineas").innerHTML = '<p class="vacio">No se pudieron leer los datos. ' + escapar(cinco.error.message) + '</p>';
    return;
  }
  const fechas = (cinco.data || []).map(x => x.fecha);
  const datos = {
    cinco: { actual: fechas.length, fechaDe: n => fechas[n - 1] || null },
    ventas: NEGOCIO && NEGOCIO.ventas,
    facturacion: NEGOCIO && NEGOCIO.facturacion
  };
  pintar(datos, imagen);
}

function pintar(datos, imagen){
  let logradas = 0, total = 0;
  $("#metro-lineas").innerHTML = LINEAS.map((l, i) => {
    const d = datos[l.clave];
    total += l.metas.length;
    if (!d) return lineaSinDatos(l, i);
    const hechas = l.metas.filter(n => d.actual >= n).length;
    logradas += hechas;
    const sig = l.metas[hechas];
    const ant = l.metas[hechas - 1] || 0;
    const avance = sig ? (d.actual - ant) / (sig - ant) : 0;
    const pos = hechas === 0 ? 2 : X(hechas - 1) + (sig ? (X(hechas) - X(hechas - 1)) * avance : 0);
    const estado = sig
      ? 'Van <b>' + escapar(l.valor(d.actual)) + '</b> · próxima estación <b>' + escapar(l.corto(sig)) +
        '</b> (faltan ' + escapar(l.valor(sig - d.actual)) + ')'
      : 'Van <b>' + escapar(l.valor(d.actual)) + '</b> · ¡todas las estaciones!';
    return '<div class="metro-linea" style="--c:' + l.color + '">' +
      '<div class="metro-cab"><span class="metro-num">' + (i + 1) + '</span><b>Línea ' + escapar(l.nombre) + '</b>' +
        '<span class="metro-mini">' + estado + '</span></div>' +
      '<div class="metro-via"><div class="metro-riel"></div><div class="metro-hecho" style="width:' + pos + '%"></div>' +
        l.metas.map((n, j) => {
          const cuando = j < hechas ? d.fechaDe(n) : null;
          return '<div class="metro-est' + (j < hechas ? ' on' : j === hechas ? ' sig' : '') + '" style="left:' + X(j) + '%"' +
            (cuando ? ' title="Llegó el ' + escapar(fecha(cuando)) + '"' : '') + '><span>' + escapar(l.corto(n)) + '</span></div>';
        }).join("") +
        (imagen ? '<img class="metro-corredores" src="' + imagen + '" alt="" style="left:' + Math.max(pos, 12) + '%">' : '') +
      '</div></div>';
  }).join("");
  $("#metro-total").textContent = logradas + " de " + total + " estaciones";
}

function lineaSinDatos(l, i){
  return '<div class="metro-linea sin-datos" style="--c:' + l.color + '">' +
    '<div class="metro-cab"><span class="metro-num">' + (i + 1) + '</span><b>Línea ' + escapar(l.nombre) + '</b>' +
      '<span class="metro-mini">Sin conectar: todavía no llegan datos de ' + escapar(l.nombre.toLowerCase()) + '</span></div>' +
    '<div class="metro-via"><div class="metro-riel"></div>' +
      l.metas.map((n, j) => '<div class="metro-est" style="left:' + X(j) + '%"><span>' + escapar(l.corto(n)) + '</span></div>').join("") +
    '</div></div>';
}

/* Los dos corredores sin el fondo verde: se recortan de ch-fondo.jpg una
   sola vez (se quita el verde del fondo y de las líneas claras). */
let recorte = null;
function corredores(){
  if (recorte) return recorte;
  recorte = (async () => {
    const img = new Image();
    img.src = "ch-fondo.jpg";
    await img.decode();
    const w = 330, h = Math.round(w * 620 / 940);
    const lienzo = document.createElement("canvas");
    lienzo.width = w; lienzo.height = h;
    const g = lienzo.getContext("2d");
    g.drawImage(img, 20, 215, 940, 620, 0, 0, w, h);
    const datos = g.getImageData(0, 0, w, h), p = datos.data;
    const fondo = g.getImageData(w - 2, 2, 1, 1).data;
    for (let i = 0; i < p.length; i += 4){
      const r = p[i], v = p[i + 1], b = p[i + 2];
      const dist = Math.hypot(r - fondo[0], v - fondo[1], b - fondo[2]);
      const verdoso = v > r + 12 && v > b + 18 && (r + v + b) / 3 > 150;
      let a = 255;
      if (dist < 38 || (verdoso && dist < 110)) a = 0;
      else if (dist < 80) a = Math.round((dist - 38) / 42 * 255);
      p[i + 3] = Math.min(p[i + 3], a);
    }
    g.putImageData(datos, 0, 0);
    return lienzo.toDataURL("image/png");
  })();
  return recorte;
}
