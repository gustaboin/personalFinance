import { supabase } from './supabaseClient'
import { rangoDeMes } from './format'

// ---------- Listas maestras ----------

export async function getCategorias() {
  const { data, error } = await supabase
    .from('categorias')
    .select('id, nombre, tipos_movimiento(nombre)')
    .order('nombre')
  if (error) throw error
  return data.map((c) => ({ id: c.id, nombre: c.nombre, tipo: c.tipos_movimiento?.nombre }))
}

export async function getMediosPago() {
  const { data, error } = await supabase.from('medios_pago').select('id, nombre, tipo_id').order('nombre')
  if (error) throw error
  return data
}

// ---------- Tipo de cambio ----------

export async function getTipoCambio(mesPeriodo) {
  const { data, error } = await supabase
    .from('tipos_cambio')
    .select('valor')
    .eq('mes_periodo', mesPeriodo)
    .maybeSingle()
  if (error) throw error
  return data?.valor ?? null
}

export async function setTipoCambio(mesPeriodo, valor) {
  const { error } = await supabase
    .from('tipos_cambio')
    .upsert({ mes_periodo: mesPeriodo, valor }, { onConflict: 'mes_periodo' })
  if (error) throw error
}


// aggreo un get para trarme los proveedores de la tabla proveedores, para poder filtrar los movimientos por proveedor y no solo por proyecto
export async function getProveedores() {
  const { data, error } = await supabase
    .from('proveedores')
    .select('id, nombre')
    .order('nombre')

  if (error) throw error
  return data.map((p) => ({ id: p.id, nombre: p.nombre }))
}

// ---------- Movimientos ----------

export async function getMovimientosDelMes(mesPeriodo) {
  const [desde, hasta] = rangoDeMes(mesPeriodo)
  const { data, error } = await supabase
    .from('movimientos')
        .select('id, fecha, concepto, moneda, importe, categoria_id, medio_pago_id, id_proveedor, categorias(nombre, tipos_movimiento(nombre)), medios_pago(nombre), proveedores(nombre)')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: false })
  if (error) throw error
  return data
}

export async function addMovimiento({ fecha, categoria_id, medio_pago_id, concepto, moneda, importe, id_proveedor, id_proyecto }) {
  const { error } = await supabase
    .from('movimientos')
    .insert({ fecha, categoria_id, medio_pago_id, concepto, moneda, importe, id_proveedor, id_proyecto })
  if (error) throw error
}

export async function updateMovimiento(id, { fecha, id_proveedor, categoria_id, medio_pago_id, concepto, moneda, importe, id_proyecto }) {
  const { error } = await supabase
    .from('movimientos')
    .update({ fecha, id_proveedor, categoria_id, medio_pago_id, concepto, moneda, importe, id_proyecto })
    .eq('id', id)
  if (error) throw error
}

export async function deleteMovimiento(id) {
  const { error } = await supabase.from('movimientos').delete().eq('id', id)
  if (error) throw error
}

// ---------- Compras en cuotas ----------

export async function getComprasCuotas() {
  const { data, error } = await supabase
    .from('compras_cuotas')
    .select('id, fecha_compra, comercio, monto_total, cantidad_cuotas, notas, categorias(nombre), medios_pago(nombre)')
    .order('fecha_compra', { ascending: false })
  if (error) throw error
  return data
}

export async function addCompraCuotas({ fecha_compra, comercio, categoria_id, medio_pago_id, moneda, monto_total, cantidad_cuotas, notas }) {
  const { error } = await supabase
    .from('compras_cuotas')
    .insert({ fecha_compra, comercio, categoria_id, medio_pago_id, moneda, monto_total, cantidad_cuotas, notas })
  if (error) throw error
}

export async function deleteCompraCuotas(id) {
  const { error } = await supabase.from('compras_cuotas').delete().eq('id', id)
  if (error) throw error
}

// ---------- Vistas de resumen ----------

export async function getResumenCategoria(mesPeriodo) {
  const { data, error } = await supabase
    .from('vw_resumen_categoria')
    .select('*')
    .eq('mes_periodo', mesPeriodo)
  if (error) throw error
  return data
}

export async function getDeudaFutura(mesPeriodo) {
  const { data, error } = await supabase
    .from('vw_deuda_futura')
    .select('*')
    .gt('mes_periodo', mesPeriodo)
    .order('mes_periodo')
  if (error) throw error
  return data
}

export async function getResumenCategoriaRango(mesDesde, mesHasta) {
  const { data, error } = await supabase
    .from('vw_resumen_categoria')
    .select('*')
    .gte('mes_periodo', mesDesde)
    .lte('mes_periodo', mesHasta)
    .order('mes_periodo')
  if (error) throw error
  return data
}

export async function getCronogramaCuotas(mesPeriodo) {
  const { data, error } = await supabase
    .from('vw_cuotas_generadas')
    .select('*')
    .eq('mes_periodo', mesPeriodo)
  if (error) throw error
  return data
}

// ---------- Presupuesto ----------

export async function getPresupuestos(mesPeriodo) {
  const { data, error } = await supabase
    .from('presupuestos')
    .select('id, categoria_id, monto_objetivo, moneda, vigente_desde, categorias(nombre)')
    .lte('vigente_desde', mesPeriodo)
    .order('vigente_desde', { ascending: false })
  if (error) throw error
  // Para cada categoria, nos quedamos con el presupuesto vigente mas reciente
  const porCategoria = new Map()
  for (const p of data) {
    if (!porCategoria.has(p.categoria_id)) porCategoria.set(p.categoria_id, p)
  }
  return Array.from(porCategoria.values())
}

