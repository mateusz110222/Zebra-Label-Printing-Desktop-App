import { resolve } from "path";
import { defineConfig, loadEnv } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import pkg from "./package.json";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const externalDeps = Object.keys(pkg.dependencies || {});

  return {
    main: {
      build: {
        rollupOptions: {
          external: externalDeps,
        },
      },
      define: {
        "process.env.DB_HOST": JSON.stringify(env.DB_HOST),
        "process.env.DB_USER": JSON.stringify(env.DB_USER),
        "process.env.DB_PASSWORD": JSON.stringify(env.DB_PASSWORD),
        "process.env.DB_NAME": JSON.stringify(env.DB_NAME),
      },
    },
    preload: {
      build: {
        rollupOptions: {
          external: externalDeps,
        },
      },
    },
    renderer: {
      resolve: {
        alias: {
          "@renderer": resolve("src/renderer/src"),
        },
      },
      plugins: [react(), tailwindcss()],
    },
  };
});
