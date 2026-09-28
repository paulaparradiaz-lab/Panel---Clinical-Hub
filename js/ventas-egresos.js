/* ============================================================
   CLINICAL HUB · VENTAS › EGRESOS
   Los gastos que los cofundadores anotan a mano (tabla egresos), en
   PESOS. Cada gasto guarda la TRM de su día (se trae sola de datos.gov.co
   y se puede corregir) y Supabase calcula el equivalente en dólares, que
   se usará para la rentabilidad estimada.
   Cada gasto lleva uno o varios soportes (fotos o PDF) en el espacio
   privado «soportes-egresos»: se abren con enlaces que vencen en 5 min.
   Cada archivo se guarda como «AAAA-MM/código/nombre-original.ext», así
   al descargarlo conserva su nombre y su extensión.

   · Registrar: fecha, monto en pesos, TRM, categoría (por ahora Anuncios), concepto,
     quién lo pagó (Paula, Hámilton o mitad y mitad) y los soportes (mínimo uno).
   · Editar y borrar (con confirmación); queda quién lo cambió.
   · Por mes: total y cuánto puso cada uno; avisa los meses sin gastos.
   ============================================================ */
import { sb, escapar, fecha, abrirVentana, avisar, leer, traducirError } from "./nucleo.js";
import { cabecera, armarAyudas } from "./ventas-comun.js";

/* Pesos colombianos, sin centavos: $ 150.000 */
const cop = n => n == null ? "—" : "$ " + Math.round(Number(n)).toLocaleString("es-CO");
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
const CATEGORIAS = ["Anuncios"];
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
let caja = null;
let datosVentas = null;

export async function render(c, datos){
  caja = c;
  datosVentas = datos;
  caja.innerHTML = `
<section class="caja" style="margin-top:18px">
  ${cabecera("ayuda-egresos", "Egresos", { id: "eg-resumen", texto: "" }, [
    "Los gastos que ustedes anotan a mano, <b>en pesos</b>. Por ahora la categoría es <b>Anuncios</b>.",
    "Cada gasto guarda la <b>TRM de su día</b> (la tasa oficial, que el panel trae sola y se puede corregir). Con ella se calcula su equivalente en dólares para la <b>rentabilidad estimada</b>.",
    "Cada gasto necesita al menos un <b>soporte</b> (foto de la factura, pantallazo o PDF); puede llevar varios. Se guardan en un espacio privado: solo se abren desde el panel.",
    "<b>Pagó</b> es quién puso la plata: Paula, Hámilton o <b>mitad y mitad</b> (en los totales se suma la mitad a cada uno). También queda anotado quién lo registró y quién lo cambió por última vez.",
    "Con los ingresos (subpestaña Ingresos) y estos egresos armamos después la <b>rentabilidad estimada</b> del mes."])}
  <div class="vt-egresos-barra">
    <button class="boton-chico boton-nueva" type="button" id="eg-nuevo">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Registrar gasto</button>
  </div>
  <p class="aviso" id="aviso-egresos" role="status"></p>
  <div id="eg-lista"><p class="vacio">Cargando…</p></div>
</section>
<section class="caja" style="margin-top:14px">
  ${cabecera("ayuda-egresos-mes", "Por mes", "Total del mes y cuánto puso cada uno", [
    "Suma los gastos de cada mes y cuánto pagó cada cofundador.",
    "Desde el primer mes con ventas, un mes sin gastos anotados sale como <b>«sin gastos registrados»</b>, para que no se quede ninguno por fuera."])}
  <div class="vt-tabla" id="eg-meses"></div>
</section>`;
  armarAyudas(caja);
  caja.querySelector("#eg-nuevo").addEventListener("click", () => ventana(null));
  caja.querySelector("#eg-lista").addEventListener("click", alTocar);
  await recargar();
}

