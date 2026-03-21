import { ReactNode, KeyboardEvent } from 'react';
import styles from './Card.module.css';

interface CardProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'elevated';
  padding?: 'sm' | 'md' | 'lg';
  noPadding?: boolean;
  interactive?: boolean;
  onClick?: () => void;
}

export function Card({
  children,
  className,
  variant = 'default',
  padding = 'md',
  noPadding = false,
  interactive = false,
  onClick,
}: CardProps) {
  const variantClass = styles[variant];
  const paddingClass = noPadding ? styles.noPadding : styles[`padding${padding.charAt(0).toUpperCase()}${padding.slice(1)}`];
  const interactiveClass = interactive || onClick ? styles.interactive : '';
  const classes = `${styles.card} ${variantClass} ${paddingClass} ${interactiveClass} ${className || ''}`;

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (onClick && e.key === 'Enter') {
      onClick();
    }
  };

  if (onClick) {
    return (
      <button 
        type="button"
        className={classes}
        onClick={onClick}
        onKeyDown={handleKeyDown}
      >
        {children}
      </button>
    );
  }

  return (
    <div className={classes}>
      {children}
    </div>
  );
}
