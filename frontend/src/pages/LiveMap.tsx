import { Link } from "react-router-dom";
import VesselMap from "../components/VesselMap";
import { useVesselStream } from "../hooks/useVesselStream";

const LiveMap = () => {
  const vessels = useVesselStream();

  return (
    <div className="flex h-screen flex-col bg-base text-ink">
      <header className="border-b border-border bg-base/90 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulseDot rounded-full bg-amber" />
            <span className="font-display text-lg font-semibold tracking-tight">
              Aegis SCR — Live Map
            </span>
          </div>
          <Link
            to="/dashboard"
            className="rounded-md border border-border px-4 py-2 font-mono text-xs uppercase tracking-wider text-ink transition-colors hover:border-amber hover:text-amber"
          >
            Back to dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">
        <div className="h-full">
          <VesselMap vessels={vessels} />
        </div>
      </main>
    </div>
  );
};

export default LiveMap;