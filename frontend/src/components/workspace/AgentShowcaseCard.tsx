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
  const scale = useTransform(progress, [0, 0.5, 1], [0.72, 1, 0.84]);
  const opacity = useTransform(progress, [0, 0.18, 0.78, 1], [0, 1, 1, 0]);
  const cardX = useTransform(progress, [0, 0.5, 1], [index % 2 === 0 ? -110 : 110, 0, index % 2 === 0 ? 48 : -48]);
  const descX = useTransform(progress, [0, 0.5, 1], [index % 2 === 0 ? 82 : -82, 0, index % 2 === 0 ? -48 : 48]);
  const cardOrder = index % 2 === 0 ? "lg:grid-cols-[1.08fr_0.92fr]" : "lg:grid-cols-[0.92fr_1.08fr]";

  const card = (
    <motion.div
      style={{ scale, opacity, x: cardX }}
      whileHover={{ y: -6 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className="group min-h-[19rem] rounded-md border border-amber/45 bg-[#121924]/85 p-8 shadow-2xl shadow-base/70 backdrop-blur-md transition-colors duration-200 hover:border-amber/75 hover:bg-[#121924]/92 hover:shadow-amber/15 md:min-h-[21rem] md:p-9"
    >
      <div className="mb-12 flex items-center justify-between">
        <span className="font-mono text-xs text-muted transition-colors duration-200 group-hover:text-ink/80">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="rounded border border-amber/50 px-2 py-1 font-mono text-[11px] font-semibold tracking-wider text-amber transition-colors duration-200 group-hover:bg-amber group-hover:text-base">
          {agent.code}
        </span>
      </div>
      <h3 className="max-w-xl font-display text-3xl font-semibold leading-tight tracking-tight text-ink md:text-4xl">{agent.name}</h3>
      <p className="mt-5 max-w-2xl text-base leading-7 text-muted transition-colors duration-200 group-hover:text-ink/80">
        {agent.desc}
      </p>
      <div className="mt-10 h-1 w-28 rounded-full bg-amber transition-all duration-200 group-hover:w-40" />
    </motion.div>
  );

  const description = (
    <motion.div style={{ opacity, x: descX }} className="max-w-2xl border-l border-amber/55 pl-6">
      <div className="font-mono text-[11px] uppercase tracking-widest text-amber">Agent Focus</div>
      <p className="mt-4 text-xl font-medium leading-9 text-ink drop-shadow-[0_2px_16px_rgba(0,0,0,0.85)] md:text-2xl">
        {agent.longDesc}
      </p>
    </motion.div>
  );

  return (
    <div className={`absolute inset-0 grid items-center gap-8 px-6 md:px-12 lg:gap-14 lg:px-16 ${cardOrder}`}>
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
