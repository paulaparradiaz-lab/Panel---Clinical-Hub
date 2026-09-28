/* ============================================================
   CLINICAL HUB · PANEL
   Entrada del panel: acceso con 2FA, barra superior y pestañas.
   Cada pestaña vive en su propio archivo.
   ============================================================ */
import { sb, $, estado, escapar, avisar, ocupado, traducirError,
         cerrarVentana, abrirVentana } from "./nucleo.js";
import * as feedback from "./pestana-feedback.js";
import * as mejoras from "./pestana-mejoras.js";
import * as impacto from "./pestana-impacto.js";

/* Aquí crece el panel: añade una sección con su render y listo.
   Feedback, Mejoras e Impacto leen solo las tablas de la IA (ver ia.js). */
const SECCIONES = [
  { id:"feedback", nombre:"Feedback", render: feedback.render },
  { id:"mejoras",  nombre:"Mejoras",  render: mejoras.render },
  { id:"impacto",  nombre:"Impacto",  render: impacto.render },
  { id:"ventas",   nombre:"Ventas" },
  { id:"hitos",    nombre:"Hitos" }
];

let seccionActiva = "feedback";
let factorId = null;

/* ============================================================
   Cierre por inactividad: tras 12 horas sin usar el panel, la sesión
   se cierra en este navegador y hay que volver a entrar (contraseña y
   código). Supabase no lo hace en el plan gratuito, así que lo hace el
   panel. La última actividad se guarda en el navegador, compartida
   entre pestañas; solo se cierra la sesión de este navegador.
   ============================================================ */
const INACTIVIDAD_MAX = 12 * 60 * 60 * 1000;          // 12 horas
const CLAVE_ACTIVIDAD = "ch-ultima-actividad";
let marcadoEn = 0;

function marcarActividad(){
  const ahora = Date.now();
  if (ahora - marcadoEn < 60 * 1000) return;           // basta una vez por minuto
  marcadoEn = ahora;
  try { localStorage.setItem(CLAVE_ACTIVIDAD, String(ahora)); } catch(e) {}
}

function inactivaDemasiado(){
  let ultima = 0;
  try { ultima = Number(localStorage.getItem(CLAVE_ACTIVIDAD)) || 0; } catch(e) {}
  return ultima > 0 && Date.now() - ultima > INACTIVIDAD_MAX;
}

async function cerrarPorInactividad(){
  await sb.auth.signOut({ scope: "local" });
  try { sessionStorage.setItem("ch-cierre-inactividad", "1"); } catch(e) {}
  location.reload();
}

function vigilarInactividad(){
  ["click", "keydown", "scroll", "touchstart"].forEach(ev =>
    document.addEventListener(ev, marcarActividad, { passive: true, capture: true }));
  setInterval(() => { if (inactivaDemasiado()) cerrarPorInactividad(); }, 60 * 1000);
}

/* ============================================================
   1. ACCESO: contraseña + código TOTP (nivel aal2)
   ============================================================ */
const PASOS = ["paso-login", "paso-enrolar", "paso-codigo", "paso-olvido", "paso-nueva"];

/* Reglas de la contraseña: las mismas que exige Supabase (Authentication ›
   Providers › Email). Si allá cambian, se ajustan aquí. */
const CLAVE_MINIMA = 8;
const REGLAS_CLAVE = "Mínimo " + CLAVE_MINIMA + " caracteres.";

function claveInvalida(nueva, repetir){
  if (nueva.length < CLAVE_MINIMA) return "Usa al menos " + CLAVE_MINIMA + " caracteres.";
  if (nueva !== repetir) return "Las dos contraseñas no coinciden.";
  return "";
}

/* Si se llega desde el enlace de «¿Olvidaste tu contraseña?», después del
   código de la app se pide la contraseña nueva en vez de abrir el panel. */
let modoRecuperacion = /type=recovery/.test(location.hash);
sb.auth.onAuthStateChange(evento => { if (evento === "PASSWORD_RECOVERY") modoRecuperacion = true; });

function mostrarPaso(id){
  PASOS.forEach(p => { $("#" + p).hidden = (p !== id); });
  $("#volver").hidden = (id === "paso-login");
  $("#acceso").hidden = false;
  $("#panel").hidden = true;
  const primero = $("#" + id + " input");
  if (primero) setTimeout(() => primero.focus(), 50);
}

