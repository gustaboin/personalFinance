import SaldosPanel from './SaldosPanel'

export default function SaldosModal({ open, onClose }) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-slate-50 dark:bg-slate-950 rounded-2xl shadow-lg mt-10 mb-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Saldos de cuentas</h2>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        <div className="p-5">
          <SaldosPanel compact={false} />
        </div>
      </div>
    </div>
  )
}
