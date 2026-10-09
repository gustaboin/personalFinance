import { useEffect, useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  getPosiciones,
  getResumenCuenta,
  getResumenPorTicker,
  getExposicionRama,
  getExposicionPais,
  getPin,
  addCompraInversion,
  deleteCompraInversion,
} from "../lib/inversionesApi";
import { Maximize2, X, Trash2 } from "lucide-react";
import { getCuentas } from "../lib/cuentasApi";

const COLORES = [
  "#2563eb",
  "#059669",
  "#f59e0b",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
];

function formatUSD(v) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(v ?? 0);
}

const FORM_VACIO = {
  ticker: "",
  boletoNumero: "",
  fechaOperacion: new Date().toISOString().slice(0, 10),
  cantidad: "",
  moneda: "ARS",
  precioUnitarioBruto: "",
  importeBruto: "",
  arancel: "",
  comision: "",
  importeNeto: "",
  tcCcl: "",
  notas: "",
};

// --- Exposición: por rama / país / región, total o por broker ---
const DIMENSIONES = [
  { id: "rama", label: "Rama" },
  { id: "pais", label: "País" },
  { id: "region", label: "Región" },
];

function agrupar(filas, campo) {
  const acc = {};
  for (const f of filas) {
    const k = f[campo] || "Sin clasificar";
    acc[k] = (acc[k] || 0) + Number(f.valor_usd || 0);
  }
  const total = Object.values(acc).reduce((s, v) => s + v, 0);
  return Object.entries(acc)
    .map(([nombre, valor]) => ({
      nombre,
      valor,
      pct: total > 0 ? (valor / total) * 100 : 0,
    }))
    .sort((a, b) => b.valor - a.valor);
}

