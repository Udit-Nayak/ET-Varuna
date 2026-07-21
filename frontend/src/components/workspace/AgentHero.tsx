import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import { showcaseAgents } from "./agentContent";

interface AgentHeroProps {
  onUseMe: () => void;
}

type GriaNewsItem = {
  id: string;
  title: string;
  source?: string;
  publishedAt?: string;
  url?: string;
  description?: string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
const GRIA_NEWS_CACHE_KEY = "Sentrix-gria-hover-news";

const formatRelativeTime = (value?: string) => {
  if (!value) return "";
  const published = new Date(value).getTime();
  if (Number.isNaN(published)) return "";
  const delta = Math.max(0, Date.now() - published);
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const readCachedNews = (): GriaNewsItem[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(GRIA_NEWS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { items?: GriaNewsItem[] };
    return Array.isArray(parsed.items) ? parsed.items.slice(0, 5) : [];
  } catch {
    return [];
  }
};

const cacheNews = (items: GriaNewsItem[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GRIA_NEWS_CACHE_KEY, JSON.stringify({ items, cachedAt: Date.now() }));
  } catch {
    // Ignore storage failures.
  }
};

const GriaHoverNews = () => {
  const [items, setItems] = useState<GriaNewsItem[]>(() => readCachedNews());
  const [status, setStatus] = useState<"idle" | "fetching" | "live" | "cached" | "error">(
    items.length > 0 ? "cached" : "idle"
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();

    const load = async () => {
      setStatus((current) => (current === "cached" ? "cached" : "fetching"));
      try {
        const response = await fetch(`${API_BASE_URL}/api/gria/fetch-news`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 5 }),
          signal: controller.signal,
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const payload = await response.json();
        const nextItems = Array.isArray(payload?.articles)
          ? payload.articles.slice(0, 5).map((article: any) => ({
              id: String(article.id ?? article.url ?? article.title),
              title: String(article.title ?? "Untitled story"),
              source: article.source ? String(article.source) : undefined,
              publishedAt: article.publishedAt ? String(article.publishedAt) : undefined,
              url: article.url ? String(article.url) : undefined,
              description: article.description ? String(article.description) : undefined,
            }))
          : [];

        if (!alive) return;
        if (nextItems.length > 0) {
          setItems(nextItems);
          cacheNews(nextItems);
          setStatus("live");
        } else {
          setStatus("cached");
        }
      } catch {
        if (!alive) return;
        setItems((current) => (current.length > 0 ? current : readCachedNews()));
        setStatus((current) => (current === "live" ? "live" : "cached"));
      }
    };

    void load();
    const intervalId = window.setInterval(() => {
      void load();
    }, 30000);

    return () => {
      alive = false;
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || items.length === 0) return;

    let rafId = 0;
    let lastTs = 0;
    let paused = false;
    const speedPxPerSecond = 42;

    const tick = (timestamp: number) => {
      if (!node.isConnected) return;

      if (paused) {
        lastTs = 0;
        rafId = window.requestAnimationFrame(tick);
        return;
      }

      if (lastTs === 0) lastTs = timestamp;
      const delta = timestamp - lastTs;
      lastTs = timestamp;

      const maxScrollTop = node.scrollHeight - node.clientHeight;
      if (maxScrollTop <= 0) {
        rafId = window.requestAnimationFrame(tick);
        return;
      }

      node.scrollTop += (speedPxPerSecond * delta) / 1000;

      if (node.scrollTop >= maxScrollTop - 1) {
        node.scrollTop = 0;
      }

      rafId = window.requestAnimationFrame(tick);
    };

    const handlePointerEnter = () => {
      paused = true;
    };

    const handlePointerLeave = () => {
      paused = false;
      lastTs = 0;
    };

    node.addEventListener("mouseenter", handlePointerEnter);
    node.addEventListener("mouseleave", handlePointerLeave);
    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
      node.removeEventListener("mouseenter", handlePointerEnter);
      node.removeEventListener("mouseleave", handlePointerLeave);
    };
  }, [items.length]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="overflow-hidden rounded-md border border-amber/40 bg-surface/95 shadow-2xl shadow-base/70 backdrop-blur"
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-amber">GRIA live feed</div>
          <div className="mt-0.5 text-[11px] text-muted">
            {status === "fetching" ? "Fetching latest headlines..." : status === "live" ? "Fresh headlines updated." : "Showing recent cached headlines."}
          </div>
        </div>
        <div className="rounded border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted">
          {items.length} items
        </div>
      </div>
      <div ref={scrollRef} className="gria-scrollbar-hide max-h-64 overflow-y-auto px-3 py-2">
        <div className="space-y-2">
          {items.length === 0 ? (
            <div className="rounded border border-dashed border-border bg-base/40 px-3 py-4 text-xs text-muted">
              No cached stories yet. GRIA will show recent news here after the next fetch.
            </div>
          ) : (
            items.map((item, index) => (
              <a
                key={item.id}
                href={item.url || "#"}
                target={item.url ? "_blank" : undefined}
                rel={item.url ? "noreferrer" : undefined}
                className="block rounded border border-border bg-base/55 px-3 py-2 transition-colors hover:border-amber/40 hover:bg-base/75"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="overflow-hidden text-ellipsis text-sm font-medium text-ink">{item.title}</div>
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-muted">
                      <span>{item.source ?? "GRIA source"}</span>
                      <span>{formatRelativeTime(item.publishedAt) || `#${index + 1}`}</span>
                    </div>
                  </div>
                  <span className="mt-0.5 rounded border border-amber/30 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-amber">
                    News
                  </span>
                </div>
                {item.description ? <div className="mt-2 max-h-10 overflow-hidden text-xs leading-relaxed text-muted">{item.description}</div> : null}
              </a>
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
};

const container: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const item: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } },
};

