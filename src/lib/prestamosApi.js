import { supabase } from "./supabaseClient";

// ---------------------------------------------------------------
// Préstamo UVA: cargar / confirmar cuotas
// El cuadro de marcha (240 filas) ya está en prestamo_cuotas con importe_uva.
// "Cargar una cuota" = completar valor_uva + monto_ars (y opcionalmente crear
// el egreso en movimientos y enlazarlo con id_movimiento).
// inflacion_pct es informativo: se completa después, cuando salga el INDEC.
// ---------------------------------------------------------------

const r2 = (n) => Math.round(Number(n) * 100) / 100;

// Sugerencia opcional para precompletar el campo en pantalla (el valor final lo confirmás vos).
// Valor del UVA para una fecha (YYYY-MM-DD). Usa la última fecha <= a la pedida.
// Devuelve { fecha, valor } o null si la serie todavía no llega a esa fecha.
export async function getValorUva(fecha) {
  const res = await fetch(
    "https://api.argentinadatos.com/v1/finanzas/indices/uva",
  );
  if (!res.ok) throw new Error("No se pudo consultar el UVA (argentinadatos).");
  const serie = await res.json(); // [{ fecha, valor }, ...] ordenada por fecha
  let ultimo = null;
  for (const p of serie) {
    if (p.fecha <= fecha) ultimo = p;
    else break;
  }
  if (!ultimo) return null;
  // Si la serie termina antes de la fecha pedida, no sirve (devolvería un valor viejo)
  const dias = (new Date(fecha) - new Date(ultimo.fecha)) / 86400000;
  if (dias > 4) return null;
  return ultimo;
}

// Cuotas pendientes (sin monto_ars) y vencidas hasta hoy
export async function getCuotasPendientes(prestamoId) {
  const hoy = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("prestamo_cuotas")
    .select("*")
    .eq("id_prestamo", prestamoId)
    .is("monto_ars", null)
    .lte("fecha", hoy)
    .order("nro_cuota", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Carga una cuota.
// valorUva: OBLIGATORIO, el UVA del día en que el banco debitó la cuota.
// fechaPago: día real del débito (si el 10 cae fin de semana, es el próximo hábil).
//            La fecha de la cuota (fecha) queda como vencimiento teórico.
// crearMovimiento: crea el egreso en Movimientos y lo enlaza (id_movimiento).
export async function cargarCuota({
  prestamoId,
  nroCuota,
  valorUva,
  inflacionPct = null,
  crearMovimiento = true,
  categoriaNombre = "Hipoteca", // ajustar al nombre real de tu categoría
  medioPagoId = null, // id del medio de pago con el que se paga
  fechaPago = null, // por defecto, la fecha de la cuota
}) {
  const { data: cuota, error: e1 } = await supabase
    .from("prestamo_cuotas")
    .select("*")
    .eq("id_prestamo", prestamoId)
    .eq("nro_cuota", nroCuota)
    .single();
  if (e1) throw e1;
  if (cuota.id_movimiento)
    throw new Error(`La cuota ${nroCuota} ya tiene un movimiento enlazado.`);

  const uva = Number(valorUva);
  if (!uva || uva <= 0)
    throw new Error("Cargá el valor UVA del día del débito.");

  const montoArs = r2(Number(cuota.importe_uva) * uva);

  // 1. Actualizar la cuota
  const { error: e2 } = await supabase
    .from("prestamo_cuotas")
    .update({
      valor_uva: uva,
      monto_ars: montoArs,
      inflacion_pct: inflacionPct === "" ? null : inflacionPct,
    })
    .eq("id_prestamo", prestamoId)
    .eq("nro_cuota", nroCuota);
  if (e2) throw e2;

  if (!crearMovimiento) return { montoArs, valorUva: uva, idMovimiento: null };

  // 2. Egreso en Movimientos
  try {
    const { data: cat, error: eCat } = await supabase
      .from("categorias")
      .select("id")
      .ilike("nombre", categoriaNombre)
      .limit(1)
      .single();
    if (eCat)
      throw new Error(`No encuentro la categoría "${categoriaNombre}".`);
    if (!medioPagoId) throw new Error("Falta el medio de pago para el egreso.");

    const { data: mov, error: eMov } = await supabase
      .from("movimientos")
      .insert({
        fecha: fechaPago || cuota.fecha,
        categoria_id: cat.id,
        medio_pago_id: medioPagoId,
        concepto: `Hipoteca cuota ${nroCuota}/${cuota.cuotas_totales ?? 240}`,
        moneda: "ARS",
        importe: montoArs,
      })
      .select()
      .single();
    if (eMov) throw eMov;

    // 3. Enlazar
    const { error: eLink } = await supabase
      .from("prestamo_cuotas")
      .update({ id_movimiento: mov.id })
      .eq("id_prestamo", prestamoId)
      .eq("nro_cuota", nroCuota);
    if (eLink) {
      await supabase.from("movimientos").delete().eq("id", mov.id);
      throw eLink;
    }
    return { montoArs, valorUva: uva, idMovimiento: mov.id };
  } catch (err) {
    // rollback de la cuota para no dejarla a medias
    await supabase
      .from("prestamo_cuotas")
      .update({ valor_uva: null, monto_ars: null, inflacion_pct: null })
      .eq("id_prestamo", prestamoId)
      .eq("nro_cuota", nroCuota);
    throw err;
  }
}

// Completar la inflación cuando salga el dato de INDEC a manopla.
export async function setInflacionCuota(prestamoId, nroCuota, inflacionPct) {
  const { error } = await supabase
    .from("prestamo_cuotas")
    .update({ inflacion_pct: inflacionPct })
    .eq("id_prestamo", prestamoId)
    .eq("nro_cuota", nroCuota);
  if (error) throw error;
}

// Deshacer la carga de una cuota (borra el egreso si existía)
export async function deshacerCuota(prestamoId, nroCuota) {
  const { data: cuota, error: e1 } = await supabase
    .from("prestamo_cuotas")
    .select("id_movimiento")
    .eq("id_prestamo", prestamoId)
    .eq("nro_cuota", nroCuota)
    .single();
  if (e1) throw e1;
  const { error: e2 } = await supabase
    .from("prestamo_cuotas")
    .update({
      valor_uva: null,
      monto_ars: null,
      inflacion_pct: null,
      id_movimiento: null,
    })
    .eq("id_prestamo", prestamoId)
    .eq("nro_cuota", nroCuota);
  if (e2) throw e2;
  if (cuota.id_movimiento) {
    const { error: e3 } = await supabase
      .from("movimientos")
      .delete()
      .eq("id", cuota.id_movimiento);
    if (e3) throw e3;
  }
}

// Medios de pago para elegir desde dónde se debita la cuota
export async function getMediosPago() {
  const { data, error } = await supabase
    .from("medios_pago")
    .select("id, nombre")
    .order("nombre", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
