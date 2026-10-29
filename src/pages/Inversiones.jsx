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
  getExposicionRama,
  getExposicionPais,
  getPin,
  addCompraInversion,
  deleteCompraInversion,
  getVentas,
  addVentaInversion,
  deleteVentaInversion,
} from "../lib/inversionesApi";
import { Maximize2, X, Trash2 } from "lucide-react";
import { getCuentas } from "../lib/cuentasApi";
import FichaTicker from "../components/FichaTicker";
import DividendosCartera from "../components/DividendosCartera";
import LogoTicker from "../components/LogoTicker";
import InfoActivos from "../components/InfoActivos";

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

const FORM_VENTA_VACIO = {
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
  tcMep: "",
  tcCcl: "",
  notas: "",
};

const INPUT =
  "rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100";

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
  // cuentaId === "todos" -> suma de todos los brokers
  const [ramaRows, setRamaRows] = useState([]);
  const [paisRows, setPaisRows] = useState([]);
  const [dim, setDim] = useState("rama");
  const alcance = cuentaId === "todos" ? "total" : "broker";
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
  const [ventas, setVentas] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0); // fuerza recarga de la exposición
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(FORM_VACIO);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  // Estado para el modal de confirmación de eliminación
  const [idItemAEliminar, setIdItemAEliminar] = useState(null);
  const [idVentaAEliminar, setIdVentaAEliminar] = useState(null);

  // Venta
  const [ventaModal, setVentaModal] = useState(false);
  const [formVenta, setFormVenta] = useState(FORM_VENTA_VACIO);

  const esTodos = cuentaId === "todos";

  // Ficha de fundamentales del ticker tocado
  const [tickerFicha, setTickerFicha] = useState(null);

  // "cartera" (default) | "info" (catálogo de activos seguidos)
  const [vista, setVista] = useState("cartera");

  useEffect(() => {
    getCuentas().then((data) => {
      const brokers = data.filter((c) => c.tipo === "broker");
      setCuentasBroker(brokers);
      if (brokers.length > 0) setCuentaId(String(brokers[0].id));
    });
  }, []);

  // Cartera por activo: se arma desde las posiciones (una cuenta o todas)
  const resumenTicker = useMemo(() => {
    const m = {};
    for (const p of posiciones) {
      const r = (m[p.ticker] ??= {
        ticker: p.ticker,
        nominales_total: 0,
        valor_actual_total_usd: 0,
        costo_con_costo: 0,
        valor_con_costo: 0,
      });
      r.nominales_total += Number(p.cantidad_actual ?? p.cantidad);
      r.valor_actual_total_usd += Number(p.valor_actual_usd || 0);
      if (p.costo_usd != null) {
        r.costo_con_costo += Number(p.costo_usd);
        r.valor_con_costo += Number(p.valor_actual_usd || 0);
      }
    }
    return Object.values(m)
      .map((r) => ({
        ...r,
        rendimiento_usd: r.valor_con_costo - r.costo_con_costo,
      }))
      .sort((a, b) => b.valor_actual_total_usd - a.valor_actual_total_usd);
  }, [posiciones]);

  const totalValorCartera = resumenTicker.reduce(
    (s, r) => s + r.valor_actual_total_usd,
    0,
  );

  // Tarjetas Invertido / Valor actual / Rendimiento
  const resumen = useMemo(() => {
    if (posiciones.length === 0) return null;
    let costo = 0,
      actual = 0,
      actualConCosto = 0;
    for (const p of posiciones) {
      actual += Number(p.valor_actual_usd || 0);
      if (p.costo_usd != null) {
        costo += Number(p.costo_usd);
        actualConCosto += Number(p.valor_actual_usd || 0);
      }
    }
    return {
      total_costo_usd: costo,
      total_actual_usd: actual,
      rendimiento_usd: actualConCosto - costo,
    };
  }, [posiciones]);

  // Tickers que tengo en la cuenta elegida (para el form de venta)
  const tenencias = useMemo(() => {
    const m = {};
    for (const p of posiciones)
      m[p.ticker] =
        (m[p.ticker] || 0) + Number(p.cantidad_actual ?? p.cantidad);
    return m;
  }, [posiciones]);

  function cargar() {
    if (!cuentaId) return;
    const filtro = esTodos ? null : Number(cuentaId);
    setLoading(true);
    setRefreshKey((k) => k + 1);
    Promise.all([getPosiciones(filtro), getVentas(filtro)])
      .then(([pos, vtas]) => {
        setPosiciones(pos);
        setVentas(vtas);
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

  function abrirVenta() {
    setFormVenta({
      ...FORM_VENTA_VACIO,
      fechaOperacion: new Date().toISOString().slice(0, 10),
    });
    setError("");
    setVentaModal(true);
  }

  async function handleVenta(e) {
    e.preventDefault();
    setError("");
    if (!formVenta.ticker || !formVenta.cantidad || !formVenta.importeNeto) {
      setError("Completá ticker, cantidad e importe neto cobrado.");
      return;
    }
    if (formVenta.moneda === "ARS" && !formVenta.tcMep && !formVenta.tcCcl) {
      setError(
        "Si cobraste en ARS, cargá el MEP o el CCL de ese día (para medir el resultado en USD).",
      );
      return;
    }
    setGuardando(true);
    try {
      await addVentaInversion({
        cuentaId: Number(cuentaId),
        ticker: formVenta.ticker,
        boletoNumero: formVenta.boletoNumero,
        fechaOperacion: formVenta.fechaOperacion,
        cantidad: Number(formVenta.cantidad),
        moneda: formVenta.moneda,
        precioUnitarioBruto: formVenta.precioUnitarioBruto
          ? Number(formVenta.precioUnitarioBruto)
          : null,
        importeBruto: formVenta.importeBruto
          ? Number(formVenta.importeBruto)
          : null,
        arancel: formVenta.arancel ? Number(formVenta.arancel) : null,
        comision: formVenta.comision ? Number(formVenta.comision) : null,
        importeNeto: Number(formVenta.importeNeto),
        tcMep: formVenta.tcMep ? Number(formVenta.tcMep) : null,
        tcCcl: formVenta.tcCcl ? Number(formVenta.tcCcl) : null,
        notas: formVenta.notas,
      });
      setVentaModal(false);
      cargar();
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo guardar la venta.");
    } finally {
      setGuardando(false);
    }
  }

  async function ejecutarEliminacionVenta() {
    if (!idVentaAEliminar) return;
    try {
      await deleteVentaInversion(idVentaAEliminar);
      setIdVentaAEliminar(null);
      cargar();
    } catch (err) {
      console.error(err);
      alert("No se pudo eliminar la venta: " + err.message);
    }
  }

  if (vista === "info") {
    return (
      <InfoActivos
        onVolver={() => setVista("cartera")}
        enCartera={resumenTicker.map((r) => r.ticker)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Inversiones
          </h2>
          <button
            onClick={() => setVista("info")}
            className="rounded-lg border border-[#009688] text-[#009688] text-sm font-medium px-3 py-1.5 hover:bg-[#009688]/10"
          >
            Info activos
          </button>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={cuentaId}
            onChange={(e) => setCuentaId(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm"
          >
            {cuentasBroker
              .filter((c) => {
                // agrego este filtro temporalmente para mostrar solo las de dolares
                const nombre = c.nombre.toUpperCase();
                return nombre.includes("USD") && !nombre.includes("ARS");
              })
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            <option value="todos">Todos</option>
          </select>

          <button
            onClick={abrirModal}
            disabled={esTodos}
            title={esTodos ? "Elegí un broker para cargar una compra" : ""}
            className="rounded-lg text-white text-sm font-medium px-4 py-2 bg-[#009688] hover:bg-[#007f70] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + Compra
          </button>
          <button
            onClick={abrirVenta}
            disabled={esTodos}
            title={esTodos ? "Elegí un broker para cargar una venta" : ""}
            className="rounded-lg text-white text-sm font-medium px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            − Venta
          </button>
        </div>
      </div>

      {resumenTicker.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
            {esTodos ? "Cartera total por activo" : "Cartera por activo"}
          </p>
          <p className="text-xs text-slate-400 mb-4">
            {esTodos
              ? "Suma de todos los brokers"
              : cuentasBroker.find((c) => String(c.id) === String(cuentaId))
                  ?.nombre}{" "}
            · {formatUSD(totalValorCartera)}
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
                  onClick={() => setTickerFicha(r.ticker)}
                  title="Ver ficha de fundamentales"
                  className="flex items-center justify-between rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-800 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: COLORES[i % COLORES.length] }}
                    />
                    <LogoTicker ticker={r.ticker} size={28} />
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
        key={refreshKey}
        cuentaId={cuentaId}
        nombreCuenta={
          cuentasBroker.find((c) => String(c.id) === String(cuentaId))?.nombre
        }
      />

      <DividendosCartera
        key={`div-${refreshKey}`}
        posiciones={posiciones}
        cuentaId={cuentaId}
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

      <p className="md:hidden text-xs text-slate-400 -mb-3 text-right">
        Deslizá la tabla hacia los costados ↔
      </p>
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-x-auto pb-2
        [&::-webkit-scrollbar]:h-2.5
        [&::-webkit-scrollbar-track]:bg-slate-100 dark:[&::-webkit-scrollbar-track]:bg-slate-800
        [&::-webkit-scrollbar-thumb]:rounded-full
        [&::-webkit-scrollbar-thumb]:bg-slate-400 dark:[&::-webkit-scrollbar-thumb]:bg-slate-500"
      >
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-300 text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2">Fecha</th>
              <th className="text-left px-3 py-2">Ticker</th>
              <th className="text-right px-3 py-2">Nominales</th>
              <th className="text-right px-3 py-2">Costo USD</th>
              <th className="text-right px-3 py-2">Valor hoy</th>
              <th className="text-right px-3 py-2">Acciones</th>
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
                  <td className="px-3 py-2 whitespace-nowrap text-slate-700 dark:text-slate-300">
                    {p.fecha_operacion}
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">
                    {p.ticker}
                    {esTodos && (
                      <span className="block text-[10px] font-normal text-slate-400">
                        {p.cuenta_nombre}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">
                    {Number(p.cantidad_actual ?? p.cantidad)}
                    {p.cantidad_actual != null &&
                      Number(p.cantidad_actual) !== Number(p.cantidad) && (
                        <span className="block text-[10px] text-slate-400">
                          compra: {Number(p.cantidad)}
                        </span>
                      )}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">
                    {p.costo_usd != null ? formatUSD(p.costo_usd) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-slate-900 dark:text-white">
                    {formatUSD(p.valor_actual_usd)}
                  </td>
                  <td className="px-3 py-2 text-right">
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

      {ventas.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-3">
            Ventas realizadas
          </p>
          <div className="space-y-2">
            {ventas.map((v) => {
              const res =
                v.ingreso_usd != null && v.costo_usd != null
                  ? Number(v.ingreso_usd) - Number(v.costo_usd)
                  : null;
              return (
                <div
                  key={v.id}
                  className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-800"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {v.ticker} · {Number(v.cantidad)} nominales
                    </p>
                    <p className="text-xs text-slate-400">
                      {v.fecha_operacion}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {formatUSD(v.ingreso_usd)}
                      </p>
                      {res != null && (
                        <p
                          className={`text-xs ${res >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                        >
                          {res >= 0 ? "+" : ""}
                          {formatUSD(res)}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setIdVentaAEliminar(v.id)}
                      title="Eliminar venta"
                      className="inline-flex items-center rounded-md bg-rose-600 hover:bg-rose-700 text-white p-1.5 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal de confirmación: eliminar venta */}
      {idVentaAEliminar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setIdVentaAEliminar(null)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
              ¿Eliminar venta?
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Se borra el ingreso generado en la cuenta y las compras recuperan
              los nominales que se les había descontado.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIdVentaAEliminar(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={ejecutarEliminacionVenta}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 transition-colors"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {tickerFicha && (
        <FichaTicker
          ticker={tickerFicha}
          onClose={() => setTickerFicha(null)}
        />
      )}

      {/* Modal de venta */}
      {ventaModal && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
          onClick={() => !guardando && setVentaModal(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 dark:border dark:border-slate-800 rounded-2xl p-5 shadow-lg mt-10"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-1 text-slate-900 dark:text-white">
              Nueva venta
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Se descuenta de las compras más viejas primero (FIFO) y el importe
              entra como ingreso a la cuenta. Los nominales van en la unidad del
              boleto, es decir con el ratio que regía el día de la venta.
            </p>

            <form onSubmit={handleVenta} className="space-y-3">
              <select
                value={formVenta.ticker}
                onChange={(e) =>
                  setFormVenta({ ...formVenta, ticker: e.target.value })
                }
                className={`w-full ${INPUT}`}
              >
                <option value="">Activo a vender...</option>
                {Object.entries(tenencias).map(([t, n]) => (
                  <option key={t} value={t}>
                    {t} · tenés {n}
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  step="any"
                  placeholder="Nominales a vender"
                  value={formVenta.cantidad}
                  onChange={(e) =>
                    setFormVenta({ ...formVenta, cantidad: e.target.value })
                  }
                  className={INPUT}
                />
                <input
                  placeholder="N° boleto"
                  value={formVenta.boletoNumero}
                  onChange={(e) =>
                    setFormVenta({ ...formVenta, boletoNumero: e.target.value })
                  }
                  className={INPUT}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="date"
                  value={formVenta.fechaOperacion}
                  onChange={(e) =>
                    setFormVenta({
                      ...formVenta,
                      fechaOperacion: e.target.value,
                    })
                  }
                  className={INPUT}
                />
                <select
                  value={formVenta.moneda}
                  onChange={(e) =>
                    setFormVenta({ ...formVenta, moneda: e.target.value })
                  }
                  className={INPUT}
                >
                  <option value="ARS">Cobrado en ARS</option>
                  <option value="USD">Cobrado en USD</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  step="0.01"
                  placeholder="Precio unit. bruto"
                  value={formVenta.precioUnitarioBruto}
                  onChange={(e) =>
                    setFormVenta({
                      ...formVenta,
                      precioUnitarioBruto: e.target.value,
                    })
                  }
                  className={INPUT}
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Importe bruto"
                  value={formVenta.importeBruto}
                  onChange={(e) =>
                    setFormVenta({ ...formVenta, importeBruto: e.target.value })
                  }
                  className={INPUT}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  step="0.01"
                  placeholder="Arancel"
                  value={formVenta.arancel}
                  onChange={(e) =>
                    setFormVenta({ ...formVenta, arancel: e.target.value })
                  }
                  className={INPUT}
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Comisión"
                  value={formVenta.comision}
                  onChange={(e) =>
                    setFormVenta({ ...formVenta, comision: e.target.value })
                  }
                  className={INPUT}
                />
              </div>

              <input
                type="number"
                step="0.01"
                placeholder="Importe neto cobrado (lo que entra a la cuenta)"
                value={formVenta.importeNeto}
                onChange={(e) =>
                  setFormVenta({ ...formVenta, importeNeto: e.target.value })
                }
                className={`w-full ${INPUT}`}
              />

              {formVenta.moneda === "ARS" && (
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="MEP de ese día"
                    value={formVenta.tcMep}
                    onChange={(e) =>
                      setFormVenta({ ...formVenta, tcMep: e.target.value })
                    }
                    className={INPUT}
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="CCL de ese día"
                    value={formVenta.tcCcl}
                    onChange={(e) =>
                      setFormVenta({ ...formVenta, tcCcl: e.target.value })
                    }
                    className={INPUT}
                  />
                </div>
              )}

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setVentaModal(false)}
                  disabled={guardando}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50"
                >
                  {guardando ? "Guardando..." : "Guardar venta"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
