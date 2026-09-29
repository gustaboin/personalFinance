import { useEffect, useState } from 'react'
import MonthSwitcher from '../components/MonthSwitcher'
import {
  currentMesPeriodo,
  formatARS,
} from '../lib/format'
import {
  getMediosPago,
  getTotalTarjeta,
  getMovimientosTarjeta,
  getResumenActualYAnterior,
  agregarResumen,
} from '../lib/api'

function formatFecha(fecha) {
  if (!fecha) return '—'
  const d = new Date(fecha + 'T00:00:00')
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: '2-digit' })
}

export default function Tarjetas() {
  const [mesPeriodo, setMesPeriodo] = useState(currentMesPeriodo())
  const [medios, setMedios] = useState([])
  const [medioId, setMedioId] = useState('')

  const [total, setTotal] = useState({
    B: 0,
    G: 0,
    T: 0,
  })

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)

  // Resumen (cierre / vencimiento actual y anterior)
  const [resumenActual, setResumenActual] = useState(null)
  const [resumenAnterior, setResumenAnterior] = useState(null)
  const [resumenLoading, setResumenLoading] = useState(false)

  // Modal "Agregar resumen"
  const [modalAbierto, setModalAbierto] = useState(false)
  const [nuevoCierre, setNuevoCierre] = useState('')
  const [nuevoVencimiento, setNuevoVencimiento] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorModal, setErrorModal] = useState('')

  const imagenesMediosPago = {
    1: '/images/efectivo.png',
    2: '/images/mercadopago.png',
    3: '/images/transferencia.png',
    4: '/images/bna.png',
    5: '/images/galiciaV.png',
    6: '/images/bbva.png',
    7: '/images/bbva.png',
    8: '/images/ciudadM.png',
    9: '/images/ciudadV.png',
    11: '/images/transferencia.png',
  }

  const coloresMediosPago = {
    1: '#5cb85c',
    2: '#2abcff',
    3: '#ffffff',
    4: '#005f86',
    5: ['#fa6400', '#bf2e3b'],
    6: '#103667',
    7: ['#005aa3', '#103667'],
    8: ['#26abec', '#0c53a5'],
    9: '#26abec',
    11: '#ffffff',
  }

  useEffect(() => {
    getMediosPago().then((data) => {
      if (!data) return

      const tarjetasFiltradas = data.filter((m) => Number(m.tipo_id) === 4)

      setMedios(tarjetasFiltradas)

      if (tarjetasFiltradas.length > 0) {
        setMedioId(String(tarjetasFiltradas[0].id))
      }
    }).catch(() => {
      // noop
    })
  }, [])

  useEffect(() => {
    if (!medioId) return

    let cancelled = false

    setLoading(true)

    Promise.all([
      getTotalTarjeta(mesPeriodo, Number(medioId)),
      getMovimientosTarjeta(mesPeriodo, Number(medioId)),
    ]).then(([totalData, itemsData]) => {
      if (cancelled) return

      setTotal(totalData)

      setItems(
        [...itemsData].sort(
          (a, b) => new Date(a.fecha) - new Date(b.fecha)
        )
      )

      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [mesPeriodo, medioId])

  // Trae el resumen activo + el anterior para la tarjeta seleccionada
  function cargarResumenes() {
     if (!medioId || medioId === '0') {
    setResumenActual(null)
    setResumenAnterior(null)
    return
  }

  console.log('Cargando resumenes para medioId:', medioId, 'mesPeriodo:', mesPeriodo)

    setResumenLoading(true)
    
  
  // Transformamo el periodo de navegación (ej: "202609") a formato fecha (ej: "2026-09-01")
  const año = mesPeriodo.slice(0, 4)
  const mes = mesPeriodo.slice(4)
  const periodoFormateado = `${año}-${mes}-01`
  console.log('periodoFormateado:', periodoFormateado)
  getResumenActualYAnterior(Number(medioId), periodoFormateado)
    .then(({ actual, anterior }) => {
      // Al navegar, actual tendrá el resumen del mes seleccionado y anterior será null
      setResumenActual(actual)
      setResumenAnterior(anterior) 
      console.log('Resumen actual:', actual, 'Resumen anterior:', anterior)
    })
    .catch((err) => {
      console.error('Error buscando cierre/vencimiento:', err)
      setResumenActual(null)
      setResumenAnterior(null)
    })
    .finally(() => setResumenLoading(false))
  }

  useEffect(() => {
    cargarResumenes()
  }, [medioId, mesPeriodo])

  function abrirModal() {
    setErrorModal('')
    setNuevoCierre('')
    setNuevoVencimiento('')
    setModalAbierto(true)
  }

  function cerrarModal() {
    if (guardando) return
    setModalAbierto(false)
  }

  async function handleGuardarResumen(e) {
    e.preventDefault()

    if (!nuevoCierre || !nuevoVencimiento) {
      setErrorModal('Completá fecha de cierre y de vencimiento.')
      return
    }

    setGuardando(true)
    setErrorModal('')

    try {
      await agregarResumen(Number(medioId), nuevoCierre, nuevoVencimiento)
      setModalAbierto(false)
      cargarResumenes()
    } catch (err) {
      console.error('Error al agregar resumen:', err)
      setErrorModal('No se pudo guardar el resumen. Revisá los datos.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-6">

      {/* Título + mes */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          Resumen Tarjetas
        </h2>

        <MonthSwitcher
          mesPeriodo={mesPeriodo}
          onChange={setMesPeriodo}
        />
      </div>

      {/* Descripción */}
      <p className="text-sm text-slate-500 dark:text-slate-400 -mt-4">
        Total real tarjeta por mes: movimientos + cuotas que vencen.
      </p>

      {/* Medios de pago */}
      <div className="flex flex-wrap gap-2">
        {medios.map((m) => {
          const activo = medioId === String(m.id)
          const color = coloresMediosPago[Number(m.id)]

          return (
            <button
              key={m.id}
              onClick={() => setMedioId(String(m.id))}
              className={`
                px-3
                py-1.5
                rounded-lg
                text-sm
                font-medium
                border
                transition

                ${
                  activo
                    ? 'text-white'
                    : `
                      bg-white
                      hover:bg-slate-50
                      text-slate-600
                      border-slate-200

                      dark:bg-slate-900
                      dark:hover:bg-slate-800
                      dark:text-slate-300
                      dark:border-slate-700
                    `
                }
              `}
              style={
                activo
                  ? Array.isArray(color)
                    ? {
                        background: `linear-gradient(to right, ${color[0]}, ${color[1]})`,
                        borderColor: color[0],
                      }
                    : {
                        backgroundColor: color,
                        borderColor: color,
                      }
                  : undefined
              }
            >
              {m.nombre}
            </button>
          )
        })}
      </div>

      {/* Resumen */}
      <div
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
        <div className="flex flex-wrap gap-3">

          {/* Entidad */}
          <div
            className="
              flex-1
              px-4
              py-3
              rounded-lg
              border
              shadow-sm

              bg-white
              border-slate-200
              text-slate-700

              dark:bg-slate-800
              dark:border-slate-700
              dark:text-slate-200
            "
          >
            <div className="flex items-center gap-4 h-full">

              {/* Imagen */}
              <div
                className="
                  w-16
                  h-16
                  rounded-lg
                  flex
                  items-center
                  justify-center
                  p-2
                  shrink-0

                  bg-white
                  dark:bg-white
                "
              >
                <img
                  src={imagenesMediosPago[Number(medioId)]}
                  alt="Entidad"
                  className="max-w-full max-h-full object-contain"
                />
              </div>

              {/* Datos */}
              <div>
                <p
                  className="
                    text-xs
                    font-medium
                    uppercase
                    tracking-wide
                    text-slate-500
                    dark:text-slate-400
                  "
                >
                  Entidad
                </p>

                <p
                  className="
                    text-lg
                    font-semibold
                    mt-1
                    text-slate-900
                    dark:text-white
                  "
                >
                  {medios.find(
                    (m) => String(m.id) === String(medioId)
                  )?.nombre.replace(/transferencia/gi, '< > ')}
                </p>
              </div>

            </div>
          </div>

          {/* Total Gastos */}
          <div
            className="
              flex-1
              px-4
              py-3
              rounded-lg
              text-white
              border
              transition
              shadow-sm
            "
            style={{
              backgroundColor: '#f0AD4E',
              borderColor: '#f0AD4E',
            }}
          >
            <p className="text-xs font-medium uppercase tracking-wide">
              Total Gastos
            </p>

            <p className="text-2xl font-semibold mt-1">
              {formatARS(total.G)}
            </p>
          </div>

          {/* Total Bonificación */}
          <div
            className="
              flex-1
              px-4
              py-3
              rounded-lg
              text-white
              border
              transition
              shadow-sm
            "
            style={{
              backgroundColor: '#5cb85c',
              borderColor: '#5cb85c',
            }}
          >
            <p className="text-xs font-medium uppercase tracking-wide">
              Total Bonificación
            </p>

            <p className="text-2xl font-semibold mt-1">
              {formatARS(total.B)}
            </p>
          </div>

          {/* Total General */}
          <div
            className="
              flex-1
              px-4
              py-3
              rounded-lg
              text-white
              border
              transition
              shadow-sm
            "
            style={{
              backgroundColor: '#337ab7',
              borderColor: '#337ab7',
            }}
          >
            <p className="text-xs font-medium uppercase tracking-wide">
              Total General
            </p>

            <p className="text-2xl font-semibold mt-1">
              {formatARS(total.T)}
            </p>
          </div>

          {/* Cierre / Vencimiento */}
          <div
            className="
              flex-1
              min-w-[220px]
              px-4
              py-3
              rounded-lg
              border
              shadow-sm

              bg-white
              border-slate-200
              text-slate-700

              dark:bg-slate-800
              dark:border-slate-700
              dark:text-slate-200
            "
          >
            <div className="flex items-center justify-between">
              <p
                className="
                  text-xs
                  font-medium
                  uppercase
                  tracking-wide
                  text-slate-500
                  dark:text-slate-400
                "
              >
                Cierre / Vencimiento
              </p>

              <button
                onClick={abrirModal}
                disabled={!medioId}
                title="Agregar resumen"
                className="
                  w-6 h-6
                  flex items-center justify-center
                  rounded-full
                  text-white
                  text-sm
                  font-bold
                  leading-none
                  disabled:opacity-40
                "
                style={{ backgroundColor: '#337ab7' }}
              >
                +
              </button>
            </div>

            {resumenLoading ? (
              <p className="text-sm mt-2 text-slate-400">Cargando...</p>
            ) : (
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 dark:text-slate-400 w-12 shrink-0">
                    Cierre
                  </span>
                  {/* comento por ahora el resumen anterior, porque no se está usando y genera confusión
                  <span className="text-slate-400 dark:text-slate-500">
                    {formatFecha(resumenAnterior?.fecha_cierre)}
                  </span>
                  */}
                  <span className="text-slate-400">→</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {formatFecha(resumenActual?.fecha_cierre)}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 dark:text-slate-400 w-12 shrink-0">
                    Vto.
                  </span>
                  {/* comento por ahora el resumen anterior, porque no se está usando y genera confusión
                  <span className="text-slate-400 dark:text-slate-500">
                    {formatFecha(resumenAnterior?.fecha_vencimiento)}
                  </span>
                  */}
                  <span className="text-slate-400">→</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {formatFecha(resumenActual?.fecha_vencimiento)}
                  </span>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

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

            {/* Encabezado */}
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
                <th className="text-left px-4 py-2">
                  Fecha
                </th>

                <th className="text-left px-4 py-2">
                  Concepto
                </th>

                <th className="text-right px-4 py-2">
                  Importe
                </th>
              </tr>
            </thead>

            {/* Filas */}
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={3}
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
              ) : items.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="
                      text-center
                      text-slate-400
                      dark:text-slate-500
                      py-6
                    "
                  >
                    Sin movimientos este mes.
                  </td>
                </tr>
              ) : (
                items.map((it, i) => {
                  const importe = Number(it.importe)
                  const esNegativo = importe < 0
                  const esAlto = importe > 499999

                  return (
                    <tr
                      key={i}
                      className={`
                        border-t
                        border-slate-100
                        dark:border-slate-800

                        ${
                          esNegativo
                            ? `
                              bg-[#dee9de]
                              text-black

                              dark:bg-[#263b2b]
                              dark:text-green-100
                            `
                            : esAlto
                              ? `
                                bg-[#ffd0cf]
                                text-black

                                dark:bg-[#4a2929]
                                dark:text-red-100
                              `
                              : `
                                text-slate-700
                                dark:text-slate-300
                                hover:bg-slate-50
                                dark:hover:bg-slate-800/50
                              `
                        }
                      `}
                    >
                      <td className="px-4 py-2 whitespace-nowrap">
                        {it.fecha}
                      </td>

                      <td className="px-4 py-2">
                        {it.concepto}
                      </td>

                      <td className="px-4 py-2 text-right font-medium">
                        {formatARS(it.importe)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>

            {/* Total */}
            {items.length > 0 && (
              <tfoot>
                <tr
                  className="
                    border-t
                    border-slate-200
                    bg-slate-50
                    font-semibold

                    dark:border-slate-700
                    dark:bg-slate-800
                    dark:text-white
                  "
                >
                  <td
                    className="px-4 py-2"
                    colSpan={2}
                  >
                    Total
                  </td>

                  <td className="px-4 py-2 text-right">
                    {formatARS(total.T)}
                  </td>
                </tr>
              </tfoot>
            )}

          </table>
        </div>
      </div>

      {/* Modal: Agregar resumen */}
      {modalAbierto && (
        <div
          className="
            fixed inset-0 z-50
            flex items-center justify-center
            bg-black/50
            p-4
          "
          onClick={cerrarModal}
        >
          <div
            className="
              w-full max-w-sm
              bg-white
              rounded-2xl
              p-5
              shadow-lg

              dark:bg-slate-900
              dark:border dark:border-slate-800
            "
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-1 text-slate-900 dark:text-white">
              Agregar resumen
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {medios.find((m) => String(m.id) === String(medioId))?.nombre}
            </p>

            <form onSubmit={handleGuardarResumen} className="space-y-3">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                  Fecha de cierre
                </label>
                <input
                  type="date"
                  value={nuevoCierre}
                  onChange={(e) => setNuevoCierre(e.target.value)}
                  className="
                    w-full px-3 py-2 rounded-lg border text-sm
                    border-slate-200 text-slate-900
                    dark:bg-slate-800 dark:border-slate-700 dark:text-white
                  "
                />
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                  Fecha de vencimiento
                </label>
                <input
                  type="date"
                  value={nuevoVencimiento}
                  onChange={(e) => setNuevoVencimiento(e.target.value)}
                  className="
                    w-full px-3 py-2 rounded-lg border text-sm
                    border-slate-200 text-slate-900
                    dark:bg-slate-800 dark:border-slate-700 dark:text-white
                  "
                />
              </div>

              {errorModal && (
                <p className="text-sm text-red-500">{errorModal}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={cerrarModal}
                  disabled={guardando}
                  className="
                    px-3 py-1.5 rounded-lg text-sm font-medium
                    text-slate-600 hover:bg-slate-100
                    dark:text-slate-300 dark:hover:bg-slate-800
                  "
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="
                    px-3 py-1.5 rounded-lg text-sm font-medium text-white
                    disabled:opacity-50
                  "
                  style={{ backgroundColor: '#337ab7' }}
                >
                  {guardando ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