function ExposicionCartera({ cuentaId, nombreCuenta }) {
  const [ramaRows, setRamaRows] = useState([]);
  const [paisRows, setPaisRows] = useState([]);
  const [dim, setDim] = useState("rama");
  const [alcance, setAlcance] = useState("total"); // 'total' | 'broker'
  const [expandido, setExpandido] = useState(false);

  // Cerrar con Esc
  useEffect(() => {
    if (!expandido) return;
    const onKey = (e) => e.key === "Escape" && setExpandido(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expandido]);

  useEffect(() => {
    getExposicionRama().then(setRamaRows).catch(console.error);
    getExposicionPais().then(setPaisRows).catch(console.error);
  }, []);

  const datos = useMemo(() => {
    const filtrar = (rows) =>
      alcance === "broker"
        ? rows.filter((r) => String(r.cuenta_id) === String(cuentaId))
        : rows;
    if (dim === "rama") return agrupar(filtrar(ramaRows), "rama");
    return agrupar(filtrar(paisRows), dim);
  }, [dim, alcance, cuentaId, ramaRows, paisRows]);

  const total = datos.reduce((s, d) => s + d.valor, 0);

  if (ramaRows.length === 0 && paisRows.length === 0) return null;

  const pill = (activo) =>
    `px-3 py-1 text-xs font-medium rounded-md transition ${
      activo
        ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200 dark:bg-slate-700 dark:text-white dark:ring-slate-600"
        : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
    }`;

  const contenido = (grande) => (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Exposición de la cartera
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
            <button
              className={pill(alcance === "total")}
              onClick={() => setAlcance("total")}
            >
              Todos
            </button>
            <button
              className={pill(alcance === "broker")}
              onClick={() => setAlcance("broker")}
            >
              {nombreCuenta || "Broker"}
            </button>
          </div>
          <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
            {DIMENSIONES.map((d) => (
              <button
                key={d.id}
                className={pill(dim === d.id)}
                onClick={() => setDim(d.id)}
              >
                {d.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setExpandido(!grande)}
            title={grande ? "Cerrar" : "Ampliar"}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
          >
            {grande ? <X size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-400 mb-4">
        {alcance === "total" ? "Suma de todos los brokers" : nombreCuenta} ·{" "}
        {formatUSD(total)} · look-through de ETFs/CEDEARs
      </p>

      {datos.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">
          Sin datos de exposición.
        </p>
      ) : (
        <div
          className={`grid gap-6 ${grande ? "lg:grid-cols-2" : "md:grid-cols-2"}`}
        >
          <ResponsiveContainer width="100%" height={grande ? 420 : 240}>
            <PieChart>
              <Pie
                data={datos}
                dataKey="valor"
                nameKey="nombre"
                cx="50%"
                cy="50%"
                outerRadius={grande ? 150 : 85}
              >
                {datos.map((_, i) => (
                  <Cell key={i} fill={COLORES[i % COLORES.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => formatUSD(v)} />
            </PieChart>
          </ResponsiveContainer>

          <div
            className={`space-y-2 overflow-y-auto pr-1 ${grande ? "max-h-[420px]" : "max-h-60"}`}
          >
            {datos.map((d, i) => (
              <div
                key={d.nombre}
                className="flex items-center justify-between rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-800"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: COLORES[i % COLORES.length] }}
                  />
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {d.nombre}
                  </p>
                </div>
                <div className="text-right shrink-0 pl-3">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {formatUSD(d.valor)}
                  </p>
                  <p className="text-xs text-slate-400">{d.pct.toFixed(1)}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
        {contenido(false)}
      </div>

      {expandido && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setExpandido(false)}
        >
          <div
            className="w-full max-w-5xl max-h-[92vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {contenido(true)}
          </div>
        </div>
      )}
    </>
  );
}

// --- Gate de PIN ---
function PinGate({ onDesbloquear }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  async function intentar(e) {
    e.preventDefault();
    try {
      const pinReal = await getPin();
      if (pin === pinReal) {
        onDesbloquear();
      } else {
        setError("PIN incorrecto.");
        setPin("");
      }
    } catch (err) {
      setError("No se pudo verificar el PIN.");
    }
  }

  return (
    <div className="max-w-xs mx-auto mt-20 space-y-4">
      <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
        Sección de inversiones
      </p>
      <form onSubmit={intentar} className="space-y-3">
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="PIN"
          autoFocus
          className="w-full text-center tracking-widest rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-lg"
        />
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 text-center">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="w-full rounded-lg text-white text-sm font-medium px-4 py-2 bg-[#337ab7] hover:bg-[#2a6295]"
        >
          Entrar
        </button>
      </form>
    </div>
  );
}

// --- Contenido real, solo se monta tras desbloquear ---
function InversionesContenido() {
  const [cuentasBroker, setCuentasBroker] = useState([]);
  const [cuentaId, setCuentaId] = useState("");
  const [posiciones, setPosiciones] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [resumenTicker, setResumenTicker] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(FORM_VACIO);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  // Estado para el modal de confirmación de eliminación
  const [idItemAEliminar, setIdItemAEliminar] = useState(null);

  useEffect(() => {
    getCuentas().then((data) => {
      const brokers = data.filter((c) => c.tipo === "broker");
      setCuentasBroker(brokers);
      if (brokers.length > 0) setCuentaId(String(brokers[0].id));
    });
    getResumenPorTicker().then(setResumenTicker);
  }, []);

  const totalValorCartera = useMemo(
    () =>
      resumenTicker.reduce((s, r) => s + Number(r.valor_actual_total_usd), 0),
    [resumenTicker],
  );

  function cargar() {
    if (!cuentaId) return;
    setLoading(true);
    Promise.all([
      getPosiciones(Number(cuentaId)),
      getResumenCuenta(Number(cuentaId)),
    ])
      .then(([pos, res]) => {
        setPosiciones(pos);
        setResumen(res);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuentaId]);

  function abrirModal() {
    setForm({
      ...FORM_VACIO,
      fechaOperacion: new Date().toISOString().slice(0, 10),
    });
    setError("");
    setModalAbierto(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.ticker || !form.cantidad || !form.importeNeto) {
      setError("Completá al menos ticker, cantidad e importe neto.");
      return;
    }
    if (form.moneda === "ARS" && !form.tcCcl) {
      setError("Si es en ARS, necesitás el CCL de ese día.");
      return;
    }

    setGuardando(true);
    try {
      await addCompraInversion({
        cuentaId: Number(cuentaId),
        ticker: form.ticker.toUpperCase(),
        boletoNumero: form.boletoNumero,
        fechaOperacion: form.fechaOperacion,
        cantidad: Number(form.cantidad),
        moneda: form.moneda,
        precioUnitarioBruto: form.precioUnitarioBruto
          ? Number(form.precioUnitarioBruto)
          : null,
        importeBruto: form.importeBruto ? Number(form.importeBruto) : null,
        arancel: form.arancel ? Number(form.arancel) : null,
        comision: form.comision ? Number(form.comision) : null,
        importeNeto: Number(form.importeNeto),
        tcCcl: form.tcCcl ? Number(form.tcCcl) : null,
        notas: form.notas,
      });
      setModalAbierto(false);
      cargar();
    } catch (err) {
      console.error(err);
      setError("No se pudo guardar la compra: " + err.message);
    } finally {
      setGuardando(false);
    }
  }

  // Funciones de eliminación usando la tarjeta de confirmación
  function confirmarEliminar(id) {
    setIdItemAEliminar(id);
  }

  async function ejecutarEliminacion() {
    if (!idItemAEliminar) return;
    try {
      await deleteCompraInversion(idItemAEliminar);
      setIdItemAEliminar(null);
      cargar();
    } catch (err) {
      console.error(err);
      alert("No se pudo eliminar: " + err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          Inversiones
        </h2>

        <div className="flex items-center gap-2">
          <select
            value={cuentaId}
            onChange={(e) => setCuentaId(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm"
          >
            {cuentasBroker.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>

          <button
            onClick={abrirModal}
            className="rounded-lg text-white text-sm font-medium px-4 py-2 bg-[#009688] hover:bg-[#007f70]"
          >
            + Compra
          </button>
        </div>
      </div>

      {resumenTicker.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
            Cartera total por activo
          </p>
          <p className="text-xs text-slate-400 mb-4">
            Suma de todos los brokers · {formatUSD(totalValorCartera)}
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={resumenTicker}
                  dataKey="valor_actual_total_usd"
                  nameKey="ticker"
                  cx="50%"
                  cy="50%"
                  outerRadius={85}
                >
                  {resumenTicker.map((_, i) => (
                    <Cell key={i} fill={COLORES[i % COLORES.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatUSD(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>

            <div className="space-y-2">
              {resumenTicker.map((r, i) => (
                <div
                  key={r.ticker}
                  className="flex items-center justify-between rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-800"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: COLORES[i % COLORES.length] }}
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {r.ticker}
                      </p>
                      <p className="text-xs text-slate-400">
                        {Number(r.nominales_total).toLocaleString()} nominales
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {formatUSD(r.valor_actual_total_usd)}
                    </p>
                    <p
                      className={`text-xs ${Number(r.rendimiento_usd) >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                    >
                      {Number(r.rendimiento_usd) >= 0 ? "+" : ""}
                      {formatUSD(r.rendimiento_usd)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ExposicionCartera
        cuentaId={cuentaId}
        nombreCuenta={
          cuentasBroker.find((c) => String(c.id) === String(cuentaId))?.nombre
        }
      />

      {resumen && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Invertido
            </p>
            <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
              {formatUSD(resumen.total_costo_usd)}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Valor actual
            </p>
            <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
              {formatUSD(resumen.total_actual_usd)}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Rendimiento
            </p>
            <p
              className={`text-xl font-bold mt-1 ${Number(resumen.rendimiento_usd) >= 0 ? "text-emerald-600" : "text-rose-600"}`}
            >
              {formatUSD(resumen.rendimiento_usd)}
            </p>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-300 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Fecha</th>
              <th className="text-left px-4 py-2">Ticker</th>
              <th className="text-right px-4 py-2">Nominales</th>
              <th className="text-right px-4 py-2">Costo USD</th>
              <th className="text-right px-4 py-2">Valor hoy</th>
              <th className="text-right px-4 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center text-slate-400 py-6">
                  Cargando...
                </td>
              </tr>
            ) : posiciones.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-slate-400 py-6">
                  Sin posiciones todavía.
                </td>
              </tr>
            ) : (
              posiciones.map((p) => (
                <tr
                  key={p.id}
                  className="border-t border-slate-100 dark:border-slate-800"
                >
                  <td className="px-4 py-2 whitespace-nowrap text-slate-700 dark:text-slate-300">
                    {p.fecha_operacion}
                  </td>
                  <td className="px-4 py-2 font-medium text-slate-900 dark:text-white">
                    {p.ticker}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-700 dark:text-slate-300">
                    {p.cantidad}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-700 dark:text-slate-300">
                    {p.costo_usd != null ? formatUSD(p.costo_usd) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right font-medium text-slate-900 dark:text-white">
                    {formatUSD(p.valor_actual_usd)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => confirmarEliminar(p.id)}
                      className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1.5 text-xs font-medium transition-colors dark:bg-rose-600 dark:hover:bg-rose-500"
                    >
                      <Trash2 size={13} />
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de confirmación de eliminación */}
      {idItemAEliminar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setIdItemAEliminar(null)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
              ¿Eliminar posición?
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Esta acción no se puede deshacer. También se borrará el egreso
              generado automáticamente en la cuenta.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIdItemAEliminar(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={ejecutarEliminacion}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 transition-colors"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
          onClick={() => !guardando && setModalAbierto(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 dark:border dark:border-slate-800 rounded-2xl p-5 shadow-lg mt-10"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4 text-slate-900 dark:text-white">
              Nueva compra
            </h3>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input
                  placeholder="Ticker"
                  value={form.ticker}
                  onChange={(e) => setForm({ ...form, ticker: e.target.value })}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                />
                <input
                  placeholder="N° boleto"
                  value={form.boletoNumero}
                  onChange={(e) =>
                    setForm({ ...form, boletoNumero: e.target.value })
                  }
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="date"
                  value={form.fechaOperacion}
                  onChange={(e) =>
                    setForm({ ...form, fechaOperacion: e.target.value })
                  }
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                />
                <input
                  type="number"
                  placeholder="Cantidad"
                  value={form.cantidad}
                  onChange={(e) =>
                    setForm({ ...form, cantidad: e.target.value })
                  }
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>

              <select
                value={form.moneda}
                onChange={(e) => setForm({ ...form, moneda: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="ARS">Pagado en ARS</option>
                <option value="USD">Pagado en USD</option>
              </select>

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  step="0.01"
                  placeholder="Precio unit. bruto"
                  value={form.precioUnitarioBruto}
                  onChange={(e) =>
                    setForm({ ...form, precioUnitarioBruto: e.target.value })
                  }
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Importe bruto"
                  value={form.importeBruto}
                  onChange={(e) =>
                    setForm({ ...form, importeBruto: e.target.value })
                  }
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  step="0.01"
                  placeholder="Arancel"
                  value={form.arancel}
                  onChange={(e) =>
                    setForm({ ...form, arancel: e.target.value })
                  }
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Comisión"
                  value={form.comision}
                  onChange={(e) =>
                    setForm({ ...form, comision: e.target.value })
                  }
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>

              <input
                type="number"
                step="0.01"
                placeholder="Importe neto (lo que realmente pagaste)"
                value={form.importeNeto}
                onChange={(e) =>
                  setForm({ ...form, importeNeto: e.target.value })
                }
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              />

              {form.moneda === "ARS" && (
                <input
                  type="number"
                  step="0.01"
                  placeholder="CCL de ese día (venta)"
                  value={form.tcCcl}
                  onChange={(e) => setForm({ ...form, tcCcl: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                />
              )}

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  disabled={guardando}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: "#337ab7" }}
                >
                  {guardando ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Inversiones() {
  const [desbloqueado, setDesbloqueado] = useState(false);

  if (!desbloqueado) {
    return <PinGate onDesbloquear={() => setDesbloqueado(true)} />;
  }

  return <InversionesContenido />;
}
