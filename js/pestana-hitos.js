/* ============================================================
   CLINICAL HUB · PESTAÑA HITOS (metro por niveles)
   Cada medida es una línea de metro y cada meta una estación. Las
   estaciones son récord: se ganan la primera vez que el número llega a la
   meta y no se pierden aunque después baje. Los dos corredores de Clinical
   Hub (recortados de la ilustración del login) van sobre cada línea.

   NIVELES  Todas las líneas se pueden llenar, pero solo la meta del nivel
            hace pasar al siguiente: Nivel 1 → 1.000 médicos activos. Las
            metas del Nivel 2 se deciden al llegar (Paula).

   LÍNEAS   Médicos activos (récord) · Médicos que han comprado ·
            5 ★ · Facturación neta del producto (parte de Paula × 2).
            Hotmart: vista v_hotmart_hitos (una fila por día, acumulada;
            sql/hotmart_hitos.sql). 5 ★: v_ia_feedback.
   ============================================================ */
import { sb, $, escapar, fecha, num } from "./nucleo.js";

const usd = n => "US$ " + num(Math.round(n));
const usdCorto = n => "US$ " + (n >= 1000 ? num(n / 1000) + " mil" : num(n));

const NIVEL = { numero: 1, meta: 1000, linea: "activos", texto: "1.000 médicos activos" };

const LINEAS = [
  { clave:"activos", nombre:"Médicos activos", unidad:"médicos activos", color:"#2fa9a0",
    metas:[1, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000], valor:num, corto:num, record:true,
    ayuda:"Médicos con la suscripción <b>al día hoy</b>: su último cobro está pagado. No cuenta a quien canceló " +
          "(aunque todavía tenga acceso hasta fin de mes), ni a quien tiene un pago atrasado. Se muestra el " +
          "<b>récord</b>: la cifra más alta que han tenido a la vez. Llegar a <b>1.000</b> es la meta para pasar al Nivel 2." },
  { clave:"medicos", nombre:"Médicos que han comprado", unidad:"médicos", color:"#5b7fd6",
    metas:[1, 50, 100, 250, 500, 1000, 1500], valor:num, corto:num,
    ayuda:"Médicos distintos que han <b>pagado al menos una vez</b>, aunque hoy ya no estén suscritos. " +
          "Cada médico cuenta <b>una sola vez</b>, aunque renueve todos los meses. No cuenta a quien pidió reembolso." },
  { clave:"cinco", nombre:"5 ★", unidad:"calificaciones de 5 ★", color:"#7ab447",
    metas:[1, 10, 25, 50, 100, 250, 500], valor:num, corto:num,
    ayuda:"Calificaciones de <b>5 estrellas</b> que han dejado los médicos al opinar sobre Clinical Hub." },
  { clave:"facturacion", nombre:"Facturación neta", unidad:"facturados", color:"#e2a83c",
    metas:[1, 500, 1000, 2500, 5000, 10000, 25000], valor:usd, corto:usdCorto,
    ayuda:"Lo que le queda a <b>Clinical Hub</b> (los dos cofundadores) de todas las ventas, en dólares. " +
          "<b>Ya descuenta</b> la tarifa de Hotmart, los impuestos de cada país y los reembolsos." }
];

const ICONO_AYUDA = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';

/* Posición en la línea (en %): estaciones a la misma distancia, y el
   número avanza entre la estación anterior y la siguiente. Todas empiezan
   en 1 (el primer logro). En la meta del nivel van cada 100 después del 1,
   así la distancia es la real. */
const INICIO = 4, ANCHO = 92;
function posiciones(l){
  const estacion = j => INICIO + j * ANCHO / (l.metas.length - 1);
  return {
    estacion,
    valor: v => {
      const hechas = l.metas.filter(n => v >= n).length;
      if (hechas === 0) return INICIO * v / l.metas[0];
      if (hechas === l.metas.length) return INICIO + ANCHO;
      const ant = l.metas[hechas - 1], sig = l.metas[hechas];
      return estacion(hechas - 1) + (estacion(hechas) - estacion(hechas - 1)) * (v - ant) / (sig - ant);
    }
  };
}