async function decidir(){
  const { data: s } = await sb.auth.getSession();
  if (!s.session){
    let porInactividad = false;
    try { porInactividad = sessionStorage.getItem("ch-cierre-inactividad") === "1";
          sessionStorage.removeItem("ch-cierre-inactividad"); } catch(e) {}
    if (porInactividad) avisar("Por seguridad, tu sesión se cerró tras 12 horas sin usar el panel. Vuelve a entrar.", "ok");
    return mostrarPaso("paso-login");
  }
  if (inactivaDemasiado()) return cerrarPorInactividad();
  const { data: nivel, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error){ avisar(traducirError(error.message), "mal"); return mostrarPaso("paso-login"); }
  if (nivel.currentLevel === "aal2"){
    /* Contraseña propia: la primera vez (la inicial la puso quien creó la
       cuenta, o llegó por invitación sin contraseña) y al recuperarla */
    const { data: u } = await sb.auth.getUser();
    const usuario = (u && u.user) || s.session.user;
    if (modoRecuperacion || !(usuario.user_metadata || {}).clave_propia) return pedirClaveNueva();
    return abrirPanel(s.session);
  }
  if (nivel.nextLevel === "aal2") return pedirCodigo();
  return enrolar();
}

async function entrar(){
  const correo = $("#correo").value.trim();
  const clave  = $("#clave").value;
  if (!correo.includes("@") || !clave){ avisar("Escribe tu correo y tu contraseña.", "mal"); return; }
  const { error } = await sb.auth.signInWithPassword({ email: correo, password: clave });
  if (error){ avisar(traducirError(error.message), "mal"); return; }
  avisar("");
  $("#clave").value = "";
  marcadoEn = 0; marcarActividad();                 // la sesión nueva arranca con el reloj en cero
  await decidir();
}

async function enrolar(){
  const { data: lista } = await sb.auth.mfa.listFactors();
  for (const factor of ((lista && lista.all) || [])){
    if (factor.status === "unverified") await sb.auth.mfa.unenroll({ factorId: factor.id });
  }
  const { data, error } = await sb.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Clinical Hub panel " + new Date().toISOString().slice(0, 10)
  });
  if (error){ avisar(traducirError(error.message), "mal"); return mostrarPaso("paso-login"); }
  factorId = data.id;
  $("#qr").src = data.totp.qr_code;
  $("#secreto").textContent = data.totp.secret;
  avisar("");
  mostrarPaso("paso-enrolar");
}

async function pedirCodigo(){
  const { data, error } = await sb.auth.mfa.listFactors();
  if (error || !data.totp.length) return enrolar();
  factorId = data.totp[0].id;
  avisar("");
  mostrarPaso("paso-codigo");
}

async function verificarCodigo(selector){
  const code = $(selector).value.replace(/\D/g, "");
  if (code.length !== 6){ avisar("El código tiene 6 dígitos.", "mal"); return; }
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code });
  $(selector).value = "";
  if (error){ avisar(traducirError(error.message), "mal"); return; }
  avisar("");
  await decidir();
}

function pedirClaveNueva(){
  $("#titulo-nueva").textContent = modoRecuperacion ? "Pon tu contraseña nueva" : "Crea tu contraseña";
  $("#guia-nueva").textContent = modoRecuperacion
    ? "Llegaste desde el enlace de recuperación. Escribe la contraseña con la que vas a entrar de ahora en adelante."
    : "Es tu primera vez en el panel: pon una contraseña que solo sepas tú.";
  $("#reglas-nueva").textContent = REGLAS_CLAVE;
  /* La primera vez se pide la contraseña que le dieron (Supabase exige la
     actual para cambiarla); al recuperar no, porque justo la olvidó. */
  $("#nueva-actual").hidden = modoRecuperacion;
  $("#nueva-actual").value = "";
  $("#nueva-1").value = "";
  $("#nueva-2").value = "";
  mostrarPaso("paso-nueva");
}

async function guardarClaveNueva(){
  const nueva = $("#nueva-1").value;
  const actual = $("#nueva-actual").value;
  if (!modoRecuperacion && !actual){ avisar("Escribe la contraseña que te dieron.", "mal"); return; }
  const error1 = claveInvalida(nueva, $("#nueva-2").value);
  if (error1){ avisar(error1, "mal"); return; }
  const cambios = { password: nueva, data: { clave_propia: true } };
  if (!modoRecuperacion) cambios.current_password = actual;
  const { error } = await sb.auth.updateUser(cambios);
  if (error){ avisar(traducirError(error.message), "mal"); return; }
  modoRecuperacion = false;
  avisar("");
  await decidir();
}

