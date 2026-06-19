"use client";

import { ReactNode } from 'react';
import { Card } from './Card';
import { CountUp } from './Motion';
import styles from './StatCard.module.css';

interface StatCardProps {
  label: string;
  value: string | number | ReactNode;
  change?: number | null;
  icon?: ReactNode;
  prefix?: string;
  animate?: boolean;
  fractionDigits?: number;
}

export function StatCard({
  label,
  value,
  change,
  icon,
  prefix,
  animate = true,
  fractionDigits,
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

  const isNumberValue = typeof value === 'number';

  return (
    <Card padding="md" animate={animate} interactive={true}>
      <div className={styles.container}>
        {icon && <div className={styles.icon}>{icon}</div>}
        <div className={styles.content}>
          <div className={styles.label}>{label}</div>
          <div className={styles.value}>
            {prefix}
            {isNumberValue ? (
              <CountUp 
                value={value as number} 
                formatter={(v) => v.toLocaleString(undefined, { 
                  minimumFractionDigits: fractionDigits,
                  maximumFractionDigits: fractionDigits ?? 2 
                })} 
              />
            ) : (
              value
            )}
          </div>
          {change !== undefined && change !== null && (
            <div className={`${styles.change} ${getChangeColor(change)}`}>
              {formatChange(change)}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
