import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ldapConfig } from "./ldap-config.mjs";

const env = {
  LDAP_URL: "ldaps://ldap.example.com:3269",
  LDAP_LOGIN_DOMAIN: "example.com",
  LDAP_SEARCH_BASE: "DC=example,DC=com",
  LDAP_TIMEOUT_MS: "5000",
  LDAP_CONNECT_TIMEOUT_MS: "3000",
  LDAP_TLS_REJECT_UNAUTHORIZED: "true",
  LDAP_TLS_SKIP_HOSTNAME_VERIFICATION: "true",
  LDAP_IT_DEPARTMENTS:
    "IT",
};

test("uses the same department allowlist and separates IT from Production", () => {
  const { toml, tlsOptions, connectTimeout, operationTimeout } =
    ldapConfig(env);
  for (const department of env.LDAP_IT_DEPARTMENTS.split(";")) {
    assert.ok(toml.includes(`(department=${department})`));
  }
  assert.match(toml, /org_id = 1\norg_role = "Editor"/);
  assert.match(toml, /org_id = 2\norg_role = "Viewer"/);
  assert.match(toml, /\(!\(\|\(department=/);
  assert.equal((toml.match(/grafana_admin = false/g) || []).length, 2);
  assert.equal(tlsOptions.host, "ldap.example.com");
  assert.equal(tlsOptions.port, 3269);
  assert.equal(tlsOptions.rejectUnauthorized, true);
  assert.equal(tlsOptions.checkServerIdentity(), undefined);
  assert.equal(connectTimeout, 3000);
  assert.equal(operationTimeout, 5000);
});

test("can verify the hostname, use a CA and fall back to LDAP_DOMAIN", () => {
  const result = ldapConfig({
    ...env,
    LDAP_LOGIN_DOMAIN: "",
    LDAP_DOMAIN: "fallback.example.com",
    LDAP_CA_CERT_PATH: "certs/company-enterprise-root.pem",
    LDAP_TLS_SKIP_HOSTNAME_VERIFICATION: "false",
  });
  assert.equal(result.tlsOptions.checkServerIdentity, undefined);
  assert.equal(result.tlsOptions.rejectUnauthorized, true);
  assert.equal(result.caPath, "certs/company-enterprise-root.pem");
  assert.match(result.toml, /%s@fallback.example.com/);
});

test("escapes LDAP filter values and permits an exact optional AD group", () => {
  const { toml } = ldapConfig({
    ...env,
    LDAP_IT_DEPARTMENTS: "a*)(department=*)",
    LDAP_IT_GROUP_DN: "CN=IT,OU=Groups,DC=example,DC=com",
  });
  assert.ok(!toml.includes("(department=a*)"));
  assert.ok(toml.includes("a\\\\2a\\\\29\\\\28department=\\\\2a\\\\29"));
  assert.ok(toml.includes("(memberOf=CN=IT,OU=Groups,DC=example,DC=com)"));
});

test("rejects insecure or incomplete authentication configuration", () => {
  for (const change of [
    { LDAP_URL: "ldap://ldap.example.com" },
    { LDAP_URL: "ldaps://user:password@ldap.example.com" },
    { LDAP_LOGIN_DOMAIN: "" },
    { LDAP_SEARCH_BASE: "" },
    { LDAP_IT_DEPARTMENTS: "" },
    { LDAP_TIMEOUT_MS: "invalid" },
    { LDAP_CONNECT_TIMEOUT_MS: "0" },
    { LDAP_TLS_REJECT_UNAUTHORIZED: "invalid" },
  ])
    assert.throws(() => ldapConfig({ ...env, ...change }));
});

test("public Grafana requires LDAP and provisioning uses an unpublished instance", () => {
  const compose = readFileSync(
    new URL("./compose.yaml", import.meta.url),
    "utf8",
  ).replaceAll("\r\n", "\n");
  const runtime = compose
    .split("\n  grafana:\n")[1]
    .split("\n  dashboards:")[0];
  assert.match(runtime, /GF_AUTH_LDAP_ENABLED: "true"/);
  assert.match(runtime, /GF_AUTH_DISABLE_LOGIN: "true"/);
  assert.match(runtime, /GF_AUTH_BASIC_ENABLED: "false"/);
  assert.match(runtime, /GF_AUTH_ANONYMOUS_ENABLED: "false"/);
  assert.ok(!runtime.includes("ports:"));
  const bootstrap = compose
    .split("\n  grafana-bootstrap:\n")[1]
    .split("\n  grafana:")[0];
  assert.ok(!bootstrap.includes("ports:"));
  assert.ok(!/^\s+LDAP_ENABLED:/m.test(compose));
});
