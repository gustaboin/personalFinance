// supabase/functions/sync-cotizaciones/index.ts
//
// Trae el precio de cierre diario (en USD) de cada ticker activo en
// `tickers_seguidos`, usando Stooq (gratis, sin API key), y hace upsert
// en `cotizaciones_activos`. Pide un rango de 7 días para auto-completar
// huecos si el cron falló algún día (fines de semana no tienen cotización).
//
// Deploy: supabase functions deploy sync-cotizaciones
// Test manual:
// curl -i -X POST https://<proyecto>.supabase.co/functions/v1/sync-cotizaciones \
//   -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
//   -H "apikey: <SERVICE_ROLE_KEY>" \
//   -H "Content-Type: application/json" -d "{}"

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DIAS_HACIA_ATRAS = 7

function timestampAFecha(ts: number) {
  // Yahoo devuelve timestamps en segundos (epoch UTC)
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: tickers, error: errorTickers } = await supabase
    .from('tickers_seguidos')
    .select('ticker')
    .eq('activo', true)

  if (errorTickers) {
    return new Response(JSON.stringify({ error: errorTickers.message }), { status: 500 })
  }

  if (!tickers || tickers.length === 0) {
    return new Response(JSON.stringify({ ok: true, mensaje: 'No hay tickers activos para sincronizar' }), { status: 200 })
  }

  const filasParaGuardar: any[] = []
  const resultados: { ticker: string; ok: boolean; motivo?: string; filas?: number }[] = []

  for (const { ticker } of tickers) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${DIAS_HACIA_ATRAS}d&interval=1d`

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        },
      })
      const texto = await res.text()

      console.log(`[${ticker}] status=${res.status} largo=${texto.length} muestra="${texto.slice(0, 150)}"`)

      if (!res.ok || !texto) {
        resultados.push({ ticker, ok: false, motivo: `sin datos (status ${res.status})` })
        continue
      }

      const data = JSON.parse(texto)
      const result = data?.chart?.result?.[0]
      const timestamps: number[] = result?.timestamp ?? []
      const cierres: number[] = result?.indicators?.quote?.[0]?.close ?? []

      if (timestamps.length === 0 || cierres.length === 0) {
        resultados.push({ ticker, ok: false, motivo: 'respuesta sin datos de precio' })
        continue
      }

      let filasTicker = 0
      timestamps.forEach((ts, i) => {
        const precio = cierres[i]
        if (precio == null) return // Yahoo mete null en días sin cierre (feriados)
        filasParaGuardar.push({
          ticker,
          fecha: timestampAFecha(ts),
          precio_usd: precio,
        })
        filasTicker++
      })

      resultados.push({ ticker, ok: true, filas: filasTicker })
    } catch (err) {
      resultados.push({ ticker, ok: false, motivo: String(err) })
    }
  }

  if (filasParaGuardar.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, mensaje: 'Sin cotizaciones nuevas para guardar', detalle: resultados }),
      { status: 200 }
    )
  }

  const { error } = await supabase
    .from('cotizaciones_activos')
    .upsert(filasParaGuardar, { onConflict: 'ticker,fecha' })

  if (error) {
    return new Response(JSON.stringify({ error: error.message, detalle: resultados }), { status: 500 })
  }

  return new Response(
    JSON.stringify({ ok: true, filasGuardadas: filasParaGuardar.length, detalle: resultados }),
    { status: 200 }
  )
})
