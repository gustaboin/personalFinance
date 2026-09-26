import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import MonthSwitcher from '../components/MonthSwitcher'
import StatCard from '../components/StatCard'
import { currentMesPeriodo, formatARS, formatUSD } from '../lib/format'
import {
  getResumenCategoria,
  getDeudaFutura,
  getTipoCambio,
  setTipoCambio,
  getPresupuestos,
} from '../lib/api'

const OBJETIVO_AHORRO_USD_DEFAULT = 300

export default function Dashboard() {
  const [mesPeriodo, setMesPeriodo] = useState(currentMesPeriodo())
  const [resumen, setResumen] = useState([])
  const [deudaFutura, setDeudaFutura] = useState([])
  const [tc, setTc] = useState('')
  const [tcGuardado, setTcGuardado] = useState(null)
  const [objetivoUsd, setObjetivoUsd] = useState(OBJETIVO_AHORRO_USD_DEFAULT)
  const [loading, setLoading] = useState(true)
  const [savingTc, setSavingTc] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [resumenData, deudaData, tcData, presupuestos] = await Promise.all([
        getResumenCategoria(mesPeriodo),
        getDeudaFutura(mesPeriodo),
        getTipoCambio(mesPeriodo),
        getPresupuestos(mesPeriodo),
      ])
      if (cancelled) return
      setResumen(resumenData)
      setDeudaFutura(deudaData)
      setTc(tcData ?? '')
      setTcGuardado(tcData)
      const presupuestoAhorro = presupuestos.find((p) => p.categorias?.nombre === 'Ahorro' && p.moneda === 'USD')
      setObjetivoUsd(presupuestoAhorro ? Number(presupuestoAhorro.monto_objetivo) : OBJETIVO_AHORRO_USD_DEFAULT)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [mesPeriodo])

  const totales = useMemo(() => {
    const ingresos = resumen.filter((r) => r.tipo === 'Ingreso').reduce((s, r) => s + Number(r.total_ars), 0)
    const egresosTotal = resumen.filter((r) => r.tipo === 'Egreso').reduce((s, r) => s + Number(r.total_ars), 0)
    const ahorroRealizado = resumen.find((r) => r.categoria === 'Ahorro')?.total_ars ?? 0
    const egresosSinAhorro = egresosTotal - Number(ahorroRealizado)
    const tcValor = Number(tc) || 0
    const objetivoAhorroArs = objetivoUsd * tcValor
    const disponible = ingresos - egresosSinAhorro - objetivoAhorroArs
    const ahorroCumplido = Number(ahorroRealizado) >= objetivoAhorroArs && objetivoAhorroArs > 0
    const deudaTotal = deudaFutura.reduce((s, d) => s + Number(d.importe), 0)
    return { ingresos, egresosSinAhorro, ahorroRealizado: Number(ahorroRealizado), objetivoAhorroArs, disponible, ahorroCumplido, deudaTotal }
  }, [resumen, tc, objetivoUsd, deudaFutura])

  const semaforo = useMemo(() => {
    if (!tc) return { label: 'Cargá el tipo de cambio para calcular', tone: 'warn' }
    if (totales.disponible >= 0) return { label: 'Podés seguir, no tocás ahorros', tone: 'good' }
    if (totales.disponible >= -totales.objetivoAhorroArs * 0.2) return { label: 'Al límite — frená gastos no esenciales', tone: 'warn' }
    return { label: 'Frená — estás por debajo del ahorro objetivo', tone: 'bad' }
  }, [totales, tc])

  const chartData = resumen
    .filter((r) => r.tipo === 'Egreso' && Number(r.total_ars) > 0)
    .sort((a, b) => Number(b.total_ars) - Number(a.total_ars))
    .map((r) => ({ categoria: r.categoria, total: Number(r.total_ars) }))

  async function guardarTc() {
    if (!tc) return
    setSavingTc(true)
    try {
      await setTipoCambio(mesPeriodo, Number(tc))
      setTcGuardado(Number(tc))
      const resumenData = await getResumenCategoria(mesPeriodo)
      setResumen(resumenData)
    } finally {
      setSavingTc(false)
    }
  }

 return (
    <div className="space-y-6">

      {/* =====================================================
          HEADER
      ====================================================== */}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Resumen del mes
          </h2>

          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Tu situación financiera para este período.
          </p>
        </div>

        <MonthSwitcher
          mesPeriodo={mesPeriodo}
          onChange={setMesPeriodo}
        />
      </div>

      {/* =====================================================
          CONFIGURACIÓN DEL MES
      ====================================================== */}

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
        <div className="flex flex-wrap items-end gap-6">

          {/* Tipo de cambio */}
          <div>
            <label
              className="
                block
                text-xs
                font-medium
                text-slate-500
                dark:text-slate-400
                mb-1.5
              "
            >
              Tipo de cambio USD
            </label>

            <div className="flex gap-2">
              <input
                type="number"
                value={tc}
                onChange={(e) =>
                  setTc(e.target.value)
                }
                placeholder="ej. 1500"
                className="
                  w-32
                  rounded-lg
                  border border-slate-300
                  bg-white
                  text-slate-900
                  px-3
                  py-1.5
                  text-sm

                  focus:outline-none
                  focus:ring-2
                  focus:ring-slate-200

                  dark:border-slate-700
                  dark:bg-slate-800
                  dark:text-white
                  dark:focus:ring-slate-700
                "
              />

              <button
                onClick={guardarTc}
                disabled={savingTc || !tc}
                className="
                  rounded-lg
                  bg-slate-900
                  hover:bg-slate-800
                  text-white
                  text-sm
                  font-medium
                  px-3
                  py-1.5
                  disabled:opacity-40
                  transition-colors

                  dark:bg-slate-700
                  dark:hover:bg-slate-600
                "
              >
                {savingTc
                  ? 'Guardando...'
                  : 'Guardar'}
              </button>
            </div>
          </div>

          {/* Objetivo */}
          <div>
            <label
              className="
                block
                text-xs
                font-medium
                text-slate-500
                dark:text-slate-400
                mb-1.5
              "
            >
              Objetivo de ahorro mensual
            </label>

            <div className="flex items-center gap-2">
              <input
                type="number"
                value={objetivoUsd}
                onChange={(e) =>
                  setObjetivoUsd(
                    Number(e.target.value) || 0
                  )
                }
                className="
                  w-32
                  rounded-lg
                  border border-slate-300
                  bg-white
                  text-slate-900
                  px-3
                  py-1.5
                  text-sm

                  focus:outline-none
                  focus:ring-2
                  focus:ring-slate-200

                  dark:border-slate-700
                  dark:bg-slate-800
                  dark:text-white
                  dark:focus:ring-slate-700
                "
              />

              <span className="text-sm text-slate-500 dark:text-slate-400">
                USD
              </span>
            </div>
          </div>

          {/* Aviso TC */}
          {!tcGuardado && (
            <div
              className="
                flex-1
                min-w-[220px]
                rounded-lg
                bg-amber-50
                border border-amber-200
                px-3
                py-2

                dark:bg-amber-950/30
                dark:border-amber-900
              "
            >
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Sin tipo de cambio guardado.
                Los cálculos que convierten USD a ARS
                pueden estar incompletos.
              </p>
            </div>
          )}

        </div>
      </div>

      {/* =====================================================
          LOADING
      ====================================================== */}

      {loading ? (
        <p className="text-slate-400 dark:text-slate-500 text-sm">
          Cargando...
        </p>
      ) : (
        <>

          {/* =================================================
              SEMÁFORO
          ================================================== */}

          <div
            className={`
              rounded-2xl
              p-5
              shadow-sm
              text-white

              ${
                semaforo.tone === 'good'
                  ? 'bg-emerald-600'
                  : semaforo.tone === 'bad'
                    ? 'bg-rose-600'
                    : 'bg-amber-500'
              }
            `}
          >
            <p className="text-xs uppercase tracking-wide opacity-80 mb-1">
              Situación del mes
            </p>

            <p className="text-lg font-semibold">
              {semaforo.label}
            </p>
          </div>

          {/* =================================================
              PRINCIPALES NÚMEROS
          ================================================== */}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

            <StatCard
              label="Ingresos"
              value={formatARS(
                totales.ingresos
              )}
            />

            <StatCard
              label="Egresos"
              value={formatARS(
                totales.egresosSinAhorro
              )}
            />

            <StatCard
              label="Ahorro"
              value={formatARS(
                totales.ahorroRealizado
              )}
              sub={`
                Objetivo: ${formatUSD(
                  objetivoUsd
                )}
                (${formatARS(
                  totales.objetivoAhorroArs
                )})
              `}
              tone={
                totales.ahorroCumplido
                  ? 'good'
                  : 'warn'
              }
            />

            <StatCard
              label="Disponible"
              value={formatARS(
                totales.disponible
              )}
              tone={
                totales.disponible >= 0
                  ? 'good'
                  : 'bad'
              }
            />

          </div>

          {/* =================================================
              DEUDA FUTURA
          ================================================== */}

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
            <div className="flex flex-wrap items-center justify-between gap-3">

              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Deuda comprometida
                </p>

                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  Cuotas que vencen después de este mes.
                </p>
              </div>

              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {formatARS(
                  totales.deudaTotal
                )}
              </p>

            </div>
          </div>

          {/* =================================================
              GASTOS POR CATEGORÍA
          ================================================== */}

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
            <div className="mb-4">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Egresos por categoría
              </p>

              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Distribución de tus gastos durante el mes.
              </p>
            </div>

            {chartData.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">
                Sin gastos cargados este mes.
              </p>
            ) : (
              <ResponsiveContainer
                width="100%"
                height={Math.max(
                  220,
                  chartData.length * 40
                )}
              >
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{
                    left: 24,
                    right: 20,
                  }}
                >

                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    stroke="#64748b"
                    opacity={0.2}
                  />

                  <XAxis
                    type="number"
                    tickFormatter={(v) =>
                      formatARS(v)
                    }
                    fontSize={11}
                    stroke="#94a3b8"
                  />

                  <YAxis
                    type="category"
                    dataKey="categoria"
                    width={140}
                    fontSize={12}
                    stroke="#94a3b8"
                  />

                  <Tooltip
                    formatter={(v) =>
                      formatARS(v)
                    }
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '10px',
                      color: '#fff',
                    }}
                  />

                  <Bar
                    dataKey="total"
                    fill="#3b82f6"
                    radius={[
                      0,
                      6,
                      6,
                      0,
                    ]}
                  />

                </BarChart>
              </ResponsiveContainer>
            )}

          </div>

        </>
      )}
    </div>
  )
}
