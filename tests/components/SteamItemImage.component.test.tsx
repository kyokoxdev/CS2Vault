/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '../setup-component';
import SteamItemImage, { POPULAR_ITEMS } from '@/components/landing/SteamItemImage';

describe('SteamItemImage', () => {
    it('renders image with correct src', () => {
        render(<SteamItemImage imageUrl={POPULAR_ITEMS.AK47_REDLINE} alt="AK-47 Redline" />);

        const img = screen.getByTestId('steam-item-image') as HTMLImageElement;
        expect(img).toBeDefined();
        expect(img.src).toBe(POPULAR_ITEMS.AK47_REDLINE);
        expect(img.alt).toBe('AK-47 Redline');
    });

    it('has lazy loading attribute', () => {
        render(<SteamItemImage imageUrl={POPULAR_ITEMS.AWP_ASIIMOV} alt="AWP Asiimov" />);

        const img = screen.getByTestId('steam-item-image') as HTMLImageElement;
        expect(img.getAttribute('loading')).toBe('lazy');
    });

    it('shows fallback on image error', async () => {
        render(
            <SteamItemImage
                imageUrl="https://invalid-url.com/broken.jpg"
                alt="Broken image"
                fallback={<div data-testid="custom-fallback">Custom fallback</div>}
            />,
        );

        const img = screen.getByTestId('steam-item-image') as HTMLImageElement;

        img.dispatchEvent(new Event('error'));

        await waitFor(() => {
            expect(screen.getByTestId('custom-fallback')).toBeDefined();
        });
    });

    it('shows default fallback when no custom fallback provided', async () => {
        render(<SteamItemImage imageUrl="https://invalid-url.com/broken.jpg" alt="Broken image" />);

        const img = screen.getByTestId('steam-item-image') as HTMLImageElement;

        img.dispatchEvent(new Event('error'));

        await waitFor(() => {
            expect(screen.getByText('Image unavailable')).toBeDefined();
        });
    });

    it('applies size class correctly', () => {
        const { container } = render(
            <SteamItemImage imageUrl={POPULAR_ITEMS.KARAMBIT_FADE} alt="Karambit Fade" size="lg" />,
        );

        const containerDiv = container.querySelector('div');
        expect(containerDiv?.className).toContain('lg');
    });

    it('applies custom className', () => {
        const { container } = render(
            <SteamItemImage imageUrl={POPULAR_ITEMS.GLOCK_FADE} alt="Glock Fade" className="custom-class" />,
        );

        const containerDiv = container.querySelector('div');
        expect(containerDiv?.className).toContain('custom-class');
    });

    it('hides skeleton on image load', async () => {
        render(<SteamItemImage imageUrl={POPULAR_ITEMS.DEAGLE_BLAZE} alt="Desert Eagle Blaze" />);

        const img = screen.getByTestId('steam-item-image') as HTMLImageElement;

        img.dispatchEvent(new Event('load'));

        await waitFor(() => {
            expect(img.className).not.toContain('loading');
        });
    });

    it('exports popular items constant with valid URLs', () => {
        expect(POPULAR_ITEMS).toBeDefined();
        expect(POPULAR_ITEMS.AK47_REDLINE).toContain('steamstatic.com');
        expect(POPULAR_ITEMS.AWP_ASIIMOV).toContain('steamstatic.com');
        expect(POPULAR_ITEMS.M4A4_HOWL).toContain('steamstatic.com');
        expect(POPULAR_ITEMS.KARAMBIT_FADE).toContain('steamstatic.com');
        expect(POPULAR_ITEMS.GLOCK_FADE).toContain('steamstatic.com');
        expect(POPULAR_ITEMS.DEAGLE_BLAZE).toContain('steamstatic.com');
        expect(POPULAR_ITEMS.USPS_KILL_CONFIRMED).toContain('steamstatic.com');
        expect(POPULAR_ITEMS.BUTTERFLY_DOPPLER).toContain('steamstatic.com');
    });
});
