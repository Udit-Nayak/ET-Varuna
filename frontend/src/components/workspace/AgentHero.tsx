import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import { showcaseAgents } from "./agentContent";

interface AgentHeroProps {
  onUseMe: () => void;
}

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
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="mx-auto flex max-w-6xl flex-col items-center"
      >
        <motion.span variants={item} className="font-mono text-[11px] uppercase tracking-widest text-amber">
          Supply Chain Intelligence
        </motion.span>
        <motion.h1
          variants={item}
          className="mt-5 max-w-4xl font-display text-4xl font-semibold leading-tight tracking-tight text-ink md:text-6xl"
        >
          Aegis SCR turns maritime disruption into a live multi-agent response.
        </motion.h1>
        <motion.p variants={item} className="mt-5 max-w-2xl text-sm leading-relaxed text-muted md:text-base">
          Draw risk into the map, watch GRIA, DSM, and SROA reason through it, and keep the operator in one cinematic workspace.
        </motion.p>

        <motion.div variants={item} className="mt-9 grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {showcaseAgents.map((agent) => (
            <div
              key={agent.code}
              className="group flex items-center gap-3 rounded-md border border-border bg-surface/75 px-4 py-3 text-left shadow-lg backdrop-blur transition-colors hover:border-amber/60 hover:bg-surface"
            >
              <span className="shrink-0 rounded border border-amber/50 px-2 py-1 font-mono text-[10px] font-semibold tracking-wider text-amber">
                {agent.code}
              </span>
              <div className="min-w-0">
                <div className="truncate font-display text-sm font-semibold text-ink">{agent.name}</div>
                <div className="truncate text-xs text-muted">{agent.desc}</div>
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
          Use Me
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
