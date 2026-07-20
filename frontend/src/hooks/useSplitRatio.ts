import { PointerEvent as ReactPointerEvent, RefObject, useCallback, useEffect, useState } from "react";

const MIN_RATIO = 20;
const MAX_RATIO = 80;

const clamp = (value: number) => Math.min(MAX_RATIO, Math.max(MIN_RATIO, value));

export const useSplitRatio = (containerRef: RefObject<HTMLElement>, initialRatio = 50) => {
  const [ratio, setRatio] = useState(() => clamp(initialRatio));
  const [isDragging, setIsDragging] = useState(false);

  const updateFromClientX = useCallback(
    (clientX: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      setRatio(clamp(((clientX - rect.left) / rect.width) * 100));
    },
    [containerRef]
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      event.preventDefault();
      setIsDragging(true);
      updateFromClientX(event.clientX);
    },
    [updateFromClientX]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (event: PointerEvent) => updateFromClientX(event.clientX);
    const handlePointerUp = () => setIsDragging(false);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [isDragging, updateFromClientX]);

  return {
    ratio,
    setRatio: (nextRatio: number) => setRatio(clamp(nextRatio)),
    isDragging,
    onPointerDown,
  };
};