export async function recargar(){
  const { data, error } = await sb.from("egresos").select("*")
    .order("fecha", { ascending:false }).order("id", { ascending:false });
  if (!caja || !caja.isConnected) return;
  if (error){
    caja.querySelector("#eg-lista").innerHTML = '<p class="vacio">No se pudieron leer los egresos. ' + escapar(traducirError(error.message)) + '</p>';
    return;
  }
  egresos = data || [];
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
  caja.querySelector("#eg-resumen").textContent = "Este mes: " + cop(suma(delMes)) +
    QUIENES.map(q => " · " + q + " " + cop(delMes.reduce((x, e) => x + parte(e, q), 0))).join("");

  const lista = caja.querySelector("#eg-lista");
  if (!egresos.length){
    lista.innerHTML = '<p class="vacio">Todavía no hay gastos registrados. Usa «Registrar gasto».</p>';
  } else {
    const acciones = e => '<span class="vt-eg-acciones">' +
      '<button class="boton-chico" type="button" data-ver="' + e.id + '">' +
        (e.soportes.length > 1 ? 'Ver soportes (' + e.soportes.length + ')' : 'Ver soporte') + '</button>' +
      '<button class="boton-chico secundario" type="button" data-editar="' + e.id + '">Editar</button>' +
      '<button class="boton-chico secundario" type="button" data-borrar="' + e.id + '">Borrar</button></span>' +
      '<div class="vt-eg-enlaces" data-enlaces="' + e.id + '" hidden></div>';
    lista.innerHTML =
      /* En celular, una tarjeta por gasto; en computador, la tabla */
      '<div class="vt-tarjetas-cel">' + egresos.map(e => '<div class="vt-tarjeta-egreso">' +
        '<div class="vt-eg-cab"><b>' + escapar(e.concepto) + '</b><b>' + escapar(cop(e.monto_cop)) + '</b></div>' +
        '<span class="mini">' + escapar(fecha(e.fecha + "T12:00:00-05:00")) + ' · ' + escapar(e.categoria) + ' · pagó ' + escapar(e.pagado_por === MITAD ? "mitad y mitad" : e.pagado_por) + '</span>' +
        acciones(e) + '</div>').join("") + '</div>' +
      '<table class="tabla vt-solo-compu"><thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Pagó</th><th>Monto</th><th></th></tr></thead><tbody>' +
      egresos.map(e => '<tr><td>' + escapar(fecha(e.fecha + "T12:00:00-05:00")) + '</td><td>' + escapar(e.concepto) + '</td><td>' +
        escapar(e.categoria) + '</td><td>' + escapar(e.pagado_por) + '</td><td>' + escapar(cop(e.monto_cop)) + '</td><td>' + acciones(e) + '</td></tr>').join("") +
      '</tbody></table>';
  }
  pintarMeses();
}

/* Cuánto le toca a una persona de un gasto: todo si lo pagó, la mitad si fue a mitades */
function parte(e, quien){
  if (e.pagado_por === quien) return Number(e.monto_cop);
  if (e.pagado_por === MITAD) return Number(e.monto_cop) / 2;
  return 0;
}

