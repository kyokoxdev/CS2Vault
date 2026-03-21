import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        exclude: [
            "**/node_modules/**",
            "**/dist/**",
            "**/e2e/**",
            "**/*.spec.ts",
        ],
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
        },
    },
});



// For workspace projects, we define separate configs
// Node environment for unit tests
// JSDOM environment for component tests