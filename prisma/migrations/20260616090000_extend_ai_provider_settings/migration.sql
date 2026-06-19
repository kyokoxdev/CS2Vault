-- AlterTable: add additional AI provider credential slots
ALTER TABLE "AppSettings" ADD COLUMN "anthropicApiKey" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN "openRouterApiKey" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN "nineRouterApiKey" TEXT;

-- Normalize legacy default value stored by early versions.
UPDATE "AppSettings"
SET "activeAIProvider" = 'gemini-flash'
WHERE "activeAIProvider" = 'gemini-pro';
