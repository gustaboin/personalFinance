import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  currentMesPeriodo,
  mesLabel,
  ultimosNMeses,
  formatARS,
} from "../lib/format";
import { getResumenCategoriaRango } from "../lib/api";

const RANGOS = [
  { label: "6 meses", n: 6 },
  { label: "12 meses", n: 12 },
  { label: "24 meses", n: 24 },
];

const COLORES = [
  "#2596be", //'#0f172a', // reemplazo el color más oscuro para que se vea mejor en dark mode
  "#2563eb",
  "#059669",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#be185d",
  "#65a30d",
  "#ea580c",
  "#4338ca",
  "#0d9488",
  "#b45309",
  "#9333ea",
  "#15803d",
];

const TOP_TOOLTIP = 5;

// Tooltip: top 5 categorías del mes + "Otras" + total (toma la fila completa del
// mes, no solo las barras dibujadas)
function TooltipTop({ active, payload, label, categorias }) {
  if (!active || !payload || payload.length === 0) return null;

  const fila = payload[0].payload;
  const items = categorias
    .map((cat, i) => ({
      cat,
      valor: Number(fila[cat] || 0),
      color: i < 10 ? COLORES[i % COLORES.length] : "#64748b",
    }))
    .filter((x) => x.valor > 0)
    .sort((a, b) => b.valor - a.valor);

  const top = items.slice(0, TOP_TOOLTIP);
  const resto = items.slice(TOP_TOOLTIP);
  const totalResto = resto.reduce((s, x) => s + x.valor, 0);
  const total = items.reduce((s, x) => s + x.valor, 0);

  return (
    <div
      style={{
        backgroundColor: "#0f172a",
        border: "1px solid #334155",
        borderRadius: 10,
        boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.3)",
        padding: "10px 12px",
        minWidth: 200,
        fontSize: 12,
        color: "#fff",
      }}
    >
      <p style={{ color: "#38bdf8", fontWeight: "bold", marginBottom: 6 }}>
        {label}
      </p>

      {top.map((x) => (
        <div
          key={x.cat}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 2,
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: x.color,
                display: "inline-block",
              }}
            />
            {x.cat}
          </span>
          <span>{formatARS(x.valor)}</span>
        </div>
      ))}

      {resto.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            color: "#94a3b8",
            marginTop: 2,
          }}
        >
          <span>Otras ({resto.length})</span>
          <span>{formatARS(totalResto)}</span>
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          borderTop: "1px solid #334155",
          marginTop: 6,
          paddingTop: 6,
          fontWeight: 600,
        }}
      >
        <span>Total</span>
        <span>{formatARS(total)}</span>
      </div>
    </div>
  );
}

