import { supabase } from "./supabaseClient";

// --- Lectura ---

export async function getPosiciones(cuentaId) {
  const { data, error } = await supabase
    .from("vw_inversiones_valuacion")
    .select("*")
    .eq("cuenta_id", cuentaId)
    .order("fecha_operacion", { ascending: false });
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
// 1) registra la posición  2) registra el egreso real de la cuenta (Balanz ARS o Balanz USD según la moneda de la compra).
// No está envuelto en una transacción SQL real -- si el segundo paso falla, borrar el primero a mano (catch).

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
