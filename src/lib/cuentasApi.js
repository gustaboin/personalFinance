import { supabase } from "./supabaseClient";

// --- Cuentas / Saldos ---

// PGRST303 "JWT issued at future": desfase de reloj momentáneo entre los
// servicios de Supabase. Se reintenta unas veces antes de dar error.
async function conReintento(fn, intentos = 3, esperaMs = 1500) {
  for (let i = 0; ; i++) {
    const res = await fn();
    if (res.error?.code === "PGRST303" && i < intentos - 1) {
      await new Promise((r) => setTimeout(r, esperaMs));
      continue;
    }
    return res;
  }
}

export async function getCuentas() {
  const { data, error } = await conReintento(() =>
    supabase
      .from("vw_saldo_cuentas")
      .select("*")
      .order("tipo", { ascending: true })
      .order("nombre", { ascending: true }),
  );
  if (error) throw error;
  const filas = data ?? [];

  // vw_saldo_cuentas no trae la moneda: se toma siempre de la tabla cuentas
  const { data: monedas, error: e2 } = await conReintento(() =>
    supabase.from("cuentas").select("id, moneda"),
  );
  if (e2) throw e2;
  const porId = Object.fromEntries(
    (monedas ?? []).map((c) => [c.id, (c.moneda ?? "").trim()]),
  );
  return filas.map((f) => ({ ...f, moneda: porId[f.id] ?? f.moneda }));
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
// Si las cuentas tienen distinta moneda (venta/compra de divisas):
//   importe         = lo que sale de la cuenta origen (en su moneda)
//   importe_destino = lo que entra a la cuenta destino (en su moneda)
//   tc              = tipo de cambio usado
// Requiere haber corrido setup-transferencias-divisas.sql

export async function addTransferencia({
  fecha,
  cuenta_origen_id,
  cuenta_destino_id,
  importe,
  concepto,
  importe_destino = null,
  tc = null,
}) {
  const { error } = await supabase.from("transferencias").insert({
    fecha,
    cuenta_origen_id,
    cuenta_destino_id,
    importe,
    concepto,
    importe_destino,
    tc,
  });
  if (error) throw error;
}

export async function getTransferenciasRecientes(limit = 15) {
  const { data, error } = await supabase
    .from("transferencias")
    .select(
      "id, fecha, importe, importe_destino, tc, concepto, origen:cuenta_origen_id(nombre, moneda), destino:cuenta_destino_id(nombre, moneda)",
    )
    .order("fecha", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function deleteTransferencia(id) {
  const { error } = await supabase.from("transferencias").delete().eq("id", id);
  if (error) throw error;
}
