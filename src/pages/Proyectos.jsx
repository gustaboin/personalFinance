import { useEffect, useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'

import { formatARS } from '../lib/format'
import { getProyectos, getResumenProyecto, getMovimientosProyecto } from '../lib/api'

const COLORES = [
  '#2563eb',
  '#059669',
  '#f59e0b',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#65a30d',
]

export default function Proyectos() {
  const [proyectos, setProyectos] = useState([])
  const [proyectoId, setProyectoId] = useState('')
  const [resumen, setResumen] = useState(null)
  const [movimientos, setMovimientos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Filtros y paginado de la tabla de movimientos
  const [filtroProveedor, setFiltroProveedor] = useState('')
  const [filtroRubro, setFiltroRubro] = useState('')
  const [visibleCount, setVisibleCount] = useState(20)

  // Carga inicial: listado de proyectos
  useEffect(() => {
    let cancelled = false

    getProyectos()
      .then((data) => {
        if (cancelled) return

        setProyectos(data)

        const activo = data.find((p) => p.estado === 'ACTIVO')

        if (activo) {
          setProyectoId(String(activo.id))
        } else if (data.length > 0) {
          setProyectoId(String(data[0].id))
        } else {
          // No hay proyectos todavía: cortamos el loading para mostrar el estado vacío
          setLoading(false)
        }
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Error cargando proyectos:', err)
        setError('No se pudieron cargar los proyectos.')
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Carga de resumen + movimientos cuando cambia el proyecto seleccionado
  useEffect(() => {
    if (!proyectoId) return

    let cancelled = false
    setLoading(true)
    setError(null)
    setFiltroProveedor('')
    setFiltroRubro('')
    setVisibleCount(20)

    Promise.all([
      getResumenProyecto(Number(proyectoId)),
      getMovimientosProyecto(Number(proyectoId)),
    ])
      .then(([resumenData, movimientosData]) => {
        if (cancelled) return
        setResumen(resumenData)
        setMovimientos(movimientosData)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Error cargando resumen del proyecto:', err)
        setError('No se pudo cargar el resumen del proyecto.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [proyectoId])

  const proyecto = proyectos.find((p) => String(p.id) === String(proyectoId))

  const porcentaje = useMemo(() => {
    if (!resumen?.presupuesto) return 0
    return Math.min(100, (resumen.gastado / resumen.presupuesto) * 100)
  }, [resumen])

  // Opciones únicas para los selects de filtro, sacadas de los movimientos ya cargados
  const proveedoresUnicos = useMemo(() => {
    const set = new Set(movimientos.map((m) => m.proveedor).filter(Boolean))
    return Array.from(set).sort()
  }, [movimientos])

  const rubrosUnicos = useMemo(() => {
    const set = new Set(movimientos.map((m) => m.rubro).filter(Boolean))
    return Array.from(set).sort()
  }, [movimientos])

  const movimientosFiltrados = useMemo(() => {
    return movimientos.filter((m) => {
      if (filtroProveedor && m.proveedor !== filtroProveedor) return false
      if (filtroRubro && m.rubro !== filtroRubro) return false
      return true
    })
  }, [movimientos, filtroProveedor, filtroRubro])

  // Si cambia un filtro, volvemos a mostrar los primeros N
  useEffect(() => {
    setVisibleCount(20)
  }, [filtroProveedor, filtroRubro])

  // --- Estados de carga / error / vacío ---

  if (error) {
    return (
      <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 p-4 text-sm text-rose-600 dark:text-rose-400">
        {error}
      </div>
    )
  }

  if (loading && !resumen) {
    return (
      <div className="text-sm text-slate-400">
        Cargando proyecto...
      </div>
    )
  }

  if (!loading && proyectos.length === 0) {
    return (
      <div className="text-sm text-slate-400">
        Todavía no creaste ningún proyecto. Cargá uno en la tabla{' '}
        <code>proyectos</code> para empezar.
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* ENCABEZADO */}
      <div className="flex flex-wrap items-center justify-between gap-3">

        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Proyectos
          </h2>

          <p className="text-sm text-slate-500 dark:text-slate-400">
            Seguimiento acumulado de objetivos y proyectos.
          </p>
        </div>

        <select
          value={proyectoId}
          onChange={(e) => setProyectoId(e.target.value)}
          className="
            rounded-lg
            border border-slate-300
            dark:border-slate-700
            bg-white dark:bg-slate-900
            text-slate-800 dark:text-slate-200
            px-3 py-2
            text-sm
          "
        >
          {proyectos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>

      </div>


      {proyecto && resumen && (
        <>

          {/* RESUMEN PRINCIPAL */}
          <div className="
            bg-white dark:bg-slate-900
            border border-slate-200 dark:border-slate-800
            rounded-2xl
            p-5
            shadow-sm
          ">

            <div className="flex flex-wrap items-start justify-between gap-4">

              <div>
                <div className="flex items-center gap-2">

                  <h3 className="
                    text-xl font-bold
                    text-slate-900 dark:text-white
                  ">
                    {proyecto.nombre}
                  </h3>

                  <span className={`
                    px-2 py-1
                    rounded-full
                    text-xs font-medium
                    ${
                      proyecto.estado === 'ACTIVO'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }
                  `}>
                    {proyecto.estado}
                  </span>

                </div>

                {proyecto.descripcion && (
                  <p className="
                    text-sm
                    text-slate-500 dark:text-slate-400
                    mt-1
                  ">
                    {proyecto.descripcion}
                  </p>
                )}
              </div>

            </div>


            {/* KPIs */}
            <div className="
              grid
              grid-cols-2
              md:grid-cols-4
              gap-3
              mt-6
            ">

              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Presupuesto
                </p>

                <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                  {formatARS(resumen.presupuesto)}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Gastado
                </p>

                <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                  {formatARS(resumen.gastado)}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Disponible
                </p>

                <p className={`
                  text-xl font-bold mt-1
                  ${
                    resumen.disponible >= 0
                      ? 'text-emerald-600'
                      : 'text-rose-600'
                  }
                `}>
                  {formatARS(resumen.disponible)}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ejecutado
                </p>

                <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                  {porcentaje.toFixed(1)}%
                </p>
              </div>

            </div>


            {/* BARRA PRESUPUESTO */}
            {resumen.presupuesto > 0 && (
              <div className="mt-5">

                <div className="
                  h-3
                  rounded-full
                  bg-slate-100 dark:bg-slate-800
                  overflow-hidden
                ">
                  <div
                    className={`
                      h-full rounded-full transition-all
                      ${
                        porcentaje >= 100
                          ? 'bg-rose-500'
                          : porcentaje >= 80
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                      }
                    `}
                    style={{ width: `${porcentaje}%` }}
                  />
                </div>

                <div className="
                  flex justify-between
                  text-xs
                  text-slate-400
                  mt-2
                ">
                  <span>0%</span>
                  <span>100%</span>
                </div>

              </div>
            )}

          </div>


          {/* DISTRIBUCIÓN */}
          <div className="
            bg-white dark:bg-slate-900
            border border-slate-200 dark:border-slate-800
            rounded-2xl
            p-5
            shadow-sm
          ">

            <p className="
              text-sm font-medium
              text-slate-700 dark:text-slate-200
              mb-4
            ">
              ¿En qué se gastó?
            </p>

            {!resumen.porRubro || resumen.porRubro.length === 0 ? (
              <p className="text-sm text-slate-400">
                Todavía no hay gastos clasificados.
              </p>
            ) : (
              <div className="grid md:grid-cols-2 gap-6">

                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>

                    <Pie
                      data={resumen.porRubro}
                      dataKey="total"
                      nameKey="rubro"
                      cx="50%"
                      cy="50%"
                      outerRadius={95}
                    >
                      {resumen.porRubro.map((_, index) => (
                        <Cell
                          key={index}
                          fill={COLORES[index % COLORES.length]}
                        />
                      ))}
                    </Pie>

                    <Tooltip
                      formatter={(value) => formatARS(value)}
                    />

                    <Legend />

                  </PieChart>
                </ResponsiveContainer>


                <div className="space-y-2">

                  {resumen.porRubro.map((r, i) => (
                    <div
                      key={r.rubro}
                      className="
                        flex items-center justify-between
                        rounded-lg
                        px-3 py-2
                        bg-slate-50 dark:bg-slate-800
                      "
                    >

                      <div className="flex items-center gap-2">

                        <span
                          className="w-3 h-3 rounded-full"
                          style={{
                            backgroundColor:
                              COLORES[i % COLORES.length],
                          }}
                        />

                        <span className="
                          text-sm
                          text-slate-700 dark:text-slate-300
                        ">
                          {r.rubro}
                        </span>

                      </div>

                      <span className="
                        text-sm font-medium
                        text-slate-900 dark:text-white
                      ">
                        {formatARS(r.total)}
                      </span>

                    </div>
                  ))}

                </div>

              </div>
            )}

          </div>


          {/* PROVEEDORES */}
          <div className="
            bg-white dark:bg-slate-900
            border border-slate-200 dark:border-slate-800
            rounded-2xl
            p-5
            shadow-sm
          ">

            <p className="
              text-sm font-medium
              text-slate-700 dark:text-slate-200
              mb-4
            ">
              Principales proveedores
            </p>

            {!resumen.proveedores || resumen.proveedores.length === 0 ? (
              <p className="text-sm text-slate-400">
                Todavía no hay gastos con proveedor asignado.
              </p>
            ) : (
              <ResponsiveContainer
                width="100%"
                height={Math.max(220, resumen.proveedores.length * 42)}
              >
                <BarChart
                  data={resumen.proveedores}
                  layout="vertical"
                  margin={{ left: 20, right: 20 }}
                >

                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                  />

                  <XAxis
                    type="number"
                    tickFormatter={(v) => formatARS(v)}
                    fontSize={11}
                  />

                  <YAxis
                    type="category"
                    dataKey="proveedor"
                    width={130}
                    fontSize={11}
                  />

                  <Tooltip
                    formatter={(v) => formatARS(v)}
                  />

                  <Bar
                    dataKey="total"
                    fill="#2563eb"
                    radius={[0, 6, 6, 0]}
                  />

                </BarChart>
              </ResponsiveContainer>
            )}

          </div>


          {/* MOVIMIENTOS */}
          <div className="
            bg-white dark:bg-slate-900
            border border-slate-200 dark:border-slate-800
            rounded-2xl
            shadow-sm
            overflow-hidden
          ">

            <div className="
              px-5 py-4
              border-b border-slate-200 dark:border-slate-800
              flex flex-wrap items-center justify-between gap-3
            ">
              <p className="
                text-sm font-medium
                text-slate-700 dark:text-slate-200
              ">
                Movimientos
                {(filtroProveedor || filtroRubro) && (
                  <span className="text-slate-400 font-normal">
                    {' '}({movimientosFiltrados.length} de {movimientos.length})
                  </span>
                )}
              </p>

              {movimientos.length > 0 && (
                <div className="flex flex-wrap gap-2">

                  <select
                    value={filtroRubro}
                    onChange={(e) => setFiltroRubro(e.target.value)}
                    className="
                      rounded-lg
                      border border-slate-300 dark:border-slate-700
                      bg-white dark:bg-slate-900
                      text-slate-700 dark:text-slate-200
                      px-2 py-1.5
                      text-xs
                    "
                  >
                    <option value="">Todos los rubros</option>
                    {rubrosUnicos.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>

                  <select
                    value={filtroProveedor}
                    onChange={(e) => setFiltroProveedor(e.target.value)}
                    className="
                      rounded-lg
                      border border-slate-300 dark:border-slate-700
                      bg-white dark:bg-slate-900
                      text-slate-700 dark:text-slate-200
                      px-2 py-1.5
                      text-xs
                    "
                  >
                    <option value="">Todos los proveedores</option>
                    {proveedoresUnicos.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>

                  {(filtroProveedor || filtroRubro) && (
                    <button
                      onClick={() => {
                        setFiltroProveedor('')
                        setFiltroRubro('')
                      }}
                      className="
                        text-xs
                        text-slate-500 dark:text-slate-400
                        hover:text-slate-700 dark:hover:text-slate-200
                        px-2
                      "
                    >
                      Limpiar
                    </button>
                  )}

                </div>
              )}
            </div>

            {movimientos.length === 0 ? (
              <p className="text-sm text-slate-400 px-5 py-6">
                Todavía no hay movimientos cargados para este proyecto.
              </p>
            ) : movimientosFiltrados.length === 0 ? (
              <p className="text-sm text-slate-400 px-5 py-6">
                No hay movimientos que coincidan con el filtro elegido.
              </p>
            ) : (
              <>
              <table className="w-full text-sm">

                <thead className="
                  bg-slate-50 dark:bg-slate-800
                  text-slate-500 dark:text-slate-300
                  text-xs uppercase
                ">
                  <tr>
                    <th className="text-left px-4 py-2">
                      Fecha
                    </th>

                    <th className="text-left px-4 py-2">
                      Concepto
                    </th>

                    <th className="text-left px-4 py-2">
                      Rubro
                    </th>

                    <th className="text-left px-4 py-2">
                      Proveedor
                    </th>

                    <th className="text-right px-4 py-2">
                      Importe
                    </th>
                  </tr>
                </thead>

                <tbody>

                  {movimientosFiltrados.slice(0, visibleCount).map((m, idx) => (
                    <tr
                      key={`${m.fecha}-${m.concepto}-${idx}`}
                      className="
                        border-t border-slate-100
                        dark:border-slate-800
                      "
                    >

                      <td className="
                        px-4 py-2
                        whitespace-nowrap
                        text-slate-700 dark:text-slate-300
                      ">
                        {m.fecha}
                      </td>

                      <td className="
                        px-4 py-2
                        text-slate-700 dark:text-slate-300
                      ">
                        {m.concepto}
                      </td>

                      <td className="
                        px-4 py-2
                        text-slate-500 dark:text-slate-400
                      ">
                        {m.rubro ?? '—'}
                      </td>

                      <td className="
                        px-4 py-2
                        text-slate-500 dark:text-slate-400
                      ">
                        {m.proveedor ?? '—'}
                      </td>

                      <td className="
                        px-4 py-2
                        text-right font-medium
                        text-slate-900 dark:text-white
                      ">
                        {formatARS(m.importe)}
                      </td>

                    </tr>
                  ))}

                </tbody>

              </table>

              {visibleCount < movimientosFiltrados.length && (
                <div className="flex justify-center py-4 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => setVisibleCount((c) => c + 20)}
                    className="
                      text-sm font-medium
                      text-blue-600 dark:text-blue-400
                      hover:underline
                    "
                  >
                    Mostrar más ({movimientosFiltrados.length - visibleCount} restantes)
                  </button>
                </div>
              )}
              </>
            )}

          </div>

        </>
      )}

    </div>
  )
}
