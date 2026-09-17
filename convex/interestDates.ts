const months = [
  ["january", "jan", "gennaio"], ["february", "feb", "febbraio"], ["march", "mar", "marzo"],
  ["april", "apr", "aprile"], ["may", "maggio"], ["june", "jun", "giugno"],
  ["july", "jul", "luglio"], ["august", "aug", "agosto"], ["september", "sep", "sept", "settembre"],
  ["october", "oct", "ottobre"], ["november", "nov", "novembre"], ["december", "dec", "dicembre"],
];

export function eventOutsideTrip(dates: string | undefined, start: string, end: string) {
  if (!dates) return false;
  const names = months.flat().join("|");
  const pattern = new RegExp(`\\b(?:(\\d{1,2})\\s+(${names})|(${names})\\s+(\\d{1,2}))(?:,?\\s+(20\\d{2}))?\\b`, "gi");
  const matches = [...dates.matchAll(pattern)];
  const iso = dates.match(/\b20\d{2}-\d{2}-\d{2}\b/g);
  const values = iso?.length ? iso : matches.map(match => {
    const month = months.findIndex(group => group.includes((match[2] || match[3]).toLowerCase())) + 1;
    const day = Number(match[1] || match[4]);
    const year = match[5] || matches.find(item => item[5])?.[5] || start.slice(0, 4);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  });
  // Only reject explicit ranges; one date may describe an ongoing exhibition's opening.
  if (values.length !== 2 || values[0] > values[1]) return false;
  return values[1] < start || values[0] > end;
}
