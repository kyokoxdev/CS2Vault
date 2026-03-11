"use client";

import styles from "./SteamLoginButton.module.css";

export default function SteamLoginButton() {
    return (
        <a
            href="/api/auth/steam/login"
            className={styles.steamButton}
            data-testid="steam-login-button"
        >
            <img
                src="https://steamcommunity-a.akamaihd.net/public/images/signinthroughsteam/sits_01.png"
                alt="Sign in through Steam"
                className={styles.steamImage}
                data-testid="steam-login-image"
            />
        </a>
    );
}
