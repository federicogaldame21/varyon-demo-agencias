/* Cumbrera · Viajes y Turismo — demo navegable.
   Simula en el navegador lo que en el proyecto real resuelve la base de datos
   (procedimientos, triggers y eventos). Sin backend: el estado vive en localStorage. */

const CASO_URL = "https://varyon.com.ar/";      // cambiar por la URL del caso de estudio
const KEY = "cumbrera-demo-v1";
const KEY_ROL = "cumbrera-demo-rol";
const VENDEDOR = "e2";      // Tomás, el vendedor con el que se prueba la vista móvil
const COORD = "e1";         // Valeria, coordinación

/* ---------------- Estado ---------------- */
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.version === 2) return s;
    }
  } catch (e) { /* almacenamiento no disponible */ }
  return crearDatosIniciales();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* sin persistencia */ }
}
function loadRol() {
  try { return localStorage.getItem(KEY_ROL) || "vendedor"; } catch (e) { return "vendedor"; }
}

let S = load();
const UI = {
  rol: loadRol(),
  vTab: "vender",
  cTab: "panel",
  cart: nuevoCarrito(),
  voucher: null,
  pagoAbierto: null,
  pago: { monto: "", medio: "efectivo" },
  vFiltro: "todas",
  rFiltro: "activas",
  q: "",
  arqueo: "",
  cierre: null,
  modal: null,
  m: {},
};

function nuevoCarrito() {
  return {
    modo: "existente", clienteId: "",
    nuevo: { nombre: "", apellido: "", dni: "", tel: "", origen: "Vía pública" },
    prod: "", sal: "", ad: "1", me: "0", inf: "0",
    alojamiento: "", items: [], acomp: [], cobro: null, medio: "efectivo",
    errAdd: null, err: null,
  };
}

/* ---------------- Utilidades ---------------- */
const now = () => Date.now() + S.reloj * 3600e3;
const nf = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const $$ = (n) => "$ " + nf.format(Math.round(n || 0));
const num = (v) => { const n = Number(String(v ?? "").replace(/[^\d.-]/g, "")); return isFinite(n) ? n : 0; };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const pad = (n) => String(n).padStart(2, "0");
function fdia(ts) { const d = new Date(ts); return `${DIAS[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; }
function fhora(ts) { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fecha(ts) { return `${fdia(ts)} · ${fhora(ts)}`; }
function relDia(ts) {
  const a = new Date(now()); a.setHours(0, 0, 0, 0);
  const b = new Date(ts); b.setHours(0, 0, 0, 0);
  const d = Math.round((b - a) / 864e5);
  if (d === 0) return "Hoy";
  if (d === 1) return "Mañana";
  if (d === -1) return "Ayer";
  return fdia(ts);
}
function horasHasta(ts) { return (ts - now()) / 3600e3; }
function fHoras(h) {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} días`;
}
const inicioHoy = () => { const d = new Date(now()); d.setHours(0, 0, 0, 0); return d.getTime(); };

const P = (id) => S.productos.find((x) => x.id === id);
const SAL = (id) => S.salidas.find((x) => x.id === id);
const PV = (id) => S.proveedores.find((x) => x.id === id);
const EMP = (id) => S.empleados.find((x) => x.id === id);
const CLI = (id) => S.clientes.find((x) => x.id === id);
const RES = (id) => S.reservas.find((x) => x.id === id);
const MEDIO = (id) => MEDIOS.find((x) => x.id === id);
const nombreCli = (c) => (c ? `${c.nombre} ${c.apellido}` : "—");

function audit(quien, accion, detalle) {
  S.auditoria.unshift({ fecha: now(), quien: EMP(quien)?.nombre || quien, accion, detalle });
}

/* ---------------- Reglas de negocio ---------------- */
const pax = (i) => num(i.adultos) + num(i.menores) + num(i.infantes);
const activa = (r) => r.estado === "PENDIENTE" || r.estado === "CONFIRMADA";
const total = (r) => r.items.reduce((a, i) => a + i.subtotal, 0);
const sena = (r) => Math.round(total(r) * CONFIG.pctSena);
const movsDe = (rid) => S.movimientos.filter((m) => m.reservaId === rid);
const pagado = (r) => movsDe(r.id).reduce((a, m) => a + (m.tipo === "cobro" ? m.base : m.tipo === "reintegro" ? -m.base : 0), 0);
const saldo = (r) => total(r) - pagado(r);
const cobrado = (m) => m.base * (1 + (m.recargo || 0));

function ocupados(sid, excluirRid) {
  return S.reservas.filter((r) => activa(r) && r.id !== excluirRid)
    .flatMap((r) => r.items)
    .filter((i) => i.salidaId === sid && i.cuentaCupo)
    .reduce((a, i) => a + pax(i), 0);
}
function libres(s) { return s.cupo == null ? null : s.cupo - ocupados(s.id); }

function estadoEnvio(s) {
  if (s.envio === "mayorista") return "mayorista";
  if (!s.proveedorId) return "sin_asignar";
  if (s.envio === "enviada") return ocupados(s.id) !== s.paxEnviados ? "reenviar" : "enviada";
  return "asignada";
}
function salidasPorEnviar(horas = 48) {
  return S.salidas.filter((s) => {
    const h = horasHasta(s.fecha);
    const e = estadoEnvio(s);
    return h > 0 && h <= horas && ocupados(s.id) > 0 && (e === "sin_asignar" || e === "asignada" || e === "reenviar");
  }).sort((a, b) => a.fecha - b.fecha);
}
const turnoAbierto = (eid) => S.turnos.find((t) => t.empleadoId === eid && !t.cierre);
const salidaDeReserva = (r) => SAL(r.items.find((i) => i.cuentaCupo)?.salidaId || r.items[0].salidaId);
const pideDni = (items) => items.some((i) => TIPOS[P(i.productoId).tipo].pideDni);
const pideAloj = (items) => items.some((i) => TIPOS[P(i.productoId).tipo].pideAlojamiento);

// Evento programado (ev_cancelar_vencidas): las pendientes sin seña vencen a las 48 h
function procesarVencimientos() {
  S.reservas.forEach((r) => {
    if (r.estado === "PENDIENTE" && r.vence <= now()) {
      r.estado = "VENCIDA";
      S.auditoria.unshift({ fecha: r.vence, quien: "Sistema", accion: "Reserva vencida", detalle: `${r.id} sin seña a las 48 h · se liberaron sus lugares (RN3)` });
    }
  });
}

// trg_cobro_confirma: si lo cobrado cubre la seña, pasa a CONFIRMADA
function revisarConfirmacion(r) {
  if (r.estado === "PENDIENTE" && pagado(r) >= sena(r)) r.estado = "CONFIRMADA";
}

function crearItem(productoId, salidaId, ad, me, inf) {
  const p = P(productoId), s = SAL(salidaId);
  const pvId = s?.proveedorId || p.proveedorFijo;
  const pv = pvId ? PV(pvId) : null;
  return {
    productoId, salidaId, adultos: ad, menores: me, infantes: inf,
    precioAdulto: p.adulto, precioMenor: p.menor,
    subtotal: ad * p.adulto + me * p.menor,
    // RN6: la comisión de la agencia queda fija al vender; si la salida no tiene
    // transportista todavía, se fija al asignarlo.
    pctAgencia: !p.comisionable ? 0 : pv ? pv.comision[p.tipo] || 0 : null,
    cuentaCupo: !p.vinculado,
  };
}

function registrarMovimiento(tipo, reservaId, empId, medio, base) {
  const t = turnoAbierto(empId);
  const m = { id: S.seq.movimiento++, tipo, reservaId, turnoId: t.id, empleadoId: empId, medio, base, recargo: tipo === "cobro" ? MEDIO(medio).recargo : 0, fecha: now() };
  S.movimientos.push(m);
  return m;
}

function cajaTurno(t) {
  const movs = S.movimientos.filter((m) => m.turnoId === t.id);
  const porMedio = {};
  MEDIOS.forEach((md) => (porMedio[md.id] = 0));
  let base = 0, reintegros = 0;
  movs.forEach((m) => {
    if (m.tipo === "cobro") { porMedio[m.medio] += cobrado(m); base += m.base; }
    if (m.tipo === "reintegro") { porMedio[m.medio] -= m.base; reintegros += m.base; }
  });
  const emp = EMP(t.empleadoId);
  const comision = Math.round(base * (emp.comision || 0)); // RN12
  const esperado = porMedio.efectivo - comision;             // efectivo a rendir
  const ventas = S.reservas.filter((r) => r.turnoId === t.id).length;
  return { porMedio, base, comision, esperado, reintegros, ventas, movs };
}

/* ---------------- Acciones ---------------- */
function abrirTurno(eid) {
  if (turnoAbierto(eid)) return;
  const t = { id: "t" + S.seq.turno++, empleadoId: eid, apertura: now(), cierre: null };
  S.turnos.push(t);
  audit(eid, "Apertura de turno", `Turno ${t.id}`);
}

function cerrarTurno(eid, contado) {
  const t = turnoAbierto(eid);
  const c = cajaTurno(t);
  t.cierre = now();
  t.efectivoContado = contado;
  t.diferencia = contado - c.esperado;
  audit(eid, "Cierre de turno", `Turno ${t.id} · esperado ${$$(c.esperado)} · contado ${$$(contado)} · ${t.diferencia === 0 ? "cuadra" : "diferencia " + $$(t.diferencia)}`);
  return t;
}

function cobrar(rid, empId, base, medio) {
  const r = RES(rid);
  if (!turnoAbierto(empId)) return "Abrí tu turno para registrar cobros.";
  if (!activa(r)) return "La reserva no está activa.";
  if (base <= 0) return "Ingresá un monto mayor a cero.";
  if (base > saldo(r)) return `El monto supera el saldo (${$$(saldo(r))}).`;
  const antes = r.estado;
  registrarMovimiento("cobro", rid, empId, medio, base);
  revisarConfirmacion(r);
  audit(empId, "Cobro", `${rid} · ${$$(base)} en ${MEDIO(medio).nombre.toLowerCase()}${antes !== r.estado ? " · pasó a confirmada" : ""}`);
  return null;
}

