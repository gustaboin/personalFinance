import { supabase } from "./supabaseClient";

// --- Lectura ---

// cuentaId = null -> todas las cuentas
export async function getPosiciones(cuentaId) {
  let q = supabase.from("vw_inversiones_valuacion").select("*");
  if (cuentaId) q = q.eq("cuenta_id", cuentaId);
  const { data, error } = await q.order("fecha_operacion", {
    ascending: false,
  });
  if (error) throw error;
  return data ?? [];
}

export async function getResumenCuenta(cuentaId) {
  const { data, error } = await supabase
    .from("vw_inversiones_resumen_cuenta")
    .select("*")
    .eq("cuenta_id", cuentaId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getResumenPorTicker() {
  const { data, error } = await supabase
    .from("vw_inversiones_resumen_ticker")
    .select("*");
  if (error) throw error;
  return data ?? [];
}

// --- Exposición de la cartera (vistas vw_exposicion_*) ---
// Se traen las filas por cuenta y el total / agrupación por región se arma
// en el front: así un solo fetch sirve para "Todos los brokers" y para cada broker,
// y no depende del formato de vw_exposicion_region_total.

export async function getExposicionRama() {
  const { data, error } = await supabase
    .from("vw_exposicion_rama")
    .select("cuenta_id, rama, valor_usd");
  if (error) throw error;
  return data ?? [];
}

export async function getExposicionPais() {
  const { data, error } = await supabase
    .from("vw_exposicion_pais")
    .select("cuenta_id, region, pais, valor_usd");
  if (error) throw error;
  return data ?? [];
}

export async function getPin() {
  const { data, error } = await supabase
    .from("app_config")
    .select("valor")
    .eq("clave", "pin_inversiones")
    .single();
  if (error) throw error;
  return data.valor;
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
    .from("inversiones_posiciones")
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
      tc_ccl: moneda === "ARS" ? tcCcl : null,
      notas: notas || null,
    })
    .select()
    .single();

  if (errorPosicion) throw errorPosicion;

  // 2. Egreso real de la cuenta, mismo monto e igual moneda que la operación
  const nombreMedioPago = moneda === "ARS" ? "Balanz ARS" : "Balanz USD";

  const { data: medioPago, error: errorMedio } = await supabase
    .from("medios_pago")
    .select("id")
    .eq("nombre", nombreMedioPago)
    .single();

  if (errorMedio) {
    await supabase
      .from("inversiones_posiciones")
      .delete()
      .eq("id", posicion.id);
    throw errorMedio;
  }

  const { data: categoria, error: errorCategoria } = await supabase
    .from("categorias")
    .select("id")
    .eq("nombre", "Compra de activos")
    .single();

  if (errorCategoria) {
    await supabase
      .from("inversiones_posiciones")
      .delete()
      .eq("id", posicion.id);
    throw errorCategoria;
  }

  const { error: errorMovimiento } = await supabase.from("movimientos").insert({
    fecha: fechaOperacion,
    categoria_id: categoria.id,
    medio_pago_id: medioPago.id,
    concepto: `Compra ${cantidad} ${ticker}${boletoNumero ? " - Boleto " + boletoNumero : ""}`,
    moneda,
    importe: importeNeto,
    id_inversion: posicion.id,
  });

  if (errorMovimiento) {
    await supabase
      .from("inversiones_posiciones")
      .delete()
      .eq("id", posicion.id);
    throw errorMovimiento;
  }

  return posicion;
}

// --- Baja: elimina la posición Y el egreso que generó ---

export async function deleteCompraInversion(posicionId) {
  // Primero el movimiento vinculado (si existe)
  const { error: errorMov } = await supabase
    .from("movimientos")
    .delete()
    .eq("id_inversion", posicionId);
  if (errorMov) throw errorMov;

  const { error: errorPos } = await supabase
    .from("inversiones_posiciones")
    .delete()
    .eq("id", posicionId);
  if (errorPos) throw errorPos;
}

// --- Ventas (FIFO) ---
// Hace 3 cosas: 1) registra la venta  2) descuenta de las compras más viejas
// (inversiones_ventas_lotes)  3) registra el INGRESO en la cuenta del broker.
// Si un paso falla, deshace los anteriores a mano.

// cuentaId = null -> todas las cuentas
export async function getVentas(cuentaId) {
  let q = supabase.from("vw_inversiones_ventas_resumen").select("*");
  if (cuentaId) q = q.eq("cuenta_id", cuentaId);
  const { data, error } = await q.order("fecha_operacion", {
    ascending: false,
  });
  if (error) throw error;
  return data ?? [];
}

