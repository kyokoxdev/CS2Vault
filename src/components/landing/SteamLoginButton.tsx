"use client";

import styles from "./SteamLoginButton.module.css";

export default function SteamLoginButton() {
    return (
        // eslint-disable-next-line @next/next/no-html-link-for-pages
        <a
            href="/api/auth/steam/login"
            className={styles.steamButton}
            aria-label="Sign in through Steam"
            data-testid="steam-login-button"
        >
            <img
                src="https://steamcommunity-a.akamaihd.net/public/images/signinthroughsteam/sits_01.png"
                alt="Sign in through Steam"
                width={180}
                height={35}
                className={styles.steamImage}
                data-testid="steam-login-image"
            />
        </a>
    );
}
