import { useEffect, useState } from 'react'
import { formatARS } from '../lib/format'
import { getCategorias, getMediosPago, getComprasCuotas, addCompraCuotas, deleteCompraCuotas } from '../lib/api'

const HOY = new Date().toISOString().slice(0, 10)

export default function Cuotas() {
  const [categorias, setCategorias] = useState([])
  const [medios, setMedios] = useState([])
  const [compras, setCompras] = useState([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  const [form, setForm] = useState({
    fecha_compra: HOY,
    comercio: '',
    categoria_id: '',
    medio_pago_id: '',
    moneda: 'ARS',
    monto_total: '',
    cantidad_cuotas: '',
    notas: '',
  })

  async function cargarTodo() {
    setLoading(true)
    const [cats, meds, comprasData] = await Promise.all([getCategorias(), getMediosPago(), getComprasCuotas()])
    setCategorias(cats)
    setMedios(meds)
    setCompras(comprasData)
    setLoading(false)
  }

  useEffect(() => { cargarTodo() }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!form.comercio || !form.categoria_id || !form.medio_pago_id || !form.monto_total || !form.cantidad_cuotas) {
      setError('Completá comercio, categoría, medio de pago, monto total y cantidad de cuotas.')
      return
    }
    setGuardando(true)
    try {
      await addCompraCuotas({
        fecha_compra: form.fecha_compra,
        comercio: form.comercio,
        categoria_id: Number(form.categoria_id),
        medio_pago_id: Number(form.medio_pago_id),
        moneda: form.moneda,
        monto_total: Number(form.monto_total),
        cantidad_cuotas: Number(form.cantidad_cuotas),
        notas: form.notas || null,
      })
      setForm({ ...form, comercio: '', monto_total: '', cantidad_cuotas: '', notas: '' })
      const comprasData = await getComprasCuotas()
      setCompras(comprasData)
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta compra? También se borran las cuotas generadas.')) return
    await deleteCompraCuotas(id)
    const comprasData = await getComprasCuotas()
    setCompras(comprasData)
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-900">Compras en cuotas</h2>
      <p className="text-sm text-slate-500 -mt-4">
        Cargá la compra una sola vez. El cronograma de vencimientos mes a mes se calcula solo — nunca necesitás volver a editar esta compra.
      </p>

      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <p className="text-sm font-medium text-slate-700 mb-3">Nueva compra en cuotas</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <input
            type="date"
            value={form.fecha_compra}
            onChange={(e) => setForm({ ...form, fecha_compra: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Comercio / concepto"
            value={form.comercio}
            onChange={(e) => setForm({ ...form, comercio: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm col-span-2"
          />
          <select
            value={form.categoria_id}
            onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Categoría...</option>
            {categorias.filter((c) => c.tipo === 'Egreso').map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <select
            value={form.medio_pago_id}
            onChange={(e) => setForm({ ...form, medio_pago_id: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm col-span-2"
          >
            <option value="">Tarjeta / medio de pago...</option>
            {medios.map((m) => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </select>
          <input
            type="number"
            step="0.01"
            placeholder="Monto total"
            value={form.monto_total}
            onChange={(e) => setForm({ ...form, monto_total: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="number"
            placeholder="Cantidad de cuotas"
            value={form.cantidad_cuotas}
            onChange={(e) => setForm({ ...form, cantidad_cuotas: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Notas (opcional)"
            value={form.notas}
            onChange={(e) => setForm({ ...form, notas: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm col-span-2"
          />
          <button
            type="submit"
            disabled={guardando}
            className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
          >
            {guardando ? 'Guardando...' : 'Agregar compra'}
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </form>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Fecha compra</th>
              <th className="text-left px-4 py-2">Comercio</th>
              <th className="text-left px-4 py-2">Categoría</th>
              <th className="text-left px-4 py-2">Medio</th>
              <th className="text-right px-4 py-2">Monto total</th>
              <th className="text-right px-4 py-2">Cuotas</th>
              <th className="text-right px-4 py-2">Valor cuota</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center text-slate-400 py-6">Cargando...</td></tr>
            ) : compras.length === 0 ? (
              <tr><td colSpan={8} className="text-center text-slate-400 py-6">Sin compras en cuotas cargadas.</td></tr>
            ) : (
              compras.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 whitespace-nowrap">{c.fecha_compra}</td>
                  <td className="px-4 py-2">{c.comercio}</td>
                  <td className="px-4 py-2 text-slate-500">{c.categorias?.nombre}</td>
                  <td className="px-4 py-2 text-slate-500">{c.medios_pago?.nombre}</td>
                  <td className="px-4 py-2 text-right">{formatARS(c.monto_total)}</td>
                  <td className="px-4 py-2 text-right">{c.cantidad_cuotas}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatARS(c.monto_total / c.cantidad_cuotas)}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => handleDelete(c.id)} className="text-slate-300 hover:text-rose-500 text-xs">
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
