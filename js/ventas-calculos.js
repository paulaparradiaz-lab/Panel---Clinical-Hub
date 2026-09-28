/* ============================================================
   CLINICAL HUB · CÁLCULOS DE VENTAS Y SUSCRIPCIONES
   Todo se calcula aquí, a la vista, desde los avisos de Hotmart
   (tabla hotmart_eventos). Todo en US$ netos: lo que le queda a
   Clinical Hub después de Hotmart (parte de Paula × 2, coproducción 50/50).

   DEFINICIONES
   · Pago válido     cobro aprobado que NO se reembolsó ni tuvo contracargo.
                     Una compra reembolsada no cuenta como alta ni como baja.
   · Alta            el primer pago válido de una suscripción.
   · Baja            cancelación voluntaria, baja de Hotmart por pago fallido
                     o reembolso/contracargo de un cobro posterior. Si después
                     llega otro pago válido, la baja se deshace.
                     Un pago atrasado NO es baja (todavía puede pagar).
   · Vigente         dada de alta y sin baja (incluye atrasados). Base del churn.
   · Activa (al día) vigente y sin pago atrasado pendiente. Es la que suma al MRR.
   · MRR             suma del último pago válido de cada suscripción activa.
   · Segmento        fundadores = compraron con cupón «Miembro-fundador…»;
                     regulares = sin ese cupón.
   ============================================================ */

/* Umbrales de los semáforos y textos de las recomendaciones.
   Se editan aquí; las recomendaciones salen SOLO de estas reglas. */
export const BENCHMARKS = {
  churnMensual: {
    nombre: "Churn mensual",
    tramos: [
      { hasta: 0.05,  color: "verde",    texto: "Retención sana: puedes subir inversión en ads" },
      { hasta: 0.075, color: "amarillo", texto: "Revisa motivos de baja y refuerza correos de actualización" },
      { hasta: Infinity, color: "rojo",  texto: "No subas ads. Primero entiende por qué se van (encuesta de salida)" }
    ]
  },
  churnInvoluntario: {
    nombre: "Churn involuntario",
    tramos: [
      { hasta: 0.35, color: "verde", texto: null },
      { hasta: Infinity, color: "rojo", texto: "Activa reintentos de cobro y aviso antes de cancelar" }
    ]
  },
  churnMes1: {
    nombre: "Churn mes 1",
    tramos: [
      { hasta: 0.15, color: "verde", texto: null },
      { hasta: 0.25, color: "amarillo", texto: null },
      { hasta: Infinity, color: "rojo", texto: "Los nuevos se van rápido: revisa la bienvenida y qué guía ven primero" }
    ]
  },
  retencion12m: {
    nombre: "Retención a 12 meses",
    alReves: true,   // aquí más es mejor: los tramos van de abajo hacia arriba
    tramos: [
      { hasta: 0.45, color: "rojo", texto: "El valor no sostiene el año: prioriza modo práctica y guías más pedidas" },
      { hasta: 0.65, color: "amarillo", texto: null },
      { hasta: Infinity, color: "verde", texto: null }
    ]
  },
  ltvCac: {
    nombre: "LTV/CAC",
    alReves: true,
    tramos: [
      { hasta: 1, color: "rojo",     texto: "Cada médico cuesta más de lo que deja: pausa ese canal" },
      { hasta: 3, color: "amarillo", texto: "Baja el CAC (mejores anuncios) o sube el LTV (retención)" },
      { hasta: 5, color: "verde",    texto: "Economía sana: mantén y optimiza por canal" },
      { hasta: Infinity, color: "azul", texto: "Estás invirtiendo poco: escala el canal que mejor funcione" }
    ]
  },
  crecimientoMRR3m: {
    nombre: "Crecimiento MRR (3 meses)",
    alReves: true,
    tramos: [
      { hasta: 0, color: "rojo", texto: "Mira las barras: ¿faltan nuevos o sobran bajas? Actúa sobre esa" },
      { hasta: 0.05, color: "amarillo", texto: null },
      { hasta: Infinity, color: "verde", texto: null }
    ]
  }
};

