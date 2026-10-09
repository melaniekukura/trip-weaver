import { expect, test } from "vitest";
import { parseActivityAccessibility } from "./activityAccessibility";
import { checkAccessibility } from "./accessibility";
import { parseInterestPage } from "./interestDetails";
import { interestSearchKey, sightseeingQuery } from "./interestSearch";

test("only requested requirements with actual page evidence can be marked met or missing", () => {
  const evidence = parseActivityAccessibility([
    { requirement: "Step-free access", conforms: false, evidence: "There is no step-free access to the tower." },
    { requirement: "Captioned experiences", conforms: true, evidence: "All films have captions." },
    { requirement: "Audio description", conforms: true, evidence: "Invented text" },
    { requirement: "Unrequested", conforms: false, evidence: "All films have captions." },
  ], "There is no step-free access to the tower. All films have captions.", "https://museum.example/access", ["Step-free access", "Captioned experiences", "Audio description"]);
  expect(evidence).toHaveLength(2);
  expect(checkAccessibility(["Step-free access", "Captioned experiences", "Audio description"], "activities", evidence).checks.map(check => check.status))
    .toEqual(["not-met", "met", "unverified"]);
  expect(parseActivityAccessibility([{ requirement: "Step-free access", conforms: false, evidence: "A barrier is present." }], "A barrier is present.", "javascript:alert(1)", ["Step-free access"])).toEqual([]);
});

test("activity parsing retains barriers instead of filtering the result", () => {
  const raw = { pageType: "individual", relevant: true, name: "Tower", excerpt: "Explore the historic tower.",
    accessibility: [{ requirement: "Step-free access", conforms: false, evidence: "Access is via stairs only." }] };
  const parsed = parseInterestPage(raw, "Tower. Explore the historic tower. Access is via stairs only.", "https://museum.example/tower", [], ["Step-free access"]);
  expect(parsed.items).toHaveLength(1);
  expect(parsed.items[0].accessibilityEvidence?.[0].conforms).toBe(false);
  expect(parseInterestPage({ ...raw, accessibility: [] }, "Tower. Explore the historic tower.", "https://museum.example/tower", [], ["Step-free access"]).items[0].accessibilityEvidence).toEqual([]);
});

test("accessibility selections isolate cached searches, and sightseeing queries cover permanent attractions", () => {
  const search = { destination: "Paris", startDate: "2026-10-01", endDate: "2026-10-05", interests: ["Art"], kind: "both" as const };
  expect(interestSearchKey(search)).not.toBe(interestSearchKey({ ...search, accessibility: ["Step-free access"] }));
  expect(interestSearchKey({ ...search, accessibility: ["Step-free access", "Captioned experiences"] })).toBe(interestSearchKey({ ...search, accessibility: ["captioned experiences", "step-free access"] }));
  expect(sightseeingQuery("Paris, France (PAR; all airports)", "museums")).toContain("permanent collections");
  expect(sightseeingQuery("Paris", "landmarks")).toContain("monuments landmarks tourist attractions");
});
