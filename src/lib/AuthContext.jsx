import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = cargando, null = sin sesion

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
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
  }

  // --- CONTROL DE INACTIVIDAD (60 segundos) ---
  useEffect(() => {
    // Si no hay sesión iniciada, no activamos el contador
    if (!session) return;

    let inactivityTimer;

    const cerrarSesionPorInactividad = async () => {
      console.log("Sesión cerrada por inactividad");
      await supabase.auth.signOut();
      // hayq  hacer un modal con n alert("Tu sesión ha expirado por inactividad.");
    };

    const reiniciarContador = () => {
      // Limpiamos el temporizador
      clearTimeout(inactivityTimer);
      // empi9eza uno nuevo por 60 segundos (60000 ms)
      inactivityTimer = setTimeout(cerrarSesionPorInactividad, 60000);
    };

    // Eventos que consideraremos como "actividad" del usuario
    const eventos = ["mousemove", "keydown", "click", "scroll", "touchstart"];

    eventos.forEach((evento) => {
      window.addEventListener(evento, reiniciarContador);
    });

    // incia el temporizador al cargar con sesión
    reiniciarContador();

    // Limpieza de eventos y temporizador si se cierra sesion
    return () => {
      clearTimeout(inactivityTimer);
      eventos.forEach((evento) => {
        window.removeEventListener(evento, reiniciarContador);
      });
    };
  }, [session]);
  // --------------------------------------------

  async function signOut() {
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