/* «Sin datos suficientes»: hacen falta al menos 3 meses cerrados, y
   cada mes cuenta solo si arrancó con al menos 30 médicos vigentes
   (con menos, un solo médico mueve el porcentaje muchos puntos). */
export const MINIMO_MESES = 3;
export const MINIMO_BASE = 30;

const DIA = 864e5;
const TIPO_BAJA = {
  SUBSCRIPTION_CANCELLATION: "voluntaria",
  SUBSCRIPTION_INACTIVE: "pago_fallido",
  PURCHASE_REFUNDED: "reembolso",
  PURCHASE_CHARGEBACK: "reembolso"
};

/* ------------------------------------------------------------
   1. Modelo: pagos y suscripciones a partir de los avisos
   ------------------------------------------------------------ */
export function modelo(eventos){
  const ev = eventos.map(e => ({ ...e, t: +new Date(e.fecha) })).sort((a, b) => a.t - b.t);
  const devueltas = new Set(ev
    .filter(e => e.evento === "PURCHASE_REFUNDED" || e.evento === "PURCHASE_CHARGEBACK")
    .map(e => e.transaccion).filter(Boolean));
  const esPagoValido = e => e.evento === "PURCHASE_APPROVED" && !devueltas.has(e.transaccion);

  const porSus = new Map();
  ev.forEach(e => {
    if (!e.suscriptor) return;
    if (!porSus.has(e.suscriptor)) porSus.set(e.suscriptor, []);
    porSus.get(e.suscriptor).push(e);
  });

  const subs = [];
  porSus.forEach((lista, id) => {
    const pagos = lista.filter(esPagoValido).map(e => ({ t: e.t, valor: Number(e.neto_usd || 0) * 2, cobro: e.cobro_numero }));
    if (!pagos.length) return;                       // nunca pagó (o se le devolvió todo)
    const alta = pagos[0].t;
    const ultimoPago = pagos[pagos.length - 1].t;
    // Baja: el último aviso de baja posterior al alta, si no hubo pago válido después
    const bajaEv = lista.filter(e => TIPO_BAJA[e.evento] && e.t > alta).pop();
    const baja = bajaEv && bajaEv.t >= ultimoPago ? bajaEv.t : null;
    const atrasos = lista.filter(e => e.evento === "PURCHASE_DELAYED").map(e => e.t);
    const dato = campo => { for (let i = lista.length - 1; i >= 0; i--) if (lista[i][campo]) return lista[i][campo]; return null; };
    const fundador = lista.some(e => /^miembro-fundador/i.test(e.cupon || ""));
    subs.push({
      id, alta, baja, pagos, atrasos,
      motivoBaja: baja ? TIPO_BAJA[bajaEv.evento] : null,
      segmento: fundador ? "fundadores" : "regulares",
      nombre: dato("nombre"), correo: dato("correo"), telefono: dato("telefono"),
      pais: dato("pais"), plan: dato("plan")
    });
  });

  const pagos = ev.filter(esPagoValido).map(e => ({
    t: e.t, valor: Number(e.neto_usd || 0) * 2, nuevo: e.cobro_numero === 1,
    nombre: e.nombre, pais: e.pais, plan: e.plan, forma: e.forma_pago, suscriptor: e.suscriptor
  }));
  const reembolsos = ev.filter(e => e.evento === "PURCHASE_REFUNDED" || e.evento === "PURCHASE_CHARGEBACK")
    .map(e => ({ t: e.t, valor: Number(e.neto_usd || 0) * 2 }));
  return { subs, pagos, reembolsos };
}

export function filtrar(m, segmento){
  if (!segmento || segmento === "todos") return m;
  const ids = new Set(m.subs.filter(s => s.segmento === segmento).map(s => s.id));
  return {
    subs: m.subs.filter(s => ids.has(s.id)),
    pagos: m.pagos.filter(p => ids.has(p.suscriptor)),
    reembolsos: m.reembolsos
  };
}

