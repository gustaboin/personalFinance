import { useEffect, useState } from 'react'
import MonthSwitcher from '../components/MonthSwitcher'
import { currentMesPeriodo, formatARS } from '../lib/format'
import {
  getCategorias, getMediosPago, getMovimientosDelMes,
  addMovimiento, updateMovimiento, deleteMovimiento,
} from '../lib/api'
import { Pencil, Trash2 } from 'lucide-react'

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

      {/* Título + selector de mes */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          Movimientos
        </h2>

        <MonthSwitcher
          mesPeriodo={mesPeriodo}
          onChange={setMesPeriodo}
        />
      </div>

      {/* Formulario */}
      <form
        onSubmit={handleSubmit}
        className="
          bg-white
          border border-slate-200
          rounded-2xl
          p-5
          shadow-sm

          dark:bg-slate-900
          dark:border-slate-800
          dark:shadow-black/20
        "
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {editandoId
              ? `Editando movimiento #${editandoId}`
              : 'Nuevo movimiento'}
          </p>

          {editandoId && (
            <button
              type="button"
              onClick={cancelarEdicion}
              className="
                text-xs
                text-slate-400
                hover:text-slate-700
                dark:text-slate-500
                dark:hover:text-slate-200
                transition
              "
            >
              Cancelar edición
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">

          {/* Fecha */}
          <input
            type="date"
            value={form.fecha}
            onChange={(e) =>
              setForm({ ...form, fecha: e.target.value })
            }
            className="
              rounded-lg
              border border-slate-300
              bg-white
              text-slate-900
              px-3 py-2
              text-sm
              col-span-1

              placeholder:text-slate-400

              focus:outline-none
              focus:ring-2
              focus:ring-slate-200

              dark:border-slate-700
              dark:bg-slate-800
              dark:text-slate-100
              dark:placeholder:text-slate-500
              dark:focus:ring-slate-700
            "
          />

          {/* Categoría */}
          <select
            value={form.categoria_id}
            onChange={(e) =>
              setForm({ ...form, categoria_id: e.target.value })
            }
            className="
              rounded-lg
              border border-slate-300
              bg-white
              text-slate-900
              px-3 py-2
              text-sm
              col-span-2

              focus:outline-none
              focus:ring-2
              focus:ring-slate-200

              dark:border-slate-700
              dark:bg-slate-800
              dark:text-slate-100
              dark:focus:ring-slate-700
            "
          >
            <option value="">Categoría...</option>

            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({c.tipo})
              </option>
            ))}
          </select>

          {/* Medio de pago */}
          <select
            value={form.medio_pago_id}
            onChange={(e) =>
              setForm({ ...form, medio_pago_id: e.target.value })
            }
            className="
              rounded-lg
              border border-slate-300
              bg-white
              text-slate-900
              px-3 py-2
              text-sm
              col-span-2

              focus:outline-none
              focus:ring-2
              focus:ring-slate-200

              dark:border-slate-700
              dark:bg-slate-800
              dark:text-slate-100
              dark:focus:ring-slate-700
            "
          >
            <option value="">Medio de pago...</option>

            {medios.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>

          {/* Moneda */}
          <select
            value={form.moneda}
            onChange={(e) =>
              setForm({ ...form, moneda: e.target.value })
            }
            className="
              rounded-lg
              border border-slate-300
              bg-white
              text-slate-900
              px-3 py-2
              text-sm

              focus:outline-none
              focus:ring-2
              focus:ring-slate-200

              dark:border-slate-700
              dark:bg-slate-800
              dark:text-slate-100
              dark:focus:ring-slate-700
            "
          >
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>

          {/* Concepto */}
          <input
            type="text"
            placeholder="Concepto"
            value={form.concepto}
            onChange={(e) =>
              setForm({ ...form, concepto: e.target.value })
            }
            className="
              rounded-lg
              border border-slate-300
              bg-white
              text-slate-900
              px-3 py-2
              text-sm
              col-span-2 md:col-span-3

              placeholder:text-slate-400

              focus:outline-none
              focus:ring-2
              focus:ring-slate-200

              dark:border-slate-700
              dark:bg-slate-800
              dark:text-slate-100
              dark:placeholder:text-slate-500
              dark:focus:ring-slate-700
            "
          />

          {/* Importe */}
          <input
            type="number"
            step="0.01"
            placeholder="Importe"
            value={form.importe}
            onChange={(e) =>
              setForm({ ...form, importe: e.target.value })
            }
            className="
              rounded-lg
              border border-slate-300
              bg-white
              text-slate-900
              px-3 py-2
              text-sm
              col-span-2

              placeholder:text-slate-400

              focus:outline-none
              focus:ring-2
              focus:ring-slate-200

              dark:border-slate-700
              dark:bg-slate-800
              dark:text-slate-100
              dark:placeholder:text-slate-500
              dark:focus:ring-slate-700
            "
          />

          {/* Guardar */}
          <button
            type="submit"
            disabled={guardando}
            className={`rounded-lg text-white text-sm font-medium px-4 py-2 disabled:opacity-50 col-span-1 transition ${
              editandoId
                ? 'bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500'
                : 'bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600'
            }`}
          >
            {guardando
              ? 'Guardando...'
              : editandoId
                ? 'Guardar cambios'
                : 'Agregar'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 mt-2">
            {error}
          </p>
        )}
      </form>

      {/* Tabla */}
      <div
        className="
          bg-white
          border border-slate-200
          rounded-2xl
          shadow-sm
          overflow-hidden

          dark:bg-slate-900
          dark:border-slate-800
          dark:shadow-black/20
        "
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">

            {/* Header tabla */}
            <thead
              className="
                bg-slate-50
                text-slate-500
                text-xs
                uppercase

                dark:bg-slate-800
                dark:text-slate-300
              "
            >
              <tr>
                <th className="text-left px-4 py-3">
                  Fecha
                </th>

                <th className="text-left px-4 py-3">
                  Categoría
                </th>

                <th className="text-left px-4 py-3">
                  Concepto
                </th>

                <th className="text-left px-4 py-3">
                  Medio
                </th>

                <th className="text-right px-4 py-3">
                  Importe
                </th>

                <th className="px-4 py-3"></th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center text-slate-400 dark:text-slate-500 py-6"
                  >
                    Cargando...
                  </td>
                </tr>
              ) : movimientos.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center text-slate-400 dark:text-slate-500 py-6"
                  >
                    Sin movimientos este mes.
                  </td>
                </tr>
              ) : (
                movimientos.map((m) => (
                  <tr
                    key={m.id}
                    className={`
                      border-t
                      border-slate-100
                      dark:border-slate-800
                      transition-colors

                      ${
                        editandoId === m.id
                          ? 'bg-amber-50 dark:bg-amber-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }
                    `}
                  >

                    {/* Fecha */}
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700 dark:text-slate-300">
                      {m.fecha}
                    </td>

                    {/* Categoría */}
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      {m.categorias?.nombre}
                    </td>

                    {/* Concepto */}
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {m.concepto}
                    </td>

                    {/* Medio */}
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {m.medios_pago?.nombre}
                    </td>

                    {/* Importe */}
                    <td
                      className={`px-4 py-3 text-right font-medium ${
                        m.categorias?.tipos_movimiento?.nombre === 'Ingreso'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {m.moneda === 'USD'
                        ? `US$ ${m.importe}`
                        : formatARS(m.importe)}
                    </td>

                    {/* Acciones */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">

                      <div className="flex items-center justify-end gap-2">

                        {/* Editar */}
                        <button
                          onClick={() => empezarEdicion(m)}
                          className="
                            inline-flex
                            items-center
                            gap-1.5
                            rounded-md
                            bg-blue-600
                            hover:bg-blue-700
                            text-white
                            px-2.5
                            py-1.5
                            text-xs
                            font-medium
                            transition-colors

                            dark:bg-blue-600
                            dark:hover:bg-blue-500
                          "
                        >
                          <Pencil size={13} />
                          Editar
                        </button>

                        {/* Eliminar */}
                        <button
                          onClick={() => handleDelete(m.id)}
                          className="
                            inline-flex
                            items-center
                            gap-1.5
                            rounded-md
                            bg-rose-600
                            hover:bg-rose-700
                            text-white
                            px-2.5
                            py-1.5
                            text-xs
                            font-medium
                            transition-colors

                            dark:bg-rose-600
                            dark:hover:bg-rose-500
                          "
                        >
                          <Trash2 size={13} />
                          Eliminar
                        </button>

                      </div>
                    </td>

                  </tr>
                ))
              )}
            </tbody>

          </table>
        </div>
      </div>

    </div>
  )
}
