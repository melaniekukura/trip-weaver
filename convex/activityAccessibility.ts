import { v } from "convex/values";
import type { Infer } from "convex/values";
import { safeDiscoveryUrl } from "./interestSearch";

export const activityAccessibilityEvidence = v.object({
  requirement: v.string(), conforms: v.boolean(), sourceUrl: v.string(), evidence: v.string(),
});
export const activityAccessibilityExtraction = { type: "array", maxItems: 50, items: {
  type: "object", required: ["requirement", "conforms", "evidence"], additionalProperties: false,
  properties: { requirement: { type: "string" }, conforms: { type: "boolean" }, evidence: { type: "string" } },
} };
export function parseActivityAccessibility(raw: unknown, markdown: string, url: string, requirements: string[]) {
  const result: Infer<typeof activityAccessibilityEvidence>[] = [];
  const sourceUrl = safeDiscoveryUrl(url);
  if (!sourceUrl?.startsWith("https://") || !Array.isArray(raw)) return result;
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  for (const item of raw.slice(0, 50)) {
    if (!item || typeof item !== "object" || typeof item.requirement !== "string" ||
      typeof item.conforms !== "boolean" || typeof item.evidence !== "string") continue;
    const requirement = requirements.find(value => value.trim().toLowerCase() === item.requirement.trim().toLowerCase());
    const evidence = normalize(item.evidence);
    if (!requirement || evidence.length < 8 || evidence.length > 400 || !normalize(markdown).includes(evidence)) continue;
    result.push({ requirement, conforms: item.conforms, evidence, sourceUrl });
  }
  return result;
}
