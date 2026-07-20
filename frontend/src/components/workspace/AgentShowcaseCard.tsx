import { MotionValue, motion, useTransform } from "framer-motion";

interface AgentShowcaseCardProps {
  agent: {
    code: string;
    name: string;
    desc: string;
    longDesc: string;
  };
  index: number;
  progress: MotionValue<number>;
}

const AgentShowcaseCard = ({ agent, index, progress }: AgentShowcaseCardProps) => {
  const scale = useTransform(progress, [0, 0.5, 1], [0.62, 1, 0.78]);
  const opacity = useTransform(progress, [0, 0.18, 0.78, 1], [0, 1, 1, 0]);
  const cardX = useTransform(progress, [0, 0.5, 1], [index % 2 === 0 ? -90 : 90, 0, index % 2 === 0 ? 40 : -40]);
  const descX = useTransform(progress, [0, 0.5, 1], [index % 2 === 0 ? 70 : -70, 0, index % 2 === 0 ? -40 : 40]);
  const cardOrder = index % 2 === 0 ? "md:grid-cols-[0.9fr_1.1fr]" : "md:grid-cols-[1.1fr_0.9fr]";

  const card = (
    <motion.div
      style={{ scale, opacity, x: cardX }}
      className="rounded-md border border-amber/40 bg-surface/90 p-6 shadow-2xl shadow-base/60 backdrop-blur"
    >
      <div className="mb-10 flex items-center justify-between">
        <span className="font-mono text-xs text-muted">{String(index + 1).padStart(2, "0")}</span>
        <span className="rounded border border-amber/50 px-2 py-1 font-mono text-[11px] font-semibold tracking-wider text-amber">
          {agent.code}
        </span>
      </div>
      <h3 className="font-display text-3xl font-semibold tracking-tight text-ink">{agent.name}</h3>
      <div className="mt-8 h-1 w-24 rounded-full bg-amber" />
    </motion.div>
  );

  const description = (
    <motion.div style={{ opacity, x: descX }} className="max-w-xl">
      <div className="font-mono text-[11px] uppercase tracking-widest text-amber">Agent Focus</div>
      <p className="mt-4 text-xl leading-relaxed text-ink">{agent.longDesc}</p>
      <p className="mt-5 text-sm leading-relaxed text-muted">{agent.desc}</p>
    </motion.div>
  );

  return (
    <div className={`absolute inset-0 grid items-center gap-10 px-6 md:px-14 ${cardOrder}`}>
      {index % 2 === 0 ? (
        <>
          {card}
          {description}
        </>
      ) : (
        <>
          {description}
          {card}
        </>
      )}
    </div>
  );
};

export default AgentShowcaseCard;
