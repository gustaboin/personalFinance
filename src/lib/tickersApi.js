import { supabase } from "./supabaseClient";

// Catálogo de activos seguidos (independiente de los brokers).
// Tablas: tickers_seguidos, ratios_historicos, vw_ultima_cotizacion.

// Todos los tickers con su ratio vigente y último precio
export async function getCatalogo() {
  const [t, r, p] = await Promise.all([
    supabase.from("tickers_seguidos").select("ticker, nombre, activo").order("ticker"),
    supabase
      .from("ratios_historicos")
      .select("ticker, ratio, fecha_desde")
      .is("fecha_hasta", null),
    supabase.from("vw_ultima_cotizacion").select("ticker, precio_usd, fecha"),
  ]);
  if (t.error) throw t.error;
  if (r.error) throw r.error;
  if (p.error) throw p.error;

  const ratios = Object.fromEntries((r.data ?? []).map((x) => [x.ticker, x]));
  const precios = Object.fromEntries((p.data ?? []).map((x) => [x.ticker, x]));
  return (t.data ?? []).map((x) => ({
    ...x,
    ratio: ratios[x.ticker]?.ratio ?? null,
    precio_usd: precios[x.ticker]?.precio_usd ?? null,
    fecha_precio: precios[x.ticker]?.fecha ?? null,
  }));
}

// Alta de un ticker: primero tickers_seguidos y después su ratio vigente
export async function addTicker({ ticker, nombre, ratio = 1, fechaDesde = "2020-01-01" }) {
  const t = String(ticker).trim().toUpperCase();
  if (!t) throw new Error("Falta el ticker");

  const { error: e1 } = await supabase
    .from("tickers_seguidos")
    .insert({ ticker: t, nombre: nombre?.trim() || null, activo: true });
  if (e1) {
    if (e1.code === "23505") throw new Error(`${t} ya existe en el catálogo`);
    throw e1;
  }

  const { error: e2 } = await supabase
    .from("ratios_historicos")
    .insert({ ticker: t, ratio: Number(ratio) || 1, fecha_desde: fechaDesde, fecha_hasta: null });
  if (e2) {
    // rollback para no dejar un ticker sin ratio
    await supabase.from("tickers_seguidos").delete().eq("ticker", t);
    throw e2;
  }
  return t;
}

export async function updateTicker(ticker, campos) {
  const { error } = await supabase.from("tickers_seguidos").update(campos).eq("ticker", ticker);
  if (error) throw error;
}

// Cambio de ratio (split del CEDEAR): cierra el tramo vigente el día anterior y abre uno nuevo
export async function cambiarRatio(ticker, nuevoRatio, fechaDesde) {
  const desde = new Date(fechaDesde + "T00:00:00");
  desde.setDate(desde.getDate() - 1);
  const cierre = desde.toISOString().slice(0, 10);

  const { error: e1 } = await supabase
    .from("ratios_historicos")
    .update({ fecha_hasta: cierre })
    .eq("ticker", ticker)
    .is("fecha_hasta", null);
  if (e1) throw e1;

  const { error: e2 } = await supabase
    .from("ratios_historicos")
    .insert({ ticker, ratio: Number(nuevoRatio), fecha_desde: fechaDesde, fecha_hasta: null });
  if (e2) throw e2;
}

// Corrige el ratio vigente sin crear un tramo nuevo (cuando lo cargaste mal)
export async function corregirRatioVigente(ticker, ratio) {
  const { error } = await supabase
    .from("ratios_historicos")
    .update({ ratio: Number(ratio) })
    .eq("ticker", ticker)
    .is("fecha_hasta", null);
  if (error) throw error;
}

// Dispara la carga de datos de un ticker nuevo (fundamentales, dividendos y cotizaciones)
export async function sincronizarTicker(ticker) {
  const resultados = {};
  const f = await supabase.functions.invoke("sync-fundamentales", { body: { ticker } });
  resultados.fundamentales = f.error ? f.error.message : "ok";
  const c = await supabase.functions.invoke("sync-cotizaciones", { body: {} });
  resultados.cotizaciones = c.error ? c.error.message : "ok";
  return resultados;
}
