import { useEffect, useMemo, useState } from "react";
import { getCuentas, getTransferenciasRecientes } from "../lib/cuentasApi";
import TransferenciaModal from "../components/TransferenciaModal";

function formatMoneda(valor, moneda = "ARS") {
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
  const [origenInicial, setOrigenInicial] = useState("");

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
    setOrigenInicial(cuentaOrigenId ? String(cuentaOrigenId) : "");
    setModalAbierto(true);
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
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
                    <td className="px-4 py-2 text-right font-medium text-slate-900 dark:text-white whitespace-nowrap">
                      {formatMoneda(t.importe, t.origen?.moneda ?? "ARS")}
                      {t.importe_destino != null && (
                        <span className="block text-xs font-normal text-slate-400">
                          →{" "}
                          {formatMoneda(
                            t.importe_destino,
                            t.destino?.moneda ?? "ARS",
                          )}
                          {t.tc
                            ? ` · TC ${Number(t.tc).toLocaleString("es-AR")}`
                            : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Nueva transferencia (con cambio de moneda si corresponde) */}
      {modalAbierto && (
        <TransferenciaModal
          cuentas={cuentas}
          cuentaOrigenId={origenInicial}
          onClose={() => setModalAbierto(false)}
          onSaved={() => {
            setModalAbierto(false);
            cargar();
          }}
        />
      )}
    </div>
  );
}
