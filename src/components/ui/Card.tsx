"use client";

import { ReactNode, KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useMediaQuery';
import styles from './Card.module.css';

interface CardProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'elevated';
  padding?: 'sm' | 'md' | 'lg';
  noPadding?: boolean;
  interactive?: boolean;
  animate?: boolean;
  onClick?: () => void;
}

export function Card({
  children,
  className,
  variant = 'default',
  padding = 'md',
  noPadding = false,
  interactive = false,
  animate = false,
  onClick,
}: CardProps) {
  const reducedMotion = useReducedMotion();
  const variantClass = styles[variant];
  const paddingClass = noPadding ? styles.noPadding : styles[`padding${padding.charAt(0).toUpperCase()}${padding.slice(1)}`];
  const interactiveClass = interactive || onClick ? styles.interactive : '';
  const classes = `${styles.card} ${variantClass} ${paddingClass} ${interactiveClass} ${className || ''}`;

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      onClick();
    }
  };

  const isInteractive = interactive || !!onClick;
  
  const motionProps = {
    className: classes,
    ...(animate && !reducedMotion ? {
      initial: { opacity: 0, y: 12 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] }
    } : {}),
    ...(isInteractive && !reducedMotion ? {
      whileHover: { y: -2, boxShadow: "0 8px 24px rgba(0, 0, 0, 0.3)" },
      whileTap: { scale: 0.98, y: 0 }
    } : {})
  };

  if (onClick) {
    return (
      <motion.button 
        type="button"
        onClick={onClick}
        onKeyDown={handleKeyDown}
        {...motionProps}
      >
        {children}
      </motion.button>
    );
  }

  return (
    <motion.div {...motionProps}>
      {children}
    </motion.div>
  );
}
