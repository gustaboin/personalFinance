import { useEffect, useMemo, useState } from 'react'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'

import { formatARS } from '../lib/format'
import { getPrestamos, getCuotasPrestamo } from '../lib/api'

export default function Prestamos() {
  const [prestamos, setPrestamos] = useState([])
  const [prestamoId, setPrestamoId] = useState('')
  const [cuotas, setCuotas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Carga inicial: listado de préstamos
  useEffect(() => {
    let cancelled = false

    getPrestamos()
      .then((data) => {
        if (cancelled) return
        setPrestamos(data)
        if (data.length > 0) {
          setPrestamoId(String(data[0].id))
        } else {
          setLoading(false)
        }
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Error cargando préstamos:', err)
        setError('No se pudieron cargar los préstamos.')
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  // Carga de cuotas cuando cambia el préstamo seleccionado
  useEffect(() => {
    if (!prestamoId) return

    let cancelled = false
    setLoading(true)
    setError(null)

    getCuotasPrestamo(Number(prestamoId))
      .then((data) => {
        if (cancelled) return
        setCuotas(data)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Error cargando cuotas del préstamo:', err)
        setError('No se pudo cargar el detalle de cuotas.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [prestamoId])

  const prestamo = prestamos.find((p) => String(p.id) === String(prestamoId))

  // ---- KPIs derivados ----
  const kpis = useMemo(() => {
    if (!prestamo) return null

    // Cuotas con datos reales cargados (ya pagadas / registradas)
    const cuotasConDatos = cuotas.filter((c) => c.monto_ars != null)
    const cuotasPagadas = cuotasConDatos.length
    const cuotasTotales = prestamo.cuotas_totales
    const cuotasRestantes = Math.max(0, cuotasTotales - cuotasPagadas)

    const ultima = cuotasConDatos[cuotasConDatos.length - 1]
    const saldoUvaPendiente = ultima?.saldo_uva ?? null

    const totalPagadoArs = cuotasConDatos.reduce(
      (s, c) => s + Number(c.monto_ars || 0),
      0
    )

    // Promedio de incremento mensual vs inflación, sobre los últimos 12 meses con dato
    const ultimos12 = cuotasConDatos.slice(-12).filter(
      (c) => c.incremento_monto_ars_pct != null
    )
    const promedioIncrementoCuota = ultimos12.length
      ? ultimos12.reduce((s, c) => s + Number(c.incremento_monto_ars_pct), 0) / ultimos12.length
      : null

    const conInflacion = ultimos12.filter((c) => c.inflacion_pct != null)
    const promedioInflacion = conInflacion.length
      ? conInflacion.reduce((s, c) => s + Number(c.inflacion_pct), 0) / conInflacion.length
      : null

    return {
      cuotasPagadas,
      cuotasTotales,
      cuotasRestantes,
      porcentajeAvance: cuotasTotales > 0 ? (cuotasPagadas / cuotasTotales) * 100 : 0,
      saldoUvaPendiente,
      totalPagadoArs,
      promedioIncrementoCuota,
      promedioInflacion,
    }
  }, [prestamo, cuotas])

  // ---- Datos para gráficos ----
  const evolucionData = useMemo(() => {
    return cuotas
      .filter((c) => c.monto_ars != null)
      .map((c) => ({
        cuota: c.nro_cuota,
        monto_ars: Number(c.monto_ars),
        valor_uva: c.valor_uva != null ? Number(c.valor_uva) : null,
      }))
  }, [cuotas])

  const comparativoData = useMemo(() => {
    return cuotas
      .filter((c) => c.incremento_monto_ars_pct != null)
      .map((c) => ({
        cuota: c.nro_cuota,
        incremento_cuota: Number(c.incremento_monto_ars_pct),
        inflacion: c.inflacion_pct != null ? Number(c.inflacion_pct) : null,
      }))
  }, [cuotas])

  // ---- Estados de carga / error / vacío ----

  if (error) {
    return (
      <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 p-4 text-sm text-rose-600 dark:text-rose-400">
        {error}
      </div>
    )
  }

  if (loading && cuotas.length === 0 && prestamos.length === 0) {
    return (
      <div className="text-sm text-slate-400">
        Cargando préstamo...
      </div>
    )
  }

  if (!loading && prestamos.length === 0) {
    return (
      <div className="text-sm text-slate-400">
        Todavía no cargaste ningún préstamo. Cargá uno en la tabla{' '}
        <code>prestamos</code> para empezar.
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* ENCABEZADO */}
      <div className="flex flex-wrap items-center justify-between gap-3">

        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Préstamos
          </h2>

          <p className="text-sm text-slate-500 dark:text-slate-400">
            Seguimiento de deuda indexada, separado del gasto corriente.
          </p>
        </div>

        {prestamos.length > 1 && (
          <select
            value={prestamoId}
            onChange={(e) => setPrestamoId(e.target.value)}
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
            {prestamos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        )}

      </div>


      {prestamo && kpis && (
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
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  {prestamo.nombre}
                </h3>

                {prestamo.entidad && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    {prestamo.entidad} · Indexado a {prestamo.moneda_indexacion}
                  </p>
                )}
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">

              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cuota actual
                </p>
                <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                  {kpis.cuotasPagadas} / {kpis.cuotasTotales}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Saldo pendiente
                </p>
                <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                  {kpis.saldoUvaPendiente != null
                    ? `${kpis.saldoUvaPendiente.toLocaleString('es-AR', { maximumFractionDigits: 2 })} UVA`
                    : '—'}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Total pagado
                </p>
                <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                  {formatARS(kpis.totalPagadoArs)}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cuotas restantes
                </p>
                <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                  {kpis.cuotasRestantes}
                </p>
              </div>

            </div>

            {/* BARRA DE AVANCE */}
            <div className="mt-5">
              <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{ width: `${kpis.porcentajeAvance}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-400 mt-2">
                <span>Cuota 1</span>
                <span>{kpis.porcentajeAvance.toFixed(1)}% pagado</span>
                <span>Cuota {kpis.cuotasTotales}</span>
              </div>
            </div>

            {/* COMPARATIVO CUOTA vs INFLACIÓN (últimos 12 meses) */}
            {kpis.promedioIncrementoCuota != null && (
              <div className="mt-5 flex flex-wrap gap-3">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800 px-4 py-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Incremento promedio de la cuota (12m)
                  </p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                    {kpis.promedioIncrementoCuota.toFixed(2)}%
                  </p>
                </div>

                {kpis.promedioInflacion != null && (
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800 px-4 py-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Inflación promedio (12m)
                    </p>
                    <p className={`
                      text-lg font-bold mt-1
                      ${
                        kpis.promedioIncrementoCuota <= kpis.promedioInflacion
                          ? 'text-emerald-600'
                          : 'text-rose-600'
                      }
                    `}>
                      {kpis.promedioInflacion.toFixed(2)}%
                    </p>
                  </div>
                )}
              </div>
            )}

          </div>


          {/* EVOLUCIÓN: VALOR UVA vs MONTO EN PESOS */}
          <div className="
            bg-white dark:bg-slate-900
            border border-slate-200 dark:border-slate-800
            rounded-2xl
            p-5
            shadow-sm
          ">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Evolución de la cuota
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
              Monto en pesos vs. valor de la UVA, cuota a cuota.
            </p>

            {evolucionData.length === 0 ? (
              <p className="text-sm text-slate-400">
                Todavía no hay cuotas cargadas con datos.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={evolucionData} margin={{ left: 10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />

                  <XAxis dataKey="cuota" fontSize={11} tickFormatter={(v) => `#${v}`} />

                  <YAxis
                    yAxisId="ars"
                    fontSize={11}
                    tickFormatter={(v) => formatARS(v)}
                  />

                  <YAxis
                    yAxisId="uva"
                    orientation="right"
                    fontSize={11}
                    tickFormatter={(v) => v.toLocaleString('es-AR')}
                  />

                  <Tooltip
                    formatter={(v, name) =>
                      name === 'monto_ars' ? formatARS(v) : v?.toLocaleString('es-AR')
                    }
                  />

                  <Legend />

                  <Bar
                    yAxisId="ars"
                    dataKey="monto_ars"
                    name="Monto ($)"
                    fill="#2563eb"
                    radius={[4, 4, 0, 0]}
                  />

                  <Line
                    yAxisId="uva"
                    type="monotone"
                    dataKey="valor_uva"
                    name="Valor UVA"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={false}
                  />

                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>


          {/* COMPARATIVO: INCREMENTO DE CUOTA vs INFLACIÓN */}
          <div className="
            bg-white dark:bg-slate-900
            border border-slate-200 dark:border-slate-800
            rounded-2xl
            p-5
            shadow-sm
          ">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              ¿La cuota le gana o le pierde a la inflación?
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
              Variación mensual del monto en pesos vs. inflación del mismo mes.
            </p>

            {comparativoData.length === 0 ? (
              <p className="text-sm text-slate-400">
                Hace falta al menos 2 cuotas cargadas para calcular variaciones.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={comparativoData} margin={{ left: 10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />

                  <XAxis dataKey="cuota" fontSize={11} tickFormatter={(v) => `#${v}`} />

                  <YAxis fontSize={11} tickFormatter={(v) => `${v}%`} />

                  <Tooltip formatter={(v) => `${Number(v).toFixed(2)}%`} />

                  <Legend />

                  <Bar
                    dataKey="incremento_cuota"
                    name="Incremento cuota ($)"
                    fill="#2563eb"
                    radius={[4, 4, 0, 0]}
                  />

                  <Line
                    type="monotone"
                    dataKey="inflacion"
                    name="Inflación (INDEC)"
                    stroke="#dc2626"
                    strokeWidth={2}
                    dot={false}
                  />

                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>


          {/* TABLA DE CUOTAS */}
          <div className="
            bg-white dark:bg-slate-900
            border border-slate-200 dark:border-slate-800
            rounded-2xl
            shadow-sm
            overflow-hidden
          ">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Detalle de cuotas
              </p>
            </div>

            {cuotas.length === 0 ? (
              <p className="text-sm text-slate-400 px-5 py-6">
                Todavía no hay cuotas cargadas.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="
                    bg-slate-50 dark:bg-slate-800
                    text-slate-500 dark:text-slate-300
                    text-xs uppercase
                  ">
                    <tr>
                      <th className="text-left px-4 py-2">Cuota</th>
                      <th className="text-left px-4 py-2">Fecha</th>
                      <th className="text-right px-4 py-2">Valor UVA</th>
                      <th className="text-right px-4 py-2">Saldo UVA</th>
                      <th className="text-right px-4 py-2">Monto $</th>
                      <th className="text-right px-4 py-2">Incremento</th>
                      <th className="text-right px-4 py-2">Inflación</th>
                    </tr>
                  </thead>

                  <tbody>
                    {cuotas.map((c) => (
                      <tr
                        key={c.id ?? `${c.id_prestamo}-${c.nro_cuota}`}
                        className="border-t border-slate-100 dark:border-slate-800"
                      >
                        <td className="px-4 py-2 whitespace-nowrap text-slate-700 dark:text-slate-300">
                          {c.nro_cuota}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-slate-700 dark:text-slate-300">
                          {c.fecha ?? '—'}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-500 dark:text-slate-400">
                          {c.valor_uva != null
                            ? c.valor_uva.toLocaleString('es-AR', { maximumFractionDigits: 2 })
                            : '—'}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-500 dark:text-slate-400">
                          {c.saldo_uva != null
                            ? c.saldo_uva.toLocaleString('es-AR', { maximumFractionDigits: 2 })
                            : '—'}
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-slate-900 dark:text-white">
                          {c.monto_ars != null ? formatARS(c.monto_ars) : '—'}
                        </td>
                        <td className={`
                          px-4 py-2 text-right
                          ${
                            c.incremento_monto_ars_pct == null
                              ? 'text-slate-400'
                              : c.incremento_monto_ars_pct > (c.inflacion_pct ?? Infinity)
                                ? 'text-rose-600'
                                : 'text-emerald-600'
                          }
                        `}>
                          {c.incremento_monto_ars_pct != null
                            ? `${Number(c.incremento_monto_ars_pct).toFixed(2)}%`
                            : '—'}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-500 dark:text-slate-400">
                          {c.inflacion_pct != null ? `${Number(c.inflacion_pct).toFixed(2)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </>
      )}

    </div>
  )
}
