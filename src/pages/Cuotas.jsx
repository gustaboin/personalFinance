import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { formatARS } from '../lib/format'
import {
  getCategorias,
  getMediosPago,
  getComprasCuotas,
  addCompraCuotas,
  deleteCompraCuotas,
} from '../lib/api'

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

    const [cats, meds, comprasData] = await Promise.all([
      getCategorias(),
      getMediosPago(),
      getComprasCuotas(),
    ])

    setCategorias(cats)
    setMedios(meds)
    setCompras(comprasData)
    setLoading(false)
  }

  useEffect(() => {
    cargarTodo()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (
      !form.comercio ||
      !form.categoria_id ||
      !form.medio_pago_id ||
      !form.monto_total ||
      !form.cantidad_cuotas
    ) {
      setError(
        'Completá comercio, categoría, medio de pago, monto total y cantidad de cuotas.'
      )
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

      setForm({
        ...form,
        comercio: '',
        monto_total: '',
        cantidad_cuotas: '',
        notas: '',
      })

      const comprasData = await getComprasCuotas()
      setCompras(comprasData)
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function handleDelete(id) {
    if (
      !confirm(
        '¿Eliminar esta compra? También se borran las cuotas generadas.'
      )
    ) {
      return
    }

    await deleteCompraCuotas(id)

    const comprasData = await getComprasCuotas()
    setCompras(comprasData)
  }

  return (
    <div className="space-y-6">

      {/* Título */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          Compras en cuotas
        </h2>

        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Cargá la compra una sola vez. El cronograma de vencimientos mes a mes
          se calcula solo — nunca necesitás volver a editar esta compra.
        </p>
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
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-3">
          Nueva compra en cuotas
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

          {/* Fecha */}
          <input
            type="date"
            value={form.fecha_compra}
            onChange={(e) =>
              setForm({
                ...form,
                fecha_compra: e.target.value,
              })
            }
            className="
              rounded-lg
              border border-slate-300
              bg-white
              text-slate-900
              px-3
              py-2
              text-sm

              focus:outline-none
              focus:ring-2
              focus:ring-slate-200

              dark:border-slate-700
              dark:bg-slate-800
              dark:text-slate-100
              dark:focus:ring-slate-700
            "
          />

          {/* Comercio */}
          <input
            type="text"
            placeholder="Comercio / concepto"
            value={form.comercio}
            onChange={(e) =>
              setForm({
                ...form,
                comercio: e.target.value,
              })
            }
            className="
              rounded-lg
              border border-slate-300
              bg-white
              text-slate-900
              px-3
              py-2
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

          {/* Categoría */}
          <select
            value={form.categoria_id}
            onChange={(e) =>
              setForm({
                ...form,
                categoria_id: e.target.value,
              })
            }
            className="
              rounded-lg
              border border-slate-300
              bg-white
              text-slate-900
              px-3
              py-2
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
            <option value="">
              Categoría...
            </option>

            {categorias
              .filter((c) => c.tipo === 'Egreso')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
          </select>

          {/* Medio de pago */}
          <select
            value={form.medio_pago_id}
            onChange={(e) =>
              setForm({
                ...form,
                medio_pago_id: e.target.value,
              })
            }
            className="
              rounded-lg
              border border-slate-300
              bg-white
              text-slate-900
              px-3
              py-2
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
            <option value="">
              Tarjeta / medio de pago...
            </option>

            {medios.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>

          {/* Monto */}
          <input
            type="number"
            step="0.01"
            placeholder="Monto total"
            value={form.monto_total}
            onChange={(e) =>
              setForm({
                ...form,
                monto_total: e.target.value,
              })
            }
            className="
              rounded-lg
              border border-slate-300
              bg-white
              text-slate-900
              px-3
              py-2
              text-sm

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

          {/* Cantidad de cuotas */}
          <input
            type="number"
            placeholder="Cantidad de cuotas"
            value={form.cantidad_cuotas}
            onChange={(e) =>
              setForm({
                ...form,
                cantidad_cuotas: e.target.value,
              })
            }
            className="
              rounded-lg
              border border-slate-300
              bg-white
              text-slate-900
              px-3
              py-2
              text-sm

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

          {/* Notas */}
          <input
            type="text"
            placeholder="Notas (opcional)"
            value={form.notas}
            onChange={(e) =>
              setForm({
                ...form,
                notas: e.target.value,
              })
            }
            className="
              rounded-lg
              border border-slate-300
              bg-white
              text-slate-900
              px-3
              py-2
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

          {/* Botón */}
          <button
            type="submit"
            disabled={guardando}
            className="
              rounded-lg
              bg-slate-900
              hover:bg-slate-800
              text-white
              text-sm
              font-medium
              px-4
              py-2
              disabled:opacity-50
              transition-colors

              dark:bg-slate-700
              dark:hover:bg-slate-600
            "
          >
            {guardando ? 'Guardando...' : 'Agregar compra'}
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

            {/* Header */}
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
                  Fecha compra
                </th>

                <th className="text-left px-4 py-3">
                  Comercio
                </th>

                <th className="text-left px-4 py-3">
                  Categoría
                </th>

                <th className="text-left px-4 py-3">
                  Medio
                </th>

                <th className="text-right px-4 py-3">
                  Monto total
                </th>

                <th className="text-right px-4 py-3">
                  Cuotas
                </th>

                <th className="text-right px-4 py-3">
                  Valor cuota
                </th>

                <th className="px-4 py-3"></th>
              </tr>
            </thead>

            {/* Body */}
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="
                      text-center
                      text-slate-400
                      dark:text-slate-500
                      py-6
                    "
                  >
                    Cargando...
                  </td>
                </tr>
              ) : compras.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="
                      text-center
                      text-slate-400
                      dark:text-slate-500
                      py-6
                    "
                  >
                    Sin compras en cuotas cargadas.
                  </td>
                </tr>
              ) : (
                compras.map((c) => (
                  <tr
                    key={c.id}
                    className="
                      border-t
                      border-slate-100
                      dark:border-slate-800
                      text-slate-700
                      dark:text-slate-300
                      hover:bg-slate-50
                      dark:hover:bg-slate-800/50
                      transition-colors
                    "
                  >
                    {/* Fecha */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {c.fecha_compra}
                    </td>

                    {/* Comercio */}
                    <td className="px-4 py-3 text-slate-900 dark:text-white font-medium">
                      {c.comercio}
                    </td>

                    {/* Categoría */}
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {c.categorias?.nombre}
                    </td>

                    {/* Medio */}
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {c.medios_pago?.nombre}
                    </td>

                    {/* Monto */}
                    <td className="px-4 py-3 text-right">
                      {formatARS(c.monto_total)}
                    </td>

                    {/* Cuotas */}
                    <td className="px-4 py-3 text-right">
                      {c.cantidad_cuotas}
                    </td>

                    {/* Valor cuota */}
                    <td className="px-4 py-3 text-right font-medium text-slate-900 dark:text-white">
                      {formatARS(
                        c.monto_total / c.cantidad_cuotas
                      )}
                    </td>

                    {/* Eliminar */}
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(c.id)}
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
