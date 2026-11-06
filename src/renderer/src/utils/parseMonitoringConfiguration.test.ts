import { expect, it } from "vitest";
import { parseMonitoringConfiguration } from "./parseMonitoringConfiguration";

const config = {
  url: "http://10.142.11.66:8083/",
  stationId: "audi-01",
  token: "a".repeat(64),
  synthetic: false,
};
it("accepts a copied station configuration and normalizes the origin", () => {
  expect(parseMonitoringConfiguration(JSON.stringify(config))).toEqual({
    ...config,
    url: "http://10.142.11.66:8083",
  });
});
it.each([
  "{broken",
  "null",
  JSON.stringify({ ...config, token: "short" }),
  JSON.stringify({ ...config, stationId: "bad/id" }),
  JSON.stringify({ ...config, url: "file:///tmp" }),
  JSON.stringify({ ...config, url: "http://user:password@example.com" }),
  JSON.stringify({ ...config, synthetic: "false" }),
])("rejects invalid pasted configuration: %s", (text) => {
  expect(() => parseMonitoringConfiguration(text)).toThrow();
});
