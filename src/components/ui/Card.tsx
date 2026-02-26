import { ReactNode } from 'react';
import styles from './Card.module.css';

interface CardProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'elevated';
  padding?: 'sm' | 'md' | 'lg';
  noPadding?: boolean;
}

export function Card({
  children,
  className,
  variant = 'default',
  padding = 'md',
  noPadding = false,
}: CardProps) {
  const variantClass = styles[variant];
  const paddingClass = noPadding ? styles.noPadding : styles[`padding${padding.charAt(0).toUpperCase()}${padding.slice(1)}`];

  return (
    <div className={`${styles.card} ${variantClass} ${paddingClass} ${className || ''}`}>
      {children}
    </div>
  );
}
