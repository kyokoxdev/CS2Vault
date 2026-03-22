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
    AK47_REDLINE: 'https://community.cloudflare.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwlcK3wiFO0POlPPNSI_-RHGavzOtyufRkASq2lkxx4W-HnNyqJC3FZwYoC5p0Q7FfthW6wdWxPu-371Pdit5HnyXgznQeHYY5wyA',
    AWP_ASIIMOV: 'https://community.cloudflare.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwiYbf_jdk7uW-V6V-Kf2cGFidxOp_pewnF3nhxEt0sGnSzN76dH3GOg9xC8FyEORftRe-x9PuYurq71bW3d8UnjK-0H0YSTpMGQ',
    M4A4_HOWL: 'https://community.cloudflare.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwiFO0P_6afVSKP-EAm6extF6ueZhW2exwkl2tmTXwt39eCiUPQR2DMN4TOVetUK8xoLgM-K341eM2otDnC6okGoXufBz_TAB',
    KARAMBIT_FADE: 'https://community.cloudflare.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Q7uCvZaZkNM-SD1iWwOpzj-1gSCGn20tztm_UyIn_JHKUbgYlWMcmQ-ZcskSwldS0MOnntAfd3YlMzH35jntXrnE8SOGRGG8',
    GLOCK_FADE: 'https://community.cloudflare.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL2kpnj9h1a7s2oaaBoH_yaCW-Ej-8u5bZvHnq1w0Vz62TUzNj4eCiVblMmXMAkROJeskLpkdXjMrzksVTAy9US8PY25So',
    DEAGLE_BLAZE: 'https://community.cloudflare.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL1m5fn8Sdk7vORbqhsLfWAMWuZxuZi_uI_TX6wxxkjsGXXnImsJ37COlUoWcByEOMOtxa5kdXmNu3htVPZjN1bjXKpkHLRfQU',
    USPS_KILL_CONFIRMED: 'https://community.cloudflare.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLkjYbf7itX6vytbbZSI-WsG3SA_uV_vO1WTCa9kxQ1vjiBpYPwJiPTcFB2Xpp5TO5cskG9lYCxZu_jsVCL3o4Xnij23ClO5ik9tegFA_It8qHJz1aWe-uc160',
    BUTTERFLY_DOPPLER: 'https://community.cloudflare.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Z-ua6bbZrLOmsD2qvxeFmoO1sXRajnRw0tmy6lob-KT-JOgRzAsZ3RuNfs0a5x9HhYuLj4gbbg99NySr6iy4d6C9t4r0EUqF0qLqX0V8wFp5G5A',
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