export async function addVentaInversion({
  cuentaId,
  ticker,
  boletoNumero,
  fechaOperacion,
  fechaLiquidacion,
  cantidad, // nominales de hoy que se venden
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
  // 1. Lotes disponibles, del más viejo al más nuevo (FIFO)
  const { data: lotes, error: errorLotes } = await supabase
    .from("vw_inversiones_valuacion")
    .select(
      "id, cantidad_restante, cantidad_actual, ratio_al_comprar, ratio_actual",
    )
    .eq("cuenta_id", cuentaId)
    .eq("ticker", ticker)
    .order("fecha_operacion", { ascending: true })
    .order("id", { ascending: true });
  if (errorLotes) throw errorLotes;

  const disponible = (lotes ?? []).reduce(
    (s, l) => s + Number(l.cantidad_actual),
    0,
  );
  if (!lotes?.length || cantidad > disponible + 1e-9) {
    throw new Error(
      `No alcanza: tenés ${disponible} nominales de ${ticker} en esta cuenta.`,
    );
  }

  // 2. Plan FIFO: en nominales de hoy, y convertido a unidades del boleto de compra
  let faltante = cantidad;
  const plan = [];
  for (const l of lotes) {
    if (faltante <= 1e-9) break;
    const enLote = Number(l.cantidad_actual);
    const tomar = Math.min(faltante, enLote);
    const factor =
      l.ratio_actual && l.ratio_al_comprar
        ? Number(l.ratio_al_comprar) / Number(l.ratio_actual)
        : 1;
    const compra = Math.min(tomar * factor, Number(l.cantidad_restante));
    plan.push({
      posicion_id: l.id,
      cantidad_compra: compra,
      cantidad_nominales: tomar,
    });
    faltante -= tomar;
  }

  // 3. Medio de pago de la cuenta (para que el ingreso sume saldo)
  const { data: medios, error: errorMedio } = await supabase
    .from("medios_pago")
    .select("id, nombre")
    .eq("cuenta_id", cuentaId);
  if (errorMedio) throw errorMedio;
  const medio = medios?.find((m) => m.nombre.includes(moneda)) ?? medios?.[0];
  if (!medio)
    throw new Error(
      "Esta cuenta no tiene un medio de pago vinculado (tabla medios_pago).",
    );

  const { data: categoria, error: errorCategoria } = await supabase
    .from("categorias")
    .select("id")
    .eq("nombre", "Venta de activos")
    .single();
  if (errorCategoria) throw errorCategoria;

  // 4. Venta
  const { data: venta, error: errorVenta } = await supabase
    .from("inversiones_ventas")
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
      tc_ccl: moneda === "ARS" ? tcCcl || null : null,
      tc_mep: moneda === "ARS" ? tcMep || null : null,
      notas: notas || null,
    })
    .select()
    .single();
  if (errorVenta) throw errorVenta;

  // 5. Lotes consumidos
  const { error: errorLotesIns } = await supabase
    .from("inversiones_ventas_lotes")
    .insert(plan.map((p) => ({ ...p, venta_id: venta.id })));
  if (errorLotesIns) {
    await supabase.from("inversiones_ventas").delete().eq("id", venta.id);
    throw errorLotesIns;
  }

  // 6. Ingreso en la cuenta
  const { error: errorMov } = await supabase.from("movimientos").insert({
    fecha: fechaOperacion,
    categoria_id: categoria.id,
    medio_pago_id: medio.id,
    concepto: `Venta ${cantidad} ${ticker}${boletoNumero ? " - Boleto " + boletoNumero : ""}`,
    moneda,
    importe: importeNeto,
    id_venta_inversion: venta.id,
  });
  if (errorMov) {
    await supabase.from("inversiones_ventas").delete().eq("id", venta.id); // borra los lotes en cascada
    throw errorMov;
  }

  return venta;
}

// Baja de una venta: borra el ingreso, los lotes (cascada) y la venta.
// Las compras recuperan automáticamente lo que se les había descontado.
export async function deleteVentaInversion(ventaId) {
  const { error: errorMov } = await supabase
    .from("movimientos")
    .delete()
    .eq("id_venta_inversion", ventaId);
  if (errorMov) throw errorMov;
  const { error } = await supabase
    .from("inversiones_ventas")
    .delete()
    .eq("id", ventaId);
  if (error) throw error;
}
