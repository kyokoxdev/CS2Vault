import "dotenv/config";
import { defineConfig } from "prisma/config";

const tursoUrl = process.env["TURSO_DATABASE_URL"];
const tursoToken = process.env["TURSO_AUTH_TOKEN"];

// Use Turso remote DB when configured, otherwise local SQLite file
const datasourceUrl = tursoUrl
  ? `${tursoUrl}?authToken=${tursoToken}`
  : process.env["DATABASE_URL"];

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    url: datasourceUrl,
  },
});
