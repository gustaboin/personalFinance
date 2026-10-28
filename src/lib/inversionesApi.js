import { supabase } from './supabaseClient'

// Recalcula los lotes FIFO de un ticker respetando el ratio de cada fecha.
// (función SQL recalcular_fifo, ver fix-fifo-ratio-venta.sql)
export async function recalcularFifo(cuentaId, ticker) {
  const { error } = await supabase.rpc('recalcular_fifo', {
    p_cuenta_id: cuentaId,
    p_ticker: ticker,
  })
  if (error) throw error
}

// --- Lectura ---

// cuentaId = null -> todas las cuentas
export async function getPosiciones(cuentaId) {
  let q = supabase.from('vw_inversiones_valuacion').select('*')
  if (cuentaId) q = q.eq('cuenta_id', cuentaId)
  const { data, error } = await q.order('fecha_operacion', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getResumenCuenta(cuentaId) {
  const { data, error } = await supabase
    .from('vw_inversiones_resumen_cuenta')
    .select('*')
    .eq('cuenta_id', cuentaId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function getResumenPorTicker() {
  const { data, error } = await supabase
    .from('vw_inversiones_resumen_ticker')
    .select('*')
  if (error) throw error
  return data ?? []
}

// --- Exposición de la cartera (vistas vw_exposicion_*) ---
// Se traen las filas por cuenta y el total / agrupación por región se arma
// en el front: así un solo fetch sirve para "Todos los brokers" y para cada broker,
// y no depende del formato de vw_exposicion_region_total.

export async function getExposicionRama() {
  const { data, error } = await supabase
    .from('vw_exposicion_rama')
    .select('cuenta_id, rama, valor_usd')
  if (error) throw error
  return data ?? []
}

export async function getExposicionPais() {
  const { data, error } = await supabase
    .from('vw_exposicion_pais')
    .select('cuenta_id, region, pais, valor_usd')
  if (error) throw error
  return data ?? []
}

export async function getPin() {
  const { data, error } = await supabase
    .from('app_config')
    .select('valor')
    .eq('clave', 'pin_inversiones')
    .single()
  if (error) throw error
  return data.valor
}

// --- Medio de pago de un broker según la moneda de la operación ---
// El broker se maneja con un par de cuentas "<Broker> ARS" / "<Broker> USD".
// La posición queda en la cuenta elegida (ej. "IOL USD"), pero el dinero entra o sale
// de la cuenta que corresponde a la moneda de la operación (ej. "IOL ARS").
async function resolverMedioPago(cuentaId, moneda) {
  const { data: cuenta, error: e1 } = await supabase
    .from('cuentas')
    .select('id, nombre')
    .eq('id', cuentaId)
    .single()
  if (e1) throw e1

  const base = cuenta.nombre.replace(/\s*(ARS|USD)\s*$/i, '').trim()
  const nombreCuentaMoneda = `${base} ${moneda}`

  // 1. Cuenta hermana de esa moneda -> su medio de pago
  const { data: hermana } = await supabase
    .from('cuentas')
    .select('id')
    .eq('nombre', nombreCuentaMoneda)
    .maybeSingle()

  if (hermana) {
    const { data: medios, error } = await supabase
      .from('medios_pago')
      .select('id, nombre')
      .eq('cuenta_id', hermana.id)
    if (error) throw error
    if (medios?.length) return medios[0]
  }

  // 2. Medio de pago con el mismo nombre que la cuenta ("IOL ARS")
  const { data: porNombre } = await supabase
    .from('medios_pago')
    .select('id, nombre')
    .eq('nombre', nombreCuentaMoneda)
    .maybeSingle()
  if (porNombre) return porNombre

  // 3. Medios vinculados a la propia cuenta
  const { data: propios } = await supabase
    .from('medios_pago')
    .select('id, nombre')
    .eq('cuenta_id', cuentaId)
  const propio = propios?.find((m) => m.nombre.includes(moneda))
  if (propio) return propio

  throw new Error(
    `No encontré un medio de pago para "${nombreCuentaMoneda}". ` +
      `Creá la cuenta y un medio de pago vinculado (medios_pago.cuenta_id).`
  )
}

// --- Alta: compra de un activo ---
// Hace 2 cosas: 1) registra la posición  2) registra el egreso real
// de la cuenta (Balanz ARS o Balanz USD según la moneda de la compra).
// No está envuelto en una transacción SQL real -- si el segundo paso
// falla, borra el primero a mano (ver catch).

export async function addCompraInversion({
  cuentaId,
  ticker,
  boletoNumero,
  fechaOperacion,
  fechaLiquidacion,
  cantidad,
  moneda, // 'ARS' | 'USD'
  precioUnitarioBruto,
  importeBruto,
  arancel,
  comision,
  importeNeto,
  tcCcl, // solo si moneda === 'ARS'
  notas,
}) {
  // 1. Posición
  const { data: posicion, error: errorPosicion } = await supabase
    .from('inversiones_posiciones')
    .insert({
      cuenta_id: cuentaId,
      ticker,
      boleto_numero: boletoNumero || null,
      fecha_operacion: fechaOperacion,
      fecha_liquidacion: fechaLiquidacion || null,
      cantidad,
      moneda,
      precio_unitario_bruto: precioUnitarioBruto || null,
      importe_bruto: importeBruto || null,
      arancel: arancel || null,
      comision: comision || null,
      importe_neto: importeNeto,
      tc_ccl: moneda === 'ARS' ? tcCcl : null,
      notas: notas || null,
    })
    .select()
    .single()

  if (errorPosicion) throw errorPosicion

  // 2. Egreso real de la cuenta, mismo monto e igual moneda que la operación
  let medioPago
  try {
    medioPago = await resolverMedioPago(cuentaId, moneda)
  } catch (errorMedio) {
    await supabase.from('inversiones_posiciones').delete().eq('id', posicion.id)
    throw errorMedio
  }

  const { data: categoria, error: errorCategoria } = await supabase
    .from('categorias')
    .select('id')
    .eq('nombre', 'Compra de activos')
    .single()

  if (errorCategoria) {
    await supabase.from('inversiones_posiciones').delete().eq('id', posicion.id)
    throw errorCategoria
  }

  const { error: errorMovimiento } = await supabase
    .from('movimientos')
    .insert({
      fecha: fechaOperacion,
      categoria_id: categoria.id,
      medio_pago_id: medioPago.id,
      concepto: `Compra ${cantidad} ${ticker}${boletoNumero ? ' - Boleto ' + boletoNumero : ''}`,
      moneda,
      importe: importeNeto,
      id_inversion: posicion.id,
    })

  if (errorMovimiento) {
    await supabase.from('inversiones_posiciones').delete().eq('id', posicion.id)
    throw errorMovimiento
  }

  // Si ya hay ventas cargadas, una compra más vieja puede cambiar qué lote consumieron
  try {
    await recalcularFifo(cuentaId, ticker)
  } catch (e) {
    console.warn('No se pudo recalcular FIFO tras la compra:', e.message)
  }

  return posicion
}

// --- Baja: elimina la posición Y el egreso que generó ---

export async function deleteCompraInversion(posicionId) {
  // Primero el movimiento vinculado (si existe)
  const { error: errorMov } = await supabase
    .from('movimientos')
    .delete()
    .eq('id_inversion', posicionId)
  if (errorMov) throw errorMov

  const { error: errorPos } = await supabase
    .from('inversiones_posiciones')
    .delete()
    .eq('id', posicionId)
  if (errorPos) throw errorPos
}

// --- Ventas (FIFO) ---
// Hace 3 cosas: 1) registra la venta  2) descuenta de las compras más viejas
// (inversiones_ventas_lotes, vía recalcular_fifo)  3) registra el INGRESO en la cuenta del broker.
// `cantidad` va en la unidad del boleto: el ratio vigente el día de la venta.
// Si un paso falla, deshace los anteriores a mano.

// cuentaId = null -> todas las cuentas
export async function getVentas(cuentaId) {
  let q = supabase.from('vw_inversiones_ventas_resumen').select('*')
  if (cuentaId) q = q.eq('cuenta_id', cuentaId)
  const { data, error } = await q.order('fecha_operacion', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function addVentaInversion({
  cuentaId,
  ticker,
  boletoNumero,
  fechaOperacion,
  fechaLiquidacion,
  cantidad, // nominales en la unidad del día de la venta (ratio de esa fecha)
  moneda, // 'ARS' | 'USD'
  precioUnitarioBruto,
  importeBruto,
  arancel,
  comision,
  importeNeto, // lo que realmente entró a la cuenta
  tcCcl,
  tcMep,
  notas,
}) {
  // 1. Medio de pago de la cuenta (para que el ingreso sume saldo)
  const medio = await resolverMedioPago(cuentaId, moneda)

  const { data: categoria, error: errorCategoria } = await supabase
    .from('categorias')
    .select('id')
    .eq('nombre', 'Venta de activos')
    .single()
  if (errorCategoria) throw errorCategoria

  // 2. Venta
  const { data: venta, error: errorVenta } = await supabase
    .from('inversiones_ventas')
    .insert({
      cuenta_id: cuentaId,
      ticker,
      boleto_numero: boletoNumero || null,
      fecha_operacion: fechaOperacion,
      fecha_liquidacion: fechaLiquidacion || null,
      cantidad,
      moneda,
      precio_unitario_bruto: precioUnitarioBruto || null,
      importe_bruto: importeBruto || null,
      arancel: arancel || null,
      comision: comision || null,
      importe_neto: importeNeto,
      tc_ccl: moneda === 'ARS' ? tcCcl || null : null,
      tc_mep: moneda === 'ARS' ? tcMep || null : null,
      notas: notas || null,
    })
    .select()
    .single()
  if (errorVenta) throw errorVenta

  // 3. Lotes FIFO: la cantidad de la venta está en la unidad que regía ese día
  //    y sólo consume compras hasta esa fecha. Si no alcanza, la función falla.
  try {
    await recalcularFifo(cuentaId, ticker)
  } catch (e) {
    await supabase.from('inversiones_ventas').delete().eq('id', venta.id)
    throw new Error(e.message || 'No alcanza para esta venta.')
  }

  // 4. Ingreso en la cuenta
  const { error: errorMov } = await supabase.from('movimientos').insert({
    fecha: fechaOperacion,
    categoria_id: categoria.id,
    medio_pago_id: medio.id,
    concepto: `Venta ${cantidad} ${ticker}${boletoNumero ? ' - Boleto ' + boletoNumero : ''}`,
    moneda,
    importe: importeNeto,
    id_venta_inversion: venta.id,
  })
  if (errorMov) {
    await supabase.from('inversiones_ventas').delete().eq('id', venta.id) // borra los lotes en cascada
    await recalcularFifo(cuentaId, ticker).catch(() => {})
    throw errorMov
  }

  return venta
}

// Baja de una venta: borra el ingreso, los lotes (cascada) y la venta.
// Las compras recuperan automáticamente lo que se les había descontado.
export async function deleteVentaInversion(ventaId) {
  const { data: venta } = await supabase
    .from('inversiones_ventas')
    .select('cuenta_id, ticker')
    .eq('id', ventaId)
    .maybeSingle()
  const { error: errorMov } = await supabase.from('movimientos').delete().eq('id_venta_inversion', ventaId)
  if (errorMov) throw errorMov
  const { error } = await supabase.from('inversiones_ventas').delete().eq('id', ventaId)
  if (error) throw error
  // Las ventas posteriores pueden reasignarse a otros lotes
  if (venta) await recalcularFifo(venta.cuenta_id, venta.ticker).catch((e) => console.warn(e.message))
}