export async function setPresupuesto({ categoria_id, monto_objetivo, moneda, vigente_desde }) {
  const { error } = await supabase
    .from('presupuestos')
    .insert({ categoria_id, monto_objetivo, moneda, vigente_desde })
  if (error) throw error
}

// ---------- Tarjetas (usa las funciones total_tarjeta / movimientos_tarjeta) ----------

/*
export async function getTotalTarjeta(mesPeriodo, medioPagoId) {
  const { data, error } = await supabase.rpc('total_tarjeta', {
    p_periodo: mesPeriodo,
    p_mediopago: medioPagoId,
  })
  if (error) throw error
  return Number(data) || 0
}

export async function getMovimientosTarjeta(mesPeriodo, medioPagoId) {
  const { data, error } = await supabase.rpc('movimientos_tarjeta', {
    p_periodo: mesPeriodo,
    p_mediopago: medioPagoId,
  })
  if (error) throw error
  return data
}

*/

// ---------- Tarjetas (usa las funciones total_tarjeta / movimientos_tarjeta) ----------

export async function getTotalTarjeta(mesPeriodo, medioPagoId) {
  const tipos = ['B', 'G', 'T']

  const resultados = await Promise.all(
    tipos.map(async (tipo) => {
      const { data, error } = await supabase.rpc('total_tarjeta', {
        p_periodo: mesPeriodo,
        p_mediopago: medioPagoId,
        p_tipo: tipo,
      })

      if (error) throw error

      return Number(data) || 0
    })
  )

  return {
    B: resultados[0], // Débitos / negativos
    G: resultados[1], // Gastos / positivos
    T: resultados[2], // Total
  }
}

export async function getMovimientosTarjeta(mesPeriodo, medioPagoId) {
  const { data, error } = await supabase.rpc('movimientos_tarjeta', {
    p_periodo: mesPeriodo,
    p_mediopago: medioPagoId,
  })

  if (error) throw error
  return data
}

// -- resumenes de tarjeta


export async function getResumenTarjeta(mesPeriodo, medioPagoId) {
  console.log('Buscando resumen:', {
    mesPeriodo,
    medioPagoId
  })

  console.log('tipo y valor de mesPeriodo:', typeof mesPeriodo, mesPeriodo)

  const { data, error } = await supabase
    .from('resumenes')
    .select('*')
    .eq('periodo', mesPeriodo)
    .eq('medio_pago_id', medioPagoId)
    .order('fecha_vencimiento', { ascending: false })

  if (error) {
    console.error('Error buscando resumen:', error)
    throw error
  }

  console.log('Resumen encontrado:', data)

  return data ?? []
}

// resumen actual y anterior

export async function getResumenActualYAnterior(medioPagoId, mesPeriodo) {
  const { data, error } = await supabase
    .from('resumenes')
    .select('*')
    .eq('medio_pago_id', medioPagoId)
    .eq('periodo', mesPeriodo) // Recibe la fecha formateada "2026-09-01"
    .limit(1)

  if (error) throw error
  
  return {
    actual: data?.[0] ?? null,
    anterior: null // Lo dejamos en null para no romper los seteos del componente, 
    // cambie la logica pensaba traer el anteior pero no es necesario, ya que el resumen anterior no se está usando en la vista
  }
}

export async function agregarResumen(medioPagoId, fechaCierre, fechaVencimiento) {
  const periodo = `${fechaVencimiento.slice(0, 7)}-01`
  const { data, error } = await supabase
    .from('resumenes')
    .insert({
      medio_pago_id: medioPagoId,
      fecha_cierre: fechaCierre,
      fecha_vencimiento: fechaVencimiento,
      periodo,
      activo: true,
    })
    .select()

  if (error) throw error
  return data[0]
}



//- funciones para proyectos especiales Obra constucción y ahorro vivienda etc

export async function getProyectos() {
  const { data, error } = await supabase
    .from('proyectos')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

  export async function getResumenProyecto(id) {
    const [resumen, rubros, proveedores] = await Promise.all([
      supabase.rpc('resumen_proyecto', { p_proyecto_id: id }),
      supabase.rpc('resumen_proyecto_rubro', { p_proyecto_id: id }),
      supabase.rpc('resumen_proyecto_proveedor', { p_proyecto_id: id }),
    ])

    if (resumen.error) throw resumen.error
    if (rubros.error) throw rubros.error
    if (proveedores.error) throw proveedores.error

    return {
      ...resumen.data?.[0],
      porRubro: rubros.data ?? [],
      proveedores: proveedores.data ?? [],
    }
  }

/*
export async function getMovimientosProyecto(id) {
  const { data, error } = await supabase.rpc('movimientos_proyecto', {
    p_proyecto_id: id,
  })
  if (error) throw error
  return data ?? []
}
*/

// reemplazo la funcion orginal por una que use la vista vw_movimientos_proyecto, para poder filtrar por id_proyecto y ordenar por fecha
export async function getMovimientosProyecto(id) {
  const { data, error } = await supabase
    .from('vw_movimientos_proyecto')
    .select('*')
    .eq('id_proyecto', id)
    .order('fecha', { ascending: false })
  if (error) throw error
  return data ?? []
}


// funcion para prestamos (aca separo la hipoteca ya que es un gasto que me ensucia los movimientos corrientes)

export async function getPrestamos() {
  const { data, error } = await supabase
    .from('prestamos')
    .select('*')
    .order('created_at')
  if (error) throw error
  return data ?? []
}

export async function getCuotasPrestamo(id) {
  const { data, error } = await supabase
    .from('vw_prestamo_cuotas')
    .select('*')
    .eq('id_prestamo', id)
    .order('nro_cuota')
  if (error) throw error
  return data ?? []
}