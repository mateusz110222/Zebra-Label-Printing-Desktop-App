export function parseMonitoringConfiguration(text: string): {
  url: string;
  stationId: string;
  token: string;
  synthetic: boolean;
} {
  const value = JSON.parse(text);
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.url !== "string" ||
    value.url.length > 2048 ||
    typeof value.stationId !== "string" ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(value.stationId) ||
    typeof value.token !== "string" ||
    !/^[a-zA-Z0-9_-]{32,256}$/.test(value.token) ||
    typeof value.synthetic !== "boolean"
  )
    throw new Error("Invalid monitoring configuration");
  const url = new URL(value.url);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.href !== url.origin + "/"
  )
    throw new Error("Invalid monitoring URL");
  return {
    url: url.origin,
    stationId: value.stationId,
    token: value.token,
    synthetic: value.synthetic,
  };
}
