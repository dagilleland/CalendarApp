const MONTHS_VISIBLE = 4;
const HOLIDAY_STORAGE_KEY = "workdayCalendar.holidays";
const REGION_STORAGE_KEY = "workdayCalendar.region";
const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const canadaHolidayCache = new Map();
const provinceHolidayCache = new Map();
const canadianRegions = [
  ["AB", "Alberta"],
  ["BC", "British Columbia"],
  ["MB", "Manitoba"],
  ["NB", "New Brunswick"],
  ["NL", "Newfoundland and Labrador"],
  ["NT", "Northwest Territories"],
  ["NS", "Nova Scotia"],
  ["NU", "Nunavut"],
  ["ON", "Ontario"],
  ["PE", "Prince Edward Island"],
  ["QC", "Quebec"],
  ["SK", "Saskatchewan"],
  ["YT", "Yukon"],
];

const calendarGrid = document.querySelector("#calendarGrid");
const calendarTitle = document.querySelector("#calendarTitle");
const daysFields = document.querySelector("#daysFields");
const hoursFields = document.querySelector("#hoursFields");
const workdayCountInput = document.querySelector("#workdayCount");
const hourCountInput = document.querySelector("#hourCount");
const hoursPerDayInput = document.querySelector("#hoursPerDay");
const resultLabel = document.querySelector("#resultLabel");
const resultDate = document.querySelector("#resultDate");
const statusMessage = document.querySelector("#statusMessage");
const holidayForm = document.querySelector("#holidayForm");
const holidayDateInput = document.querySelector("#holidayDate");
const holidayList = document.querySelector("#holidayList");
const regionSelect = document.querySelector("#regionSelect");

const today = startOfDay(new Date());
let visibleStart = new Date(today.getFullYear(), today.getMonth(), 1);
let mode = "end";
let rangeInputMode = "hours";
let anchorDate = null;
let computedDate = null;
let computedWorkdayCount = null;
let holidays = loadHolidays();
let selectedRegion = loadSelectedRegion();

populateRegionSelect();

document.querySelector("#prevMonths").addEventListener("click", () => {
  visibleStart = addMonths(visibleStart, -MONTHS_VISIBLE);
  render();
});

document.querySelector("#nextMonths").addEventListener("click", () => {
  visibleStart = addMonths(visibleStart, MONTHS_VISIBLE);
  render();
});

document.querySelector("#todayButton").addEventListener("click", () => {
  visibleStart = new Date(today.getFullYear(), today.getMonth(), 1);
  render();
});

document.querySelectorAll("input[name='mode']").forEach((input) => {
  input.addEventListener("change", (event) => {
    mode = event.target.value;
    anchorDate = null;
    computedDate = null;
    setStatus("");
    updateResult();
    render();
  });
});

document.querySelectorAll("input[name='inputMode']").forEach((input) => {
  input.addEventListener("change", (event) => {
    rangeInputMode = event.target.value;
    syncInputModeFields();
    calculateRange();
    render();
  });
});

[workdayCountInput, hourCountInput, hoursPerDayInput].forEach((input) => {
  input.addEventListener("input", () => {
    calculateRange();
    render();
  });
});

regionSelect.addEventListener("change", (event) => {
  selectedRegion = event.target.value;
  saveSelectedRegion();
  calculateRange();
  render();
});

holidayForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = holidayDateInput.value;

  if (!value) {
    setStatus("Choose a holiday date first.");
    return;
  }

  holidays.add(value);
  saveHolidays();
  holidayDateInput.value = "";
  calculateRange();
  render();
});

function render() {
  syncInputModeFields();
  renderCalendar();
  renderHolidays();
  updateResult();
}

function renderCalendar() {
  calendarGrid.innerHTML = "";
  const monthDates = Array.from({ length: MONTHS_VISIBLE }, (_, index) => addMonths(visibleStart, index));
  const first = monthDates[0];
  const last = monthDates[monthDates.length - 1];
  calendarTitle.textContent = `${formatMonthYear(first)} - ${formatMonthYear(last)}`;

  monthDates.forEach((monthDate) => {
    const month = document.createElement("article");
    month.className = "month";

    const heading = document.createElement("h2");
    heading.textContent = formatMonthYear(monthDate);
    month.append(heading);

    const weekdayRow = document.createElement("div");
    weekdayRow.className = "weekday-row";
    weekdayLabels.forEach((label) => {
      const item = document.createElement("span");
      item.textContent = label;
      weekdayRow.append(item);
    });
    month.append(weekdayRow);

    const daysGrid = document.createElement("div");
    daysGrid.className = "days-grid";

    const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const dayCount = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();

    for (let index = 0; index < firstDay.getDay(); index += 1) {
      const empty = document.createElement("span");
      empty.className = "day empty";
      daysGrid.append(empty);
    }

    for (let day = 1; day <= dayCount; day += 1) {
      const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
      const button = document.createElement("button");
      button.type = "button";
      button.className = getDayClassName(date);
      button.textContent = String(day);
      button.title = getDayTitle(date);
      button.setAttribute("aria-label", getDayTitle(date));
      button.addEventListener("click", () => selectDate(date));
      daysGrid.append(button);
    }

    month.append(daysGrid);
    calendarGrid.append(month);
  });
}

