import type { Doc } from "../convex/_generated/dataModel";

type Preferences = Pick<Doc<"trips">, "budget" | "currency" | "interests" | "accessibility">;

export function tripPreferences(data: FormData, saved: Preferences | undefined, planning: boolean) {
  if (!planning) return {
    budget: saved?.budget ?? null, currency: saved?.currency ?? "USD",
    interests: saved?.interests ?? [], accessibility: saved?.accessibility ?? "",
  };
  const value = (key: string) => String(data.get(key) ?? "").trim();
  return {
    budget: value("budget") === "" ? null : Number(value("budget")), currency: value("currency"),
    interests: value("interests").split(",").map((item) => item.trim()).filter(Boolean),
    accessibility: value("accessibility"),
  };
}
