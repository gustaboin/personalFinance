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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Resumen del mes</h2>
        <MonthSwitcher mesPeriodo={mesPeriodo} onChange={setMesPeriodo} />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-end gap-4 shadow-sm">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Tipo de cambio USD de este mes</label>
          <div className="flex gap-2">
            <input
              type="number"
              value={tc}
              onChange={(e) => setTc(e.target.value)}
              placeholder="ej. 1500"
              className="w-32 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <button
              onClick={guardarTc}
              disabled={savingTc || !tc}
              className="rounded-lg bg-slate-900 text-white text-sm px-3 py-1.5 disabled:opacity-40"
            >
              Guardar
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Objetivo de ahorro mensual (USD)</label>
          <input
            type="number"
            value={objetivoUsd}
            onChange={(e) => setObjetivoUsd(Number(e.target.value) || 0)}
            className="w-32 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        {!tcGuardado && (
          <p className="text-xs text-amber-600">Sin tipo de cambio guardado, los cálculos en ARS pueden no incluir tus aportes en USD.</p>
        )}
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm">Cargando...</p>
      ) : (
        <>
          <div
            className={`rounded-2xl p-5 text-white font-medium shadow-sm ${
              semaforo.tone === 'good' ? 'bg-emerald-600' : semaforo.tone === 'bad' ? 'bg-rose-600' : 'bg-amber-500'
            }`}
          >
            {semaforo.label}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Ingresos" value={formatARS(totales.ingresos)} />
            <StatCard label="Egresos (sin ahorro)" value={formatARS(totales.egresosSinAhorro)} />
            <StatCard
              label="Ahorro este mes"
              value={formatARS(totales.ahorroRealizado)}
              sub={`Objetivo: ${formatUSD(objetivoUsd)} (${formatARS(totales.objetivoAhorroArs)})`}
              tone={totales.ahorroCumplido ? 'good' : 'warn'}
            />
            <StatCard
              label="Disponible"
              value={formatARS(totales.disponible)}
              tone={totales.disponible >= 0 ? 'good' : 'bad'}
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-700 mb-1">Deuda comprometida en cuotas futuras</p>
            <p className="text-xl font-semibold text-slate-900">{formatARS(totales.deudaTotal)}</p>
            <p className="text-xs text-slate-400">Suma de todas las cuotas que vencen después de este mes</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-700 mb-4">Egresos por categoría</p>
            {chartData.length === 0 ? (
              <p className="text-sm text-slate-400">Sin gastos cargados este mes.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 40)}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => formatARS(v)} fontSize={12} />
                  <YAxis type="category" dataKey="categoria" width={140} fontSize={12} />
                  <Tooltip formatter={(v) => formatARS(v)} />
                  <Bar dataKey="total" fill="#0f172a" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}
    </div>
  )
}