async function enviarOlvido(){
  const correo = $("#correo-olvido").value.trim();
  if (!correo.includes("@")){ avisar("Escribe tu correo.", "mal"); return; }
  const { error } = await sb.auth.resetPasswordForEmail(correo, { redirectTo: location.origin + location.pathname });
  if (error){ avisar(traducirError(error.message), "mal"); return; }
  avisar("Listo. Si ese correo tiene cuenta, te llegará un enlace para poner una contraseña nueva.", "ok");
}

/* Passkey: reemplaza la contraseña. Si Supabase no la cuenta como segundo
   factor, decidir() pide igual el código de la app. */
async function entrarConPasskey(){
  const { error } = await sb.auth.signInWithPasskey();
  if (error){ avisar(traducirError((error.code || "") + " " + (error.message || "") + " " + (error.name || "")), "mal"); return; }
  avisar("");
  marcadoEn = 0; marcarActividad();
  await decidir();
}

async function salir(){
  await sb.auth.signOut();
  location.reload();
}

$("#entrar").addEventListener("click", () => ocupado($("#entrar"), "Entrando…", entrar));
$("#clave").addEventListener("keydown", e => { if (e.key === "Enter") $("#entrar").click(); });
$("#confirmar-enrolar").addEventListener("click", () =>
  ocupado($("#confirmar-enrolar"), "Verificando…", () => verificarCodigo("#codigo-enrolar")));
$("#codigo-enrolar").addEventListener("keydown", e => { if (e.key === "Enter") $("#confirmar-enrolar").click(); });
$("#verificar").addEventListener("click", () =>
  ocupado($("#verificar"), "Verificando…", () => verificarCodigo("#codigo")));
$("#codigo").addEventListener("keydown", e => { if (e.key === "Enter") $("#verificar").click(); });
$("#salir").addEventListener("click", salir);
$("#entrar-passkey").addEventListener("click", () => ocupado($("#entrar-passkey"), "Esperando la passkey…", entrarConPasskey));
$("#ir-olvido").addEventListener("click", () => {
  $("#correo-olvido").value = $("#correo").value.trim();
  avisar("");
  mostrarPaso("paso-olvido");
});
$("#enviar-olvido").addEventListener("click", () => ocupado($("#enviar-olvido"), "Enviando…", enviarOlvido));
$("#correo-olvido").addEventListener("keydown", e => { if (e.key === "Enter") $("#enviar-olvido").click(); });
$("#guardar-nueva").addEventListener("click", () => ocupado($("#guardar-nueva"), "Guardando…", guardarClaveNueva));
$("#nueva-2").addEventListener("keydown", e => { if (e.key === "Enter") $("#guardar-nueva").click(); });
$("#volver").addEventListener("click", salir);

/* ============================================================
   2. PANEL: barra superior y pestañas
   ============================================================ */
async function abrirPanel(sesion){
  if (!$("#panel").hidden) return;
  $("#acceso").hidden = true;
  $("#panel").hidden = false;

  marcadoEn = 0; marcarActividad();
  vigilarInactividad();

  const correo = sesion.user.email || "";
  estado.usuario = { id: sesion.user.id, correo: correo };
  $("#usuario-correo").textContent = correo;
  $("#menu-correo").textContent = correo;
  $("#avatar").textContent = iniciales(correo);
  pintarTemaActual();

  pintarPestanas();
  abrirSeccion(seccionActiva);
}

function iniciales(correo){
  const nombre = correo.split("@")[0].replace(/[^a-zA-Z]/g, " ").trim().split(/\s+/);
  const a = (nombre[0] || "?")[0] || "?";
  const b = nombre[1] ? nombre[1][0] : (nombre[0] || "")[1] || "";
  return (a + b).toUpperCase();
}

