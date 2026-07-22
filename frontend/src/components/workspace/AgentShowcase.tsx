import { MutableRefObject, useEffect, useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import AgentShowcaseCard from "./AgentShowcaseCard";
import { showcaseAgents } from "./agentContent";

interface AgentShowcaseProps {
  onProgressChange: (progress: number) => void;
}

const useLocalProgress = (scrollYProgress: ReturnType<typeof useScroll>["scrollYProgress"], index: number) => {
  const start = index / showcaseAgents.length;
  const end = (index + 1) / showcaseAgents.length;
  return useTransform(scrollYProgress, [start, (start + end) / 2, end], [0, 0.5, 1], { clamp: true });
};

const ShowcaseCards = ({
  scrollYProgress,
}: {
  scrollYProgress: ReturnType<typeof useScroll>["scrollYProgress"];
}) => {
  const progressValues = showcaseAgents.map((_, index) => useLocalProgress(scrollYProgress, index));

  return (
    <>
      {showcaseAgents.map((agent, index) => (
        <AgentShowcaseCard key={agent.code} agent={agent} index={index} progress={progressValues[index]} />
      ))}
    </>
  );
};

const AgentShowcase = ({ onProgressChange }: AgentShowcaseProps) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: wrapperRef as MutableRefObject<HTMLElement>,
    offset: ["start start", "end end"],
  });

  useEffect(() => scrollYProgress.on("change", onProgressChange), [onProgressChange, scrollYProgress]);

  const barScale = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <section ref={wrapperRef} className="relative z-10" style={{ height: `${showcaseAgents.length * 100}vh` }}>
      {showcaseAgents.map((agent, index) => (
        <div
          key={`${agent.code}-anchor`}
          id={`agent-showcase-${agent.code.toLowerCase()}`}
          className="absolute left-0 h-px w-px scroll-mt-[72px]"
          style={{ top: `${index * 100}vh` }}
          aria-hidden="true"
        />
      ))}
      <div className="sticky top-[65px] h-[calc(100vh-65px)] overflow-hidden">
        <div className="absolute left-6 top-1/2 z-20 hidden -translate-y-1/2 flex-col items-center gap-3 md:flex">
          <div className="h-44 w-px overflow-hidden rounded-full bg-border">
            <motion.div style={{ scaleY: barScale, transformOrigin: "top" }} className="h-full w-full bg-amber" />
          </div>
          <div className="flex flex-col gap-2">
            {showcaseAgents.map((agent, index) => (
              <span key={agent.code} className="h-2 w-2 rounded-full border border-amber/50 bg-base" title={agent.code} />
            ))}
          </div>
        </div>
        <ShowcaseCards scrollYProgress={scrollYProgress} />
      </div>
    </section>
  );
};

export default AgentShowcase;
