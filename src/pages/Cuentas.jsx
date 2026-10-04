import { useEffect, useMemo, useState } from "react";
import {
  getCuentas,
  addTransferencia,
  getTransferenciasRecientes,
} from "../lib/CuentasApi";

function formatMoneda(valor, moneda) {
  return new Intl.NumberFormat(moneda === "USD" ? "en-US" : "es-AR", {
    style: "currency",
    currency: moneda,
  }).format(valor ?? 0);
}

const ICONO_TIPO = {
  banco: "🏦",
  billetera: "📱",
  efectivo: "💵",
  prepaga: "🚌",
  broker: "📈",
};

export default function Cuentas() {
  const [cuentas, setCuentas] = useState([]);
  const [transferencias, setTransferencias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
    Promise.all([getCuentas(), getTransferenciasRecientes()])
      .then(([cuentasData, transferenciasData]) => {
        setCuentas(cuentasData);
        setTransferencias(transferenciasData);
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
      acc[c.moneda] = (acc[c.moneda] ?? 0) + Number(c.saldo_actual);
    });
    return acc;
  }, [cuentas]);

  function abrirModal(cuentaOrigenId = "") {
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

  function cerrarModal() {
    if (guardando) return;
    setModalAbierto(false);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Cuentas
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Saldo disponible por cuenta y transferencias entre tus propias
            cuentas.
          </p>
        </div>

        <button
          onClick={() => abrirModal()}
          className="rounded-lg text-white text-sm font-medium px-4 py-2 bg-[#009688] hover:bg-[#007f70]"
        >
          + Nueva transferencia
        </button>
      </div>

      {/* Totales por moneda */}
      {!loading && Object.keys(totalesPorMoneda).length > 0 && (
        <div className="flex flex-wrap gap-3">
          {Object.entries(totalesPorMoneda).map(([moneda, total]) => (
            <div
              key={moneda}
              className="rounded-xl px-4 py-3 text-white shadow-sm"
              style={{ backgroundColor: "#337ab7" }}
            >
              <p className="text-xs font-medium uppercase tracking-wide">
                Total en {moneda}
              </p>
              <p className="text-xl font-semibold mt-1">
                {formatMoneda(total, moneda)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Cards de cuentas */}
      {loading ? (
        <p className="text-sm text-slate-400">Cargando cuentas...</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cuentas.map((c) => (
            <div
              key={c.id}
              className="
                bg-white dark:bg-slate-900
                border border-slate-200 dark:border-slate-800
                rounded-2xl p-4 shadow-sm
                flex flex-col justify-between
              "
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    {ICONO_TIPO[c.tipo] ?? ""} {c.tipo}
                  </p>
                  <p className="text-base font-semibold text-slate-900 dark:text-white mt-0.5">
                    {c.nombre}
                  </p>
                </div>
              </div>

              <p
                className={`text-2xl font-bold mt-4 ${
                  Number(c.saldo_actual) < 0
                    ? "text-rose-600"
                    : "text-slate-900 dark:text-white"
                }`}
              >
                {formatMoneda(c.saldo_actual, c.moneda)}
              </p>

              <button
                onClick={() => abrirModal(c.id)}
                className="
                  mt-3 self-start
                  text-xs font-medium
                  text-blue-600 dark:text-blue-400
                  hover:underline
                "
              >
                Transferir desde acá
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Transferencias recientes */}
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

      {/* Modal: Nueva transferencia */}
      {modalAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={cerrarModal}
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
                  onClick={cerrarModal}
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
