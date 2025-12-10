import opening_hours from "opening_hours";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Pick a Monday with no UK bank holidays so PH rules don't affect the weekly table.
const MONDAY_EPOCH = new Date("2024-02-05T00:00:00Z");
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const defaultLocation = {
  lat: 53.382, // Sheffield approx
  lon: -1.467,
  address: { country_code: "gb", state: "England" },
};

const pad = (n) => String(n).padStart(2, "0");

function formatInterval(from, to, dayStart, dayEnd, comment) {
  const fullDay =
    from.getTime() === dayStart.getTime() && to.getTime() === dayEnd.getTime();
  const fromStr = `${pad(from.getUTCHours())}:${pad(from.getUTCMinutes())}`;
  const isEndOfDay = to.getTime() === dayEnd.getTime();
  const toStr = isEndOfDay
    ? "24:00"
    : `${pad(to.getUTCHours())}:${pad(to.getUTCMinutes())}`;

  if (fullDay) return comment ? `24 hours (${comment})` : "24 hours";
  const base = `${fromStr}-${toStr}`;
  return comment ? `${base} (${comment})` : base;
}

function groupConsecutive(dayLines) {
  const grouped = [];
  let start = 0;
  for (let i = 1; i <= dayLines.length; i++) {
    const prev = dayLines[start];
    const curr = dayLines[i];
    const isBreak = !curr || curr.value !== prev.value;
    if (isBreak) {
      const end = i - 1;
      const label =
        start === end
          ? DAY_NAMES[start]
          : `${DAY_NAMES[start]} - ${DAY_NAMES[end]}`;
      grouped.push({
        label,
        value: prev.value,
        days: [start, end],
      });
      start = i;
    }
  }
  return grouped;
}

export function formatOpeningHours(raw) {
  if (!raw) return undefined;
  try {
    const oh = new opening_hours(raw, defaultLocation);

    // Short-circuit 24/7 (one interval covering the full week, not unknown).
    const weekStart = MONDAY_EPOCH;
    const weekEnd = new Date(weekStart.getTime() + 7 * ONE_DAY_MS);
    const weekIntervals = oh.getOpenIntervals(weekStart, weekEnd);
    const isFullWeek =
      weekIntervals.length === 1 &&
      weekIntervals[0][0].getTime() <= weekStart.getTime() &&
      weekIntervals[0][1].getTime() >= weekEnd.getTime() &&
      weekIntervals[0][2] !== true;
    if (isFullWeek) {
      return [{ label: "Open 24/7", value: "", days: [0, 6] }];
    }

    const dayLines = DAY_NAMES.map((label, idx) => {
      const dayStart = new Date(MONDAY_EPOCH.getTime() + idx * ONE_DAY_MS);
      const dayEnd = new Date(dayStart.getTime() + ONE_DAY_MS);

      const intervals = oh.getOpenIntervals(dayStart, dayEnd);

      // If the day is covered by an unknown interval with a comment, surface the comment instead of 24h.
      const fullUnknown = intervals.length
        ? intervals.every(([from, to, unknown]) => {
            return (
              unknown === true &&
              from.getTime() <= dayStart.getTime() &&
              to.getTime() >= dayEnd.getTime()
            );
          })
        : false;

      let text;
      if (fullUnknown) {
        const comment =
          intervals.find(([, , , c]) => Boolean(c))?.[3] ??
          oh.getComment(dayStart) ??
          "Unknown hours";
        text = comment;
      } else if (intervals.length) {
        text = intervals
          .map(([from, to, _unknown, comment]) => {
            return formatInterval(from, to, dayStart, dayEnd, comment);
          })
          .join(", ");
      } else {
        text = "Closed";
      }
      return { label, value: text };
    });

    return groupConsecutive(dayLines);
  } catch (e) {
    console.warn("opening_hours parse failed", raw, e);
    return raw;
  }
}
