import { describe, expect, it } from "vitest";
import { formatINR, parseMoney, paiseToInput, sumPaise } from "@/domain/money";

describe("parseMoney", () => {
  it.each([
    ["600", 60000],
    ["₹600", 60000],
    ["₹ 1,200.50", 120050],
    ["Rs. 300", 30000],
    ["INR 75", 7500],
    ["1,00,000", 10000000],
    ["100,000", 10000000],
    ["600/-", 60000],
    ["१२००", 120000],
    ["₹१,२००.५", 120050],
    ["0", 0],
    ["0.5", 50],
  ])("parses %s", (input, paise) => {
    expect(parseMoney(input)).toEqual({ ok: true, paise });
  });

  it("parses negatives only when allowed", () => {
    expect(parseMoney("-300")).toEqual({ ok: false, error: "negative_not_allowed" });
    expect(parseMoney("-₹300", { allowNegative: true })).toEqual({ ok: true, paise: -30000 });
    expect(parseMoney("₹-300", { allowNegative: true })).toEqual({ ok: true, paise: -30000 });
    expect(parseMoney("−₹300", { allowNegative: true })).toEqual({ ok: true, paise: -30000 });
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["abc", "invalid_format"],
    ["1.2.3", "invalid_format"],
    ["1e5", "invalid_format"],
    ["12,34", "invalid_format"],
    ["1,,000", "invalid_format"],
    ["1.234", "too_many_decimals"],
    ["$50", "unsupported_currency"],
    ["50 USD", "unsupported_currency"],
    ["99999999999999", "out_of_range"],
    ["2,00,00,000", "out_of_range"],
    ["--5", "invalid_format"],
  ])("rejects %s", (input, error) => {
    expect(parseMoney(input, { allowNegative: true })).toEqual({ ok: false, error });
  });
});

describe("formatINR", () => {
  it("uses Indian grouping and no floats", () => {
    expect(formatINR(60000)).toBe("₹600");
    expect(formatINR(120050)).toBe("₹1,200.50");
    expect(formatINR(10000000)).toBe("₹1,00,000");
    expect(formatINR(123456789)).toBe("₹12,34,567.89");
    expect(formatINR(-30000)).toBe("−₹300");
    expect(formatINR(30000, { signed: true })).toBe("+₹300");
    expect(formatINR(5)).toBe("₹0.05");
  });

  it("round-trips through the input format", () => {
    for (const p of [0, 5, 60000, 120050, -30000]) {
      const r = parseMoney(paiseToInput(p), { allowNegative: true });
      expect(r).toEqual({ ok: true, paise: p });
    }
  });
});

describe("sumPaise", () => {
  it("rejects non-integer values", () => {
    expect(() => sumPaise(1, 0.5)).toThrow(RangeError);
    expect(sumPaise(100, -50, 25)).toBe(75);
  });
});
