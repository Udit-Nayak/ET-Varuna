import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import CorridorMap from "../components/CorridorMap";

const agents = [
  {
    code: "GRIA",
    name: "Geopolitical Risk Intelligence",
    desc: "Ingests news, AIS vessel data, sanctions, and prices into a live disruption score per corridor.",
  },
  {
    code: "DSM",
    name: "Disruption Scenario Modeller",
    desc: "Simulates closures, chokepoints, and supply interruptions to project downstream impact.",
  },
  {
    code: "APO",
    name: "Adaptive Procurement Orchestrator",
    desc: "Ranks alternate sourcing routes by cost, risk, and time-to-delivery when a corridor fails.",
  },
  {
    code: "SROA",
    name: "Strategic Reserve Optimiser",
    desc: "Models optimal SPR drawdown against supply gaps without breaching the safety floor.",
  },
  {
    code: "SCDT",
    name: "Supply Chain Digital Twin",
    desc: "A persistent geospatial simulation of the network for continuous what-if analysis.",
  },
  {
    code: "TFM",
    name: "Transaction Flow Monitor",
    desc: "Tracks live fuel transactions in and out of the country to verify recommendations worked.",
  },
];

const stats = [
  { value: "88%", label: "of crude oil is imported" },
  { value: "9.5 days", label: "of strategic reserve cover" },
  { value: "15 min", label: "scheduled intelligence refresh" },
];

const Landing = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-base text-ink">
      <header className="sticky top-0 z-10 border-b border-border bg-base/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulseDot rounded-full bg-amber" />
            <span className="font-display text-lg font-semibold tracking-tight">Varuna</span>
          </div>
          <Link
            to="/auth"
            className="rounded-md border border-border px-4 py-2 font-mono text-xs uppercase tracking-wider text-ink transition-colors hover:border-amber hover:text-amber"
          >
            Sign in
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-border bg-grid bg-fixed">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:grid-cols-2 md:items-center md:py-28">
          <div>
            <span className="mb-5 inline-block rounded-full border border-border px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-amber">
              Energy Corridor Intelligence | Supply Security | Geopolitical Risk
            </span>
            <h1 className="font-display text-4xl font-semibold leading-[1.1] tracking-tight md:text-5xl">
              India-facing energy corridors need faster decisions.
              <span className="text-amber"> Varuna gives operators the signal.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted">
              Varuna fuses news, vessel movement, reserve posture, and procurement logic so teams
              can understand disruption early and respond before corridor risk becomes supply stress.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                to="/auth"
                className="rounded-md bg-amber px-6 py-3 font-mono text-sm font-medium uppercase tracking-wider text-base transition-transform hover:scale-[1.02]"
              >
                Get started
              </Link>
              <a
                href="#agents"
                className="font-mono text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
              >
                See the six agents
              </a>
            </div>

            <div className="mt-12 grid grid-cols-3 gap-6 border-t border-border pt-6">
              {stats.map((s) => (
                <div key={s.label}>
                  <div className="font-display text-2xl font-semibold text-ink">{s.value}</div>
                  <div className="mt-1 font-mono text-[11px] leading-snug text-muted">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          <CorridorMap />
        </div>
      </section>

      <section id="agents" className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-10 max-w-2xl">
          <span className="font-mono text-[11px] uppercase tracking-widest text-amber">
            The system
          </span>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight">
            Six agents, one response pipeline
          </h2>
          <p className="mt-3 text-muted">
            Each agent owns one stage, from detecting a risk signal to shaping a response that
            operators can test against corridor and reserve conditions.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((a, i) => (
            <div
              key={a.code}
              className="group rounded-lg border border-border bg-surface p-5 transition-colors hover:border-amber/50"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
                <span className="rounded border border-border px-2 py-0.5 font-mono text-[10px] tracking-wider text-amber">
                  {a.code}
                </span>
              </div>
              <h3 className="font-display text-base font-semibold text-ink">{a.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{a.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 py-14 md:flex-row md:items-center">
          <div>
            <h3 className="font-display text-2xl font-semibold tracking-tight">
              Built for operational energy resilience.
            </h3>
            <p className="mt-2 text-muted">Sign in to reach your team's dashboard.</p>
          </div>
          <Link
            to="/auth"
            className="rounded-md bg-amber px-6 py-3 font-mono text-sm font-medium uppercase tracking-wider text-base transition-transform hover:scale-[1.02]"
          >
            Enter the platform
          </Link>
        </div>
      </section>
    </div>
  );
};

export default Landing;
