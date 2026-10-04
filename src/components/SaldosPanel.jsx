import { useEffect, useMemo, useState } from "react";
import {
  getCuentas,
  addTransferencia,
  getTransferenciasRecientes,
} from "../lib/Cuentasapi";
import {
  Landmark,
  Smartphone,
  DollarSign,
  Bus,
  TrendingUp,
  BanknoteArrowDown,
  PiggyBank,
} from "lucide-react";

function formatMoneda(valor, moneda) {
  const m = moneda || "ARS";
  return new Intl.NumberFormat(m === "USD" ? "en-US" : "es-AR", {
    style: "currency",
    currency: m,
  }).format(valor ?? 0);
}

const ICONO_TIPO = {
  banco: { icon: Landmark, color: "text-blue-600 dark:text-blue-400" },
  billetera: { icon: Smartphone, color: "text-green-600 dark:text-green-400" },
  efectivo: { icon: DollarSign, color: "text-yellow-600 dark:text-yellow-400" },
  prepaga: { icon: Bus, color: "text-purple-600 dark:text-purple-400" },
  broker: { icon: PiggyBank, color: "text-red-600 dark:text-red-400" },
};

const ICONO_TRANSFERENCIA = {
  icon: BanknoteArrowDown,
  color: "text-slate-900",
};

// Devuelve el componente de ícono + color para un tipo de cuenta, con fallback
// por si aparece un tipo nuevo que todavía no está en ICONO_TIPO.
function iconoDeCuenta(tipo) {
  return ICONO_TIPO[tipo] ?? { icon: null, color: "text-slate-400" };
}

