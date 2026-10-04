// supabase/functions/sync-dolar/index.ts
//
// Trae la cotización USD del BCRA de los últimos días (para auto-completar
// huecos si el cron falló algún día) y hace upsert en la tabla `monedas`.
//
// Deploy: supabase functions deploy sync-dolar
// Test manual: curl -X POST https://<proyecto>.supabase.co/functions/v1/sync-dolar \
//                -H "Authorization: Bearer <ANON_O_SERVICE_KEY>"

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DIAS_HACIA_ATRAS = 5 // cubre fines de semana + algún feriado sin generar huecos

function formatearFecha(d: Date) {
  return d.toISOString().slice(0, 10) // YYYY-MM-DD
}

Deno.serve(async () => {
  try {
    const hoy = new Date()
    const desde = new Date(hoy)
    desde.setDate(desde.getDate() - DIAS_HACIA_ATRAS)

    const fechaDesde = formatearFecha(desde)
    const fechaHasta = formatearFecha(hoy)

    // La API del BCRA exige limit entre 10 y 1000 — nunca pasar un valor menor a 10
    const url = `https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones/USD?fechaDesde=${fechaDesde}&fechaHasta=${fechaHasta}&limit=10`

    const res = await fetch(url)

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `BCRA respondió ${res.status}` }),
        { status: 502 }
      )
    }

    const data = await res.json()
    const resultados = data?.results ?? []

    if (resultados.length === 0) {
      return new Response(JSON.stringify({ mensaje: 'Sin datos del BCRA en el rango', fechaDesde, fechaHasta }), { status: 200 })
    }

    // Cada "result" trae fecha + detalle[]. El detalle[0] tiene tipoCotizacion.
    const filas = resultados
      .map((r: any) => {
        const cot = r.detalle?.[0]?.tipoCotizacion
        if (cot == null) return null
        return {
          fecha: r.fecha,
          moneda: 'USD',
          valorcompra: cot,
          valorventa: cot,
        }
      })
      .filter(Boolean)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { error, count } = await supabase
      .from('monedas')
      .upsert(filas, { onConflict: 'fecha,moneda', count: 'exact' })

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }

    return new Response(
      JSON.stringify({ ok: true, filasGuardadas: filas.length, fechaDesde, fechaHasta }),
      { status: 200 }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
