/* ============================================================
   CLINICAL HUB · VENTAS › EGRESOS
   Los gastos que los cofundadores anotan a mano (tabla egresos), en
   PESOS. Por dentro, cada gasto guarda la TRM oficial de su día (la trae
   el panel de datos.gov.co al guardar; no se muestra) y Supabase calcula el equivalente en dólares, que
   se usará para la rentabilidad estimada.
   Cada gasto lleva uno o varios soportes (fotos o PDF) en el espacio
   privado «soportes-egresos»: se abren con enlaces que vencen en 5 min.
   Cada archivo se guarda como «AAAA-MM/código/nombre-original.ext», así
   al descargarlo conserva su nombre y su extensión.

   · Registrar: fecha, monto en pesos, categoría (Anuncios u otra que se crea ahí mismo), concepto,
     quién lo pagó (Paula, Hámilton o mitad y mitad) y los soportes (mínimo uno).
   · Editar y borrar (con confirmación); queda quién lo cambió.
   · Por mes: total, cuánto puso cada uno y la diferencia contra el 50/50;
     avisa los meses sin gastos.
   · Pagos de diferencia (tabla pagos_diferencia, sql/pagos_diferencia.sql):
     se suman las diferencias de los meses y el que debe le paga al otro.
     Cada pago dice hasta qué mes salda y lleva su foto (espacio privado
     «soportes-pagos»). No se borran: se anulan, con motivo. Los gastos de
     un mes saldado no se pueden agregar, editar ni borrar (lo frena Supabase).
   ============================================================ */
import { sb, escapar, fecha, abrirVentana, avisar, leer, traducirError } from "./nucleo.js";
import { cabecera, armarAyudas } from "./ventas-comun.js";

/* Pesos colombianos, sin centavos: $ 150.000 (espacio que no se parte: el «$» nunca queda solo en una línea) */
const cop = n => n == null ? "—" : "$\u00a0" + Math.round(Number(n)).toLocaleString("es-CO");
/* TRM oficial (Superfinanciera, publicada en datos.gov.co) vigente en una fecha */
async function trmDelDia(dia){
  const donde = "vigenciadesde <= '" + dia + "T00:00:00' AND vigenciahasta >= '" + dia + "T00:00:00'";
  const url = "https://www.datos.gov.co/resource/32sa-8pi3.json?$where=" + encodeURIComponent(donde) +
    "&$order=vigenciadesde%20DESC&$limit=1";
  const r = await fetch(url);
  if (!r.ok) throw new Error("TRM no disponible");
  const [fila] = await r.json();
  if (!fila) throw new Error("TRM no disponible");
  return Number(fila.valor);
}

const ESPACIO = "soportes-egresos";
const ESPACIO_PAGOS = "soportes-pagos";
/* Categorías: Anuncios siempre, más las que ya tengan los gastos registrados.
   Una nueva se crea desde el formulario («+ Nueva categoría…») */
const CATEGORIA_BASE = "Anuncios";
const NUEVA = "__nueva";
const categorias = () => [CATEGORIA_BASE, ...[...new Set(egresos.map(e => e.categoria).filter(c => c && c !== CATEGORIA_BASE))]
  .sort((a, b) => a.localeCompare(b, "es"))];
const QUIENES = ["Paula", "Hámilton"];            // columnas de «cuánto puso cada uno»
const MITAD = "Mitad y mitad";                    // se reparte 50/50 en los totales
const OPCIONES_PAGO = [...QUIENES, MITAD];
const MAX_BYTES = 10 * 1024 * 1024;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre"];
const ZONA = -5 * 3600e3;

