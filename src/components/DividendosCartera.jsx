import { useEffect, useMemo, useState } from "react";
import {
  getDividendosCartera,
  getDividendosUltimos12m,
} from "../lib/fundamentalesApi";

const usd = (v) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v ?? 0);
const num = (v, d = 2) =>
  Number(v).toLocaleString("en-US", { maximumFractionDigits: d });

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
  const [retencion, setRetencion] = useState(leerRetencion);
  const [verTodo, setVerTodo] = useState(false);

  useEffect(() => {
    getDividendosCartera(esTodos ? null : Number(cuentaId))
      .then(setHistorico)
      .catch(console.error);
    getDividendosUltimos12m().then(setRecientes).catch(console.error);
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
      const t = (m[p.ticker] ??= { ticker: p.ticker, nominales: 0, ratio: Number(p.ratio_actual) || null });
      t.nominales += Number(p.cantidad_actual ?? p.cantidad);
    }
    return m;
  }, [posiciones]);

  // Dividendo por acción de los últimos 12 meses, por ticker
  const dpsTtm = useMemo(() => {
    const m = {};
    for (const d of recientes) m[d.ticker] = (m[d.ticker] || 0) + Number(d.monto);
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
      const e = (m[k] ??= { ticker: h.ticker, fecha_ex: h.fecha_ex, dps: Number(h.dividendo_por_accion), acciones: 0, estimado: 0 });
      e.acciones += Number(h.acciones);
      e.estimado += Number(h.estimado_usd);
    }
    return Object.values(m).sort((a, b) => b.fecha_ex.localeCompare(a.fecha_ex));
  }, [historico]);

  const hoy = new Date();
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
        {esTodos ? "Todos los brokers" : "Broker seleccionado"} · estimación en USD según tus compras, ventas y los
        dividendos de Yahoo · {retencion > 0 ? `neto de ${retencion}% de retención` : "bruto, sin retenciones"}
      </p>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">Cobrado {anioActual}</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">{usd(cobradoAnio)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">Últimos 12 meses</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">{usd(cobrado12m)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">Proyección 12 meses</p>
          <p className="text-lg font-bold text-emerald-600 mt-0.5">{usd(proyeccionTotal)}</p>
          <p className="text-[10px] text-slate-400">tenencia de hoy × dividendos del último año</p>
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
                <tr key={f.ticker} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">{f.ticker}</td>
                  <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">
                    {num(f.acciones)}
                    <span className="block text-[10px] text-slate-400">
                      {num(f.nominales, 0)} nom. ÷ {num(f.ratio, 0)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">{usd(f.dps)}</td>
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

      {eventos.length > 0 && (
        <div className="mt-5 space-y-2">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Últimas fechas ex</p>
          {(verTodo ? eventos : eventos.slice(0, 6)).map((e) => (
            <div
              key={`${e.ticker}-${e.fecha_ex}`}
              className="flex items-center justify-between rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-800"
            >
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">{e.ticker}</p>
                <p className="text-xs text-slate-400">
                  {e.fecha_ex} · {num(e.acciones)} acc. × {usd(e.dps)}
                </p>
              </div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">{usd(e.estimado * neto)}</p>
            </div>
          ))}
          {eventos.length > 6 && (
            <button
              onClick={() => setVerTodo(!verTodo)}
              className="text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            >
              {verTodo ? "Ver menos" : `Ver todas (${eventos.length})`}
            </button>
          )}
          <p className="text-[10px] text-slate-400">
            Es una estimación: el cobro real depende de tu broker, de la fecha de pago y de las retenciones.
          </p>
        </div>
      )}
    </div>
  );
}
