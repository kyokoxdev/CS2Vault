import { ReactNode } from 'react';
import { Card } from './Card';
import styles from './StatCard.module.css';

interface StatCardProps {
  label: string;
  value: string | number;
  change?: number;
  icon?: ReactNode;
  prefix?: string;
}

export function StatCard({
  label,
  value,
  change,
  icon,
  prefix,
}: StatCardProps) {
  const getChangeColor = (changeValue: number) => {
    if (changeValue > 0) return styles.changePositive;
    if (changeValue < 0) return styles.changeNegative;
    return styles.changeNeutral;
  };

  const formatChange = (changeValue: number) => {
    if (changeValue > 0) return `+${changeValue.toFixed(1)}%`;
    if (changeValue < 0) return `${changeValue.toFixed(1)}%`;
    return '0.0%';
  };

  return (
    <Card padding="md">
      <div className={styles.container}>
        {icon && <div className={styles.icon}>{icon}</div>}
        <div className={styles.content}>
          <div className={styles.label}>{label}</div>
          <div className={styles.value}>
            {prefix}
            {value}
          </div>
          {change !== undefined && (
            <div className={`${styles.change} ${getChangeColor(change)}`}>
              {formatChange(change)}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
