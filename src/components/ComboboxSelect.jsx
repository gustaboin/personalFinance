import { useState, useRef, useEffect, useMemo } from 'react'

/**
 * Select con filtro por texto. Uso:
 * <ComboboxSelect
 *   value={form.id_proveedor}
 *   onChange={(id) => setForm({ ...form, id_proveedor: id })}
 *   options={proveedores}           // [{ id, nombre }]
 *   placeholder="Proveedor..."
 * />
 */
export default function ComboboxSelect({
  value,
  onChange,
  options,
  placeholder = 'Seleccionar...',
  className = '',
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  const selected = options.find((o) => String(o.id) === String(value))

  const filtradas = useMemo(() => {
    if (!query) return options
    const q = query.toLowerCase()
    return options.filter((o) => o.nombre.toLowerCase().includes(q))
  }, [options, query])

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  function seleccionar(opt) {
    onChange(opt ? String(opt.id) : '')
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="
          w-full text-left
          rounded-lg border border-slate-300 bg-white text-slate-900
          px-3 py-2 text-sm
          focus:outline-none focus:ring-2 focus:ring-slate-200
          dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100
          dark:focus:ring-slate-700
        "
      >
        {selected ? selected.nombre : <span className="text-slate-400">{placeholder}</span>}
      </button>

      {open && (
        <div
          className="
            absolute z-20 mt-1 w-full
            rounded-lg border border-slate-200 bg-white shadow-lg
            dark:bg-slate-800 dark:border-slate-700
          "
        >
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Escribí para filtrar..."
            className="
              w-full px-3 py-2 text-sm
              border-b border-slate-200 dark:border-slate-700
              bg-transparent text-slate-900 dark:text-slate-100
              focus:outline-none
            "
          />
          <ul className="max-h-56 overflow-y-auto text-sm">
            <li
              onClick={() => seleccionar(null)}
              className="px-3 py-2 cursor-pointer text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              {placeholder}
            </li>
            {filtradas.length === 0 ? (
              <li className="px-3 py-2 text-slate-400">Sin resultados</li>
            ) : (
              filtradas.map((o) => (
                <li
                  key={o.id}
                  onClick={() => seleccionar(o)}
                  className={`
                    px-3 py-2 cursor-pointer
                    hover:bg-slate-50 dark:hover:bg-slate-700
                    ${String(o.id) === String(value) ? 'bg-slate-100 dark:bg-slate-700 font-medium' : ''}
                  `}
                >
                  {o.nombre}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
