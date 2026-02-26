/**
 * Custom Steam OpenID 2.0 Provider for NextAuth v5
 *
 * Steam uses OpenID 2.0 (not OAuth/OIDC), so we implement a custom
 * provider that handles the redirect and verification flow.
 *
 * Flow:
 * 1. User clicks "Login with Steam"
 * 2. Redirect to Steam OpenID endpoint
 * 3. Steam redirects back with claimed_id containing SteamID64
 * 4. We verify the assertion and extract the SteamID
 * 5. Fetch player profile from Steam Web API
 */

const STEAM_OPENID_URL = "https://steamcommunity.com/openid/login";
const STEAM_API_URL = "https://api.steampowered.com";

interface SteamPlayerSummary {
    steamid: string;
    personaname: string;
    avatarfull: string;
    profileurl: string;
    personastate: number;
}

/**
 * Extract SteamID64 from the OpenID claimed_id URL.
 * Format: https://steamcommunity.com/openid/id/76561198012345678
 */
export function extractSteamId(claimedId: string): string | null {
    const match = claimedId.match(
        /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d+)$/
    );
    return match ? match[1] : null;
}

/**
 * Build the Steam OpenID authentication URL.
 */
export function buildSteamAuthUrl(returnUrl: string): string {
    const params = new URLSearchParams({
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.mode": "checkid_setup",
        "openid.return_to": returnUrl,
        "openid.realm": new URL(returnUrl).origin,
        "openid.identity":
            "http://specs.openid.net/auth/2.0/identifier_select",
        "openid.claimed_id":
            "http://specs.openid.net/auth/2.0/identifier_select",
    });

    return `${STEAM_OPENID_URL}?${params.toString()}`;
}

/**
 * Verify a Steam OpenID assertion by calling Steam's verification endpoint.
 */
export async function verifySteamAssertion(
    params: URLSearchParams
): Promise<boolean> {
    const verifyParams = new URLSearchParams(params);
    verifyParams.set("openid.mode", "check_authentication");

    const res = await fetch(STEAM_OPENID_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: verifyParams.toString(),
    });

    const text = await res.text();
    return text.includes("is_valid:true");
}

/**
 * Fetch a Steam player's profile from the Steam Web API.
 */
export async function fetchSteamProfile(
    steamId: string
): Promise<SteamPlayerSummary | null> {
    const apiKey = process.env.STEAM_API_KEY;
    if (!apiKey) {
        console.error("[Steam] STEAM_API_KEY not configured");
        return null;
    }

    const url = new URL(
        `${STEAM_API_URL}/ISteamUser/GetPlayerSummaries/v0002/`
    );
    url.searchParams.set("key", apiKey);
    url.searchParams.set("steamids", steamId);

    const res = await fetch(url.toString());
    if (!res.ok) return null;

    const data = await res.json();
    const players = data?.response?.players;
    return players?.[0] ?? null;
}
