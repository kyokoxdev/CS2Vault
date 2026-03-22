'use client';

import { useState, useMemo } from 'react';
import styles from './SteamItemImage.module.css';

interface SteamItemImageProps {
    imageUrl: string;
    alt: string;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
    fallback?: React.ReactNode;
}

const IMAGE_DIMENSIONS: Record<NonNullable<SteamItemImageProps['size']>, number> = {
    sm: 64,
    md: 128,
    lg: 256,
};

const RARITY_GRADIENTS = [
    'linear-gradient(135deg, #b28a00 0%, #4a3500 100%)', // Gold
    'linear-gradient(135deg, #8847ff 0%, #3d1d6e 100%)', // Purple
    'linear-gradient(135deg, #d32ce6 0%, #5c1362 100%)', // Pink
    'linear-gradient(135deg, #4b69ff 0%, #1e2a66 100%)', // Blue
    'linear-gradient(135deg, #eb4b4b 0%, #5c1e1e 100%)', // Red (covert)
    'linear-gradient(135deg, #70b04a 0%, #2d4a1f 100%)', // Green
    'linear-gradient(135deg, #5e98d9 0%, #25405c 100%)', // Light blue
    'linear-gradient(135deg, #ade55c 0%, #4a5c26 100%)', // Lime
];

export const POPULAR_ITEMS = {
    AK47_REDLINE: '',
    AWP_ASIIMOV: '',
    M4A4_HOWL: '',
    KARAMBIT_FADE: '',
    GLOCK_FADE: '',
    DEAGLE_BLAZE: '',
    USPS_KILL_CONFIRMED: '',
    BUTTERFLY_DOPPLER: '',
} as const;

function PlaceholderFallback({ alt, gradient }: { alt: string; gradient: string }) {
    const initials = alt
        .split(/[\s|]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(word => word[0]?.toUpperCase() || '')
        .join('');

    return (
        <div className={styles.placeholderFallback} style={{ background: gradient }}>
            <span className={styles.placeholderInitials}>{initials}</span>
        </div>
    );
}

export default function SteamItemImage({
    imageUrl,
    alt,
    size = 'md',
    className,
    fallback,
}: SteamItemImageProps) {
    const [hasError, setHasError] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const imageDimension = IMAGE_DIMENSIONS[size];
    
    const gradientIndex = useMemo(() => {
        let hash = 0;
        for (let i = 0; i < alt.length; i++) {
            hash = ((hash << 5) - hash) + alt.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash) % RARITY_GRADIENTS.length;
    }, [alt]);

    const handleError = () => {
        setHasError(true);
        setIsLoading(false);
    };

    const handleLoad = () => {
        setIsLoading(false);
    };

    const showFallback = hasError || !imageUrl;
    const fallbackContent = fallback || <PlaceholderFallback alt={alt} gradient={RARITY_GRADIENTS[gradientIndex]} />;

    if (showFallback) {
        return <div className={`${styles.container} ${styles[size]} ${className || ''}`}>{fallbackContent}</div>;
    }

    return (
        <div className={`${styles.container} ${styles[size]} ${className || ''}`}>
            {isLoading && <div className={styles.skeleton} />}
            <img
                src={imageUrl}
                alt={alt}
                width={imageDimension}
                height={imageDimension}
                loading="lazy"
                onError={handleError}
                onLoad={handleLoad}
                className={`${styles.image} ${isLoading ? styles.loading : ''}`}
                data-testid="steam-item-image"
            />
        </div>
    );
}
