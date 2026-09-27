  export default function StatCard({ label, value, sub, tone = 'default', textColor, className = '' }) {
  const toneClasses = {
    default: 'text-slate-900 dark:text-slate-900', // Forzamos light en dark mode
    good: 'text-emerald-600 dark:text-emerald-600',
    bad: 'text-rose-600 dark:text-rose-600',
    warn: 'text-amber-600 dark:text-amber-600',
  }

    // despues de luchar conl os colores en el dashboard, me di cuenta que si el usuario pasa un color de fondo, no quiero que se sobreescriba con bg-white. 
    // Por eso agrego esta logica para que si el usuario pasa un color de fondo, no se agregue bg-white 

  const hasBackground = className.includes('bg-');
  const defaultBg = hasBackground ? '' : 'bg-white dark:bg-white';
  const finalValueColor = textColor ? textColor : toneClasses[tone];

  return (
    <div className={`border border-slate-200 dark:border-slate-200 rounded-2xl p-5 shadow-sm ${defaultBg} ${className}`}>
      <p className="text-xs font-medium text-slate-200 dark:text-slate-100 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${finalValueColor}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 dark:text-slate-400 mt-1 whitespace-pre-line">{sub}</p>}
    </div>
  )
}