function cancelarReserva(rid, { excepcion, motivo }) {
  const r = RES(rid);
  const h = horasHasta(salidaDeReserva(r).fecha);
  const pag = pagado(r);
  const corresponde = h >= CONFIG.horasCancelacion; // RN4
  const reintegra = pag > 0 && (corresponde || excepcion);
  if (!corresponde && excepcion && !motivo.trim()) return "La excepción necesita un motivo.";
  if (reintegra) {
    if (!turnoAbierto(COORD)) abrirTurno(COORD);
    // se devuelve por el mismo medio con que se cobró
    const porMedio = {};
    movsDe(rid).forEach((m) => {
      porMedio[m.medio] = (porMedio[m.medio] || 0) + (m.tipo === "cobro" ? m.base : -m.base);
    });
    Object.entries(porMedio).forEach(([medio, monto]) => { if (monto > 0) registrarMovimiento("reintegro", rid, COORD, medio, monto); });
  }
  r.estado = "CANCELADA";
  r.cancelacion = { fecha: now(), motivo: motivo.trim(), reintegro: reintegra ? pag : 0, excepcion: !corresponde && excepcion };
  audit(COORD, "Cancelación", `${rid} · ${reintegra ? "reintegro " + $$(pag) : "sin reintegro"}${!corresponde && excepcion ? " · excepción: " + motivo.trim() : ""}`);
  return null;
}

function mensajeLista(s) {
  const p = P(s.productoId);
  const pv = PV(s.proveedorId);
  const conDni = TIPOS[p.tipo].pideDni;
  const lineas = [];
  S.reservas.filter(activa).forEach((r) => {
    if (!r.items.some((i) => i.salidaId === s.id && i.cuentaCupo)) return;
    const cli = CLI(r.clienteId);
    const n = r.items.filter((i) => i.salidaId === s.id && i.cuentaCupo).reduce((a, i) => a + pax(i), 0);
    lineas.push(`• ${r.id} · ${r.pasajeros[0]?.nombre || nombreCli(cli)} (${n} pax) · ${cli?.tel || ""}${r.alojamiento ? " · sale de " + r.alojamiento : ""}`);
    if (conDni) r.pasajeros.forEach((ps) => lineas.push(`   ${ps.nombre} · DNI ${ps.dni || "—"}`));
  });
  return `Hola ${pv?.nombre || ""}, te paso la lista de ${p.nombre} del ${fecha(s.fecha)}.\nPasajeros: ${ocupados(s.id)}\n${lineas.join("\n")}\n\nAsistencia: cumbrera.app/s/${s.id}`;
}

/* ---------------- Venta (carrito) ---------------- */
function paxCarrito(c) { return c.items.filter((i) => i.cuentaCupo).reduce((a, i) => Math.max(a, pax(i)), 0); }
function totalCarrito(c) { return c.items.reduce((a, i) => a + i.subtotal, 0); }
function cobroCarrito(c) { return c.cobro === null ? Math.round(totalCarrito(c) * CONFIG.pctSena) : num(c.cobro); }
function enCarrito(c, sid) { return c.items.filter((i) => i.salidaId === sid && i.cuentaCupo).reduce((a, i) => a + pax(i), 0); }

function agregarItem() {
  const c = UI.cart;
  c.errAdd = null;
  const s = SAL(c.sal);
  const ad = num(c.ad), me = num(c.me), inf = num(c.inf);
  if (!c.prod) return (c.errAdd = "Elegí un viaje o servicio.");
  if (!s) return (c.errAdd = "Elegí la salida.");
  if (ad + me < 1) return (c.errAdd = "Tiene que viajar al menos un adulto o un menor.");
  const lib = libres(s);
  const quiere = ad + me + inf + enCarrito(c, s.id);
  if (lib !== null && quiere > lib) return (c.errAdd = `No hay cupo: quedan ${lib} lugares en esa salida (RN5).`);
  const p = P(c.prod);
  c.items.push(crearItem(p.id, s.id, ad, me, inf));
  if (p.seguroVinculado) c.items.push(crearItem(p.seguroVinculado, s.id, ad, me, 0)); // RN7
  c.prod = ""; c.sal = ""; c.ad = "1"; c.me = "0"; c.inf = "0";
}

function quitarItem(idx) {
  const c = UI.cart;
  const it = c.items[idx];
  c.items = c.items.filter((x, i) => i !== idx && !(it.cuentaCupo && !x.cuentaCupo && x.salidaId === it.salidaId));
}

function registrarVenta() {
  const c = UI.cart;
  c.err = null;
  if (!turnoAbierto(VENDEDOR)) return (c.err = "El vendedor tiene que abrir su turno antes de vender.");
  let cli = null;
  if (c.modo === "existente") {
    cli = CLI(c.clienteId);
    if (!cli) return (c.err = "Elegí el cliente o cargalo como nuevo.");
  } else {
    const n = c.nuevo;
    if (!n.nombre.trim() || !n.apellido.trim() || !n.dni.trim() || !n.tel.trim()) return (c.err = "Para un cliente nuevo hacen falta nombre, apellido, documento y teléfono.");
    if (S.clientes.some((x) => x.dni.replace(/\D/g, "") === n.dni.replace(/\D/g, ""))) return (c.err = "Ese documento ya está cargado: elegilo en «Ya es cliente».");
  }
  if (!c.items.length) return (c.err = "Agregá al menos un viaje o servicio al ticket.");
  // control de cupo al confirmar (en la base: SELECT … FOR UPDATE)
  for (const i of c.items.filter((x) => x.cuentaCupo)) {
    const s = SAL(i.salidaId), lib = libres(s);
    if (lib !== null && enCarrito(c, s.id) > lib) return (c.err = `Mientras armabas la venta se ocupó la salida: quedan ${lib} lugares.`);
  }
  if (pideAloj(c.items) && !c.alojamiento.trim()) return (c.err = "Falta el punto de partida o alojamiento (RN8).");
  const nPax = paxCarrito(c);
  const necesitaDni = pideDni(c.items);
  for (let k = 0; k < nPax - 1; k++) {
    const a = c.acomp[k] || {};
    if (!String(a.nombre || "").trim()) return (c.err = `Falta el nombre del acompañante ${k + 1}.`);
    if (necesitaDni && !String(a.dni || "").trim()) return (c.err = `Falta el DNI del acompañante ${k + 1}: este viaje lo pide (RN8).`);
  }
  const tot = totalCarrito(c), cob = cobroCarrito(c);
  if (cob < 0 || cob > tot) return (c.err = "El cobro no puede superar el total.");

  if (!cli) {
    const n = c.nuevo;
    cli = { id: "c" + S.seq.cliente++, nombre: n.nombre.trim(), apellido: n.apellido.trim(), dni: n.dni.trim(), tel: n.tel.trim(), origen: n.origen, alta: now() };
    S.clientes.push(cli);
  }
  const r = {
    id: "R-" + S.seq.reserva++, clienteId: cli.id, vendedorId: VENDEDOR, turnoId: turnoAbierto(VENDEDOR).id,
    creada: now(), vence: now() + CONFIG.horasVencimiento * 3600e3, estado: "PENDIENTE",
    alojamiento: c.alojamiento.trim(), items: c.items,
    pasajeros: [{ nombre: nombreCli(cli), dni: cli.dni }, ...c.acomp.slice(0, nPax - 1).map((a) => ({ nombre: a.nombre.trim(), dni: (a.dni || "").trim() }))],
  };
  S.reservas.push(r);
  if (cob > 0) registrarMovimiento("cobro", r.id, VENDEDOR, c.medio, cob);
  revisarConfirmacion(r);
  audit(VENDEDOR, "Venta", `${r.id} · ${nombreCli(cli)} · ${$$(tot)} · ${r.estado === "CONFIRMADA" ? "confirmada" : "pendiente de seña"}`);
  UI.voucher = r.id;
  UI.cart = nuevoCarrito();
  return null;
}

/* ---------------- Íconos y piezas ---------------- */
const LOGO = `<svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="11" fill="#1e5b5a"/><circle cx="27" cy="14" r="5" fill="#e8833a"/><path d="M4 31 14.5 17l6 8 5-6L36 31Z" fill="#fff"/></svg>`;
const ICON = {
  vender: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  reservas: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>`,
  turno: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 15h2"/></svg>`,
};

function badgeEstado(r) {
  const map = { PENDIENTE: ["b-warn", "Pendiente de seña"], CONFIRMADA: ["b-ok", "Confirmada"], VENCIDA: ["b-mute", "Vencida"], CANCELADA: ["b-danger", "Cancelada"] };
  const [cls, txt] = map[r.estado];
  return `<span class="badge ${cls}">${txt}</span>`;
}
function badgeEnvio(s) {
  const e = estadoEnvio(s);
  const map = {
    sin_asignar: ["b-danger", "Sin asignar"], asignada: ["b-warn", "Asignada · sin enviar"],
    enviada: ["b-ok", "Enviada"], reenviar: ["b-warn", "Hay cambios · reenviar"], mayorista: ["b-brand", "Cupo del mayorista"],
  };
  const [cls, txt] = map[e];
  return `<span class="badge ${cls}">${txt}</span>`;
}
function resumenItem(i) {
  const p = [];
  if (num(i.adultos)) p.push(`${i.adultos} ${num(i.adultos) === 1 ? "adulto" : "adultos"}`);
  if (num(i.menores)) p.push(`${i.menores} ${num(i.menores) === 1 ? "menor" : "menores"}`);
  if (num(i.infantes)) p.push(`${i.infantes} ${num(i.infantes) === 1 ? "infante" : "infantes"}`);
  return p.join(" · ");
}
function opt(v, label, sel) { return `<option value="${esc(v)}"${String(sel) === String(v) ? " selected" : ""}>${esc(label)}</option>`; }

/* ======================================================================
   VISTA VENDEDOR (celular)
   ====================================================================== */
