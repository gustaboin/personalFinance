// supabase/functions/sync-dolar/index.ts
//
// Trae la cotización USD oficial (compra/venta reales) de api.argentinadatos.com
// para los últimos días, y hace upsert en la tabla `monedas`.
// Como la API es por fecha puntual (no por rango), se pide una por una —
// así, si el cron falló algún día, el día siguiente se auto-completa el hueco.
//
// Deploy: supabase functions deploy sync-dolar
// Test manual:
// curl -i -X POST https://<proyecto>.supabase.co/functions/v1/sync-dolar \
//   -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
//   -H "apikey: <SERVICE_ROLE_KEY>" \
//   -H "Content-Type: application/json" -d "{}"

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DIAS_HACIA_ATRAS = 5 // cubre fines de semana + algún feriado sin generar huecos

function formatearFechaApi(d: Date) {
  // La API espera YYYY/MM/DD
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}/${m}/${day}`
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const resultados: { fecha: string; ok: boolean; motivo?: string }[] = []
  const filasParaGuardar: any[] = []

  for (let i = 0; i <= DIAS_HACIA_ATRAS; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const fechaApi = formatearFechaApi(d)

    try {
      const res = await fetch(`https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial/${fechaApi}`)
      const texto = await res.text()

      if (!res.ok || !texto) {
        // Normal para fines de semana / feriados: esa fecha no tiene cotización. No es un error.
        resultados.push({ fecha: fechaApi, ok: false, motivo: `status ${res.status}` })
        continue
      }

      const data = JSON.parse(texto)

      if (data?.compra == null || data?.venta == null || !data?.fecha) {
        resultados.push({ fecha: fechaApi, ok: false, motivo: 'respuesta incompleta' })
        continue
      }

      filasParaGuardar.push({
        fecha: data.fecha, // ya viene como YYYY-MM-DD
        moneda: 'USD',
        valorcompra: data.compra,
        valorventa: data.venta,
      })
      resultados.push({ fecha: fechaApi, ok: true })
    } catch (err) {
      resultados.push({ fecha: fechaApi, ok: false, motivo: String(err) })
    }
  }

  if (filasParaGuardar.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, mensaje: 'Sin cotizaciones nuevas para guardar', detalle: resultados }),
      { status: 200 }
    )
  }

  const { error } = await supabase
    .from('monedas')
    .upsert(filasParaGuardar, { onConflict: 'fecha,moneda' })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  return new Response(
    JSON.stringify({ ok: true, filasGuardadas: filasParaGuardar.length, detalle: resultados }),
    { status: 200 }
  )
})
