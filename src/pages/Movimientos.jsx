import { useEffect, useState } from 'react'
import MonthSwitcher from '../components/MonthSwitcher'
import { currentMesPeriodo, formatARS } from '../lib/format'
import {
  getCategorias, getMediosPago, getMovimientosDelMes,
  addMovimiento, updateMovimiento, deleteMovimiento,
} from '../lib/api'

const HOY = new Date().toISOString().slice(0, 10)
const FORM_VACIO = { fecha: HOY, categoria_id: '', medio_pago_id: '', concepto: '', moneda: 'ARS', importe: '' }

export default function Movimientos() {
  const [mesPeriodo, setMesPeriodo] = useState(currentMesPeriodo())
  const [categorias, setCategorias] = useState([])
  const [medios, setMedios] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const [editandoId, setEditandoId] = useState(null) // null = alta nueva, id = editando esa fila

  const [form, setForm] = useState(FORM_VACIO)

  useEffect(() => {
    getCategorias().then(setCategorias)
    getMediosPago().then(setMedios)
  }, [])

  useEffect(() => {
    setLoading(true)
    getMovimientosDelMes(mesPeriodo).then((data) => {
      setMovimientos(data)
      setLoading(false)
    })
  }, [mesPeriodo])

  async function refrescar() {
    const data = await getMovimientosDelMes(mesPeriodo)
    setMovimientos(data)
  }

  function empezarEdicion(m) {
    setEditandoId(m.id)
    setForm({
      fecha: m.fecha,
      categoria_id: String(m.categoria_id ?? ''),
      medio_pago_id: String(m.medio_pago_id ?? ''),
      concepto: m.concepto || '',
      moneda: m.moneda,
      importe: String(m.importe),
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelarEdicion() {
    setEditandoId(null)
    setForm(FORM_VACIO)
    setError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!form.categoria_id || !form.medio_pago_id || !form.importe) {
      setError('Completá categoría, medio de pago e importe.')
      return
    }
    setGuardando(true)
    try {
      const payload = {
        fecha: form.fecha,
        categoria_id: Number(form.categoria_id),
        medio_pago_id: Number(form.medio_pago_id),
        concepto: form.concepto || null,
        moneda: form.moneda,
        importe: Number(form.importe),
      }
      if (editandoId) {
        await updateMovimiento(editandoId, payload)
        setEditandoId(null)
      } else {
        await addMovimiento(payload)
      }
      setForm(FORM_VACIO)
      await refrescar()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar este movimiento? No se puede deshacer.')) return
    await deleteMovimiento(id)
    if (editandoId === id) cancelarEdicion()
    await refrescar()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Movimientos</h2>
        <MonthSwitcher mesPeriodo={mesPeriodo} onChange={setMesPeriodo} />
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-slate-700">
            {editandoId ? `Editando movimiento #${editandoId}` : 'Nuevo movimiento'}
          </p>
          {editandoId && (
            <button type="button" onClick={cancelarEdicion} className="text-xs text-slate-400 hover:text-slate-600">
              Cancelar edición
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <input
            type="date"
            value={form.fecha}
            onChange={(e) => setForm({ ...form, fecha: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm col-span-1"
          />
          <select
            value={form.categoria_id}
            onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm col-span-2"
          >
            <option value="">Categoría...</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre} ({c.tipo})</option>
            ))}
          </select>
          <select
            value={form.medio_pago_id}
            onChange={(e) => setForm({ ...form, medio_pago_id: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm col-span-2"
          >
            <option value="">Medio de pago...</option>
            {medios.map((m) => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </select>
          <select
            value={form.moneda}
            onChange={(e) => setForm({ ...form, moneda: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
          <input
            type="text"
            placeholder="Concepto"
            value={form.concepto}
            onChange={(e) => setForm({ ...form, concepto: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm col-span-2 md:col-span-3"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Importe"
            value={form.importe}
            onChange={(e) => setForm({ ...form, importe: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm col-span-2"
          />
          <button
            type="submit"
            disabled={guardando}
            className={`rounded-lg text-white text-sm font-medium px-4 py-2 disabled:opacity-50 col-span-1 ${
              editandoId ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-900 hover:bg-slate-800'
            }`}
          >
            {guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Agregar'}
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </form>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Fecha</th>
              <th className="text-left px-4 py-2">Categoría</th>
              <th className="text-left px-4 py-2">Concepto</th>
              <th className="text-left px-4 py-2">Medio</th>
              <th className="text-right px-4 py-2">Importe</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center text-slate-400 py-6">Cargando...</td></tr>
            ) : movimientos.length === 0 ? (
              <tr><td colSpan={6} className="text-center text-slate-400 py-6">Sin movimientos este mes.</td></tr>
            ) : (
              movimientos.map((m) => (
                <tr
                  key={m.id}
                  className={`border-t border-slate-100 ${editandoId === m.id ? 'bg-amber-50' : ''}`}
                >
                  <td className="px-4 py-2 whitespace-nowrap">{m.fecha}</td>
                  <td className="px-4 py-2">{m.categorias?.nombre}</td>
                  <td className="px-4 py-2 text-slate-500">{m.concepto}</td>
                  <td className="px-4 py-2 text-slate-500">{m.medios_pago?.nombre}</td>
                  <td className={`px-4 py-2 text-right font-medium ${m.categorias?.tipos_movimiento?.nombre === 'Ingreso' ? 'text-emerald-600' : 'text-slate-900'}`}>
                    {m.moneda === 'USD' ? `US$ ${m.importe}` : formatARS(m.importe)}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button onClick={() => empezarEdicion(m)} className="text-slate-400 hover:text-slate-700 text-xs mr-3">
                      Editar
                    </button>
                    <button onClick={() => handleDelete(m.id)} className="text-slate-300 hover:text-rose-500 text-xs">
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