function vVendedor() {
  const emp = EMP(VENDEDOR);
  const t = turnoAbierto(VENDEDOR);
  const titulos = { vender: "Nueva venta", reservas: "Mis reservas", turno: "Mi turno" };
  const pend = S.reservas.filter((r) => r.vendedorId === VENDEDOR && r.estado === "PENDIENTE").length;
  let body = "";
  if (UI.vTab === "vender") body = vVender(t);
  if (UI.vTab === "reservas") body = vMisReservas(t);
  if (UI.vTab === "turno") body = vMiTurno(t);
  const tab = (id, label, extra = "") => `<button data-act="vTab" data-v="${id}" aria-current="${UI.vTab === id}">${ICON[id]}<span>${label}${extra}</span></button>`;
  return `
  <div class="vendor-stage">
    <div class="phone">
      <div class="phone-top">
        <h2>${titulos[UI.vTab]}</h2>
        <div class="who">${esc(emp.nombre)}<br>${t ? '<span style="color:var(--ok)">● turno abierto</span>' : "turno cerrado"}</div>
      </div>
      <div class="phone-body" id="pbody">${body}</div>
      <nav class="tabbar">
        ${tab("vender", "Vender")}
        ${tab("reservas", "Reservas", pend ? ` <span class="count">${pend}</span>` : "")}
        ${tab("turno", "Mi turno")}
      </nav>
    </div>
    ${notasVendedor()}
  </div>`;
}

function notasVendedor() {
  return `
  <aside class="side-notes">
    <div class="card">
      <h4>Qué probar</h4>
      <ol>
        <li>Vendé el <b>catamarán</b>: el seguro náutico se suma solo y no comisiona.</li>
        <li>Registrá una venta <b>sin cobro</b>: queda pendiente y vence a las 48 h. Con <b>+12 h</b> en la barra superior ves cómo vence.</li>
        <li>Intentá vender <b>5 pasajeros</b> en el traslado al aeropuerto: tiene 4 butacas.</li>
        <li>En <b>Reservas</b>, cobrá el saldo de una pendiente: al cubrir el 35 % se confirma sola.</li>
        <li>En <b>Mi turno</b>, cerrá la caja y arqueá el efectivo.</li>
        <li>Pasá a <b>Coordinación</b> para asignar transportistas y enviar las listas.</li>
      </ol>
    </div>
    <div class="card">
      <h4>Reglas que aplica</h4>
      <p class="rule">Seña mínima del 35 % · vencimiento a las 48 h · sin sobreventa de butacas · comisión del vendedor del 12 % sobre lo cobrado · recargo por medio de pago · turno cerrado sin edición.</p>
    </div>
    <p class="hint" style="margin-top:12px">Datos ficticios. Lo que cargues queda guardado solo en este navegador.</p>
  </aside>`;
}

function vVender(t) {
  if (!t) {
    return `<div class="alert warn">Para vender tenés que abrir tu turno. El turno es tu jornada de caja: se abre al empezar y se cierra con «Fin del día».</div>
      <button class="btn primary block" data-act="abrirTurnoV">Abrir turno</button>`;
  }
  if (UI.voucher) return vVoucher(RES(UI.voucher));
  const c = UI.cart;
  const clientes = [...S.clientes].sort((a, b) => a.apellido.localeCompare(b.apellido));
  const vendibles = S.productos.filter((p) => !p.vinculado);
  const salidasProd = c.prod ? S.salidas.filter((s) => s.productoId === c.prod && s.fecha > now()).sort((a, b) => a.fecha - b.fecha) : [];
  const pSel = c.prod ? P(c.prod) : null;

  let html = `
  <div class="card">
    <h3><span class="step">1</span>Cliente</h3>
    <div class="seg">
      <button data-act="cartModo" data-v="existente" aria-pressed="${c.modo === "existente"}">Ya es cliente</button>
      <button data-act="cartModo" data-v="nuevo" aria-pressed="${c.modo === "nuevo"}">Cliente nuevo</button>
    </div>`;
  if (c.modo === "existente") {
    html += `
    <div class="field"><label for="cli">Buscar por nombre o documento</label>
      <select id="cli" data-bind="cart.clienteId" data-rr>
        ${opt("", "Elegí un cliente…", c.clienteId)}
        ${clientes.map((x) => opt(x.id, `${x.apellido}, ${x.nombre} · ${x.dni}`, c.clienteId)).join("")}
      </select></div>
    <p class="hint">Si no existe, se carga como cliente nuevo acá mismo.</p>`;
  } else {
    html += `
    <div class="row c2">
      <div class="field"><label>Nombre</label><input data-bind="cart.nuevo.nombre" value="${esc(c.nuevo.nombre)}" autocomplete="off"></div>
      <div class="field"><label>Apellido</label><input data-bind="cart.nuevo.apellido" value="${esc(c.nuevo.apellido)}" autocomplete="off"></div>
    </div>
    <div class="row c2">
      <div class="field"><label>Documento</label><input data-bind="cart.nuevo.dni" value="${esc(c.nuevo.dni)}" inputmode="numeric" autocomplete="off"></div>
      <div class="field"><label>Teléfono</label><input data-bind="cart.nuevo.tel" value="${esc(c.nuevo.tel)}" inputmode="tel" autocomplete="off"></div>
    </div>
    <div class="field"><label>¿Cómo llegó?</label>
      <select data-bind="cart.nuevo.origen">${["Vía pública", "WhatsApp", "Oficina"].map((o) => opt(o, o, c.nuevo.origen)).join("")}</select></div>`;
  }
  html += `</div>

  <div class="card">
    <h3><span class="step">2</span>Agregar viaje o servicio</h3>
    <div class="prod-pick" role="list">
      ${vendibles.map((p) => `<button class="pp" role="listitem" data-act="cartProd" data-v="${p.id}" aria-pressed="${c.prod === p.id}">
        ${p.foto ? `<img src="${p.foto}" alt="" loading="lazy">` : ""}<span class="pp-t">${esc(p.nombre)}</span><span class="pp-p">${TIPOS[p.tipo].nombre} · desde ${$$(p.adulto)}</span></button>`).join("")}
    </div>
    <div class="field"><label>Producto</label>
      <select data-bind="cart.prod" data-rr data-reset="sal">
        ${opt("", "Elegí qué vende…", c.prod)}
        ${vendibles.map((p) => opt(p.id, `${p.nombre} · ${TIPOS[p.tipo].nombre}`, c.prod)).join("")}
      </select></div>
    <div class="field"><label>Salida</label>
      <select data-bind="cart.sal" ${c.prod ? "" : "disabled"}>
        ${opt("", c.prod ? "Elegí la fecha…" : "Primero elegí el producto", c.sal)}
        ${salidasProd.map((s) => {
          const lib = libres(s);
          const queda = lib === null ? null : lib - enCarrito(c, s.id);
          return opt(s.id, `${relDia(s.fecha)} ${fhora(s.fecha)} · ${queda === null ? "cupo del mayorista" : queda + " lugares libres"}`, c.sal);
        }).join("")}
      </select></div>
    <div class="row c3">
      <div class="field"><label>Adultos</label><input type="number" min="0" data-bind="cart.ad" value="${esc(c.ad)}"></div>
      <div class="field"><label>Menores</label><input type="number" min="0" data-bind="cart.me" value="${esc(c.me)}"></div>
      <div class="field"><label>Infantes</label><input type="number" min="0" data-bind="cart.inf" value="${esc(c.inf)}"></div>
    </div>
    ${pSel ? `<p class="hint" style="margin-bottom:10px">Adulto ${$$(pSel.adulto)} · Menor ${$$(pSel.menor)} · Infante sin cargo${pSel.seguroVinculado ? " · suma seguro náutico obligatorio" : ""}</p>` : ""}
    ${c.errAdd ? `<div class="alert danger">${esc(c.errAdd)}</div>` : ""}
    <button class="btn block" data-act="addItem">Agregar al ticket</button>
  </div>`;

  if (c.items.length) {
    const tot = totalCarrito(c);
    html += `
    <div class="card">
      <h3><span class="step">3</span>Ticket</h3>
      ${c.items.map((i, idx) => {
        const p = P(i.productoId), s = SAL(i.salidaId);
        return `<div class="line-item"><div><div class="t">${esc(p.nombre)}</div>
          <div class="s">${resumenItem(i)}${s ? " · " + relDia(s.fecha) + " " + fhora(s.fecha) : ""}${p.comisionable ? "" : " · no comisiona"}</div>
          ${i.cuentaCupo ? `<button class="x" data-act="rmItem" data-i="${idx}">Quitar</button>` : ""}</div>
          <div class="money t">${$$(i.subtotal)}</div></div>`;
      }).join("")}
      <div class="kv total"><span>Total</span><span class="money">${$$(tot)}</span></div>
      <div class="kv"><span class="muted">Seña mínima para confirmar (35 %)</span><span class="money">${$$(Math.round(tot * CONFIG.pctSena))}</span></div>
    </div>`;

    const nPax = paxCarrito(c);
    while (c.acomp.length < nPax - 1) c.acomp.push({ nombre: "", dni: "" });
    const dni = pideDni(c.items);
    const titular = c.modo === "existente" ? CLI(c.clienteId) : c.nuevo;
    const cob = cobroCarrito(c);
    const md = MEDIO(c.medio);
    html += `
    <div class="card">
      <h3><span class="step">4</span>Pasajeros y cobro</h3>
      ${pideAloj(c.items) ? `<div class="field"><label>Punto de partida o alojamiento</label><input data-bind="cart.alojamiento" value="${esc(c.alojamiento)}" placeholder="Ej.: Hotel, cabañas o dirección"></div>` : ""}
      <p class="hint" style="margin-bottom:10px">Titular: <b>${titular && (titular.nombre || titular.apellido) ? esc(`${titular.nombre} ${titular.apellido}`) : "elegí el cliente arriba"}</b>${nPax > 1 ? ` · ${nPax - 1} acompañante${nPax > 2 ? "s" : ""}` : ""}</p>
      ${c.acomp.slice(0, nPax - 1).map((a, k) => `
        <div class="${dni ? "row c2" : ""}">
          <div class="field"><label>Acompañante ${k + 1}</label><input data-bind="cart.acomp.${k}.nombre" value="${esc(a.nombre)}" placeholder="Nombre y apellido"></div>
          ${dni ? `<div class="field"><label>DNI</label><input data-bind="cart.acomp.${k}.dni" value="${esc(a.dni)}" inputmode="numeric"></div>` : ""}
        </div>`).join("")}
      ${dni ? `<p class="hint" style="margin:-4px 0 10px">Este viaje pide DNI de cada pasajero (seguro de transporte).</p>` : ""}
      <div class="row c2">
        <div class="field"><label>Cobra ahora</label><input type="number" min="0" step="1000" data-bind="cart.cobro" data-rr value="${cob}"></div>
        <div class="field"><label>Medio</label><select data-bind="cart.medio" data-rr>
          ${MEDIOS.map((m) => opt(m.id, m.nombre + (m.recargo ? ` (+${Math.round(m.recargo * 100)} %)` : ""), c.medio)).join("")}</select></div>
      </div>
      ${md.recargo && cob ? `<p class="hint" style="margin:-4px 0 10px">Con recargo se cobran <b>${$$(cob * (1 + md.recargo))}</b>; a la reserva se imputan ${$$(cob)}.</p>` : ""}
      <div class="alert ${cob >= Math.round(totalCarrito(c) * CONFIG.pctSena) ? "ok" : "warn"}">${
        cob >= Math.round(totalCarrito(c) * CONFIG.pctSena)
          ? "Con este cobro la reserva queda <b>confirmada</b>."
          : cob > 0 ? "No cubre la seña: queda <b>pendiente</b> y vence en 48 h si no se completa." : "Sin cobro, la reserva queda <b>pendiente</b> y vence a las 48 h."
      }</div>
      ${c.err ? `<div class="alert danger">${esc(c.err)}</div>` : ""}
      <button class="btn primary block" data-act="registrarVenta">Registrar venta</button>
    </div>`;
  }
  return html;
}

