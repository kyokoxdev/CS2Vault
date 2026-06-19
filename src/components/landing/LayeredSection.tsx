"use client";

import { useId, type ReactNode } from "react";
import { useReducedMotion } from "@/hooks/useMediaQuery";
import styles from "./LayeredSection.module.css";

export interface SectionLayer {
    content: ReactNode;
    depth: 1 | 2 | 3;
    speed?: number;
}

export interface LayeredSectionProps {
    layers: SectionLayer[];
    className?: string;
    children?: ReactNode;
}

export default function LayeredSection({ layers, className = "", children }: LayeredSectionProps) {
    const baseId = useId();
    const prefersReducedMotion = useReducedMotion();

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
            className={`${styles.container} ${prefersReducedMotion ? styles.reducedMotion : ""} ${className}`}
            data-testid="layered-section"
        >
            {layers.map((layer) => (
                <div
                    key={`${baseId}-depth-${layer.depth}`}
                    className={getLayerClassName(layer.depth)}
                    data-testid={`layered-layer-${layer.depth}`}
                    data-depth={layer.depth}
                >
                    {layer.content}
                </div>
            ))}
            {children && (
                <div className={styles.content} data-testid="layered-content">
                    {children}
                </div>
            )}
        </section>
    );
}
