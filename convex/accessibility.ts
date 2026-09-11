export type AccessibilityContext = "flights" | "accommodation" | "activities";
export type AccessibilityEvidence = { requirement: string; conforms: boolean; sourceUrl: string };

const accommodationOnly = new Set(["accessible hotel rooms", "roll-in showers", "bathroom grab bars", "adjustable room lighting",
  "fragrance-free accommodations"]);

export function accessibilityRequirements(value = "") {
  return [...new Set(value.split("\n").map(item => item.trim().toLowerCase()).filter(Boolean))];
}

export function checkAccessibility(requirements: string[], context: AccessibilityContext, evidence: AccessibilityEvidence[] = []) {
  const checks = requirements.map(requirement => {
    const key = requirement.trim().toLowerCase();
    if (context === "flights" && accommodationOnly.has(key)) return { requirement, status: "not-applicable" as const };
    const verified = evidence.filter(item => item.requirement.trim().toLowerCase() === key && /^https:\/\//.test(item.sourceUrl));
    const status = verified.some(item => !item.conforms) ? "not-met" as const
      : verified.some(item => item.conforms) ? "met" as const : "unverified" as const;
    return { requirement, status };
  });
  return { conforms: checks.every(check => check.status === "met" || check.status === "not-applicable"), checks };
}

export function checkFlightAccessibility(requirements: string[]) {
  // Flight listings currently contain no verified accessibility evidence.
  return checkAccessibility(requirements, "flights");
}