function vVoucher(r) {
  const cli = CLI(r.clienteId);
  return `
  <div class="alert ok">Venta registrada. Cada dato se cargó una sola vez: ya está en tu caja, en la lista del transportista y en los reportes.</div>
  <div class="voucher">
    ${(() => { const f = r.items.map((i) => P(i.productoId).foto).find(Boolean); return f ? `<img class="voucher-foto" src="${f}" alt="">` : ""; })()}
    <div class="voucher-head">
      <div><div style="font-size:12px;opacity:.8">Voucher digital</div><div class="code">${r.id}</div></div>
      <div style="width:40px">${LOGO.replace('fill="#1e5b5a"', 'fill="#ffffff22"')}</div>
    </div>
    <div class="voucher-body">
      <div class="resv-head"><b>${esc(nombreCli(cli))}</b>${badgeEstado(r)}</div>
      ${r.items.map((i) => { const p = P(i.productoId), s = SAL(i.salidaId); return `<div class="line-item"><div><div class="t">${esc(p.nombre)}</div><div class="s">${resumenItem(i)}${s ? " · " + fecha(s.fecha) : ""}</div></div><div class="money">${$$(i.subtotal)}</div></div>`; }).join("")}
      ${r.alojamiento ? `<p class="hint" style="margin-top:6px">Sale de: ${esc(r.alojamiento)}</p>` : ""}
      <p class="hint">Pasajeros: ${r.pasajeros.map((p) => esc(p.nombre)).join(", ")}</p>
    </div>
    <div class="voucher-cut"></div>
    <div class="voucher-body">
      <div class="kv"><span>Total</span><span class="money">${$$(total(r))}</span></div>
      <div class="kv"><span>Pagado</span><span class="money">${$$(pagado(r))}</span></div>
      <div class="kv total"><span>Saldo</span><span class="money">${$$(saldo(r))}</span></div>
      ${r.estado === "PENDIENTE" ? `<p class="hint warn" style="margin-top:6px">Se confirma con ${$$(sena(r))}. Vence el ${fecha(r.vence)}.</p>` : ""}
    </div>
  </div>
  <div style="display:grid;gap:8px;margin-top:12px">
    <button class="btn" data-act="compartir">Enviar voucher por WhatsApp</button>
    <button class="btn primary" data-act="nuevaVenta">Nueva venta</button>
  </div>`;
}

function vMisReservas(t) {
  let lista = S.reservas.filter((r) => r.vendedorId === VENDEDOR).sort((a, b) => b.creada - a.creada);
  const f = UI.vFiltro;
  if (f === "pendientes") lista = lista.filter((r) => r.estado === "PENDIENTE");
  if (f === "confirmadas") lista = lista.filter((r) => r.estado === "CONFIRMADA");
  if (f === "otras") lista = lista.filter((r) => !activa(r));
  const chip = (id, l) => `<button data-act="vFiltro" data-v="${id}" aria-pressed="${f === id}">${l}</button>`;
  return `
  <div class="seg">${chip("todas", "Todas")}${chip("pendientes", "Pendientes")}${chip("confirmadas", "Confirmadas")}${chip("otras", "Vencidas")}</div>
  ${lista.length ? lista.map((r) => cardReserva(r, t)).join("") : `<div class="empty">No hay reservas en este filtro.</div>`}`;
}

function cardReserva(r, t) {
  const cli = CLI(r.clienteId);
  const principal = r.items.find((i) => i.cuentaCupo) || r.items[0];
  const s = SAL(principal.salidaId);
  const h = horasHasta(r.vence);
  const abierto = UI.pagoAbierto === r.id;
  return `
  <div class="resv">
    <div class="resv-head"><span class="code">${r.id}</span>${badgeEstado(r)}</div>
    <div class="name">${esc(nombreCli(cli))}</div>
    <div class="prod">${esc(P(principal.productoId).nombre)} · ${relDia(s.fecha)} ${fhora(s.fecha)}</div>
    ${r.estado === "PENDIENTE" ? `<p class="hint warn" style="margin-top:4px">Vence en ${fHoras(h)} · se confirma con ${$$(sena(r))}</p>` : ""}
    <div class="nums"><div>Total<b class="money">${$$(total(r))}</b></div><div>Pagado<b class="money">${$$(pagado(r))}</b></div><div>Saldo<b class="money">${$$(saldo(r))}</b></div></div>
    ${activa(r) && saldo(r) > 0 ? (abierto ? `
      <div class="pay-inline">
        <div class="row c2">
          <div class="field"><label>Monto</label><input type="number" min="0" step="1000" data-bind="pago.monto" value="${esc(UI.pago.monto)}"></div>
          <div class="field"><label>Medio</label><select data-bind="pago.medio">${MEDIOS.map((m) => opt(m.id, m.nombre + (m.recargo ? ` (+${Math.round(m.recargo * 100)} %)` : ""), UI.pago.medio)).join("")}</select></div>
        </div>
        <div class="row c2"><button class="btn" data-act="cerrarPago">Cancelar</button><button class="btn primary" data-act="confirmarPago" data-id="${r.id}">Registrar cobro</button></div>
      </div>` : `<div style="margin-top:10px"><button class="btn sm" data-act="abrirPago" data-id="${r.id}" ${t ? "" : "disabled title='Abrí tu turno para cobrar'"}>Cobrar saldo</button></div>`) : ""}
  </div>`;
}

function vMiTurno(t) {
  if (!t) {
    const ult = S.turnos.filter((x) => x.empleadoId === VENDEDOR && x.cierre).sort((a, b) => b.cierre - a.cierre)[0];
    let html = "";
    if (ult) {
      const c = cajaTurno(ult);
      const d = ult.diferencia;
      html += `
      <div class="card">
        <h3>Último cierre · ${relDia(ult.cierre)} ${fhora(ult.cierre)}</h3>
        <div class="kv"><span>Cobrado</span><span class="money">${$$(c.base)}</span></div>
        <div class="kv"><span>Tu comisión (12 %)</span><span class="money">${$$(c.comision)}</span></div>
        <div class="kv"><span>Efectivo a rendir</span><span class="money">${$$(c.esperado)}</span></div>
        <div class="kv"><span>Efectivo contado</span><span class="money">${$$(ult.efectivoContado)}</span></div>
        <div class="kv total"><span>Diferencia</span><span>${d === 0 ? '<span class="badge b-ok">Cuadra</span>' : `<span class="badge b-danger">${d > 0 ? "Sobran" : "Faltan"} ${$$(Math.abs(d))}</span>`}</span></div>
        <p class="hint" style="margin-top:8px">Después del cierre, solo la coordinación puede corregir.</p>
      </div>`;
    }
    return html + `<div class="alert info" style="margin-top:12px">Tu turno está cerrado.</div><button class="btn primary block" data-act="abrirTurnoV">Abrir turno</button>`;
  }
  const c = cajaTurno(t);
  const pendientes = salidasPorEnviar(48);
  return `
  ${pendientes.length ? `<div class="alert warn">⚠ ${pendientes.length} ${pendientes.length === 1 ? "salida con pasajeros todavía no fue enviada" : "salidas con pasajeros todavía no fueron enviadas"} al transportista: ${pendientes.map((s) => `${esc(P(s.productoId).nombre)} ${relDia(s.fecha).toLowerCase()} ${fhora(s.fecha)}`).join("; ")}. Avisale a coordinación.</div>` : `<div class="alert ok">Todas las salidas con pasajeros de las próximas 48 h están enviadas.</div>`}
  <div class="card">
    <h3>Turno abierto desde las ${fhora(t.apertura)}</h3>
    <div class="kv"><span>Ventas del turno</span><span>${c.ventas}</span></div>
    <div class="kv"><span>Cobrado</span><span class="money">${$$(c.base)}</span></div>
    <div class="kv"><span>Tu comisión (12 %)</span><span class="money">${$$(c.comision)}</span></div>
    <div class="kv total"><span>Efectivo a rendir</span><span class="money">${$$(c.esperado)}</span></div>
  </div>
  <div class="card">
    <h3>Caja por medio</h3>
    ${MEDIOS.map((m) => `<div class="kv"><span>${m.nombre}${m.recargo ? ` <span class="muted">(+${Math.round(m.recargo * 100)} %)</span>` : ""}</span><span class="money">${$$(c.porMedio[m.id])}</span></div>`).join("")}
  </div>
  <div class="card">
    <h3>Cerrar turno y arqueo</h3>
    <div class="field"><label>Efectivo que tenés en mano (ya descontada tu comisión)</label>
      <input type="number" min="0" step="100" data-bind="arqueo" value="${esc(UI.arqueo)}" placeholder="${c.esperado}"></div>
    <button class="btn primary block" data-act="cerrarTurno">Fin del día · cerrar turno</button>
    <p class="hint" style="margin-top:8px">Al cerrar, las ventas del turno quedan bloqueadas. Después del cierre, solo la coordinación puede corregir.</p>
  </div>`;
}

