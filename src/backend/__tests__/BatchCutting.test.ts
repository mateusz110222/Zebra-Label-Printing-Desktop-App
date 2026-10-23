import { describe, expect, it } from "vitest";
import { applyBatchCutting } from "../hooks/BatchCutting";

const template =
  "^XA\n^MNY\n^PW800\n^LL800\n^LT00\n^FO60,65^BXN,5,200,0,0,1,^FDPC262780001^FS\n^PQ1,3,0,N\n^MMC\n^XZ";

describe("cut only at the end of a serialized batch", () => {
  it.each([1, 3, 5, 8])(
    "cuts only the final label of a batch of %i, regardless of template interval",
    (quantity) => {
      const labels = Array.from({ length: quantity }, (_, position) =>
        applyBatchCutting(template, position, quantity),
      );
      expect(labels.filter((label) => !label.includes("^XB"))).toHaveLength(1);
      for (let i = 0; i < quantity; i++) {
        expect(labels[i].includes("^XB")).toBe(i < quantity - 1);
        expect(labels[i]).toContain("^PQ1,0,0,Y");
        expect(labels[i]).not.toContain("^PQ5");
        expect(labels[i]).toContain("^MMC");
      }
    },
  );
  it("leaves other print modes unchanged", () => {
    const tearOff = template.replace("^MMC", "^MMT");
    expect(applyBatchCutting(tearOff, 0, 5)).toBe(tearOff);
  });
  it("makes the final label cut even if the template already suppresses cutting", () => {
    expect(
      applyBatchCutting(template.replace("^XZ", "^XB^XZ"), 4, 5),
    ).not.toContain("^XB");
  });
});