function renderHolidays() {
  holidayList.innerHTML = "";
  const sortedHolidays = [...holidays].sort();

  if (sortedHolidays.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No extra holidays saved.";
    holidayList.append(empty);
    return;
  }

  sortedHolidays.forEach((dateKey) => {
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = formatDate(parseDateKey(dateKey));

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "×";
    removeButton.title = `Remove ${label.textContent}`;
    removeButton.setAttribute("aria-label", `Remove ${label.textContent}`);
    removeButton.addEventListener("click", () => {
      holidays.delete(dateKey);
      saveHolidays();
      calculateRange();
      render();
    });

    item.append(label, removeButton);
    holidayList.append(item);
  });
}

function selectDate(date) {
  if (!isWorkday(date)) {
    setStatus(`${formatDate(date)} is not a workday. Choose a weekday that is not a holiday.`);
    return;
  }

  anchorDate = startOfDay(date);
  calculateRange();
  render();
}

function calculateRange() {
  computedDate = null;
  computedWorkdayCount = null;

  if (!anchorDate) {
    setStatus("");
    updateResult();
    return;
  }

  const count = getWorkdayCount();
  if (!count) {
    updateResult();
    return;
  }

  if (!isWorkday(anchorDate)) {
    setStatus(`${formatDate(anchorDate)} is no longer a workday because it is a holiday.`);
    updateResult();
    return;
  }

  computedDate = mode === "start" ? addWorkdaysInclusive(anchorDate, count, 1) : addWorkdaysInclusive(anchorDate, count, -1);
  computedWorkdayCount = count;
  setStatus("");
  updateResult();
}

function updateResult() {
  if (!anchorDate) {
    resultLabel.textContent = `Select a ${mode} workday to begin.`;
    resultDate.textContent = "No range yet";
    return;
  }

  if (!computedDate) {
    resultLabel.textContent = `Selected ${mode} date`;
    resultDate.textContent = formatDate(anchorDate);
    return;
  }

  const start = mode === "start" ? anchorDate : computedDate;
  const end = mode === "start" ? computedDate : anchorDate;
  resultLabel.textContent = `${formatDate(start)} through ${formatDate(end)} (${formatWorkdayCount(computedWorkdayCount)})`;
  resultDate.textContent = mode === "start" ? `End: ${formatDate(end)}` : `Start: ${formatDate(start)}`;
}

function getWorkdayCount() {
  if (rangeInputMode === "days") {
    const count = Number(workdayCountInput.value);
    if (!Number.isInteger(count) || count < 1) {
      setStatus("Enter a whole number of work days greater than zero.");
      return null;
    }
    return count;
  }

  const hours = Number(hourCountInput.value);
  const hoursPerDay = Number(hoursPerDayInput.value);

  if (!Number.isFinite(hours) || hours <= 0) {
    setStatus("Enter a number of hours greater than zero.");
    return null;
  }

  if (!Number.isFinite(hoursPerDay) || hoursPerDay <= 0) {
    setStatus("Enter hours per day greater than zero.");
    return null;
  }

  return Math.ceil(hours / hoursPerDay);
}

function syncInputModeFields() {
  daysFields.hidden = rangeInputMode !== "days";
  hoursFields.hidden = rangeInputMode !== "hours";
}

function formatWorkdayCount(count) {
  if (rangeInputMode !== "hours") {
    return `${count} work ${count === 1 ? "day" : "days"}`;
  }

  const hours = Number(hourCountInput.value);
  const hoursPerDay = Number(hoursPerDayInput.value);
  return `${formatNumber(hours)} hours at ${formatNumber(hoursPerDay)}/day = ${count} work ${count === 1 ? "day" : "days"}`;
}

function addWorkdaysInclusive(date, count, direction) {
  let current = startOfDay(date);
  let counted = isWorkday(current) ? 1 : 0;

  while (counted < count) {
    current = addDays(current, direction);
    if (isWorkday(current)) {
      counted += 1;
    }
  }

  return current;
}