/* ======================================================================
   VISTA COORDINACIÓN (web)
   ====================================================================== */
function vCoordinacion() {
  const porEnviar = salidasPorEnviar(48).length;
  const pend = S.reservas.filter((r) => r.estado === "PENDIENTE").length;
  const nav = [
    ["panel", "Panel"], ["reservas", "Reservas", pend], ["salidas", "Salidas y transportistas", porEnviar],
    ["caja", "Caja"], ["clientes", "Clientes"], ["reportes", "Reportes"], ["auditoria", "Auditoría"],
  ];
  const vistas = { panel: cPanel, reservas: cReservas, salidas: cSalidas, caja: cCaja, clientes: cClientes, reportes: cReportes, auditoria: cAuditoria };
  return `
  <div class="coord">
    <aside class="sidebar">
      <div class="brand">${LOGO}<div><div class="bn">Cumbrera</div><div class="bs">Viajes y Turismo</div></div></div>
      <nav class="nav">${nav.map(([id, l, n]) => `<button data-act="cTab" data-v="${id}" aria-current="${UI.cTab === id}"><span>${l}</span>${n ? `<span class="count">${n}</span>` : ""}</button>`).join("")}</nav>
      <div class="me">Sesión: <b>${esc(EMP(COORD).nombre)}</b><br>Coordinación general</div>
    </aside>
    <main class="main">${vistas[UI.cTab]()}</main>
  </div>`;
}

function head(t, sub, acciones = "") {
  return `<div class="page-head"><div><h1>${t}</h1>${sub ? `<p>${sub}</p>` : ""}</div><div>${acciones}</div></div>`;
}

function cPanel() {
  const hoy = inicioHoy();
  const ventasHoy = S.reservas.filter((r) => r.creada >= hoy && r.estado !== "CANCELADA");
  const cobHoy = S.movimientos.filter((m) => m.tipo === "cobro" && m.fecha >= hoy).reduce((a, m) => a + m.base, 0);
  const pend = S.reservas.filter((r) => r.estado === "PENDIENTE");
  const pronto = pend.filter((r) => horasHasta(r.vence) <= 12).sort((a, b) => a.vence - b.vence);
  const porEnviar = salidasPorEnviar(48);
  const abiertos = S.turnos.filter((t) => !t.cierre);
  return `
  ${head(`Buenas, ${EMP(COORD).nombre.split(" ")[0]}`, `${relDia(now())} ${fdia(now())} · Lo que necesita atención hoy`)}
  <div class="kpis">
    <div class="kpi"><div class="l">Vendido hoy</div><div class="v money">${$$(ventasHoy.reduce((a, r) => a + total(r), 0))}</div><div class="s">${ventasHoy.length} ${ventasHoy.length === 1 ? "venta" : "ventas"}</div></div>
    <div class="kpi"><div class="l">Cobrado hoy</div><div class="v money">${$$(cobHoy)}</div><div class="s">Todos los medios</div></div>
    <div class="kpi ${pend.length ? "attn" : ""}"><div class="l">Pendientes de seña</div><div class="v">${pend.length}</div><div class="s">${pronto.length} vencen en menos de 12 h</div></div>
    <div class="kpi ${porEnviar.length ? "attn" : ""}"><div class="l">Salidas sin enviar (48 h)</div><div class="v">${porEnviar.length}</div><div class="s">Con pasajeros cargados</div></div>
  </div>
  <div class="grid2">
    <div class="card">
      <h3>Salidas a resolver</h3>
      ${porEnviar.length ? porEnviar.map((s) => `
        <div class="line-item"><div><div class="t">${esc(P(s.productoId).nombre)}</div><div class="s">${relDia(s.fecha)} ${fhora(s.fecha)} · ${ocupados(s.id)} pasajeros · ${s.proveedorId ? esc(PV(s.proveedorId).nombre) : "sin transportista"}</div></div>
        <div>${badgeEnvio(s)}</div></div>`).join("") + `<button class="btn sm" style="margin-top:10px" data-act="cTab" data-v="salidas">Ir a salidas</button>` : `<div class="empty">Todo enviado. Ningún pasajero va a quedar esperando.</div>`}
    </div>
    <div class="card">
      <h3>Reservas que vencen pronto</h3>
      ${pronto.length ? pronto.map((r) => `
        <div class="line-item"><div><div class="t">${r.id} · ${esc(nombreCli(CLI(r.clienteId)))}</div><div class="s">Vende ${esc(EMP(r.vendedorId).nombre)} · falta ${$$(sena(r) - pagado(r))} para la seña</div></div>
        <span class="badge b-warn">vence en ${fHoras(horasHasta(r.vence))}</span></div>`).join("") : `<div class="empty">Ninguna reserva vence en las próximas 12 h.</div>`}
    </div>
    <div class="card">
      <h3>Turnos abiertos</h3>
      ${abiertos.length ? abiertos.map((t) => { const c = cajaTurno(t); return `<div class="line-item"><div><div class="t">${esc(EMP(t.empleadoId).nombre)}</div><div class="s">Desde las ${fhora(t.apertura)} · ${c.ventas} ventas</div></div><div class="money t">${$$(c.base)}</div></div>`; }).join("") : `<div class="empty">No hay turnos abiertos.</div>`}
    </div>
    <div class="card">
      <h3>Últimos movimientos</h3>
      ${S.auditoria.slice(0, 5).map((a) => `<div class="line-item"><div><div class="t">${esc(a.accion)}</div><div class="s">${esc(a.detalle)}</div></div><div class="s muted" style="white-space:nowrap">${relDia(a.fecha)} ${fhora(a.fecha)}</div></div>`).join("")}
    </div>
  </div>`;
}

function cReservas() {
  const f = UI.rFiltro, q = UI.q.trim().toLowerCase();
  let lista = [...S.reservas].sort((a, b) => b.creada - a.creada);
  if (f === "activas") lista = lista.filter(activa);
  if (f === "pendientes") lista = lista.filter((r) => r.estado === "PENDIENTE");
  if (f === "confirmadas") lista = lista.filter((r) => r.estado === "CONFIRMADA");
  if (f === "cerradas") lista = lista.filter((r) => !activa(r));
  if (q) lista = lista.filter((r) => `${r.id} ${nombreCli(CLI(r.clienteId))} ${r.items.map((i) => P(i.productoId).nombre).join(" ")}`.toLowerCase().includes(q));
  const chip = (id, l) => `<button data-act="rFiltro" data-v="${id}" aria-pressed="${f === id}">${l}</button>`;
  return `
  ${head("Reservas", "Una sola carga por venta: vendedores y coordinación ven la misma información.")}
  <div class="filters">
    <div class="seg" style="margin:0">${chip("activas", "Activas")}${chip("pendientes", "Pendientes")}${chip("confirmadas", "Confirmadas")}${chip("cerradas", "Vencidas y canceladas")}${chip("todas", "Todas")}</div>
    <input type="search" placeholder="Buscar por código, cliente o producto" data-bind="q" data-live value="${esc(UI.q)}">
  </div>
  <div class="tablewrap"><table>
    <thead><tr><th>Código</th><th>Cliente</th><th>Viaje o servicio</th><th>Vendedor</th><th>Total</th><th>Pagado</th><th>Saldo</th><th>Estado</th><th></th></tr></thead>
    <tbody>${lista.length ? lista.map((r) => {
      const pr = r.items.find((i) => i.cuentaCupo) || r.items[0], s = SAL(pr.salidaId);
      return `<tr>
        <td><b>${r.id}</b></td>
        <td>${esc(nombreCli(CLI(r.clienteId)))}</td>
        <td>${esc(P(pr.productoId).nombre)}<div class="hint">${fecha(s.fecha)}</div></td>
        <td>${esc(EMP(r.vendedorId).nombre)}</td>
        <td class="money">${$$(total(r))}</td><td class="money">${$$(pagado(r))}</td><td class="money">${$$(saldo(r))}</td>
        <td>${badgeEstado(r)}${r.estado === "PENDIENTE" ? `<div class="hint">vence en ${fHoras(horasHasta(r.vence))}</div>` : ""}</td>
        <td class="actions"><button class="btn sm" data-act="modal" data-type="detalle" data-id="${r.id}">Ver</button>${activa(r) ? `<button class="btn sm danger" data-act="modal" data-type="cancelar" data-id="${r.id}">Cancelar</button>` : ""}</td>
      </tr>`;
    }).join("") : `<tr><td colspan="9" class="empty">No hay reservas con ese filtro.</td></tr>`}</tbody>
  </table></div>`;
}

