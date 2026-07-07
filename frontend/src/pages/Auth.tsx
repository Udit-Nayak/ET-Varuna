import { useState, FormEvent, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import CorridorMap from "../components/CorridorMap";

type Mode = "login" | "signup";

const Auth = () => {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { login, signup, user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, loading, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await signup(email, password, name);
      }
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      setError(friendlyError(err?.code));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen grid-cols-1 bg-base text-ink md:grid-cols-2">
      {/* Left: form */}
      <div className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-10 flex items-center gap-2">
            <span className="h-2 w-2 animate-pulseDot rounded-full bg-amber" />
            <span className="font-display text-lg font-semibold tracking-tight">Aegis SCR</span>
          </Link>

          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {mode === "login" ? "Sign in to your dashboard" : "Create your account"}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {mode === "login"
              ? "Enter your credentials to continue."
              : "Set up access for the resilience platform."}
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {mode === "signup" && (
              <div>
                <label htmlFor="name" className="mb-1.5 block font-mono text-xs uppercase tracking-wider text-muted">
                  Full name
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jordan Rao"
                  className="w-full rounded-md border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none placeholder:text-muted/60 focus:border-amber"
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="mb-1.5 block font-mono text-xs uppercase tracking-wider text-muted">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@team.com"
                className="w-full rounded-md border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none placeholder:text-muted/60 focus:border-amber"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block font-mono text-xs uppercase tracking-wider text-muted">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-md border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none placeholder:text-muted/60 focus:border-amber"
              />
            </div>

            {error && (
              <div className="rounded-md border border-risk/40 bg-risk/10 px-3 py-2 font-mono text-xs text-risk">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full rounded-md bg-amber px-4 py-3 font-mono text-sm font-medium uppercase tracking-wider text-base transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting
                ? "Please wait…"
                : mode === "login"
                ? "Sign in"
                : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            {mode === "login" ? "New to Aegis SCR?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode(mode === "login" ? "signup" : "login");
              }}
              className="font-medium text-amber hover:underline"
            >
              {mode === "login" ? "Create an account" : "Sign in instead"}
            </button>
          </p>
        </div>
      </div>

      {/* Right: visual */}
      <div className="relative hidden items-center justify-center overflow-hidden border-l border-border bg-grid bg-grid p-12 md:flex">
        <div className="w-full max-w-md">
          <span className="font-mono text-[11px] uppercase tracking-widest text-amber">
            Live monitoring preview
          </span>
          <h2 className="mt-3 font-display text-2xl font-semibold leading-snug tracking-tight">
            Six corridors. One dashboard. Zero blind spots.
          </h2>
          <div className="mt-6">
            <CorridorMap />
          </div>
        </div>
      </div>
    </div>
  );
};

const friendlyError = (code?: string): string => {
  switch (code) {
    case "auth/email-already-in-use":
      return "An account already exists with this email.";
    case "auth/invalid-email":
      return "That email address doesn't look right.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    default:
      return "Something went wrong. Please try again.";
  }
};

export default Auth;