function pintarPestanas(){
  /* Se pintan una sola vez; al cambiar de sección solo se marca la activa
     (así la curva de la barra lateral puede deslizarse entre pestañas). */
  $("#pestanas").innerHTML = SECCIONES.map(s => s.render
    ? '<button class="pestana" role="tab" data-seccion="' + s.id + '" aria-selected="' +
      (s.id === seccionActiva) + '"><span class="pestana-txt"' +
      (s.corto ? ' data-corto="' + escapar(s.corto) + '"' : '') + '>' + escapar(s.nombre) + '</span></button>'
    : '<button class="pestana" role="tab" aria-selected="false" aria-disabled="true" tabindex="-1" ' +
      'title="Todavía no conectado"><span class="pestana-txt">' + escapar(s.nombre) +
      '<span class="pronto">pronto</span></span></button>'
  ).join("");
  if (!$(".pestana-curva")){
    const curva = document.createElement("span");
    curva.className = "pestana-curva";
    curva.setAttribute("aria-hidden", "true");
    $(".barra-superior").appendChild(curva);
  }
  marcarPestana();
}

/* Marca la pestaña activa y lleva la curva hasta ella */
function marcarPestana(){
  document.querySelectorAll("#pestanas .pestana[data-seccion]").forEach(b =>
    b.setAttribute("aria-selected", String(b.dataset.seccion === seccionActiva)));
  moverCurva();
}

/* En escritorio la curva baja por la barra lateral; en celular el menú
   va abajo y la curva se desliza de lado sobre él (mismo corte de 900 px
   que el CSS). */
const menuAbajo = window.matchMedia("(max-width: 899px)");

function moverCurva(){
  const curva = $(".pestana-curva");
  const activa = $('#pestanas .pestana[aria-selected="true"]');
  if (!curva || !activa) return;
  const caja = activa.getBoundingClientRect();
  if (menuAbajo.matches){
    curva.style.transform = "translateX(" + (caja.left + caja.width / 2 - curva.offsetWidth / 2) + "px)";
    return;
  }
  const barra = $(".barra-superior").getBoundingClientRect();
  curva.style.transform = "translateY(" + (caja.top - barra.top + caja.height / 2 - 46) + "px)";
}
window.addEventListener("resize", moverCurva);
menuAbajo.addEventListener("change", moverCurva);

function abrirSeccion(id){
  const s = SECCIONES.find(x => x.id === id);
  if (!s || !s.render) return;
  seccionActiva = id;
  marcarPestana();
  $("#vista").innerHTML = '<p class="vacio">Cargando…</p>';
  s.render();
}

/* Cifras que cuentan desde cero cuando aparecen (estilo Dashboard V2).
   Lee el texto que pone cada módulo (p. ej. "4,6", "1.284", "87%"),
   anima el número y termina dejando exactamente el texto original.
   Si el módulo cambia el texto a mitad de camino, la animación se detiene. */
const reducirMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function contar(el){
  if (reducirMovimiento || el.dataset.contado) return;
  const original = el.textContent.trim();
  const m = original.match(/^([^\d-]*)(-?\d[\d.,]*)(.*)$/);
  if (!m) return;
  el.dataset.contado = "1";
  const num = m[2];
  // Decide qué es decimal y qué es miles, respetando cómo lo escribió el módulo
  let decSep = "", milSep = "";
  if (num.includes(",")) { decSep = ","; milSep = num.includes(".") ? "." : ""; }
  else if (/\.\d{3}$/.test(num) && !/\.\d{3}\d/.test(num)) { milSep = "."; }
  else if (num.includes(".")) { decSep = "."; }
  const decimales = decSep ? num.split(decSep)[1].length : 0;
  const limpio = num.split(milSep || "\u0000").join("").replace(decSep || "\u0000", ".");
  const final = parseFloat(limpio);
  if (!isFinite(final) || final === 0) return;
  const pintar = v => {
    let [ent, dec] = v.toFixed(decimales).split(".");
    if (milSep) ent = ent.replace(/\B(?=(\d{3})+(?!\d))/g, milSep);
    return m[1] + ent + (dec ? decSep + dec : "") + m[3];
  };
  const inicio = performance.now();
  let escrito = original;
  (function paso(ahora){
    if (el.textContent !== escrito) return;              // otro código lo cambió: no pisar
    const t = Math.min(1, (ahora - inicio) / 1100);
    const e = 1 - Math.pow(1 - t, 3);
    escrito = t < 1 ? pintar(final * e) : original;
    el.textContent = escrito;
    if (t < 1) requestAnimationFrame(paso);
  })(inicio);
}
new MutationObserver(() => {
  document.querySelectorAll("#vista .cifra:not([data-contado])").forEach(contar);
}).observe($("#vista"), { childList: true, subtree: true });

