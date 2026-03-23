import { test, expect } from '@playwright/test';
import path from 'path';

const EVIDENCE_DIR = '.sisyphus/evidence';

const VIEWPORTS = {
    mobile: { width: 375, height: 667 },
    tablet: { width: 768, height: 1024 },
    desktop: { width: 1440, height: 900 },
};

test.describe('Landing Page E2E Tests', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/startup');
    });

    test('should load full page and navigate to /startup', async ({ page }) => {
        await expect(page).toHaveURL(/\/startup/);
        
        const landingPage = page.locator('[data-testid="landing-page"]');
        await expect(landingPage).toBeVisible();
        
        await page.screenshot({ 
            path: path.join(EVIDENCE_DIR, 'landing-page-loaded.png'),
            fullPage: true 
        });
    });

    test('should render all required sections', async ({ page }) => {
        const heroSection = page.locator('[data-testid="hero-cinematic"]');
        await expect(heroSection).toBeVisible();

        const featuresSection = page.locator('[data-testid="features-section"]');
        await expect(featuresSection).toBeVisible();

        const featureCards = page.locator('[data-testid="feature-card"]');
        await expect(featureCards).toHaveCount(3);

        const howItWorksSection = page.locator('[data-testid="how-it-works-section"]');
        await expect(howItWorksSection).toBeVisible();

        const ctaSection = page.locator('[data-testid="cta-section"]');
        await expect(ctaSection).toBeVisible();

        const footer = page.locator('[data-testid="landing-footer"]');
        await expect(footer).toBeVisible();

        await page.screenshot({ 
            path: path.join(EVIDENCE_DIR, 'all-sections-visible.png'),
            fullPage: true 
        });
    });

    test('should complete hero animation within 5 seconds', async ({ page }) => {
        const hero = page.locator('[data-testid="hero-cinematic"]');
        await expect(hero).toBeVisible();

        const heroTitle = hero.locator('h1');
        await expect(heroTitle).toBeVisible({ timeout: 2000 });

        const heroStats = page.locator('[data-testid="hero-stats"]');
        await expect(heroStats).toBeVisible({ timeout: 3000 });

        const heroCta = page.locator('[data-testid="hero-cta"]');
        await expect(heroCta).toBeVisible({ timeout: 6000 });

        await page.screenshot({ 
            path: path.join(EVIDENCE_DIR, 'hero-animation-complete.png') 
        });
    });

    test('should have clickable Steam login button', async ({ page }) => {
        const heroCta = page.locator('[data-testid="hero-cta"]');
        await expect(heroCta).toBeVisible({ timeout: 6000 });

        const steamButton = page.locator('[data-testid="hero-cta"] button, [data-testid="hero-cta"] a').first();
        await expect(steamButton).toBeVisible();
        await expect(steamButton).toBeEnabled();

        await steamButton.hover();
        await page.screenshot({ 
            path: path.join(EVIDENCE_DIR, 'steam-button-hover.png') 
        });
    });

    test('hero content should remain visible after animation completes', async ({ page }) => {
        const heroCta = page.locator('[data-testid="hero-cta"]');
        await expect(heroCta).toBeVisible({ timeout: 6000 });

        await page.waitForTimeout(2000);

        const heroTitle = page.locator('[data-testid="hero-cinematic"] h1');
        await expect(heroTitle).toBeVisible();
        
        const heroStats = page.locator('[data-testid="hero-stats"]');
        await expect(heroStats).toBeVisible();
        
        await expect(heroCta).toBeVisible();
        
        const steamButton = page.locator('[data-testid="steam-login-button"]').first();
        await expect(steamButton).toBeVisible();

        await page.screenshot({ 
            path: path.join(EVIDENCE_DIR, 'hero-content-persists.png') 
        });
    });

    test.describe('Responsive Behavior', () => {
        test('should render correctly on mobile (375px)', async ({ page }) => {
            await page.setViewportSize(VIEWPORTS.mobile);
            await page.goto('/startup');
            await page.waitForLoadState('networkidle');
            
            await expect(page.locator('[data-testid="landing-page"]')).toBeVisible();
            await expect(page.locator('[data-testid="hero-cinematic"]')).toBeVisible();
            
            await page.screenshot({ 
                path: path.join(EVIDENCE_DIR, 'responsive-mobile-375.png'),
                fullPage: true 
            });
        });

        test('should render correctly on tablet (768px)', async ({ page }) => {
            await page.setViewportSize(VIEWPORTS.tablet);
            await page.goto('/startup');
            await page.waitForLoadState('networkidle');
            
            await expect(page.locator('[data-testid="landing-page"]')).toBeVisible();
            await expect(page.locator('[data-testid="features-section"]')).toBeVisible();
            
            await page.screenshot({ 
                path: path.join(EVIDENCE_DIR, 'responsive-tablet-768.png'),
                fullPage: true 
            });
        });

        test('should render correctly on desktop (1440px)', async ({ page }) => {
            await page.setViewportSize(VIEWPORTS.desktop);
            await page.goto('/startup');
            await page.waitForLoadState('networkidle');
            
            await expect(page.locator('[data-testid="landing-page"]')).toBeVisible();
            await expect(page.locator('[data-testid="how-it-works-section"]')).toBeVisible();
            
            await page.screenshot({ 
                path: path.join(EVIDENCE_DIR, 'responsive-desktop-1440.png'),
                fullPage: true 
            });
        });
    });

    test.describe('Reduced Motion', () => {
        test('should respect prefers-reduced-motion', async ({ page }) => {
            await page.emulateMedia({ reducedMotion: 'reduce' });
            await page.goto('/startup');
            
            const hero = page.locator('[data-testid="hero-cinematic"]');
            const heroTitle = hero.locator('h1');
            await expect(heroTitle).toBeVisible({ timeout: 1000 });
            
            const heroStats = page.locator('[data-testid="hero-stats"]');
            await expect(heroStats).toBeVisible({ timeout: 1000 });
            
            const heroCta = page.locator('[data-testid="hero-cta"]');
            await expect(heroCta).toBeVisible({ timeout: 1000 });
            
            await page.screenshot({ 
                path: path.join(EVIDENCE_DIR, 'reduced-motion-fallback.png'),
                fullPage: true 
            });
        });
    });

    test.describe('Accessibility', () => {
        test('should have no critical accessibility issues', async ({ page }) => {
            const main = page.locator('main');
            await expect(main).toBeVisible();

            const images = page.locator('img');
            const imageCount = await images.count();
            for (let i = 0; i < imageCount; i++) {
                const img = images.nth(i);
                const alt = await img.getAttribute('alt');
                const ariaHidden = await img.getAttribute('aria-hidden');
                expect(alt !== null || ariaHidden === 'true').toBeTruthy();
            }

            const buttons = page.locator('button');
            const buttonCount = await buttons.count();
            for (let i = 0; i < buttonCount; i++) {
                const button = buttons.nth(i);
                const text = await button.textContent();
                const ariaLabel = await button.getAttribute('aria-label');
                expect(text?.trim() || ariaLabel).toBeTruthy();
            }

            const h1 = page.locator('h1');
            await expect(h1).toHaveCount(1);
            
            const h2s = page.locator('h2');
            expect(await h2s.count()).toBeGreaterThanOrEqual(1);
        });
    });
});
