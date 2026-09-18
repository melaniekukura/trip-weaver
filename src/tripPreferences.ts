import type { Doc } from "../convex/_generated/dataModel";

type Preferences = Pick<Doc<"trips">, "budget" | "currency" | "interests" | "accessibility">;

export function tripPreferences(data: FormData, saved: Preferences | undefined, planning: boolean) {
  if (!planning) return {
    budget: saved?.budget ?? null, currency: saved?.currency ?? "USD",
    interests: saved?.interests ?? [], ...(saved ? { accessibility: saved.accessibility ?? "" } : {}),
  };
  const value = (key: string) => String(data.get(key) ?? "").trim();
  return {
    budget: data.has("budget") ? (value("budget") === "" ? null : Number(value("budget"))) : saved?.budget ?? null,
    currency: data.has("currency") ? value("currency") : saved?.currency ?? "USD",
    interests: data.getAll("interests").map(item => String(item).trim()).filter(Boolean),
    accessibility: value("accessibility"),
  };
}
