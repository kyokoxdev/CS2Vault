"use client";

import { useEffect, useState } from "react";

const DEFAULT_REFRESH_INTERVAL_MIN = 15;

export function usePriceRefreshInterval(defaultValue: number = DEFAULT_REFRESH_INTERVAL_MIN) {
    const [priceRefreshIntervalMin, setPriceRefreshIntervalMin] = useState(defaultValue);

    useEffect(() => {
        let isMounted = true;

        fetch("/api/settings")
            .then((res) => res.json())
            .then((data) => {
                if (!isMounted) return;

                const configuredInterval = data?.priceRefreshIntervalMin;
                if (typeof configuredInterval === "number" && configuredInterval > 0) {
                    setPriceRefreshIntervalMin(configuredInterval);
                }
            })
            .catch(() => {
                if (!isMounted) return;
                setPriceRefreshIntervalMin(defaultValue);
            });

        return () => {
            isMounted = false;
        };
    }, [defaultValue]);

    return priceRefreshIntervalMin;
}
