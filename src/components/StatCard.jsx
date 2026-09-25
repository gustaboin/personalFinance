export default function StatCard({ label, value, sub, tone = 'default' }) {
  const toneClasses = {
    default: 'text-slate-900',
    good: 'text-emerald-600',
    bad: 'text-rose-600',
    warn: 'text-amber-600',
  }
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${toneClasses[tone]}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}