function cSalidas() {
  const lista = S.salidas.filter((s) => s.fecha > now()).sort((a, b) => a.fecha - b.fecha);
  return `
  ${head("Salidas y transportistas", "Cada salida con pasajeros tiene que tener transportista y la lista enviada.")}
  <div class="tablewrap"><table>
    <thead><tr><th>Salida</th><th>Fecha</th><th>Ocupados</th><th>Libres</th><th>Transportista</th><th>Estado</th><th></th></tr></thead>
    <tbody>${lista.map((s) => {
      const p = P(s.productoId), e = estadoEnvio(s), lib = libres(s), oc = ocupados(s.id);
      let acc = "";
      if (e === "sin_asignar") acc = `<button class="btn sm primary" data-act="modal" data-type="asignar" data-id="${s.id}">Asignar</button>`;
      if (e === "asignada") acc = `<button class="btn sm primary" data-act="modal" data-type="lista" data-id="${s.id}" ${oc ? "" : "disabled"}>Enviar lista</button><button class="btn sm" data-act="modal" data-type="asignar" data-id="${s.id}">Reasignar</button>`;
      if (e === "enviada") acc = `<button class="btn sm" data-act="modal" data-type="lista" data-id="${s.id}">Ver lista</button><button class="btn sm" data-act="modal" data-type="asignar" data-id="${s.id}">Reasignar</button>`;
      if (e === "reenviar") acc = `<button class="btn sm primary" data-act="modal" data-type="lista" data-id="${s.id}">Reenviar lista</button>`;
      if (e === "mayorista") acc = `<button class="btn sm" data-act="verReservasSalida" data-id="${s.id}">Ver reservas</button>`;
      if (s.cupo != null) acc += `<button class="btn sm" data-act="modal" data-type="cupo" data-id="${s.id}">Cupo</button>`;
      return `<tr>
        <td><b>${esc(p.nombre)}</b><div class="hint">${TIPOS[p.tipo].nombre}</div></td>
        <td>${relDia(s.fecha)} ${fhora(s.fecha)}</td>
        <td>${oc}</td>
        <td>${lib === null ? "—" : lib}</td>
        <td>${s.proveedorId ? esc(PV(s.proveedorId).nombre) : '<span class="muted">—</span>'}</td>
        <td>${badgeEnvio(s)}${e === "reenviar" ? `<div class="hint">enviada con ${s.paxEnviados}, hoy hay ${oc}</div>` : ""}</td>
        <td class="actions">${acc}</td>
      </tr>`;
    }).join("")}</tbody>
  </table></div>
  <p class="hint" style="margin-top:10px">La lista que recibe el transportista no incluye el DNI, salvo en traslados (protección de datos personales).</p>`;
}

function cCaja() {
  const hoy = inicioHoy();
  const turnos = [...S.turnos].sort((a, b) => b.apertura - a.apertura);
  const porMedio = {};
  MEDIOS.forEach((m) => (porMedio[m.id] = 0));
  S.movimientos.filter((m) => m.fecha >= hoy).forEach((m) => { porMedio[m.medio] += m.tipo === "cobro" ? cobrado(m) : -m.base; });
  const totalHoy = Object.values(porMedio).reduce((a, b) => a + b, 0);
  return `
  ${head("Caja", "El cierre diario sale de los turnos: nadie tiene que armar la planilla a mano.", `<button class="btn" data-act="csvCaja">Exportar CSV</button>`)}
  <div class="kpis">
    ${MEDIOS.map((m) => `<div class="kpi"><div class="l">${m.nombre} hoy</div><div class="v money">${$$(porMedio[m.id])}</div><div class="s">${m.recargo ? `incluye recargo del ${Math.round(m.recargo * 100)} %` : "sin recargo"}</div></div>`).join("")}
  </div>
  <p class="hint" style="margin:-6px 0 14px">Total del día: <b class="money">${$$(totalHoy)}</b></p>
  <div class="tablewrap"><table>
    <thead><tr><th>Empleado</th><th>Turno</th><th>Ventas</th><th>Cobrado</th><th>Comisión</th><th>Efectivo a rendir</th><th>Contado</th><th>Resultado</th><th></th></tr></thead>
    <tbody>${turnos.map((t) => {
      const c = cajaTurno(t);
      const res = !t.cierre ? '<span class="badge b-brand">Abierto</span>' : t.diferencia === 0 ? '<span class="badge b-ok">Cuadra</span>' : `<span class="badge b-danger">${t.diferencia > 0 ? "Sobran" : "Faltan"} ${$$(Math.abs(t.diferencia))}</span>`;
      return `<tr>
        <td><b>${esc(EMP(t.empleadoId).nombre)}</b><div class="hint">${EMP(t.empleadoId).temporal ? "Vendedora temporal" : { coordinacion: "Coordinación", vendedor: "Vendedor", administracion: "Administración" }[EMP(t.empleadoId).rol]}</div></td>
        <td>${relDia(t.apertura)} ${fhora(t.apertura)}${t.cierre ? ` → ${fhora(t.cierre)}` : ""}</td>
        <td>${c.ventas}</td>
        <td class="money">${$$(c.base)}</td>
        <td class="money">${$$(c.comision)}</td>
        <td class="money">${$$(c.esperado)}</td>
        <td class="money">${t.cierre ? $$(t.efectivoContado) : "—"}</td>
        <td>${res}${t.corregido ? '<div class="hint">corregido</div>' : ""}</td>
        <td class="actions">${t.cierre ? `<button class="btn sm" data-act="modal" data-type="corregir" data-id="${t.id}">Corregir</button>` : ""}</td>
      </tr>`;
    }).join("")}</tbody>
  </table></div>
  <p class="hint" style="margin-top:10px">Los turnos cerrados no se editan desde el panel del vendedor. Cada corrección de coordinación queda en la auditoría con su motivo.</p>`;
}

function cClientes() {
  const filas = S.clientes.map((c) => {
    const rs = S.reservas.filter((r) => r.clienteId === c.id);
    const act = rs.filter((r) => r.estado !== "CANCELADA" && r.estado !== "VENCIDA");
    return { c, n: act.length, tot: act.reduce((a, r) => a + total(r), 0), ult: rs.length ? Math.max(...rs.map((r) => r.creada)) : null };
  }).sort((a, b) => (b.ult || 0) - (a.ult || 0));
  return `
  ${head("Clientes", "Base reutilizable: al vender se elige un cliente existente o se carga uno nuevo.")}
  <div class="tablewrap"><table>
    <thead><tr><th>Cliente</th><th>Documento</th><th>Teléfono</th><th>Cómo llegó</th><th>Compras</th><th>Total</th><th>Última compra</th></tr></thead>
    <tbody>${filas.map(({ c, n, tot, ult }) => `<tr>
      <td><b>${esc(nombreCli(c))}</b></td><td>${esc(c.dni)}</td><td>${esc(c.tel)}</td><td>${esc(c.origen)}</td>
      <td>${n}${n > 1 ? ' <span class="badge b-brand">frecuente</span>' : ""}</td><td class="money">${$$(tot)}</td><td>${ult ? relDia(ult) : "—"}</td></tr>`).join("")}</tbody>
  </table></div>
  <p class="hint" style="margin-top:10px">El documento solo es visible para coordinación y administración.</p>`;
}

function datosReportes() {
  const act = S.reservas.filter(activa);
  const prov = {}, vend = {}, prod = {};
  act.forEach((r) => r.items.forEach((i) => {
    const s = SAL(i.salidaId), p = P(i.productoId);
    const pvId = s?.proveedorId || p.proveedorFijo || "—";
    const k = pvId === "—" ? "Sin asignar" : p.tipo === "propia" ? "Salidas propias" : PV(pvId).nombre;
    prov[k] = prov[k] || { vendido: 0, comision: 0 };
    prov[k].vendido += i.subtotal;
    prov[k].comision += i.subtotal * (i.pctAgencia || 0);
    if (i.cuentaCupo) { prod[p.nombre] = (prod[p.nombre] || 0) + pax(i); }
  }));
  S.movimientos.filter((m) => m.tipo === "cobro").forEach((m) => { const n = EMP(m.empleadoId).nombre; vend[n] = (vend[n] || 0) + m.base; });
  return { prov, vend, prod };
}

function cReportes() {
  const { prov, vend, prod } = datosReportes();
  const bars = (obj, fmt, alt) => {
    const arr = Object.entries(obj).sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...arr.map((x) => x[1]));
    return `<div class="bars">${arr.map(([k, v]) => `<div class="bar"><span>${esc(k)}</span><div class="track"><div class="fill ${alt ? "alt" : ""}" style="width:${(v / max) * 100}%"></div></div><span class="money" style="text-align:right">${fmt(v)}</span></div>`).join("")}</div>`;
  };
  const provV = Object.fromEntries(Object.entries(prov).map(([k, v]) => [k, v.vendido]));
  const provC = Object.fromEntries(Object.entries(prov).map(([k, v]) => [k, v.comision]));
  return `
  ${head("Reportes", "Lo que antes había que contar voucher por voucher, al instante.", `<button class="btn" data-act="csvReporte">Exportar CSV</button>`)}
  <div class="grid2">
    <div class="card"><h3>Vendido por proveedor</h3>${bars(provV, $$)}</div>
    <div class="card"><h3>Comisión de la agencia por proveedor</h3>${bars(provC, $$, true)}<p class="hint">Cada proveedor comisiona distinto según el tipo de viaje; el seguro náutico no comisiona.</p></div>
    <div class="card"><h3>Cobrado por empleado</h3>${bars(vend, $$)}</div>
    <div class="card"><h3>Productos más vendidos (pasajeros)</h3>${bars(prod, (v) => v + " pax", true)}</div>
  </div>`;
}

function cAuditoria() {
  return `
  ${head("Auditoría", "Nada se borra: cada alta, cobro, cierre y corrección queda registrado.")}
  <div class="tablewrap"><table>
    <thead><tr><th>Cuándo</th><th>Quién</th><th>Acción</th><th>Detalle</th></tr></thead>
    <tbody>${S.auditoria.slice().sort((a, b) => b.fecha - a.fecha).map((a) => `<tr><td style="white-space:nowrap">${relDia(a.fecha)} ${fhora(a.fecha)}</td><td>${esc(a.quien)}</td><td><b>${esc(a.accion)}</b></td><td>${esc(a.detalle)}</td></tr>`).join("")}</tbody>
  </table></div>`;
}

