import { mesAnterior, mesSiguiente, mesLabel } from '../lib/format'

export default function MonthSwitcher({ mesPeriodo, onChange }) {
  return (
    <div className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-1 py-1 shadow-sm">
      <button
        onClick={() => onChange(mesAnterior(mesPeriodo))}
        className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
        aria-label="Mes anterior"
      >
        ‹
      </button>
      <span className="px-3 text-sm font-medium text-slate-800 min-w-[150px] text-center">
        {mesLabel(mesPeriodo)}
      </span>
      <button
        onClick={() => onChange(mesSiguiente(mesPeriodo))}
        className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
        aria-label="Mes siguiente"
      >
        ›
      </button>
    </div>
  )
}
