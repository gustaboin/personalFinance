import { useEffect, useState } from 'react'
import MonthSwitcher from '../components/MonthSwitcher'
import { currentMesPeriodo, formatARS } from '../lib/format'
import { getCategorias, getPresupuestos, setPresupuesto, getResumenCategoria } from '../lib/api'

export default function Presupuesto() {
  const [mesPeriodo, setMesPeriodo] = useState(currentMesPeriodo())
  const [categorias, setCategorias] = useState([])
  const [presupuestos, setPresupuestos] = useState([])
  const [resumen, setResumen] = useState([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState(null) // categoria_id en edicion
  const [valorEdit, setValorEdit] = useState('')

  async function cargar() {
    setLoading(true)
    const [cats, pres, res] = await Promise.all([
      getCategorias(),
      getPresupuestos(mesPeriodo),
      getResumenCategoria(mesPeriodo),
    ])
    setCategorias(cats.filter((c) => c.tipo === 'Egreso'))
    setPresupuestos(pres)
    setResumen(res)
    setLoading(false)
  }

  useEffect(() => { cargar() }, [mesPeriodo])

  function objetivoDe(categoriaId) {
    const p = presupuestos.find((p) => p.categoria_id === categoriaId)
    return p ? Number(p.monto_objetivo) : 0
  }

  function realDe(categoriaNombre) {
    const r = resumen.find((r) => r.categoria === categoriaNombre)
    return r ? Number(r.total_ars) : 0
  }

  async function guardarObjetivo(categoriaId) {
    const monto = Number(valorEdit)
    if (!monto || monto < 0) { setEditando(null); return }
    await setPresupuesto({ categoria_id: categoriaId, monto_objetivo: monto, moneda: 'ARS', vigente_desde: mesPeriodo })
    setEditando(null)
    setValorEdit('')
    await cargar()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Presupuesto vs Real</h2>
        <MonthSwitcher mesPeriodo={mesPeriodo} onChange={setMesPeriodo} />
      </div>
      <p className="text-sm text-slate-500 -mt-4">
        Definí cuánto querés gastar como máximo por categoría. El objetivo queda vigente desde el mes en que lo cargues en adelante, hasta que lo cambies de nuevo.
      </p>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Categoría</th>
              <th className="text-right px-4 py-2">Objetivo</th>
              <th className="text-right px-4 py-2">Real</th>
              <th className="text-right px-4 py-2">Diferencia</th>
              <th className="text-right px-4 py-2">% usado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center text-slate-400 py-6">Cargando...</td></tr>
            ) : (
              categorias.map((c) => {
                const objetivo = objetivoDe(c.id)
                const real = realDe(c.nombre)
                const diferencia = objetivo - real
                const pct = objetivo > 0 ? (real / objetivo) * 100 : null
                return (
                  <tr key={c.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium text-slate-800">{c.nombre}</td>
                    <td className="px-4 py-2 text-right">
                      {editando === c.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            autoFocus
                            type="number"
                            value={valorEdit}
                            onChange={(e) => setValorEdit(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && guardarObjetivo(c.id)}
                            className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-sm"
                          />
                          <button onClick={() => guardarObjetivo(c.id)} className="text-xs text-emerald-600">OK</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditando(c.id); setValorEdit(objetivo || '') }}
                          className="hover:underline decoration-dotted"
                        >
                          {objetivo > 0 ? formatARS(objetivo) : <span className="text-slate-300">Definir</span>}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-600">{formatARS(real)}</td>
                    <td className={`px-4 py-2 text-right font-medium ${diferencia < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {objetivo > 0 ? formatARS(diferencia) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-500">
                      {pct === null ? '—' : `${pct.toFixed(0)}%`}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
