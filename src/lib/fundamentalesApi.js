import { supabase } from "./supabaseClient";

// Datos de la ficha de un ticker (los carga la Edge Function sync-fundamentales) --

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