/* ------------------------------------------------------------
   2. Estado de una suscripción en un momento dado
   ------------------------------------------------------------ */
export const vigente = (s, t) => s.alta <= t && (s.baja == null || s.baja > t);

/* Activa (al día): vigente y su último movimiento de cobro hasta t fue un
   pago, no un atraso. */
export function activa(s, t){
  if (!vigente(s, t)) return false;
  const pago = ultimoHasta(s.pagos.map(p => p.t), t);
  const atraso = ultimoHasta(s.atrasos, t);
  return pago != null && (atraso == null || atraso < pago);
}
function ultimoHasta(lista, t){
  let r = null;
  for (const x of lista) if (x <= t) r = x;
  return r;
}
function valorHasta(s, t){
  let v = 0;
  for (const p of s.pagos) if (p.t <= t) v = p.valor;
  return v;
}

/* MRR en un momento: suma del último pago de cada suscripción activa */
export function mrr(subs, t){
  let total = 0, activos = 0;
  subs.forEach(s => { if (activa(s, t)){ total += valorHasta(s, t); activos++; } });
  return { mrr: total, activos };
}

/* MRR diario entre dos fechas (un punto por día, al cierre del día) */
export function mrrDiario(subs, desde, hasta){
  const puntos = [];
  for (let t = finDelDia(desde); t <= finDelDia(hasta); t += DIA) puntos.push({ t, ...mrr(subs, t) });
  return puntos;
}

/* ------------------------------------------------------------
   3. Meses (hora de Colombia): movimientos, churn, MRR de cierre
   ------------------------------------------------------------ */
const ZONA = -5 * 3600e3;   // Colombia no cambia de hora
export const inicioMes = (anio, mes) => Date.UTC(anio, mes, 1) - ZONA;
export function finDelDia(t){
  const d = new Date(t + ZONA);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999) - ZONA;
}
export function claveMes(t){
  const d = new Date(t + ZONA);
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() };
}

export function meses(m, ahora){
  if (!m.subs.length) return [];
  const primero = claveMes(Math.min(...m.subs.map(s => s.alta)));
  const hoy = claveMes(ahora);
  const lista = [];
  for (let a = primero.anio, k = primero.mes; a < hoy.anio || (a === hoy.anio && k <= hoy.mes); k === 11 ? (a++, k = 0) : k++){
    const ini = inicioMes(a, k), fin = inicioMes(k === 11 ? a + 1 : a, (k + 1) % 12) - 1;
    const cerrado = fin < ahora;
    const nuevos = m.subs.filter(s => s.alta >= ini && s.alta <= fin);
    const bajas = m.subs.filter(s => s.baja != null && s.baja >= ini && s.baja <= fin);
    const vigentesInicio = m.subs.filter(s => vigente(s, ini - 1)).length;
    const cierre = mrr(m.subs, cerrado ? fin : ahora);
    lista.push({
      anio: a, mes: k, ini, fin, cerrado,
      nuevos: nuevos.length,
      bajas: bajas.length,
      bajasPagoFallido: bajas.filter(s => s.motivoBaja === "pago_fallido").length,
      neto: nuevos.length - bajas.length,
      vigentesInicio,
      // Churn mensual = bajas del mes ÷ vigentes al inicio del mes
      churn: vigentesInicio >= MINIMO_BASE ? bajas.length / vigentesInicio : null,
      mrr: cierre.mrr, activos: cierre.activos,
      ingresos: m.pagos.filter(p => p.t >= ini && p.t <= fin).reduce((x, p) => x + p.valor, 0)
    });
  }
  return lista;
}

/* ------------------------------------------------------------
   4. Indicadores (null = sin datos suficientes)
   ------------------------------------------------------------ */
