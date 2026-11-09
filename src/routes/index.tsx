
import { createFileRoute } from "@tanstack/react-router";
import { Eye, EyeOff, LockKeyhole, UserRound, ArrowRight, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { firebaseAuth, db } from "@/lib/firebase";
import type { User } from "@/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ingresar — Sani Center Horas Extras" },
      {
        name: "description",
        content: "Sistema de control de horas extras y compensaciones de Sanicenter.",
      },
    ],
  }),
  component: Login,
});

function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);


  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedUsername = username.trim().toUpperCase();

    if (!normalizedUsername || !password) {
      toast.error("Ingresa tu nombre de usuario y contraseña.");
      return;
    }

    setLoading(true);

    try {
      // Identificador técnico usado únicamente por Firebase Authentication.
      const email = `${normalizedUsername.toLowerCase()}@auth.sanicenter.invalid`;

      // Verificar credenciales.
      const credential = await signInWithEmailAndPassword(
        firebaseAuth,
        email,
        password
      );

      // Consultar el perfil vinculado al UID.
      const profileRef = doc(db, "users", credential.user.uid);
      const profileSnapshot = await getDoc(profileRef);

      if (!profileSnapshot.exists()) {
        await signOut(firebaseAuth);
        toast.error("Tu cuenta no tiene un perfil registrado.");
        return;
      }

      const profile = {
        id: credential.user.uid,
        ...profileSnapshot.data(),
      } as User;

      // Verificar que el usuario esté activo y corresponda al perfil.
      if (
        profile.active !== true ||
        profile.username !== normalizedUsername
      ) {
        await signOut(firebaseAuth);
        toast.error("Tu cuenta no está autorizada para ingresar.");
        return;
      }

      if (!["trabajador", "jefe", "admin"].includes(profile.role)) {
        await signOut(firebaseAuth);
        toast.error("Tu cuenta no tiene un rol válido.");
        return;
      }

      toast.success(`Bienvenido, ${profile.name}`);

      if (profile.role === "trabajador") {
        await navigate({ to: "/horas" });
      } else if (profile.role === "jefe") {
        await navigate({ to: "/solicitudes" });
      } else {
        await navigate({ to: "/resumen" });
      }
    } catch (error) {
      console.error("Error al iniciar sesión:", error);
      toast.error("No se pudo iniciar sesión. Verifica tus credenciales.");
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="grid min-h-screen place-items-center bg-muted px-4 py-8">
      <div className="card w-full max-w-md p-7 sm:p-8">
        <div className="mb-8 flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Logotipo de Sanicenter"
            className="h-14 w-14 shrink-0 rounded-xl object-cover"
          />

          <div>
            <h1 className="text-lg font-bold tracking-tight">
              Sani Center<span className="text-primary"> Horas Extras</span>
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Control de horas extras y compensaciones
            </p>
          </div>
        </div>

        <div className="mb-7">
          <h2 className="text-xl font-semibold tracking-tight">
            Bienvenido
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ingresa tus credenciales para acceder al sistema.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">

          <div>
            <label htmlFor="username" className="field-label">
              Nombre de usuario
            </label>
            <div className="relative mt-1.5">
              <UserRound
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                placeholder="Ejemplo: JBERNALES"
                value={username}
                onChange={(event) =>
                  setUsername(event.target.value.toUpperCase().replace(/\s/g, ""))
                }
                required
                className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="field-label">
              Contraseña
            </label>
            <div className="relative mt-1.5">
              <LockKeyhole
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Ingresa tu contraseña"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-11 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
              <button
                type="button"
                onClick={() => setShowPassword((previous) => !previous)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-primary"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary flex w-full items-center justify-center gap-2 py-3 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Verificando..." : "Iniciar sesión"}
            {!loading && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-center gap-2 border-t border-border pt-5 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Acceso exclusivo para personal autorizado
        </div>
      </div>
    </div>
  );
}
