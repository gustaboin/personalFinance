import { useState } from "react";
import { addTransferencia } from "../lib/cuentasApi";

// Modal único de "Nueva transferencia", usado por SaldosPanel y por la página Cuentas.
// Si las cuentas son de distinta moneda (venta/compra de divisas) pide tipo de
// cambio e importe de destino. Se monta solo cuando está abierto.

const r2 = (n) => Math.round(n * 100) / 100;

const INPUT =
  "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm";

function formInicial(cuentaOrigenId) {
  return {
    fecha: new Date().toISOString().slice(0, 10),
    cuenta_origen_id: cuentaOrigenId ? String(cuentaOrigenId) : "",
    cuenta_destino_id: "",
    importe: "",
    tc: "",
    importe_destino: "",
    destinoManual: false, // true si el usuario pisó el importe de destino
    concepto: "",
  };
}

export default function TransferenciaModal({
  cuentas,
  cuentaOrigenId = "",
  onClose,
  onSaved,
}) {
  const [form, setForm] = useState(() => formInicial(cuentaOrigenId));
  const [guardando, setGuardando] = useState(false);
  const [errorModal, setErrorModal] = useState("");

  const origen = cuentas.find((c) => String(c.id) === form.cuenta_origen_id);
  const destino = cuentas.find((c) => String(c.id) === form.cuenta_destino_id);
  const hayCambio = Boolean(
    origen?.moneda && destino?.moneda && origen.moneda !== destino.moneda,
  );

  // Actualiza el formulario y recalcula el importe de destino si corresponde
  function actualizar(cambios) {
    setForm((prev) => {
      const next = { ...prev, ...cambios };
      const o = cuentas.find((c) => String(c.id) === next.cuenta_origen_id);
      const d = cuentas.find((c) => String(c.id) === next.cuenta_destino_id);
      const cambio = o?.moneda && d?.moneda && o.moneda !== d.moneda;
      if (cambio && !next.destinoManual && !("importe_destino" in cambios)) {
        const imp = Number(next.importe);
        const tc = Number(next.tc);
        if (imp > 0 && tc > 0) {
          // USD -> ARS multiplica, ARS -> USD divide
          next.importe_destino = String(
            o.moneda === "USD" ? r2(imp * tc) : r2(imp / tc),
          );
        } else {
          next.importe_destino = "";
        }
      }
      return next;
    });
  }

  function cerrar() {
    if (!guardando) onClose();
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
    if (hayCambio && (!form.tc || !form.importe_destino)) {
      setErrorModal(
        "Las cuentas son de distinta moneda: cargá el tipo de cambio y el importe que entra.",
      );
      return;
    }

    setGuardando(true);
    try {
      await addTransferencia({
        fecha: form.fecha,
        cuenta_origen_id: Number(form.cuenta_origen_id),
        cuenta_destino_id: Number(form.cuenta_destino_id),
        importe: Number(form.importe),
        importe_destino: hayCambio ? Number(form.importe_destino) : null,
        tc: hayCambio ? Number(form.tc) : null,
        concepto: form.concepto || null,
      });
      onSaved();
    } catch (err) {
      console.error(err);
      setErrorModal("No se pudo guardar la transferencia.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
      onClick={cerrar}
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-slate-900 dark:border dark:border-slate-800 rounded-2xl p-5 shadow-lg mt-10"
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
              onChange={(e) => actualizar({ fecha: e.target.value })}
              className={INPUT}
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Desde
            </label>
            <select
              value={form.cuenta_origen_id}
              onChange={(e) =>
                actualizar({
                  cuenta_origen_id: e.target.value,
                  destinoManual: false,
                })
              }
              className={INPUT}
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
                actualizar({
                  cuenta_destino_id: e.target.value,
                  destinoManual: false,
                })
              }
              className={INPUT}
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

          {origen &&
            destino &&
            !hayCambio &&
            !(origen.moneda && destino.moneda) && (
              <p className="text-xs text-amber-600">
                No se pudo leer la moneda de las cuentas.
              </p>
            )}

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              {hayCambio ? `Importe que sale (${origen.moneda})` : "Importe"}
            </label>
            <input
              type="number"
              step="0.01"
              value={form.importe}
              onChange={(e) => actualizar({ importe: e.target.value })}
              className={INPUT}
            />
          </div>

          {hayCambio && (
            <>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Tipo de cambio (ARS por USD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.tc}
                  onChange={(e) => actualizar({ tc: e.target.value })}
                  className={INPUT}
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Importe que entra ({destino.moneda})
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.importe_destino}
                  onChange={(e) =>
                    actualizar({
                      importe_destino: e.target.value,
                      destinoManual: true,
                    })
                  }
                  className={INPUT}
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Se calcula solo; si el banco redondeó distinto, corregilo.
                </p>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Concepto (opcional)
            </label>
            <input
              type="text"
              value={form.concepto}
              onChange={(e) => actualizar({ concepto: e.target.value })}
              className={INPUT}
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
              onClick={cerrar}
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
  );
}
