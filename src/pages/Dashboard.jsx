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
  const [saldoProp, setSaldoProp] = useState(true); // Estado para controlar la visibilidad del detalle de cuentas en el Dashboard (por defecto oculto: false)

  // Estado para controlar la visibilidad del detalle de cuentas en el Dashboard (por defecto oculto: true)
  //const [soloSaldoDashboard, setSoloSaldoDashboard] = useState(true);

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

        <MonthSwitcher mesPeriodo={mesPeriodo} onChange={setMesPeriodo} />
      </div>

      {/* =====================================================
          SALDOS DE CUENTAS (vista compacta / toggle)
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
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Saldos
          </p>
        </div>

        {/* Pasamos la prop de control al componente SaldosPanel */}
        <SaldosPanel compact={false} soloSaldoProp={saldoProp} />
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
          {/* Cotización USD — solo lectura, viene del cron diario del BCRA */}
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
              Cotización USD
            </label>

            {cotizacion ? (
              <div>
                <p className="text-lg font-semibold text-slate-900 dark:text-white">
                  {formatARS(cotizacion.valorventa)}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  al {cotizacion.fecha}
                </p>
              </div>
            ) : (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Sin cotización cargada todavía.
              </p>
            )}
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
                onChange={(e) => setObjetivoUsd(Number(e.target.value) || 0)}
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

          {/* Toggle proyectos: solo se muestra si el mes tiene algún gasto de proyecto */}
          {hayDatosDeProyecto && (
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
                Gastos de proyectos
              </label>

              <button
                onClick={() => setIncluirProyectos((v) => !v)}
                className="
                          rounded-xl text-sm font-medium px-4 py-2 
                          transition-all duration-200 shadow-md shadow-[#fa6400]/20 active:scale-[0.98]
                          bg-[#fa6400]/75 hover:bg-[#e05900] 
                          text-slate-100 dark:text-slate-300"
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
                semaforo.tone === "good"
                  ? "bg-emerald-600"
                  : semaforo.tone === "bad"
                    ? "bg-rose-600"
                    : "bg-blue-400/75"
              }
            `}
          >
            <p className="text-xs uppercase tracking-wide opacity-80 mb-1">
              Situación del mes
            </p>

            <p className="text-lg font-semibold">{semaforo.label}</p>
          </div>

          {/* =================================================
              PRINCIPALES NÚMEROS
          ================================================== */}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Ingresos"
              value={formatARS(totales.ingresos)}
              className="bg-[#5cb85c]"
              textColor="text-white-400 dark:text-emerald-200"
            />

            <StatCard
              label="Egresos"
              value={formatARS(totales.egresosSinAhorro)}
              className="bg-red-600/75"
              textColor="text-white-800 dark:text-red-200"
            />

            <StatCard
              label="Ahorro"
              value={formatARS(totales.ahorroRealizado)}
              sub={`
                Objetivo: ${formatUSD(objetivoUsd)}
                (${formatARS(totales.objetivoAhorroArs)})
              `}
              tone={totales.ahorroCumplido ? "good" : "warn"}
              className="bg-[#337ab7]"
              textColor="text-white-800 dark:text-cyan-200"
            />

            <StatCard
              label="Disponible"
              value={formatARS(totales.disponible)}
              tone={totales.disponible >= 0 ? "good" : "bad"}
              className={
                totales.disponible >= 0 ? "bg-emerald-600/75" : "bg-rose-600/75"
              }
              textColor="text-white-800 dark:text-white"
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
                {formatARS(totales.deudaTotal)}
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
                Distribución de tus gastos durante el mes
                {!incluirProyectos && hayDatosDeProyecto
                  ? " (sin proyectos)"
                  : ""}
                .
              </p>
            </div>

            {chartData.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">
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
                    stroke="#64748b"
                    opacity={0.2}
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
                      <stop offset="0%" stopColor="#337ab7" />
                      <stop offset="100%" stopColor="#60a5fa" />
                    </linearGradient>
                  </defs>
                  <Bar
                    dataKey="total"
                    fill="url(#textGradient)"
                    radius={[0, 6, 6, 0]}
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
