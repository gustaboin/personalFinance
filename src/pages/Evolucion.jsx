import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { currentMesPeriodo, mesLabel, ultimosNMeses, formatARS } from '../lib/format'
import { getResumenCategoriaRango } from '../lib/api'

const RANGOS = [
  { label: '6 meses', n: 6 },
  { label: '12 meses', n: 12 },
  { label: '24 meses', n: 24 },
]

// Paleta fija para que cada categoria mantenga siempre el mismo color
const COLORES = [
  '#0f172a', '#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed',
  '#0891b2', '#be185d', '#65a30d', '#ea580c', '#4338ca', '#0d9488',
  '#b45309', '#9333ea', '#15803d',
]

export default function Evolucion() {
  const [rangoN, setRangoN] = useState(12)
  const [datos, setDatos] = useState([])
  const [loading, setLoading] = useState(true)

  const meses = useMemo(() => ultimosNMeses(currentMesPeriodo(), rangoN), [rangoN])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getResumenCategoriaRango(meses[0], meses[meses.length - 1]).then((data) => {
      if (!cancelled) {
        setDatos(data.filter((d) => d.tipo === 'Egreso'))
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [meses])

  // Categorias ordenadas por gasto total en el rango (las mas grandes primero)
  const categorias = useMemo(() => {
    const totales = new Map()
    for (const d of datos) {
      totales.set(d.categoria, (totales.get(d.categoria) || 0) + Number(d.total_ars))
    }
    return Array.from(totales.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([cat]) => cat)
  }, [datos])

  // Datos pivotados para el grafico: un objeto por mes con {mes, [categoria]: total, ...}
  const chartData = useMemo(() => {
    return meses.map((mes) => {
      const row = { mes: mesLabel(mes).slice(0, 3) + '-' + mes.slice(2, 4) }
      for (const cat of categorias) {
        const found = datos.find((d) => d.mes_periodo === mes && d.categoria === cat)
        row[cat] = found ? Number(found.total_ars) : 0
      }
      return row
    })
  }, [meses, categorias, datos])

  // Tabla pivotada: categoria -> {mes: total}, mas media y desvio para marcar outliers
  const tabla = useMemo(() => {
    return categorias.map((cat) => {
      const valores = meses.map((mes) => {
        const found = datos.find((d) => d.mes_periodo === mes && d.categoria === cat)
        return found ? Number(found.total_ars) : 0
      })
      const noCero = valores.filter((v) => v > 0)
      const media = noCero.length ? noCero.reduce((a, b) => a + b, 0) / noCero.length : 0
      return { categoria: cat, valores, media }
    })
  }, [categorias, meses, datos])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Evolución</h2>
          <p className="text-sm text-slate-500">Comparación mes a mes por categoría — útil para detectar algo desfasado o mal cargado.</p>
        </div>
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {RANGOS.map((r) => (
            <button
              key={r.n}
              onClick={() => setRangoN(r.n)}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition ${
                rangoN === r.n ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm">Cargando...</p>
      ) : (
        <>
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <ResponsiveContainer width="100%" height={380}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" fontSize={12} />
                <YAxis tickFormatter={(v) => formatARS(v)} fontSize={11} width={90} />
                <Tooltip formatter={(v) => formatARS(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {categorias.slice(0, 10).map((cat, i) => (
                  <Bar key={cat} dataKey={cat} stackId="a" fill={COLORES[i % COLORES.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
            {categorias.length > 10 && (
              <p className="text-xs text-slate-400 mt-2">
                Mostrando las 10 categorías de mayor gasto del período. El resto se ve en la tabla de abajo.
              </p>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 sticky left-0 bg-slate-50">Categoría</th>
                  {meses.map((mes) => (
                    <th key={mes} className="text-right px-3 py-2 whitespace-nowrap">{mesLabel(mes).slice(0, 3)}-{mes.slice(2, 4)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tabla.map(({ categoria, valores, media }) => (
                  <tr key={categoria} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium text-slate-800 sticky left-0 bg-white whitespace-nowrap">{categoria}</td>
                    {valores.map((v, i) => {
                      const esOutlier = media > 0 && v > media * 1.8
                      return (
                        <td
                          key={meses[i]}
                          className={`px-3 py-2 text-right whitespace-nowrap ${
                            esOutlier ? 'bg-amber-50 text-amber-700 font-semibold' : v === 0 ? 'text-slate-300' : 'text-slate-700'
                          }`}
                          title={esOutlier ? 'Bastante más alto que el resto de los meses de esta categoría — vale la pena revisarlo' : undefined}
                        >
                          {v === 0 ? '—' : formatARS(v)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400">
            Resaltado en naranja: meses donde una categoría gastó bastante más que su propio promedio — no necesariamente está mal, pero es un buen punto de partida para revisar.
          </p>
        </>
      )}
    </div>
  )
}
