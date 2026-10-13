import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { X } from "lucide-react";
import LogoTicker from "./LogoTicker";
import {
  getInfoTicker,
  getFundamentales,
  getDividendos,
  getUltimoPrecio,
} from "../lib/fundamentalesApi";

const COLORES = [
  "#2563eb",
  "#059669",
  "#f59e0b",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
];

const TABS = [
  { id: "resultados", label: "Resultados" },
  { id: "balance", label: "Balance" },
  { id: "flujo", label: "Flujo de caja" },
  { id: "dividendos", label: "Dividendos" },
];

// Series de cada pestaña (k = metrica guardada por la Edge Function)
const SERIES = {
  resultados: [
    { k: "totalRevenue", l: "Ingresos" },
    { k: "grossProfit", l: "Ganancia bruta" },
    { k: "operatingIncome", l: "Resultado operativo" },
    { k: "netIncome", l: "Ganancia neta" },
  ],
  balance: [
    { k: "totalAssets", l: "Activos" },
    { k: "totalLiabilitiesNetMinorityInterest", l: "Pasivos" },
    { k: "stockholdersEquity", l: "Patrimonio" },
    { k: "cashAndCashEquivalents", l: "Caja" },
    { k: "longTermDebt", l: "Deuda a largo plazo" },
  ],
  flujo: [
    { k: "operatingCashFlow", l: "Flujo operativo" },
    { k: "freeCashFlow", l: "Flujo libre" },
    { k: "capitalExpenditure", l: "Inversión (capex)" },
    { k: "cashDividendsPaid", l: "Dividendos pagados" },
  ],
};

// ---------- formato ----------
function compacto(v, moneda) {
  if (v == null || !isFinite(v)) return "—";
  const sim = moneda === "USD" ? "$" : "";
  const n = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(Math.abs(v));
  return `${v < 0 ? "-" : ""}${sim}${n}`;
}
const pct = (x) =>
  x == null || !isFinite(x) ? "—" : `${(x * 100).toFixed(1)}%`;
const veces = (x) => (x == null || !isFinite(x) ? "—" : `${x.toFixed(2)}x`);
const dinero = (v, m = "USD") =>
  v == null ? "—" : `${m === "USD" ? "$" : ""}${Number(v).toFixed(2)}`;
const ratio = (a, b) => (a == null || b == null || b === 0 ? null : a / b);
const crece = (a, b) => (a == null || b == null || b === 0 ? null : a / b - 1);

