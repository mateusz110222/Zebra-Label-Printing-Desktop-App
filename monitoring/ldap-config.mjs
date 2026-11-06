import { constants } from "node:crypto";
import { isIP } from "node:net";

const boolean = (value, fallback) => {
  if (!value?.trim()) return fallback;
  if (/^(true|1|yes|on)$/i.test(value)) return true;
  if (/^(false|0|no|off)$/i.test(value)) return false;
  throw new Error("Invalid LDAP boolean");
};
const timeout = (value, fallback) => {
  const parsed = Number(value || fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 1)
    throw new Error("Invalid LDAP timeout");
  return parsed;
};
const escapeFilter = (value) =>
  value.replace(
    /[\\*()\0]/g,
    (char) => "\\" + char.charCodeAt(0).toString(16).padStart(2, "0"),
  );

export function ldapConfig(env) {
  const url = new URL(env.LDAP_URL);
  if (
    url.protocol !== "ldaps:" ||
    url.username ||
    url.password ||
    (url.pathname && url.pathname !== "/") ||
    url.search ||
    url.hash
  )
    throw new Error("LDAP_URL must be an LDAPS server URL");
  const domain = (env.LDAP_LOGIN_DOMAIN || env.LDAP_DOMAIN || "").trim();
  if (!domain || !env.LDAP_SEARCH_BASE?.trim())
    throw new Error("LDAP domain and search base are required");
  const departments = (env.LDAP_IT_DEPARTMENTS || "")
    .split(/[;,]/)
    .map((value) => value.trim())
    .filter(Boolean);
  const rules = departments.map(
    (value) => `(department=${escapeFilter(value)})`,
  );
  if (env.LDAP_IT_GROUP_DN?.trim())
    rules.push(`(memberOf=${escapeFilter(env.LDAP_IT_GROUP_DN.trim())})`);
  if (!rules.length)
    throw new Error("Configure LDAP_IT_DEPARTMENTS or LDAP_IT_GROUP_DN");
  const it = `(|${rules.join("")})`;
  const identity = "(|(sAMAccountName=%s)(userPrincipalName=%s)(mail=%s))";
  const operationTimeout = timeout(env.LDAP_TIMEOUT_MS, 5000);
  const connectTimeout = timeout(env.LDAP_CONNECT_TIMEOUT_MS, 3000);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const tlsOptions = {
    host: hostname,
    port: Number(url.port || 636),
    ...(isIP(hostname) ? {} : { servername: hostname }),
    rejectUnauthorized: boolean(env.LDAP_TLS_REJECT_UNAUTHORIZED, true),
    ...(boolean(env.LDAP_TLS_SKIP_HOSTNAME_VERIFICATION, true)
      ? { checkServerIdentity: () => undefined }
      : {}),
    ...(boolean(env.LDAP_TLS_ALLOW_LEGACY_SERVER_CERT, false)
      ? { secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT }
      : {}),
  };
  // Grafana cannot skip only hostname verification; the private bridge verifies LDAPS upstream.
  const toml = [
    [1, "Editor", `(&${identity}${it})`],
    [2, "Viewer", `(&${identity}(!${it}))`],
  ]
    .map(
      ([org, role, filter]) => `
[[servers]]
host = "ldap"
port = 1389
use_ssl = false
timeout = ${Math.ceil(operationTimeout / 1000)}
bind_dn = ${JSON.stringify("%s@" + domain)}
search_filter = ${JSON.stringify(filter)}
search_base_dns = [${JSON.stringify(env.LDAP_SEARCH_BASE.trim())}]

[servers.attributes]
name = "givenName"
surname = "sn"
username = "sAMAccountName"
member_of = "memberOf"
email = "mail"

[[servers.group_mappings]]
group_dn = "*"
org_id = ${org}
org_role = "${role}"
grafana_admin = false
`,
    )
    .join("\n");
  return {
    toml,
    tlsOptions,
    connectTimeout,
    operationTimeout,
    caPath: env.LDAP_CA_CERT_PATH?.trim(),
  };
}
