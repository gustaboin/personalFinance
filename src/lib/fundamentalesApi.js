import { supabase } from "./supabaseClient";

// Datos de la ficha de un ticker (los carga la Edge Function sync-fundamentales)

export async function getInfoTicker(ticker) {
  const { data, error } = await supabase
    .from("tickers_seguidos")
    .select("ticker, nombre")
    .eq("ticker", ticker)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getFundamentales(ticker) {
  const { data, error } = await supabase
    .from("fundamentales")
    .select("metrica, fecha_periodo, valor, moneda, actualizado_en")
    .eq("ticker", ticker)
    .order("fecha_periodo", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getDividendos(ticker) {
  const { data, error } = await supabase
    .from("dividendos")
    .select("fecha_ex, monto, moneda")
    .eq("ticker", ticker)
    .order("fecha_ex", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Último precio del subyacente en USD (para estimar el yield)
export async function getUltimoPrecio(ticker) {
  const { data, error } = await supabase
    .from("vw_ultima_cotizacion")
    .select("precio_usd, fecha")
    .eq("ticker", ticker)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ---- Dividendos de la cartera ----

// Estimado cobrado en cada fecha ex (vista vw_dividendos_cartera). cuentaId = null -> todas
export async function getDividendosCartera(cuentaId) {
  let q = supabase
    .from("vw_dividendos_cartera")
    .select(
      "ticker, fecha_ex, dividendo_por_accion, acciones, estimado_usd, cuenta_id",
    );
  if (cuentaId) q = q.eq("cuenta_id", cuentaId);
  const { data, error } = await q.order("fecha_ex", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Dividendos por acción de los últimos 12 meses de todos los tickers (para proyectar)
export async function getDividendosUltimos12m() {
  const desde = new Date();
  desde.setFullYear(desde.getFullYear() - 1);
  const { data, error } = await supabase
    .from("dividendos")
    .select("ticker, fecha_ex, monto")
    .gte("fecha_ex", desde.toISOString().slice(0, 10));
  if (error) throw error;
  return data ?? [];
}