$("#pestanas").addEventListener("click", e => {
  const b = e.target.closest("button[data-seccion]");
  if (b) abrirSeccion(b.dataset.seccion);
});

/* Salto de una pestana a otra desde dentro del panel. Lo usa el ranking
   de Temas pedidos para llevarte a la mejora de ese tema: manda la
   seccion a abrir y, si hace falta, el id de lo que hay que resaltar. */
document.addEventListener("ch-ir", e => {
  const d = (e && e.detail) || {};
  if (d.foco) estado.foco = d.foco;
  if (d.seccion) abrirSeccion(d.seccion);
});

/* ============================================================
   3. Menú de usuario, tema y contraseña
   ============================================================ */
const botonUsuario = $("#usuario-boton");
const menu = $("#menu-usuario");

function abrirMenu(abrir){
  menu.hidden = !abrir;
  botonUsuario.setAttribute("aria-expanded", String(abrir));
}

botonUsuario.addEventListener("click", e => { e.stopPropagation(); abrirMenu(menu.hidden); });
document.addEventListener("click", e => { if (!menu.hidden && !menu.contains(e.target)) abrirMenu(false); });
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (!$("#velo-forma").hidden) cerrarVentana();
  else if (!$("#velo-clave").hidden) cerrarVentanaClave();
  else if (!menu.hidden){ abrirMenu(false); botonUsuario.focus(); }
});

function pintarTemaActual(){
  $("#tema-actual").textContent = document.documentElement.dataset.theme === "light" ? "Claro" : "Oscuro";
}

$("#cambiar-tema").addEventListener("click", () => {
  const nuevo = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = nuevo;
  try { localStorage.setItem("ch-tema", nuevo); } catch(e) {}
  pintarTemaActual();
});

/* Cambiar contraseña: se confirma que eres tú con la contraseña actual
   (Supabase la exige). Si además Supabase pide el código del correo
   («Secure password change» con la sesión vieja), se envía y se pide. */
async function enviarCodigoClave(){
  const { error } = await sb.auth.reauthenticate();
  if (error){ avisar(traducirError(error.message), "mal", "#aviso-clave"); return; }
  avisar("Te enviamos un código a " + (estado.usuario ? estado.usuario.correo : "tu correo") + ".", "ok", "#aviso-clave");
}

$("#abrir-clave").addEventListener("click", () => {
  abrirMenu(false);
  avisar("", "", "#aviso-clave");
  $("#reglas-clave").textContent = REGLAS_CLAVE;
  $("#caja-codigo").hidden = true;
  $("#clave-actual").value = "";
  $("#clave-codigo").value = "";
  $("#clave-nueva").value = "";
  $("#clave-repetir").value = "";
  $("#velo-clave").hidden = false;
  setTimeout(() => $("#clave-actual").focus(), 50);
});
$("#reenviar-codigo").addEventListener("click", () => ocupado($("#reenviar-codigo"), "Enviando…", enviarCodigoClave));

function cerrarVentanaClave(){
  $("#velo-clave").hidden = true;
  botonUsuario.focus();
}

$("#cancelar-clave").addEventListener("click", cerrarVentanaClave);
$("#velo-clave").addEventListener("click", e => { if (e.target.id === "velo-clave") cerrarVentanaClave(); });
$("#clave-repetir").addEventListener("keydown", e => { if (e.key === "Enter") $("#guardar-clave").click(); });