export function indicadores(m, ahora, gastos){
  const lista = meses(m, ahora);
  const conDatos = lista.filter(x => x.cerrado && x.churn != null);
  const ultimos3 = conDatos.slice(-MINIMO_MESES);
  const hayTres = ultimos3.length >= MINIMO_MESES;
  const cerrados = lista.filter(x => x.cerrado);
  const ultimoCerrado = cerrados[cerrados.length - 1] || null;
  const hoy = mrr(m.subs, ahora);

  // Churn mensual: el del último mes cerrado con base suficiente; promedio de los 3 últimos para el LTV
  const churnMensual = hayTres ? ultimos3[ultimos3.length - 1].churn : null;
  const churnPromedio = hayTres ? ultimos3.reduce((x, y) => x + y.churn, 0) / ultimos3.length : null;

  // Churn involuntario: % de las bajas de los últimos 3 meses que fueron por pago fallido
  const bajas3 = ultimos3.reduce((x, y) => x + y.bajas, 0);
  const churnInvoluntario = hayTres && bajas3 ? ultimos3.reduce((x, y) => x + y.bajasPagoFallido, 0) / bajas3 : null;

  // Churn mes 1: de los que ya cumplieron su primer mes (en los últimos 90 días),
  // qué % se dio de baja dentro de ese primer mes
  const cumplieron = m.subs.filter(s => s.alta + 31 * DIA <= ahora && s.alta + 31 * DIA > ahora - 90 * DIA);
  const churnMes1 = cumplieron.length >= MINIMO_BASE
    ? cumplieron.filter(s => s.baja != null && s.baja <= s.alta + 31 * DIA).length / cumplieron.length : null;

  // ARPU = MRR ÷ activos (hoy)
  const arpu = hoy.activos ? hoy.mrr / hoy.activos : null;
  // LTV = ARPU ÷ churn promedio de los últimos 3 meses
  const ltv = arpu != null && churnPromedio ? arpu / churnPromedio : null;

  // CAC = gasto en anuncios del mes ÷ nuevos del mes (último mes cerrado)
  const gastoUltimo = ultimoCerrado ? gastoDelMes(gastos, ultimoCerrado) : null;
  const cac = gastoUltimo != null && ultimoCerrado.nuevos ? gastoUltimo / ultimoCerrado.nuevos : null;
  const ltvCac = ltv != null && cac ? ltv / cac : null;

  // Crecimiento MRR 3m = variación mensual promedio de los últimos 3 meses (4 cierres)
  const cierres = conDatos.slice(-(MINIMO_MESES + 1));
  let crecimientoMRR3m = null;
  if (cierres.length >= MINIMO_MESES + 1){
    const variaciones = [];
    for (let i = 1; i < cierres.length; i++) if (cierres[i - 1].mrr) variaciones.push(cierres[i].mrr / cierres[i - 1].mrr - 1);
    if (variaciones.length === MINIMO_MESES) crecimientoMRR3m = variaciones.reduce((x, y) => x + y, 0) / variaciones.length;
  }

  return {
    meses: lista, ultimoCerrado, hoy, arpu, ltv, cac, gastoUltimo, ltvCac,
    churnMensual, churnPromedio, churnInvoluntario, churnMes1, crecimientoMRR3m,
    cohortes: cohortes(m, ahora), mesesConDatos: conDatos.length
  };
}

export function gastoDelMes(gastos, mes){
  const g = (gastos || []).find(x => {
    const [a, k] = String(x.mes).split("-").map(Number);
    return a === mes.anio && k - 1 === mes.mes;
  });
  return g ? Number(g.monto_usd) : null;
}

/* Cohortes: por mes de alta, % todavía vigentes al cumplir 1, 3, 6 y 12 meses
   (solo si ese momento ya llegó). */
