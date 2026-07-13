import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ModuleCard from "../components/ModuleCard";
import { ModuleMeta } from "../types";
import { Link } from "react-router-dom"; // add to imports at top

const modules: ModuleMeta[] = [
  {
    code: "GRIA",
    name: "Geopolitical Risk Intelligence Agent",
    description:
      "Multi-source risk scoring per corridor from news, AIS, sanctions, and price signals.",
    status: "idle",
  },
  {
    code: "DSM",
    name: "Disruption Scenario Modeller",
    description: "Simulates specific disruption events and their cascading downstream impact.",
    status: "idle",
  },
  {
    code: "APO",
    name: "Adaptive Procurement Orchestrator",
    description: "Ranks alternate sourcing and logistics routes when a corridor is disrupted.",
    status: "idle",
  },
  {
    code: "SROA",
    name: "Strategic Reserve Optimisation Agent",
    description: "Models optimal reserve drawdown schedules against supply gap forecasts.",
    status: "idle",
  },
  {
    code: "SCDT",
    name: "Supply Chain Digital Twin",
    description: "Geospatial simulation of the full energy network for live what-if analysis.",
    status: "idle",
  },
  {
    code: "TFM",
    name: "Transaction Flow Monitor",
    description:
      "Tracks incoming/outgoing fuel transactions to verify how disruptions are being covered.",
    status: "idle",
  },
];

const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  const displayName = user?.displayName || user?.email?.split("@")[0] || "Operator";

  return (
    <div className="min-h-screen bg-base text-ink">
      <header className="sticky top-0 z-10 border-b border-border bg-base/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulseDot rounded-full bg-amber" />
            <span className="font-display text-lg font-semibold tracking-tight">Aegis SCR</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden font-mono text-xs text-muted sm:inline">
              {user?.email}
            </span>
            <Link
  to="/live-map"
  className="rounded-md border border-amber/40 px-4 py-2 font-mono text-xs uppercase tracking-wider text-amber transition-colors hover:bg-amber/10"
>
  Live Map
</Link>
            <button
              onClick={handleLogout}
              className="rounded-md border border-border px-4 py-2 font-mono text-xs uppercase tracking-wider text-ink transition-colors hover:border-risk hover:text-risk"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8">
          <span className="font-mono text-[11px] uppercase tracking-widest text-amber">
            Welcome back
          </span>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">
            {displayName}'s dashboard
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            This is the shared foundation shell — auth is wired up and every module has a slot.
            Each teammate builds inside their layer without touching this structure.
          </p>
        </div>

        <div className="mb-6 flex items-center gap-3 rounded-lg border border-border bg-surface/60 px-4 py-3">
          <span className="h-1.5 w-1.5 rounded-full bg-muted" />
          <span className="font-mono text-xs text-muted">
            0 / 6 modules connected — this is expected at this stage.
          </span>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <ModuleCard key={m.code} {...m} />
          ))}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
