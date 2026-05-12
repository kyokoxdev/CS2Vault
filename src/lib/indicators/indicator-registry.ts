export interface IndicatorRegistryEntry {
    id: string;
    name: string;
    shortName: string;
    category: "overlay" | "oscillator";
    overlay: boolean;
    defaultInputs: Record<string, number>;
    colors: string[];
    description: string;
}

export const indicatorRegistry: IndicatorRegistryEntry[] = [
    {
        id: "sma",
        name: "Simple Moving Average",
        shortName: "SMA",
        category: "overlay",
        overlay: true,
        defaultInputs: { length: 14 },
        colors: ["#3B82F6"],
        description: "Average price over a period"
    },
    {
        id: "ema",
        name: "Exponential Moving Average",
        shortName: "EMA",
        category: "overlay",
        overlay: true,
        defaultInputs: { length: 14 },
        colors: ["#F59E0B"],
        description: "Weighted average favoring recent prices"
    },
    {
        id: "bollinger",
        name: "Bollinger Bands",
        shortName: "BB",
        category: "overlay",
        overlay: true,
        defaultInputs: { length: 20, stdDev: 2 },
        colors: ["#8B5CF6", "#A78BFA", "#8B5CF6"],
        description: "Volatility bands around SMA"
    },
    {
        id: "volume",
        name: "Volume",
        shortName: "Vol",
        category: "overlay",
        overlay: true,
        defaultInputs: {},
        colors: ["#6B7280"],
        description: "Trading volume histogram"
    },
    {
        id: "rsi",
        name: "Relative Strength Index",
        shortName: "RSI",
        category: "oscillator",
        overlay: false,
        defaultInputs: { length: 14 },
        colors: ["#10B981"],
        description: "Momentum oscillator 0-100"
    },
    {
        id: "macd",
        name: "MACD",
        shortName: "MACD",
        category: "oscillator",
        overlay: false,
        defaultInputs: { fast: 12, slow: 26, signal: 9 },
        colors: ["#3B82F6", "#EF4444", "#10B981"],
        description: "Moving Average Convergence Divergence"
    },
    {
        id: "stochastic",
        name: "Stochastic Oscillator",
        shortName: "Stoch",
        category: "oscillator",
        overlay: false,
        defaultInputs: { k: 14, d: 3 },
        colors: ["#8B5CF6", "#EC4899"],
        description: "Momentum comparing close to range"
    },
    {
        id: "vwap",
        name: "Volume Weighted Average Price",
        shortName: "VWAP",
        category: "overlay",
        overlay: true,
        defaultInputs: {},
        colors: ["#06B6D4"],
        description: "Price weighted by volume"
    }
];

export function getIndicatorById(id: string): IndicatorRegistryEntry | undefined {
    return indicatorRegistry.find(indicator => indicator.id === id);
}
