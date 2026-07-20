import { useEffect, useState } from "react";

export type ScrollPhase = "hero" | "showcase" | "transitioning" | "workspace";

export const useScrollPhase = () => {
  const [phase, setPhase] = useState<ScrollPhase>("hero");
  const [showcaseProgress, setShowcaseProgress] = useState(0);

  useEffect(() => {
    if (phase !== "transitioning" && phase !== "workspace") return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [phase]);

  const startWorkspaceTransition = () => setPhase("transitioning");
  const completeWorkspaceTransition = () => setPhase("workspace");

  return {
    phase,
    setPhase,
    showcaseProgress,
    setShowcaseProgress,
    startWorkspaceTransition,
    completeWorkspaceTransition,
  };
};
