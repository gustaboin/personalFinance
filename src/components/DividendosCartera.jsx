import { useEffect, useMemo, useState } from "react";
import {
  getDividendosCartera,
  getDividendosUltimos12m,
  getDividendosProximos,
} from "../lib/fundamentalesApi";

const usd = (v) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    v ?? 0,
  );
const num = (v, d = 2) =>
  Number(v).toLocaleString("en-US", { maximumFractionDigits: d });

// "2026-11-19" -> "19/11/26"
function fechaCorta(f) {
  if (!f) return "—";
  const [y, m, d] = String(f).slice(0, 10).split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

function leerRetencion() {
  try {
    const v = Number(localStorage.getItem("ret_dividendos"));
    return isFinite(v) && v >= 0 && v < 100 ? v : 0;
  } catch {
    return 0;
  }
}

// posiciones: las de la cuenta elegida (o todas) ya cargadas en Inversiones
export default function DividendosCartera({ posiciones, cuentaId }) {
  const esTodos = cuentaId === "todos";
  const [historico, setHistorico] = useState([]);
  const [recientes, setRecientes] = useState([]);
  const [proximosRaw, setProximosRaw] = useState([]);
  const [retencion, setRetencion] = useState(leerRetencion);
  const [verTodo, setVerTodo] = useState(false);

  useEffect(() => {
    getDividendosCartera(esTodos ? null : Number(cuentaId))
      .then(setHistorico)
      .catch(console.error);
    getDividendosUltimos12m().then(setRecientes).catch(console.error);
    // opcional: si todavía no corriste setup-fecha-pago-dividendos.sql, no rompe nada
    getDividendosProximos()
      .then(setProximosRaw)
      .catch(() => setProximosRaw([]));
  }, [cuentaId, esTodos]);

  function cambiarRetencion(valor) {
    const n = Math.min(Math.max(Number(valor) || 0, 0), 99);
    setRetencion(n);
    try {
      localStorage.setItem("ret_dividendos", String(n));
    } catch {
      /* sin storage: queda solo en memoria */
    }
  }
  const neto = 1 - retencion / 100;

  // Lo que tengo HOY por ticker: nominales, ratio y acciones del subyacente
  const tenencias = useMemo(() => {
    const m = {};
    for (const p of posiciones) {
      const t = (m[p.ticker] ??= {
        ticker: p.ticker,
        nominales: 0,
        ratio: Number(p.ratio_actual) || null,
      });
      t.nominales += Number(p.cantidad_actual ?? p.cantidad);
    }
    return m;
  }, [posiciones]);

  // Dividendo por acción de los últimos 12 meses, por ticker
  const dpsTtm = useMemo(() => {
    const m = {};
    for (const d of recientes)
      m[d.ticker] = (m[d.ticker] || 0) + Number(d.monto);
    return m;
  }, [recientes]);

  // Proyección por ticker (solo los que pagaron en los últimos 12 meses)
  const filas = useMemo(() => {
    return Object.values(tenencias)
      .filter((t) => dpsTtm[t.ticker] > 0 && t.ratio)
      .map((t) => {
        const acciones = t.nominales / t.ratio;
        const resto = t.nominales % t.ratio;
        return {
          ...t,
          acciones,
          dps: dpsTtm[t.ticker],
          proyeccion: acciones * dpsTtm[t.ticker] * neto,
          faltan: resto === 0 ? 0 : t.ratio - resto,
        };
      })
      .sort((a, b) => b.proyeccion - a.proyeccion);
  }, [tenencias, dpsTtm, neto]);

  const proyeccionTotal = filas.reduce((s, f) => s + f.proyeccion, 0);

  // Estimado cobrado (agrupa cuentas cuando es "Todos")
  const eventos = useMemo(() => {
    const m = {};
    for (const h of historico) {
      const k = `${h.ticker}|${h.fecha_ex}`;
      const e = (m[k] ??= {
        ticker: h.ticker,
        fecha_ex: h.fecha_ex,
        fecha_pago: h.fecha_pago ?? null,
        dps: Number(h.dividendo_por_accion),
        acciones: 0,
        estimado: 0,
      });
      e.acciones += Number(h.acciones);
      e.estimado += Number(h.estimado_usd);
    }
    return Object.values(m).sort((a, b) =>
      b.fecha_ex.localeCompare(a.fecha_ex),
    );
  }, [historico]);

  const hoy = new Date();
  const hoyISO = hoy.toISOString().slice(0, 10);

  // Próximos anunciados (fecha ex futura) de los tickers que tengo hoy
  const proximos = useMemo(() => {
    return proximosRaw
      .filter(
        (p) => p.fecha_ex && p.fecha_ex >= hoyISO && tenencias[p.ticker]?.ratio,
      )
      .map((p) => {
        const t = tenencias[p.ticker];
        const acciones = t.nominales / t.ratio;
        const dps = p.monto_estimado != null ? Number(p.monto_estimado) : null;
        return {
          ticker: p.ticker,
          fecha_ex: p.fecha_ex,
          fecha_pago: p.fecha_pago,
          acciones,
          dps,
          estimado: dps != null ? acciones * dps : null,
          proximo: true,
        };
      })
      .sort((a, b) => a.fecha_ex.localeCompare(b.fecha_ex));
  }, [proximosRaw, tenencias, hoyISO]);

  const filasTabla = [...proximos, ...eventos];

  const hace12m = new Date(hoy);
  hace12m.setFullYear(hoy.getFullYear() - 1);
  const anioActual = String(hoy.getFullYear());
  const cobrado12m = eventos
    .filter((e) => new Date(e.fecha_ex) >= hace12m)
    .reduce((s, e) => s + e.estimado * neto, 0);
  const cobradoAnio = eventos
    .filter((e) => e.fecha_ex.startsWith(anioActual))
    .reduce((s, e) => s + e.estimado * neto, 0);

  if (filas.length === 0 && eventos.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Dividendos de la cartera
        </p>
        <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          Retención
          <input
            type="number"
            min="0"
            max="99"
            step="1"
            value={retencion}
            onChange={(e) => cambiarRetencion(e.target.value)}
            className="w-16 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm text-slate-900 dark:text-slate-100"
          />
          %
        </label>
      </div>
      <p className="text-xs text-slate-400 mb-4">
        {esTodos ? "Todos los brokers" : "Broker seleccionado"} · estimación en
        USD según tus compras, ventas y los dividendos de Yahoo ·{" "}
        {retencion > 0
          ? `neto de ${retencion}% de retención`
          : "bruto, sin retenciones"}
      </p>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Cobrado {anioActual}
          </p>
          <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
            {usd(cobradoAnio)}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Últimos 12 meses
          </p>
          <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
            {usd(cobrado12m)}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Proyección 12 meses
          </p>
          <p className="text-lg font-bold text-emerald-600 mt-0.5">
            {usd(proyeccionTotal)}
          </p>
          <p className="text-[10px] text-slate-400">
            tenencia de hoy × dividendos del último año
          </p>
        </div>
      </div>

      {filas.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-xs uppercase text-slate-500 dark:text-slate-300">
              <tr>
                <th className="text-left px-3 py-2">Ticker</th>
                <th className="text-right px-3 py-2">Acciones</th>
                <th className="text-right px-3 py-2">Div. 12m / acción</th>
                <th className="text-right px-3 py-2">Proyección</th>
                <th className="text-right px-3 py-2">Para acción entera</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr
                  key={f.ticker}
                  className="border-t border-slate-100 dark:border-slate-800"
                >
                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">
                    {f.ticker}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">
                    {num(f.acciones)}
                    <span className="block text-[10px] text-slate-400">
                      {num(f.nominales, 0)} nom. ÷ {num(f.ratio, 0)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">
                    {usd(f.dps)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-slate-900 dark:text-white">
                    {usd(f.proyeccion)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">
                    {f.faltan === 0 ? (
                      <span className="text-emerald-600">completa</span>
                    ) : (
                      <>faltan {num(f.faltan, 0)}</>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filasTabla.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
            Calendario de dividendos
          </p>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-[460px] text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-xs uppercase text-slate-500 dark:text-slate-300">
                <tr>
                  <th className="text-left px-3 py-2">Ticker</th>
                  <th className="text-left px-3 py-2">Ex-div</th>
                  <th className="text-left px-3 py-2">Pago</th>
                  <th className="text-right px-3 py-2">Acc. × monto</th>
                  <th className="text-right px-3 py-2">Monto</th>
                </tr>
              </thead>
              <tbody>
                {(verTodo
                  ? filasTabla
                  : filasTabla.slice(0, proximos.length + 6)
                ).map((e) => {
                  const pagoFuturo = e.fecha_pago && e.fecha_pago >= hoyISO;
                  return (
                    <tr
                      key={`${e.ticker}-${e.fecha_ex}`}
                      className="border-t border-slate-100 dark:border-slate-800"
                    >
                      <td className="px-3 py-2 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                        {e.ticker}
                        {e.proximo && (
                          <span className="ml-1.5 rounded bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 text-[10px] font-medium">
                            próximo
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {fechaCorta(e.fecha_ex)}
                      </td>
                      <td
                        className={`px-3 py-2 font-semibold whitespace-nowrap ${
                          pagoFuturo
                            ? "text-emerald-600 dark:text-emerald-400"
                            : e.fecha_pago
                              ? "text-slate-900 dark:text-white"
                              : "text-slate-300 dark:text-slate-600 font-normal"
                        }`}
                        title={
                          e.fecha_pago
                            ? "Día en que se acredita el efectivo"
                            : "Yahoo no informa la fecha de pago de este dividendo"
                        }
                      >
                        {fechaCorta(e.fecha_pago)}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {num(e.acciones)} × {e.dps != null ? usd(e.dps) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-slate-900 dark:text-white whitespace-nowrap">
                        {e.estimado != null ? usd(e.estimado * neto) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {eventos.length > 6 && (
            <button
              onClick={() => setVerTodo(!verTodo)}
              className="mt-2 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            >
              {verTodo ? "Ver menos" : `Ver todas (${filasTabla.length})`}
            </button>
          )}
          <p className="text-[10px] text-slate-400 mt-1">
            Estimación en USD. En los próximos, el monto toma el último
            dividendo informado. La fecha de pago es el día en que entra el
            efectivo; en dividendos viejos puede faltar porque Yahoo no guarda
            ese dato histórico.
          </p>
        </div>
      )}
    </div>
  );
}
