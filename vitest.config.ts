import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        include: ["src/**/*.{test,spec}.{js,ts,tsx}"],
        exclude: ["node_modules", "out", "dist"],
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
            exclude: ["node_modules", "out", "dist", "**/*.d.ts"],
        },
    },
    resolve: {
        alias: {
            "@backend": resolve(__dirname, "./src/backend"),
            "@renderer": resolve(__dirname, "./src/renderer/src"),
        },
    },
});
