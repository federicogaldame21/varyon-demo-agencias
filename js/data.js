/* Cumbrera · Viajes y Turismo — datos de demostración.
   Todo es ficticio: marca, personas, proveedores, documentos y teléfonos.
   Las fechas se generan relativas al momento en que se carga la demo. */

const CONFIG = {
  pctSena: 0.35,          // RN1: la reserva se confirma con el 35 % del total
  horasVencimiento: 48,   // RN3: sin seña en 48 h, la reserva vence
  horasCancelacion: 24,   // RN4: reintegro si se cancela con 24 h o más
  pctComisionVendedor: 0.12, // RN12
};

const MEDIOS = [
  { id: "efectivo", nombre: "Efectivo", recargo: 0 },
  { id: "transferencia", nombre: "Transferencia", recargo: 0 },
  { id: "debito", nombre: "Débito", recargo: 0.03 },
  { id: "credito", nombre: "Crédito", recargo: 0.08 },
];

const TIPOS = {
  excursion: { nombre: "Excursión", pideDni: false, pideAlojamiento: true },
  traslado: { nombre: "Traslado", pideDni: true, pideAlojamiento: true },
  nacional: { nombre: "Paquete nacional", pideDni: true, pideAlojamiento: false },
  propia: { nombre: "Salida propia", pideDni: false, pideAlojamiento: true },
  servicio: { nombre: "Servicio", pideDni: false, pideAlojamiento: false },
};

