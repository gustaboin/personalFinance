import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Settings, X, RefreshCw } from "lucide-react";
import LogoTicker from "./LogoTicker";
import FichaTicker from "./FichaTicker";
import {
  getCatalogo,
  addTicker,
  updateTicker,
  cambiarRatio,
  corregirRatioVigente,
  sincronizarTicker,
} from "../lib/tickersApi";

const inputCls =
  "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm";

function formatUSD(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n ?? 0);
}

// Catálogo de activos seguidos, independiente del broker.
// enCartera: array de tickers que hoy tenés (solo para marcarlos).
export default function InfoActivos({ onVolver, enCartera = [] }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [tickerFicha, setTickerFicha] = useState(null);
  const [configAbierto, setConfigAbierto] = useState(false);

  function cargar() {
    setLoading(true);
    getCatalogo()
      .then(setItems)
      .catch((e) => {
        console.error(e);
        setError("No se pudo cargar el catálogo.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(cargar, []);

  const setCartera = useMemo(() => new Set(enCartera), [enCartera]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return items.filter(
      (i) =>
        i.activo &&
        (!q ||
          i.ticker.toLowerCase().includes(q) ||
          (i.nombre ?? "").toLowerCase().includes(q)),
    );
  }, [items, busqueda]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onVolver}
            className="inline-flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300 hover:underline"
          >
            <ArrowLeft size={16} /> Cartera
          </button>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Info activos
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar ticker o nombre"
            className={`${inputCls} w-48`}
          />
          <button
            onClick={() => setConfigAbierto(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Settings size={16} /> Config
          </button>
        </div>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        Todos los activos que seguís, tengas o no posición. Tocá uno para ver
        sus fundamentales.
      </p>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-slate-400">Cargando...</p>
      ) : visibles.length === 0 ? (
        <p className="text-sm text-slate-400">
          No hay activos para mostrar. Agregá uno desde Config.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {visibles.map((i) => (
            <button
              key={i.ticker}
              onClick={() => setTickerFicha(i.ticker)}
              className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 shadow-sm hover:border-[#009688] transition-colors"
            >
              <div className="flex items-center gap-2">
                <LogoTicker ticker={i.ticker} size={36} />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-white leading-tight">
                    {i.ticker}
                  </p>
                  {setCartera.has(i.ticker) && (
                    <span className="text-[10px] font-medium text-[#009688]">
                      En cartera
                    </span>
                  )}
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 truncate">
                {i.nombre ?? "—"}
              </p>
              <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">
                {i.precio_usd != null ? formatUSD(i.precio_usd) : "s/ precio"}
              </p>
            </button>
          ))}
        </div>
      )}

      {tickerFicha && (
        <FichaTicker
          ticker={tickerFicha}
          onClose={() => setTickerFicha(null)}
        />
      )}

      {configAbierto && (
        <ConfigActivos
          items={items}
          onClose={() => setConfigAbierto(false)}
          onChange={cargar}
        />
      )}
    </div>
  );
}

function ConfigActivos({ items, onClose, onChange }) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    ticker: "",
    nombre: "",
    ratio: "1",
    fechaDesde: "2020-01-01",
  });
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // edición de ratio de un ticker existente
  const [ratioEdit, setRatioEdit] = useState(null); // {ticker, ratio, fecha, modo}

  async function agregar(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setGuardando(true);
    try {
      const t = await addTicker(form);
      onChange();
      setMsg(
        `${t} agregado. Cargando fundamentales y precios (puede tardar unos segundos)...`,
      );
      const r = await sincronizarTicker(t);
      setMsg(
        `${t} agregado. Fundamentales: ${r.fundamentales}. Cotizaciones: ${r.cotizaciones}.`,
      );
      setForm({ ticker: "", nombre: "", ratio: "1", fechaDesde: "2020-01-01" });
      onChange();
    } catch (e2) {
      setErr(e2.message || "No se pudo agregar");
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActivo(i) {
    try {
      await updateTicker(i.ticker, { activo: !i.activo });
      onChange();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function sync(i) {
    setErr("");
    setMsg(`Sincronizando ${i.ticker}...`);
    try {
      const r = await sincronizarTicker(i.ticker);
      setMsg(
        `${i.ticker}: fundamentales ${r.fundamentales}, cotizaciones ${r.cotizaciones}.`,
      );
      onChange();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function guardarRatio() {
    setErr("");
    try {
      if (ratioEdit.modo === "nuevo") {
        await cambiarRatio(ratioEdit.ticker, ratioEdit.ratio, ratioEdit.fecha);
      } else {
        await corregirRatioVigente(ratioEdit.ticker, ratioEdit.ratio);
      }
      setRatioEdit(null);
      onChange();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-2xl p-5 my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Config de activos
          </h3>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-800 dark:hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={agregar} className="grid grid-cols-2 gap-3 mb-2">
          <div>
            <label className="text-xs text-slate-500">Ticker (Yahoo)</label>
            <input
              required
              value={form.ticker}
              onChange={(e) =>
                setForm({ ...form, ticker: e.target.value.toUpperCase() })
              }
              placeholder="ASML"
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Nombre</label>
            <input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="ASML Holding"
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">
              Ratio CEDEAR (CEDEARs por 1 acción)
            </label>
            <input
              type="number"
              step="any"
              min="0"
              value={form.ratio}
              onChange={(e) => setForm({ ...form, ratio: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">
              Ratio vigente desde
            </label>
            <input
              type="date"
              max={hoy}
              value={form.fechaDesde}
              onChange={(e) => setForm({ ...form, fechaDesde: e.target.value })}
              className={inputCls}
            />
          </div>
          <div className="col-span-2 flex items-center gap-3">
            <button
              disabled={guardando}
              className="rounded-lg text-white text-sm font-medium px-4 py-2 bg-[#009688] hover:bg-[#007f70] disabled:opacity-50"
            >
              {guardando ? "Agregando..." : "+ Agregar activo"}
            </button>
            <span className="text-xs text-slate-400">
              Si todavía no lo operás, dejá ratio 1; lo cambiás después.
            </span>
          </div>
        </form>

        {msg && <p className="text-sm text-[#009688] mt-2">{msg}</p>}
        {err && <p className="text-sm text-rose-600 mt-2">{err}</p>}

        <div className="mt-5 border-t border-slate-200 dark:border-slate-800 pt-3 max-h-80 overflow-y-auto">
          {items.map((i) => (
            <div
              key={i.ticker}
              className="flex flex-wrap items-center gap-2 py-2 border-b border-slate-100 dark:border-slate-800 text-sm"
            >
              <LogoTicker ticker={i.ticker} size={24} />
              <span className="font-medium w-16 text-slate-900 dark:text-white">
                {i.ticker}
              </span>
              <span className="text-slate-500 dark:text-slate-400 flex-1 min-w-[80px] truncate">
                {i.nombre ?? "—"}
              </span>

              {ratioEdit?.ticker === i.ticker ? (
                <span className="flex items-center gap-1">
                  <input
                    type="number"
                    step="any"
                    value={ratioEdit.ratio}
                    onChange={(e) =>
                      setRatioEdit({ ...ratioEdit, ratio: e.target.value })
                    }
                    className={`${inputCls} w-20 py-1`}
                  />
                  {ratioEdit.modo === "nuevo" && (
                    <input
                      type="date"
                      value={ratioEdit.fecha}
                      onChange={(e) =>
                        setRatioEdit({ ...ratioEdit, fecha: e.target.value })
                      }
                      className={`${inputCls} w-36 py-1`}
                    />
                  )}
                  <button
                    onClick={guardarRatio}
                    className="text-[#009688] font-medium"
                  >
                    OK
                  </button>
                  <button
                    onClick={() => setRatioEdit(null)}
                    className="text-slate-400"
                  >
                    ✕
                  </button>
                </span>
              ) : (
                <span className="flex items-center gap-2 text-xs">
                  <span className="text-slate-600 dark:text-slate-300">
                    ratio {i.ratio ?? "—"}
                  </span>
                  <button
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                    title="Corregir el ratio vigente (lo cargaste mal)"
                    onClick={() =>
                      setRatioEdit({
                        ticker: i.ticker,
                        ratio: i.ratio ?? 1,
                        fecha: hoy,
                        modo: "corregir",
                      })
                    }
                  >
                    corregir
                  </button>
                  <button
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                    title="El CEDEAR cambió de ratio: abre un tramo nuevo desde una fecha"
                    onClick={() =>
                      setRatioEdit({
                        ticker: i.ticker,
                        ratio: i.ratio ?? 1,
                        fecha: hoy,
                        modo: "nuevo",
                      })
                    }
                  >
                    cambió
                  </button>
                </span>
              )}

              <button
                onClick={() => sync(i)}
                title="Volver a traer datos"
                className="text-slate-500 hover:text-slate-800 dark:hover:text-white"
              >
                <RefreshCw size={14} />
              </button>
              <button
                onClick={() => toggleActivo(i)}
                className={`text-xs px-2 py-0.5 rounded-full border ${
                  i.activo
                    ? "border-[#009688] text-[#009688]"
                    : "border-slate-300 dark:border-slate-600 text-slate-400"
                }`}
              >
                {i.activo ? "Activo" : "Oculto"}
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-3">
          "Oculto" lo saca de la grilla y de los sync automáticos, sin borrar
          tus boletos.
        </p>
      </div>
    </div>
  );
}