/* Turno de carga: si se sale y se vuelve a Hitos mientras carga, solo
   dibuja la última (si no, las dos activaban las ayudas y se anulaban) */
let turno = 0;

export async function render(){
  const mio = ++turno;
  $("#vista").innerHTML = `
<div class="cabecera cabecera-compacta">
  <div>
    <div class="mast"><span class="etiqueta">Hoja de vida del proyecto</span><h1>Hitos</h1></div>
    <p>Se desbloquean solos a medida que Clinical Hub crece.</p>
  </div>
</div>
<div id="metro">
  <section class="caja metro-nivel" id="metro-nivel"></section>
  <section class="caja metro-caja">
    <div class="metro-cab"><h2 class="titulo-seccion">Las líneas de Clinical Hub</h2><span class="metro-mini" id="metro-total"></span></div>
    <div id="metro-lineas"><p class="vacio">Cargando…</p></div>
  </section>
</div>`;

  const [cinco, hotmart, imagen] = await Promise.all([
    sb.from("v_ia_feedback").select("fecha").eq("estrellas", 5).order("fecha", { ascending:true }),
    sb.from("v_hotmart_hitos").select("dia,medicos,activos,activos_record,neta").order("dia", { ascending:true }),
    corredores().catch(() => null)
  ]);
  if (mio !== turno || !$("#metro-lineas")) return;   // ya se abrió otra pestaña o otra carga
  const error = cinco.error || hotmart.error;
  if (error){
    $("#metro-lineas").innerHTML = '<p class="vacio">No se pudieron leer los datos. ' + escapar(error.message) + '</p>';
    return;
  }
  const fechas = (cinco.data || []).map(x => x.fecha);
  const dias = hotmart.data || [];
  const hoy = dias[dias.length - 1] || {};
  const serie = campo => ({
    actual: Number(hoy[campo] || 0),
    /* dia llega como «2026-09-28» (sin hora): se fija al mediodía de Colombia para que no salga un día antes */
    fechaDe: n => { const d = dias.find(x => Number(x[campo]) >= n); return d ? d.dia + "T12:00:00-05:00" : null; }
  });
  const datos = {
    activos: { ...serie("activos_record"), hoy: Number(hoy.activos || 0) },
    medicos: serie("medicos"),
    cinco: { actual: fechas.length, fechaDe: n => fechas[n - 1] || null },
    facturacion: serie("neta")
  };
  pintarNivel(datos[NIVEL.linea]);
  pintar(datos, imagen);
  armarAyudas();
}

/* Arriba: en qué nivel van y cuánto falta para el siguiente */
function pintarNivel(d){
  const avance = Math.min(100, d.actual / NIVEL.meta * 100);
  const logrado = d.actual >= NIVEL.meta;
  $("#metro-nivel").innerHTML =
    '<div class="metro-nivel-cab"><span class="metro-nivel-num">Nivel ' + NIVEL.numero + '</span>' +
      '<button class="enlace-ayuda" type="button" data-ayuda="ayuda-nivel" aria-expanded="false" aria-controls="ayuda-nivel">' +
        ICONO_AYUDA + '¿Cómo funciona?</button>' +
      '<span class="metro-mini">' + (logrado
        ? '<b>¡Meta cumplida!</b> Toca definir las metas del Nivel ' + (NIVEL.numero + 1)
        : 'Meta para el Nivel ' + (NIVEL.numero + 1) + ': <b>' + escapar(NIVEL.texto) + '</b>') + '</span></div>' +
    '<div class="metro-nivel-barra" role="progressbar" aria-valuemin="0" aria-valuemax="' + NIVEL.meta +
      '" aria-valuenow="' + d.actual + '" aria-label="Avance hacia el Nivel ' + (NIVEL.numero + 1) + '"><span style="width:' + avance + '%"></span></div>' +
    '<div class="metro-nivel-pie"><span>Récord <b>' + num(d.actual) + '</b> de ' + num(NIVEL.meta) +
      (d.hoy != null ? ' · hoy ' + num(d.hoy) : '') + '</span>' +
      (logrado ? '' : '<span>faltan <b>' + num(NIVEL.meta - d.actual) + '</b></span>') + '</div>' +
    '<div class="ayuda-plegable" id="ayuda-nivel" hidden>' +
      '<p class="mini">Cada línea del metro se va llenando sola a medida que Clinical Hub crece, y cada estación es una meta. ' +
      'Una estación ganada <b>no se pierde</b> aunque después el número baje: cuenta el récord.</p>' +
      '<p class="mini">Todas las líneas pueden avanzar, pero <b>solo la meta del nivel hace pasar al siguiente</b>: ' +
      'en el Nivel ' + NIVEL.numero + ', llegar a ' + escapar(NIVEL.texto) + '. Si otra línea se completa antes, queda esperando.</p>' +
    '</div>';
}

