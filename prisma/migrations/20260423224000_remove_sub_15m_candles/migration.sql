-- Remove legacy candlesticks below 15-minute granularity
DELETE FROM "Candlestick"
WHERE "interval" IN ('1m', '5m');
