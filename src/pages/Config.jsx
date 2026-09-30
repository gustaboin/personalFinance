import { useEffect, useState } from 'react'
import {
  CATALOGOS,
  getCatalogo,
  addCatalogoItem,
  updateCatalogoItem,
  deleteCatalogoItem,
} from '../lib/catalogApi'
import ComboboxSelect from '../components/ComboboxSelect'

function formVacioDe(catalogo) {
  const f = {}
  catalogo.campos.forEach((c) => { f[c.key] = '' })
  return f
}

export default function Config() {
  const [catalogoActivo, setCatalogoActivo] = useState(CATALOGOS[0].tabla)
  const catalogo = CATALOGOS.find((c) => c.tabla === catalogoActivo)

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // opciones de tablas referenciadas (FK), para los selects del form y la tabla
  const [opcionesFK, setOpcionesFK] = useState({})

  const [form, setForm] = useState(formVacioDe(catalogo))
  const [editandoId, setEditandoId] = useState(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    setForm(formVacioDe(catalogo))
    setEditandoId(null)
    setError(null)
    cargar()
    cargarOpcionesFK()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogoActivo])

  function cargar() {
    setLoading(true)
    getCatalogo(catalogo.tabla)
      .then(setItems)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  function cargarOpcionesFK() {
    const fkFields = catalogo.campos.filter((c) => c.type === 'select')
    if (fkFields.length === 0) {
      setOpcionesFK({})
      return
    }
    Promise.all(fkFields.map((c) => getCatalogo(c.fkTable)))
      .then((resultados) => {
        const mapa = {}
        fkFields.forEach((c, i) => { mapa[c.fkTable] = resultados[i] })
        setOpcionesFK(mapa)
      })
      .catch((err) => setError(err.message))
  }

  function empezarEdicion(item) {
    const f = {}
    catalogo.campos.forEach((c) => { f[c.key] = String(item[c.key] ?? '') })
    setForm(f)
    setEditandoId(item.id)
  }

  function cancelarEdicion() {
    setForm(formVacioDe(catalogo))
    setEditandoId(null)
    setError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!form.nombre?.trim()) {
      setError('El nombre es obligatorio.')
      return
    }

    const payload = {}
    catalogo.campos.forEach((c) => {
      payload[c.key] = c.type === 'select'
        ? (form[c.key] ? Number(form[c.key]) : null)
        : form[c.key]
    })

    setGuardando(true)
    try {
      if (editandoId) {
        await updateCatalogoItem(catalogo.tabla, editandoId, payload)
      } else {
        await addCatalogoItem(catalogo.tabla, payload)
      }
      cancelarEdicion()
      cargar()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar este registro?')) return
    try {
      await deleteCatalogoItem(catalogo.tabla, id)
      cargar()
    } catch (err) {
      alert('No se pudo eliminar: probablemente está en uso en otra tabla (movimientos, cuotas, etc.).')
    }
  }

  function nombreFK(fkTable, id) {
    const opt = (opcionesFK[fkTable] || []).find((o) => String(o.id) === String(id))
    return opt?.nombre ?? '—'
  }

  const camposFK = catalogo.campos.filter((c) => c.type === 'select')

  return (
    <div className="space-y-6">

      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          Configuración
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Administrá proveedores, medios de pago, entidades y demás catálogos sin tocar la base a mano.
        </p>
      </div>

      {/* Tabs de catálogos */}
      <div className="flex flex-wrap gap-2">
        {CATALOGOS.map((c) => (
          <button
            key={c.tabla}
            onClick={() => setCatalogoActivo(c.tabla)}
            className={`
              px-3 py-1.5 rounded-lg text-sm font-medium border transition
              ${
                catalogoActivo === c.tabla
                  ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800'
              }
            `}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Form de alta / edición */}
      <form
        onSubmit={handleSubmit}
        className="
          bg-white border border-slate-200 rounded-2xl p-5 shadow-sm
          dark:bg-slate-900 dark:border-slate-800
        "
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {editandoId ? `Editando #${editandoId}` : `Nuevo en ${catalogo.label}`}
          </p>
          {editandoId && (
            <button
              type="button"
              onClick={cancelarEdicion}
              className="rounded-lg text-amber-950 bg-amber-500 hover:bg-amber-600 text-sm font-medium px-4 py-2"
            >
              Cancelar edición
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {catalogo.campos.map((c) => (
            <div key={c.key} className={c.type === 'text' ? 'md:col-span-2' : ''}>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                {c.label}
              </label>
              {c.type === 'text' ? (
                <input
                  type="text"
                  value={form[c.key] ?? ''}
                  onChange={(e) => setForm({ ...form, [c.key]: e.target.value })}
                  className="
                    w-full rounded-lg border border-slate-300 bg-white text-slate-900
                    px-3 py-2 text-sm
                    dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100
                  "
                />
              ) : (
                <ComboboxSelect
                  value={form[c.key]}
                  onChange={(v) => setForm({ ...form, [c.key]: v })}
                  options={opcionesFK[c.fkTable] || []}
                  placeholder={`${c.label}...`}
                />
              )}
            </div>
          ))}

          <div className="flex items-end">
            <button
              type="submit"
              disabled={guardando}
              className="rounded-lg text-white text-sm font-medium px-4 py-2 disabled:opacity-50 bg-[#009688] hover:bg-[#007f70]"
            >
              {guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Agregar'}
            </button>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</p>
        )}
      </form>

      {/* Tabla de registros */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden dark:bg-slate-900 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="text-left px-4 py-2">Nombre</th>
              {camposFK.map((c) => (
                <th key={c.key} className="text-left px-4 py-2">{c.label}</th>
              ))}
              <th className="text-right px-4 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={2 + camposFK.length} className="text-center text-slate-400 py-6">
                  Cargando...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={2 + camposFK.length} className="text-center text-slate-400 py-6">
                  Sin registros todavía.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">
                    {item.nombre}
                  </td>
                  {camposFK.map((c) => (
                    <td key={c.key} className="px-4 py-2 text-slate-500 dark:text-slate-400">
                      {nombreFK(c.fkTable, item[c.key])}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right space-x-3">
                    <button
                      onClick={() => empezarEdicion(item)}
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
                            dark:hover:bg-blue-500"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
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
                            dark:hover:bg-rose-500"
                    >
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
