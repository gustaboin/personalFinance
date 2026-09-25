import { useState } from 'react'
import { AuthProvider, useAuth } from './lib/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Movimientos from './pages/Movimientos'
import Cuotas from './pages/Cuotas'
import Presupuesto from './pages/Presupuesto'
import Evolucion from './pages/Evolucion'
import Tarjetas from './pages/Tarjetas'

const TABS = [
  { id: 'dashboard', label: 'Resumen', component: Dashboard },
  { id: 'evolucion', label: 'Evolución', component: Evolucion },
  { id: 'movimientos', label: 'Movimientos', component: Movimientos },
  { id: 'tarjetas', label: 'Tarjetas', component: Tarjetas },
  { id: 'cuotas', label: 'Cuotas', component: Cuotas },
  { id: 'presupuesto', label: 'Presupuesto', component: Presupuesto },
]

function Shell() {
  const { session, signOut } = useAuth()
  const [tab, setTab] = useState('dashboard')
  const ActiveComponent = TABS.find((t) => t.id === tab)?.component ?? Dashboard

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-slate-900 text-white flex items-center justify-center text-sm font-semibold">$</div>
            <span className="font-semibold text-slate-900">Control de Gastos</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-400 hidden sm:block">{session?.user?.email}</span>
            <button onClick={signOut} className="text-xs text-slate-500 hover:text-slate-800">Salir</button>
          </div>
        </div>
        <nav className="max-w-5xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition ${
                tab === t.id
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">
        <ActiveComponent />
      </main>
    </div>
  )
}

function Gate() {
  const { session, loading } = useAuth()
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Cargando...</div>
  }
  return session ? <Shell /> : <Login />
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