/* Ruta de un archivo nuevo: mes / código / nombre limpio (sin tildes ni espacios) */
function rutaNueva(fechaG, archivo){
  const partes = archivo.name.split(".");
  const ext = (partes.length > 1 ? partes.pop() : "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const base = partes.join(".").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "soporte";
  return fechaG.slice(0, 7) + "/" + crypto.randomUUID() + "/" + base + "." + ext;
}
/* Nombre para mostrar: el del archivo (los primeros gastos se guardaron como código.ext) */
function nombreDe(ruta){
  const partes = ruta.split("/");
  return partes.length > 2 ? partes.pop() : "soporte." + (ruta.split(".").pop() || "pdf");
}
const kb = n => Math.max(1, Math.round(n / 1024)).toLocaleString("es-CO") + " KB";

let egresos = [];
let pagos = [];                // pagos de diferencia (con los anulados)
let sinPagos = false;          // la tabla de pagos no se pudo leer
let caja = null;
let datosVentas = null;

export async function render(c, datos){
  caja = c;
  datosVentas = datos;
  caja.dataset.vista = "egresos";
  caja.innerHTML = `
<section class="caja" style="margin-top:18px">
  ${cabecera("ayuda-egresos", "Egresos", "Gastos en pesos, con su soporte", [
    "Los gastos que ustedes anotan a mano, <b>en pesos</b>. Cada uno lleva su <b>categoría</b> (Anuncios, Contador, Herramientas…); si no existe, se crea al registrarlo con «+ Nueva categoría».",
    "Por dentro, cada gasto guarda la <b>TRM oficial de su día</b> (la trae el panel solo), para pasarlo a dólares en la <b>rentabilidad estimada</b>.",
    "Cada gasto necesita al menos un <b>soporte</b> (foto de la factura, pantallazo o PDF); puede llevar varios. Se guardan en un espacio privado: solo se abren desde el panel.",
    "<b>Pagó</b> es quién puso la plata: Paula, Hámilton o <b>mitad y mitad</b> (en los totales se suma la mitad a cada uno). También queda anotado quién lo registró y quién lo cambió por última vez.",
    "Con los ingresos (subpestaña Ingresos) y estos egresos armamos después la <b>rentabilidad estimada</b> del mes."])}
  <div class="vt-egresos-barra">
    <div id="eg-mes" class="vt-mes"></div>
    <button class="boton-chico boton-nueva" type="button" id="eg-nuevo">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Registrar gasto</button>
  </div>
  <p class="aviso" id="aviso-egresos" role="status"></p>
  <div id="eg-lista"><p class="vacio">Cargando…</p></div>
</section>
<section class="caja" style="margin-top:14px">
  ${cabecera("ayuda-egresos-mes", "Por mes", "Total del mes y cuánto puso cada uno", [
    "Suma los gastos de cada mes y cuánto pagó cada cofundador.",
    "Los gastos van <b>mitad y mitad</b>. La columna <b>Diferencia</b> dice quién puso de más ese mes y cuánto le debe el otro para quedar parejos.",
    "La tarjeta de arriba <b>cruza las cuentas</b>: suma las diferencias de todos los meses (lo que un mes queda a favor de uno se descuenta de lo que otro mes queda a favor del otro) y resta los pagos ya hechos. Así se ve una sola cifra: quién le debe a quién hoy.",
    "Con <b>«Registrar pago»</b> se elige <b>hasta qué mes</b> quedan saldadas las cuentas; el panel calcula solo quién le paga a quién y cuánto. Hay que adjuntar la foto de la transferencia.",
    "Los meses saldados salen en gris con <b>«Saldado»</b> y arriba dice <b>«Saldado hasta…»</b>. Sus gastos quedan con candado: no se pueden agregar, editar ni borrar.",
    "Si se paga <b>menos</b> de lo calculado, los meses quedan saldados igual, pero la tarjeta sigue mostrando lo que falta. Para completarlo se registra otro pago eligiendo el mismo mes.",
    "Los pagos <b>no se borran</b>. Si uno quedó mal, se <b>anula</b> escribiendo el motivo: queda tachado, con quién lo anuló y cuándo, y los meses que saldaba vuelven a quedar abiertos. Se anulan en orden, del más reciente hacia atrás.",
    "Desde el primer mes con ventas, un mes sin gastos anotados sale como <b>«sin gastos registrados»</b>, para que no se quede ninguno por fuera."])}
  <p class="aviso" id="aviso-pagos" role="status"></p>
  <div class="vt-tabla" id="eg-meses"></div>
</section>`;
  armarAyudas(caja);
  caja.querySelector("#eg-nuevo").addEventListener("click", () => ventana(null));
  caja.querySelector("#eg-lista").addEventListener("click", alTocar);
  caja.querySelector("#eg-meses").addEventListener("click", alTocarPagos);
  await recargar();
}

export async function recargar(){
  const [{ data, error }, rp] = await Promise.all([
    sb.from("egresos").select("*").order("fecha", { ascending:false }).order("id", { ascending:false }),
    sb.from("pagos_diferencia").select("*").order("salda_hasta", { ascending:false }).order("id", { ascending:false })]);
  /* Si mientras llegaban los datos se cambió de subpestaña, no se dibuja encima */
  if (!caja || !caja.isConnected || caja.dataset.vista !== "egresos") return;
  if (error){
    caja.querySelector("#eg-lista").innerHTML = '<p class="vacio">No se pudieron leer los egresos. ' + escapar(traducirError(error.message)) + '</p>';
    return;
  }
  egresos = data || [];
  pagos = rp.error ? [] : rp.data || [];
  sinPagos = !!rp.error;
  pintar();
}

/* ------------------------------------------------------------
   Pintado
   ------------------------------------------------------------ */
function pintar(){
  const hoy = new Date(Date.now() + ZONA);
  const claveHoy = hoy.getUTCFullYear() + "-" + String(hoy.getUTCMonth() + 1).padStart(2, "0");
  const delMes = egresos.filter(e => e.fecha.startsWith(claveHoy));
  const suma = lista => lista.reduce((x, e) => x + Number(e.monto_cop), 0);
  pintarMes(delMes, suma(delMes), MESES[hoy.getUTCMonth()]);

  const lista = caja.querySelector("#eg-lista");
  if (!egresos.length){
    lista.innerHTML = '<p class="vacio">Todavía no hay gastos registrados. Usa «Registrar gasto».</p>';
  } else {
    lista.innerHTML =
      /* En celular, una tarjeta por gasto (recibo); en computador, la tabla */
      '<div class="vt-tarjetas-cel">' + egresos.map(tarjeta).join("") + '</div>' +
      '<table class="tabla vt-solo-compu vt-pc"><thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Pagó</th><th class="vt-der">Monto</th><th></th></tr></thead><tbody>' +
      egresos.map(e => '<tr><td class="vt-gris">' + escapar(fecha(e.fecha + "T12:00:00-05:00")) + '</td><td>' + escapar(e.concepto) + '</td>' +
        '<td><span class="vt-chip">' + escapar(e.categoria) + '</span></td><td>' + pastillaQuien(e) + '</td>' +
        '<td class="vt-der"><b>' + escapar(cop(e.monto_cop)) + '</b></td><td class="vt-der">' + iconosFila(e) + '</td></tr>').join("") +
      '</tbody></table>';
  }
  pintarMeses();
}

/* Tarjeta de un gasto en celular, tipo recibo: concepto y monto arriba;
   debajo de una línea punteada, la fecha y quién pagó en pastillas, y los
   íconos (soportes, editar, borrar) */
const ICONO_LAPIZ = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>';
const ICONO_BASURA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';
function tarjeta(e){
  return '<div class="vt-tc"><div class="vt-tc-fila"><b class="vt-tc-concepto">' + escapar(e.concepto) + '</b><b class="vt-tc-monto">' + escapar(cop(e.monto_cop)) + '</b></div>' +
    '<div class="vt-tc-fila vt-tc-abajo"><span class="vt-tc-chips"><span class="vt-chip">' + escapar(fecha(e.fecha + "T12:00:00-05:00")) + '</span>' +
      pastillaQuien(e) + '</span>' +
      iconosFila(e) + '</div></div>';
}

/* En PC, la tabla: fecha en gris, categoría y quién pagó en pastillas
   (Paula lima, Hámilton azul, mitad y mitad las dos), monto a la derecha
   y los mismos íconos que en celular */
const ICONO_CANDADO = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
function iconosFila(e){
  /* Mes saldado: solo se ven los soportes; en vez de editar y borrar, un candado */
  if (mesSaldado(e.fecha))
    return '<span class="vt-tc-iconos">' + botonSoportes(e) +
      '<span class="vt-ico vt-ico-candado" title="Mes saldado: no se puede cambiar" aria-label="Mes saldado: no se puede cambiar">' + ICONO_CANDADO + '</span></span>';
  return '<span class="vt-tc-iconos">' + botonSoportes(e) +
    '<button class="vt-ico" type="button" data-editar="' + e.id + '" title="Editar" aria-label="Editar gasto">' + ICONO_LAPIZ + '</button>' +
    '<button class="vt-ico vt-ico-borrar" type="button" data-borrar="' + e.id + '" title="Borrar" aria-label="Borrar gasto">' + ICONO_BASURA + '</button></span>';
}
function pastillaQuien(e){
  const cls = e.pagado_por === MITAD ? "mitad" : e.pagado_por === "Paula" ? "paula" : "hamilton";
  return '<span class="vt-quien ' + cls + '">' + escapar(e.pagado_por) + '</span>';
}
/* Botón de soportes: ícono de documento con el número en una burbujita */
const ICONO_DOC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>';
function botonSoportes(e){
  const n = e.soportes.length, que = "Ver " + (n === 1 ? "el soporte" : "los " + n + " soportes");
  return '<button class="vt-sop" type="button" data-ver="' + e.id + '" title="' + que + '" aria-label="' + que + '">' +
    ICONO_DOC + '<span class="vt-sop-n">' + n + '</span></button>';
}

/* Resumen del mes: total y una barra repartida según cuánto puso cada uno
   (mitad y mitad suma la mitad a cada uno) */
function pintarMes(delMes, total, mes){
  const por = Object.fromEntries(QUIENES.map(q => [q, delMes.reduce((x, e) => x + parte(e, q), 0)]));
  const clase = q => q === "Paula" ? "paula" : "hamilton";
  caja.querySelector("#eg-mes").innerHTML =
    '<div class="vt-mes-cab"><span class="mini">Gastos de ' + escapar(mes) + '</span><b>' + escapar(cop(total)) + '</b></div>' +
    '<div class="vt-mes-barra" role="img" aria-label="' + escapar(QUIENES.map(q => q + " " + cop(por[q])).join(", ")) + '">' +
      QUIENES.map(q => '<span class="' + clase(q) + '" style="width:' + (total ? por[q] / total * 100 : 50) + '%"></span>').join("") + '</div>' +
    '<div class="vt-mes-leyenda">' + QUIENES.map(q => '<span><i class="' + clase(q) + '"></i>' + q + ' <b>' + escapar(cop(por[q])) + '</b></span>').join("") + '</div>';
}

/* Soportes de un gasto: lista debajo del gasto, a lo ancho. Cada archivo
   como «Soporte N» con su tipo (PDF o Foto) y el nombre original recortado */
const ICONO_ABRIR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
const tipoDe = ruta => /\.pdf$/i.test(ruta) ? "PDF" : "Foto";
function itemsSoportes(data){
  return data.map((d, i) => {
    const tipo = tipoDe(d.path || ""), n = "Soporte " + (i + 1);
    if (!d.signedUrl) return '<span class="vt-sl-item falta">' + n + ' · no se encontró</span>';
    const url = escapar(d.signedUrl);
    return '<a class="vt-sl-item" href="' + url + '" target="_blank" rel="noopener"><i class="vt-sl-tipo ' + tipo.toLowerCase() + '">' + tipo + '</i>' +
      '<span class="vt-sl-txt"><b>' + n + '</b><span class="mini">' + escapar(nombreDe(d.path)) + '</span></span><span class="vt-sl-abrir">' + ICONO_ABRIR + '</span></a>';
  }).join("");
}
async function mostrarSoportes(g, boton){
  /* Si ya está abierta debajo de este gasto, se cierra */
  const tarjeta = boton.closest(".vt-tc"), fila = boton.closest("tr");
  const abierta = tarjeta ? tarjeta.querySelector(".vt-sl-caja") : fila && fila.nextElementSibling && fila.nextElementSibling.classList.contains("vt-sl-fila") ? fila.nextElementSibling : null;
  if (abierta){ abierta.remove(); return; }
  const { data, error } = await sb.storage.from(ESPACIO).createSignedUrls(g.soportes, 300);
  if (error){ avisar("No se pudieron abrir los soportes. " + traducirError(error.message), "mal", "#aviso-egresos"); return; }
  const html = '<div class="vt-sl">' + itemsSoportes(data) + '</div><p class="mini vt-sl-nota">Los enlaces vencen en 5 minutos.</p>';
  if (tarjeta){ const d = document.createElement("div"); d.className = "vt-sl-caja"; d.innerHTML = html; tarjeta.appendChild(d); }
  else { const tr = document.createElement("tr"); tr.className = "vt-sl-fila"; tr.innerHTML = '<td colspan="6">' + html + '</td>'; fila.after(tr); }
}
/* Cuánto le toca a una persona de un gasto: todo si lo pagó, la mitad si fue a mitades */
function parte(e, quien){
  if (e.pagado_por === quien) return Number(e.monto_cop);
  if (e.pagado_por === MITAD) return Number(e.monto_cop) / 2;
  return 0;
}

/* ------------------------------------------------------------
   Por mes y pagos de la diferencia
   ------------------------------------------------------------ */
const claveMes = f => f.slice(0, 7);                                  // "2026-09-12" → "2026-09"
const nombreMes = k => { const [a, m] = k.split("-").map(Number); return MESES[m - 1] + " " + a; };
const activos = () => pagos.filter(p => !p.anulado_en);
/* Hasta qué mes está saldado ("AAAA-MM"), según los pagos sin anular */
function saldadoHasta(){
  const l = activos().map(p => claveMes(p.salda_hasta)).sort();
  return l.length ? l[l.length - 1] : null;
}
function mesSaldado(fecha){
  const h = saldadoHasta();
  return !!h && claveMes(fecha) <= h;
}
/* Signo de las cuentas: + a favor de Paula (Hámilton le debe), − a favor de
   Hámilton. Un pago de Paula a Hámilton suma; de Hámilton a Paula resta. */
const conSigno = p => p.de === "Paula" ? Number(p.monto_cop) : -Number(p.monto_cop);
const quienDebe = s => s > 0 ? ["Hámilton", "Paula"] : ["Paula", "Hámilton"];
const claseDe = q => q === "Paula" ? "paula" : "hamilton";

/* Los meses desde el primero con ventas (o con gastos) hasta hoy, con su
   total, cuánto puso cada uno y la diferencia contra el 50/50 */
function cuentaMeses(){
  const porMes = new Map();
  egresos.forEach(e => {
    const k = claveMes(e.fecha);
    if (!porMes.has(k)) porMes.set(k, { total: 0, por: {} });
    const m = porMes.get(k);
    m.total += Number(e.monto_cop);
    QUIENES.forEach(q => { m.por[q] = (m.por[q] || 0) + parte(e, q); });
  });
  porMes.forEach(m => { m.dif = (m.por.Paula || 0) - m.total / 2; });
  const claves = [...porMes.keys()];
  const pagosV = (datosVentas && datosVentas.modelo && datosVentas.modelo.pagos) || [];
  if (pagosV.length){
    const d = new Date(pagosV[0].t + ZONA);
    claves.push(d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0"));
  }
  const hoy = new Date(Date.now() + ZONA);
  const claveHoy = hoy.getUTCFullYear() + "-" + String(hoy.getUTCMonth() + 1).padStart(2, "0");
  const meses = [];
  if (claves.length){
    let [a, m] = claves.sort()[0].split("-").map(Number);
    for (;;){
      const k = a + "-" + String(m).padStart(2, "0");
      meses.push(k);
      if (k >= claveHoy) break;
      m === 12 ? (a++, m = 1) : m++;
    }
  }
  return { meses, porMes };                                          // meses en orden cronológico
}
/* Lo que se debe contando los meses hasta «hasta» (incluido) y todos los pagos sin anular */
function saldoHasta(porMes, hasta){
  let s = 0;
  porMes.forEach((m, k) => { if (!hasta || k <= hasta) s += m.dif; });
  return Math.round(s + activos().reduce((x, p) => x + conSigno(p), 0));
}

/* «septiembre 2026», «julio y agosto 2026», «junio a septiembre 2026» */
function rangoMeses(l){
  const corto = k => MESES[Number(k.slice(5)) - 1] + (k.slice(0, 4) === l[l.length - 1].slice(0, 4) ? "" : " " + k.slice(0, 4));
  if (l.length === 1) return nombreMes(l[0]);
  return corto(l[0]) + (l.length === 2 ? " y " : " a ") + nombreMes(l[l.length - 1]);
}

const ICONO_OK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';
const ICONO_CAMARA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
function pintarMeses(){
  const { meses, porMes } = cuentaMeses();
  const donde = caja.querySelector("#eg-meses");
  if (!meses.length){ donde.innerHTML = '<p class="vacio">Todavía no hay meses.</p>'; return; }
  const hasta = saldadoHasta();
  const ultimo = meses[meses.length - 1];
  const saldo = saldoHasta(porMes, ultimo);
  const faltaSaldados = hasta ? saldoHasta(porMes, hasta) : 0;        // si el último pago fue incompleto
  const pendientes = meses.filter(k => (!hasta || k > hasta) && porMes.has(k));
  const [debe, a] = quienDebe(saldo);
  const pazYSalvo = Math.abs(saldo) < 1;

  /* Tarjeta del saldo */
  const nota = sinPagos ? "No se pudieron leer los pagos de la diferencia."
    : pazYSalvo ? "No hay nada pendiente."
    : [pendientes.length ? "Pendiente: " + rangoMeses(pendientes) : "",
       Math.abs(faltaSaldados) >= 1 ? "Del último pago faltaron " + cop(Math.abs(faltaSaldados)) : ""].filter(Boolean).join(" · ");
  const hayQuePagar = !sinPagos && meses.some(k => (!hasta || k >= hasta) && Math.abs(saldoHasta(porMes, k)) >= 1);
  const tarjeta =
    '<div class="vt-saldo"><div class="vt-saldo-txt">' +
      (hasta ? '<span class="vt-quien vt-quien-ok">' + ICONO_OK + 'Saldado hasta ' + escapar(nombreMes(hasta)) + '</span>'
             : '<span class="mini">Sumando todos los meses</span>') +
      '<b class="vt-saldo-monto">' + (pazYSalvo ? "Están a paz y salvo" : escapar(debe + " le debe a " + a + " " + cop(Math.abs(saldo)))) + '</b>' +
      '<span class="mini">' + escapar(nota) + '</span></div>' +
      (hayQuePagar ? '<button class="boton-chico" type="button" id="eg-pagar">' + ICONO_CAMARA + 'Registrar pago</button>' : '') +
    '</div>';

  /* Tabla: los meses saldados en gris con su pastilla */
  const tabla =
    '<table class="tabla vt-solo-compu"><thead><tr><th>Mes</th><th>Total</th>' + QUIENES.map(q => '<th>' + q + '</th>').join("") + '<th>Diferencia</th></tr></thead><tbody>' +
    meses.slice().reverse().map(k => {
      const d = porMes.get(k), saldado = !!hasta && k <= hasta;
      if (!d) return '<tr><td>' + nombreMes(k) + '</td><td colspan="' + (QUIENES.length + 2) + '"><span class="mini">Sin gastos registrados</span></td></tr>';
      const [dd, aa] = quienDebe(d.dif);
      const dif = saldado ? '<span class="vt-quien vt-quien-ok">' + ICONO_OK + 'Saldado</span>'
        : Math.abs(d.dif) < 1 ? '<span class="mini">Quedó mitad y mitad</span>'
        : '<span class="vt-quien ' + claseDe(dd) + '">' + dd + '</span> le debe a ' + aa + ' <b>' + escapar(cop(Math.abs(d.dif))) + '</b>';
      return '<tr' + (saldado ? ' class="vt-saldado"' : '') + '><td>' + nombreMes(k) + '</td><td><b>' + escapar(cop(d.total)) + '</b></td>' +
        QUIENES.map(q => '<td>' + escapar(cop(d.por[q] || 0)) + '</td>').join("") + '<td>' + dif + '</td></tr>';
    }).join("") + '</tbody></table>';

  /* Pagos registrados: el más reciente sin anular se puede anular */
  const ultimoActivo = activos()[0];
  const lista = pagos.length
    ? '<div class="vt-pagos"><span class="etiqueta">Pagos de la diferencia</span>' + pagos.map(p =>
        '<div class="vt-pago' + (p.anulado_en ? " anulado" : "") + '" data-pago="' + p.id + '">' +
          '<div class="vt-pago-txt"><b>' + escapar(p.de + " → " + p.para + " " + cop(p.monto_cop)) + '</b>' +
            '<span class="mini">' + escapar(fecha(p.fecha + "T12:00:00-05:00")) + ' · salda hasta ' + escapar(nombreMes(claveMes(p.salda_hasta))) +
            (Math.abs(Number(p.monto_calculado) - Number(p.monto_cop)) >= 1 ? ' · el panel calculaba ' + escapar(cop(p.monto_calculado)) : '') + '</span>' +
            (p.anulado_en ? '<span class="mini vt-pago-anulado">Anulado el ' + escapar(fecha(p.anulado_en)) + ': ' + escapar(p.motivo_anulacion || "") + '</span>' : '') +
          '</div><span class="vt-tc-iconos">' +
            '<button class="vt-sop" type="button" data-ver-pago="' + p.id + '" title="Ver la foto del pago" aria-label="Ver la foto del pago">' + ICONO_DOC + '<span class="vt-sop-n">' + p.soportes.length + '</span></button>' +
            (ultimoActivo && ultimoActivo.id === p.id ? '<button class="boton-chico secundario vt-anular" type="button" data-anular="' + p.id + '">Anular</button>' : '') +
          '</span></div>').join("") + '</div>'
    : '';
  /* En celular, en vez de la tabla, una línea por mes: total y quién le debe
     a quién (o «Saldado»). Al tocarla se abre cuánto puso cada uno */
  const cel = '<div class="vt-meses-cel">' + meses.slice().reverse().map(k => {
    const d = porMes.get(k), saldado = !!hasta && k <= hasta;
    if (!d) return '<div class="vt-mc"><div class="vt-mc-izq"><b>' + nombreMes(k) + '</b><span class="mini">Sin gastos registrados</span></div></div>';
    const [dd, aa] = quienDebe(d.dif);
    const der = saldado ? '<span class="vt-quien vt-quien-ok">' + ICONO_OK + 'Saldado</span>'
      : Math.abs(d.dif) < 1 ? '<span class="mini">Mitad y mitad</span>'
      : '<span class="vt-quien ' + claseDe(dd) + '">' + dd + ' → ' + aa + '</span><b>' + escapar(cop(Math.abs(d.dif))) + '</b>';
    return '<button type="button" class="vt-mc' + (saldado ? ' saldado' : '') + '" data-mes-cel aria-expanded="false">' +
      '<span class="vt-mc-izq"><b>' + nombreMes(k) + '</b><span class="mini">Total ' + escapar(cop(d.total)) + '</span></span>' +
      '<span class="vt-mc-der">' + der + '</span>' +
      '<span class="vt-mc-det">' + QUIENES.map(q => '<span><i class="' + claseDe(q) + '"></i>' + q + ' puso <b>' + escapar(cop(d.por[q] || 0)) + '</b></span>').join("") + '</span></button>';
  }).join("") + '<p class="mini vt-mc-nota">Toca un mes para ver cuánto puso cada uno.</p></div>';
  donde.innerHTML = tarjeta + tabla + cel + lista;
}

/* Clics dentro de «Por mes»: registrar, ver foto y anular */
async function alTocarPagos(e){
  if (e.target.closest("#eg-pagar")){ ventanaPago(); return; }
  const mes = e.target.closest("[data-mes-cel]");
  if (mes){ const abrir = !mes.classList.contains("abierta"); mes.classList.toggle("abierta", abrir); mes.setAttribute("aria-expanded", String(abrir)); return; }
  const ver = e.target.closest("[data-ver-pago]");
  const anular = e.target.closest("[data-anular]");
  const buscar = id => pagos.find(x => String(x.id) === String(id));
  if (ver){
    const p = buscar(ver.dataset.verPago), fila = ver.closest(".vt-pago");
    const abierta = fila.querySelector(".vt-sl-caja");
    if (abierta){ abierta.remove(); return; }
    const { data, error } = await sb.storage.from(ESPACIO_PAGOS).createSignedUrls(p.soportes, 300);
    if (error){ avisar("No se pudo abrir la foto. " + traducirError(error.message), "mal", "#aviso-pagos"); return; }
    const d = document.createElement("div");
    d.className = "vt-sl-caja";
    d.innerHTML = '<div class="vt-sl">' + itemsSoportes(data) + '</div><p class="mini vt-sl-nota">Los enlaces vencen en 5 minutos.</p>';
    fila.appendChild(d);
  }
  if (anular) ventanaAnular(buscar(anular.dataset.anular));
}

/* Registrar un pago: se elige hasta qué mes salda y el panel calcula quién
   le paga a quién y cuánto (se puede corregir el monto) */
function ventanaPago(){
  const { meses, porMes } = cuentaMeses();
  const hasta = saldadoHasta();
  /* El último mes saldado vuelve a salir si a su pago le faltó plata (para completarlo) */
  const opciones = meses.filter(k => (!hasta || k >= hasta) && Math.abs(saldoHasta(porMes, k)) >= 1).reverse();
  let nuevos = [];
  const hoy = new Date(Date.now() + ZONA).toISOString().slice(0, 10);
  abrirVentana({
    titulo: "Registrar pago de la diferencia",
    guia: "Elige hasta qué mes quedan saldadas las cuentas; el monto se calcula solo.",
    cuerpo:
      '<span class="etiqueta">Salda hasta el mes</span>' +
      '<select class="campo" id="pd-hasta">' + opciones.map(k => '<option value="' + k + '">' + nombreMes(k) + '</option>').join("") + '</select>' +
      '<p class="vt-pd-quien" id="pd-quien"></p>' +
      '<span class="etiqueta">Fecha del pago</span>' +
      '<input class="campo" type="date" id="pd-fecha" value="' + hoy + '">' +
      '<span class="etiqueta">Monto (pesos)</span>' +
      '<input class="campo" type="number" inputmode="numeric" min="1" step="1" id="pd-monto">' +
      '<p class="mini vt-pd-falta" id="pd-falta"></p>' +
      '<span class="etiqueta">Foto del pago (pantallazo de la transferencia)</span>' +
      '<ul class="vt-archivos" id="pd-archivos"></ul>' +
      '<label class="boton-chico secundario vt-archivo-boton">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 7l-6.5 6.5a1.5 1.5 0 0 0 3 3l6.5-6.5a3 3 0 0 0-6-6l-6.5 6.5a4.5 4.5 0 0 0 9 9l6.5-6.5"/></svg>' +
        'Agregar fotos o PDF<input type="file" id="pd-soporte" accept="image/*,application/pdf" multiple hidden></label>' +
      '<p class="mini explica">Los meses hasta el que elijas quedan marcados como saldados y sus gastos ya no se pueden cambiar. Si se paga menos de lo calculado, lo que falta sigue apareciendo. El pago no se puede borrar: si queda mal, se anula.</p>',
    aceptar: "Registrar pago",
    alAceptar: async () => {
      const k = leer("pd-hasta"), fechaP = leer("pd-fecha"), monto = Number(leer("pd-monto"));
      const calculado = saldoHasta(porMes, k), [de, para] = quienDebe(calculado);
      if (!k){ avisar("Elige hasta qué mes salda.", "mal", "#aviso-forma"); return false; }
      if (!fechaP){ avisar("Elige la fecha del pago.", "mal", "#aviso-forma"); return false; }
      if (!(monto > 0)){ avisar("Escribe el monto en pesos.", "mal", "#aviso-forma"); return false; }
      if (!nuevos.length){ avisar("Adjunta la foto del pago.", "mal", "#aviso-forma"); return false; }
      const pesado = nuevos.find(x => x.size > MAX_BYTES);
      if (pesado){ avisar("«" + pesado.name + "» pesa más de 10 MB.", "mal", "#aviso-forma"); return false; }
      /* Las fotos van primero. El espacio no deja borrar: si el pago no se
         guarda, lo que alcanzó a subir se queda ahí sin usarse */
      const subidos = [];
      for (const archivo of nuevos){
        const ruta = rutaNueva(fechaP, archivo);
        const { error } = await sb.storage.from(ESPACIO_PAGOS).upload(ruta, archivo, { contentType: archivo.type || undefined });
        if (error){ avisar("No se pudo subir «" + archivo.name + "». " + traducirError(error.message), "mal", "#aviso-forma"); return false; }
        subidos.push(ruta);
      }
      /* Copia de la cuenta con la que se hizo el pago */
      const detalle = {};
      porMes.forEach((m, mes) => { if (mes <= k) detalle[mes] = Math.round(m.dif); });
      const { error } = await sb.from("pagos_diferencia").insert({
        fecha: fechaP, monto_cop: Math.round(monto), de, para, salda_hasta: k + "-01",
        monto_calculado: Math.abs(calculado), detalle, soportes: subidos });
      if (error){ avisar(traducirError(error.message), "mal", "#aviso-forma"); return false; }
      avisar("Pago registrado: saldado hasta " + nombreMes(k) + ".", "ok", "#aviso-pagos");
      await recargar();
    }
  });
  const sel = document.getElementById("pd-hasta");
  const campoMonto = document.getElementById("pd-monto");
  /* Si se escribe otro monto, dice cuánto queda pendiente (o cuánto sobra) */
  const falta = () => {
    const dif = Math.abs(saldoHasta(porMes, sel.value)) - Math.round(Number(campoMonto.value) || 0);
    document.getElementById("pd-falta").textContent = !campoMonto.value || Math.abs(dif) < 1 ? ""
      : dif > 0 ? "Quedan pendientes " + cop(dif) + "." : "Es " + cop(-dif) + " más de lo calculado.";
  };
  const actualizar = () => {
    const s = saldoHasta(porMes, sel.value), [de, para] = quienDebe(s);
    campoMonto.value = Math.abs(s);
    document.getElementById("pd-quien").innerHTML = '<span class="vt-quien ' + claseDe(de) + '">' + de + '</span> le paga a ' + para + ' <b>' + escapar(cop(Math.abs(s))) + '</b>';
    falta();
  };
  sel.addEventListener("change", actualizar);
  campoMonto.addEventListener("input", falta);
  actualizar();
  const lista = document.getElementById("pd-archivos");
  const pintarArchivos = () => {
    lista.innerHTML = nuevos.map((x, i) => '<li><span>' + escapar(x.name) + '<span class="mini">' + kb(x.size) + '</span></span>' +
      '<button type="button" class="vt-archivo-quitar" data-i="' + i + '" aria-label="Quitar ' + escapar(x.name) + '">✕</button></li>').join("") ||
      '<li class="vt-archivos-vacio"><span class="mini">Ningún archivo elegido</span></li>';
  };
  lista.addEventListener("click", e => {
    const b = e.target.closest("[data-i]");
    if (b){ nuevos.splice(Number(b.dataset.i), 1); pintarArchivos(); }
  });
  document.getElementById("pd-soporte").addEventListener("change", e => {
    nuevos = nuevos.concat([...e.target.files]);
    e.target.value = "";
    pintarArchivos();
  });
  pintarArchivos();
}

/* Anular: queda quién, cuándo y por qué; los meses vuelven a contar */
function ventanaAnular(p){
  abrirVentana({
    titulo: "Anular pago",
    guia: p.de + " → " + p.para + " " + cop(p.monto_cop) + ", saldaba hasta " + nombreMes(claveMes(p.salda_hasta)) + ".",
    cuerpo: '<span class="etiqueta">¿Por qué se anula?</span>' +
      '<textarea class="campo" id="pd-motivo" rows="3" placeholder="Ej.: el monto quedó mal escrito"></textarea>' +
      '<p class="mini explica">El pago no se borra: queda tachado, con quién lo anuló, cuándo y el motivo. Los meses que saldaba vuelven a quedar pendientes y sus gastos se pueden cambiar de nuevo.</p>',
    aceptar: "Anular pago",
    alAceptar: async () => {
      const motivo = leer("pd-motivo");
      if (!motivo){ avisar("Escribe por qué se anula.", "mal", "#aviso-forma"); return false; }
      const { error } = await sb.from("pagos_diferencia").update({ motivo_anulacion: motivo }).eq("id", p.id);
      if (error){ avisar(traducirError(error.message), "mal", "#aviso-forma"); return false; }
      avisar("Pago anulado.", "ok", "#aviso-pagos");
      await recargar();
    }
  });
}

/* ------------------------------------------------------------
   Acciones: ver soporte, editar, borrar
   ------------------------------------------------------------ */
async function alTocar(e){
  const ver = e.target.closest("[data-ver]");
  const editar = e.target.closest("[data-editar]");
  const borrar = e.target.closest("[data-borrar]");
  const buscar = id => egresos.find(x => String(x.id) === String(id));
  if (ver){
    const g = buscar(ver.dataset.ver);
    if (g.soportes.length === 1){
      /* La pestaña se abre ya (con el toque), y luego recibe el enlace: si se
         abriera después de esperar, Safari la bloquearía */
      const pestana = window.open("", "_blank");
      const { data, error } = await sb.storage.from(ESPACIO).createSignedUrl(g.soportes[0], 300);
      if (error){
        if (pestana) pestana.close();
        avisar("No se pudo abrir el soporte. " + traducirError(error.message), "mal", "#aviso-egresos");
        return;
      }
      if (pestana){ pestana.opener = null; pestana.location = data.signedUrl; }
      else caja.querySelector("#aviso-egresos").innerHTML =
        '<a href="' + escapar(data.signedUrl) + '" target="_blank" rel="noopener">Abrir el soporte</a> (el enlace vence en 5 minutos)';
      return;
    }
    await mostrarSoportes(g, ver);
  }
  if (editar) ventana(buscar(editar.dataset.editar));
  if (borrar){
    /* Primer toque pide confirmar; el segundo borra el gasto y sus soportes */
    if (borrar.dataset.confirmar !== "1"){ borrar.dataset.confirmar = "1"; borrar.textContent = "¿Seguro? Borrar"; return; }
    const g = buscar(borrar.dataset.borrar);
    borrar.disabled = true;
    const { error } = await sb.from("egresos").delete().eq("id", g.id);
    if (error){ borrar.disabled = false; avisar(traducirError(error.message), "mal", "#aviso-egresos"); return; }
    await sb.storage.from(ESPACIO).remove(g.soportes);
    avisar("Gasto borrado.", "ok", "#aviso-egresos");
    await recargar();
  }
}

/* Ventana para registrar (g = null) o editar un gasto */
function ventana(g){
  /* Soportes que siguen (los que ya tenía) y archivos nuevos por subir */
  let quedan = g ? g.soportes.slice() : [];
  let nuevos = [];
  const hoy = new Date(Date.now() + ZONA).toISOString().slice(0, 10);
  abrirVentana({
    titulo: g ? "Editar gasto" : "Registrar gasto",
    guia: g ? "Cambia lo que haga falta. Puedes agregar o quitar soportes; debe quedar al menos uno." : "En pesos. Adjunta al menos un soporte.",
    cuerpo:
      '<span class="etiqueta">Fecha</span>' +
      '<input class="campo" type="date" id="eg-fecha" value="' + escapar(g ? g.fecha : hoy) + '">' +
      '<span class="etiqueta">Monto (pesos)</span>' +
      '<input class="campo" type="number" inputmode="numeric" min="1" step="1" id="eg-monto" placeholder="Ej.: 150000" value="' + (g ? escapar(Math.round(g.monto_cop)) : "") + '">' +
      '<span class="etiqueta">Categoría</span>' +
      '<div id="eg-cat-ui"></div>' +
      '<select class="campo" id="eg-categoria" hidden>' + categorias().map(c => '<option' + (g && g.categoria === c ? " selected" : "") + '>' + escapar(c) + '</option>').join("") +
        '<option value="' + NUEVA + '">+ Nueva categoría…</option></select>' +
      '<input class="campo" id="eg-categoria-nueva" placeholder="Nombre de la categoría: Contador, Herramientas, Diseño…" hidden>' +
      '<span class="etiqueta">Concepto</span>' +
      '<input class="campo" id="eg-concepto" placeholder="Ej.: Meta, campaña de septiembre" value="' + (g ? escapar(g.concepto) : "") + '">' +
      '<span class="etiqueta">Pagó</span>' +
      '<select class="campo" id="eg-quien">' + OPCIONES_PAGO.map(q => '<option' + (g && g.pagado_por === q ? " selected" : "") + '>' + q + '</option>').join("") + '</select>' +
      '<p class="mini explica">«Mitad y mitad»: en los totales se suma la mitad a cada uno.</p>' +
      '<span class="etiqueta">Soportes (fotos o PDF)</span>' +
      '<ul class="vt-archivos" id="eg-archivos"></ul>' +
      '<label class="boton-chico secundario vt-archivo-boton">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 7l-6.5 6.5a1.5 1.5 0 0 0 3 3l6.5-6.5a3 3 0 0 0-6-6l-6.5 6.5a4.5 4.5 0 0 0 9 9l6.5-6.5"/></svg>' +
        'Agregar fotos o PDF<input type="file" id="eg-soporte" accept="image/*,application/pdf" multiple hidden></label>' +
      '<p class="mini explica">Puedes elegir varios archivos a la vez (en computador, con Cmd o Ctrl presionado). Se guardan en un espacio privado de Supabase: nadie de afuera puede verlos. Máximo 10 MB cada uno.</p>',
    aceptar: g ? "Guardar cambios" : "Registrar",
    alAceptar: async () => {
      const fechaG = leer("eg-fecha"), monto = Number(leer("eg-monto")), concepto = leer("eg-concepto");
      if (!fechaG){ avisar("Elige la fecha.", "mal", "#aviso-forma"); return false; }
      if (mesSaldado(fechaG)){ avisar("Ese mes ya está saldado: sus gastos no se pueden cambiar. Para hacerlo, primero anula el pago de la diferencia.", "mal", "#aviso-forma"); return false; }
      if (!(monto > 0)){ avisar("Escribe el monto en pesos.", "mal", "#aviso-forma"); return false; }
      if (!concepto){ avisar("Escribe el concepto.", "mal", "#aviso-forma"); return false; }
      if (!quedan.length && !nuevos.length){ avisar("Adjunta al menos un soporte (foto o PDF).", "mal", "#aviso-forma"); return false; }
      /* Categoría nueva: primera letra en mayúscula; si ya existe (con otras mayúsculas), se usa la que hay */
      let categoria = leer("eg-categoria");
      if (categoria === NUEVA){
        const escrita = (leer("eg-categoria-nueva") || "").trim().replace(/\s+/g, " ");
        if (!escrita){ avisar("Escribe el nombre de la categoría nueva.", "mal", "#aviso-forma"); return false; }
        categoria = categorias().find(c => c.toLowerCase() === escrita.toLowerCase()) || escrita.charAt(0).toUpperCase() + escrita.slice(1);
      }
      /* La TRM no se ve: el gasto se registra en pesos y la TRM oficial de su
         día se guarda por dentro, solo para pasarlo a dólares en Rentabilidad.
         Al editar sin cambiar la fecha se conserva la que tenía. Si datos.gov.co
         no responde, se usa la del gasto más reciente (es una estimación). */
      let trm = g && g.fecha === fechaG ? Number(g.trm) : null;
      if (!trm){
        try { trm = await trmDelDia(fechaG); }
        catch (err){
          const previo = egresos.slice().sort((x, y) => y.fecha.localeCompare(x.fecha)).find(e => Number(e.trm) > 0);
          trm = previo ? Number(previo.trm) : null;
        }
      }
      if (!(trm > 0)){ avisar("No se pudo consultar la tasa del dólar. Intenta de nuevo en un momento.", "mal", "#aviso-forma"); return false; }
      const pesado = nuevos.find(a => a.size > MAX_BYTES);
      if (pesado){ avisar("«" + pesado.name + "» pesa más de 10 MB.", "mal", "#aviso-forma"); return false; }

      /* 1) los archivos nuevos; 2) el gasto; si algo falla, se borran los que se alcanzaron a subir */
      const subidos = [];
      for (const archivo of nuevos){
        const ruta = rutaNueva(fechaG, archivo);
        const { error } = await sb.storage.from(ESPACIO).upload(ruta, archivo, { contentType: archivo.type || undefined });
        if (error){
          if (subidos.length) await sb.storage.from(ESPACIO).remove(subidos);
          avisar("No se pudo subir «" + archivo.name + "». " + traducirError(error.message), "mal", "#aviso-forma");
          return false;
        }
        subidos.push(ruta);
      }
      const fila = { fecha: fechaG, monto_cop: Math.round(monto), trm: Math.round(trm * 100) / 100, categoria,
                     concepto, pagado_por: leer("eg-quien"), soportes: [...quedan, ...subidos] };
      const { error } = g
        ? await sb.from("egresos").update(fila).eq("id", g.id)
        : await sb.from("egresos").insert(fila);
      if (error){
        if (subidos.length) await sb.storage.from(ESPACIO).remove(subidos);
        avisar(traducirError(error.message), "mal", "#aviso-forma");
        return false;
      }
      /* Los soportes que se quitaron al editar se borran del espacio */
      const quitados = g ? g.soportes.filter(r => !quedan.includes(r)) : [];
      if (quitados.length) await sb.storage.from(ESPACIO).remove(quitados);
      avisar(g ? "Gasto actualizado." : "Gasto registrado.", "ok", "#aviso-egresos");
      await recargar();
    }
  });
  /* Los botones van uno debajo del otro */
  document.querySelector("#velo-forma .ventana").classList.add("vt-ventana-egreso");
  /* Categoría con un menú propio (el estilo de los filtros de Soluciones) en vez de la
     lista del sistema, que no se puede decorar. El <select> oculto guarda el valor. */
  const selCat = document.getElementById("eg-categoria"), uiCat = document.getElementById("eg-cat-ui");
  const FLECHA_CAT = '<svg class="desplegable-flecha" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  const elegirCat = v => { selCat.value = v; selCat.dispatchEvent(new Event("change")); pintarCat(); };
  const nombreCat = v => v === NUEVA ? "+ Nueva categoría…" : v;
  function pintarCat(){
    const valores = [...selCat.options].map(o => o.value);
    uiCat.innerHTML = '<div class="desplegable eg-cat-desp"><button type="button" class="campo eg-cat-boton" aria-haspopup="true" aria-expanded="false">' +
        '<span>' + escapar(nombreCat(selCat.value)) + '</span>' + FLECHA_CAT + '</button>' +
        '<div class="desplegable-menu eg-cat-menu" role="menu">' + valores.map(v => (v === NUEVA ? '<div class="desplegable-raya"></div>' : '') +
          '<button type="button" role="menuitemradio" class="desplegable-op" data-cat="' + escapar(v) + '" aria-checked="' + (v === selCat.value) + '">' +
          '<span class="desplegable-ok" aria-hidden="true">' + (v === selCat.value ? "✓" : "") + '</span>' + escapar(nombreCat(v)) + '</button>').join("") + '</div></div>';
  }
  uiCat.addEventListener("click", e => {
    const op = e.target.closest("[data-cat]");
    if (op){ elegirCat(op.dataset.cat); return; }
    const boton = e.target.closest(".eg-cat-boton");
    if (boton){ const caja = boton.parentElement; const abrir = !caja.classList.contains("abierto"); caja.classList.toggle("abierto", abrir); boton.setAttribute("aria-expanded", String(abrir)); }
  });
  /* Tocar fuera del menú lo cierra */
  document.querySelector("#velo-forma .ventana").addEventListener("click", e => {
    const caja = uiCat.querySelector(".eg-cat-desp.abierto");
    if (caja && !caja.contains(e.target)){ caja.classList.remove("abierto"); caja.querySelector(".eg-cat-boton").setAttribute("aria-expanded", "false"); }
  });
  pintarCat();
  /* «+ Nueva categoría…» muestra el campo para escribirla */
  document.getElementById("eg-categoria").addEventListener("change", e => {
    const campo = document.getElementById("eg-categoria-nueva");
    campo.hidden = e.target.value !== NUEVA;
    if (!campo.hidden) campo.focus();
  });
  /* Lista de soportes: los que ya tenía y los nuevos, cada uno con ✕ para quitarlo */
  const lista = document.getElementById("eg-archivos");
  const pintarArchivos = () => {
    const quitar = (tipo, i, nombre) => '<button type="button" class="vt-archivo-quitar" data-quitar="' + tipo + '" data-i="' + i +
      '" aria-label="Quitar ' + escapar(nombre) + '">✕</button>';
    lista.innerHTML = quedan.map((r, i) => '<li><span>' + escapar(nombreDe(r)) + '<span class="mini">ya guardado</span></span>' + quitar("quedan", i, nombreDe(r)) + '</li>').join("") +
      nuevos.map((a, i) => '<li><span>' + escapar(a.name) + '<span class="mini">nuevo · ' + kb(a.size) + '</span></span>' + quitar("nuevos", i, a.name) + '</li>').join("") ||
      '<li class="vt-archivos-vacio"><span class="mini">Ningún archivo elegido</span></li>';
  };
  lista.addEventListener("click", e => {
    const b = e.target.closest("[data-quitar]");
    if (!b) return;
    (b.dataset.quitar === "quedan" ? quedan : nuevos).splice(Number(b.dataset.i), 1);
    pintarArchivos();
  });
  document.getElementById("eg-soporte").addEventListener("change", e => {
    nuevos = nuevos.concat([...e.target.files]);
    e.target.value = "";                       // para poder volver a elegir el mismo archivo
    pintarArchivos();
  });
  pintarArchivos();
}
