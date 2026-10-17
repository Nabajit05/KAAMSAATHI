import { describe, expect, it } from "vitest";
import { withCheck, type CaseRecord } from "@/domain/case";
import { groundingFor, templateComplaint, unsupportedNumbers } from "@/domain/complaint";
import { confirmFact, markUnknown, type FactSet } from "@/domain/facts";
import { fixtureCase, type FixtureId } from "@/fixtures/demo";

function checked(id: FixtureId): CaseRecord {
  const c = fixtureCase(id, "en");
  const facts: FactSet = {};
  for (const [k, f] of Object.entries(c.facts)) {
    if (f) facts[k as keyof FactSet] = f.reviewState === "unreadable" ? markUnknown(f) : confirmFact(f);
  }
  return withCheck({ ...c, facts });
}

describe("complaint grounding", () => {
  it.each(["A", "B", "C", "D", "E"] as FixtureId[])("template for fixture %s contains only grounded numbers", (id) => {
    const c = checked(id);
    for (const locale of ["en", "hi"] as const) {
      const text = templateComplaint(c, locale);
      expect(unsupportedNumbers(text, groundingFor(c))).toEqual([]);
    }
  });

  it("flags an invented amount", () => {
    const c = checked("A");
    const g = groundingFor(c);
    expect(unsupportedNumbers("You owe me ₹300 for 32 orders.", g)).toEqual([]);
    expect(unsupportedNumbers("You owe me ₹1,500 plus ₹300.", g)).toEqual(["1,500"]);
    expect(unsupportedNumbers("मुझे ₹९०० चाहिए", g)).toEqual(["900"]);
  });

  it("flags an invented date or ID", () => {
    const g = groundingFor(checked("A"));
    expect(unsupportedNumbers("On 3 October 2026", g)).toEqual([]);
    expect(unsupportedNumbers("On 14 October 2026, ticket 99812", g)).toEqual(["14", "99812"]);
  });

  it("states possible difference only when one exists", () => {
    expect(templateComplaint(checked("A"), "en")).toContain("Difference: ₹300");
    expect(templateComplaint(checked("B"), "en")).not.toContain("Difference");
    expect(templateComplaint(checked("D"), "en")).not.toContain("Difference");
  });

  it("does not assert liability", () => {
    const text = templateComplaint(checked("A"), "en").toLowerCase();
    expect(text).not.toMatch(/owe|liable|legal action|guarantee/);
  });
});
