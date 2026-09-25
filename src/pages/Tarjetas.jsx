import { useEffect, useState } from 'react'
import MonthSwitcher from '../components/MonthSwitcher'
import { currentMesPeriodo, formatARS } from '../lib/format'
import { getMediosPago, getTotalTarjeta, getMovimientosTarjeta } from '../lib/api'

export default function Tarjetas() {
  const [mesPeriodo, setMesPeriodo] = useState(currentMesPeriodo())
  const [medios, setMedios] = useState([])
  const [medioId, setMedioId] = useState('')
  //const [total, setTotal] = useState(0)
    const [total, setTotal] = useState({
    B: 0,
    G: 0,
    T: 0,
  })
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)

    const imagenesMediosPago = {
      1: '/images/efectivo.png',
      2: '/images/mercadopago.png',
      3: '/images/transferencia.png',
      4: '/images/bna.png',
      5: '/images/galicia2.png',
      6: '/images/bbva.png',
      8: '/images/ciudadM.png',
      9: '/images/ciudad.png',
      11: '/images/transferencia.png'
    }

    const coloresMediosPago = {
      1: '#337ab7',
      2: '#5cb85c',
      3: '#f0ad4e',
    }


  useEffect(() => {
    getMediosPago().then((data) => {
      setMedios(data)
      if (data.length > 0) setMedioId(String(data[0].id))
    })
  }, [])

  useEffect(() => {
    if (!medioId) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      getTotalTarjeta(mesPeriodo, Number(medioId)),
      getMovimientosTarjeta(mesPeriodo, Number(medioId)),
    ]).then(([totalData, itemsData]) => {
      if (cancelled) return
      setTotal(totalData)
      setItems([...itemsData].sort((a, b) => new Date(a.fecha) - new Date(b.fecha)))
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [mesPeriodo, medioId])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold text-slate-900 ">TARJETAS</h2>
        <MonthSwitcher mesPeriodo={mesPeriodo} onChange={setMesPeriodo} />
      </div>
      <p className="text-sm text-slate-500 -mt-4">
        Total real tarjeta por mes: movimientos + cuotas que vencen.
      </p>

        <div className="flex flex-wrap gap-2">
          {medios.map((m) => (
            <button
              key={m.id}
              onClick={() => setMedioId(String(m.id))}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                medioId === String(m.id)
                  ? 'text-white'
                  : 'bg-white hover:bg-slate-50'
              }`}
              style={
                medioId === String(m.id)
                  ? {
                      backgroundColor: coloresMediosPago[Number(m.id)],
                      borderColor: coloresMediosPago[Number(m.id)],
                    }
                  : {
                      color: /*coloresMediosPago[Number(m.id)] ||*/ '#64748b',
                      borderColor: '#e2e8f0',
                    }
              }
            >
              {m.nombre}
            </button>
          ))}
        </div>



    {/*
      <div className="flex flex-wrap gap-2">
        {medios.map((m) => (
          <button
            key={m.id}
            onClick={() => setMedioId(String(m.id))}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
              medioId === String(m.id)
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {m.nombre}
          </button>
        ))}
      </div>

      */}

    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex flex-wrap gap-3">
          

              {/* Entidad */}
                <div
                  className="flex-1 px-4 py-3 rounded-lg text-slate-700 border border-slate-200
                             bg-white shadow-sm"
                >
                  <div className="flex items-center gap-4 h-full">

                    {/* Imagen del banco */}
                    <div className="w-16 h-16 bg-white rounded-lg flex items-center justify-center p-2 shrink-0">
                      <img
                        src={imagenesMediosPago[Number(medioId)]}
                        alt="Entidad"
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>

                    {/* Datos de la entidad */}
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                        Entidad
                      </p>

                      <p className="text-lg font-semibold text-slate-900 mt-1">
                        {medios.find(
                          (m) => String(m.id) === String(medioId)
                        )?.nombre.replace(/transferencia/gi, '< > ')}
                      </p>
                    </div>

                  </div>
                </div>
              
            {/* Total Gastos */}
            <div
              className="flex-1 px-4 py-3 rounded-lg text-white border transition shadow-sm"
              style={{
                backgroundColor: '#f0AD4E',
                borderColor: '#f0AD4E',
              }}
            >
              <p className="text-xs font-medium uppercase tracking-wide">
                Total Gastos
              </p>
            
              <p className="text-2xl font-semibold mt-1">
                {formatARS(total.G)}
              </p>
            </div>
            
            {/* Total Bonificación */}
            <div
              className="flex-1 px-4 py-3 rounded-lg text-white border transition shadow-sm"
              style={{
                backgroundColor: '#5cb85c',
                borderColor: '#5cb85c',
              }}
            >
              <p className="text-xs font-medium uppercase tracking-wide">
                Total Bonificación
              </p>
            
              <p className="text-2xl font-semibold mt-1">
                {formatARS(total.B)}
              </p>
            </div>
            
            {/* Total General */}
            <div
              className="flex-1 px-4 py-3 rounded-lg text-white border transition shadow-sm"
              style={{
                backgroundColor: '#337ab7',
                borderColor: '#337ab7',
              }}
            >
              <p className="text-xs font-medium uppercase tracking-wide">
                Total General
              </p>
            
              <p className="text-2xl font-semibold mt-1">
                {formatARS(total.T)}
              </p>
            </div>
            
          </div>
    </div>


      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Fecha</th>
              <th className="text-left px-4 py-2">Concepto</th>
              <th className="text-right px-4 py-2">Importe</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} className="text-center text-slate-400 py-6">Cargando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={3} className="text-center text-slate-400 py-6">Sin movimientos este mes.</td></tr>
            ) : (
              items.map((it, i) => (
                <tr
                  key={i}
                  className={`border-t border-slate-100 ${
                    Number(it.importe) < 0
                      ? 'bg-[#dee9de] text-black'
                      : Number(it.importe) > 499999
                        ? 'bg-[#ffd0cf] text-black'
                        : ''
                  }`}
                >


                  <td className="px-4 py-2 whitespace-nowrap">{it.fecha}</td>
                  <td className="px-4 py-2 text-slate-700">{it.concepto}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatARS(it.importe)}</td>
                </tr>
              ))
            )}
          </tbody>
          {items.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                <td className="px-4 py-2" colSpan={2}>Total</td>
                <td className="px-4 py-2 text-right">{formatARS(total.T)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
