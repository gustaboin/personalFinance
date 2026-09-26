--
-- PostgreSQL database dump
--

\restrict P1AHfGBx9c6aB1W4LcJ0hUcwlSKTDaGB6nQw9lSyVpa7x4uMcqjWjrurjqrS7Ni

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: movimientos_proyecto(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.movimientos_proyecto(p_proyecto_id integer) RETURNS TABLE(fecha date, concepto text, importe numeric, rubro text, proveedor text, origen text)
    LANGUAGE sql
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


--
-- Name: movimientos_tarjeta(character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.movimientos_tarjeta(p_periodo character varying, p_mediopago integer) RETURNS TABLE(fecha date, concepto text, importe numeric)
    LANGUAGE sql
    AS $$
    SELECT
        m.fecha,
        m.concepto,
        m.importe
    FROM movimientos m
    WHERE m.medio_pago_id = p_mediopago
      AND to_char(m.fecha, 'YYYYMM') = p_periodo

    UNION ALL

    SELECT
        c.fecha_cuota,
        c.concepto,
        c.importe
    FROM vw_cuotas_generadas c
    WHERE c.medio_pago_id = p_mediopago
      AND c.mes_periodo = p_periodo

    ORDER BY fecha;
$$;


--
-- Name: resumen_proyecto(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resumen_proyecto(p_proyecto_id integer) RETURNS TABLE(presupuesto numeric, gastado numeric, comprometido numeric, total_proyectado numeric, disponible numeric, porcentaje numeric, cuotas_pendientes bigint)
    LANGUAGE sql
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


--
-- Name: resumen_proyecto_evolucion(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resumen_proyecto_evolucion(p_proyecto_id integer) RETURNS TABLE(mes date, total numeric)
    LANGUAGE sql
    AS $$
    SELECT date_trunc('month', mp.fecha)::date AS mes, SUM(mp.importe) AS total
    FROM movimientos_proyecto(p_proyecto_id) mp
    GROUP BY mes
    ORDER BY mes;
$$;


--
-- Name: resumen_proyecto_proveedor(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resumen_proyecto_proveedor(p_proyecto_id integer) RETURNS TABLE(proveedor text, total numeric)
    LANGUAGE sql
    AS $$
    SELECT COALESCE(proveedor, 'Sin proveedor'), SUM(importe)
    FROM vw_movimientos_proyecto
    WHERE id_proyecto = p_proyecto_id
    GROUP BY proveedor
    ORDER BY 2 DESC;
$$;


--
-- Name: resumen_proyecto_rubro(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resumen_proyecto_rubro(p_proyecto_id integer) RETURNS TABLE(rubro text, total numeric)
    LANGUAGE sql
    AS $$
    SELECT COALESCE(rubro, 'Sin rubro'), SUM(importe)
    FROM vw_movimientos_proyecto
    WHERE id_proyecto = p_proyecto_id
    GROUP BY rubro
    ORDER BY 2 DESC;
$$;


--
-- Name: total_tarjeta(character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.total_tarjeta(p_periodo character varying, p_mediopago integer) RETURNS numeric
    LANGUAGE sql
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


--
-- Name: total_tarjeta(character varying, integer, character); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.total_tarjeta(p_periodo character varying, p_mediopago integer, p_tipo character) RETURNS numeric
    LANGUAGE sql
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
    ) AS tarjeta
    WHERE
        p_tipo IS NULL
        OR p_tipo = 'T'
        OR (p_tipo = 'B' AND importe < 0)
        OR (p_tipo = 'G' AND importe > 0);
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: categorias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categorias (
    id integer NOT NULL,
    nombre text NOT NULL,
    tipo_id integer NOT NULL,
    id_rubro smallint
);


--
-- Name: categorias_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.categorias_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: categorias_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.categorias_id_seq OWNED BY public.categorias.id;


--
-- Name: compras_cuotas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compras_cuotas (
    id integer NOT NULL,
    fecha_compra date NOT NULL,
    comercio text NOT NULL,
    categoria_id integer NOT NULL,
    medio_pago_id integer NOT NULL,
    moneda character(3) DEFAULT 'ARS'::bpchar NOT NULL,
    monto_total numeric(14,2) NOT NULL,
    cantidad_cuotas integer NOT NULL,
    notas text,
    id_proyecto integer,
    id_proveedor integer,
    CONSTRAINT compras_cuotas_cantidad_cuotas_check CHECK ((cantidad_cuotas > 0))
);


--
-- Name: compras_cuotas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.compras_cuotas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: compras_cuotas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.compras_cuotas_id_seq OWNED BY public.compras_cuotas.id;


--
-- Name: entidades_financieras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entidades_financieras (
    id integer NOT NULL,
    nombre text NOT NULL
);


--
-- Name: entidades_financieras_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.entidades_financieras_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: entidades_financieras_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.entidades_financieras_id_seq OWNED BY public.entidades_financieras.id;


--
-- Name: marcas_tarjeta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marcas_tarjeta (
    id integer NOT NULL,
    nombre text NOT NULL
);


--
-- Name: marcas_tarjeta_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.marcas_tarjeta_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: marcas_tarjeta_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.marcas_tarjeta_id_seq OWNED BY public.marcas_tarjeta.id;


--
-- Name: medios_pago; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medios_pago (
    id integer NOT NULL,
    nombre text NOT NULL,
    tipo_id integer NOT NULL,
    entidad_id integer,
    marca_id integer
);


--
-- Name: medios_pago_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.medios_pago_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: medios_pago_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.medios_pago_id_seq OWNED BY public.medios_pago.id;


--
-- Name: movimientos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.movimientos (
    id integer NOT NULL,
    fecha date NOT NULL,
    categoria_id integer NOT NULL,
    medio_pago_id integer NOT NULL,
    concepto text,
    moneda character(3) DEFAULT 'ARS'::bpchar NOT NULL,
    importe numeric(14,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id_proveedor smallint,
    id_proyecto integer,
    reportable boolean DEFAULT true
);


--
-- Name: movimientos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.movimientos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: movimientos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.movimientos_id_seq OWNED BY public.movimientos.id;


--
-- Name: prestamo_cuotas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prestamo_cuotas (
    id integer NOT NULL,
    id_prestamo integer NOT NULL,
    nro_cuota integer NOT NULL,
    fecha date,
    capital numeric,
    interes numeric,
    comisiones numeric,
    seguros numeric,
    iva numeric,
    mora numeric,
    punitorios numeric,
    importe_uva numeric,
    saldo_uva numeric,
    valor_uva numeric,
    monto_ars numeric,
    inflacion_pct numeric,
    id_movimiento integer
);


--
-- Name: prestamo_cuotas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prestamo_cuotas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prestamo_cuotas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prestamo_cuotas_id_seq OWNED BY public.prestamo_cuotas.id;


--
-- Name: prestamos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prestamos (
    id integer NOT NULL,
    nombre character varying(100) NOT NULL,
    entidad integer,
    moneda_indexacion character varying(10) DEFAULT 'UVA'::character varying,
    cuotas_totales integer NOT NULL,
    fecha_inicio date,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: prestamos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prestamos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prestamos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prestamos_id_seq OWNED BY public.prestamos.id;


--
-- Name: presupuestos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.presupuestos (
    id integer NOT NULL,
    categoria_id integer NOT NULL,
    monto_objetivo numeric(14,2) NOT NULL,
    moneda character(3) DEFAULT 'ARS'::bpchar NOT NULL,
    vigente_desde character(6) NOT NULL
);


--
-- Name: presupuestos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.presupuestos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: presupuestos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.presupuestos_id_seq OWNED BY public.presupuestos.id;


--
-- Name: proveedores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proveedores (
    id integer NOT NULL,
    nombre character varying(100) NOT NULL,
    cuit character varying(11),
    direccion character varying(100),
    localidad character varying(100),
    contacto character varying(100),
    telefono character varying(50),
    observaciones character varying(255),
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: proveedores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.proveedores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: proveedores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.proveedores_id_seq OWNED BY public.proveedores.id;


--
-- Name: proyectos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proyectos (
    id integer NOT NULL,
    nombre character varying(100) NOT NULL,
    fecha_inicio date,
    fecha_fin date,
    presupuesto numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    estado character varying(20) DEFAULT 'ACTIVO'::character varying NOT NULL,
    descripcion text,
    CONSTRAINT proyectos_estado_check CHECK (((estado)::text = ANY ((ARRAY['ACTIVO'::character varying, 'PAUSADO'::character varying, 'FINALIZADO'::character varying])::text[])))
);


--
-- Name: proyectos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.proyectos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: proyectos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.proyectos_id_seq OWNED BY public.proyectos.id;


--
-- Name: rubros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rubros (
    id smallint NOT NULL,
    nombre character varying(100) NOT NULL
);


--
-- Name: rubros_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.rubros ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.rubros_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: tipos_cambio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tipos_cambio (
    mes_periodo character(6) NOT NULL,
    valor numeric(12,2) NOT NULL
);


--
-- Name: tipos_medio_pago; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tipos_medio_pago (
    id integer NOT NULL,
    nombre text NOT NULL
);


--
-- Name: tipos_medio_pago_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tipos_medio_pago_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tipos_medio_pago_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tipos_medio_pago_id_seq OWNED BY public.tipos_medio_pago.id;


--
-- Name: tipos_movimiento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tipos_movimiento (
    id integer NOT NULL,
    nombre text NOT NULL
);


--
-- Name: tipos_movimiento_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tipos_movimiento_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tipos_movimiento_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tipos_movimiento_id_seq OWNED BY public.tipos_movimiento.id;


--
-- Name: vw_cuotas_generadas; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_cuotas_generadas AS
 SELECT cc.id AS compra_id,
    n.n AS nro_cuota,
    ((cc.fecha_compra + (((n.n - 1) || ' months'::text))::interval))::date AS fecha_cuota,
    to_char((cc.fecha_compra + (((n.n - 1) || ' months'::text))::interval), 'YYYYMM'::text) AS mes_periodo,
    cc.categoria_id,
    cc.medio_pago_id,
    cc.moneda,
    round((cc.monto_total / (cc.cantidad_cuotas)::numeric), 2) AS importe,
    ((((cc.comercio || ' - cuota '::text) || n.n) || '/'::text) || cc.cantidad_cuotas) AS concepto,
    cc.id_proyecto
   FROM (public.compras_cuotas cc
     CROSS JOIN LATERAL generate_series(1, cc.cantidad_cuotas) n(n));


--
-- Name: vw_deuda_futura; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_deuda_futura WITH (security_invoker='on') AS
 SELECT mes_periodo,
    sum(importe) AS importe
   FROM public.vw_cuotas_generadas
  GROUP BY mes_periodo;


--
-- Name: vw_flujo; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_flujo AS
 SELECT movimientos.fecha,
    to_char((movimientos.fecha)::timestamp with time zone, 'YYYYMM'::text) AS mes_periodo,
    movimientos.categoria_id,
    movimientos.medio_pago_id,
    movimientos.moneda,
    movimientos.importe,
    movimientos.concepto,
    movimientos.id_proyecto
   FROM public.movimientos
  WHERE (movimientos.reportable = true)
UNION ALL
 SELECT vw_cuotas_generadas.fecha_cuota AS fecha,
    vw_cuotas_generadas.mes_periodo,
    vw_cuotas_generadas.categoria_id,
    vw_cuotas_generadas.medio_pago_id,
    vw_cuotas_generadas.moneda,
    vw_cuotas_generadas.importe,
    vw_cuotas_generadas.concepto,
    vw_cuotas_generadas.id_proyecto
   FROM public.vw_cuotas_generadas;


--
-- Name: vw_movimientos_proyecto; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_movimientos_proyecto AS
 SELECT m.id_proyecto,
    m.fecha,
    m.concepto,
    m.importe,
    r.nombre AS rubro,
    pv.nombre AS proveedor,
    'MOVIMIENTO'::text AS origen
   FROM (((public.movimientos m
     LEFT JOIN public.categorias c ON ((c.id = m.categoria_id)))
     LEFT JOIN public.rubros r ON ((r.id = c.id_rubro)))
     LEFT JOIN public.proveedores pv ON ((pv.id = m.id_proveedor)))
  WHERE (m.id_proyecto IS NOT NULL)
UNION ALL
 SELECT cc.id_proyecto,
    vc.fecha_cuota AS fecha,
    vc.concepto,
    vc.importe,
    r.nombre AS rubro,
    pv.nombre AS proveedor,
    'CUOTA'::text AS origen
   FROM ((((public.vw_cuotas_generadas vc
     JOIN public.compras_cuotas cc ON ((cc.id = vc.compra_id)))
     LEFT JOIN public.categorias c ON ((c.id = cc.categoria_id)))
     LEFT JOIN public.rubros r ON ((r.id = c.id_rubro)))
     LEFT JOIN public.proveedores pv ON ((pv.id = cc.id_proveedor)))
  WHERE (cc.id_proyecto IS NOT NULL);


--
-- Name: vw_prestamo_cuotas; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_prestamo_cuotas AS
 SELECT id,
    id_prestamo,
    nro_cuota,
    fecha,
    capital,
    interes,
    comisiones,
    seguros,
    iva,
    mora,
    punitorios,
    importe_uva,
    saldo_uva,
    valor_uva,
    monto_ars,
    inflacion_pct,
    id_movimiento,
    round((((valor_uva - lag(valor_uva) OVER w) / NULLIF(lag(valor_uva) OVER w, (0)::numeric)) * (100)::numeric), 2) AS incremento_valor_uva_pct,
    round((((monto_ars - lag(monto_ars) OVER w) / NULLIF(lag(monto_ars) OVER w, (0)::numeric)) * (100)::numeric), 2) AS incremento_monto_ars_pct
   FROM public.prestamo_cuotas pc
  WINDOW w AS (PARTITION BY id_prestamo ORDER BY nro_cuota);


--
-- Name: vw_resumen_categoria; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_resumen_categoria AS
 SELECT f.mes_periodo,
    c.id AS categoria_id,
    c.nombre AS categoria,
    tm.nombre AS tipo,
    sum(
        CASE
            WHEN (f.moneda = 'USD'::bpchar) THEN (f.importe * COALESCE(tc.valor, (1)::numeric))
            ELSE f.importe
        END) AS total_ars,
    (f.id_proyecto IS NOT NULL) AS es_proyecto
   FROM (((public.vw_flujo f
     JOIN public.categorias c ON ((c.id = f.categoria_id)))
     JOIN public.tipos_movimiento tm ON ((tm.id = c.tipo_id)))
     LEFT JOIN public.tipos_cambio tc ON (((tc.mes_periodo)::text = f.mes_periodo)))
  GROUP BY f.mes_periodo, c.id, c.nombre, tm.nombre, (f.id_proyecto IS NOT NULL);


--
-- Name: categorias id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias ALTER COLUMN id SET DEFAULT nextval('public.categorias_id_seq'::regclass);


--
-- Name: compras_cuotas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compras_cuotas ALTER COLUMN id SET DEFAULT nextval('public.compras_cuotas_id_seq'::regclass);


--
-- Name: entidades_financieras id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entidades_financieras ALTER COLUMN id SET DEFAULT nextval('public.entidades_financieras_id_seq'::regclass);


--
-- Name: marcas_tarjeta id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marcas_tarjeta ALTER COLUMN id SET DEFAULT nextval('public.marcas_tarjeta_id_seq'::regclass);


--
-- Name: medios_pago id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medios_pago ALTER COLUMN id SET DEFAULT nextval('public.medios_pago_id_seq'::regclass);


--
-- Name: movimientos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos ALTER COLUMN id SET DEFAULT nextval('public.movimientos_id_seq'::regclass);


--
-- Name: prestamo_cuotas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestamo_cuotas ALTER COLUMN id SET DEFAULT nextval('public.prestamo_cuotas_id_seq'::regclass);


--
-- Name: prestamos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestamos ALTER COLUMN id SET DEFAULT nextval('public.prestamos_id_seq'::regclass);


--
-- Name: presupuestos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.presupuestos ALTER COLUMN id SET DEFAULT nextval('public.presupuestos_id_seq'::regclass);


--
-- Name: proveedores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedores ALTER COLUMN id SET DEFAULT nextval('public.proveedores_id_seq'::regclass);


--
-- Name: proyectos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proyectos ALTER COLUMN id SET DEFAULT nextval('public.proyectos_id_seq'::regclass);


--
-- Name: tipos_medio_pago id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_medio_pago ALTER COLUMN id SET DEFAULT nextval('public.tipos_medio_pago_id_seq'::regclass);


--
-- Name: tipos_movimiento id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_movimiento ALTER COLUMN id SET DEFAULT nextval('public.tipos_movimiento_id_seq'::regclass);


--
-- Name: categorias categorias_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_nombre_key UNIQUE (nombre);


--
-- Name: categorias categorias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_pkey PRIMARY KEY (id);


--
-- Name: compras_cuotas compras_cuotas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compras_cuotas
    ADD CONSTRAINT compras_cuotas_pkey PRIMARY KEY (id);


--
-- Name: entidades_financieras entidades_financieras_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entidades_financieras
    ADD CONSTRAINT entidades_financieras_nombre_key UNIQUE (nombre);


--
-- Name: entidades_financieras entidades_financieras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entidades_financieras
    ADD CONSTRAINT entidades_financieras_pkey PRIMARY KEY (id);


--
-- Name: marcas_tarjeta marcas_tarjeta_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marcas_tarjeta
    ADD CONSTRAINT marcas_tarjeta_nombre_key UNIQUE (nombre);


--
-- Name: marcas_tarjeta marcas_tarjeta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marcas_tarjeta
    ADD CONSTRAINT marcas_tarjeta_pkey PRIMARY KEY (id);


--
-- Name: medios_pago medios_pago_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medios_pago
    ADD CONSTRAINT medios_pago_pkey PRIMARY KEY (id);


--
-- Name: medios_pago medios_pago_tipo_id_entidad_id_marca_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medios_pago
    ADD CONSTRAINT medios_pago_tipo_id_entidad_id_marca_id_key UNIQUE (tipo_id, entidad_id, marca_id);


--
-- Name: movimientos movimientos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos
    ADD CONSTRAINT movimientos_pkey PRIMARY KEY (id);


--
-- Name: prestamo_cuotas prestamo_cuotas_id_prestamo_nro_cuota_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestamo_cuotas
    ADD CONSTRAINT prestamo_cuotas_id_prestamo_nro_cuota_key UNIQUE (id_prestamo, nro_cuota);


--
-- Name: prestamo_cuotas prestamo_cuotas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestamo_cuotas
    ADD CONSTRAINT prestamo_cuotas_pkey PRIMARY KEY (id);


--
-- Name: prestamos prestamos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestamos
    ADD CONSTRAINT prestamos_pkey PRIMARY KEY (id);


--
-- Name: presupuestos presupuestos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.presupuestos
    ADD CONSTRAINT presupuestos_pkey PRIMARY KEY (id);


--
-- Name: proveedores proveedores_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedores
    ADD CONSTRAINT proveedores_nombre_key UNIQUE (nombre);


--
-- Name: proveedores proveedores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedores
    ADD CONSTRAINT proveedores_pkey PRIMARY KEY (id);


--
-- Name: proyectos proyectos_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proyectos
    ADD CONSTRAINT proyectos_nombre_key UNIQUE (nombre);


--
-- Name: proyectos proyectos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proyectos
    ADD CONSTRAINT proyectos_pkey PRIMARY KEY (id);


--
-- Name: rubros rubros_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubros
    ADD CONSTRAINT rubros_nombre_key UNIQUE (nombre);


--
-- Name: rubros rubros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rubros
    ADD CONSTRAINT rubros_pkey PRIMARY KEY (id);


--
-- Name: tipos_cambio tipos_cambio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_cambio
    ADD CONSTRAINT tipos_cambio_pkey PRIMARY KEY (mes_periodo);


--
-- Name: tipos_medio_pago tipos_medio_pago_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_medio_pago
    ADD CONSTRAINT tipos_medio_pago_nombre_key UNIQUE (nombre);


--
-- Name: tipos_medio_pago tipos_medio_pago_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_medio_pago
    ADD CONSTRAINT tipos_medio_pago_pkey PRIMARY KEY (id);


--
-- Name: tipos_movimiento tipos_movimiento_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_movimiento
    ADD CONSTRAINT tipos_movimiento_nombre_key UNIQUE (nombre);


--
-- Name: tipos_movimiento tipos_movimiento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_movimiento
    ADD CONSTRAINT tipos_movimiento_pkey PRIMARY KEY (id);


--
-- Name: idx_compras_cuotas_proyecto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compras_cuotas_proyecto ON public.compras_cuotas USING btree (id_proyecto);


--
-- Name: idx_movimientos_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movimientos_fecha ON public.movimientos USING btree (fecha);


--
-- Name: idx_movimientos_proyecto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movimientos_proyecto ON public.movimientos USING btree (id_proyecto);


--
-- Name: categorias categorias_tipo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_tipo_id_fkey FOREIGN KEY (tipo_id) REFERENCES public.tipos_movimiento(id);


--
-- Name: compras_cuotas compras_cuotas_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compras_cuotas
    ADD CONSTRAINT compras_cuotas_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(id);


--
-- Name: compras_cuotas compras_cuotas_id_proveedor_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compras_cuotas
    ADD CONSTRAINT compras_cuotas_id_proveedor_fkey FOREIGN KEY (id_proveedor) REFERENCES public.proveedores(id);


--
-- Name: compras_cuotas compras_cuotas_medio_pago_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compras_cuotas
    ADD CONSTRAINT compras_cuotas_medio_pago_id_fkey FOREIGN KEY (medio_pago_id) REFERENCES public.medios_pago(id);


--
-- Name: compras_cuotas compras_cuotas_proyecto_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compras_cuotas
    ADD CONSTRAINT compras_cuotas_proyecto_fk FOREIGN KEY (id_proyecto) REFERENCES public.proyectos(id) ON DELETE SET NULL;


--
-- Name: categorias fk_categorias_rubros; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT fk_categorias_rubros FOREIGN KEY (id_rubro) REFERENCES public.rubros(id);


--
-- Name: prestamos fk_entidad_prestamos; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestamos
    ADD CONSTRAINT fk_entidad_prestamos FOREIGN KEY (entidad) REFERENCES public.entidades_financieras(id);


--
-- Name: movimientos fk_mov_proveedores; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos
    ADD CONSTRAINT fk_mov_proveedores FOREIGN KEY (id_proveedor) REFERENCES public.proveedores(id);


--
-- Name: medios_pago medios_pago_entidad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medios_pago
    ADD CONSTRAINT medios_pago_entidad_id_fkey FOREIGN KEY (entidad_id) REFERENCES public.entidades_financieras(id);


--
-- Name: medios_pago medios_pago_marca_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medios_pago
    ADD CONSTRAINT medios_pago_marca_id_fkey FOREIGN KEY (marca_id) REFERENCES public.marcas_tarjeta(id);


--
-- Name: medios_pago medios_pago_tipo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medios_pago
    ADD CONSTRAINT medios_pago_tipo_id_fkey FOREIGN KEY (tipo_id) REFERENCES public.tipos_medio_pago(id);


--
-- Name: movimientos movimientos_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos
    ADD CONSTRAINT movimientos_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(id);


--
-- Name: movimientos movimientos_medio_pago_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos
    ADD CONSTRAINT movimientos_medio_pago_id_fkey FOREIGN KEY (medio_pago_id) REFERENCES public.medios_pago(id);


--
-- Name: movimientos movimientos_proyecto_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos
    ADD CONSTRAINT movimientos_proyecto_fk FOREIGN KEY (id_proyecto) REFERENCES public.proyectos(id) ON DELETE SET NULL;


--
-- Name: prestamo_cuotas prestamo_cuotas_id_movimiento_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestamo_cuotas
    ADD CONSTRAINT prestamo_cuotas_id_movimiento_fkey FOREIGN KEY (id_movimiento) REFERENCES public.movimientos(id);


--
-- Name: prestamo_cuotas prestamo_cuotas_id_prestamo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestamo_cuotas
    ADD CONSTRAINT prestamo_cuotas_id_prestamo_fkey FOREIGN KEY (id_prestamo) REFERENCES public.prestamos(id) ON DELETE CASCADE;


--
-- Name: presupuestos presupuestos_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.presupuestos
    ADD CONSTRAINT presupuestos_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(id);


--
-- Name: proyectos Permitir lectura proyectos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir lectura proyectos" ON public.proyectos FOR SELECT USING (true);


--
-- Name: categorias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;

--
-- Name: compras_cuotas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.compras_cuotas ENABLE ROW LEVEL SECURITY;

--
-- Name: entidades_financieras; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entidades_financieras ENABLE ROW LEVEL SECURITY;

--
-- Name: marcas_tarjeta; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marcas_tarjeta ENABLE ROW LEVEL SECURITY;

--
-- Name: medios_pago; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.medios_pago ENABLE ROW LEVEL SECURITY;

--
-- Name: movimientos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.movimientos ENABLE ROW LEVEL SECURITY;

--
-- Name: presupuestos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.presupuestos ENABLE ROW LEVEL SECURITY;

--
-- Name: proveedores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;

--
-- Name: proyectos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.proyectos ENABLE ROW LEVEL SECURITY;

--
-- Name: rubros; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rubros ENABLE ROW LEVEL SECURITY;

--
-- Name: categorias solo_autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solo_autenticados ON public.categorias USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: compras_cuotas solo_autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solo_autenticados ON public.compras_cuotas USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: entidades_financieras solo_autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solo_autenticados ON public.entidades_financieras USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: marcas_tarjeta solo_autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solo_autenticados ON public.marcas_tarjeta USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: medios_pago solo_autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solo_autenticados ON public.medios_pago USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: movimientos solo_autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solo_autenticados ON public.movimientos USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: presupuestos solo_autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solo_autenticados ON public.presupuestos USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: tipos_cambio solo_autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solo_autenticados ON public.tipos_cambio USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: tipos_medio_pago solo_autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solo_autenticados ON public.tipos_medio_pago USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: tipos_movimiento solo_autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solo_autenticados ON public.tipos_movimiento USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: tipos_cambio; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tipos_cambio ENABLE ROW LEVEL SECURITY;

--
-- Name: tipos_medio_pago; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tipos_medio_pago ENABLE ROW LEVEL SECURITY;

--
-- Name: tipos_movimiento; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tipos_movimiento ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict P1AHfGBx9c6aB1W4LcJ0hUcwlSKTDaGB6nQw9lSyVpa7x4uMcqjWjrurjqrS7Ni