$("#guardar-clave").addEventListener("click", () => ocupado($("#guardar-clave"), "Guardando…", async () => {
  const actual  = $("#clave-actual").value;
  const codigo  = $("#clave-codigo").value.replace(/\s/g, "");
  const nueva   = $("#clave-nueva").value;
  if (!actual){ avisar("Escribe tu contraseña actual.", "mal", "#aviso-clave"); return; }
  if (!$("#caja-codigo").hidden && !codigo){ avisar("Escribe el código que te llegó al correo.", "mal", "#aviso-clave"); return; }
  const error1 = claveInvalida(nueva, $("#clave-repetir").value);
  if (error1){ avisar(error1, "mal", "#aviso-clave"); return; }
  const cambios = { password: nueva, current_password: actual, data: { clave_propia: true } };
  if (codigo) cambios.nonce = codigo;
  const { error } = await sb.auth.updateUser(cambios);
  if (error && /reauthenticat/i.test(error.message || "") && $("#caja-codigo").hidden){
    /* Supabase pide además el código del correo: se envía y se muestra */
    $("#caja-codigo").hidden = false;
    await enviarCodigoClave();
    setTimeout(() => $("#clave-codigo").focus(), 50);
    return;
  }
  if (error){ avisar(traducirError(error.message), "mal", "#aviso-clave"); return; }
  avisar("Contraseña actualizada. La próxima vez entras con la nueva.", "ok", "#aviso-clave");
  $("#clave-actual").value = "";
  $("#clave-codigo").value = "";
  $("#clave-nueva").value = "";
  $("#clave-repetir").value = "";
  setTimeout(cerrarVentanaClave, 1800);
}));

/* Tus passkeys: las del usuario (una por dispositivo o llavero), con
   Agregar para este dispositivo y Borrar. Se guardan en el dispositivo;
   Supabase solo guarda la parte pública. */
function errorTexto(error){
  return traducirError((error.code || "") + " " + (error.message || "") + " " + (error.name || ""));
}

async function pintarPasskeys(){
  const caja = document.getElementById("lista-passkeys");
  if (!caja) return;
  const { data, error } = await sb.auth.passkey.list();
  if (error){ caja.innerHTML = '<p class="vacio">' + escapar(errorTexto(error)) + '</p>'; return; }
  const lista = data || [];
  const cuando = t => t ? new Date(t).toLocaleDateString("es-CO", { day:"numeric", month:"short", year:"numeric" }) : "";
  caja.innerHTML = lista.length ? lista.map(p =>
    '<div class="passkey-fila"><span><b>' + escapar(p.friendly_name || "Passkey") + '</b>' +
    '<small>Creada el ' + escapar(cuando(p.created_at)) +
    (p.last_used_at ? ' · usada el ' + escapar(cuando(p.last_used_at)) : ' · sin usar todavía') + '</small></span>' +
    '<button type="button" class="boton-chico secundario" data-borrar-passkey="' + escapar(p.id) + '">Borrar</button></div>').join("")
    : '<p class="vacio">Todavía no tienes passkeys. Agrega la de este dispositivo.</p>';
}

$("#abrir-passkeys").addEventListener("click", () => {
  abrirMenu(false);
  abrirVentana({
    titulo: "Tus passkeys",
    guia: "Entra con tu huella, Face ID o el PIN de tu dispositivo, sin escribir la contraseña.",
    cuerpo:
      '<p class="mini explica">Una passkey es una llave que queda guardada en tu celular, tu computador o tu gestor de ' +
      'contraseñas (el llavero de iCloud, Google o 1Password), y se sincroniza entre tus dispositivos. Supabase solo ' +
      'guarda la parte pública: nadie puede copiarla ni adivinarla. Agrega una en cada dispositivo o llavero que uses; ' +
      'si pierdes uno, borra su passkey aquí.</p>' +
      '<div class="passkeys-lista" id="lista-passkeys"><p class="vacio">Cargando…</p></div>',
    aceptar: "Agregar passkey de este dispositivo",
    alAceptar: async () => {
      const { error } = await sb.auth.registerPasskey();
      if (error){ avisar(errorTexto(error), "mal", "#aviso-forma"); return false; }
      avisar("Listo: la próxima vez puedes entrar con «Entrar con passkey».", "ok", "#aviso-forma");
      await pintarPasskeys();
      return false;
    }
  });
  pintarPasskeys();
  document.getElementById("lista-passkeys").addEventListener("click", async e => {
    const b = e.target.closest("[data-borrar-passkey]");
    if (!b) return;
    if (b.dataset.confirmar !== "1"){ b.dataset.confirmar = "1"; b.textContent = "¿Seguro? Borrar"; return; }
    b.disabled = true;
    const { error } = await sb.auth.passkey.delete({ passkeyId: b.dataset.borrarPasskey });
    if (error){ b.disabled = false; avisar(errorTexto(error), "mal", "#aviso-forma"); return; }
    avisar("Passkey borrada.", "ok", "#aviso-forma");
    await pintarPasskeys();
  });
});

/* Arranque */
decidir();