function Kpi({ label, valor, nota, tono }) {
  const color =
    tono === "pos"
      ? "text-emerald-600"
      : tono === "neg"
        ? "text-rose-600"
        : "text-slate-900 dark:text-white";
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${color}`}>{valor}</p>
      {nota && <p className="text-[10px] text-slate-400 mt-0.5">{nota}</p>}
    </div>
  );
}

export default function FichaTicker({ ticker, onClose }) {
  const [info, setInfo] = useState(null);
  const [filas, setFilas] = useState([]);
  const [divs, setDivs] = useState([]);
  const [precio, setPrecio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("resultados");
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    Promise.all([
      getInfoTicker(ticker),
      getFundamentales(ticker),
      getDividendos(ticker),
      getUltimoPrecio(ticker),
    ])
      .then(([i, f, d, p]) => {
        if (cancelado) return;
        setInfo(i);
        setFilas(f);
        setDivs(d);
        setPrecio(p);
        // ETF o sin estados contables -> arranca en Dividendos
        setTab(f.length === 0 ? "dividendos" : "resultados");
      })
      .catch((e) => !cancelado && setError(e.message))
      .finally(() => !cancelado && setLoading(false));
    return () => {
      cancelado = true;
    };
  }, [ticker]);

  // { metrica: { "2025": valor } } y moneda de reporte
  const { m, anios, moneda, actualizado } = useMemo(() => {
    const m = {};
    const setAnios = new Set();
    let moneda = null;
    let actualizado = null;
    for (const f of filas) {
      const a = String(f.fecha_periodo).slice(0, 4);
      (m[f.metrica] ??= {})[a] = Number(f.valor);
      setAnios.add(a);
      moneda = moneda || f.moneda;
      if (!actualizado || f.actualizado_en > actualizado)
        actualizado = f.actualizado_en;
    }
    return { m, anios: [...setAnios].sort(), moneda, actualizado };
  }, [filas]);

  const ultimo = anios[anios.length - 1];
  const previo = anios[anios.length - 2];
  const v = (k, a = ultimo) => m[k]?.[a] ?? null;

  const hayFundamentales = filas.length > 0;
  const tabs = hayFundamentales
    ? TABS
    : TABS.filter((t) => t.id === "dividendos");

  // ---------- datos del gráfico por pestaña ----------
  const series = (SERIES[tab] ?? []).filter((s) => m[s.k]);
  const datosGrafico = anios.map((a) => ({
    anio: a,
    ...Object.fromEntries(series.map((s) => [s.k, m[s.k]?.[a] ?? null])),
  }));

  // ---------- dividendos ----------
  const dividendos = useMemo(() => {
    const porAnio = {};
    for (const d of divs) {
      const a = String(d.fecha_ex).slice(0, 4);
      porAnio[a] = (porAnio[a] || 0) + Number(d.monto);
    }
    const hoy = new Date();
    const hace12m = new Date(hoy);
    hace12m.setFullYear(hoy.getFullYear() - 1);
    const ttm = divs
      .filter((d) => new Date(d.fecha_ex) >= hace12m)
      .reduce((s, d) => s + Number(d.monto), 0);
    const grafico = Object.entries(porAnio)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-10)
      .map(([anio, total]) => ({ anio, total: Number(total.toFixed(4)) }));
    return { porAnio, ttm, grafico };
  }, [divs]);

  const anioPagoCompleto = String(new Date().getFullYear() - 1);
  const eps = v("dilutedEPS", anioPagoCompleto);
  const payout = ratio(dividendos.porAnio[anioPagoCompleto], eps);
  const yieldAprox = precio?.precio_usd
    ? dividendos.ttm / Number(precio.precio_usd)
    : null;

  // ---------- KPIs por pestaña ----------
  const rev = v("totalRevenue");
  const kpis = {
    resultados: [
      { label: "Margen bruto", valor: pct(ratio(v("grossProfit"), rev)) },
      {
        label: "Margen operativo",
        valor: pct(ratio(v("operatingIncome"), rev)),
      },
      { label: "Margen neto", valor: pct(ratio(v("netIncome"), rev)) },
      {
        label: "Ingresos vs año anterior",
        valor: pct(crece(rev, v("totalRevenue", previo))),
        tono: (crece(rev, v("totalRevenue", previo)) ?? 0) >= 0 ? "pos" : "neg",
      },
      {
        label: "EPS diluido",
        valor: dinero(v("dilutedEPS"), moneda),
        nota: previo
          ? `vs año anterior: ${pct(crece(v("dilutedEPS"), v("dilutedEPS", previo)))}`
          : null,
      },
    ],
    balance: [
      {
        label: "Deuda LP / patrimonio",
        valor: veces(ratio(v("longTermDebt"), v("stockholdersEquity"))),
      },
      {
        label: "Pasivos / activos",
        valor: pct(
          ratio(v("totalLiabilitiesNetMinorityInterest"), v("totalAssets")),
        ),
      },
      { label: "Caja", valor: compacto(v("cashAndCashEquivalents"), moneda) },
      { label: "Patrimonio", valor: compacto(v("stockholdersEquity"), moneda) },
    ],
    flujo: [
      { label: "Flujo libre", valor: compacto(v("freeCashFlow"), moneda) },
      {
        label: "Margen de flujo libre",
        valor: pct(ratio(v("freeCashFlow"), rev)),
      },
      {
        label: "Capex / flujo operativo",
        valor: pct(
          ratio(
            Math.abs(v("capitalExpenditure") ?? NaN),
            v("operatingCashFlow"),
          ),
        ),
      },
      {
        label: "Cobertura de dividendos",
        valor: veces(
          ratio(v("freeCashFlow"), Math.abs(v("cashDividendsPaid") ?? NaN)),
        ),
        nota: "flujo libre ÷ dividendos pagados",
      },
    ],
    dividendos: [
      {
        label: "Último dividendo",
        valor: dinero(divs[0]?.monto, divs[0]?.moneda || "USD"),
        nota: divs[0]?.fecha_ex,
      },
      {
        label: "Últimos 12 meses",
        valor: dinero(dividendos.ttm),
        nota: "por acción",
      },
      {
        label: "Yield aprox.",
        valor: pct(yieldAprox),
        nota: precio ? `precio ${dinero(precio.precio_usd)}` : null,
      },
      {
        label: `Payout ${anioPagoCompleto}`,
        valor: pct(payout),
        nota: "dividendos ÷ EPS",
      },
    ],
  };

  const tickDark = { fill: "#94a3b8", fontSize: 11 };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <LogoTicker ticker={ticker} size={52} className="rounded-xl" />
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                {ticker}
              </h3>
              <p className="text-xs text-slate-400">
                {info?.nombre ? `${info.nombre} · ` : ""}
                {moneda && moneda !== "USD" ? `Reporta en ${moneda} · ` : ""}
                {actualizado
                  ? `Actualizado ${String(actualizado).slice(0, 10)}`
                  : "Sin estados contables cargados"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400 py-10 text-center">
            Cargando...
          </p>
        ) : error ? (
          <p className="text-sm text-red-600 dark:text-red-400 py-6 text-center">
            {error}
          </p>
        ) : (
          <>
            {!hayFundamentales && (
              <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2 mb-4">
                {ticker} no tiene estados contables en Yahoo (típico de un ETF)
                o todavía no se sincronizó. Se muestran solo los dividendos.
              </p>
            )}

            {/* Pestañas */}
            <div className="inline-flex flex-wrap rounded-lg bg-slate-100 dark:bg-slate-800 p-1 mb-4">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                    tab === t.id
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200 dark:bg-slate-700 dark:text-white dark:ring-slate-600"
                      : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
              {kpis[tab].map((k) => (
                <Kpi key={k.label} {...k} />
              ))}
            </div>

            {/* Gráfico */}
            {tab !== "dividendos" ? (
              series.length === 0 ? (
                <p className="text-sm text-slate-400 py-8 text-center">
                  Sin datos en esta sección.
                </p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={datosGrafico}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                      <XAxis dataKey="anio" tick={tickDark} />
                      <YAxis
                        tick={tickDark}
                        tickFormatter={(x) => compacto(x, moneda)}
                        width={64}
                      />
                      <Tooltip formatter={(x) => compacto(x, moneda)} />
                      <Legend />
                      {series.map((s, i) => (
                        <Bar
                          key={s.k}
                          dataKey={s.k}
                          name={s.l}
                          fill={COLORES[i % COLORES.length]}
                          radius={[3, 3, 0, 0]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>

                  {/* Tabla con los números */}
                  <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full min-w-[420px] text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-800 text-xs uppercase text-slate-500 dark:text-slate-300">
                        <tr>
                          <th className="text-left px-3 py-2">Métrica</th>
                          {anios.map((a) => (
                            <th key={a} className="text-right px-3 py-2">
                              {a}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ...series,
                          ...(tab === "resultados" && m.dilutedEPS
                            ? [{ k: "dilutedEPS", l: "EPS diluido" }]
                            : []),
                        ].map((s) => (
                          <tr
                            key={s.k}
                            className="border-t border-slate-100 dark:border-slate-800"
                          >
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                              {s.l}
                            </td>
                            {anios.map((a) => (
                              <td
                                key={a}
                                className="px-3 py-2 text-right text-slate-900 dark:text-white"
                              >
                                {s.k === "dilutedEPS"
                                  ? dinero(m[s.k]?.[a], moneda)
                                  : compacto(m[s.k]?.[a], moneda)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            ) : divs.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">
                {ticker} no registra dividendos en Yahoo.
              </p>
            ) : (
              <>
                <p className="text-xs text-slate-400 mb-2">
                  Dividendo anual por acción del subyacente (no por CEDEAR).
                  Para tu cartera dividilo por el ratio.
                </p>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={dividendos.grafico}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                    <XAxis dataKey="anio" tick={tickDark} />
                    <YAxis
                      tick={tickDark}
                      tickFormatter={(x) => `$${x}`}
                      width={48}
                    />
                    <Tooltip formatter={(x) => `$${Number(x).toFixed(2)}`} />
                    <Bar
                      dataKey="total"
                      name="Dividendos por acción"
                      fill={COLORES[1]}
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>

                <div className="mt-5 space-y-2">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Últimos pagos
                  </p>
                  {divs.slice(0, 8).map((d) => (
                    <div
                      key={d.fecha_ex}
                      className="flex items-center justify-between rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-800"
                    >
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        Ex-dividendo {d.fecha_ex}
                      </p>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {dinero(d.monto, d.moneda || "USD")}
                      </p>
                    </div>
                  ))}
                  <p className="text-[10px] text-slate-400">
                    Yahoo informa la fecha ex-dividendo; la fecha de pago suele
                    ser unos días después.
                  </p>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
