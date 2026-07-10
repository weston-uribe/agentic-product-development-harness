"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

interface GuidedStepTransitionProps {
  stepKey: string;
  children: React.ReactNode;
  className?: string;
}

export function GuidedStepTransition({
  stepKey,
  children,
  className,
}: GuidedStepTransitionProps) {
  const prefersReducedMotion = useReducedMotion();

  const variants = prefersReducedMotion
    ? {
        initial: { opacity: 0 },
        animate: {
          opacity: 1,
          transition: { duration: 0.15, ease: [0.2, 0, 0, 1] as const },
        },
        exit: {
          opacity: 0,
          transition: { duration: 0.12, ease: [0.3, 0, 1, 1] as const },
        },
      }
    : {
        initial: { opacity: 0, y: 12 },
        animate: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.28, ease: [0.2, 0, 0, 1] as const },
        },
        exit: {
          opacity: 0,
          y: -8,
          transition: { duration: 0.22, ease: [0.3, 0, 1, 1] as const },
        },
      };

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={stepKey}
        className={cn(className)}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
