import { describe, expect, it } from "vitest";
import { parseHostStatus } from "../parseHostStatus";

const hostStatus = (first: string[], second: string[]): string =>
  `\x02${first.join(",")}\x03\x02${second.join(",")}\x03\x02PASS\x03`;

describe("parseHostStatus", () => {
  it("recognizes a ready printer and queue counters", () => {
    const first = ["0", "0", "0", "0", "2", "0", "0", "0", "0", "0", "0", "0"];
    const second = ["0", "0", "0", "0", "0", "0", "0", "4"];

    const result = parseHostStatus(hostStatus(first, second));

    expect(result.ready).toBe(true);
    expect(result.status).toBe(true);
    expect(result.message).toBe("backend.printer.ready");
    expect(result.data?.formatsInBuffer).toBe(2);
    expect(result.data?.labelsRemaining).toBe(4);
  });

  it("reports paper-out as a not-ready device", () => {
    const first = ["0", "1", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
    const second = ["0", "0", "0", "0", "0", "0", "0", "0"];

    const result = parseHostStatus(hostStatus(first, second));

    expect(result.reachable).toBe(true);
    expect(result.ready).toBe(false);
    expect(result.data?.paperOut).toBe(true);
    expect(result.message).toBe("backend.printer.paper_out");
  });

  it("does not claim readiness for an incomplete response", () => {
    const result = parseHostStatus("unexpected response");

    expect(result.reachable).toBe(true);
    expect(result.ready).toBe(false);
    expect(result.detailsAvailable).toBe(false);
  });
});
