// Renders a pre-formatted opening hours table (built at script time).
// Each entry: { label, value, days: [startIdx, endIdx] }

export function renderOpeningHoursTable(raw) {
  if (!raw) return null;

  let lines;
  if (typeof raw === "string") {
    try {
      lines = JSON.parse(raw);
    } catch {
      return null;
    }
  } else {
    lines = raw;
  }
  if (!Array.isArray(lines)) return null;

  const todayIdx = (new Date().getDay() + 6) % 7; // 0 = Mon … 6 = Sun

  const list = document.createElement("div");
  list.className = "shop-hours";
  lines.forEach(({ label, value, days }) => {
    const isToday = days
      ? todayIdx >= days[0] && todayIdx <= days[1]
      : false;
    const labelEl = document.createElement("div");
    labelEl.className = "shop-hours__label";
    labelEl.textContent = label;
    const valueEl = document.createElement("div");
    valueEl.className = "shop-hours__value";
    valueEl.textContent = value;
    if (isToday) {
      labelEl.classList.add("shop-hours__today");
      valueEl.classList.add("shop-hours__today");
    }
    list.appendChild(labelEl);
    list.appendChild(valueEl);
  });

  const card = document.createElement("div");
  card.className = "popup__card";
  card.appendChild(list);
  return card;
}
