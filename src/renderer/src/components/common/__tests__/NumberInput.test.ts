import { describe, expect, it } from "vitest";
import { NumberInput } from "../NumberInput";
import { computeNextStepperValue } from "@renderer/utils/numberInputUtils";

describe("NumberInput component and computeNextStepperValue", () => {
  it("exports NumberInput component correctly", () => {
    expect(NumberInput).toBeDefined();
    expect(NumberInput.displayName).toBe("NumberInput");
  });

  describe("computeNextStepperValue", () => {
    it("increments value by default step (1)", () => {
      const result = computeNextStepperValue({
        currentValue: 5,
        delta: 1,
      });
      expect(result).toBe(6);
    });

    it("decrements value by default step (1)", () => {
      const result = computeNextStepperValue({
        currentValue: 5,
        delta: -1,
      });
      expect(result).toBe(4);
    });

    it("supports custom step value", () => {
      const result = computeNextStepperValue({
        currentValue: 10,
        delta: 1,
        step: 5,
      });
      expect(result).toBe(15);
    });

    it("respects max limit", () => {
      const result = computeNextStepperValue({
        currentValue: 99,
        delta: 1,
        step: 5,
        max: 100,
      });
      expect(result).toBe(100);
    });

    it("does not exceed max limit when already at max", () => {
      const result = computeNextStepperValue({
        currentValue: 100,
        delta: 1,
        max: 100,
      });
      expect(result).toBe(100);
    });

    it("respects min limit", () => {
      const result = computeNextStepperValue({
        currentValue: 3,
        delta: -1,
        step: 5,
        min: 1,
      });
      expect(result).toBe(1);
    });

    it("does not go below min limit when already at min", () => {
      const result = computeNextStepperValue({
        currentValue: 1,
        delta: -1,
        min: 1,
      });
      expect(result).toBe(1);
    });

    it("handles string numbers correctly", () => {
      const result = computeNextStepperValue({
        currentValue: "42",
        delta: 1,
      });
      expect(result).toBe(43);
    });

    it("handles empty string with min defined", () => {
      const result = computeNextStepperValue({
        currentValue: "",
        delta: 1,
        min: 1,
      });
      expect(result).toBe(1);
    });

    it("handles empty string without min defined", () => {
      const result = computeNextStepperValue({
        currentValue: "",
        delta: 1,
      });
      expect(result).toBe(1);
    });

    it("handles invalid or NaN input gracefully", () => {
      const result = computeNextStepperValue({
        currentValue: "abc",
        delta: 1,
        min: 5,
      });
      expect(result).toBe(5);
    });
  });
});
