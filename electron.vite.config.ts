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
        "process.env.LDAP_URL": JSON.stringify(env.LDAP_URL || ""),
        "process.env.LDAP_LOGIN_DOMAIN": JSON.stringify(
          env.LDAP_LOGIN_DOMAIN || "",
        ),
        "process.env.LDAP_SEARCH_BASE": JSON.stringify(
          env.LDAP_SEARCH_BASE || "",
        ),
        "process.env.LDAP_TLS_REJECT_UNAUTHORIZED": JSON.stringify(
          env.LDAP_TLS_REJECT_UNAUTHORIZED || "true",
        ),
        "process.env.LDAP_TLS_ALLOW_LEGACY_SERVER_CERT": JSON.stringify(
          env.LDAP_TLS_ALLOW_LEGACY_SERVER_CERT || "false",
        ),
        "process.env.LDAP_CA_CERT_PATH": JSON.stringify(
          env.LDAP_CA_CERT_PATH || "",
        ),
        "process.env.LDAP_TIMEOUT_MS": JSON.stringify(
          env.LDAP_TIMEOUT_MS || "5000",
        ),
        "process.env.LDAP_CONNECT_TIMEOUT_MS": JSON.stringify(
          env.LDAP_CONNECT_TIMEOUT_MS || "3000",
        ),
        "process.env.LDAP_IT_DEPARTMENTS": JSON.stringify(
          env.LDAP_IT_DEPARTMENTS || "IT",
        ),
        "process.env.PARTS_CONFIG_URL": JSON.stringify(
          env.PARTS_CONFIG_URL || "",
        ),
        "process.env.PARTS_CONFIG_FILE": JSON.stringify(
          env.PARTS_CONFIG_FILE || "lps.json",
        ),
        "process.env.GITHUB_RELEASE_URL": JSON.stringify(
          env.GITHUB_RELEASE_URL || "",
        ),
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
