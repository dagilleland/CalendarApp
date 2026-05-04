const MONTHS_VISIBLE = 4;
const HOLIDAY_STORAGE_KEY = "workdayCalendar.holidays";
const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const calendarGrid = document.querySelector("#calendarGrid");
const calendarTitle = document.querySelector("#calendarTitle");
const workdayCountInput = document.querySelector("#workdayCount");
const resultLabel = document.querySelector("#resultLabel");
const resultDate = document.querySelector("#resultDate");
const statusMessage = document.querySelector("#statusMessage");
const holidayForm = document.querySelector("#holidayForm");
const holidayDateInput = document.querySelector("#holidayDate");
const holidayList = document.querySelector("#holidayList");

const today = startOfDay(new Date());
let visibleStart = new Date(today.getFullYear(), today.getMonth(), 1);
let mode = "start";
let anchorDate = null;
let computedDate = null;
let holidays = loadHolidays();

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

workdayCountInput.addEventListener("input", () => {
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
      const dateKey = toDateKey(date);
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
    empty.textContent = "No holidays saved.";
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
    setStatus(`${formatDate(date)} is not a workday. Choose a weekday that is not saved as a holiday.`);
    return;
  }

  anchorDate = startOfDay(date);
  calculateRange();
  render();
}

function calculateRange() {
  computedDate = null;

  if (!anchorDate) {
    setStatus("");
    updateResult();
    return;
  }

  const count = Number(workdayCountInput.value);
  if (!Number.isInteger(count) || count < 1) {
    setStatus("Enter a whole number of work days greater than zero.");
    updateResult();
    return;
  }

  if (!isWorkday(anchorDate)) {
    setStatus(`${formatDate(anchorDate)} is no longer a workday because it is a saved holiday.`);
    updateResult();
    return;
  }

  computedDate = mode === "start" ? addWorkdaysInclusive(anchorDate, count, 1) : addWorkdaysInclusive(anchorDate, count, -1);
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
  resultLabel.textContent = `${formatDate(start)} through ${formatDate(end)}`;
  resultDate.textContent = mode === "start" ? `End: ${formatDate(end)}` : `Start: ${formatDate(start)}`;
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
  if (holidays.has(key)) classes.push("holiday");
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
  if (holidays.has(toDateKey(date))) labels.push("Holiday");
  if (isSameDate(date, today)) labels.push("Today");
  return labels.join(", ");
}

function isWorkday(date) {
  return !isWeekend(date) && !holidays.has(toDateKey(date));
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
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

function formatMonthYear(date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(date);
}

render();
