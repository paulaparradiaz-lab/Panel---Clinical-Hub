/* ============================================================
   CLINICAL HUB · NÚCLEO
   Cliente de Supabase, atajos, ventanas y utilidades comunes.
   Lo que comparten todas las pestañas del panel.
   ============================================================ */

/* La publishable key es pública por diseño. La sb_secret_... NUNCA va aquí. */
const SUPABASE_URL  = "https://pjpidtavlmqhogikizkm.supabase.co";
const SUPABASE_ANON = "sb_publishable_rnTlbtk9slMW9Oq2bKrdhg_EtOYRKjU";

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

export const $ = s => document.querySelector(s);

export const COLORES = { 1:"var(--s1)", 2:"var(--s2)", 3:"var(--s3)", 4:"var(--s4)", 5:"var(--s5)" };

/* Estado compartido entre pestañas */
export const estado = {
  usuario: null     // { id, correo }
};

/* ============================================================
   1. Texto, fechas y números
   ============================================================ */
export function escapar(t){
  return String(t == null ? "" : t).replace(/[&<>"']/g, c =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}

export function fecha(iso){
  /* Un feedback con fecha que la base no entendió llega sin fecha */
  if (!iso) return "sin fecha";
  return new Date(iso).toLocaleDateString("es-CO",
    { timeZone:"America/Bogota", day:"numeric", month:"short", year:"numeric" });
}

export function fechaCorta(iso){
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO",
    { timeZone:"America/Bogota", day:"numeric", month:"short" });
}

export const num = n => (n == null || Number.isNaN(Number(n))) ? "—" : Number(n).toLocaleString("es-CO");
export const dec = (n, d = 2) => (n == null || Number.isNaN(Number(n))) ? "—" : Number(n).toFixed(d);
export const pct = (a, b) => b ? Math.round(a / b * 100) : 0;

/* ============================================================
   2. Avisos y botones ocupados
   ============================================================ */
export function avisar(texto, tipo, donde = "#aviso"){
  const a = $(donde);
  if (!a) return;
  a.className = "aviso" + (tipo ? " " + tipo : "");
  a.textContent = texto || "";
}

export async function ocupado(boton, texto, fn){
  const original = boton.textContent;
  boton.disabled = true; boton.textContent = texto;
  try { await fn(); } finally { boton.disabled = false; boton.textContent = original; }
}

export function traducirError(msg){
  const m = String(msg || "").toLowerCase();
  if (m.includes("invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (m.includes("email not confirmed")) return "Ese usuario no está confirmado todavía.";
  if (m.includes("different from the old")) return "La nueva contraseña debe ser distinta de la actual.";
  if (m.includes("password should be") || m.includes("weak")) return "Esa contraseña es muy corta o muy débil.";
  if (m.includes("reauthentication") || m.includes("reauthenticate"))
    return "Por seguridad, cierra sesión, vuelve a entrar y cambia la contraseña enseguida.";
  if (m.includes("row-level security") || m.includes("row level security"))
    return "Tu sesión no tiene permiso para guardar esto. Verifica el código de tu app y vuelve a entrar.";
  if (m.includes("aal2")) return "Necesitas verificar tu código de la app antes de hacer esto.";
  if (m.includes("totp") || m.includes("invalid code") || m.includes("mfa"))
    return "Código incorrecto o vencido. Usa el que aparece ahora en la app.";
  if (m.includes("rate limit") || m.includes("too many")) return "Demasiados intentos seguidos. Espera un minuto.";
  if (m.includes("duplicate key")) return "Eso ya estaba registrado.";
  if (m.includes("failed to fetch")) return "Sin conexión con el servidor. Revisa tu internet.";
  return "No se pudo completar. Intenta de nuevo en un momento.";
}

/* ============================================================
   3. Ventana genérica de formularios
   ============================================================ */
export function cerrarVentana(){
  const v = $("#velo-forma");
  if (!v) return;
  v.hidden = true;
  v.innerHTML = "";
}

export function abrirVentana({ titulo, guia = "", cuerpo = "", aceptar = "Guardar", ancha = false, alAceptar }){
  const v = $("#velo-forma");
  v.innerHTML =
    '<div class="ventana' + (ancha ? " ancha" : "") + '" role="dialog" aria-modal="true" aria-label="' + escapar(titulo) + '">' +
      '<div class="mast"><h1>' + escapar(titulo) + '</h1></div>' +
      (guia ? '<p class="guia">' + escapar(guia) + '</p>' : '') +
      '<div class="forma">' + cuerpo + '</div>' +
      '<div class="ventana-botones">' +
        '<button class="boton secundario" data-cerrar>Cancelar</button>' +
        '<button class="boton" id="forma-ok">' + escapar(aceptar) + '</button>' +
      '</div>' +
      '<p class="aviso" id="aviso-forma" role="status"></p>' +
    '</div>';
  armarAyudaVentana(v.querySelector(".ventana"));
  v.hidden = false;
  v.querySelector("[data-cerrar]").onclick = cerrarVentana;
  v.onclick = e => { if (e.target === v) cerrarVentana(); };
  $("#forma-ok").onclick = () => ocupado($("#forma-ok"), "Guardando…", async () => {
    try {
      const salida = await alAceptar();
      if (salida !== false) cerrarVentana();
    } catch (err) {
      avisar(traducirError(err && err.message), "mal", "#aviso-forma");
    }
  });
  const primero = v.querySelector("input, textarea, select");
  if (primero) setTimeout(() => primero.focus(), 60);
}

/* Los textos que explican (.explica) no se ven de entrada: se juntan en
   un «¿Cómo funciona?» arriba a la derecha del título, como en las
   secciones del panel. Lo demás (datos, avisos) sigue a la vista. */
function armarAyudaVentana(ventana){
  const textos = ventana.querySelectorAll(".forma .explica");
  if (!textos.length) return;
  const mast = ventana.querySelector(".mast");
  const cabeza = document.createElement("div");
  cabeza.className = "cabeza-ventana";
  mast.before(cabeza);
  cabeza.appendChild(mast);
  const boton = document.createElement("button");
  boton.type = "button";
  boton.className = "enlace-ayuda";
  boton.setAttribute("aria-expanded", "false");
  boton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>¿Cómo funciona?';
  cabeza.appendChild(boton);
  const caja = document.createElement("div");
  caja.className = "ayuda-ventana";
  caja.hidden = true;
  textos.forEach(t => caja.appendChild(t));
  (ventana.querySelector("p.guia") || cabeza).after(caja);
  boton.onclick = () => {
    caja.hidden = !caja.hidden;
    boton.setAttribute("aria-expanded", String(!caja.hidden));
  };
}

/* Lee un campo del formulario abierto; devuelve null si está vacío */
export function leer(id){
  const e = document.getElementById(id);
  if (!e) return null;
  const valor = String(e.value || "").trim();
  return valor === "" ? null : valor;
}