function crearDatosIniciales() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const at = (dias, hhmm = "00:00") => {
    const [h, m] = hhmm.split(":").map(Number);
    const d = new Date(hoy);
    d.setDate(d.getDate() + dias);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  };
  const ahora = Date.now();
  const hace = (horas) => ahora - horas * 3600e3;

  const proveedores = [
    { id: "pv1", nombre: "Náutica Serrana", tipo: "Náutica", whatsapp: "351 000 1101", comision: { excursion: 0.2 } },
    { id: "pv2", nombre: "Transportes Valle Azul", tipo: "Transportista", whatsapp: "351 000 1102", comision: { excursion: 0.15, propia: 0 } },
    { id: "pv3", nombre: "Combis del Lago", tipo: "Transportista", whatsapp: "351 000 1103", comision: { excursion: 0.15, propia: 0 } },
    { id: "pv4", nombre: "Traslados Cumbre", tipo: "Transportista", whatsapp: "351 000 1104", comision: { traslado: 0.12 } },
    { id: "pv5", nombre: "Mayorista Patagonia Sur", tipo: "Mayorista", whatsapp: "11 0000 1105", comision: { nacional: 0.1 } },
  ];

  const productos = [
    { id: "p1", foto: "img/19963072.jpg", nombre: "Catamarán Lago San Roque", tipo: "excursion", proveedorFijo: "pv1", adulto: 32000, menor: 16000, comisionable: true, seguroVinculado: "p2" },
    { id: "p2", nombre: "Seguro náutico obligatorio", tipo: "servicio", adulto: 8000, menor: 8000, comisionable: false, vinculado: true },
    { id: "p3", foto: "img/18574904.jpg", nombre: "La Cumbrecita y Villa General Belgrano", tipo: "excursion", adulto: 52000, menor: 31000, comisionable: true },
    { id: "p4", foto: "img/4571790.jpg", nombre: "Traslado al aeropuerto de Córdoba", tipo: "traslado", proveedorFijo: "pv4", adulto: 28000, menor: 28000, comisionable: true },
    { id: "p5", foto: "img/35910428.jpg", nombre: "Caminata a Cura Brochero", tipo: "propia", adulto: 45000, menor: 30000, comisionable: false },
    { id: "p6", foto: "img/17365746.jpg", nombre: "Bariloche 5 noches", tipo: "nacional", proveedorFijo: "pv5", adulto: 690000, menor: 520000, comisionable: true },
  ];

  const salidas = [
    { id: "s1", productoId: "p1", fecha: at(1, "10:00"), cupo: 40, proveedorId: "pv1", envio: "enviada", paxEnviados: 3, fechaEnvio: hace(2) },
    { id: "s2", productoId: "p1", fecha: at(1, "15:00"), cupo: 40, proveedorId: "pv1", envio: "asignada" },
    { id: "s3", productoId: "p3", fecha: at(1, "08:00"), cupo: 19, proveedorId: null, envio: "sin_asignar" },
    { id: "s4", productoId: "p3", fecha: at(2, "08:00"), cupo: 19, proveedorId: "pv2", envio: "asignada" },
    { id: "s5", productoId: "p4", fecha: at(1, "14:00"), cupo: 4, proveedorId: "pv4", envio: "enviada", paxEnviados: 1, fechaEnvio: hace(20) },
    { id: "s6", productoId: "p1", fecha: at(2, "10:00"), cupo: 40, proveedorId: "pv1", envio: "asignada" },
    { id: "s7", productoId: "p5", fecha: at(20, "05:00"), cupo: 60, proveedorId: "pv3", envio: "asignada" },
    { id: "s8", productoId: "p6", fecha: at(45, "06:00"), cupo: null, proveedorId: "pv5", envio: "mayorista" },
  ];

  const empleados = [
    { id: "e1", nombre: "Valeria Ruiz", rol: "coordinacion", comision: 0, activo: true },
    { id: "e2", nombre: "Tomás Ferreyra", rol: "vendedor", comision: 0.12, activo: true },
    { id: "e3", nombre: "Agustina Molina", rol: "vendedor", comision: 0.12, activo: true, temporal: true },
    { id: "e4", nombre: "Marcela Díaz", rol: "administracion", comision: 0, activo: true },
  ];

  const clientes = [
    { id: "c1", nombre: "Ana María", apellido: "Castellano", dni: "27.000.118", tel: "351 000 2201", origen: "WhatsApp", alta: hace(30) },
    { id: "c2", nombre: "Julián", apellido: "Pereyra", dni: "33.000.402", tel: "351 000 2202", origen: "Vía pública", alta: hace(20) },
    { id: "c3", nombre: "Sofía", apellido: "Bustos", dni: "40.000.913", tel: "351 000 2203", origen: "Oficina", alta: hace(26) },
    { id: "c4", nombre: "Martín", apellido: "Gaitán", dni: "29.000.577", tel: "351 000 2204", origen: "WhatsApp", alta: hace(25) },
    { id: "c5", nombre: "Carolina", apellido: "Funes", dni: "31.000.260", tel: "351 000 2205", origen: "Oficina", alta: hace(120) },
    { id: "c6", nombre: "Diego", apellido: "Quiroga", dni: "36.000.845", tel: "351 000 2206", origen: "Vía pública", alta: hace(47) },
  ];

  const turnos = [
    { id: "t1", empleadoId: "e3", apertura: hace(30), cierre: hace(21), efectivoContado: 8440, diferencia: 0 },
    { id: "t2", empleadoId: "e2", apertura: hace(5), cierre: null },
    { id: "t3", empleadoId: "e1", apertura: hace(9), cierre: null },
  ];

  const item = (productoId, salidaId, ad, me = 0, inf = 0) => {
    const p = productos.find((x) => x.id === productoId);
    const s = salidas.find((x) => x.id === salidaId);
    const prov = proveedores.find((x) => x.id === (s?.proveedorId || p.proveedorFijo));
    const pctAgencia = !p.comisionable ? 0 : prov ? prov.comision[p.tipo] || 0 : null;
    return {
      productoId, salidaId, adultos: ad, menores: me, infantes: inf,
      precioAdulto: p.adulto, precioMenor: p.menor,
      subtotal: ad * p.adulto + me * p.menor,
      pctAgencia, cuentaCupo: !p.vinculado,
    };
  };

  const reservas = [
    {
      id: "R-1001", clienteId: "c1", vendedorId: "e2", turnoId: "t2", creada: hace(4), estado: "CONFIRMADA",
      alojamiento: "Hotel Portal del Lago",
      items: [item("p1", "s1", 2, 1), item("p2", "s1", 2, 1)],
      pasajeros: [{ nombre: "Ana María Castellano", dni: "27.000.118" }, { nombre: "Carlos Castellano", dni: "" }, { nombre: "Lola Castellano", dni: "" }],
    },
    {
      id: "R-1002", clienteId: "c2", vendedorId: "e2", turnoId: "t2", creada: hace(3), estado: "PENDIENTE",
      alojamiento: "Cabañas El Mirador",
      items: [item("p3", "s3", 4)],
      pasajeros: [{ nombre: "Julián Pereyra" }, { nombre: "Paula Ríos" }, { nombre: "Nicolás Pereyra" }, { nombre: "Laura Pereyra" }],
    },
    {
      id: "R-1003", clienteId: "c3", vendedorId: "e3", turnoId: "t1", creada: hace(26), estado: "CONFIRMADA",
      alojamiento: "Apart Costa Azul",
      items: [item("p3", "s4", 2, 1)],
      pasajeros: [{ nombre: "Sofía Bustos" }, { nombre: "Ramiro Ortiz" }, { nombre: "Emma Ortiz" }],
    },
    {
      id: "R-1004", clienteId: "c4", vendedorId: "e3", turnoId: "t1", creada: hace(25), estado: "CONFIRMADA",
      alojamiento: "Hostería Los Pinos",
      items: [item("p4", "s5", 1)],
      pasajeros: [{ nombre: "Martín Gaitán", dni: "29.000.577" }],
    },
    {
      id: "R-1005", clienteId: "c5", vendedorId: "e1", turnoId: "t3", creada: hace(8), estado: "CONFIRMADA",
      alojamiento: "",
      items: [item("p6", "s8", 2)],
      pasajeros: [{ nombre: "Carolina Funes", dni: "31.000.260", nacimiento: "1985-04-12" }, { nombre: "Hernán Sosa", dni: "30.000.731", nacimiento: "1983-09-02" }],
    },
    {
      id: "R-1006", clienteId: "c6", vendedorId: "e2", turnoId: "t2", creada: hace(47), estado: "PENDIENTE",
      alojamiento: "Camping Las Rocas",
      items: [item("p1", "s2", 2), item("p2", "s2", 2)],
      pasajeros: [{ nombre: "Diego Quiroga" }, { nombre: "Valentina Paz" }],
    },
  ];
  reservas.forEach((r) => (r.vence = r.creada + CONFIG.horasVencimiento * 3600e3));

  const movimientos = [
    { id: 1, tipo: "cobro", reservaId: "R-1001", turnoId: "t2", empleadoId: "e2", medio: "efectivo", base: 52000, recargo: 0, fecha: hace(4) },
    { id: 2, tipo: "cobro", reservaId: "R-1002", turnoId: "t2", empleadoId: "e2", medio: "credito", base: 22000, recargo: 0.08, fecha: hace(3) },
    { id: 3, tipo: "cobro", reservaId: "R-1003", turnoId: "t1", empleadoId: "e3", medio: "transferencia", base: 135000, recargo: 0, fecha: hace(26) },
    { id: 4, tipo: "cobro", reservaId: "R-1004", turnoId: "t1", empleadoId: "e3", medio: "efectivo", base: 28000, recargo: 0, fecha: hace(25) },
    { id: 5, tipo: "cobro", reservaId: "R-1005", turnoId: "t3", empleadoId: "e1", medio: "transferencia", base: 500000, recargo: 0, fecha: hace(8) },
  ];

  const auditoria = [
    { fecha: hace(21), quien: "Agustina Molina", accion: "Cierre de turno", detalle: "Turno t1 cerrado · efectivo contado $ 8.440 · cuadra" },
    { fecha: hace(2), quien: "Valeria Ruiz", accion: "Lista enviada", detalle: "Catamarán Lago San Roque · salida de mañana 10:00 → Náutica Serrana (3 pasajeros)" },
  ];

  return {
    version: 2,
    reloj: 0, // horas adelantadas con el botón de la barra de demo
    seq: { reserva: 1007, movimiento: 6, turno: 4, cliente: 7 },
    proveedores, productos, salidas, empleados, clientes, turnos, reservas, movimientos, auditoria,
  };
}
