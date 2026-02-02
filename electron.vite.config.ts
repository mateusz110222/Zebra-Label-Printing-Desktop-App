import { resolve } from "path";
import { defineConfig, loadEnv } from "electron-vite"; // USUNIĘTO: externalizeDepsPlugin
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    main: {
      plugins: [],
      build: {
        externalizeDeps: {
          exclude: ["electron-store"],
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
      plugins: [],
      build: {},
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
