// supabase/functions/sync-dolar/index.ts
//
// Trae USD oficial Y contado con liqui (CCL) de api.argentinadatos.com,
// para los últimos días, y hace upsert en `monedas`.
// Reusa la misma tabla: moneda='USD' (oficial), moneda='USD_CCL' (CCL).
// No agrega columnas nuevas, solo un valor nuevo en la columna moneda.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DIAS_HACIA_ATRAS = 5

// casa de argentinadatos -> cómo lo guardamos en monedas.moneda
const CASAS = [
  { casa: 'oficial', moneda: 'USD' },
  { casa: 'contadoconliqui', moneda: 'USD_CCL' },
  { casa: 'bolsa', moneda: 'USD_MEP' }
]

function formatearFechaApi(d: Date) {
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

  const filasParaGuardar: any[] = []
  const resultados: { casa: string; fecha: string; ok: boolean; motivo?: string }[] = []

  for (const { casa, moneda } of CASAS) {
    for (let i = 0; i <= DIAS_HACIA_ATRAS; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const fechaApi = formatearFechaApi(d)

      try {
        const res = await fetch(`https://api.argentinadatos.com/v1/cotizaciones/dolares/${casa}/${fechaApi}`)
        const texto = await res.text()

        if (!res.ok || !texto) {
          resultados.push({ casa, fecha: fechaApi, ok: false, motivo: `status ${res.status}` })
          continue
        }

        const data = JSON.parse(texto)

        if (data?.compra == null || data?.venta == null || !data?.fecha) {
          resultados.push({ casa, fecha: fechaApi, ok: false, motivo: 'respuesta incompleta' })
          continue
        }

        filasParaGuardar.push({
          fecha: data.fecha,
          moneda,
          valorcompra: data.compra,
          valorventa: data.venta,
        })
        resultados.push({ casa, fecha: fechaApi, ok: true })
      } catch (err) {
        resultados.push({ casa, fecha: fechaApi, ok: false, motivo: String(err) })
      }
    }
  }

  if (filasParaGuardar.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, mensaje: 'Sin cotizaciones nuevas', detalle: resultados }),
      { status: 200 }
    )
  }

  const { error } = await supabase
    .from('monedas')
    .upsert(filasParaGuardar, { onConflict: 'fecha,moneda' })

  if (error) {
    return new Response(JSON.stringify({ error: error.message, detalle: resultados }), { status: 500 })
  }

  return new Response(
    JSON.stringify({ ok: true, filasGuardadas: filasParaGuardar.length, detalle: resultados }),
    { status: 200 }
  )
})
