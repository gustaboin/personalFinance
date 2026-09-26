import { useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './lib/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Movimientos from './pages/Movimientos'
import Cuotas from './pages/Cuotas'
import Presupuesto from './pages/Presupuesto'
import Evolucion from './pages/Evolucion'
import Tarjetas from './pages/Tarjetas'
import Proyectos from './pages/Proyectos'

import {
  LayoutDashboard,
  TrendingUp,
  ArrowLeftRight,
  CreditCard,
  Receipt,
  Target,
  FolderTree,
  Sun,
  Moon,
} from 'lucide-react'

const TABS = [
  { id: 'dashboard', label: 'Resumen', icon: LayoutDashboard, component: Dashboard },
  { id: 'evolucion', label: 'Evolución', icon: TrendingUp, component: Evolucion },
  { id: 'movimientos', label: 'Movimientos', icon: ArrowLeftRight, component: Movimientos },
  { id: 'tarjetas', label: 'Tarjetas', icon: CreditCard, component: Tarjetas },
  { id: 'cuotas', label: 'Cuotas', icon: Receipt, component: Cuotas },
  { id: 'presupuesto', label: 'Presupuesto', icon: Target, component: Presupuesto },
  { id: 'proyectos', label: 'Proyectos', icon: FolderTree, component: Proyectos },
]

function Shell() {
  const { session, signOut } = useAuth()
  const [tab, setTab] = useState('dashboard')

  // Recuperar el tema guardado
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark'
  })

  // Aplicar el tema al <html> y guardarlo
  useEffect(() => {
    const root = document.documentElement

    if (darkMode) {
      root.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      root.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [darkMode])

  const ActiveComponent =
    TABS.find((t) => t.id === tab)?.component ?? Dashboard

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors duration-200 dark:bg-slate-950 dark:text-slate-100">

      <header className="bg-white border-b border-slate-200 dark:bg-slate-900 dark:border-slate-800 transition-colors duration-200">

        {/* Header principal */}
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">

          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center text-sm font-bold shadow-sm dark:bg-slate-800">
              $
            </div>

            <span className="text-lg tracking-tight">
              <span className="font-medium text-slate-600 dark:text-slate-300">
                Control de
              </span>{' '}
              <span className="font-bold text-slate-900 dark:text-white">
                Gastos
              </span>
            </span>
          </div>

          <div className="flex items-center gap-3">

            <span className="text-xs text-slate-400 hidden sm:block">
              {session?.user?.email}
            </span>

            {/* Botón modo oscuro */}
            <button
              onClick={() => setDarkMode((value) => !value)}
              title={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              className="h-9 w-9 flex items-center justify-center rounded-lg
                text-slate-500
                hover:bg-slate-100 hover:text-slate-900
                dark:text-slate-400
                dark:hover:bg-slate-800 dark:hover:text-white
                transition-colors"
            >
              {darkMode ? (
                <Sun size={18} strokeWidth={2} />
              ) : (
                <Moon size={18} strokeWidth={2} />
              )}
            </button>

            <button
              onClick={signOut}
              className="text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition"
            >
              Salir
            </button>

          </div>
        </div>

        {/* Menú */}
        <div className="border-t border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/50">
          <nav className="max-w-5xl mx-auto px-4 py-2 overflow-x-auto">
            <div className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900">

              {TABS.map((t) => {
                const Icon = t.icon
                const active = tab === t.id

                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all duration-200 ${
                      active
                        ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-white dark:ring-slate-700'
                        : 'text-slate-500 hover:text-slate-900 hover:bg-white/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <Icon
                      size={16}
                      strokeWidth={2}
                    />

                    {t.label}
                  </button>
                )
              })}

            </div>
          </nav>
        </div>

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
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400 text-sm dark:bg-slate-950 dark:text-slate-500">
        Cargando...
      </div>
    )
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
