// supabase/functions/sync-fundamentales/index.ts
//
// Trae de Yahoo Finance, para cada ticker activo de `tickers_seguidos`:
//   1) Fundamentales anuales (resultados, balance, flujo de caja) -> tabla `fundamentales`
//   2) Dividendos (fecha ex + monto por acción)                   -> tabla `dividendos`
// Hace upsert, así que se puede correr cuantas veces quieras.
//
// Los ETFs (SPY, QQQ, VEA, ...) no tienen estados contables: la función lo
// registra como "sin fundamentales" y sigue con los dividendos.
//
// Deploy: supabase functions deploy sync-fundamentales
// Test de UN ticker (recomendado la primera vez):
// curl -i -X POST https://<proyecto>.supabase.co/functions/v1/sync-fundamentales \
//   -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
//   -H "apikey: <SERVICE_ROLE_KEY>" \
//   -H "Content-Type: application/json" -d '{"ticker":"XOM"}'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const METRICAS = [
  // Estado de resultados
  'annualTotalRevenue',
  'annualNetIncome',
  'annualOperatingIncome',
  'annualGrossProfit',
  'annualDilutedEPS',
  // Balance
  'annualTotalAssets',
  'annualTotalLiabilitiesNetMinorityInterest',
  'annualStockholdersEquity',
  'annualCashAndCashEquivalents',
  'annualLongTermDebt',
  // Flujo de caja
  'annualOperatingCashFlow',
  'annualFreeCashFlow',
  'annualCapitalExpenditure',
  'annualCashDividendsPaid',
]

const PERIODO_DESDE = 1546300800 // 2019-01-01: Yahoo devuelve lo que tenga (suelen ser ~4-5 años)
const PAUSA_MS = 400
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

// "annualTotalRevenue" -> "totalRevenue"
function nombreMetrica(tipo: string) {
  const sinPrefijo = tipo.replace(/^annual/, '')
  return sinPrefijo.charAt(0).toLowerCase() + sinPrefijo.slice(1)
}

async function traerFundamentales(ticker: string) {
  const periodo2 = Math.floor(Date.now() / 1000)
  const url =
    `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${ticker}` +
    `?symbol=${ticker}&type=${METRICAS.join(',')}&merge=false&period1=${PERIODO_DESDE}&period2=${periodo2}`

  const res = await fetch(url, { headers: HEADERS })
  const texto = await res.text()
  if (!res.ok || !texto) throw new Error(`fundamentales status ${res.status}`)

  const data = JSON.parse(texto)
  const bloques: any[] = data?.timeseries?.result ?? []
  const filas: any[] = []

  for (const bloque of bloques) {
    const tipo: string | undefined = bloque?.meta?.type?.[0]
    if (!tipo) continue
    const puntos: any[] = bloque[tipo] ?? [] // puede faltar si Yahoo no tiene esa métrica
    for (const p of puntos) {
      const valor = p?.reportedValue?.raw
      if (valor == null || !p?.asOfDate) continue
      filas.push({
        ticker,
        metrica: nombreMetrica(tipo),
        fecha_periodo: p.asOfDate,
        valor,
        moneda: p.currencyCode ?? null,
        actualizado_en: new Date().toISOString(),
      })
    }
  }
  return filas
}

async function traerDividendos(ticker: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=10y&interval=1mo&events=div`
  const res = await fetch(url, { headers: HEADERS })
  const texto = await res.text()
  if (!res.ok || !texto) throw new Error(`dividendos status ${res.status}`)

  const result = JSON.parse(texto)?.chart?.result?.[0]
  const moneda = result?.meta?.currency ?? null
  const divs = result?.events?.dividends ?? {} // { "<timestamp>": { amount, date } }

  return Object.values(divs)
    .filter((d: any) => d?.amount != null && d?.date)
    .map((d: any) => ({
      ticker,
      fecha_ex: new Date(d.date * 1000).toISOString().slice(0, 10), // la fecha de Yahoo es la ex-dividendo
      monto: d.amount,
      moneda,
      actualizado_en: new Date().toISOString(),
    }))
}

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Si viene {"ticker":"XOM"} procesa solo ese
  let soloTicker: string | null = null
  try {
    const body = await req.json()
    soloTicker = body?.ticker ? String(body.ticker).toUpperCase() : null
  } catch (_) {
    /* sin body: procesa todos */
  }

  let consulta = supabase.from('tickers_seguidos').select('ticker').eq('activo', true)
  if (soloTicker) consulta = consulta.eq('ticker', soloTicker)
  const { data: tickers, error: errorTickers } = await consulta

  if (errorTickers) {
    return new Response(JSON.stringify({ error: errorTickers.message }), { status: 500 })
  }
  if (!tickers || tickers.length === 0) {
    return new Response(JSON.stringify({ ok: true, mensaje: 'No hay tickers para sincronizar' }), { status: 200 })
  }

  const detalle: any[] = []

  for (const { ticker } of tickers) {
    const item: any = { ticker }

    try {
      const filas = await traerFundamentales(ticker)
      if (filas.length === 0) {
        item.fundamentales = 'sin datos (¿ETF?)'
      } else {
        const { error } = await supabase
          .from('fundamentales')
          .upsert(filas, { onConflict: 'ticker,metrica,fecha_periodo' })
        item.fundamentales = error ? `error: ${error.message}` : filas.length
      }
    } catch (err) {
      item.fundamentales = `error: ${String(err)}`
    }

    try {
      const filas = await traerDividendos(ticker)
      if (filas.length === 0) {
        item.dividendos = 0
      } else {
        const { error } = await supabase
          .from('dividendos')
          .upsert(filas, { onConflict: 'ticker,fecha_ex' })
        item.dividendos = error ? `error: ${error.message}` : filas.length
      }
    } catch (err) {
      item.dividendos = `error: ${String(err)}`
    }

    console.log(JSON.stringify(item))
    detalle.push(item)
    await dormir(PAUSA_MS)
  }

  return new Response(JSON.stringify({ ok: true, detalle }), { status: 200 })
})