function getDayClassName(date) {
  const classes = ["day"];
  const key = toDateKey(date);

  if (isWeekend(date)) classes.push("weekend");
  if (isHoliday(date)) classes.push("holiday");
  if (isSameDate(date, today)) classes.push("today");
  if (isRangeDate(date)) classes.push("in-range");

  const start = mode === "start" ? anchorDate : computedDate;
  const end = mode === "start" ? computedDate : anchorDate;
  if (start && isSameDate(date, start)) classes.push("start-date");
  if (end && isSameDate(date, end)) classes.push("end-date");

  return classes.join(" ");
}

function isRangeDate(date) {
  if (!anchorDate || !computedDate) return false;

  const start = mode === "start" ? anchorDate : computedDate;
  const end = mode === "start" ? computedDate : anchorDate;
  return date >= start && date <= end && isWorkday(date);
}

function getDayTitle(date) {
  const labels = [formatDate(date)];
  if (isWeekend(date)) labels.push("Weekend");
  labels.push(...getHolidayLabels(date));
  if (isSameDate(date, today)) labels.push("Today");
  return labels.join(", ");
}

function isWorkday(date) {
  return !isWeekend(date) && !isHoliday(date);
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function isHoliday(date) {
  return getHolidayLabels(date).length > 0;
}

function getHolidayLabels(date) {
  const key = toDateKey(date);
  const labels = [];

  if (holidays.has(key)) {
    labels.push("Extra holiday");
  }

  const canadaHoliday = getCanadaStatHolidays(date.getFullYear()).get(key);
  if (canadaHoliday) {
    labels.push(...canadaHoliday);
  }

  if (selectedRegion) {
    const provinceHoliday = getProvincialHolidays(date.getFullYear(), selectedRegion).get(key);
    if (provinceHoliday) {
      labels.push(...provinceHoliday);
    }
  }

  return labels;
}

function getProvincialHolidays(year, region) {
  const cacheKey = `${year}-${region}`;
  if (provinceHolidayCache.has(cacheKey)) {
    return provinceHolidayCache.get(cacheKey);
  }

  const holidayMap = new Map();
  const addHoliday = (date, name) => addHolidayLabel(holidayMap, date, name);
  const addObserved = (monthIndex, day, name) => addObservedHoliday(holidayMap, year, monthIndex, day, name);

  switch (region) {
    case "AB":
      addHoliday(getNthWeekdayOfMonth(year, 1, 1, 3), "Family Day");
      break;
    case "BC":
      addHoliday(getNthWeekdayOfMonth(year, 1, 1, 3), "Family Day");
      addHoliday(getNthWeekdayOfMonth(year, 7, 1, 1), "British Columbia Day");
      break;
    case "MB":
      addHoliday(getNthWeekdayOfMonth(year, 1, 1, 3), "Louis Riel Day");
      addObserved(8, 30, "Orange Shirt Day");
      break;
    case "NB":
      addHoliday(getNthWeekdayOfMonth(year, 1, 1, 3), "Family Day");
      addHoliday(getNthWeekdayOfMonth(year, 7, 1, 1), "New Brunswick Day");
      break;
    case "NL":
      addHoliday(getNearestMonday(year, 2, 17), "Saint Patrick's Day");
      addHoliday(getNearestMonday(year, 3, 23), "Saint George's Day");
      addHoliday(getNearestMonday(year, 5, 24), "Discovery Day");
      addHoliday(getNearestMonday(year, 6, 12), "Orangemen's Day");
      addHoliday(getNthWeekdayOfMonth(year, 7, 3, 1), "Regatta Day");
      break;
    case "NT":
      addHoliday(new Date(year, 5, 21), "National Indigenous Peoples Day");
      addHoliday(getNthWeekdayOfMonth(year, 7, 1, 1), "Civic Holiday");
      break;
    case "NS":
      addHoliday(getNthWeekdayOfMonth(year, 1, 1, 3), "Heritage Day");
      break;
    case "NU":
      addObserved(6, 9, "Nunavut Day");
      addHoliday(getNthWeekdayOfMonth(year, 7, 1, 1), "Civic Holiday");
      break;
    case "ON":
      addHoliday(getNthWeekdayOfMonth(year, 1, 1, 3), "Family Day");
      break;
    case "PE":
      addHoliday(getNthWeekdayOfMonth(year, 1, 1, 3), "Islander Day");
      break;
    case "QC":
      addHoliday(getVictoriaDay(year), "National Patriots' Day");
      addObserved(5, 24, "Saint-Jean-Baptiste Day");
      break;
    case "SK":
      addHoliday(getNthWeekdayOfMonth(year, 1, 1, 3), "Family Day");
      addHoliday(getNthWeekdayOfMonth(year, 7, 1, 1), "Saskatchewan Day");
      break;
    case "YT":
      addHoliday(new Date(year, 5, 21), "National Indigenous Peoples Day");
      addHoliday(getNthWeekdayOfMonth(year, 7, 1, 3), "Discovery Day");
      break;
  }

  provinceHolidayCache.set(cacheKey, holidayMap);
  return holidayMap;
}

function getCanadaStatHolidays(year) {
  if (canadaHolidayCache.has(year)) {
    return canadaHolidayCache.get(year);
  }

  const holidayMap = new Map();
  const addHoliday = (date, name) => addHolidayLabel(holidayMap, date, name);
  const addObserved = (monthIndex, day, name) => {
    addObservedHoliday(holidayMap, year, monthIndex, day, name);
  };

  addObserved(0, 1, "New Year's Day");
  addHoliday(addDays(getEasterSunday(year), -2), "Good Friday");
  addHoliday(getVictoriaDay(year), "Victoria Day");
  addObserved(6, 1, "Canada Day");
  addHoliday(getNthWeekdayOfMonth(year, 8, 1, 1), "Labour Day");
  addObserved(8, 30, "National Day for Truth and Reconciliation");
  addHoliday(getNthWeekdayOfMonth(year, 9, 1, 2), "Thanksgiving Day");
  addObserved(10, 11, "Remembrance Day");
  addChristmasAndBoxingDayHolidays(year, addHoliday);

  canadaHolidayCache.set(year, holidayMap);
  return holidayMap;
}

function addObservedHoliday(holidayMap, year, monthIndex, day, name) {
  const date = new Date(year, monthIndex, day);
  addHolidayLabel(holidayMap, date, name);

  if (date.getDay() === 6) {
    addHolidayLabel(holidayMap, addDays(date, 2), `${name} observed`);
  } else if (date.getDay() === 0) {
    addHolidayLabel(holidayMap, addDays(date, 1), `${name} observed`);
  }
}

function addHolidayLabel(holidayMap, date, name) {
  const key = toDateKey(date);
  const labels = holidayMap.get(key) || [];
  labels.push(name);
  holidayMap.set(key, labels);
}

function addChristmasAndBoxingDayHolidays(year, addHoliday) {
  const christmas = new Date(year, 11, 25);
  const boxing = new Date(year, 11, 26);
  const christmasWeekday = christmas.getDay();

  addHoliday(christmas, "Christmas Day");
  addHoliday(boxing, "Boxing Day");

  if (christmasWeekday === 5) {
    addHoliday(new Date(year, 11, 28), "Boxing Day observed");
  } else if (christmasWeekday === 6) {
    addHoliday(new Date(year, 11, 27), "Christmas Day observed");
    addHoliday(new Date(year, 11, 28), "Boxing Day observed");
  } else if (christmasWeekday === 0) {
    addHoliday(new Date(year, 11, 27), "Christmas Day observed");
  }
}

function getVictoriaDay(year) {
  let date = new Date(year, 4, 24);
  while (date.getDay() !== 1) {
    date = addDays(date, -1);
  }
  return date;
}

function getNthWeekdayOfMonth(year, monthIndex, weekday, occurrence) {
  const date = new Date(year, monthIndex, 1);
  const offset = (weekday - date.getDay() + 7) % 7;
  return new Date(year, monthIndex, 1 + offset + (occurrence - 1) * 7);
}

function getNearestMonday(year, monthIndex, day) {
  const date = new Date(year, monthIndex, day);
  const dayOfWeek = date.getDay();
  const distanceToPreviousMonday = (dayOfWeek + 6) % 7;
  const distanceToNextMonday = (8 - dayOfWeek) % 7;
  const offset = distanceToPreviousMonday <= distanceToNextMonday ? -distanceToPreviousMonday : distanceToNextMonday;
  return addDays(date, offset);
}

function getEasterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function setStatus(message) {
  statusMessage.textContent = message;
}

function saveHolidays() {
  localStorage.setItem(HOLIDAY_STORAGE_KEY, JSON.stringify([...holidays].sort()));
}

function loadHolidays() {
  try {
    const saved = JSON.parse(localStorage.getItem(HOLIDAY_STORAGE_KEY) || "[]");
    return new Set(Array.isArray(saved) ? saved.filter(isDateKey) : []);
  } catch {
    return new Set();
  }
}

function populateRegionSelect() {
  canadianRegions.forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    regionSelect.append(option);
  });

  regionSelect.value = selectedRegion;
}

function saveSelectedRegion() {
  localStorage.setItem(REGION_STORAGE_KEY, selectedRegion);
}

function loadSelectedRegion() {
  const saved = localStorage.getItem(REGION_STORAGE_KEY) || "";
  return canadianRegions.some(([value]) => value === saved) ? saved : "";
}

function isDateKey(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseDateKey(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, amount) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDate(a, b) {
  return toDateKey(a) === toDateKey(b);
}

function formatDate(date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatNumber(value) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatMonthYear(date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(date);
}

render();