export default function SaldosPanel({ compact = false, soloSaldoProp }) {
  const [cuentas, setCuentas] = useState([]);
  const [transferencias, setTransferencias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Estado para alternar entre ver solo el total o el detalle completo de cuentas
  const [soloSaldo, setSoloSaldo] = useState(soloSaldoProp ?? false);

  const [modalAbierto, setModalAbierto] = useState(false);
  const [form, setForm] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    cuenta_origen_id: "",
    cuenta_destino_id: "",
    importe: "",
    concepto: "",
  });
  const [guardando, setGuardando] = useState(false);
  const [errorModal, setErrorModal] = useState("");

  function cargar() {
    setLoading(true);
    const promesas = compact
      ? [getCuentas()]
      : [getCuentas(), getTransferenciasRecientes()];

    Promise.all(promesas)
      .then(([cuentasData, transferenciasData]) => {
        setCuentas(cuentasData);
        if (transferenciasData) setTransferencias(transferenciasData);
      })
      .catch((err) => {
        console.error("Error cargando cuentas:", err);
        setError("No se pudieron cargar las cuentas.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    cargar();
  }, []);

  const totalesPorMoneda = useMemo(() => {
    const acc = {};
    cuentas.forEach((c) => {
      const m = c.moneda || "ARS";
      acc[m] = (acc[m] ?? 0) + Number(c.saldo_actual);
    });
    return acc;
  }, [cuentas]);

  function abrirModalTransferencia(cuentaOrigenId = "") {
    setErrorModal("");
    setForm({
      fecha: new Date().toISOString().slice(0, 10),
      cuenta_origen_id: cuentaOrigenId ? String(cuentaOrigenId) : "",
      cuenta_destino_id: "",
      importe: "",
      concepto: "",
    });
    setModalAbierto(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorModal("");

    if (!form.cuenta_origen_id || !form.cuenta_destino_id || !form.importe) {
      setErrorModal("Completá cuenta origen, destino e importe.");
      return;
    }
    if (form.cuenta_origen_id === form.cuenta_destino_id) {
      setErrorModal("La cuenta origen y destino no pueden ser la misma.");
      return;
    }

    setGuardando(true);
    try {
      await addTransferencia({
        fecha: form.fecha,
        cuenta_origen_id: Number(form.cuenta_origen_id),
        cuenta_destino_id: Number(form.cuenta_destino_id),
        importe: Number(form.importe),
        concepto: form.concepto || null,
      });
      setModalAbierto(false);
      cargar();
    } catch (err) {
      console.error(err);
      setErrorModal("No se pudo guardar la transferencia.");
    } finally {
      setGuardando(false);
    }
  }

  if (error) {
    return (
      <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 p-4 text-sm text-rose-600 dark:text-rose-400">
        {error}
      </div>
    );
  }

  if (loading) {
    return <p className="text-sm text-slate-400">Cargando cuentas...</p>;
  }

  return (
    <div className="space-y-5">
      {!compact && (
        <div className="flex flex-col gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          {/* Fila Superior: Título/Sección a la izquierda, balances a la derecha */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Balances Generales
              </h2>
              <p className="text-xs text-slate-400">
                Estado actual de tus activos disponibles
              </p>
            </div>

            {/* Totales integrados de forma prolija en la interfaz */}
            {Object.keys(totalesPorMoneda).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(totalesPorMoneda).map(([moneda, total]) => (
                  <div
                    key={moneda}
                    className="bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2 shadow-sm"
                  >
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      Total en {moneda}
                    </p>
                    <p className="text-base font-bold text-slate-900 dark:text-white">
                      {formatMoneda(total, moneda)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fila Inferior: Acciones y controles de la vista */}
          <div className="flex items-center justify-between pt-1">
            {/* Botón Ocultar / Mostrar detalle */}
            <button
              onClick={() => setSoloSaldo(!soloSaldo)}
              className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-lg transition"
            >
              {soloSaldo ? "Mostrar detalle" : "Ocultar cuentas"}
            </button>

            {/* Botón Global de Transferencia */}
            <button
              onClick={() => abrirModalTransferencia()}
              className="rounded-lg text-white text-xs font-semibold px-4 py-2 bg-[#009688] hover:bg-[#007f70] transition-colors shadow-sm flex items-center gap-1.5"
            >
              {ICONO_TRANSFERENCIA.icon && (
                <ICONO_TRANSFERENCIA.icon
                  className={`w-4 h-4 ${ICONO_TRANSFERENCIA.color}`}
                />
              )}
              <span> TRANSFERIR</span>
            </button>
          </div>
        </div>
      )}

      {/* Lista / cards de cuentas (Se ocultan si soloSaldo es true) */}
      {!soloSaldo && (
        <>
          {compact ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
              {cuentas.map((c) => {
                const { icon: Icono, color } = iconoDeCuenta(c.tipo);
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between px-4 py-2.5 text-sm"
                  >
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      {Icono && <Icono className={`w-4 h-4 ${color}`} />}
                      <span>{c.nombre}</span>
                    </div>
                    <span
                      className={`font-medium ${Number(c.saldo_actual) < 0 ? "text-rose-600" : "text-slate-900 dark:text-white"}`}
                    >
                      {formatMoneda(c.saldo_actual, c.moneda)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {cuentas.map((c) => {
                const { icon: Icono, color } = iconoDeCuenta(c.tipo);
                return (
                  <div
                    key={c.id}
                    className="
                      bg-white dark:bg-slate-900
                      border border-slate-200 dark:border-slate-800
                      rounded-xl p-2 shadow-sm
                      flex flex-col justify-between
                    "
                  >
                    <div>
                      <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                        {Icono && <Icono className={`w-4 h-4 ${color}`} />}
                        {c.tipo}
                      </p>
                      <p className="text-base font-semibold text-slate-900 dark:text-white mt-0.5">
                        {c.nombre}
                      </p>
                    </div>

                    <p
                      className={`text-xl font-bold mt-2 ${Number(c.saldo_actual) < 0 ? "text-rose-600" : "text-slate-900 dark:text-white"}`}
                    >
                      {formatMoneda(c.saldo_actual, c.moneda)}
                    </p>

                    <button
                      onClick={() => abrirModalTransferencia(c.id)}
                      className="mt-2 self-start text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Transferir desde acá
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Transferencias recientes (solo en vista completa y si no está colapsado el detalle) */}
      {!compact && !soloSaldo && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Transferencias recientes
            </p>
          </div>

          {transferencias.length === 0 ? (
            <p className="text-sm text-slate-400 px-5 py-6">
              Todavía no registraste transferencias.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-300 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Fecha</th>
                  <th className="text-left px-4 py-2">Origen</th>
                  <th className="text-left px-4 py-2">Destino</th>
                  <th className="text-left px-4 py-2">Concepto</th>
                  <th className="text-right px-4 py-2">Importe</th>
                </tr>
              </thead>
              <tbody>
                {transferencias.map((t) => (
                  <tr
                    key={t.id}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    <td className="px-4 py-2 whitespace-nowrap text-slate-700 dark:text-slate-300">
                      {t.fecha}
                    </td>
                    <td className="px-4 py-2 text-slate-700 dark:text-slate-300">
                      {t.origen?.nombre}
                    </td>
                    <td className="px-4 py-2 text-slate-700 dark:text-slate-300">
                      {t.destino?.nombre}
                    </td>
                    <td className="px-4 py-2 text-slate-500 dark:text-slate-400">
                      {t.concepto ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-slate-900 dark:text-white">
                      {formatMoneda(t.importe, "ARS")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal: Nueva transferencia */}
      {modalAbierto && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => !guardando && setModalAbierto(false)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-slate-900 dark:border dark:border-slate-800 rounded-2xl p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4 text-slate-900 dark:text-white">
              Nueva transferencia
            </h3>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Fecha
                </label>
                <input
                  type="date"
                  value={form.fecha}
                  onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Desde
                </label>
                <select
                  value={form.cuenta_origen_id}
                  onChange={(e) =>
                    setForm({ ...form, cuenta_origen_id: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                >
                  <option value="">Cuenta origen...</option>
                  {cuentas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} ({c.moneda})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Hacia
                </label>
                <select
                  value={form.cuenta_destino_id}
                  onChange={(e) =>
                    setForm({ ...form, cuenta_destino_id: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                >
                  <option value="">Cuenta destino...</option>
                  {cuentas
                    .filter((c) => String(c.id) !== form.cuenta_origen_id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} ({c.moneda})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Importe
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.importe}
                  onChange={(e) =>
                    setForm({ ...form, importe: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Concepto (opcional)
                </label>
                <input
                  type="text"
                  value={form.concepto}
                  onChange={(e) =>
                    setForm({ ...form, concepto: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                />
              </div>

              {errorModal && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {errorModal}
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
                  {guardando ? "Guardando..." : "Transferir"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
