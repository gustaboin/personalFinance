import { supabase } from './supabaseClient' // ajustá este import al nombre real de tu cliente

// --- Funciones genéricas, sirven para cualquier tabla de catálogo ---

export async function getCatalogo(tabla) {
  const { data, error } = await supabase
    .from(tabla)
    .select('*')
    .order('nombre', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function addCatalogoItem(tabla, payload) {
  const { data, error } = await supabase.from(tabla).insert(payload).select()
  if (error) throw error
  return data[0]
}

export async function updateCatalogoItem(tabla, id, payload) {
  const { error } = await supabase.from(tabla).update(payload).eq('id', id)
  if (error) throw error
}

export async function deleteCatalogoItem(tabla, id) {
  const { error } = await supabase.from(tabla).delete().eq('id', id)
  if (error) throw error
}

// --- Metadata: qué catálogos se administran desde Config y qué campos tiene cada form ---
// type 'text'   = input de texto simple
// type 'select' = combo que referencia otra tabla (fkTable = nombre de esa tabla)
//
// OJO: revisá que los "key" de los campos select coincidan con el nombre real
// de la columna FK en tu tabla (ej. en medios_pago puede ser entidad_id o
// entidad_financiera_id según cómo la hayas nombrado vos).

export const CATALOGOS = [
  {
    tabla: 'proveedores',
    label: 'Proveedores',
    campos: [{ key: 'nombre', label: 'Nombre', type: 'text' }],
  },
  {
    tabla: 'entidades_financieras',
    label: 'Entidades financieras',
    campos: [{ key: 'nombre', label: 'Nombre', type: 'text' }],
  },
  {
    tabla: 'marcas_tarjeta',
    label: 'Marcas de tarjeta',
    campos: [{ key: 'nombre', label: 'Nombre', type: 'text' }],
  },
  {
    tabla: 'rubros',
    label: 'Rubros',
    campos: [{ key: 'nombre', label: 'Nombre', type: 'text' }],
  },
  {
    tabla: 'categorias',
    label: 'Categorías',
    campos: [
      { key: 'nombre', label: 'Nombre', type: 'text' },
      { key: 'tipo_id', label: 'Tipo de movimiento', type: 'select', fkTable: 'tipos_movimiento' },
      { key: 'id_rubro', label: 'Rubro', type: 'select', fkTable: 'rubros' },
    ],
  },
  {
    tabla: 'medios_pago',
    label: 'Medios de pago',
    campos: [
      { key: 'nombre', label: 'Nombre', type: 'text' },
      { key: 'tipo_id', label: 'Tipo', type: 'select', fkTable: 'tipos_medio_pago' },
      { key: 'entidad_id', label: 'Entidad financiera', type: 'select', fkTable: 'entidades_financieras' },
      { key: 'marca_id', label: 'Marca de tarjeta', type: 'select', fkTable: 'marcas_tarjeta' },
    ],
  },
]