/* ---------------- Modales ---------------- */
function vModal() {
  const md = UI.modal;
  if (!md) return "";
  let h = "", b = "", f = "";
  const cerrar = `<button class="btn" data-act="cerrarModal">Cerrar</button>`;

  if (md.type === "detalle") {
    const r = RES(md.id), cli = CLI(r.clienteId);
    h = `${r.id} · ${esc(nombreCli(cli))}`;
    b = `<div style="margin-bottom:10px">${badgeEstado(r)} <span class="hint">vendió ${esc(EMP(r.vendedorId).nombre)} · ${relDia(r.creada)} ${fhora(r.creada)}</span></div>
      ${r.items.map((i) => { const p = P(i.productoId), s = SAL(i.salidaId); return `<div class="line-item"><div><div class="t">${esc(p.nombre)}</div><div class="s">${resumenItem(i)} · ${fecha(s.fecha)} · comisión agencia ${i.pctAgencia === null ? "a definir" : Math.round(i.pctAgencia * 100) + " %"}</div></div><div class="money">${$$(i.subtotal)}</div></div>`; }).join("")}
      <div class="kv total"><span>Total</span><span class="money">${$$(total(r))}</span></div>
      <div class="kv"><span>Pagado</span><span class="money">${$$(pagado(r))}</span></div>
      <div class="kv"><span>Saldo</span><span class="money">${$$(saldo(r))}</span></div>
      <h4 style="margin:14px 0 6px;font-size:13px">Pasajeros</h4>
      <p class="hint">${r.pasajeros.map((p) => esc(p.nombre) + (p.dni ? ` · DNI ${esc(p.dni)}` : "")).join("<br>")}</p>
      ${r.alojamiento ? `<p class="hint" style="margin-top:6px">Sale de: ${esc(r.alojamiento)}</p>` : ""}
      <h4 style="margin:14px 0 6px;font-size:13px">Movimientos</h4>
      ${movsDe(r.id).length ? movsDe(r.id).map((m) => `<div class="kv"><span>${m.tipo === "cobro" ? "Cobro" : "Reintegro"} · ${MEDIO(m.medio).nombre} · ${relDia(m.fecha)} ${fhora(m.fecha)}</span><span class="money">${m.tipo === "cobro" ? "" : "−"}${$$(m.base)}</span></div>`).join("") : '<p class="hint">Sin cobros.</p>'}
      ${r.cancelacion ? `<div class="alert danger" style="margin-top:10px">Cancelada ${relDia(r.cancelacion.fecha)} ${fhora(r.cancelacion.fecha)} · ${r.cancelacion.reintegro ? "reintegro " + $$(r.cancelacion.reintegro) : "sin reintegro"}${r.cancelacion.motivo ? " · " + esc(r.cancelacion.motivo) : ""}</div>` : ""}`;
    f = cerrar;
  }

  if (md.type === "cancelar") {
    const r = RES(md.id);
    const h24 = horasHasta(salidaDeReserva(r).fecha);
    const corresponde = h24 >= CONFIG.horasCancelacion;
    const pag = pagado(r);
    h = `Cancelar ${r.id}`;
    b = `<p style="margin-bottom:12px">La salida es en <b>${fHoras(h24)}</b>. Pagado hasta ahora: <b>${$$(pag)}</b>.</p>
      ${pag === 0 ? `<div class="alert info">No hay pagos: se cancela y se liberan los lugares.</div>` :
        corresponde ? `<div class="alert ok">Se avisa con 24 h o más: corresponde reintegrar ${$$(pag)} por el mismo medio con que se cobró.</div>` :
        `<div class="alert warn">Faltan menos de 24 h: la seña no se devuelve, salvo una excepción autorizada por coordinación.</div>
         <label style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><input type="checkbox" data-bind="m.excepcion" data-rr ${UI.m.excepcion ? "checked" : ""}> Autorizar excepción y reintegrar ${$$(pag)}</label>`}
      <div class="field"><label>Motivo ${!corresponde && UI.m.excepcion ? "(obligatorio)" : "(opcional)"}</label><input data-bind="m.motivo" value="${esc(UI.m.motivo || "")}" placeholder="Ej.: cambio de fecha por fuerza mayor"></div>
      ${UI.m.err ? `<div class="alert danger">${esc(UI.m.err)}</div>` : ""}`;
    f = `${cerrar}<button class="btn primary" data-act="confirmarCancelar" data-id="${r.id}">Cancelar reserva</button>`;
  }

  if (md.type === "asignar") {
    const s = SAL(md.id), p = P(s.productoId);
    const re = !!s.proveedorId;
    const opciones = S.proveedores.filter((pv) => pv.tipo === "Transportista" || pv.id === p.proveedorFijo);
    h = `${re ? "Reasignar" : "Asignar"} transportista`;
    b = `<p style="margin-bottom:12px"><b>${esc(p.nombre)}</b> · ${fecha(s.fecha)} · ${ocupados(s.id)} pasajeros</p>
      <div class="field"><label>Transportista</label><select data-bind="m.pv">${opt("", "Elegí…", UI.m.pv)}${opciones.filter((pv) => pv.id !== s.proveedorId).map((pv) => opt(pv.id, pv.nombre, UI.m.pv)).join("")}</select></div>
      ${re ? `<div class="field"><label>Motivo de la reasignación (obligatorio)</label><input data-bind="m.motivo" value="${esc(UI.m.motivo || "")}" placeholder="Ej.: el transportista bajó la salida por falta de unidad"></div>` : ""}
      ${UI.m.err ? `<div class="alert danger">${esc(UI.m.err)}</div>` : ""}`;
    f = `${cerrar}<button class="btn primary" data-act="confirmarAsignar" data-id="${s.id}">${re ? "Guardar y avisar" : "Asignar"}</button>`;
  }

  if (md.type === "lista") {
    const s = SAL(md.id), pv = PV(s.proveedorId);
    h = `Enviar lista por WhatsApp`;
    b = `<p class="hint" style="margin-bottom:8px">Para ${esc(pv.nombre)} · ${esc(pv.whatsapp)}</p>
      <div class="msgbox">${esc(mensajeLista(s))}</div>
      <p class="hint" style="margin-top:8px">El chofer marca la asistencia desde el enlace. En la demo, el envío es simulado.</p>`;
    f = `<button class="btn" data-act="copiarLista" data-id="${s.id}">Copiar mensaje</button><button class="btn primary" data-act="marcarEnviada" data-id="${s.id}">Marcar como enviada</button>`;
  }

  if (md.type === "cupo") {
    const s = SAL(md.id);
    h = `Cupo de la salida`;
    b = `<p style="margin-bottom:12px"><b>${esc(P(s.productoId).nombre)}</b> · ${fecha(s.fecha)} · ${ocupados(s.id)} ocupados</p>
      <div class="field"><label>Butacas</label><input type="number" min="0" data-bind="m.cupo" value="${esc(UI.m.cupo ?? s.cupo)}"></div>
      ${UI.m.err ? `<div class="alert danger">${esc(UI.m.err)}</div>` : ""}`;
    f = `${cerrar}<button class="btn primary" data-act="confirmarCupo" data-id="${s.id}">Guardar</button>`;
  }

  if (md.type === "corregir") {
    const t = S.turnos.find((x) => x.id === md.id);
    const c = cajaTurno(t);
    h = `Corregir cierre de ${esc(EMP(t.empleadoId).nombre)}`;
    b = `<p style="margin-bottom:12px">Efectivo a rendir: <b>${$$(c.esperado)}</b> · contado: <b>${$$(t.efectivoContado)}</b></p>
      <div class="field"><label>Efectivo contado corregido</label><input type="number" min="0" data-bind="m.contado" value="${esc(UI.m.contado ?? t.efectivoContado)}"></div>
      <div class="field"><label>Motivo (obligatorio)</label><input data-bind="m.motivo" value="${esc(UI.m.motivo || "")}" placeholder="Ej.: billete contado dos veces"></div>
      ${UI.m.err ? `<div class="alert danger">${esc(UI.m.err)}</div>` : ""}`;
    f = `${cerrar}<button class="btn primary" data-act="confirmarCorregir" data-id="${t.id}">Guardar corrección</button>`;
  }

  return `<div class="modal-bg" data-act="fondoModal"><div class="modal" role="dialog" aria-modal="true">
    <div class="modal-head"><h3>${h}</h3><button class="btn ghost sm" data-act="cerrarModal" aria-label="Cerrar">✕</button></div>
    <div class="modal-body">${b}</div><div class="modal-foot">${f}</div></div></div>`;
}

/* ---------------- Barra de la demo ---------------- */
function vBarra() {
  return `
  <div class="tag"><span class="dot"></span><span>Demo · <b>Varyon</b></span><span class="hide-sm" style="color:#8a8a92;font-weight:500">Sistema de ventas para una agencia de viajes</span></div>
  <div class="spacer"></div>
  <div class="roleswitch" role="group" aria-label="Rol">
    <button data-act="rol" data-v="vendedor" aria-pressed="${UI.rol === "vendedor"}">Vendedor</button>
    <button data-act="rol" data-v="coordinacion" aria-pressed="${UI.rol === "coordinacion"}">Coordinación</button>
  </div>
  <span class="clock" title="Reloj de la demo">${S.reloj ? "⏩ " : ""}${fecha(now())}</span>
  <button class="dbtn" data-act="reloj" title="Adelanta el reloj para ver vencimientos">+12 h</button>
  <button class="dbtn" data-act="reiniciar">Reiniciar</button>
  <a class="dbtn hide-sm" href="${CASO_URL}">Ver caso de estudio</a>`;
}

