import { MotionValue, motion, useTransform } from "framer-motion";

interface AgentShowcaseCardProps {
  agent: {
    code: string;
    name: string;
    desc?: string;
    longDesc: string;
  };
  index: number;
  progress: MotionValue<number>;
}

const AgentShowcaseCard = ({ agent, index, progress }: AgentShowcaseCardProps) => {
  const scale = useTransform(progress, [0, 0.5, 1], [0.72, 1, 0.84]);
  const opacity = useTransform(progress, [0, 0.18, 0.78, 1], [0, 1, 1, 0]);
  const cardX = useTransform(progress, [0, 0.5, 1], [index % 2 === 0 ? -46 : 46, 0, index % 2 === 0 ? 24 : -24]);
  const descX = useTransform(progress, [0, 0.5, 1], [index % 2 === 0 ? 34 : -34, 0, index % 2 === 0 ? -24 : 24]);
  const cardOrder = index % 2 === 0 ? "lg:grid-cols-[1.08fr_0.92fr]" : "lg:grid-cols-[0.92fr_1.08fr]";

  const card = (
    <motion.div
      style={{ scale, opacity, x: cardX }}
      whileHover={{ y: -6 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className="group min-h-[15rem] rounded-md border border-amber/45 bg-[#121924]/90 p-5 shadow-2xl shadow-base/70 backdrop-blur-md transition-colors duration-200 hover:border-amber/75 hover:bg-[#121924]/95 hover:shadow-amber/15 sm:min-h-[17rem] sm:p-6 md:min-h-[21rem] md:p-9"
    >
      <div className="mb-7 flex items-center justify-between md:mb-12">
        <span className="font-mono text-xs text-muted transition-colors duration-200 group-hover:text-ink/80">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="rounded border border-amber/50 px-2 py-1 font-mono text-[11px] font-semibold tracking-wider text-amber transition-colors duration-200 group-hover:bg-amber group-hover:text-base">
          {agent.code}
        </span>
      </div>
      <h3 className="max-w-xl break-words font-display text-2xl font-semibold leading-tight tracking-tight text-ink sm:text-3xl md:text-4xl">{agent.name}</h3>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-muted transition-colors duration-200 group-hover:text-ink/80 sm:text-base sm:leading-7">
        {agent.desc ?? agent.longDesc}
      </p>
      <div className="mt-7 h-1 w-24 rounded-full bg-amber transition-all duration-200 group-hover:w-32 md:mt-10 md:w-28 md:group-hover:w-40" />
    </motion.div>
  );

  const description = (
    <motion.div style={{ opacity, x: descX }} className="max-w-2xl border-l border-amber/55 pl-4 sm:pl-6">
      <div className="font-mono text-[11px] uppercase tracking-widest text-amber">Agent Focus</div>
      <p className="mt-3 break-words text-base font-medium leading-7 text-ink drop-shadow-[0_2px_16px_rgba(0,0,0,0.85)] sm:text-lg md:mt-4 md:text-2xl md:leading-9">
        {agent.longDesc}
      </p>
    </motion.div>
  );

  return (
    <div className={`absolute inset-0 grid content-center items-center gap-5 px-4 sm:px-6 md:px-12 lg:gap-14 lg:px-16 ${cardOrder}`}>
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
