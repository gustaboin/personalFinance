import { useEffect, useMemo, useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

import { formatARS } from "../lib/format";
import { getPrestamos, getCuotasPrestamo } from "../lib/api";
import {
  cargarCuota,
  setInflacionCuota,
  getValorUva,
  getMediosPago,
} from "../lib/prestamosApi";

// Medio de pago con el que normalmente se debita la cuota (Banco Ciudad).
// Se puede cambiar en el modal si esa cuota se paga desde otro banco.
const MEDIO_PAGO_HIPOTECA = 3;

export default function Prestamos() {
  const [prestamos, setPrestamos] = useState([]);
  const [prestamoId, setPrestamoId] = useState("");
  const [cuotas, setCuotas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Carga de cuota / edición de inflación
  const [refresh, setRefresh] = useState(0);
  const [verFuturas, setVerFuturas] = useState(false);
  const [medios, setMedios] = useState([]);
  const [modal, setModal] = useState(null); // { modo: 'cargar' | 'inflacion', cuota }
  const [formC, setFormC] = useState({
    valorUva: "",
    fechaPago: "",
    medioPagoId: "",
    inflacion: "",
    crearMovimiento: true,
  });
  const [guardando, setGuardando] = useState(false);
  const [errorModal, setErrorModal] = useState("");
  const [sugiriendo, setSugiriendo] = useState(false);

  useEffect(() => {
    getMediosPago().then(setMedios).catch(console.error);
  }, []);

  // Carga inicial: listado de préstamos
  useEffect(() => {
    let cancelled = false;

    getPrestamos()
      .then((data) => {
        if (cancelled) return;
        setPrestamos(data);
        if (data.length > 0) {
          setPrestamoId(String(data[0].id));
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Error cargando préstamos:", err);
        setError("No se pudieron cargar los préstamos.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Carga de cuotas cuando cambia el préstamo seleccionado
  useEffect(() => {
    if (!prestamoId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    getCuotasPrestamo(Number(prestamoId))
      .then((data) => {
        if (cancelled) return;
        setCuotas(data);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Error cargando cuotas del préstamo:", err);
        setError("No se pudo cargar el detalle de cuotas.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [prestamoId, refresh]);

  const prestamo = prestamos.find((p) => String(p.id) === String(prestamoId));

  // Próxima cuota sin cargar
  const proxima = useMemo(
    () => cuotas.find((c) => c.monto_ars == null) ?? null,
    [cuotas],
  );

  // Tabla: cargadas + próximas 3 (o todas si se pide)
  const cuotasVisibles = useMemo(() => {
    if (verFuturas) return cuotas;
    const pendientes = cuotas.filter((c) => c.monto_ars == null).slice(0, 3);
    return [...cuotas.filter((c) => c.monto_ars != null), ...pendientes];
  }, [cuotas, verFuturas]);

  function abrirCargar(c) {
    setFormC({
      valorUva: "",
      fechaPago: c.fecha ?? new Date().toISOString().slice(0, 10),
      medioPagoId: String(MEDIO_PAGO_HIPOTECA),
      inflacion: "",
      crearMovimiento: true,
    });
    setErrorModal("");
    setModal({ modo: "cargar", cuota: c });
  }

  function abrirInflacion(c) {
    setFormC((f) => ({
      ...f,
      inflacion: c.inflacion_pct != null ? String(c.inflacion_pct) : "",
    }));
    setErrorModal("");
    setModal({ modo: "inflacion", cuota: c });
  }

  async function sugerirUva() {
    setSugiriendo(true);
    setErrorModal("");
    try {
      const r = await getValorUva(formC.fechaPago);
      if (!r)
        setErrorModal("Todavía no hay valor UVA publicado para esa fecha.");
      else setFormC((f) => ({ ...f, valorUva: String(r.valor) }));
    } catch (e) {
      setErrorModal(e.message);
    } finally {
      setSugiriendo(false);
    }
  }

  async function guardarModal(e) {
    e.preventDefault();
    setErrorModal("");
    const c = modal.cuota;
    const infl = formC.inflacion === "" ? null : Number(formC.inflacion);
    setGuardando(true);
    try {
      if (modal.modo === "inflacion") {
        await setInflacionCuota(c.id_prestamo, c.nro_cuota, infl);
      } else {
        if (formC.crearMovimiento && !formC.medioPagoId) {
          throw new Error("Elegí el medio de pago con el que se debitó.");
        }
        await cargarCuota({
          prestamoId: c.id_prestamo,
          nroCuota: c.nro_cuota,
          valorUva: Number(formC.valorUva),
          fechaPago: formC.fechaPago || null,
          medioPagoId: formC.medioPagoId ? Number(formC.medioPagoId) : null,
          inflacionPct: infl,
          crearMovimiento: formC.crearMovimiento,
        });
      }
      setModal(null);
      setRefresh((k) => k + 1);
    } catch (err) {
      console.error(err);
      setErrorModal(err.message || "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  // ---- KPIs derivados ----
  const kpis = useMemo(() => {
    if (!prestamo) return null;

    // Cuotas con datos reales cargados (ya pagadas / registradas)
    const cuotasConDatos = cuotas.filter((c) => c.monto_ars != null);
    const cuotasPagadas = cuotasConDatos.length;
    const cuotasTotales = prestamo.cuotas_totales;
    const cuotasRestantes = Math.max(0, cuotasTotales - cuotasPagadas);

    const ultima = cuotasConDatos[cuotasConDatos.length - 1];
    const saldoUvaPendiente = ultima?.saldo_uva ?? null;

    const totalPagadoArs = cuotasConDatos.reduce(
      (s, c) => s + Number(c.monto_ars || 0),
      0,
    );

    // Promedio de incremento mensual vs inflación, sobre los últimos 12 meses con dato
    const ultimos12 = cuotasConDatos
      .slice(-12)
      .filter((c) => c.incremento_monto_ars_pct != null);
    const promedioIncrementoCuota = ultimos12.length
      ? ultimos12.reduce((s, c) => s + Number(c.incremento_monto_ars_pct), 0) /
        ultimos12.length
      : null;

    const conInflacion = ultimos12.filter((c) => c.inflacion_pct != null);
    const promedioInflacion = conInflacion.length
      ? conInflacion.reduce((s, c) => s + Number(c.inflacion_pct), 0) /
        conInflacion.length
      : null;

    return {
      cuotasPagadas,
      cuotasTotales,
      cuotasRestantes,
      porcentajeAvance:
        cuotasTotales > 0 ? (cuotasPagadas / cuotasTotales) * 100 : 0,
      saldoUvaPendiente,
      totalPagadoArs,
      promedioIncrementoCuota,
      promedioInflacion,
    };
  }, [prestamo, cuotas]);

  // ---- Datos para gráficos ----
  const evolucionData = useMemo(() => {
    return cuotas
      .filter((c) => c.monto_ars != null)
      .map((c) => ({
        cuota: c.nro_cuota,
        monto_ars: Number(c.monto_ars),
        valor_uva: c.valor_uva != null ? Number(c.valor_uva) : null,
      }));
  }, [cuotas]);

  const comparativoData = useMemo(() => {
    return cuotas
      .filter((c) => c.incremento_monto_ars_pct != null)
      .map((c) => ({
        cuota: c.nro_cuota,
        incremento_cuota: Number(c.incremento_monto_ars_pct),
        inflacion: c.inflacion_pct != null ? Number(c.inflacion_pct) : null,
      }));
  }, [cuotas]);

  // ---- Estados de carga / error / vacío ----

  if (error) {
    return (
      <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 p-4 text-sm text-rose-600 dark:text-rose-400">
        {error}
      </div>
    );
  }

  if (loading && cuotas.length === 0 && prestamos.length === 0) {
    return <div className="text-sm text-slate-400">Cargando préstamo...</div>;
  }

  if (!loading && prestamos.length === 0) {
    return (
      <div className="text-sm text-slate-400">
        Todavía no cargaste ningún préstamo. Cargá uno en la tabla{" "}
        <code>prestamos</code> para empezar.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ENCABEZADO */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Préstamos
          </h2>

          <p className="text-sm text-slate-500 dark:text-slate-400">
            Seguimiento de deuda indexada, separado del gasto corriente.
          </p>
        </div>

        {prestamos.length > 1 && (
          <select
            value={prestamoId}
            onChange={(e) => setPrestamoId(e.target.value)}
            className="
              rounded-lg
              border border-slate-300
              dark:border-slate-700
              bg-white dark:bg-slate-900
              text-slate-800 dark:text-slate-200
              px-3 py-2
              text-sm
            "
          >
            {prestamos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        )}
      </div>

      {prestamo && kpis && (
        <>
          {/* RESUMEN PRINCIPAL */}
          <div
            className="
            bg-white dark:bg-slate-900
            border border-slate-200 dark:border-slate-800
            rounded-2xl
            p-5
            shadow-sm
          "
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  {prestamo.nombre}
                </h3>

                {prestamo.entidad && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    {prestamo.entidad} · Indexado a {prestamo.moneda_indexacion}
                  </p>
                )}
              </div>
            </div>

            {/* PRÓXIMA CUOTA */}
            {proxima && (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    Cuota {proxima.nro_cuota} · vence {proxima.fecha}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {Number(proxima.importe_uva).toLocaleString("es-AR", {
                      maximumFractionDigits: 2,
                    })}{" "}
                    UVA
                  </p>
                </div>
                <button
                  onClick={() => abrirCargar(proxima)}
                  className="rounded-lg text-white text-sm font-medium px-4 py-2 bg-[#009688] hover:bg-[#007f70]"
                >
                  Cargar cuota
                </button>
              </div>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cuota actual
                </p>
                <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                  {kpis.cuotasPagadas} / {kpis.cuotasTotales}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Saldo pendiente
                </p>
                <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                  {kpis.saldoUvaPendiente != null
                    ? `${kpis.saldoUvaPendiente.toLocaleString("es-AR", { maximumFractionDigits: 2 })} UVA`
                    : "—"}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Total pagado
                </p>
                <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                  {formatARS(kpis.totalPagadoArs)}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cuotas restantes
                </p>
                <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                  {kpis.cuotasRestantes}
                </p>
              </div>
            </div>

            {/* BARRA DE AVANCE */}
            <div className="mt-5">
              <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{ width: `${kpis.porcentajeAvance}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-400 mt-2">
                <span>Cuota 1</span>
                <span>{kpis.porcentajeAvance.toFixed(1)}% pagado</span>
                <span>Cuota {kpis.cuotasTotales}</span>
              </div>
            </div>

            {/* COMPARATIVO CUOTA vs INFLACIÓN (últimos 12 meses) */}
            {kpis.promedioIncrementoCuota != null && (
              <div className="mt-5 flex flex-wrap gap-3">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800 px-4 py-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Incremento promedio de la cuota (12m)
                  </p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                    {kpis.promedioIncrementoCuota.toFixed(2)}%
                  </p>
                </div>

                {kpis.promedioInflacion != null && (
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800 px-4 py-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Inflación promedio (12m)
                    </p>
                    <p
                      className={`
                      text-lg font-bold mt-1
                      ${
                        kpis.promedioIncrementoCuota <= kpis.promedioInflacion
                          ? "text-emerald-600"
                          : "text-rose-600"
                      }
                    `}
                    >
                      {kpis.promedioInflacion.toFixed(2)}%
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* EVOLUCIÓN: VALOR UVA vs MONTO EN PESOS */}
          <div
            className="
            bg-white dark:bg-slate-900
            border border-slate-200 dark:border-slate-800
            rounded-2xl
            p-5
            shadow-sm
          "
          >
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Evolución de la cuota
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
              Monto en pesos vs. valor de la UVA, cuota a cuota.
            </p>

            {evolucionData.length === 0 ? (
              <p className="text-sm text-slate-400">
                Todavía no hay cuotas cargadas con datos.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart
                  data={evolucionData}
                  margin={{ left: 10, right: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />

                  <XAxis
                    dataKey="cuota"
                    fontSize={11}
                    tickFormatter={(v) => `#${v}`}
                  />

                  <YAxis
                    yAxisId="ars"
                    fontSize={11}
                    tickFormatter={(v) => formatARS(v)}
                  />

                  <YAxis
                    yAxisId="uva"
                    orientation="right"
                    fontSize={11}
                    tickFormatter={(v) => v.toLocaleString("es-AR")}
                  />

                  <Tooltip
                    formatter={(v, name) =>
                      name === "monto_ars"
                        ? formatARS(v)
                        : v?.toLocaleString("es-AR")
                    }
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: "10px",
                      color: "#fff",
                      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                    }}
                  />

                  <Legend />
                  <defs>
                    <linearGradient
                      id="textGradient"
                      x1="0"
                      y1="0"
                      x2="1"
                      y2="0"
                    >
                      <stop offset="0%" stopColor="#337ab7" />
                      <stop offset="100%" stopColor="#60a5fa" />
                    </linearGradient>
                  </defs>

                  <Bar
                    yAxisId="ars"
                    dataKey="monto_ars"
                    name="Monto ($)"
                    fill="url(#textGradient)"
                    radius={[4, 4, 0, 0]}
                  />

                  <Line
                    yAxisId="uva"
                    type="monotone"
                    dataKey="valor_uva"
                    name="Valor UVA"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* COMPARATIVO: INCREMENTO DE CUOTA vs INFLACIÓN */}
          <div
            className="
            bg-white dark:bg-slate-900
            border border-slate-200 dark:border-slate-800
            rounded-2xl
            p-5
            shadow-sm
          "
          >
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              ¿La cuota le gana o le pierde a la inflación?
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
              Variación mensual del monto en pesos vs. inflación del mismo mes.
            </p>

            {comparativoData.length === 0 ? (
              <p className="text-sm text-slate-400">
                Hace falta al menos 2 cuotas cargadas para calcular variaciones.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart
                  data={comparativoData}
                  margin={{ left: 10, right: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />

                  <XAxis
                    dataKey="cuota"
                    fontSize={11}
                    tickFormatter={(v) => `#${v}`}
                  />

                  <YAxis fontSize={11} tickFormatter={(v) => `${v}%`} />

                  <Tooltip
                    formatter={(v) => `${Number(v).toFixed(2)}%`}
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: "10px",
                      color: "#fff",
                      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                    }}
                  />

                  <Legend />

                  <Bar
                    dataKey="incremento_cuota"
                    name="Incremento cuota ($)"
                    fill="url(#textGradient)"
                    radius={[4, 4, 0, 0]}
                  />

                  <Line
                    type="monotone"
                    dataKey="inflacion"
                    name="Inflación (INDEC)"
                    stroke="#dc2626"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* TABLA DE CUOTAS */}
          <div
            className="
            bg-white dark:bg-slate-900
            border border-slate-200 dark:border-slate-800
            rounded-2xl
            shadow-sm
            overflow-hidden
          "
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Detalle de cuotas
              </p>
              <button
                onClick={() => setVerFuturas(!verFuturas)}
                className="text-xs text-[#337ab7] hover:underline"
              >
                {verFuturas ? "Ocultar futuras" : "Ver todas (240)"}
              </button>
            </div>

            {cuotas.length === 0 ? (
              <p className="text-sm text-slate-400 px-5 py-6">
                Todavía no hay cuotas cargadas.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead
                    className="
                    bg-slate-50 dark:bg-slate-800
                    text-slate-500 dark:text-slate-300
                    text-xs uppercase
                  "
                  >
                    <tr>
                      <th className="text-left px-4 py-2">Cuota</th>
                      <th className="text-left px-4 py-2">Fecha</th>
                      <th className="text-right px-4 py-2">Valor UVA</th>
                      <th className="text-right px-4 py-2">Saldo UVA</th>
                      <th className="text-right px-4 py-2">Monto $</th>
                      <th className="text-right px-4 py-2">Incremento</th>
                      <th className="text-right px-4 py-2">Inflación</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>

                  <tbody>
                    {cuotasVisibles.map((c) => (
                      <tr
                        key={c.id ?? `${c.id_prestamo}-${c.nro_cuota}`}
                        className="border-t border-slate-100 dark:border-slate-800"
                      >
                        <td className="px-4 py-2 whitespace-nowrap text-slate-700 dark:text-slate-300">
                          {c.nro_cuota}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-slate-700 dark:text-slate-300">
                          {c.fecha ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-500 dark:text-slate-400">
                          {c.valor_uva != null
                            ? c.valor_uva.toLocaleString("es-AR", {
                                maximumFractionDigits: 2,
                              })
                            : "—"}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-500 dark:text-slate-400">
                          {c.saldo_uva != null
                            ? c.saldo_uva.toLocaleString("es-AR", {
                                maximumFractionDigits: 2,
                              })
                            : "—"}
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-slate-900 dark:text-white">
                          {c.monto_ars != null ? formatARS(c.monto_ars) : "—"}
                        </td>
                        <td
                          className={`
                          px-4 py-2 text-right
                          ${
                            c.incremento_monto_ars_pct == null
                              ? "text-slate-400"
                              : c.incremento_monto_ars_pct >
                                  (c.inflacion_pct ?? Infinity)
                                ? "text-rose-600"
                                : "text-emerald-600"
                          }
                        `}
                        >
                          {c.incremento_monto_ars_pct != null
                            ? `${Number(c.incremento_monto_ars_pct).toFixed(2)}%`
                            : "—"}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-500 dark:text-slate-400">
                          {c.inflacion_pct != null
                            ? `${Number(c.inflacion_pct).toFixed(2)}%`
                            : "—"}
                        </td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">
                          {c.monto_ars == null ? (
                            c.id_movimiento == null &&
                            c.nro_cuota === proxima?.nro_cuota ? (
                              <button
                                onClick={() => abrirCargar(c)}
                                className="text-xs font-medium text-[#009688] hover:underline"
                              >
                                Cargar
                              </button>
                            ) : null
                          ) : (
                            <button
                              onClick={() => abrirInflacion(c)}
                              className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                              title="Editar inflación"
                            >
                              Inflación
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
          onClick={() => !guardando && setModal(null)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 dark:border dark:border-slate-800 rounded-2xl p-5 shadow-lg mt-10"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              {modal.modo === "cargar"
                ? `Cargar cuota ${modal.cuota.nro_cuota}`
                : `Inflación · cuota ${modal.cuota.nro_cuota}`}
            </h3>
            {modal.modo === "cargar" && (
              <p className="text-xs text-slate-400 mb-4">
                {Number(modal.cuota.importe_uva).toLocaleString("es-AR", {
                  maximumFractionDigits: 2,
                })}{" "}
                UVA · vencimiento {modal.cuota.fecha}
              </p>
            )}

            <form onSubmit={guardarModal} className="space-y-3 mt-3">
              {modal.modo === "cargar" && (
                <>
                  <label className="block text-xs text-slate-500 dark:text-slate-400">
                    Fecha del débito
                    <input
                      type="date"
                      value={formC.fechaPago}
                      onChange={(e) =>
                        setFormC({ ...formC, fechaPago: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                    />
                  </label>

                  <label className="block text-xs text-slate-500 dark:text-slate-400">
                    Valor UVA del día
                    <div className="mt-1 flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        value={formC.valorUva}
                        onChange={(e) =>
                          setFormC({ ...formC, valorUva: e.target.value })
                        }
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={sugerirUva}
                        disabled={sugiriendo || !formC.fechaPago}
                        className="shrink-0 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 disabled:opacity-50"
                      >
                        {sugiriendo ? "..." : "Sugerir"}
                      </button>
                    </div>
                  </label>

                  {formC.valorUva && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Monto:{" "}
                      <span className="font-medium text-slate-900 dark:text-white">
                        {formatARS(
                          Math.round(
                            Number(modal.cuota.importe_uva) *
                              Number(formC.valorUva) *
                              100,
                          ) / 100,
                        )}
                      </span>
                    </p>
                  )}

                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={formC.crearMovimiento}
                      onChange={(e) =>
                        setFormC({
                          ...formC,
                          crearMovimiento: e.target.checked,
                        })
                      }
                    />
                    Crear el egreso en Movimientos (categoría Hipoteca)
                  </label>

                  {formC.crearMovimiento && (
                    <select
                      value={formC.medioPagoId}
                      onChange={(e) =>
                        setFormC({ ...formC, medioPagoId: e.target.value })
                      }
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                    >
                      <option value="">Medio de pago...</option>
                      {medios.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre}
                        </option>
                      ))}
                    </select>
                  )}
                </>
              )}

              <label className="block text-xs text-slate-500 dark:text-slate-400">
                Inflación del mes (%) · opcional, se puede completar después
                <input
                  type="number"
                  step="0.01"
                  value={formC.inflacion}
                  onChange={(e) =>
                    setFormC({ ...formC, inflacion: e.target.value })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                />
              </label>

              {errorModal && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {errorModal}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  disabled={guardando}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-[#009688] hover:bg-[#007f70] disabled:opacity-50"
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
