import economicTimesLogo from "../../assets/brand/economic-times-logo.png";

const dataSources = [
  {
    name: "AISStream",
    href: "https://aisstream.io/",
    description: "Live AIS vessel positions and tanker movement signals.",
  },
  {
    name: "NewsAPI",
    href: "https://newsapi.org/",
    description: "Global news ingestion for geopolitical and energy-risk events.",
  },
  {
    name: "MarineLink",
    href: "https://www.marinelink.com/",
    description: "Maritime industry news, shipping disruptions, port and vessel intelligence.",
  },
  {
    name: "PPAC India",
    href: "https://ppac.gov.in/",
    description: "India petroleum price, crude basket, consumption and energy-market references.",
  },
  {
    name: "OpenStreetMap",
    href: "https://www.openstreetmap.org/",
    description: "Base map geography for chokepoints, coastlines, ports, and corridors.",
  },
  {
    name: "OpenMapTiles",
    href: "https://openmaptiles.org/",
    description: "Map tile layer used for the interactive maritime dashboard.",
  },
];

const HackathonCredits = () => {
  return (
    <section className="relative z-10 flex min-h-[calc(100vh-65px)] items-center justify-center px-6 py-20 text-center">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center">
        <div className="font-mono text-[11px] uppercase tracking-[0.35em] text-amber">Built For</div>
        <h2
          className="mt-5 text-5xl font-bold leading-none text-ink drop-shadow-[0_16px_40px_rgba(0,0,0,0.78)] md:text-7xl"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
        >
          The Economic Times
        </h2>
        <p className="mt-4 font-display text-2xl font-semibold text-ink/90 md:text-4xl">ET AI Hackathon 2.0</p>

        <div className="mt-12 w-full max-w-5xl">
          <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.28em] text-muted">Data Sources</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {dataSources.map((source) => (
              <a
                key={source.name}
                href={source.href}
                target="_blank"
                rel="noreferrer"
                className="group rounded-md border border-border/90 bg-surface/75 p-4 text-left shadow-xl shadow-base/35 backdrop-blur-md transition-all hover:-translate-y-1 hover:border-amber/70 hover:bg-[#121924]/92"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-display text-lg font-semibold text-ink transition-colors group-hover:text-white">{source.name}</span>
                  <span className="rounded border border-amber/45 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-amber">Open</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted transition-colors group-hover:text-ink/85">{source.description}</p>
              </a>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-col items-center gap-4">
          <img src={economicTimesLogo} alt="The Economic Times logo" className="h-20 w-20 object-contain drop-shadow-[0_16px_32px_rgba(0,0,0,0.7)]" />
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted">Varuna | Energy Supply Chain Resilience</div>
        </div>
      </div>
    </section>
  );
};

export default HackathonCredits;
