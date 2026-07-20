import { ReactNode } from "react";
import { motion } from "framer-motion";

interface DissolveOverlayProps {
  children: ReactNode;
  onExitComplete: () => void;
}

const DissolveOverlay = ({ children, onExitComplete }: DissolveOverlayProps) => {
  return (
    <motion.div
      initial={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
      exit={{ opacity: 0, filter: "blur(8px)", scale: 0.98 }}
      transition={{ duration: 0.65, ease: "easeInOut" }}
      onAnimationComplete={(definition) => {
        if (typeof definition === "object" && "opacity" in definition && definition.opacity === 0) {
          onExitComplete();
        }
      }}
    >
      {children}
    </motion.div>
  );
};

export default DissolveOverlay;
