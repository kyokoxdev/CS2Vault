-- Add index for market-cap history reads by provider ordered by timestamp
CREATE INDEX "MarketCapSnapshot_provider_timestamp_idx" ON "MarketCapSnapshot"("provider", "timestamp");
