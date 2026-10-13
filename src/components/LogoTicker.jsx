import { useState } from "react";

// Logo de un activo: public/images/cedears/<TICKER>.png (200x200).
// Si la imagen no existe, muestra un círculo con las iniciales del ticker.
// size en px: 20-28 para listas, 44-56 para encabezados.
export default function LogoTicker({ ticker, size = 28, className = "" }) {
  const [fallo, setFallo] = useState(false);
  const caja = { width: size, height: size };

  if (fallo || !ticker) {
    return (
      <span
        style={{ ...caja, fontSize: Math.max(9, size * 0.34) }}
        className={`shrink-0 inline-flex items-center justify-center rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold ${className}`}
      >
        {String(ticker || "?").slice(0, 3)}
      </span>
    );
  }

  return (
    <img
      src={`/images/cedears/${encodeURIComponent(ticker)}.png`}
      alt={ticker}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFallo(true)}
      style={caja}
      // fondo blanco para que los logos oscuros se vean también en modo oscuro
      className={`shrink-0 rounded-lg bg-white object-contain p-0.5 ring-1 ring-slate-200 dark:ring-slate-700 ${className}`}
    />
  );
}