const AgentHero = ({ onUseMe }: AgentHeroProps) => {
  return (
    <section className="relative z-10 flex min-h-[calc(100vh-65px)] items-center justify-center px-6 py-16 text-center">
      <div className="pointer-events-auto absolute right-4 top-6 z-30 w-[min(26rem,88vw)] text-left">
        <GriaHoverNews />
      </div>
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="mx-auto flex max-w-6xl flex-col items-center"
      >
        <motion.span variants={item} className="font-mono text-[11px] uppercase tracking-widest text-amber">
          Energy Corridor Intelligence
        </motion.span>
        <motion.h1
          variants={item}
          className="mt-5 max-w-4xl font-display text-4xl font-semibold leading-tight tracking-tight text-ink md:text-6xl"
        >
          Sentrix coordinates live risk signals into decisive energy supply action.
        </motion.h1>
        <motion.p
          variants={item}
          className="mt-5 max-w-2xl text-sm font-medium leading-relaxed text-ink/95 drop-shadow-[0_2px_18px_rgba(0,0,0,0.95)] md:text-base"
        >
          Monitor corridors, query the agent workflow, and move from geopolitical signal to operational response in one focused workspace.
        </motion.p>

        <motion.div variants={item} className="mt-9 grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {showcaseAgents.map((agent) => (
            <div
              key={agent.code}
              className="group relative flex min-h-[4.35rem] items-center gap-3 rounded-md border border-border/90 bg-surface/78 px-4 py-3 text-left shadow-lg shadow-base/35 backdrop-blur transition-all duration-200 hover:-translate-y-1 hover:border-amber/70 hover:bg-surface/95 hover:shadow-2xl hover:shadow-amber/10"
            >
              <span className="shrink-0 rounded border border-amber/50 px-2 py-1 font-mono text-[10px] font-semibold tracking-wider text-amber transition-colors duration-200 group-hover:bg-amber group-hover:text-base">
                {agent.code}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-sm font-semibold text-ink transition-colors duration-200 group-hover:text-white">
                  {agent.name}
                </div>
                <div className="truncate text-xs leading-relaxed text-muted transition-colors duration-200 group-hover:text-ink/80">
                  {agent.desc}
                </div>
              </div>
            </div>
          ))}
        </motion.div>

        <motion.button
          variants={item}
          type="button"
          onClick={onUseMe}
          className="mt-10 rounded-md bg-amber px-7 py-3 font-mono text-sm font-semibold uppercase tracking-wider text-base transition-transform hover:scale-[1.02]"
        >
          Open Workspace
        </motion.button>
      </motion.div>

      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted">
        <span className="h-2 w-2 animate-pulseDot rounded-full bg-amber" />
        Scroll
      </div>
    </section>
  );
};

export default AgentHero;
