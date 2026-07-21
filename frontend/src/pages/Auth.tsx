import { useState, FormEvent, useEffect } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isProfileReady, useAuth } from "../context/AuthContext";
import CorridorMap from "../components/CorridorMap";

type Mode = "login" | "signup";

const Auth = () => {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  const { login, signup, signInWithGoogle, user, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate(isProfileReady(profile) ? "/dashboard" : "/profile?setup=1", { replace: true });
    }
  }, [user, profile, loading, navigate]);

  const goAfterAuth = (nextProfile = profile) => {
    navigate(isProfileReady(nextProfile) ? "/dashboard" : "/profile?setup=1", { replace: true });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const nextProfile = mode === "login" ? await login(email, password) : await signup(email, password, name);
      goAfterAuth(nextProfile);
    } catch (err: any) {
      setError(friendlyError(err?.code));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleSubmitting(true);

    try {
      const nextProfile = await signInWithGoogle();
      goAfterAuth(nextProfile);
    } catch (err: any) {
      setError(friendlyError(err?.code));
    } finally {
      setGoogleSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-base text-ink">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(560px,1.05fr)]">
        <section className="relative flex items-center justify-center overflow-hidden border-b border-border bg-grid px-6 py-10 lg:border-b-0 lg:border-r">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(232,163,61,0.12),transparent_34%),linear-gradient(180deg,rgba(11,15,20,0.1),#0b0f14_78%)]" />
          <div className="relative w-full max-w-md">
            <Link to="/" className="mb-10 inline-flex items-center gap-2">
              <span className="h-2 w-2 animate-pulseDot rounded-full bg-amber" />
              <span className="font-display text-lg font-semibold tracking-tight">Aegis SCR</span>
            </Link>

            <div className="mb-7">
              <span className="font-mono text-[11px] uppercase tracking-widest text-amber">Secure operator access</span>
              <h1 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight">
                {mode === "login" ? "Welcome back to the control room." : "Create your Aegis workspace."}
              </h1>
              <p className="mt-4 text-sm leading-6 text-muted">
                Sign in to monitor geopolitical risk signals, live vessel exposure, reserve posture,
                and disruption response from a single operational dashboard.
              </p>
            </div>

            <div className="mb-6 grid grid-cols-2 rounded-md border border-border bg-surface p-1">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode("login");
                }}
                className={`rounded px-3 py-2 font-mono text-xs uppercase tracking-wider transition-colors ${
                  mode === "login" ? "bg-amber text-base" : "text-muted hover:text-ink"
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode("signup");
                }}
                className={`rounded px-3 py-2 font-mono text-xs uppercase tracking-wider transition-colors ${
                  mode === "signup" ? "bg-amber text-base" : "text-muted hover:text-ink"
                }`}
              >
                Create
              </button>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleSubmitting || submitting}
              className="flex w-full items-center justify-center gap-3 rounded-md border border-border bg-surface px-4 py-3 text-sm font-medium text-ink transition-colors hover:border-amber hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink font-display text-[13px] font-semibold text-base">
                G
              </span>
              {googleSubmitting ? "Connecting Google..." : "Continue with Google"}
            </button>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted">or use email</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <Field label="Full name" htmlFor="name">
                  <input
                    id="name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jordan Rao"
                    className="auth-input"
                  />
                </Field>
              )}

              <Field label="Email" htmlFor="email">
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="auth-input"
                />
              </Field>

              <Field label="Password" htmlFor="password">
                <input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="auth-input"
                />
              </Field>

              {error && (
                <div className="rounded-md border border-risk/40 bg-risk/10 px-3 py-2 font-mono text-xs text-risk">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || googleSubmitting}
                className="w-full rounded-md bg-amber px-4 py-3 font-mono text-sm font-semibold uppercase tracking-wider text-base transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
              </button>
            </form>
          </div>
        </section>

        <section className="relative hidden min-h-screen overflow-hidden bg-surface lg:block">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(232,163,61,0.12),transparent_28%),linear-gradient(180deg,#121924,#0b0f14)]" />
          <div className="relative flex h-full flex-col justify-between p-10">
            <div className="grid grid-cols-3 gap-3">
              {[
                ["GRIA", "Risk intelligence"],
                ["DSM", "Scenario modelling"],
                ["SROA", "Reserve response"],
              ].map(([code, label]) => (
                <div key={code} className="rounded-md border border-border bg-base/55 p-3">
                  <div className="font-mono text-[10px] text-amber">{code}</div>
                  <div className="mt-1 text-xs text-muted">{label}</div>
                </div>
              ))}
            </div>

            <div>
              <span className="font-mono text-[11px] uppercase tracking-widest text-amber">Live monitoring preview</span>
              <h2 className="mt-3 max-w-xl font-display text-3xl font-semibold leading-tight tracking-tight">
                Operational access for teams watching energy corridors in real time.
              </h2>
              <div className="mt-8 max-w-xl rounded-md border border-border bg-base/70 p-4">
                <CorridorMap />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 border-t border-border pt-6">
              <Metric value="15 min" label="news refresh" />
              <Metric value="24/7" label="corridor watch" />
              <Metric value="4" label="agent workflow" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

const Field = ({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) => (
  <div>
    <label htmlFor={htmlFor} className="mb-1.5 block font-mono text-xs uppercase tracking-wider text-muted">
      {label}
    </label>
    {children}
  </div>
);

const Metric = ({ value, label }: { value: string; label: string }) => (
  <div>
    <div className="font-display text-2xl font-semibold text-ink">{value}</div>
    <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted">{label}</div>
  </div>
);

const friendlyError = (code?: string): string => {
  switch (code) {
    case "auth/email-already-in-use":
      return "An account already exists with this email.";
    case "auth/invalid-email":
      return "That email address doesn't look right.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    case "auth/popup-closed-by-user":
      return "Google sign-in was closed before it finished.";
    case "auth/operation-not-allowed":
      return "This sign-in method is not enabled in Firebase yet.";
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
