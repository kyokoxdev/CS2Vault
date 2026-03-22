'use client';

import { useState } from 'react';
import styles from './SteamItemImage.module.css';

interface SteamItemImageProps {
    imageUrl: string; // Full Steam CDN URL
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

export const POPULAR_ITEMS = {
    AK47_REDLINE: 'https://community.akamai.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpot7HxfDhjxszJemkV09-5lpKKqPrxN7LEm1Rd6dd2j6fA9Nyn2gTgqRI6Nmj0doaQdlJtMwrT-FK-wOnsgsC-tJ_BznZjsyEh5SvelQv330-5iC1cfA',
    AWP_ASIIMOV: 'https://community.akamai.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpot621FAR17PLfYQJD_9W7m5a0mvLwOq7c2D1Q7MBOhuDG_ZjKhFWmrBQ5fWGldoTBdFJoMgnW-QK_lebthpPpupnN1zI97eqJMvvG',
    M4A4_HOWL: 'https://community.akamai.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpou-6kejhjxszFJQJD_9W0mIW0m_7zO6-fkm5D8fp9g-7J4bP5iUazrl07azj3JdDBJAQ3ZFzUqAO6k-7m0cDqucvIynZkvD5iuyh4RWpTAQ',
    KARAMBIT_FADE: 'https://community.akamai.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpovbSsLQJf2PLacDBA5ciJlZG0mP74Nr_ummJW4NE_0u2R9I-g0FHn-0Q_Nz2iLYDHcwU6NFyF-lm5yO-515C87p_IwHMwpGB8srBcMDk0',
    GLOCK_FADE: 'https://community.akamai.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgposbaqKAxf0v73dC5K7eO3g5C0mvLwOq7c2G5Qvpdw3ejH94-k2FK1-BVpYW_3LYKWdwRsMgyGr1C-xLzxxcjrXJHx6Q',
    DEAGLE_BLAZE: 'https://community.akamai.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgposr-kLAtl7PLZTjlH_9mkgIW0m_7zO6-fxmpB18h0juDU-LP5gVO8vys5ZjigJIXEJ1Q6aVvRr1foxO_u1sXqvsjKy3Vnsngh5HmJnhCpwUYbZv-GJuk',
    USPS_KILL_CONFIRMED: 'https://community.akamai.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpopbmkOVUw7PvRTi5K7_GJmImMn-O6YeDVk2VQ4NFOhuDG_ZjKhFWmrBQ5fWGldoTBdFJoMgnW-QK_lebth8To7snLyHFgs3Uu7CqOlxO-1hwffrJThqfOUUJMRPTJHwuFy_Y',
    BUTTERFLY_DOPPLER: 'https://community.akamai.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpovbSsLQJf0ebcZThQ6tCvq4GFk8jzIb7IqWdQ-sJ0teXI8oThxlbjrkI9NWH3cYbAdQJtMw3V_wC8366x0p-u-JHWnq_VSEQ',
} as const;

export default function SteamItemImage({
    imageUrl,
    alt,
    size = 'md',
    className,
    fallback = <div className={styles.fallback}>Image unavailable</div>,
}: SteamItemImageProps) {
    const [hasError, setHasError] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const imageDimension = IMAGE_DIMENSIONS[size];

    const handleError = () => {
        setHasError(true);
        setIsLoading(false);
    };

    const handleLoad = () => {
        setIsLoading(false);
    };

    if (hasError) {
        return <div className={`${styles.container} ${styles[size]} ${className || ''}`}>{fallback}</div>;
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