export default function Evolucion() {
  const [rangoN, setRangoN] = useState(12);
  const [datos, setDatos] = useState([]);
  const [loading, setLoading] = useState(true);

  const meses = useMemo(
    () => ultimosNMeses(currentMesPeriodo(), rangoN),
    [rangoN],
  );

  useEffect(() => {
    let cancelled = false;

    setLoading(true);

    getResumenCategoriaRango(meses[0], meses[meses.length - 1]).then((data) => {
      if (!cancelled) {
        setDatos(data.filter((d) => d.tipo === "Egreso"));
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [meses]);

  // Categorías ordenadas por gasto total
  const categorias = useMemo(() => {
    const totales = new Map();

    for (const d of datos) {
      totales.set(
        d.categoria,
        (totales.get(d.categoria) || 0) + Number(d.total_ars),
      );
    }

    return Array.from(totales.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([cat]) => cat);
  }, [datos]);

  // Datos para el gráfico
  const chartData = useMemo(() => {
    return meses.map((mes) => {
      const row = {
        mes: mesLabel(mes).slice(0, 3) + "-" + mes.slice(2, 4),
      };

      for (const cat of categorias) {
        const found = datos.find(
          (d) => d.mes_periodo === mes && d.categoria === cat,
        );

        row[cat] = found ? Number(found.total_ars) : 0;
      }

      return row;
    });
  }, [meses, categorias, datos]);

  // Tabla
  const tabla = useMemo(() => {
    return categorias.map((cat) => {
      const valores = meses.map((mes) => {
        const found = datos.find(
          (d) => d.mes_periodo === mes && d.categoria === cat,
        );

        return found ? Number(found.total_ars) : 0;
      });

      const noCero = valores.filter((v) => v > 0);

      const media = noCero.length
        ? noCero.reduce((a, b) => a + b, 0) / noCero.length
        : 0;

      return {
        categoria: cat,
        valores,
        media,
      };
    });
  }, [categorias, meses, datos]);

  return (
    <div className="space-y-6">
      {/* Título */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Evolución
          </h2>

          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Comparación mes a mes por categoría — útil para detectar algo
            desfasado o mal cargado.
          </p>
        </div>

        {/* Selector de rango */}
        <div
          className="
            inline-flex
            rounded-xl
            border
            border-slate-200
            bg-white
            p-1
            shadow-sm

            dark:bg-slate-900
            dark:border-slate-800
          "
        >
          {RANGOS.map((r) => (
            <button
              key={r.n}
              onClick={() => setRangoN(r.n)}
              className={`
                px-3
                py-1.5
                text-sm
                rounded-lg
                font-medium
                transition

                ${
                  rangoN === r.n
                    ? `
                      bg-slate-900
                      text-white

                      dark:bg-slate-700
                    `
                    : `
                      text-slate-500
                      hover:bg-slate-100

                      dark:text-slate-400
                      dark:hover:bg-slate-800
                    `
                }
              `}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <p className="text-slate-400 dark:text-slate-500 text-sm">
          Cargando...
        </p>
      ) : (
        <>
          {/* Gráfico */}
          <div
            className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm
                      dark:bg-slate-900 dark:border-slate-800 dark:shadow-black/20"
          >
            <ResponsiveContainer width="100%" height={380}>
              <BarChart
                data={chartData}
                margin={{ top: 20, right: 10, left: 10, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#334155"
                  opacity={0.15}
                />

                <XAxis
                  dataKey="mes"
                  fontSize={12}
                  stroke="#94a3b8"
                  tickLine={false}
                  axisLine={false}
                />

                <YAxis
                  tickFormatter={(v) => formatARS(v)}
                  fontSize={11}
                  width={90}
                  stroke="#94a3b8"
                  tickLine={false}
                  axisLine={false}
                />

                <Tooltip
                  cursor={{ fill: "rgba(56, 189, 248, 0.05)" }}
                  content={<TooltipTop categorias={categorias} />}
                />

                {/* Si son muchas categorías, a veces es mejor omitir la leyenda o hacerla compacta */}
                <Legend
                  wrapperStyle={{
                    fontSize: 11,
                    paddingTop: "15px",
                    color: "#94a3b8",
                  }}
                  iconSize={10}
                  iconType="circle"
                />

                {categorias.slice(0, 10).map((cat, i) => (
                  <Bar
                    key={cat}
                    dataKey={cat}
                    stackId="a"
                    fill={COLORES[i % COLORES.length]}
                    stroke="#0f172a"
                    strokeWidth={0.5}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>

            {categorias.length > 10 && (
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                Mostrando las 10 categorías de mayor gasto del período. El resto
                se ve en la tabla de abajo.
              </p>
            )}
          </div>

          {/* Tabla */}
          <div
            className="
              bg-white
              border
              border-slate-200
              rounded-2xl
              shadow-sm
              overflow-x-auto

              dark:bg-slate-900
              dark:border-slate-800
              dark:shadow-black/20
            "
          >
            <table className="w-full text-sm">
              <thead
                className="
                  bg-slate-50
                  text-slate-500
                  text-xs
                  uppercase

                  dark:bg-slate-800
                  dark:text-slate-300
                "
              >
                <tr>
                  <th
                    className="
                      text-left
                      px-4
                      py-3
                      sticky
                      left-0
                      bg-slate-50

                      dark:bg-slate-800
                    "
                  >
                    Categoría
                  </th>

                  {meses.map((mes) => (
                    <th
                      key={mes}
                      className="
                        text-right
                        px-3
                        py-3
                        whitespace-nowrap
                      "
                    >
                      {mesLabel(mes).slice(0, 3)}-{mes.slice(2, 4)}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {tabla.map(({ categoria, valores, media }) => (
                  <tr
                    key={categoria}
                    className="
                        border-t
                        border-slate-100

                        dark:border-slate-800
                        dark:text-slate-300

                        hover:bg-slate-50
                        dark:hover:bg-slate-800/50
                      "
                  >
                    <td
                      className="
                          px-4
                          py-2
                          font-medium
                          text-slate-800
                          sticky
                          left-0
                          bg-white
                          whitespace-nowrap

                          dark:bg-slate-900
                          dark:text-white
                        "
                    >
                      {categoria}
                    </td>

                    {valores.map((v, i) => {
                      const esOutlier = media > 0 && v > media * 1.8;

                      return (
                        <td
                          key={meses[i]}
                          className={`
                              px-3
                              py-2
                              text-right
                              whitespace-nowrap

                              ${
                                esOutlier
                                  ? `
                                    bg-amber-50
                                    text-amber-700
                                    font-semibold

                                    dark:bg-amber-950/40
                                    dark:text-amber-300
                                  `
                                  : v === 0
                                    ? `
                                      text-slate-300
                                      dark:text-slate-600
                                    `
                                    : `
                                      text-slate-700
                                      dark:text-slate-300
                                    `
                              }
                            `}
                          title={
                            esOutlier
                              ? "Bastante más alto que el resto de los meses de esta categoría — vale la pena revisarlo"
                              : undefined
                          }
                        >
                          {v === 0 ? "—" : formatARS(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-400 dark:text-slate-500">
            Resaltado en naranja: meses donde una categoría gastó bastante más
            que su propio promedio — no necesariamente está mal, pero es un buen
            punto de partida para revisar.
          </p>
        </>
      )}
    </div>
  );
}
