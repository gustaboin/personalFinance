export function formatARS(value) {
  const n = Number(value) || 0
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 })
}

export function formatUSD(value) {
  const n = Number(value) || 0
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}

export function currentMesPeriodo() {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export function mesLabel(mesPeriodo) {
  if (!mesPeriodo || mesPeriodo.length !== 6) return mesPeriodo
  const year = mesPeriodo.slice(0, 4)
  const month = parseInt(mesPeriodo.slice(4, 6), 10)
  return `${MESES[month - 1]} ${year}`
}

// Rango de fechas [primerDia, ultimoDia] para un mes AAAAMM, en formato YYYY-MM-DD
export function rangoDeMes(mesPeriodo) {
  const year = parseInt(mesPeriodo.slice(0, 4), 10)
  const month = parseInt(mesPeriodo.slice(4, 6), 10)
  const first = new Date(year, month - 1, 1)
  const last = new Date(year, month, 0)
  const iso = (d) => d.toISOString().slice(0, 10)
  return [iso(first), iso(last)]
}

export function mesAnterior(mesPeriodo) {
  const year = parseInt(mesPeriodo.slice(0, 4), 10)
  const month = parseInt(mesPeriodo.slice(4, 6), 10)
  const d = new Date(year, month - 2, 1)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Devuelve un array de n meses (AAAAMM) terminando en mesPeriodo, en orden cronologico
export function ultimosNMeses(mesPeriodo, n) {
  const meses = [mesPeriodo]
  let actual = mesPeriodo
  for (let i = 1; i < n; i++) {
    actual = mesAnterior(actual)
    meses.unshift(actual)
  }
  return meses
}

export function mesSiguiente(mesPeriodo) {
  const year = parseInt(mesPeriodo.slice(0, 4), 10)
  const month = parseInt(mesPeriodo.slice(4, 6), 10)
  const d = new Date(year, month, 1)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}
