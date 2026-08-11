import { resolve } from "path";
import { defineConfig, loadEnv } from "electron-vite";
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
        "process.env.LDAP_URL": JSON.stringify(env.LDAP_URL || ""),
        "process.env.LDAP_DOMAIN": JSON.stringify(env.LDAP_DOMAIN || ""),
        "process.env.LDAP_SEARCH_BASE": JSON.stringify(
          env.LDAP_SEARCH_BASE || ""
        ),
        "process.env.LDAP_TLS_REJECT_UNAUTHORIZED": JSON.stringify(
          env.LDAP_TLS_REJECT_UNAUTHORIZED || "false"
        ),
        "process.env.LDAP_TIMEOUT_MS": JSON.stringify(
          env.LDAP_TIMEOUT_MS || "5000"
        ),
        "process.env.PARTS_CONFIG_URL": JSON.stringify(
          env.PARTS_CONFIG_URL || ""
        ),
        "process.env.PARTS_CONFIG_FILE": JSON.stringify(
          env.PARTS_CONFIG_FILE || "lps.json"
        ),
        "process.env.GITHUB_RELEASE_URL": JSON.stringify(
          env.GITHUB_RELEASE_URL || ""
        )
      },
    },
    preload: {
      build: {
        rollupOptions: {
          input: {
            index: resolve("src/preload/index.ts"),
            "label-format": resolve("src/preload/label-format.ts"),
          },
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