/* ---------------- Render ---------------- */
let toastTimer;
function toast(msg, err) {
  const el = document.getElementById("toast");
  el.innerHTML = `<div class="toast ${err ? "err" : ""}">${esc(msg)}</div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.innerHTML = ""), 2600);
}

function render(keepScroll = true) {
  procesarVencimientos();
  save();
  const pb = document.getElementById("pbody");
  const top = keepScroll && pb ? pb.scrollTop : 0;
  document.getElementById("bar").innerHTML = vBarra();
  document.getElementById("app").innerHTML = UI.rol === "vendedor" ? vVendedor() : vCoordinacion();
  document.getElementById("modal").innerHTML = vModal();
  const pb2 = document.getElementById("pbody");
  if (pb2) pb2.scrollTop = top;
  const pick = document.querySelector(".prod-pick"), sel = pick && pick.querySelector('[aria-pressed="true"]');
  if (sel) pick.scrollLeft = sel.offsetLeft - pick.offsetLeft - 2;
}

function setPath(path, value) {
  const keys = path.split(".");
  let o = UI;
  keys.slice(0, -1).forEach((k) => { if (o[k] === undefined) o[k] = {}; o = o[k]; });
  o[keys[keys.length - 1]] = value;
}

function descargarCSV(nombre, filas) {
  let embebida = false;
  try { embebida = window.self !== window.top; } catch (e) { embebida = true; }
  if (embebida) return toast("En esta vista previa no se permiten descargas; en la demo publicada sí", true);
  try {
    const csv = "﻿" + filas.map((f) => f.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    toast("CSV descargado");
  } catch (e) { toast("Este navegador no permitió la descarga", true); }
}

/* ---------------- Eventos ---------------- */
const A = {
  rol: (d) => { UI.rol = d.v; UI.modal = null; try { localStorage.setItem(KEY_ROL, d.v); } catch (e) {} render(false); window.scrollTo(0, 0); },
  reloj: () => { S.reloj += 12; procesarVencimientos(); toast("Reloj adelantado 12 horas"); render(); },
  reiniciar: () => { S = crearDatosIniciales(); Object.assign(UI, { cart: nuevoCarrito(), voucher: null, pagoAbierto: null, modal: null, m: {}, arqueo: "", q: "" }); toast("Demo reiniciada con los datos de ejemplo"); render(false); },

  vTab: (d) => { UI.vTab = d.v; UI.pagoAbierto = null; render(false); },
  abrirTurnoV: () => { abrirTurno(VENDEDOR); toast("Turno abierto"); render(); },
  cartModo: (d) => { UI.cart.modo = d.v; render(); },
  cartProd: (d) => { UI.cart.prod = d.v; UI.cart.sal = ""; render(); },
  addItem: () => { agregarItem(); render(); },
  rmItem: (d) => { quitarItem(Number(d.i)); render(); },
  registrarVenta: () => { const err = registrarVenta(); if (!err) { toast("Venta registrada"); render(false); } else render(); },
  nuevaVenta: () => { UI.voucher = null; render(false); },
  compartir: () => toast("En la versión real, el voucher se envía al WhatsApp del cliente"),
  vFiltro: (d) => { UI.vFiltro = d.v; render(); },
  abrirPago: (d) => { UI.pagoAbierto = d.id; const r = RES(d.id); UI.pago = { monto: String(r.estado === "PENDIENTE" ? Math.max(0, sena(r) - pagado(r)) : saldo(r)), medio: "efectivo" }; render(); },
  cerrarPago: () => { UI.pagoAbierto = null; render(); },
  confirmarPago: (d) => {
    const r = RES(d.id), antes = r.estado;
    const err = cobrar(d.id, VENDEDOR, num(UI.pago.monto), UI.pago.medio);
    if (err) return toast(err, true);
    UI.pagoAbierto = null;
    toast(antes !== r.estado ? "Cobro registrado · la reserva quedó confirmada" : "Cobro registrado");
    render();
  },
  cerrarTurno: () => {
    const t = turnoAbierto(VENDEDOR);
    const contado = UI.arqueo === "" ? cajaTurno(t).esperado : num(UI.arqueo);
    const tt = cerrarTurno(VENDEDOR, contado);
    UI.arqueo = "";
    toast(tt.diferencia === 0 ? "Turno cerrado · la caja cuadra" : `Turno cerrado · ${tt.diferencia > 0 ? "sobran" : "faltan"} ${$$(Math.abs(tt.diferencia))}`, tt.diferencia !== 0);
    render(false);
  },

  cTab: (d) => { UI.cTab = d.v; render(false); window.scrollTo(0, 0); },
  rFiltro: (d) => { UI.rFiltro = d.v; render(); },
  verReservasSalida: (d) => { UI.cTab = "reservas"; UI.rFiltro = "todas"; UI.q = P(SAL(d.id).productoId).nombre; render(false); },
  modal: (d) => { UI.modal = { type: d.type, id: d.id }; UI.m = {}; render(); },
  cerrarModal: () => { UI.modal = null; render(); },
  fondoModal: (d, el, e) => { if (e.target === el) { UI.modal = null; render(); } },
  confirmarCancelar: (d) => {
    const err = cancelarReserva(d.id, { excepcion: !!UI.m.excepcion, motivo: UI.m.motivo || "" });
    if (err) { UI.m.err = err; return render(); }
    UI.modal = null; toast("Reserva cancelada · lugares liberados"); render();
  },
  confirmarAsignar: (d) => {
    const s = SAL(d.id);
    if (!UI.m.pv) { UI.m.err = "Elegí un transportista."; return render(); }
    const prev = s.proveedorId;
    if (prev && !(UI.m.motivo || "").trim()) { UI.m.err = "La reasignación necesita un motivo."; return render(); }
    s.proveedorId = UI.m.pv;
    s.envio = "asignada";
    // la comisión de los ítems que estaban sin definir se fija ahora (RN6)
    S.reservas.forEach((r) => r.items.forEach((i) => {
      if (i.salidaId === s.id && i.pctAgencia === null) i.pctAgencia = PV(s.proveedorId).comision[P(i.productoId).tipo] || 0;
    }));
    audit(COORD, prev ? "Reasignación" : "Asignación", `${P(s.productoId).nombre} ${fecha(s.fecha)} → ${PV(s.proveedorId).nombre}${prev ? ` (antes ${PV(prev).nombre}) · motivo: ${UI.m.motivo.trim()}` : ""}`);
    UI.modal = null; toast(prev ? "Transportista reasignado" : "Transportista asignado"); render();
  },
  copiarLista: (d) => {
    const txt = mensajeLista(SAL(d.id));
    try { navigator.clipboard.writeText(txt).then(() => toast("Mensaje copiado"), () => toast("No se pudo copiar", true)); } catch (e) { toast("No se pudo copiar", true); }
  },
  marcarEnviada: (d) => {
    const s = SAL(d.id);
    s.envio = "enviada"; s.paxEnviados = ocupados(s.id); s.fechaEnvio = now();
    audit(COORD, "Lista enviada", `${P(s.productoId).nombre} ${fecha(s.fecha)} → ${PV(s.proveedorId).nombre} (${s.paxEnviados} pasajeros)`);
    UI.modal = null; toast("Lista marcada como enviada"); render();
  },
  confirmarCupo: (d) => {
    const s = SAL(d.id), nuevo = num(UI.m.cupo ?? s.cupo), oc = ocupados(s.id);
    if (nuevo < oc) { UI.m.err = `No puede ser menor a los ${oc} lugares ya vendidos.`; return render(); }
    audit(COORD, "Cambio de cupo", `${P(s.productoId).nombre} ${fecha(s.fecha)}: ${s.cupo} → ${nuevo}`);
    s.cupo = nuevo; UI.modal = null; toast("Cupo actualizado"); render();
  },
  confirmarCorregir: (d) => {
    const t = S.turnos.find((x) => x.id === d.id);
    if (!(UI.m.motivo || "").trim()) { UI.m.err = "La corrección necesita un motivo."; return render(); }
    const antes = t.efectivoContado, nuevo = num(UI.m.contado ?? antes);
    t.efectivoContado = nuevo; t.diferencia = nuevo - cajaTurno(t).esperado; t.corregido = true;
    audit(COORD, "Corrección de cierre", `Turno de ${EMP(t.empleadoId).nombre}: contado ${$$(antes)} → ${$$(nuevo)} · motivo: ${UI.m.motivo.trim()}`);
    UI.modal = null; toast("Cierre corregido y registrado en auditoría"); render();
  },
  csvCaja: () => {
    const filas = [["Empleado", "Apertura", "Cierre", "Ventas", "Cobrado", ...MEDIOS.map((m) => m.nombre), "Comisión", "Efectivo a rendir", "Contado", "Diferencia"]];
    S.turnos.forEach((t) => { const c = cajaTurno(t); filas.push([EMP(t.empleadoId).nombre, fecha(t.apertura), t.cierre ? fecha(t.cierre) : "abierto", c.ventas, Math.round(c.base), ...MEDIOS.map((m) => Math.round(c.porMedio[m.id])), c.comision, c.esperado, t.cierre ? t.efectivoContado : "", t.cierre ? t.diferencia : ""]); });
    descargarCSV("cumbrera-caja.csv", filas);
  },
  csvReporte: () => {
    const { prov } = datosReportes();
    descargarCSV("cumbrera-ventas-por-proveedor.csv", [["Proveedor", "Vendido", "Comisión agencia"], ...Object.entries(prov).map(([k, v]) => [k, Math.round(v.vendido), Math.round(v.comision)])]);
  },
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const fn = A[el.dataset.act];
  if (fn) fn(el.dataset, el, e);
});

document.addEventListener("input", (e) => {
  const el = e.target;
  if (!el.dataset || !el.dataset.bind) return;
  setPath(el.dataset.bind, el.type === "checkbox" ? el.checked : el.value);
  if (el.dataset.live !== undefined) {
    const pos = el.selectionStart;
    render();
    const again = document.querySelector(`[data-bind="${el.dataset.bind}"]`);
    if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (err) {} }
  }
});

document.addEventListener("change", (e) => {
  const el = e.target;
  if (!el.dataset || !el.dataset.bind) return;
  setPath(el.dataset.bind, el.type === "checkbox" ? el.checked : el.value);
  if (el.dataset.reset) setPath("cart." + el.dataset.reset, "");
  if (el.dataset.rr !== undefined) render();
});

document.addEventListener("keydown", (e) => { if (e.key === "Escape" && UI.modal) { UI.modal = null; render(); } });

render(false);