/* Por mes, desde el primer mes con ventas (o con gastos) hasta hoy */
function pintarMeses(){
  const porMes = new Map();
  egresos.forEach(e => {
    const k = e.fecha.slice(0, 7);
    if (!porMes.has(k)) porMes.set(k, { total: 0, por: {} });
    const m = porMes.get(k);
    m.total += Number(e.monto_cop);
    QUIENES.forEach(q => { m.por[q] = (m.por[q] || 0) + parte(e, q); });
  });
  const claves = [...porMes.keys()];
  const pagos = (datosVentas && datosVentas.modelo && datosVentas.modelo.pagos) || [];
  if (pagos.length){
    const d = new Date(pagos[0].t + ZONA);
    claves.push(d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0"));
  }
  const hoy = new Date(Date.now() + ZONA);
  const claveHoy = hoy.getUTCFullYear() + "-" + String(hoy.getUTCMonth() + 1).padStart(2, "0");
  if (!claves.length){ caja.querySelector("#eg-meses").innerHTML = '<p class="vacio">Todavía no hay meses.</p>'; return; }
  const meses = [];
  let [a, m] = claves.sort()[0].split("-").map(Number);
  for (;;){
    const k = a + "-" + String(m).padStart(2, "0");
    meses.push(k);
    if (k >= claveHoy) break;
    m === 12 ? (a++, m = 1) : m++;
  }
  caja.querySelector("#eg-meses").innerHTML =
    '<table class="tabla"><thead><tr><th>Mes</th><th>Total</th>' + QUIENES.map(q => '<th>' + q + '</th>').join("") + '</tr></thead><tbody>' +
    meses.reverse().map(k => {
      const [an, me] = k.split("-").map(Number), d = porMes.get(k);
      const nombre = MESES[me - 1] + " " + an;
      return d
        ? '<tr><td>' + nombre + '</td><td><b>' + escapar(cop(d.total)) + '</b></td>' + QUIENES.map(q => '<td>' + escapar(cop(d.por[q] || 0)) + '</td>').join("") + '</tr>'
        : '<tr><td>' + nombre + '</td><td colspan="' + (QUIENES.length + 1) + '"><span class="mini">Sin gastos registrados</span></td></tr>';
    }).join("") + '</tbody></table>';
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
    /* Varios: se despliega la lista de archivos debajo del gasto (se abre y se cierra) */
    const cajaEnlaces = ver.closest(".vt-tarjeta-egreso, td").querySelector("[data-enlaces]");
    if (!cajaEnlaces.hidden){ cajaEnlaces.hidden = true; return; }
    const { data, error } = await sb.storage.from(ESPACIO).createSignedUrls(g.soportes, 300);
    if (error){ avisar("No se pudieron abrir los soportes. " + traducirError(error.message), "mal", "#aviso-egresos"); return; }
    cajaEnlaces.innerHTML = data.map(d => d.signedUrl
      ? '<a href="' + escapar(d.signedUrl) + '" target="_blank" rel="noopener">' + escapar(nombreDe(d.path)) + '</a>'
      : '<span class="mini">' + escapar(nombreDe(d.path || "")) + ' · no se encontró</span>').join("") +
      '<span class="mini">Los enlaces vencen en 5 minutos.</span>';
    cajaEnlaces.hidden = false;
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
      '<span class="etiqueta">TRM del día (pesos por dólar)</span>' +
      '<input class="campo" type="number" inputmode="decimal" min="1" step="0.01" id="eg-trm" value="' + (g ? escapar(g.trm) : "") + '">' +
      '<span class="mini" id="eg-trm-nota">' + (g ? "La que se guardó con el gasto. Cámbiala solo si hace falta." : "Buscando la TRM oficial…") + '</span>' +
      '<span class="etiqueta">Categoría</span>' +
      '<select class="campo" id="eg-categoria">' + CATEGORIAS.map(c => '<option' + (g && g.categoria === c ? " selected" : "") + '>' + c + '</option>').join("") + '</select>' +
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
      const fechaG = leer("eg-fecha"), monto = Number(leer("eg-monto")), trm = Number(leer("eg-trm")), concepto = leer("eg-concepto");
      if (!fechaG){ avisar("Elige la fecha.", "mal", "#aviso-forma"); return false; }
      if (!(monto > 0)){ avisar("Escribe el monto en pesos.", "mal", "#aviso-forma"); return false; }
      if (!(trm > 0)){ avisar("Falta la TRM del día (pesos por dólar).", "mal", "#aviso-forma"); return false; }
      if (!concepto){ avisar("Escribe el concepto.", "mal", "#aviso-forma"); return false; }
      if (!quedan.length && !nuevos.length){ avisar("Adjunta al menos un soporte (foto o PDF).", "mal", "#aviso-forma"); return false; }
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
      const fila = { fecha: fechaG, monto_cop: Math.round(monto), trm: Math.round(trm * 100) / 100, categoria: leer("eg-categoria"),
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
  /* La TRM oficial se trae sola al abrir (gasto nuevo) y al cambiar la fecha */
  const traerTrm = async () => {
    const dia = leer("eg-fecha"), nota = document.getElementById("eg-trm-nota");
    if (!dia || !nota) return;
    nota.textContent = "Buscando la TRM oficial…";
    try {
      const valor = await trmDelDia(dia);
      const campo = document.getElementById("eg-trm");
      if (!campo) return;
      campo.value = valor;
      nota.textContent = "TRM oficial vigente ese día (datos.gov.co). Puedes cambiarla si usaste otra tasa.";
    } catch (err){
      nota.textContent = "No se pudo traer la TRM oficial: escríbela a mano.";
    }
  };
  document.getElementById("eg-fecha").addEventListener("change", traerTrm);
  if (!g) traerTrm();
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