function pintar(datos, imagen){
  let logradas = 0, total = 0;
  $("#metro-lineas").innerHTML = LINEAS.map((l, i) => {
    const d = datos[l.clave];
    total += l.metas.length;
    const hechas = l.metas.filter(n => d.actual >= n).length;
    logradas += hechas;
    const sig = l.metas[hechas];
    const P = posiciones(l);
    const pos = P.valor(d.actual);
    const esMeta = l.clave === NIVEL.linea;
    const valor = l.record
      ? 'Récord <b>' + escapar(l.valor(d.actual)) + '</b>' + (d.hoy != null ? ' (hoy ' + escapar(l.valor(d.hoy)) + ')' : '')
      : 'Van <b>' + escapar(l.valor(d.actual)) + '</b>';
    const estado = sig
      ? valor + ' · próxima estación <b>' + escapar(l.corto(sig)) + '</b> (faltan ' + escapar(l.valor(sig - d.actual)) + ')'
      : valor + ' · <b>línea completa ✓</b>' + (esMeta ? '' : ' · esperando ' + escapar(NIVEL.texto) + ' para el Nivel ' + (NIVEL.numero + 1));
    return '<div class="metro-linea' + (sig ? '' : ' completa') + '" style="--c:' + l.color + '">' +
      '<div class="metro-cab"><span class="metro-num">' + (i + 1) + '</span><b>' + escapar(l.nombre) + '</b>' +
        (esMeta ? '<span class="metro-etiqueta-meta">meta del nivel</span>' : '') +
        '<button class="enlace-ayuda" type="button" data-ayuda="ayuda-' + l.clave + '" aria-expanded="false" aria-controls="ayuda-' + l.clave + '">' +
          ICONO_AYUDA + '¿Qué significa?</button>' +
        '<span class="metro-mini">' + estado + '</span></div>' +
      '<div class="ayuda-plegable" id="ayuda-' + l.clave + '" hidden><p class="mini">' + l.ayuda + '</p></div>' +
      '<div class="metro-via"><div class="metro-riel"></div><div class="metro-hecho" style="width:' + pos + '%"></div>' +
        l.metas.map((n, j) => {
          const cuando = j < hechas ? d.fechaDe(n) : null;
          return '<div class="metro-est' + (j < hechas ? ' on' : j === hechas ? ' sig' : '') +
            '" style="left:' + P.estacion(j) + '%"' +
            (cuando ? ' title="Se llegó el ' + escapar(fecha(cuando)) + '"' : '') + '><span>' + escapar(l.corto(n)) + '</span></div>';
        }).join("") +
        (imagen ? '<img class="metro-corredores" src="' + imagen + '" alt="" style="left:' + Math.max(pos, 12) + '%">' : '') +
      '</div></div>';
  }).join("");
  $("#metro-total").textContent = logradas + " de " + total + " estaciones";
}

/* «¿Qué significa?» / «¿Cómo funciona?»: despliegan su explicación */
function armarAyudas(){
  $("#metro").addEventListener("click", e => {
    const b = e.target.closest("[data-ayuda]");
    if (!b) return;
    const caja = document.getElementById(b.dataset.ayuda);
    caja.hidden = !caja.hidden;
    b.setAttribute("aria-expanded", String(!caja.hidden));
  });
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
