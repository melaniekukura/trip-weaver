import { eventOutsideTrip } from "./interestDates";
import { expect, test } from "vitest";
import { diversifyIdeas, sameActivity } from "./interestDiversity";
import { interestQuery } from "./interestSearch";
import { discoverSpecificIdeas } from "./interestDiscovery";

test("Last Supper package variants are one activity rather than three recommendations", () => {
  const titles = ["Last Supper and the Best of Milan Guided Tour", "Private visit to the Last Supper", "Leonardo's Last Supper ticket with Milan audioguide"];
  expect(sameActivity({ title: titles[0] }, { title: titles[1] })).toBe(true);
  expect(sameActivity({ title: titles[0] }, { title: titles[2] })).toBe(true);
  const results = diversifyIdeas([titles.map((title, i) => ({ title, url: `https://provider${i}.com/tour` }))]);
  expect(results).toHaveLength(1);
});

test("interests are interleaved and one host cannot fill the activity shortlist", () => {
  const groups = [
    [{ title: "Cooking class", url: "https://food.example.com/class" }, { title: "Food market", url: "https://food.example.com/market" }],
    [{ title: "Design Museum", url: "https://museum.example.com/visit" }, { title: "Science Museum", url: "https://science.example.com/visit" }],
  ];
  expect(diversifyIdeas(groups).map(item => item.title)).toEqual(["Cooking class", "Design Museum", "Science Museum"]);
});

test("food queries do not inject museum or ticket keywords", () => {
  const search = { destination: "Milan, Italy", interests: ["Food"], kind: "activities" as const, startDate: "2026-09-25", endDate: "2026-10-04" };
  expect(interestQuery(search, "activities")).toContain("food markets cooking classes");
  expect(interestQuery(search, "activities")).not.toMatch(/museum|tickets/);
});

test("after one collection child the next source gets a turn", async () => {
  const visited: string[] = [];
  const result = await discoverSpecificIdeas([{ title: "Calendar", url: "https://first.example.com/list" }, { title: "Museum", url: "https://second.example.com/visit" }], async url => {
    visited.push(url);
    if (url.endsWith("list")) return { items: [], candidates: ["one", "two", "three"].map(title => ({ title, url: `https://first.example.com/${title}` })) };
    return { items: [{ title: url.includes("second") ? "Design Museum" : "Cooking class", description: "Details", url }], candidates: [] };
  }, { maxVisits: 3, activities: true });
  expect(visited[2]).toBe("https://second.example.com/visit"); expect(result.items).toHaveLength(2);
});


test("event discovery follows a calendar through a seasonal collection to the actual event", async () => {
  const result = await discoverSpecificIdeas([{ title: "Calendar", url: "https://city.example.com/calendar" }], async url => {
    if (url.endsWith("event")) return { items: [{ title: "Autumn exhibition", description: "September exhibition details", url }], candidates: [] };
    return { items: [], candidates: [{ title: "Exhibition", url: `https://city.example.com/${url.endsWith("calendar") ? "season" : "event"}` }] };
  }, { maxVisits: 3, maxDepth: 2 });
  expect(result.items.map(item => item.title)).toEqual(["Autumn exhibition"]);
});


test("event date ranges outside the trip are excluded, including Italian source dates", () => {
  expect(eventOutsideTrip("Dal 24 giugno al 20 settembre", "2026-09-25", "2026-10-04")).toBe(true);
  expect(eventOutsideTrip("September 20, 2026 – October 4, 2026", "2026-09-25", "2026-10-04")).toBe(false);
  expect(eventOutsideTrip("2026-10-05 – 2026-10-08", "2026-09-25", "2026-10-04")).toBe(true);
  expect(eventOutsideTrip(undefined, "2026-09-25", "2026-10-04")).toBe(false);
});


test("restaurant discovery continues past unreadable pages and permits distinct venues on one guide", async () => {
  const seeds = ["closed", "blocked", "a", "b", "c"].map((name, index) => ({ title: name, url: `https://${index < 2 ? name : "guide"}.example.com/${name}` }));
  const result = await discoverSpecificIdeas(seeds, async url => {
    if (/closed|blocked/.test(url)) throw new Error("Unreadable");
    return { items: [{ title: url.endsWith("a") ? "Osteria Aurora" : "Trattoria Bosco", description: "Regional cooking", url }], candidates: [] };
  }, { maxVisits: 8, maxItems: 5, perHost: 2, activities: true });
  expect(result.failedPages).toBe(2);
  expect(result.items.map(item => item.title)).toEqual(["Osteria Aurora", "Trattoria Bosco"]);
});
