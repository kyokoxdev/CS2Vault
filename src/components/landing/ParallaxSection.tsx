'use client';

import { useId, type ReactNode } from 'react';
import styles from './ParallaxSection.module.css';

export interface ParallaxLayer {
    content: ReactNode;
    depth: 1 | 2 | 3;
    speed?: number;
}

export interface ParallaxSectionProps {
    layers: ParallaxLayer[];
    className?: string;
    children?: ReactNode;
}

export default function ParallaxSection({ layers, className = '', children }: ParallaxSectionProps) {
    const baseId = useId();
    
    const prefersReducedMotion = typeof window !== 'undefined' 
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches 
        : false;

    const getLayerStyle = (layer: ParallaxLayer): React.CSSProperties => {
        if (prefersReducedMotion) {
            return {};
        }

        const speed = layer.speed ?? 0.5;
        const baseDepth = {
            1: -100,
            2: -50,
            3: 0,
        };
        
        const translateZ = baseDepth[layer.depth] * speed;
        const scale = layer.depth === 3 ? 1 : 1 + Math.abs(translateZ) / 1000;

        return {
            transform: `translateZ(${translateZ}px) scale(${scale})`,
        };
    };

    const getLayerClassName = (depth: 1 | 2 | 3): string => {
        const depthClasses = {
            1: styles.layer1,
            2: styles.layer2,
            3: styles.layer3,
        };
        return `${styles.layer} ${depthClasses[depth]}`;
    };

    return (
        <section 
            className={`${styles.container} ${prefersReducedMotion ? styles.reducedMotion : ''} ${className}`}
            data-testid="parallax-section"
        >
            {layers.map((layer) => (
                <div
                    key={`${baseId}-depth-${layer.depth}`}
                    className={getLayerClassName(layer.depth)}
                    style={getLayerStyle(layer)}
                    data-testid={`parallax-layer-${layer.depth}`}
                    data-depth={layer.depth}
                >
                    {layer.content}
                </div>
            ))}
            {children && (
                <div className={styles.content} data-testid="parallax-content">
                    {children}
                </div>
            )}
        </section>
    );
}
