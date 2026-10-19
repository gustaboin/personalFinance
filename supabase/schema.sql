


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."fn_completar_tc_boleto"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  -- Solo importa el MEP en boletos en pesos; en USD no se usa
  if new.moneda = 'ARS' and new.tc_mep is null then
    select valorventa into new.tc_mep
    from public.monedas
    where moneda = 'USD_MEP'
      and fecha <= new.fecha_operacion
    order by fecha desc
    limit 1;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."fn_completar_tc_boleto"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_desactivar_resumen_anterior"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.activo THEN
    UPDATE resumenes
    SET activo = false
    WHERE medio_pago_id = NEW.medio_pago_id
      AND id <> NEW.id
      AND activo = true;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_desactivar_resumen_anterior"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_resumen_sugerido"("p_medio_pago_id" integer) RETURNS TABLE("resumen_id" integer, "fecha_vencimiento" "date", "fecha_cierre" "date")
    LANGUAGE "sql" STABLE
    AS $$
  SELECT id, fecha_vencimiento, fecha_cierre
  FROM resumenes
  WHERE medio_pago_id = p_medio_pago_id AND activo = true;
$$;


ALTER FUNCTION "public"."fn_resumen_sugerido"("p_medio_pago_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."movimientos_proyecto"("p_proyecto_id" integer) RETURNS TABLE("fecha" "date", "concepto" "text", "importe" numeric, "rubro" "text", "proveedor" "text", "origen" "text")
    LANGUAGE "sql"
    AS $$
    SELECT
        m.fecha,
        m.concepto,
        m.importe,
        r.nombre AS rubro,
        pv.nombre AS proveedor,
        'MOVIMIENTO'::text AS origen
    FROM movimientos m
    LEFT JOIN categorias c ON c.id = m.categoria_id
    LEFT JOIN rubros r ON r.id = c.id_rubro
    LEFT JOIN proveedores pv ON pv.id = m.id_proveedor
    WHERE m.id_proyecto = p_proyecto_id

    UNION ALL

    SELECT
        vc.fecha_cuota,
        vc.concepto,
        vc.importe,
        r.nombre AS rubro,
        pv.nombre AS proveedor,
        'CUOTA'::text AS origen
    FROM vw_cuotas_generadas vc
    INNER JOIN compras_cuotas cc ON cc.id = vc.compra_id
    LEFT JOIN categorias c ON c.id = cc.categoria_id
    LEFT JOIN rubros r ON r.id = c.id_rubro
    LEFT JOIN proveedores pv ON pv.id = cc.id_proveedor
    WHERE cc.id_proyecto = p_proyecto_id

    ORDER BY fecha;
$$;


ALTER FUNCTION "public"."movimientos_proyecto"("p_proyecto_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."movimientos_tarjeta"("p_periodo" character varying, "p_mediopago" integer) RETURNS TABLE("fecha" "date", "concepto" "text", "importe" numeric)
    LANGUAGE "sql"
    AS $$SELECT
    m.fecha,
    m.concepto,
    m.importe
FROM movimientos m 
LEFT JOIN resumenes r ON m.resumen_id = r.id 
WHERE m.medio_pago_id = p_mediopago
  AND 
  to_char(COALESCE(r.periodo, m.fecha), 'YYYYMM') = p_periodo

UNION ALL

SELECT
    c.fecha_cuota,
    c.concepto,
    c.importe
FROM vw_cuotas_generadas c
WHERE c.medio_pago_id = p_mediopago
  AND c.mes_periodo = p_periodo

ORDER BY fecha;$$;


ALTER FUNCTION "public"."movimientos_tarjeta"("p_periodo" character varying, "p_mediopago" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalcular_fifo"("p_cuenta_id" integer, "p_ticker" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v          record;
  l          record;
  r_venta    numeric;
  r_lote     numeric;
  faltante   numeric;
  resto      numeric;
  disp_venta numeric;
  tomar      numeric;
  compra     numeric;
BEGIN
  -- 1. Borrar los lotes de las ventas de esta cuenta/ticker (se rearman abajo)
  DELETE FROM inversiones_ventas_lotes
  WHERE venta_id IN (
    SELECT id FROM inversiones_ventas
    WHERE cuenta_id = p_cuenta_id AND ticker = p_ticker
  );

  -- 2. Ventas en orden cronológico
  FOR v IN
    SELECT * FROM inversiones_ventas
    WHERE cuenta_id = p_cuenta_id AND ticker = p_ticker
    ORDER BY fecha_operacion, id
  LOOP
    SELECT r.ratio INTO r_venta
    FROM ratios_historicos r
    WHERE r.ticker = p_ticker
      AND r.fecha_desde <= v.fecha_operacion
      AND (r.fecha_hasta IS NULL OR r.fecha_hasta >= v.fecha_operacion)
    ORDER BY r.fecha_desde DESC
    LIMIT 1;
    r_venta := COALESCE(r_venta, 1);

    faltante := v.cantidad;

    -- 3. Lotes comprados hasta la fecha de la venta, del más viejo al más nuevo
    FOR l IN
      SELECT p.id, p.cantidad, p.fecha_operacion,
             COALESCE((SELECT sum(x.cantidad_compra)
                       FROM inversiones_ventas_lotes x
                       WHERE x.posicion_id = p.id), 0) AS consumido
      FROM inversiones_posiciones p
      WHERE p.cuenta_id = p_cuenta_id
        AND p.ticker = p_ticker
        AND p.fecha_operacion <= v.fecha_operacion
      ORDER BY p.fecha_operacion, p.id
    LOOP
      EXIT WHEN faltante <= 0.0000001;

      resto := l.cantidad - l.consumido;
      CONTINUE WHEN resto <= 0.0000001;

      SELECT r.ratio INTO r_lote
      FROM ratios_historicos r
      WHERE r.ticker = p_ticker
        AND r.fecha_desde <= l.fecha_operacion
        AND (r.fecha_hasta IS NULL OR r.fecha_hasta >= l.fecha_operacion)
      ORDER BY r.fecha_desde DESC
      LIMIT 1;
      r_lote := COALESCE(r_lote, 1);

      -- lo que queda del lote, expresado en la unidad vigente el día de la venta
      disp_venta := resto * r_venta / r_lote;
      tomar      := LEAST(faltante, disp_venta);
      compra     := LEAST(resto, tomar * r_lote / r_venta);

      INSERT INTO inversiones_ventas_lotes (venta_id, posicion_id, cantidad_compra, cantidad_nominales)
      VALUES (v.id, l.id, compra, tomar);

      faltante := faltante - tomar;
    END LOOP;

    IF faltante > 0.0000001 THEN
      RAISE EXCEPTION 'No alcanza: la venta % de % (%) tiene % nominales sin lote de compra anterior a esa fecha.',
        v.boleto_numero, p_ticker, v.fecha_operacion, round(faltante, 4);
    END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."recalcular_fifo"("p_cuenta_id" integer, "p_ticker" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resumen_proyecto"("p_proyecto_id" integer) RETURNS TABLE("presupuesto" numeric, "gastado" numeric, "comprometido" numeric, "total_proyectado" numeric, "disponible" numeric, "porcentaje" numeric, "cuotas_pendientes" bigint)
    LANGUAGE "sql"
    AS $$
    SELECT
        p.presupuesto,
        COALESCE(SUM(CASE WHEN mp.fecha <= CURRENT_DATE THEN mp.importe ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN mp.fecha > CURRENT_DATE THEN mp.importe ELSE 0 END), 0),
        COALESCE(SUM(mp.importe), 0),
        p.presupuesto - COALESCE(SUM(mp.importe), 0),
        CASE WHEN p.presupuesto > 0
             THEN (COALESCE(SUM(mp.importe), 0) / p.presupuesto) * 100
             ELSE 0 END,
        COUNT(*) FILTER (WHERE mp.origen = 'CUOTA' AND mp.fecha > CURRENT_DATE)
    FROM proyectos p
    LEFT JOIN vw_movimientos_proyecto mp
        ON mp.id_proyecto = p.id
    WHERE p.id = p_proyecto_id
    GROUP BY p.id, p.presupuesto;
$$;


ALTER FUNCTION "public"."resumen_proyecto"("p_proyecto_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resumen_proyecto_evolucion"("p_proyecto_id" integer) RETURNS TABLE("mes_periodo" "text", "total_ars" numeric, "total_usd" numeric)
    LANGUAGE "sql"
    AS $$
  SELECT to_char(fecha, 'YYYYMM') as mes_periodo,
         SUM(importe) AS total_ars,
         SUM(importe_usd) AS total_usd
  FROM vw_movimientos_usd
  WHERE id_proyecto = p_proyecto_id
  GROUP BY mes_periodo
  ORDER BY mes_periodo;
$$;


ALTER FUNCTION "public"."resumen_proyecto_evolucion"("p_proyecto_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resumen_proyecto_proveedor"("p_proyecto_id" integer) RETURNS TABLE("proveedor" "text", "total" numeric)
    LANGUAGE "sql"
    AS $$
    SELECT COALESCE(proveedor, 'Sin proveedor'), SUM(importe)
    FROM vw_movimientos_proyecto
    WHERE id_proyecto = p_proyecto_id
    GROUP BY proveedor
    ORDER BY 2 DESC;
$$;


ALTER FUNCTION "public"."resumen_proyecto_proveedor"("p_proyecto_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resumen_proyecto_rubro"("p_proyecto_id" integer) RETURNS TABLE("rubro" "text", "total" numeric)
    LANGUAGE "sql"
    AS $$
    SELECT COALESCE(rubro, 'Sin rubro') AS rubro, SUM(importe) AS total
    FROM vw_movimientos_proyecto
    WHERE id_proyecto = p_proyecto_id
    GROUP BY rubro
    ORDER BY 2 DESC;
$$;


ALTER FUNCTION "public"."resumen_proyecto_rubro"("p_proyecto_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."total_tarjeta"("p_periodo" character varying, "p_mediopago" integer) RETURNS numeric
    LANGUAGE "sql"
    AS $$
    SELECT COALESCE(SUM(importe), 0)
    FROM (
        SELECT importe
        FROM movimientos
        WHERE medio_pago_id = p_mediopago
          AND to_char(fecha, 'YYYYMM') = p_periodo

        UNION ALL

        SELECT importe
        FROM vw_cuotas_generadas
        WHERE medio_pago_id = p_mediopago
          AND mes_periodo = p_periodo
    ) AS tarjeta;
$$;


ALTER FUNCTION "public"."total_tarjeta"("p_periodo" character varying, "p_mediopago" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."total_tarjeta"("p_periodo" character varying, "p_mediopago" integer, "p_tipo" character) RETURNS numeric
    LANGUAGE "sql"
    AS $$SELECT COALESCE(SUM(importe), 0)
FROM (
    SELECT importe
    FROM movimientos m
    -- Uso LEFT JOIN para que los movimientos viejos puedan verse también
    LEFT JOIN resumenes r ON m.resumen_id = r.id 
    WHERE m.medio_pago_id = p_mediopago 
      -- Coalesce para casos que tengan fecha y no ID de resumen
      AND to_char(COALESCE(r.periodo, m.fecha), 'YYYYMM') = p_periodo

    UNION ALL

    SELECT importe
    FROM vw_cuotas_generadas
    WHERE medio_pago_id = p_mediopago
      AND mes_periodo = p_periodo
) AS tarjeta
WHERE
    p_tipo IS NULL
    OR p_tipo = 'T'
    OR (p_tipo = 'B' AND importe < 0)
    OR (p_tipo = 'G' AND importe > 0);$$;


ALTER FUNCTION "public"."total_tarjeta"("p_periodo" character varying, "p_mediopago" integer, "p_tipo" character) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."app_config" (
    "clave" "text" NOT NULL,
    "valor" "text" NOT NULL
);


ALTER TABLE "public"."app_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categorias" (
    "id" integer NOT NULL,
    "nombre" "text" NOT NULL,
    "tipo_id" integer NOT NULL,
    "id_rubro" smallint,
    "excluir_de_analisis" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."categorias" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."categorias_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."categorias_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."categorias_id_seq" OWNED BY "public"."categorias"."id";



CREATE TABLE IF NOT EXISTS "public"."compras_cuotas" (
    "id" integer NOT NULL,
    "fecha_compra" "date" NOT NULL,
    "comercio" "text" NOT NULL,
    "categoria_id" integer NOT NULL,
    "medio_pago_id" integer NOT NULL,
    "moneda" character(3) DEFAULT 'ARS'::"bpchar" NOT NULL,
    "monto_total" numeric(14,2) NOT NULL,
    "cantidad_cuotas" integer NOT NULL,
    "notas" "text",
    "id_proyecto" integer,
    "id_proveedor" integer,
    "mes_primera_cuota" "date",
    CONSTRAINT "compras_cuotas_cantidad_cuotas_check" CHECK (("cantidad_cuotas" > 0))
);


ALTER TABLE "public"."compras_cuotas" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."compras_cuotas_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."compras_cuotas_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."compras_cuotas_id_seq" OWNED BY "public"."compras_cuotas"."id";



CREATE TABLE IF NOT EXISTS "public"."cotizaciones_activos" (
    "id" integer NOT NULL,
    "ticker" "text" NOT NULL,
    "fecha" "date" NOT NULL,
    "precio_usd" numeric NOT NULL
);


ALTER TABLE "public"."cotizaciones_activos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."cotizaciones_activos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."cotizaciones_activos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."cotizaciones_activos_id_seq" OWNED BY "public"."cotizaciones_activos"."id";



CREATE TABLE IF NOT EXISTS "public"."cuentas" (
    "id" integer NOT NULL,
    "nombre" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "entidad_id" integer,
    "saldo_inicial" numeric DEFAULT 0 NOT NULL,
    "fecha_saldo_inicial" "date" DEFAULT CURRENT_DATE NOT NULL,
    "moneda" character(3) DEFAULT 'ARS'::"bpchar" NOT NULL,
    CONSTRAINT "cuentas_tipo_check" CHECK (("tipo" = ANY (ARRAY['banco'::"text", 'billetera'::"text", 'efectivo'::"text", 'prepaga'::"text", 'broker'::"text"])))
);


ALTER TABLE "public"."cuentas" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."cuentas_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."cuentas_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."cuentas_id_seq" OWNED BY "public"."cuentas"."id";



CREATE TABLE IF NOT EXISTS "public"."dividendos" (
    "id" integer NOT NULL,
    "ticker" "text" NOT NULL,
    "fecha_ex" "date" NOT NULL,
    "monto" numeric NOT NULL,
    "moneda" "text",
    "actualizado_en" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dividendos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."dividendos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."dividendos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."dividendos_id_seq" OWNED BY "public"."dividendos"."id";



CREATE TABLE IF NOT EXISTS "public"."entidades_financieras" (
    "id" integer NOT NULL,
    "nombre" "text" NOT NULL
);


ALTER TABLE "public"."entidades_financieras" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."entidades_financieras_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."entidades_financieras_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."entidades_financieras_id_seq" OWNED BY "public"."entidades_financieras"."id";



CREATE TABLE IF NOT EXISTS "public"."fundamentales" (
    "id" integer NOT NULL,
    "ticker" "text" NOT NULL,
    "metrica" "text" NOT NULL,
    "fecha_periodo" "date" NOT NULL,
    "valor" numeric NOT NULL,
    "moneda" "text",
    "actualizado_en" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fundamentales" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."fundamentales_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."fundamentales_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."fundamentales_id_seq" OWNED BY "public"."fundamentales"."id";



CREATE TABLE IF NOT EXISTS "public"."inversiones_posiciones" (
    "id" integer NOT NULL,
    "cuenta_id" integer NOT NULL,
    "ticker" "text" NOT NULL,
    "boleto_numero" "text",
    "fecha_operacion" "date" NOT NULL,
    "fecha_liquidacion" "date",
    "cantidad" numeric NOT NULL,
    "moneda" character(3) NOT NULL,
    "precio_unitario_bruto" numeric,
    "importe_bruto" numeric,
    "arancel" numeric,
    "comision" numeric,
    "importe_neto" numeric NOT NULL,
    "tc_ccl" numeric,
    "notas" "text",
    "tc_mep" numeric,
    CONSTRAINT "inversiones_posiciones_cantidad_check" CHECK (("cantidad" > (0)::numeric)),
    CONSTRAINT "inversiones_posiciones_moneda_check" CHECK (("moneda" = ANY (ARRAY['ARS'::"bpchar", 'USD'::"bpchar"])))
);


ALTER TABLE "public"."inversiones_posiciones" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."inversiones_posiciones_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."inversiones_posiciones_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."inversiones_posiciones_id_seq" OWNED BY "public"."inversiones_posiciones"."id";



CREATE TABLE IF NOT EXISTS "public"."inversiones_ventas" (
    "id" integer NOT NULL,
    "cuenta_id" integer NOT NULL,
    "ticker" "text" NOT NULL,
    "boleto_numero" "text",
    "fecha_operacion" "date" NOT NULL,
    "fecha_liquidacion" "date",
    "cantidad" numeric NOT NULL,
    "moneda" character(3) NOT NULL,
    "precio_unitario_bruto" numeric,
    "importe_bruto" numeric,
    "arancel" numeric,
    "comision" numeric,
    "importe_neto" numeric NOT NULL,
    "tc_ccl" numeric,
    "tc_mep" numeric,
    "notas" "text",
    CONSTRAINT "inversiones_ventas_cantidad_check" CHECK (("cantidad" > (0)::numeric)),
    CONSTRAINT "inversiones_ventas_moneda_check" CHECK (("moneda" = ANY (ARRAY['ARS'::"bpchar", 'USD'::"bpchar"])))
);


ALTER TABLE "public"."inversiones_ventas" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."inversiones_ventas_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."inversiones_ventas_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."inversiones_ventas_id_seq" OWNED BY "public"."inversiones_ventas"."id";



CREATE TABLE IF NOT EXISTS "public"."inversiones_ventas_lotes" (
    "id" integer NOT NULL,
    "venta_id" integer NOT NULL,
    "posicion_id" integer NOT NULL,
    "cantidad_compra" numeric NOT NULL,
    "cantidad_nominales" numeric NOT NULL,
    CONSTRAINT "inversiones_ventas_lotes_cantidad_compra_check" CHECK (("cantidad_compra" > (0)::numeric))
);


ALTER TABLE "public"."inversiones_ventas_lotes" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."inversiones_ventas_lotes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."inversiones_ventas_lotes_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."inversiones_ventas_lotes_id_seq" OWNED BY "public"."inversiones_ventas_lotes"."id";



CREATE TABLE IF NOT EXISTS "public"."marcas_tarjeta" (
    "id" integer NOT NULL,
    "nombre" "text" NOT NULL
);


ALTER TABLE "public"."marcas_tarjeta" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."marcas_tarjeta_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."marcas_tarjeta_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."marcas_tarjeta_id_seq" OWNED BY "public"."marcas_tarjeta"."id";



CREATE TABLE IF NOT EXISTS "public"."medios_pago" (
    "id" integer NOT NULL,
    "nombre" "text" NOT NULL,
    "tipo_id" integer NOT NULL,
    "entidad_id" integer,
    "marca_id" integer,
    "cuenta_id" integer,
    "activo" boolean DEFAULT true
);


ALTER TABLE "public"."medios_pago" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."medios_pago_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."medios_pago_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."medios_pago_id_seq" OWNED BY "public"."medios_pago"."id";



CREATE TABLE IF NOT EXISTS "public"."monedas" (
    "id" integer NOT NULL,
    "fecha" "date" DEFAULT CURRENT_DATE NOT NULL,
    "moneda" "text" NOT NULL,
    "valorcompra" numeric NOT NULL,
    "valorventa" numeric NOT NULL
);


ALTER TABLE "public"."monedas" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."monedas_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."monedas_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."monedas_id_seq" OWNED BY "public"."monedas"."id";



CREATE TABLE IF NOT EXISTS "public"."movimientos" (
    "id" integer NOT NULL,
    "fecha" "date" NOT NULL,
    "categoria_id" integer NOT NULL,
    "medio_pago_id" integer NOT NULL,
    "concepto" "text",
    "moneda" character(3) DEFAULT 'ARS'::"bpchar" NOT NULL,
    "importe" numeric(14,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "id_proveedor" smallint,
    "id_proyecto" integer,
    "reportable" boolean DEFAULT true,
    "resumen_id" integer,
    "id_inversion" integer,
    "id_venta_inversion" integer
);


ALTER TABLE "public"."movimientos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."movimientos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."movimientos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."movimientos_id_seq" OWNED BY "public"."movimientos"."id";



CREATE TABLE IF NOT EXISTS "public"."paises" (
    "id" integer NOT NULL,
    "nombre" character varying(100) NOT NULL,
    "region" character varying(50) NOT NULL
);


ALTER TABLE "public"."paises" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prestamo_cuotas" (
    "id" integer NOT NULL,
    "id_prestamo" integer NOT NULL,
    "nro_cuota" integer NOT NULL,
    "fecha" "date",
    "capital" numeric,
    "interes" numeric,
    "comisiones" numeric,
    "seguros" numeric,
    "iva" numeric,
    "mora" numeric,
    "punitorios" numeric,
    "importe_uva" numeric,
    "saldo_uva" numeric,
    "valor_uva" numeric,
    "monto_ars" numeric,
    "inflacion_pct" numeric,
    "id_movimiento" integer
);


ALTER TABLE "public"."prestamo_cuotas" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."prestamo_cuotas_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."prestamo_cuotas_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."prestamo_cuotas_id_seq" OWNED BY "public"."prestamo_cuotas"."id";



CREATE TABLE IF NOT EXISTS "public"."prestamos" (
    "id" integer NOT NULL,
    "nombre" character varying(100) NOT NULL,
    "entidad" integer,
    "moneda_indexacion" character varying(10) DEFAULT 'UVA'::character varying,
    "cuotas_totales" integer NOT NULL,
    "fecha_inicio" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."prestamos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."prestamos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."prestamos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."prestamos_id_seq" OWNED BY "public"."prestamos"."id";



CREATE TABLE IF NOT EXISTS "public"."presupuestos" (
    "id" integer NOT NULL,
    "categoria_id" integer NOT NULL,
    "monto_objetivo" numeric(14,2) NOT NULL,
    "moneda" character(3) DEFAULT 'ARS'::"bpchar" NOT NULL,
    "vigente_desde" character(6) NOT NULL
);


ALTER TABLE "public"."presupuestos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."presupuestos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."presupuestos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."presupuestos_id_seq" OWNED BY "public"."presupuestos"."id";



CREATE TABLE IF NOT EXISTS "public"."proveedores" (
    "id" integer NOT NULL,
    "nombre" character varying(100) NOT NULL,
    "cuit" character varying(11),
    "direccion" character varying(100),
    "localidad" character varying(100),
    "contacto" character varying(100),
    "telefono" character varying(50),
    "observaciones" character varying(255),
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."proveedores" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."proveedores_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."proveedores_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."proveedores_id_seq" OWNED BY "public"."proveedores"."id";



CREATE TABLE IF NOT EXISTS "public"."proyectos" (
    "id" integer NOT NULL,
    "nombre" character varying(100) NOT NULL,
    "fecha_inicio" "date",
    "fecha_fin" "date",
    "presupuesto" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "estado" character varying(20) DEFAULT 'ACTIVO'::character varying NOT NULL,
    "descripcion" "text",
    CONSTRAINT "proyectos_estado_check" CHECK ((("estado")::"text" = ANY ((ARRAY['ACTIVO'::character varying, 'PAUSADO'::character varying, 'FINALIZADO'::character varying])::"text"[])))
);


ALTER TABLE "public"."proyectos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."proyectos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."proyectos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."proyectos_id_seq" OWNED BY "public"."proyectos"."id";



CREATE TABLE IF NOT EXISTS "public"."ramas_actividad" (
    "id" integer NOT NULL,
    "nombre" character varying(100) NOT NULL
);


ALTER TABLE "public"."ramas_actividad" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ratios_historicos" (
    "id" integer NOT NULL,
    "ticker" "text" NOT NULL,
    "ratio" numeric NOT NULL,
    "fecha_desde" "date" NOT NULL,
    "fecha_hasta" "date"
);


ALTER TABLE "public"."ratios_historicos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."ratios_historicos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."ratios_historicos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."ratios_historicos_id_seq" OWNED BY "public"."ratios_historicos"."id";



CREATE TABLE IF NOT EXISTS "public"."resumenes" (
    "id" integer NOT NULL,
    "medio_pago_id" integer NOT NULL,
    "fecha_cierre" "date" NOT NULL,
    "fecha_vencimiento" "date",
    "saldo_total" numeric(14,2),
    "pago_minimo" numeric(14,2),
    "periodo" "date",
    "activo" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."resumenes" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."resumenes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."resumenes_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."resumenes_id_seq" OWNED BY "public"."resumenes"."id";



CREATE TABLE IF NOT EXISTS "public"."rubros" (
    "id" smallint NOT NULL,
    "nombre" character varying(100) NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."rubros" OWNER TO "postgres";


ALTER TABLE "public"."rubros" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."rubros_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ticker_pais" (
    "ticker" character varying(10) NOT NULL,
    "pais_id" integer NOT NULL,
    "porcentaje" numeric(5,2) NOT NULL,
    "fecha_composicion" "date" NOT NULL
);


ALTER TABLE "public"."ticker_pais" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticker_rama" (
    "ticker" character varying(10) NOT NULL,
    "rama_id" integer NOT NULL,
    "porcentaje" numeric(5,2),
    "fecha_composicion" "date" NOT NULL
);


ALTER TABLE "public"."ticker_rama" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tickers_seguidos" (
    "ticker" "text" NOT NULL,
    "nombre" "text",
    "activo" boolean DEFAULT true NOT NULL,
    "mercado" character varying(50),
    "pais_origen" character varying(50),
    "tipo_activo" character varying(50)
);


ALTER TABLE "public"."tickers_seguidos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tipos_cambio" (
    "mes_periodo" character(6) NOT NULL,
    "valor" numeric(12,2) NOT NULL
);


ALTER TABLE "public"."tipos_cambio" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tipos_medio_pago" (
    "id" integer NOT NULL,
    "nombre" "text" NOT NULL
);


ALTER TABLE "public"."tipos_medio_pago" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."tipos_medio_pago_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."tipos_medio_pago_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."tipos_medio_pago_id_seq" OWNED BY "public"."tipos_medio_pago"."id";



CREATE TABLE IF NOT EXISTS "public"."tipos_movimiento" (
    "id" integer NOT NULL,
    "nombre" "text" NOT NULL
);


ALTER TABLE "public"."tipos_movimiento" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."tipos_movimiento_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."tipos_movimiento_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."tipos_movimiento_id_seq" OWNED BY "public"."tipos_movimiento"."id";



CREATE TABLE IF NOT EXISTS "public"."transferencias" (
    "id" integer NOT NULL,
    "fecha" "date" DEFAULT CURRENT_DATE NOT NULL,
    "cuenta_origen_id" integer NOT NULL,
    "cuenta_destino_id" integer NOT NULL,
    "importe" numeric NOT NULL,
    "concepto" "text",
    "importe_destino" numeric,
    "tc" numeric,
    CONSTRAINT "origen_destino_distintos" CHECK (("cuenta_origen_id" <> "cuenta_destino_id")),
    CONSTRAINT "transferencias_importe_check" CHECK (("importe" > (0)::numeric))
);


ALTER TABLE "public"."transferencias" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."transferencias_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."transferencias_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."transferencias_id_seq" OWNED BY "public"."transferencias"."id";



CREATE OR REPLACE VIEW "public"."vw_composicion_pais_actual" WITH ("security_invoker"='true') AS
 SELECT "tp"."ticker",
    "tp"."pais_id",
    "p"."nombre" AS "pais",
    "p"."region",
    "tp"."porcentaje",
    "tp"."fecha_composicion"
   FROM ("public"."ticker_pais" "tp"
     JOIN "public"."paises" "p" ON (("p"."id" = "tp"."pais_id")))
  WHERE ("tp"."fecha_composicion" = ( SELECT "max"("t2"."fecha_composicion") AS "max"
           FROM "public"."ticker_pais" "t2"
          WHERE (("t2"."ticker")::"text" = ("tp"."ticker")::"text")));


ALTER VIEW "public"."vw_composicion_pais_actual" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_composicion_ticker_actual" WITH ("security_invoker"='true') AS
 SELECT "tr"."ticker",
    "tr"."rama_id",
    "ra"."nombre" AS "rama",
    "tr"."porcentaje",
    "tr"."fecha_composicion"
   FROM ("public"."ticker_rama" "tr"
     JOIN "public"."ramas_actividad" "ra" ON (("ra"."id" = "tr"."rama_id")))
  WHERE ("tr"."fecha_composicion" = ( SELECT "max"("tr2"."fecha_composicion") AS "max"
           FROM "public"."ticker_rama" "tr2"
          WHERE (("tr2"."ticker")::"text" = ("tr"."ticker")::"text")));


ALTER VIEW "public"."vw_composicion_ticker_actual" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_cuotas_generadas" AS
 SELECT "cc"."id" AS "compra_id",
    "n"."n" AS "nro_cuota",
    (("base"."mes" + ((("n"."n" - 1))::double precision * '1 mon'::interval)))::"date" AS "fecha_cuota",
    "to_char"(("base"."mes" + ((("n"."n" - 1))::double precision * '1 mon'::interval)), 'YYYYMM'::"text") AS "mes_periodo",
    "cc"."categoria_id",
    "cc"."medio_pago_id",
    "cc"."moneda",
    "round"(("cc"."monto_total" / ("cc"."cantidad_cuotas")::numeric), 2) AS "importe",
    (((("cc"."comercio" || ' - cuota '::"text") || "n"."n") || '/'::"text") || "cc"."cantidad_cuotas") AS "concepto",
    "cc"."id_proyecto",
    "cc"."id_proveedor"
   FROM (("public"."compras_cuotas" "cc"
     CROSS JOIN LATERAL ( SELECT COALESCE("cc"."mes_primera_cuota", ("date_trunc"('month'::"text", ("cc"."fecha_compra")::timestamp with time zone))::"date") AS "mes") "base")
     CROSS JOIN LATERAL "generate_series"(1, "cc"."cantidad_cuotas") "n"("n"));


ALTER VIEW "public"."vw_cuotas_generadas" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_deuda_futura" WITH ("security_invoker"='on') AS
 SELECT "mes_periodo",
    "sum"("importe") AS "importe"
   FROM "public"."vw_cuotas_generadas"
  GROUP BY "mes_periodo";


ALTER VIEW "public"."vw_deuda_futura" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_dividendos_cartera" WITH ("security_invoker"='true') AS
 SELECT "d"."ticker",
    "d"."fecha_ex",
    "d"."monto" AS "dividendo_por_accion",
    "d"."moneda",
    "p"."cuenta_id",
    "sum"((("p"."cantidad" - COALESCE("vs"."consumido", (0)::numeric)) / "rh"."ratio")) AS "acciones",
    ("sum"((("p"."cantidad" - COALESCE("vs"."consumido", (0)::numeric)) / "rh"."ratio")) * "d"."monto") AS "estimado_usd"
   FROM ((("public"."dividendos" "d"
     JOIN "public"."inversiones_posiciones" "p" ON ((("p"."ticker" = "d"."ticker") AND ("p"."fecha_operacion" <= "d"."fecha_ex"))))
     LEFT JOIN LATERAL ( SELECT "r"."ratio"
           FROM "public"."ratios_historicos" "r"
          WHERE (("r"."ticker" = "p"."ticker") AND ("r"."fecha_desde" <= "p"."fecha_operacion") AND (("r"."fecha_hasta" IS NULL) OR ("r"."fecha_hasta" >= "p"."fecha_operacion")))
          ORDER BY "r"."fecha_desde" DESC
         LIMIT 1) "rh" ON (true))
     LEFT JOIN LATERAL ( SELECT "sum"("l"."cantidad_compra") AS "consumido"
           FROM ("public"."inversiones_ventas_lotes" "l"
             JOIN "public"."inversiones_ventas" "v" ON (("v"."id" = "l"."venta_id")))
          WHERE (("l"."posicion_id" = "p"."id") AND ("v"."fecha_operacion" <= "d"."fecha_ex"))) "vs" ON (true))
  WHERE ("rh"."ratio" IS NOT NULL)
  GROUP BY "d"."ticker", "d"."fecha_ex", "d"."monto", "d"."moneda", "p"."cuenta_id"
 HAVING ("sum"((("p"."cantidad" - COALESCE("vs"."consumido", (0)::numeric)) / "rh"."ratio")) > 0.0000001);


ALTER VIEW "public"."vw_dividendos_cartera" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_ultima_cotizacion" AS
 SELECT DISTINCT ON ("ticker") "ticker",
    "fecha",
    "precio_usd"
   FROM "public"."cotizaciones_activos"
  ORDER BY "ticker", "fecha" DESC;


ALTER VIEW "public"."vw_ultima_cotizacion" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_inversiones_valuacion" AS
 WITH "ultimo_tc" AS (
         SELECT DISTINCT ON ("monedas"."moneda") "monedas"."moneda",
            "monedas"."valorcompra",
            "monedas"."valorventa",
            "monedas"."fecha"
           FROM "public"."monedas"
          WHERE ("monedas"."moneda" = ANY (ARRAY['USD_CCL'::"text", 'USD_MEP'::"text"]))
          ORDER BY "monedas"."moneda", "monedas"."fecha" DESC
        )
 SELECT "p"."id",
    "p"."cuenta_id",
    "c"."nombre" AS "cuenta_nombre",
    "p"."ticker",
    "p"."boleto_numero",
    "p"."fecha_operacion",
    "p"."cantidad",
    "rh"."ratio" AS "ratio_al_comprar",
    "p"."moneda",
    "p"."importe_neto",
    "p"."tc_ccl",
    "p"."tc_mep",
    (
        CASE
            WHEN ("p"."moneda" = 'USD'::"bpchar") THEN "p"."importe_neto"
            WHEN (("p"."moneda" = 'ARS'::"bpchar") AND (COALESCE("p"."tc_mep", "p"."tc_ccl") IS NOT NULL)) THEN ("p"."importe_neto" / COALESCE("p"."tc_mep", "p"."tc_ccl"))
            ELSE NULL::numeric
        END * (("p"."cantidad" - COALESCE("vl"."consumido", (0)::numeric)) / "p"."cantidad")) AS "costo_usd",
    "v"."precio_usd" AS "precio_subyacente_usd",
    "v"."fecha" AS "cotizacion_al",
    "tcc"."valorventa" AS "ccl_venta",
    "tcm"."valorventa" AS "mep_venta",
    ((((("p"."cantidad" - COALESCE("vl"."consumido", (0)::numeric)) / "rh"."ratio") * "v"."precio_usd") * "tcc"."valorventa") / NULLIF("tcm"."valorventa", (0)::numeric)) AS "valor_actual_usd",
    "rhoy"."ratio" AS "ratio_actual",
    ((("p"."cantidad" - COALESCE("vl"."consumido", (0)::numeric)) * "rhoy"."ratio") / NULLIF("rh"."ratio", (0)::numeric)) AS "cantidad_actual",
    ("p"."cantidad" - COALESCE("vl"."consumido", (0)::numeric)) AS "cantidad_restante"
   FROM ((((((("public"."inversiones_posiciones" "p"
     JOIN "public"."cuentas" "c" ON (("c"."id" = "p"."cuenta_id")))
     LEFT JOIN ( SELECT "inversiones_ventas_lotes"."posicion_id",
            "sum"("inversiones_ventas_lotes"."cantidad_compra") AS "consumido"
           FROM "public"."inversiones_ventas_lotes"
          GROUP BY "inversiones_ventas_lotes"."posicion_id") "vl" ON (("vl"."posicion_id" = "p"."id")))
     LEFT JOIN "public"."vw_ultima_cotizacion" "v" ON (("v"."ticker" = "p"."ticker")))
     LEFT JOIN "ultimo_tc" "tcc" ON (("tcc"."moneda" = 'USD_CCL'::"text")))
     LEFT JOIN "ultimo_tc" "tcm" ON (("tcm"."moneda" = 'USD_MEP'::"text")))
     LEFT JOIN LATERAL ( SELECT "r"."ratio"
           FROM "public"."ratios_historicos" "r"
          WHERE (("r"."ticker" = "p"."ticker") AND ("r"."fecha_desde" <= "p"."fecha_operacion") AND (("r"."fecha_hasta" IS NULL) OR ("r"."fecha_hasta" >= "p"."fecha_operacion")))
          ORDER BY "r"."fecha_desde" DESC
         LIMIT 1) "rh" ON (true))
     LEFT JOIN LATERAL ( SELECT "r"."ratio"
           FROM "public"."ratios_historicos" "r"
          WHERE (("r"."ticker" = "p"."ticker") AND ("r"."fecha_desde" <= CURRENT_DATE) AND (("r"."fecha_hasta" IS NULL) OR ("r"."fecha_hasta" >= CURRENT_DATE)))
          ORDER BY "r"."fecha_desde" DESC
         LIMIT 1) "rhoy" ON (true))
  WHERE (("p"."cantidad" - COALESCE("vl"."consumido", (0)::numeric)) > 0.0000001);


ALTER VIEW "public"."vw_inversiones_valuacion" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_exposicion_pais" WITH ("security_invoker"='true') AS
 SELECT "v"."cuenta_id",
    "v"."cuenta_nombre",
    COALESCE("c"."region", 'Sin clasificar'::character varying) AS "region",
    COALESCE("c"."pais", 'Sin clasificar'::character varying) AS "pais",
    "sum"((("v"."valor_actual_usd" * COALESCE("c"."porcentaje", (100)::numeric)) / (100)::numeric)) AS "valor_usd"
   FROM ("public"."vw_inversiones_valuacion" "v"
     LEFT JOIN "public"."vw_composicion_pais_actual" "c" ON ((("c"."ticker")::"text" = "v"."ticker")))
  GROUP BY "v"."cuenta_id", "v"."cuenta_nombre", COALESCE("c"."region", 'Sin clasificar'::character varying), COALESCE("c"."pais", 'Sin clasificar'::character varying);


ALTER VIEW "public"."vw_exposicion_pais" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_exposicion_rama" WITH ("security_invoker"='true') AS
 SELECT "v"."cuenta_id",
    "v"."cuenta_nombre",
    COALESCE("c"."rama", 'Sin clasificar'::character varying) AS "rama",
    "sum"((("v"."valor_actual_usd" * COALESCE("c"."porcentaje", (100)::numeric)) / (100)::numeric)) AS "valor_usd",
    ("sum"((("v"."valor_actual_usd" * COALESCE("c"."porcentaje", (100)::numeric)) / (100)::numeric)) / NULLIF("sum"("sum"((("v"."valor_actual_usd" * COALESCE("c"."porcentaje", (100)::numeric)) / (100)::numeric))) OVER (PARTITION BY "v"."cuenta_id"), (0)::numeric)) AS "pct_cartera"
   FROM ("public"."vw_inversiones_valuacion" "v"
     LEFT JOIN "public"."vw_composicion_ticker_actual" "c" ON ((("c"."ticker")::"text" = "v"."ticker")))
  GROUP BY "v"."cuenta_id", "v"."cuenta_nombre", COALESCE("c"."rama", 'Sin clasificar'::character varying);


ALTER VIEW "public"."vw_exposicion_rama" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_exposicion_rama_total" WITH ("security_invoker"='true') AS
 SELECT COALESCE("c"."rama", 'Sin clasificar'::character varying) AS "rama",
    "sum"((("v"."valor_actual_usd" * COALESCE("c"."porcentaje", (100)::numeric)) / (100)::numeric)) AS "valor_usd",
    ("sum"((("v"."valor_actual_usd" * COALESCE("c"."porcentaje", (100)::numeric)) / (100)::numeric)) / NULLIF("sum"("sum"((("v"."valor_actual_usd" * COALESCE("c"."porcentaje", (100)::numeric)) / (100)::numeric))) OVER (), (0)::numeric)) AS "pct_cartera"
   FROM ("public"."vw_inversiones_valuacion" "v"
     LEFT JOIN "public"."vw_composicion_ticker_actual" "c" ON ((("c"."ticker")::"text" = "v"."ticker")))
  GROUP BY COALESCE("c"."rama", 'Sin clasificar'::character varying);


ALTER VIEW "public"."vw_exposicion_rama_total" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_exposicion_region_total" WITH ("security_invoker"='true') AS
 SELECT "region",
    "sum"("valor_usd") AS "valor_usd",
    ("sum"("valor_usd") / NULLIF("sum"("sum"("valor_usd")) OVER (), (0)::numeric)) AS "pct_cartera"
   FROM "public"."vw_exposicion_pais"
  GROUP BY "region";


ALTER VIEW "public"."vw_exposicion_region_total" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_flujo" WITH ("security_invoker"='true') AS
 SELECT "movimientos"."fecha",
    "to_char"(("movimientos"."fecha")::timestamp with time zone, 'YYYYMM'::"text") AS "mes_periodo",
    "movimientos"."categoria_id",
    "movimientos"."medio_pago_id",
    "movimientos"."moneda",
    "movimientos"."importe",
    "movimientos"."concepto",
    "movimientos"."id_proyecto"
   FROM "public"."movimientos"
  WHERE ("movimientos"."reportable" = true)
UNION ALL
 SELECT "vw_cuotas_generadas"."fecha_cuota" AS "fecha",
    "vw_cuotas_generadas"."mes_periodo",
    "vw_cuotas_generadas"."categoria_id",
    "vw_cuotas_generadas"."medio_pago_id",
    "vw_cuotas_generadas"."moneda",
    "vw_cuotas_generadas"."importe",
    "vw_cuotas_generadas"."concepto",
    "vw_cuotas_generadas"."id_proyecto"
   FROM "public"."vw_cuotas_generadas";


ALTER VIEW "public"."vw_flujo" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_historial_cuenta" AS
 SELECT "mp"."cuenta_id",
    "m"."fecha",
    "m"."concepto",
    "tm"."nombre" AS "tipo",
    "m"."importe",
    'MOVIMIENTO'::"text" AS "origen"
   FROM ((("public"."movimientos" "m"
     JOIN "public"."medios_pago" "mp" ON (("mp"."id" = "m"."medio_pago_id")))
     JOIN "public"."categorias" "cat" ON (("cat"."id" = "m"."categoria_id")))
     JOIN "public"."tipos_movimiento" "tm" ON (("tm"."id" = "cat"."tipo_id")))
  WHERE ("mp"."cuenta_id" IS NOT NULL)
UNION ALL
 SELECT "transferencias"."cuenta_destino_id" AS "cuenta_id",
    "transferencias"."fecha",
    COALESCE("transferencias"."concepto", 'Transferencia recibida'::"text") AS "concepto",
    'Ingreso'::"text" AS "tipo",
    COALESCE("transferencias"."importe_destino", "transferencias"."importe") AS "importe",
    'TRANSFERENCIA_RECIBIDA'::"text" AS "origen"
   FROM "public"."transferencias"
UNION ALL
 SELECT "transferencias"."cuenta_origen_id" AS "cuenta_id",
    "transferencias"."fecha",
    COALESCE("transferencias"."concepto", 'Transferencia enviada'::"text") AS "concepto",
    'Egreso'::"text" AS "tipo",
    "transferencias"."importe",
    'TRANSFERENCIA_ENVIADA'::"text" AS "origen"
   FROM "public"."transferencias";


ALTER VIEW "public"."vw_historial_cuenta" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_inversiones_resumen_cuenta" WITH ("security_invoker"='true') AS
 SELECT "cuenta_id",
    "cuenta_nombre",
    "sum"("costo_usd") AS "total_costo_usd",
    "sum"("valor_actual_usd") AS "total_actual_usd",
    ("sum"(
        CASE
            WHEN ("costo_usd" IS NOT NULL) THEN "valor_actual_usd"
            ELSE NULL::numeric
        END) - "sum"("costo_usd")) AS "rendimiento_usd",
    "sum"("cantidad") FILTER (WHERE ("costo_usd" IS NOT NULL)) AS "cantidad_con_costo",
    "sum"("cantidad") AS "cantidad_total"
   FROM "public"."vw_inversiones_valuacion"
  GROUP BY "cuenta_id", "cuenta_nombre";


ALTER VIEW "public"."vw_inversiones_resumen_cuenta" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_inversiones_resumen_ticker" AS
 SELECT "ticker",
    "sum"("cantidad_actual") AS "nominales_total",
    "sum"("costo_usd") AS "costo_total_usd",
    "sum"("valor_actual_usd") AS "valor_actual_total_usd",
    ("sum"(
        CASE
            WHEN ("costo_usd" IS NOT NULL) THEN "valor_actual_usd"
            ELSE NULL::numeric
        END) - "sum"("costo_usd")) AS "rendimiento_usd"
   FROM "public"."vw_inversiones_valuacion"
  GROUP BY "ticker"
  ORDER BY ("sum"("valor_actual_usd")) DESC;


ALTER VIEW "public"."vw_inversiones_resumen_ticker" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_inversiones_ventas_resumen" AS
SELECT
    NULL::integer AS "id",
    NULL::integer AS "cuenta_id",
    NULL::"text" AS "ticker",
    NULL::"text" AS "boleto_numero",
    NULL::"date" AS "fecha_operacion",
    NULL::numeric AS "cantidad",
    NULL::character(3) AS "moneda",
    NULL::numeric AS "importe_neto",
    NULL::numeric AS "ingreso_usd",
    NULL::numeric AS "costo_usd";


ALTER VIEW "public"."vw_inversiones_ventas_resumen" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_movimientos_proyecto" AS
 SELECT "m"."id_proyecto",
    "m"."fecha",
    "m"."concepto",
    "m"."importe",
    ("c"."nombre")::character varying(100) AS "rubro",
    "pv"."nombre" AS "proveedor",
    'MOVIMIENTO'::"text" AS "origen"
   FROM ((("public"."movimientos" "m"
     LEFT JOIN "public"."categorias" "c" ON (("c"."id" = "m"."categoria_id")))
     LEFT JOIN "public"."rubros" "r" ON (("r"."id" = "c"."id_rubro")))
     LEFT JOIN "public"."proveedores" "pv" ON (("pv"."id" = "m"."id_proveedor")))
  WHERE ("m"."id_proyecto" IS NOT NULL)
UNION ALL
 SELECT "cc"."id_proyecto",
    "vc"."fecha_cuota" AS "fecha",
    "vc"."concepto",
    "vc"."importe",
    ("c"."nombre")::character varying(100) AS "rubro",
    "pv"."nombre" AS "proveedor",
    'CUOTA'::"text" AS "origen"
   FROM (((("public"."vw_cuotas_generadas" "vc"
     JOIN "public"."compras_cuotas" "cc" ON (("cc"."id" = "vc"."compra_id")))
     LEFT JOIN "public"."categorias" "c" ON (("c"."id" = "cc"."categoria_id")))
     LEFT JOIN "public"."rubros" "r" ON (("r"."id" = "c"."id_rubro")))
     LEFT JOIN "public"."proveedores" "pv" ON (("pv"."id" = "cc"."id_proveedor")))
  WHERE ("cc"."id_proyecto" IS NOT NULL);


ALTER VIEW "public"."vw_movimientos_proyecto" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_movimientos_usd" AS
 SELECT "v"."id_proyecto",
    "v"."fecha",
    "v"."concepto",
    "v"."importe",
    "v"."rubro",
    "v"."proveedor",
    "v"."origen",
    ("v"."importe" / "tc"."valorventa") AS "importe_usd"
   FROM ("public"."vw_movimientos_proyecto" "v"
     LEFT JOIN LATERAL ( SELECT "monedas"."valorventa"
           FROM "public"."monedas"
          WHERE (("monedas"."moneda" = 'USD'::"text") AND ("monedas"."fecha" <= "v"."fecha"))
          ORDER BY "monedas"."fecha" DESC
         LIMIT 1) "tc" ON (true));


ALTER VIEW "public"."vw_movimientos_usd" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_prestamo_cuotas" WITH ("security_invoker"='true') AS
 SELECT "id",
    "id_prestamo",
    "nro_cuota",
    "fecha",
    "capital",
    "interes",
    "comisiones",
    "seguros",
    "iva",
    "mora",
    "punitorios",
    "importe_uva",
    "saldo_uva",
    "valor_uva",
    "monto_ars",
    "inflacion_pct",
    "id_movimiento",
    "round"(((("valor_uva" - "lag"("valor_uva") OVER "w") / NULLIF("lag"("valor_uva") OVER "w", (0)::numeric)) * (100)::numeric), 2) AS "incremento_valor_uva_pct",
    "round"(((("monto_ars" - "lag"("monto_ars") OVER "w") / NULLIF("lag"("monto_ars") OVER "w", (0)::numeric)) * (100)::numeric), 2) AS "incremento_monto_ars_pct"
   FROM "public"."prestamo_cuotas" "pc"
  WINDOW "w" AS (PARTITION BY "id_prestamo" ORDER BY "nro_cuota");


ALTER VIEW "public"."vw_prestamo_cuotas" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_resumen_categoria" WITH ("security_invoker"='true') AS
 SELECT "f"."mes_periodo",
    "c"."id" AS "categoria_id",
    "c"."nombre" AS "categoria",
    "tm"."nombre" AS "tipo",
    "sum"(
        CASE
            WHEN ("f"."moneda" = 'USD'::"bpchar") THEN ("f"."importe" * COALESCE("tc"."valor", (1)::numeric))
            ELSE "f"."importe"
        END) AS "total_ars",
    ("f"."id_proyecto" IS NOT NULL) AS "es_proyecto"
   FROM ((("public"."vw_flujo" "f"
     JOIN "public"."categorias" "c" ON (("c"."id" = "f"."categoria_id")))
     JOIN "public"."tipos_movimiento" "tm" ON (("tm"."id" = "c"."tipo_id")))
     LEFT JOIN "public"."tipos_cambio" "tc" ON ((("tc"."mes_periodo")::"text" = "f"."mes_periodo")))
  GROUP BY "f"."mes_periodo", "c"."id", "c"."nombre", "tm"."nombre", ("f"."id_proyecto" IS NOT NULL);


ALTER VIEW "public"."vw_resumen_categoria" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_resumen_rubros" AS
SELECT
    NULL::"text" AS "mes_periodo",
    NULL::smallint AS "id_rubro",
    NULL::"text" AS "rubro",
    NULL::"text" AS "tipo",
    NULL::numeric AS "total_ars",
    NULL::boolean AS "es_proyecto";


ALTER VIEW "public"."vw_resumen_rubros" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_saldo_cuentas" AS
 SELECT "c"."id",
    "c"."nombre",
    "c"."tipo",
    "c"."entidad_id",
    "c"."saldo_inicial",
    "c"."fecha_saldo_inicial",
    (((("c"."saldo_inicial" + COALESCE("ingresos"."total", (0)::numeric)) - COALESCE("egresos"."total", (0)::numeric)) + COALESCE("transf_recibidas"."total", (0)::numeric)) - COALESCE("transf_enviadas"."total", (0)::numeric)) AS "saldo_actual",
    "c"."moneda"
   FROM (((("public"."cuentas" "c"
     LEFT JOIN LATERAL ( SELECT "sum"("m"."importe") AS "total"
           FROM ((("public"."movimientos" "m"
             JOIN "public"."medios_pago" "mp" ON (("mp"."id" = "m"."medio_pago_id")))
             JOIN "public"."categorias" "cat" ON (("cat"."id" = "m"."categoria_id")))
             JOIN "public"."tipos_movimiento" "tm" ON (("tm"."id" = "cat"."tipo_id")))
          WHERE (("mp"."cuenta_id" = "c"."id") AND ("m"."fecha" >= "c"."fecha_saldo_inicial") AND ("tm"."nombre" = 'Ingreso'::"text"))) "ingresos" ON (true))
     LEFT JOIN LATERAL ( SELECT "sum"("m"."importe") AS "total"
           FROM ((("public"."movimientos" "m"
             JOIN "public"."medios_pago" "mp" ON (("mp"."id" = "m"."medio_pago_id")))
             JOIN "public"."categorias" "cat" ON (("cat"."id" = "m"."categoria_id")))
             JOIN "public"."tipos_movimiento" "tm" ON (("tm"."id" = "cat"."tipo_id")))
          WHERE (("mp"."cuenta_id" = "c"."id") AND ("m"."fecha" >= "c"."fecha_saldo_inicial") AND ("tm"."nombre" = 'Egreso'::"text"))) "egresos" ON (true))
     LEFT JOIN LATERAL ( SELECT "sum"(COALESCE("t"."importe_destino", "t"."importe")) AS "total"
           FROM "public"."transferencias" "t"
          WHERE (("t"."cuenta_destino_id" = "c"."id") AND ("t"."fecha" >= "c"."fecha_saldo_inicial"))) "transf_recibidas" ON (true))
     LEFT JOIN LATERAL ( SELECT "sum"("t"."importe") AS "total"
           FROM "public"."transferencias" "t"
          WHERE (("t"."cuenta_origen_id" = "c"."id") AND ("t"."fecha" >= "c"."fecha_saldo_inicial"))) "transf_enviadas" ON (true));


ALTER VIEW "public"."vw_saldo_cuentas" OWNER TO "postgres";


ALTER TABLE ONLY "public"."categorias" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."categorias_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."compras_cuotas" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."compras_cuotas_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."cotizaciones_activos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."cotizaciones_activos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."cuentas" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."cuentas_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."dividendos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."dividendos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."entidades_financieras" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."entidades_financieras_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."fundamentales" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."fundamentales_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."inversiones_posiciones" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."inversiones_posiciones_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."inversiones_ventas" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."inversiones_ventas_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."inversiones_ventas_lotes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."inversiones_ventas_lotes_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."marcas_tarjeta" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."marcas_tarjeta_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."medios_pago" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."medios_pago_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."monedas" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."monedas_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."movimientos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."movimientos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."prestamo_cuotas" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."prestamo_cuotas_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."prestamos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."prestamos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."presupuestos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."presupuestos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."proveedores" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."proveedores_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."proyectos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."proyectos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ratios_historicos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ratios_historicos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."resumenes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."resumenes_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."tipos_medio_pago" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."tipos_medio_pago_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."tipos_movimiento" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."tipos_movimiento_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."transferencias" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."transferencias_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."app_config"
    ADD CONSTRAINT "app_config_pkey" PRIMARY KEY ("clave");



ALTER TABLE ONLY "public"."categorias"
    ADD CONSTRAINT "categorias_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."categorias"
    ADD CONSTRAINT "categorias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."compras_cuotas"
    ADD CONSTRAINT "compras_cuotas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cotizaciones_activos"
    ADD CONSTRAINT "cotizaciones_activos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cotizaciones_activos"
    ADD CONSTRAINT "cotizaciones_activos_ticker_fecha_key" UNIQUE ("ticker", "fecha");



ALTER TABLE ONLY "public"."cuentas"
    ADD CONSTRAINT "cuentas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dividendos"
    ADD CONSTRAINT "dividendos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dividendos"
    ADD CONSTRAINT "dividendos_ticker_fecha_ex_key" UNIQUE ("ticker", "fecha_ex");



ALTER TABLE ONLY "public"."entidades_financieras"
    ADD CONSTRAINT "entidades_financieras_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."entidades_financieras"
    ADD CONSTRAINT "entidades_financieras_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fundamentales"
    ADD CONSTRAINT "fundamentales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fundamentales"
    ADD CONSTRAINT "fundamentales_ticker_metrica_fecha_periodo_key" UNIQUE ("ticker", "metrica", "fecha_periodo");



ALTER TABLE ONLY "public"."inversiones_posiciones"
    ADD CONSTRAINT "inversiones_posiciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inversiones_ventas_lotes"
    ADD CONSTRAINT "inversiones_ventas_lotes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inversiones_ventas"
    ADD CONSTRAINT "inversiones_ventas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marcas_tarjeta"
    ADD CONSTRAINT "marcas_tarjeta_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."marcas_tarjeta"
    ADD CONSTRAINT "marcas_tarjeta_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."medios_pago"
    ADD CONSTRAINT "medios_pago_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."medios_pago"
    ADD CONSTRAINT "medios_pago_tipo_id_entidad_id_marca_id_key" UNIQUE ("tipo_id", "entidad_id", "marca_id");



ALTER TABLE ONLY "public"."monedas"
    ADD CONSTRAINT "monedas_fecha_moneda_key" UNIQUE ("fecha", "moneda");



ALTER TABLE ONLY "public"."monedas"
    ADD CONSTRAINT "monedas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."movimientos"
    ADD CONSTRAINT "movimientos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."paises"
    ADD CONSTRAINT "paises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prestamo_cuotas"
    ADD CONSTRAINT "prestamo_cuotas_id_prestamo_nro_cuota_key" UNIQUE ("id_prestamo", "nro_cuota");



ALTER TABLE ONLY "public"."prestamo_cuotas"
    ADD CONSTRAINT "prestamo_cuotas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prestamos"
    ADD CONSTRAINT "prestamos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."presupuestos"
    ADD CONSTRAINT "presupuestos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proveedores"
    ADD CONSTRAINT "proveedores_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."proveedores"
    ADD CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proyectos"
    ADD CONSTRAINT "proyectos_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."proyectos"
    ADD CONSTRAINT "proyectos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ramas_actividad"
    ADD CONSTRAINT "ramas_actividad_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ratios_historicos"
    ADD CONSTRAINT "ratios_historicos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ratios_historicos"
    ADD CONSTRAINT "ratios_historicos_ticker_fecha_desde_key" UNIQUE ("ticker", "fecha_desde");



ALTER TABLE ONLY "public"."resumenes"
    ADD CONSTRAINT "resumen_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resumenes"
    ADD CONSTRAINT "resumenes_medio_cierre_uk" UNIQUE ("medio_pago_id", "fecha_cierre");



ALTER TABLE ONLY "public"."rubros"
    ADD CONSTRAINT "rubros_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."rubros"
    ADD CONSTRAINT "rubros_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticker_pais"
    ADD CONSTRAINT "ticker_pais_pkey" PRIMARY KEY ("ticker", "pais_id", "fecha_composicion");



ALTER TABLE ONLY "public"."ticker_rama"
    ADD CONSTRAINT "ticker_rama_pkey" PRIMARY KEY ("ticker", "rama_id", "fecha_composicion");



ALTER TABLE ONLY "public"."tickers_seguidos"
    ADD CONSTRAINT "tickers_seguidos_pkey" PRIMARY KEY ("ticker");



ALTER TABLE ONLY "public"."tipos_cambio"
    ADD CONSTRAINT "tipos_cambio_pkey" PRIMARY KEY ("mes_periodo");



ALTER TABLE ONLY "public"."tipos_medio_pago"
    ADD CONSTRAINT "tipos_medio_pago_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."tipos_medio_pago"
    ADD CONSTRAINT "tipos_medio_pago_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tipos_movimiento"
    ADD CONSTRAINT "tipos_movimiento_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."tipos_movimiento"
    ADD CONSTRAINT "tipos_movimiento_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transferencias"
    ADD CONSTRAINT "transferencias_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_compras_cuotas_proyecto" ON "public"."compras_cuotas" USING "btree" ("id_proyecto");



CREATE INDEX "idx_cotizaciones_ticker_fecha" ON "public"."cotizaciones_activos" USING "btree" ("ticker", "fecha" DESC);



CREATE INDEX "idx_dividendos_ticker" ON "public"."dividendos" USING "btree" ("ticker", "fecha_ex" DESC);



CREATE INDEX "idx_fundamentales_ticker" ON "public"."fundamentales" USING "btree" ("ticker", "metrica", "fecha_periodo");



CREATE INDEX "idx_inversiones_posiciones_cuenta" ON "public"."inversiones_posiciones" USING "btree" ("cuenta_id");



CREATE INDEX "idx_monedas_moneda_fecha" ON "public"."monedas" USING "btree" ("moneda", "fecha" DESC);



CREATE INDEX "idx_movimientos_fecha" ON "public"."movimientos" USING "btree" ("fecha");



CREATE INDEX "idx_movimientos_proyecto" ON "public"."movimientos" USING "btree" ("id_proyecto");



CREATE INDEX "idx_ratios_ticker_fecha" ON "public"."ratios_historicos" USING "btree" ("ticker", "fecha_desde");



CREATE INDEX "idx_transferencias_destino" ON "public"."transferencias" USING "btree" ("cuenta_destino_id", "fecha");



CREATE INDEX "idx_transferencias_origen" ON "public"."transferencias" USING "btree" ("cuenta_origen_id", "fecha");



CREATE INDEX "idx_ventas_cuenta" ON "public"."inversiones_ventas" USING "btree" ("cuenta_id");



CREATE INDEX "idx_ventas_lotes_posicion" ON "public"."inversiones_ventas_lotes" USING "btree" ("posicion_id");



CREATE INDEX "movimientos_resumen_id_idx" ON "public"."movimientos" USING "btree" ("resumen_id");



CREATE UNIQUE INDEX "resumenes_un_activo_por_tarjeta" ON "public"."resumenes" USING "btree" ("medio_pago_id") WHERE ("activo" = true);



CREATE OR REPLACE VIEW "public"."vw_inversiones_ventas_resumen" AS
 SELECT "v"."id",
    "v"."cuenta_id",
    "v"."ticker",
    "v"."boleto_numero",
    "v"."fecha_operacion",
    "v"."cantidad",
    "v"."moneda",
    "v"."importe_neto",
        CASE
            WHEN ("v"."moneda" = 'USD'::"bpchar") THEN "v"."importe_neto"
            WHEN (COALESCE("v"."tc_mep", "v"."tc_ccl") IS NOT NULL) THEN ("v"."importe_neto" / COALESCE("v"."tc_mep", "v"."tc_ccl"))
            ELSE NULL::numeric
        END AS "ingreso_usd",
    "sum"((
        CASE
            WHEN ("p"."moneda" = 'USD'::"bpchar") THEN "p"."importe_neto"
            WHEN (COALESCE("p"."tc_mep", "p"."tc_ccl") IS NOT NULL) THEN ("p"."importe_neto" / COALESCE("p"."tc_mep", "p"."tc_ccl"))
            ELSE NULL::numeric
        END * ("l"."cantidad_compra" / "p"."cantidad"))) AS "costo_usd"
   FROM (("public"."inversiones_ventas" "v"
     JOIN "public"."inversiones_ventas_lotes" "l" ON (("l"."venta_id" = "v"."id")))
     JOIN "public"."inversiones_posiciones" "p" ON (("p"."id" = "l"."posicion_id")))
  GROUP BY "v"."id";



CREATE OR REPLACE VIEW "public"."vw_resumen_rubros" AS
 SELECT "f"."mes_periodo",
    "c"."id_rubro",
    COALESCE(("r"."nombre")::"text", "c"."nombre") AS "rubro",
    "tm"."nombre" AS "tipo",
    "sum"(
        CASE
            WHEN ("f"."moneda" = 'USD'::"bpchar") THEN ("f"."importe" * COALESCE("tc"."valor", (1)::numeric))
            ELSE "f"."importe"
        END) AS "total_ars",
    ("f"."id_proyecto" IS NOT NULL) AS "es_proyecto"
   FROM (((("public"."vw_flujo" "f"
     JOIN "public"."categorias" "c" ON (("c"."id" = "f"."categoria_id")))
     JOIN "public"."tipos_movimiento" "tm" ON (("tm"."id" = "c"."tipo_id")))
     LEFT JOIN "public"."rubros" "r" ON (("r"."id" = "c"."id_rubro")))
     LEFT JOIN "public"."tipos_cambio" "tc" ON ((("tc"."mes_periodo")::"text" = "f"."mes_periodo")))
  GROUP BY "f"."mes_periodo", "c"."id", "r"."nombre", "c"."nombre", "tm"."nombre", ("f"."id_proyecto" IS NOT NULL);



CREATE OR REPLACE TRIGGER "trg_completar_tc_boleto" BEFORE INSERT ON "public"."inversiones_posiciones" FOR EACH ROW EXECUTE FUNCTION "public"."fn_completar_tc_boleto"();



CREATE OR REPLACE TRIGGER "trg_desactivar_resumen_anterior" BEFORE INSERT OR UPDATE ON "public"."resumenes" FOR EACH ROW EXECUTE FUNCTION "public"."fn_desactivar_resumen_anterior"();



ALTER TABLE ONLY "public"."categorias"
    ADD CONSTRAINT "categorias_tipo_id_fkey" FOREIGN KEY ("tipo_id") REFERENCES "public"."tipos_movimiento"("id");



ALTER TABLE ONLY "public"."compras_cuotas"
    ADD CONSTRAINT "compras_cuotas_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id");



ALTER TABLE ONLY "public"."compras_cuotas"
    ADD CONSTRAINT "compras_cuotas_id_proveedor_fkey" FOREIGN KEY ("id_proveedor") REFERENCES "public"."proveedores"("id");



ALTER TABLE ONLY "public"."compras_cuotas"
    ADD CONSTRAINT "compras_cuotas_medio_pago_id_fkey" FOREIGN KEY ("medio_pago_id") REFERENCES "public"."medios_pago"("id");



ALTER TABLE ONLY "public"."compras_cuotas"
    ADD CONSTRAINT "compras_cuotas_proyecto_fk" FOREIGN KEY ("id_proyecto") REFERENCES "public"."proyectos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cotizaciones_activos"
    ADD CONSTRAINT "cotizaciones_activos_ticker_fkey" FOREIGN KEY ("ticker") REFERENCES "public"."tickers_seguidos"("ticker");



ALTER TABLE ONLY "public"."cuentas"
    ADD CONSTRAINT "cuentas_entidad_id_fkey" FOREIGN KEY ("entidad_id") REFERENCES "public"."entidades_financieras"("id");



ALTER TABLE ONLY "public"."dividendos"
    ADD CONSTRAINT "dividendos_ticker_fkey" FOREIGN KEY ("ticker") REFERENCES "public"."tickers_seguidos"("ticker");



ALTER TABLE ONLY "public"."categorias"
    ADD CONSTRAINT "fk_categorias_rubros" FOREIGN KEY ("id_rubro") REFERENCES "public"."rubros"("id");



ALTER TABLE ONLY "public"."prestamos"
    ADD CONSTRAINT "fk_entidad_prestamos" FOREIGN KEY ("entidad") REFERENCES "public"."entidades_financieras"("id");



ALTER TABLE ONLY "public"."movimientos"
    ADD CONSTRAINT "fk_mov_proveedores" FOREIGN KEY ("id_proveedor") REFERENCES "public"."proveedores"("id");



ALTER TABLE ONLY "public"."fundamentales"
    ADD CONSTRAINT "fundamentales_ticker_fkey" FOREIGN KEY ("ticker") REFERENCES "public"."tickers_seguidos"("ticker");



ALTER TABLE ONLY "public"."inversiones_posiciones"
    ADD CONSTRAINT "inversiones_posiciones_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id");



ALTER TABLE ONLY "public"."inversiones_posiciones"
    ADD CONSTRAINT "inversiones_posiciones_ticker_fkey" FOREIGN KEY ("ticker") REFERENCES "public"."tickers_seguidos"("ticker");



ALTER TABLE ONLY "public"."inversiones_ventas"
    ADD CONSTRAINT "inversiones_ventas_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id");



ALTER TABLE ONLY "public"."inversiones_ventas_lotes"
    ADD CONSTRAINT "inversiones_ventas_lotes_posicion_id_fkey" FOREIGN KEY ("posicion_id") REFERENCES "public"."inversiones_posiciones"("id");



ALTER TABLE ONLY "public"."inversiones_ventas_lotes"
    ADD CONSTRAINT "inversiones_ventas_lotes_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "public"."inversiones_ventas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inversiones_ventas"
    ADD CONSTRAINT "inversiones_ventas_ticker_fkey" FOREIGN KEY ("ticker") REFERENCES "public"."tickers_seguidos"("ticker");



ALTER TABLE ONLY "public"."medios_pago"
    ADD CONSTRAINT "medios_pago_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id");



ALTER TABLE ONLY "public"."medios_pago"
    ADD CONSTRAINT "medios_pago_entidad_id_fkey" FOREIGN KEY ("entidad_id") REFERENCES "public"."entidades_financieras"("id");



ALTER TABLE ONLY "public"."medios_pago"
    ADD CONSTRAINT "medios_pago_marca_id_fkey" FOREIGN KEY ("marca_id") REFERENCES "public"."marcas_tarjeta"("id");



ALTER TABLE ONLY "public"."medios_pago"
    ADD CONSTRAINT "medios_pago_tipo_id_fkey" FOREIGN KEY ("tipo_id") REFERENCES "public"."tipos_medio_pago"("id");



ALTER TABLE ONLY "public"."movimientos"
    ADD CONSTRAINT "movimientos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id");



ALTER TABLE ONLY "public"."movimientos"
    ADD CONSTRAINT "movimientos_id_inversion_fkey" FOREIGN KEY ("id_inversion") REFERENCES "public"."inversiones_posiciones"("id");



ALTER TABLE ONLY "public"."movimientos"
    ADD CONSTRAINT "movimientos_id_venta_inversion_fkey" FOREIGN KEY ("id_venta_inversion") REFERENCES "public"."inversiones_ventas"("id");



ALTER TABLE ONLY "public"."movimientos"
    ADD CONSTRAINT "movimientos_medio_pago_id_fkey" FOREIGN KEY ("medio_pago_id") REFERENCES "public"."medios_pago"("id");



ALTER TABLE ONLY "public"."movimientos"
    ADD CONSTRAINT "movimientos_proyecto_fk" FOREIGN KEY ("id_proyecto") REFERENCES "public"."proyectos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."movimientos"
    ADD CONSTRAINT "movimientos_resumenes_id_fkey" FOREIGN KEY ("resumen_id") REFERENCES "public"."resumenes"("id");



ALTER TABLE ONLY "public"."prestamo_cuotas"
    ADD CONSTRAINT "prestamo_cuotas_id_movimiento_fkey" FOREIGN KEY ("id_movimiento") REFERENCES "public"."movimientos"("id");



ALTER TABLE ONLY "public"."prestamo_cuotas"
    ADD CONSTRAINT "prestamo_cuotas_id_prestamo_fkey" FOREIGN KEY ("id_prestamo") REFERENCES "public"."prestamos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prestamos"
    ADD CONSTRAINT "prestamos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."presupuestos"
    ADD CONSTRAINT "presupuestos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id");



ALTER TABLE ONLY "public"."ratios_historicos"
    ADD CONSTRAINT "ratios_historicos_ticker_fkey" FOREIGN KEY ("ticker") REFERENCES "public"."tickers_seguidos"("ticker");



ALTER TABLE ONLY "public"."resumenes"
    ADD CONSTRAINT "resumen_medio_pago_fk" FOREIGN KEY ("medio_pago_id") REFERENCES "public"."medios_pago"("id");



ALTER TABLE ONLY "public"."rubros"
    ADD CONSTRAINT "rubros_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."ticker_pais"
    ADD CONSTRAINT "ticker_pais_pais_id_fkey" FOREIGN KEY ("pais_id") REFERENCES "public"."paises"("id");



ALTER TABLE ONLY "public"."ticker_pais"
    ADD CONSTRAINT "ticker_pais_ticker_fkey" FOREIGN KEY ("ticker") REFERENCES "public"."tickers_seguidos"("ticker");



ALTER TABLE ONLY "public"."ticker_rama"
    ADD CONSTRAINT "ticker_rama_rama_id_fkey" FOREIGN KEY ("rama_id") REFERENCES "public"."ramas_actividad"("id");



ALTER TABLE ONLY "public"."ticker_rama"
    ADD CONSTRAINT "ticker_rama_ticker_fkey" FOREIGN KEY ("ticker") REFERENCES "public"."tickers_seguidos"("ticker");



ALTER TABLE ONLY "public"."transferencias"
    ADD CONSTRAINT "transferencias_cuenta_destino_id_fkey" FOREIGN KEY ("cuenta_destino_id") REFERENCES "public"."cuentas"("id");



ALTER TABLE ONLY "public"."transferencias"
    ADD CONSTRAINT "transferencias_cuenta_origen_id_fkey" FOREIGN KEY ("cuenta_origen_id") REFERENCES "public"."cuentas"("id");



CREATE POLICY "acceso total usuarios autenticados" ON "public"."app_config" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "acceso total usuarios autenticados" ON "public"."cotizaciones_activos" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "acceso total usuarios autenticados" ON "public"."cuentas" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "acceso total usuarios autenticados" ON "public"."dividendos" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "acceso total usuarios autenticados" ON "public"."fundamentales" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "acceso total usuarios autenticados" ON "public"."inversiones_posiciones" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "acceso total usuarios autenticados" ON "public"."inversiones_ventas" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "acceso total usuarios autenticados" ON "public"."inversiones_ventas_lotes" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "acceso total usuarios autenticados" ON "public"."prestamo_cuotas" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "acceso total usuarios autenticados" ON "public"."prestamos" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "acceso total usuarios autenticados" ON "public"."proveedores" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "acceso total usuarios autenticados" ON "public"."proyectos" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "acceso total usuarios autenticados" ON "public"."ratios_historicos" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "acceso total usuarios autenticados" ON "public"."resumenes" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "acceso total usuarios autenticados" ON "public"."rubros" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "acceso total usuarios autenticados" ON "public"."tickers_seguidos" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "acceso total usuarios autenticados" ON "public"."transferencias" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."app_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categorias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."compras_cuotas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cotizaciones_activos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cuentas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dividendos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."entidades_financieras" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fundamentales" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inversiones_posiciones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inversiones_ventas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inversiones_ventas_lotes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lectura autenticados" ON "public"."monedas" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "lectura catalogo" ON "public"."paises" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "lectura catalogo" ON "public"."ramas_actividad" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "lectura catalogo" ON "public"."ticker_pais" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "lectura catalogo" ON "public"."ticker_rama" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."marcas_tarjeta" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."medios_pago" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."monedas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."movimientos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."paises" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prestamo_cuotas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prestamos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."presupuestos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."proveedores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."proyectos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ramas_actividad" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ratios_historicos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resumenes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "resumenes_delete" ON "public"."resumenes" FOR DELETE USING (true);



CREATE POLICY "resumenes_insert" ON "public"."resumenes" FOR INSERT WITH CHECK (true);



CREATE POLICY "resumenes_select" ON "public"."resumenes" FOR SELECT USING (true);



CREATE POLICY "resumenes_update" ON "public"."resumenes" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."rubros" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "solo_autenticados" ON "public"."categorias" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "solo_autenticados" ON "public"."compras_cuotas" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "solo_autenticados" ON "public"."entidades_financieras" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "solo_autenticados" ON "public"."marcas_tarjeta" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "solo_autenticados" ON "public"."medios_pago" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "solo_autenticados" ON "public"."movimientos" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "solo_autenticados" ON "public"."presupuestos" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "solo_autenticados" ON "public"."tipos_cambio" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "solo_autenticados" ON "public"."tipos_medio_pago" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "solo_autenticados" ON "public"."tipos_movimiento" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."ticker_pais" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ticker_rama" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tickers_seguidos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tipos_cambio" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tipos_medio_pago" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tipos_movimiento" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transferencias" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_completar_tc_boleto"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_completar_tc_boleto"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_completar_tc_boleto"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_desactivar_resumen_anterior"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_desactivar_resumen_anterior"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_desactivar_resumen_anterior"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_resumen_sugerido"("p_medio_pago_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_resumen_sugerido"("p_medio_pago_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_resumen_sugerido"("p_medio_pago_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."movimientos_proyecto"("p_proyecto_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."movimientos_proyecto"("p_proyecto_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."movimientos_proyecto"("p_proyecto_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."movimientos_tarjeta"("p_periodo" character varying, "p_mediopago" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."movimientos_tarjeta"("p_periodo" character varying, "p_mediopago" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."movimientos_tarjeta"("p_periodo" character varying, "p_mediopago" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."recalcular_fifo"("p_cuenta_id" integer, "p_ticker" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."recalcular_fifo"("p_cuenta_id" integer, "p_ticker" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalcular_fifo"("p_cuenta_id" integer, "p_ticker" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."resumen_proyecto"("p_proyecto_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."resumen_proyecto"("p_proyecto_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."resumen_proyecto"("p_proyecto_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."resumen_proyecto_evolucion"("p_proyecto_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."resumen_proyecto_evolucion"("p_proyecto_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."resumen_proyecto_evolucion"("p_proyecto_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."resumen_proyecto_proveedor"("p_proyecto_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."resumen_proyecto_proveedor"("p_proyecto_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."resumen_proyecto_proveedor"("p_proyecto_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."resumen_proyecto_rubro"("p_proyecto_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."resumen_proyecto_rubro"("p_proyecto_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."resumen_proyecto_rubro"("p_proyecto_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."total_tarjeta"("p_periodo" character varying, "p_mediopago" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."total_tarjeta"("p_periodo" character varying, "p_mediopago" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."total_tarjeta"("p_periodo" character varying, "p_mediopago" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."total_tarjeta"("p_periodo" character varying, "p_mediopago" integer, "p_tipo" character) TO "anon";
GRANT ALL ON FUNCTION "public"."total_tarjeta"("p_periodo" character varying, "p_mediopago" integer, "p_tipo" character) TO "authenticated";
GRANT ALL ON FUNCTION "public"."total_tarjeta"("p_periodo" character varying, "p_mediopago" integer, "p_tipo" character) TO "service_role";



GRANT ALL ON TABLE "public"."app_config" TO "anon";
GRANT ALL ON TABLE "public"."app_config" TO "authenticated";
GRANT ALL ON TABLE "public"."app_config" TO "service_role";



GRANT ALL ON TABLE "public"."categorias" TO "anon";
GRANT ALL ON TABLE "public"."categorias" TO "authenticated";
GRANT ALL ON TABLE "public"."categorias" TO "service_role";



GRANT ALL ON SEQUENCE "public"."categorias_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."categorias_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."categorias_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."compras_cuotas" TO "anon";
GRANT ALL ON TABLE "public"."compras_cuotas" TO "authenticated";
GRANT ALL ON TABLE "public"."compras_cuotas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."compras_cuotas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."compras_cuotas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."compras_cuotas_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."cotizaciones_activos" TO "anon";
GRANT ALL ON TABLE "public"."cotizaciones_activos" TO "authenticated";
GRANT ALL ON TABLE "public"."cotizaciones_activos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."cotizaciones_activos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."cotizaciones_activos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."cotizaciones_activos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."cuentas" TO "anon";
GRANT ALL ON TABLE "public"."cuentas" TO "authenticated";
GRANT ALL ON TABLE "public"."cuentas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."cuentas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."cuentas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."cuentas_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."dividendos" TO "anon";
GRANT ALL ON TABLE "public"."dividendos" TO "authenticated";
GRANT ALL ON TABLE "public"."dividendos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."dividendos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."dividendos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."dividendos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."entidades_financieras" TO "anon";
GRANT ALL ON TABLE "public"."entidades_financieras" TO "authenticated";
GRANT ALL ON TABLE "public"."entidades_financieras" TO "service_role";



GRANT ALL ON SEQUENCE "public"."entidades_financieras_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."entidades_financieras_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."entidades_financieras_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."fundamentales" TO "anon";
GRANT ALL ON TABLE "public"."fundamentales" TO "authenticated";
GRANT ALL ON TABLE "public"."fundamentales" TO "service_role";



GRANT ALL ON SEQUENCE "public"."fundamentales_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."fundamentales_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."fundamentales_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."inversiones_posiciones" TO "anon";
GRANT ALL ON TABLE "public"."inversiones_posiciones" TO "authenticated";
GRANT ALL ON TABLE "public"."inversiones_posiciones" TO "service_role";



GRANT ALL ON SEQUENCE "public"."inversiones_posiciones_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."inversiones_posiciones_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."inversiones_posiciones_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."inversiones_ventas" TO "anon";
GRANT ALL ON TABLE "public"."inversiones_ventas" TO "authenticated";
GRANT ALL ON TABLE "public"."inversiones_ventas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."inversiones_ventas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."inversiones_ventas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."inversiones_ventas_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."inversiones_ventas_lotes" TO "anon";
GRANT ALL ON TABLE "public"."inversiones_ventas_lotes" TO "authenticated";
GRANT ALL ON TABLE "public"."inversiones_ventas_lotes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."inversiones_ventas_lotes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."inversiones_ventas_lotes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."inversiones_ventas_lotes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."marcas_tarjeta" TO "anon";
GRANT ALL ON TABLE "public"."marcas_tarjeta" TO "authenticated";
GRANT ALL ON TABLE "public"."marcas_tarjeta" TO "service_role";



GRANT ALL ON SEQUENCE "public"."marcas_tarjeta_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."marcas_tarjeta_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."marcas_tarjeta_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."medios_pago" TO "anon";
GRANT ALL ON TABLE "public"."medios_pago" TO "authenticated";
GRANT ALL ON TABLE "public"."medios_pago" TO "service_role";



GRANT ALL ON SEQUENCE "public"."medios_pago_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."medios_pago_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."medios_pago_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."monedas" TO "anon";
GRANT ALL ON TABLE "public"."monedas" TO "authenticated";
GRANT ALL ON TABLE "public"."monedas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."monedas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."monedas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."monedas_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."movimientos" TO "anon";
GRANT ALL ON TABLE "public"."movimientos" TO "authenticated";
GRANT ALL ON TABLE "public"."movimientos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."movimientos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."movimientos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."movimientos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."paises" TO "anon";
GRANT ALL ON TABLE "public"."paises" TO "authenticated";
GRANT ALL ON TABLE "public"."paises" TO "service_role";



GRANT ALL ON TABLE "public"."prestamo_cuotas" TO "anon";
GRANT ALL ON TABLE "public"."prestamo_cuotas" TO "authenticated";
GRANT ALL ON TABLE "public"."prestamo_cuotas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."prestamo_cuotas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."prestamo_cuotas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."prestamo_cuotas_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."prestamos" TO "anon";
GRANT ALL ON TABLE "public"."prestamos" TO "authenticated";
GRANT ALL ON TABLE "public"."prestamos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."prestamos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."prestamos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."prestamos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."presupuestos" TO "anon";
GRANT ALL ON TABLE "public"."presupuestos" TO "authenticated";
GRANT ALL ON TABLE "public"."presupuestos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."presupuestos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."presupuestos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."presupuestos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."proveedores" TO "anon";
GRANT ALL ON TABLE "public"."proveedores" TO "authenticated";
GRANT ALL ON TABLE "public"."proveedores" TO "service_role";



GRANT ALL ON SEQUENCE "public"."proveedores_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."proveedores_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."proveedores_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."proyectos" TO "anon";
GRANT ALL ON TABLE "public"."proyectos" TO "authenticated";
GRANT ALL ON TABLE "public"."proyectos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."proyectos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."proyectos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."proyectos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ramas_actividad" TO "anon";
GRANT ALL ON TABLE "public"."ramas_actividad" TO "authenticated";
GRANT ALL ON TABLE "public"."ramas_actividad" TO "service_role";



GRANT ALL ON TABLE "public"."ratios_historicos" TO "anon";
GRANT ALL ON TABLE "public"."ratios_historicos" TO "authenticated";
GRANT ALL ON TABLE "public"."ratios_historicos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ratios_historicos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ratios_historicos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ratios_historicos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."resumenes" TO "anon";
GRANT ALL ON TABLE "public"."resumenes" TO "authenticated";
GRANT ALL ON TABLE "public"."resumenes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."resumenes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."resumenes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."resumenes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."rubros" TO "anon";
GRANT ALL ON TABLE "public"."rubros" TO "authenticated";
GRANT ALL ON TABLE "public"."rubros" TO "service_role";



GRANT ALL ON SEQUENCE "public"."rubros_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."rubros_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."rubros_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ticker_pais" TO "anon";
GRANT ALL ON TABLE "public"."ticker_pais" TO "authenticated";
GRANT ALL ON TABLE "public"."ticker_pais" TO "service_role";



GRANT ALL ON TABLE "public"."ticker_rama" TO "anon";
GRANT ALL ON TABLE "public"."ticker_rama" TO "authenticated";
GRANT ALL ON TABLE "public"."ticker_rama" TO "service_role";



GRANT ALL ON TABLE "public"."tickers_seguidos" TO "anon";
GRANT ALL ON TABLE "public"."tickers_seguidos" TO "authenticated";
GRANT ALL ON TABLE "public"."tickers_seguidos" TO "service_role";



GRANT ALL ON TABLE "public"."tipos_cambio" TO "anon";
GRANT ALL ON TABLE "public"."tipos_cambio" TO "authenticated";
GRANT ALL ON TABLE "public"."tipos_cambio" TO "service_role";



GRANT ALL ON TABLE "public"."tipos_medio_pago" TO "anon";
GRANT ALL ON TABLE "public"."tipos_medio_pago" TO "authenticated";
GRANT ALL ON TABLE "public"."tipos_medio_pago" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tipos_medio_pago_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tipos_medio_pago_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tipos_medio_pago_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."tipos_movimiento" TO "anon";
GRANT ALL ON TABLE "public"."tipos_movimiento" TO "authenticated";
GRANT ALL ON TABLE "public"."tipos_movimiento" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tipos_movimiento_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tipos_movimiento_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tipos_movimiento_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."transferencias" TO "anon";
GRANT ALL ON TABLE "public"."transferencias" TO "authenticated";
GRANT ALL ON TABLE "public"."transferencias" TO "service_role";



GRANT ALL ON SEQUENCE "public"."transferencias_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."transferencias_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."transferencias_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."vw_composicion_pais_actual" TO "anon";
GRANT ALL ON TABLE "public"."vw_composicion_pais_actual" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_composicion_pais_actual" TO "service_role";



GRANT ALL ON TABLE "public"."vw_composicion_ticker_actual" TO "anon";
GRANT ALL ON TABLE "public"."vw_composicion_ticker_actual" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_composicion_ticker_actual" TO "service_role";



GRANT ALL ON TABLE "public"."vw_cuotas_generadas" TO "anon";
GRANT ALL ON TABLE "public"."vw_cuotas_generadas" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_cuotas_generadas" TO "service_role";



GRANT ALL ON TABLE "public"."vw_deuda_futura" TO "anon";
GRANT ALL ON TABLE "public"."vw_deuda_futura" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_deuda_futura" TO "service_role";



GRANT ALL ON TABLE "public"."vw_dividendos_cartera" TO "anon";
GRANT ALL ON TABLE "public"."vw_dividendos_cartera" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_dividendos_cartera" TO "service_role";



GRANT ALL ON TABLE "public"."vw_ultima_cotizacion" TO "anon";
GRANT ALL ON TABLE "public"."vw_ultima_cotizacion" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_ultima_cotizacion" TO "service_role";



GRANT ALL ON TABLE "public"."vw_inversiones_valuacion" TO "anon";
GRANT ALL ON TABLE "public"."vw_inversiones_valuacion" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_inversiones_valuacion" TO "service_role";



GRANT ALL ON TABLE "public"."vw_exposicion_pais" TO "anon";
GRANT ALL ON TABLE "public"."vw_exposicion_pais" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_exposicion_pais" TO "service_role";



GRANT ALL ON TABLE "public"."vw_exposicion_rama" TO "anon";
GRANT ALL ON TABLE "public"."vw_exposicion_rama" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_exposicion_rama" TO "service_role";



GRANT ALL ON TABLE "public"."vw_exposicion_rama_total" TO "anon";
GRANT ALL ON TABLE "public"."vw_exposicion_rama_total" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_exposicion_rama_total" TO "service_role";



GRANT ALL ON TABLE "public"."vw_exposicion_region_total" TO "anon";
GRANT ALL ON TABLE "public"."vw_exposicion_region_total" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_exposicion_region_total" TO "service_role";



GRANT ALL ON TABLE "public"."vw_flujo" TO "anon";
GRANT ALL ON TABLE "public"."vw_flujo" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_flujo" TO "service_role";



GRANT ALL ON TABLE "public"."vw_historial_cuenta" TO "anon";
GRANT ALL ON TABLE "public"."vw_historial_cuenta" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_historial_cuenta" TO "service_role";



GRANT ALL ON TABLE "public"."vw_inversiones_resumen_cuenta" TO "anon";
GRANT ALL ON TABLE "public"."vw_inversiones_resumen_cuenta" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_inversiones_resumen_cuenta" TO "service_role";



GRANT ALL ON TABLE "public"."vw_inversiones_resumen_ticker" TO "anon";
GRANT ALL ON TABLE "public"."vw_inversiones_resumen_ticker" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_inversiones_resumen_ticker" TO "service_role";



GRANT ALL ON TABLE "public"."vw_inversiones_ventas_resumen" TO "anon";
GRANT ALL ON TABLE "public"."vw_inversiones_ventas_resumen" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_inversiones_ventas_resumen" TO "service_role";



GRANT ALL ON TABLE "public"."vw_movimientos_proyecto" TO "anon";
GRANT ALL ON TABLE "public"."vw_movimientos_proyecto" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_movimientos_proyecto" TO "service_role";



GRANT ALL ON TABLE "public"."vw_movimientos_usd" TO "anon";
GRANT ALL ON TABLE "public"."vw_movimientos_usd" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_movimientos_usd" TO "service_role";



GRANT ALL ON TABLE "public"."vw_prestamo_cuotas" TO "anon";
GRANT ALL ON TABLE "public"."vw_prestamo_cuotas" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_prestamo_cuotas" TO "service_role";



GRANT ALL ON TABLE "public"."vw_resumen_categoria" TO "anon";
GRANT ALL ON TABLE "public"."vw_resumen_categoria" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_resumen_categoria" TO "service_role";



GRANT ALL ON TABLE "public"."vw_resumen_rubros" TO "anon";
GRANT ALL ON TABLE "public"."vw_resumen_rubros" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_resumen_rubros" TO "service_role";



GRANT ALL ON TABLE "public"."vw_saldo_cuentas" TO "anon";
GRANT ALL ON TABLE "public"."vw_saldo_cuentas" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_saldo_cuentas" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







