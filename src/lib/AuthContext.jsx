import { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

const AuthContext = createContext(null);

const LIMITE_INACTIVIDAD_MS = 120000; // 2 minutos
const CLAVE_ULTIMA_ACTIVIDAD = "ultima_actividad";
const DEBUG_INACTIVIDAD = true; // ponelo en true para ver en consola qué evento reinicia el contador

function leerUltimaActividad() {
  try {
    return Number(localStorage.getItem(CLAVE_ULTIMA_ACTIVIDAD)) || 0;
  } catch {
    return 0;
  }
}
function borrarUltimaActividad() {
  try {
    localStorage.removeItem(CLAVE_ULTIMA_ACTIVIDAD);
  } catch {
    /* nada */
  }
}
function guardarUltimaActividad(ts) {
  try {
    localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD, String(ts));
  } catch {
    /* sin storage: solo vale la memoria */
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = cargando, null = sin sesion
  const ultimaActividad = useRef(Date.now());
  const ultimoEvento = useRef("inicio");

  useEffect(() => {
    // Solo al ABRIR la app con una sesión ya guardada: si pasó el límite desde la
    // última actividad registrada, no te deja entrar (cubre cerrar la pestaña y volver tarde).
    supabase.auth.getSession().then(async ({ data }) => {
      const ts = leerUltimaActividad();
      if (data.session && ts && Date.now() - ts > LIMITE_INACTIVIDAD_MS) {
        await supabase.auth.signOut();
        borrarUltimaActividad();
        setSession(null);
        return;
      }
      setSession(data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (DEBUG_INACTIVIDAD)
          console.log(
            "[auth] evento:",
            _event,
            new Date().toLocaleTimeString(),
          );
        setSession(newSession);
      },
    );
    return () => listener.subscription.unsubscribe();
  }, []);

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    guardarUltimaActividad(Date.now()); // sesión nueva: arranca con la actividad al día
  }

  // --- CONTROL DE INACTIVIDAD ---
  // Depende de "hay sesión" (booleano) y no del objeto session: Supabase emite un
  // objeto nuevo al renovar el token o al volver a la pestaña, y eso reiniciaba el contador.
  const haySesion = !!session;

  useEffect(() => {
    if (!haySesion) return;

    ultimaActividad.current = Date.now();
    guardarUltimaActividad(ultimaActividad.current);

    const cerrarSiCorresponde = async () => {
      if (Date.now() - ultimaActividad.current >= LIMITE_INACTIVIDAD_MS) {
        console.log(
          `[inactividad] CIERRE: sin actividad hace ${Math.round((Date.now() - ultimaActividad.current) / 1000)}s, último evento: ${ultimoEvento.current}`,
        );
        borrarUltimaActividad();
        await supabase.auth.signOut();
        // TODO: modal "Tu sesión expiró por inactividad" en vez de alert
      }
    };

    let ultimoLog = 0;
    const registrarActividad = (e) => {
      const ahora = Date.now();
      ultimaActividad.current = ahora;
      ultimoEvento.current = e.type;
      // se guarda como mucho una vez por segundo (mousemove dispara cientos de veces)
      if (ahora - ultimoLog > 1000) {
        guardarUltimaActividad(ahora);
        if (DEBUG_INACTIVIDAD)
          console.log(
            "[inactividad] actividad:",
            e.type,
            new Date().toLocaleTimeString(),
          );
        ultimoLog = ahora;
      }
    };

    // Al volver a la pestaña (o al despertar el celular) se revisa al instante
    const alVolver = () => {
      if (document.visibilityState === "visible") cerrarSiCorresponde();
    };

    const eventos = [
      "mousemove",
      "keydown",
      "click",
      "scroll",
      "touchstart",
      "wheel",
    ];
    eventos.forEach((ev) =>
      window.addEventListener(ev, registrarActividad, {
        passive: true,
        capture: true,
      }),
    );
    document.addEventListener("visibilitychange", alVolver);

    // Revisión cada 5 segundos (no depende de que un timeout largo sobreviva en segundo plano)
    const intervalo = setInterval(cerrarSiCorresponde, 5000);

    return () => {
      clearInterval(intervalo);
      eventos.forEach((ev) =>
        window.removeEventListener(ev, registrarActividad, { capture: true }),
      );
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [haySesion]);
  // --------------------------------------------

  async function signOut() {
    borrarUltimaActividad();
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{ session, signIn, signOut, loading: session === undefined }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
