import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import MonthSwitcher from "../components/MonthSwitcher";
import StatCard from "../components/StatCard";
import SaldosPanel from "../components/SaldosPanel";
import { currentMesPeriodo, formatARS, formatUSD } from "../lib/format";
import {
  getResumenCategoria,
  getDeudaFutura,
  getCotizacionActual,
  getPresupuestos,
} from "../lib/api";

const OBJETIVO_AHORRO_USD_DEFAULT = 300;

export default function Dashboard() {
  const [mesPeriodo, setMesPeriodo] = useState(currentMesPeriodo());
  const [resumen, setResumen] = useState([]);
  const [deudaFutura, setDeudaFutura] = useState([]);
  const [cotizacion, setCotizacion] = useState(null); // { fecha, valorventa } | null
  const [objetivoUsd, setObjetivoUsd] = useState(OBJETIVO_AHORRO_USD_DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saldoProp, setSaldoProp] = useState(true);

  // Toggle para incluir/excluir gastos de proyectos (ej. Obra) del resumen del mes
  const [incluirProyectos, setIncluirProyectos] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [resumenData, deudaData, cotizacionData, presupuestos] =
        await Promise.all([
          getResumenCategoria(mesPeriodo),
          getDeudaFutura(mesPeriodo),
          getCotizacionActual("USD"),
          getPresupuestos(mesPeriodo),
        ]);
      if (cancelled) return;
      setResumen(resumenData);
      setDeudaFutura(deudaData);
      setCotizacion(cotizacionData);
      const presupuestoAhorro = presupuestos.find(
        (p) => p.categorias?.nombre === "Ahorro" && p.moneda === "USD",
      );
      setObjetivoUsd(
        presupuestoAhorro
          ? Number(presupuestoAhorro.monto_objetivo)
          : OBJETIVO_AHORRO_USD_DEFAULT,
      );
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [mesPeriodo]);

  // Base filtrada: si incluirProyectos es false (default), sacamos las filas es_proyecto = true
  const datosFiltrados = useMemo(() => {
    if (incluirProyectos) return resumen;
    return resumen.filter((r) => r.es_proyecto !== true);
  }, [resumen, incluirProyectos]);

  const hayDatosDeProyecto = useMemo(
    () => resumen.some((r) => r.es_proyecto === true),
    [resumen],
  );

  const tcValor = Number(cotizacion?.valorventa) || 0;

  const totales = useMemo(() => {
    const ingresos = datosFiltrados
      .filter((r) => r.tipo === "Ingreso")
      .reduce((s, r) => s + Number(r.total_ars), 0);
    const egresosTotal = datosFiltrados
      .filter((r) => r.tipo === "Egreso")
      .reduce((s, r) => s + Number(r.total_ars), 0);
    const ahorroRealizado =
      datosFiltrados.find((r) => r.categoria === "Ahorro")?.total_ars ?? 0;
    const egresosSinAhorro = egresosTotal - Number(ahorroRealizado);
    const objetivoAhorroArs = objetivoUsd * tcValor;
    const disponible = ingresos - egresosSinAhorro - objetivoAhorroArs;
    const ahorroCumplido =
      Number(ahorroRealizado) >= objetivoAhorroArs && objetivoAhorroArs > 0;
    const deudaTotal = deudaFutura.reduce((s, d) => s + Number(d.importe), 0);
    return {
      ingresos,
      egresosSinAhorro,
      ahorroRealizado: Number(ahorroRealizado),
      objetivoAhorroArs,
      disponible,
      ahorroCumplido,
      deudaTotal,
    };
  }, [datosFiltrados, tcValor, objetivoUsd, deudaFutura]);

  const semaforo = useMemo(() => {
    if (!tcValor)
      return { label: "Sin cotización disponible todavía", tone: "warn" };
    if (totales.disponible >= 0)
      return { label: "Podés seguir, no tocás ahorros", tone: "good" };
    if (totales.disponible >= -totales.objetivoAhorroArs * 0.2)
      return { label: "Al límite — frená gastos no esenciales", tone: "warn" };
    return {
      label: "Frená — estás por debajo del ahorro objetivo",
      tone: "bad",
    };
  }, [totales, tcValor]);

  const chartData = datosFiltrados
    .filter((r) => r.tipo === "Egreso" && Number(r.total_ars) > 0)
    .sort((a, b) => Number(b.total_ars) - Number(a.total_ars))
    .map((r) => ({ categoria: r.categoria, total: Number(r.total_ars) }));

  return (
    <div className="space-y-4">
      {/* =====================================================
          HEADER
      ====================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Resumen del mes
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Tu situación financiera para este período.
          </p>
        </div>

        <MonthSwitcher mesPeriodo={mesPeriodo} onChange={setMesPeriodo} />
      </div>

      {/* =====================================================
          SALDOS DE CUENTAS (vista compacta / toggle)
      ====================================================== */}
      <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm">
        <SaldosPanel compact={false} soloSaldoProp={saldoProp} />
      </div>

      {/* =====================================================
          CONFIGURACIÓN DEL MES
      ====================================================== */}
      <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex flex-wrap items-center gap-6">
            {/* Cotización USD */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Cotización USD
              </label>
              {cotizacion ? (
                <div>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {formatARS(cotizacion.valorventa)}
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    al {cotizacion.fecha}
                  </p>
                </div>
              ) : (
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  Sin cotización cargada todavía.
                </p>
              )}
            </div>

            {/* Objetivo de Ahorro */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Objetivo de ahorro mensual
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={objetivoUsd}
                  onChange={(e) => setObjetivoUsd(Number(e.target.value) || 0)}
                  className="w-28 rounded-xl border border-slate-300 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white px-3 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                />
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  USD
                </span>
              </div>
            </div>
          </div>

          {/* Toggle Proyectos */}
          {hayDatosDeProyecto && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Gastos de proyectos
              </label>
              <button
                onClick={() => setIncluirProyectos((v) => !v)}
                className={`rounded-xl text-xs font-semibold px-4 py-2 transition-all duration-200 border ${
                  incluirProyectos
                    ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/40 hover:bg-amber-500/30"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                {incluirProyectos ? "Ocultar proyectos" : "Incluir proyectos"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* =====================================================
          LOADING
      ====================================================== */}
      {loading ? (
        <div className="py-12 text-center">
          <p className="text-slate-400 dark:text-slate-500 text-sm font-medium animate-pulse">
            Cargando información del mes...
          </p>
        </div>
      ) : (
        <>
          {/* =================================================
              SEMÁFORO DE SITUACIÓN
          ================================================== */}
          <div
            className={`rounded-2xl p-4 border flex items-center gap-3 transition-all ${
              semaforo.tone === "good"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                : semaforo.tone === "bad"
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-400"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400"
            }`}
          >
            <span className="relative flex h-3 w-3 shrink-0">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  semaforo.tone === "good"
                    ? "bg-emerald-400"
                    : semaforo.tone === "bad"
                      ? "bg-rose-400"
                      : "bg-amber-400"
                }`}
              ></span>
              <span
                className={`relative inline-flex rounded-full h-3 w-3 ${
                  semaforo.tone === "good"
                    ? "bg-emerald-500"
                    : semaforo.tone === "bad"
                      ? "bg-rose-500"
                      : "bg-amber-500"
                }`}
              ></span>
            </span>
            <div>
              <p className="text-[10px] font-bold tracking-wider uppercase opacity-80">
                Situación del mes
              </p>
              <p className="text-sm font-semibold">{semaforo.label}</p>
            </div>
          </div>

          {/* =================================================
              PRINCIPALES NÚMEROS (FINTECH METRICS)
          ================================================== */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* INGRESOS */}
            <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-all">
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Ingresos
              </p>
              <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-2 tracking-tight">
                {formatARS(totales.ingresos)}
              </p>
            </div>

            {/* EGRESOS */}
            <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-all">
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Egresos
              </p>
              <p className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-2 tracking-tight">
                {formatARS(totales.egresosSinAhorro)}
              </p>
            </div>

            {/* AHORRO */}
            <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-all">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Ahorro
                </p>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    totales.ahorroCumplido
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                  }`}
                >
                  {totales.ahorroCumplido ? "Objetivo OK" : "Pendiente"}
                </span>
              </div>
              <p className="text-2xl font-extrabold text-sky-600 dark:text-sky-400 mt-2 tracking-tight">
                {formatARS(totales.ahorroRealizado)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-1.5 font-medium">
                Objetivo: {formatUSD(objetivoUsd)} (
                {formatARS(totales.objetivoAhorroArs)})
              </p>
            </div>

            {/* DISPONIBLE */}
            <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-all">
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Disponible
              </p>
              <p
                className={`text-2xl font-extrabold mt-2 tracking-tight ${
                  totales.disponible >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {formatARS(totales.disponible)}
              </p>
            </div>
          </div>

          {/* =================================================
              DEUDA FUTURA
          ================================================== */}
          <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Deuda comprometida
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  Cuotas que vencen después de este mes.
                </p>
              </div>
              <p className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {formatARS(totales.deudaTotal)}
              </p>
            </div>
          </div>

          {/* =================================================
              GASTOS POR CATEGORÍA
          ================================================== */}
          <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Egresos por categoría
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Distribución de tus gastos durante el mes
                {!incluirProyectos && hayDatosDeProyecto
                  ? " (sin proyectos)"
                  : ""}
                .
              </p>
            </div>

            {chartData.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500 py-6 text-center">
                Sin gastos cargados este mes.
              </p>
            ) : (
              <ResponsiveContainer
                width="100%"
                height={Math.max(220, chartData.length * 40)}
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
                    stroke="#475569"
                    opacity={0.15}
                  />

                  <XAxis
                    type="number"
                    tickFormatter={(v) => formatARS(v)}
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
                    formatter={(v) => formatARS(v)}
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: "10px",
                      color: "#fff",
                      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                    }}
                  />
                  <defs>
                    <linearGradient
                      id="textGradient"
                      x1="0"
                      y1="0"
                      x2="1"
                      y2="0"
                    >
                      <stop offset="0%" stopColor="#0284c7" />
                      <stop offset="100%" stopColor="#38bdf8" />
                    </linearGradient>
                  </defs>
                  <Bar
                    dataKey="total"
                    fill="url(#textGradient)"
                    radius={[0, 6, 6, 0]}
                    isAnimationActive={true} // Activa la animación suave al cargar
                    animationDuration={1000}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}
    </div>
  );
}
