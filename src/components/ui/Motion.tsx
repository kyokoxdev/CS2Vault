"use client";

import { motion, AnimatePresence, Variants } from "framer-motion";
import { useEffect, useState } from "react";
import { animate, useMotionValue, useTransform } from "framer-motion";
import { ReactNode } from "react";
import { useReducedMotion } from "@/hooks/useMediaQuery";

interface FadeInProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
}

const fadeInVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

export function FadeIn({ 
  children, 
  delay = 0, 
  duration = 0.3,
  className 
}: FadeInProps) {
  const reducedMotion = useReducedMotion();
  
  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeInVariants}
      transition={{ 
        duration, 
        delay,
        ease: [0.4, 0, 0.2, 1] as [number, number, number, number]
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface StaggerListProps {
  children: ReactNode[];
  staggerDelay?: number;
  className?: string;
  keys?: string[];
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.2,
      ease: [0.4, 0, 0.2, 1] as [number, number, number, number]
    }
  },
};

export function StaggerList({ children, staggerDelay = 0.05, className, keys }: StaggerListProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { staggerChildren: staggerDelay },
        },
      }}
      className={className}
    >
      {children.map((child, index) => (
        <motion.div key={keys?.[index] ?? `stagger-${index}`} variants={itemVariants}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}

interface ScaleTapProps {
  children: ReactNode;
  className?: string;
  scale?: number;
}

export function ScaleTap({ children, className, scale = 0.98 }: ScaleTapProps) {
  const reducedMotion = useReducedMotion();
  
  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      whileTap={{ scale }}
      transition={{ duration: 0.1 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface SlideInProps {
  children: ReactNode;
  direction?: 'left' | 'right' | 'up' | 'down';
  delay?: number;
  className?: string;
}

export function SlideIn({ 
  children, 
  direction = 'up', 
  delay = 0,
  className 
}: SlideInProps) {
  const reducedMotion = useReducedMotion();
  
  const directionOffset = {
    left: { x: -20, y: 0 },
    right: { x: 20, y: 0 },
    up: { x: 0, y: 20 },
    down: { x: 0, y: -20 },
  };

  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ 
        opacity: 0, 
        ...directionOffset[direction]
      }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ 
        duration: 0.3, 
        delay,
        ease: [0.4, 0, 0.2, 1] as [number, number, number, number]
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface AnimatedPresenceProps {
  children: ReactNode;
  isVisible: boolean;
}

export function AnimatedVisibility({ children, isVisible }: AnimatedPresenceProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return isVisible ? <>{children}</> : null;
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}


// --- New Primitives ---

export function CountUp({ 
  value, 
  duration = 1,
  className,
  formatter = (v: number) => Math.round(v).toString()
}: { 
  value: number; 
  duration?: number;
  className?: string;
  formatter?: (v: number) => string;
}) {
  const reducedMotion = useReducedMotion();
  const motionValue = useMotionValue(0);
  const displayValue = useTransform(motionValue, (latest) => formatter(latest));
  const [displayFallback, setDisplayFallback] = useState(formatter(value));

  useEffect(() => {
    if (reducedMotion) {
      setDisplayFallback(formatter(value));
      return;
    }
    const controls = animate(motionValue, value, {
      duration,
      ease: [0.4, 0, 0.2, 1] as [number, number, number, number]
    });
    return controls.stop;
  }, [value, duration, reducedMotion, motionValue, formatter]);

  if (reducedMotion) {
    return <span className={className}>{displayFallback}</span>;
  }

  return <motion.span className={className}>{displayValue}</motion.span>;
}

export function StaggerContainer({ children, className, staggerDelay = 0.05 }: { children: ReactNode; className?: string; staggerDelay?: number }) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion) return <div className={className}>{children}</div>;
  
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      exit="hidden"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { staggerChildren: staggerDelay }
        }
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function HoverScale({ children, className, scale = 1.02 }: { children: ReactNode; className?: string; scale?: number }) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion) return <div className={className}>{children}</div>;
  return (
    <motion.div whileHover={{ scale }} transition={{ duration: 0.2,       ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }} className={className}>
      {children}
    </motion.div>
  );
}

export function GlowOnHover({ children, className, glowColor = "var(--bull)" }: { children: ReactNode; className?: string; glowColor?: string }) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion) return <div className={className}>{children}</div>;
  return (
    <motion.div
      whileHover={{ boxShadow: `0 0 12px ${glowColor}40` }}
      transition={{ duration: 0.3 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function SmoothHeight({ children, isVisible, className }: { children: ReactNode; isVisible: boolean; className?: string }) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion) return isVisible ? <div className={className}>{children}</div> : null;
  return (
    <AnimatePresence initial={false}>
      {isVisible && (
        <motion.div
          initial={{ height: 0, opacity: 0, overflow: 'hidden' }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3,       ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
          className={className}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