export const PASOS_COHORTE = [1, 3, 6, 12];
export function cohortes(m, ahora){
  const grupos = new Map();
  m.subs.forEach(s => {
    const c = claveMes(s.alta), k = c.anio * 12 + c.mes;
    if (!grupos.has(k)) grupos.set(k, { anio: c.anio, mes: c.mes, subs: [] });
    grupos.get(k).subs.push(s);
  });
  return [...grupos.values()].sort((a, b) => a.anio - b.anio || a.mes - b.mes).map(g => ({
    anio: g.anio, mes: g.mes, n: g.subs.length,
    pasos: PASOS_COHORTE.map(p => {
      const vivos = g.subs.filter(s => s.alta + p * 30.44 * DIA <= ahora);
      if (vivos.length < g.subs.length) return null;          // ese mes todavía no llega para todo el grupo
      return g.subs.filter(s => vigente(s, s.alta + p * 30.44 * DIA)).length / g.subs.length;
    })
  }));
}

/* ------------------------------------------------------------
   5. Semáforo y recomendaciones (solo desde BENCHMARKS)
   ------------------------------------------------------------ */
export function semaforo(clave, valor){
  if (valor == null) return null;
  const regla = BENCHMARKS[clave];
  const tramo = regla.tramos.find(x => valor < x.hasta) || regla.tramos[regla.tramos.length - 1];
  return { color: tramo.color, texto: tramo.texto, umbral: describirTramo(regla, tramo) };
}
function describirTramo(regla, tramo){
  const i = regla.tramos.indexOf(tramo);
  const bajo = i > 0 ? regla.tramos[i - 1].hasta : null;
  const f = x => (regla === BENCHMARKS.ltvCac ? x.toLocaleString("es-CO") : Math.round(x * 1000) / 10 + " %");
  if (bajo == null) return "menor que " + f(tramo.hasta);
  if (tramo.hasta === Infinity) return (regla.alReves ? "desde " : "mayor que ") + f(bajo);
  return "entre " + f(bajo) + " y " + f(tramo.hasta);
}

export function recomendaciones(ind){
  const valores = {
    churnMensual: ind.churnMensual,
    churnInvoluntario: ind.churnInvoluntario,
    churnMes1: ind.churnMes1,
    retencion12m: ultimaRetencion12(ind.cohortes),
    ltvCac: ind.ltvCac,
    crecimientoMRR3m: ind.crecimientoMRR3m
  };
  return Object.keys(valores).map(clave => {
    const valor = valores[clave];
    if (valor == null) return { clave, nombre: BENCHMARKS[clave].nombre, sinDatos: true };
    const s = semaforo(clave, valor);
    return { clave, nombre: BENCHMARKS[clave].nombre, valor, ...s };
  });
}
function ultimaRetencion12(lista){
  const con = lista.filter(c => c.pasos[3] != null && c.n >= MINIMO_BASE);
  return con.length ? con[con.length - 1].pasos[3] : null;
}

/* ------------------------------------------------------------
   6. Flujos de un rango libre y el periodo anterior de igual duración
   ------------------------------------------------------------ */
export function flujos(m, desde, hasta, gastos){
  const suma = (a, b) => ({
    altas: m.subs.filter(s => s.alta >= a && s.alta <= b).length,
    bajas: m.subs.filter(s => s.baja != null && s.baja >= a && s.baja <= b).length,
    ingresos: m.pagos.filter(p => p.t >= a && p.t <= b).reduce((x, p) => x + p.valor, 0),
    gasto: gastoEnRango(gastos, a, b)
  });
  const largo = hasta - desde;
  return { actual: suma(desde, hasta), anterior: suma(desde - largo - 1, desde - 1) };
}
/* El gasto se anota por mes: en un rango solo se cuenta si cubre meses completos */
function gastoEnRango(gastos, a, b){
  if (!gastos || !gastos.length) return null;
  let total = 0, alguno = false;
  gastos.forEach(g => {
    const [an, k] = String(g.mes).split("-").map(Number);
    const ini = inicioMes(an, k - 1), fin = inicioMes(k === 12 ? an + 1 : an, k % 12) - 1;
    if (ini >= a && fin <= b){ total += Number(g.monto_usd); alguno = true; }
  });
  return alguno ? total : null;
}
