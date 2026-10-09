import { supabase } from "./supabaseClient";

// --- Cuentas / Saldos ---

export async function getCuentas() {
  const { data, error } = await supabase
    .from("vw_saldo_cuentas")
    .select("*")
    .order("tipo", { ascending: true })
    .order("nombre", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getHistorialCuenta(cuentaId, limit = 30) {
  const { data, error } = await supabase
    .from("vw_historial_cuenta")
    .select("*")
    .eq("cuenta_id", cuentaId)
    .order("fecha", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// --- Transferencias ---

export async function addTransferencia({
  fecha,
  cuenta_origen_id,
  cuenta_destino_id,
  importe,
  concepto,
}) {
  const { error } = await supabase
    .from("transferencias")
    .insert({ fecha, cuenta_origen_id, cuenta_destino_id, importe, concepto });
  if (error) throw error;
}

export async function getTransferenciasRecientes(limit = 15) {
  const { data, error } = await supabase
    .from("transferencias")
    .select(
      "id, fecha, importe, concepto, origen:cuenta_origen_id(nombre), destino:cuenta_destino_id(nombre)",
    )
    .order("fecha", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function deleteTransferencia(id) {
  const { error } = await supabase.from("transferencias").delete().eq("id", id);
  if (error) throw error;
}
