/***********************
 * CONFIG
 ***********************/
const SHEET_ID = "1C6YKplUWHzLTxtJKhmdUocJjKaf7a2JAdsO6Y2RVlxM";

const TRIPS = [
  { name: "New York", id: "New York Feb 26" },
  { name: "Steffi's Wedding", id: "Pisa May 26" },
  { name: "Virgin Voyage", id: "Virgin Voyage June 26" },
  { name: "Center Parcs", id: "Center Parcs June 26" },
  { name: "Norway", id: "P&O July 26" },
  { name: "Paris", id: "Paris Aug 26" },
  { name: "LAX", id: "LAX Aug 26" },
  { name: "Orlando", id: "Orlando Aug 26" },
  { name: "Virgin Voyage 27", id: "Virgin Voyage May 27" },
];

/***********************
 * TYPE METADATA
 ***********************/
const TYPE_META = {
  Flight: { icon: "plane", color: "var(--flight)" },
  Hotel: { icon: "home", color: "var(--hotel)" },
  Cruise: { icon: "ship", color: "var(--cruise)" },
  Lounge: { icon: "armchair", color: "var(--lounge)" },
  Train: { icon: "train", color: "var(--train)" },
  Show: { icon: "ticket", color: "var(--show)" },
  Event: { icon: "sparkles", color: "var(--event)" },
  Attraction: { icon: "star", color: "var(--attraction)" },
  Bus: { icon: "bus", color: "var(--bus)" },
  Port: { icon: "map-pin", color: "var(--port)" },
  Uber: { icon: "car", color: "var(--uber)" },
  Drive: { icon: "car-front", color: "var(--drive)" },
  Parking: { icon: "parking-circle", color: "var(--parking)" },
  Food: { icon: "hamburger", color: "var(--food)" },
  "Theme Park": { icon: "ferris-wheel", color: "var(--themepark)" }
};

/***********************
 * SETTINGS
 ***********************/
const HIDE_PAST_DAYS = true;
const MAX_CALENDAR_DOTS = 4;

/***********************
 * GLOBAL STATE
 ***********************/
let GLOBAL_DATE_MAP = {};
let GLOBAL_MIN_DATE = null;
let GLOBAL_MAX_DATE = null;

let CALENDAR_CURRENT_MONTH = null;
let CALENDAR_VISIBLE = true;

/***********************
 * HELPERS
 ***********************/
function pad2(n) {
  return String(n).padStart(2, "0");
}

function toISODateLocal(dateObj) {
  return `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}-${pad2(dateObj.getDate())}`;
}

function startOfDayLocal(dateObj) {
  return new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
}

function todayStart() {
  return startOfDayLocal(new Date());
}

function isDayInPast(dayStr) {
  const dayDate = startOfDayLocal(new Date(dayStr));
  return dayDate < todayStart();
}

function formatPrettyDate(dateObj) {
  const weekdays = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const day = dateObj.getDate();
  const suffix = (d => {
    if (d > 3 && d < 21) return 'th';
    switch (d % 10) { case 1: return 'st'; case 2: return 'nd'; case 3: return 'rd'; default: return 'th'; }
  })(day);
  return `${weekdays[dateObj.getDay()]} ${day}${suffix} ${months[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
}

function toUTC(date, time, utcOffset) {
  const d = new Date(`${date} ${time} UTC`);
  return d.getTime() - utcOffset * 3600000;
}

function formatTimeSheet(dateStr, timeStr, utcOffset) {
  const offset = parseInt(utcOffset, 10);
  return offset !== 0 ? `${timeStr} (${offset >= 0 ? "+" : ""}${offset}h)` : timeStr;
}

/***********************
 * URL PARAMS
 ***********************/
function getTripFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("trip");
}

function setTripInUrl(tripId) {
  const params = new URLSearchParams(window.location.search);
  params.set("trip", tripId);
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.pushState({}, "", newUrl);
}

function isShareMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get("share") === "1";
}

function buildShareUrl(tripId) {
  const params = new URLSearchParams();
  params.set("trip", tripId);
  params.set("share", "1");
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}

/***********************
 * FETCH GOOGLE SHEET
 ***********************/
async function fetchSheetRows(tabName) {
  const url = `https://opensheet.elk.sh/${SHEET_ID}/${encodeURIComponent(tabName)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch tab data");
  return res.json();
}

/***********************
 * CALCULATE DURATION
 ***********************/
function calculateDuration(type, start, end) {
  switch(type) {
    case "Hotel": {
      const nights = Math.floor(
        (startOfDayLocal(new Date(end)) - startOfDayLocal(new Date(start))) / (1000*60*60*24)
      );
      const n = nights < 1 ? 1 : nights;
      return `${n} night${n !== 1 ? "s" : ""}`;
    }
    case "Cruise": {
      const days = Math.ceil((end-start)/(1000*60*60*24));
      return `${days} day${days>1?"s":""}`;
    }
    default: {
      const mins = Math.round((end-start)/60000);
      return `${Math.floor(mins/60)}h ${mins%60}m`;
    }
  }
}

/***********************
 * MAKE ITEM
 ***********************/
function makeItem(row, timestamp, phase = null, duration = null, dateVal, timeVal, utcVal, typeOverride = null) {
  let title = row.TITLE;
  const type = typeOverride || row.TYPE;

  if (type === "Uber") {
    const parts = title.split(">");
    if (parts.length > 1) title = "Uber to " + parts[1].trim();
    else title = "Uber to " + title.replace(/\bUber\b/i,"").trim();
  }

  const localDate = new Date(`${dateVal} ${timeVal}`);
  const displayDay = localDate.toDateString();

  const multiPhase = ["Flight","Hotel","Cruise","Train"];
  const includeDetails = !(multiPhase.includes(type) && phase && !["Check-in","Take off","Embarkation","Depart"].includes(phase));

  let detailsFormatted = "";
  if (row.DETAILS && includeDetails) {
    let lines = row.DETAILS.split("\n").map(l => l.trim()).filter(l => l !== "");

    switch(type) {
      case "Hotel":
        lines = lines.map(line => `Room Type: ${line}`);
        break;
      case "Flight":
        if(lines[0]) lines[0] = `Flight #: ${lines[0]}`;
        if(lines[1]) lines[1] = `Aircraft: ${lines[1]}`;
        if(lines[2]) lines[2] = `Cabin: ${lines[2]}`;
        break;
      case "Cruise":
        if(lines[0]) lines[0] = `Cruise Line: ${lines[0]}`;
        if(lines[1]) lines[1] = `Ship: ${lines[1]}`;
        if(lines[2]) lines[2] = `Cabin Type: ${lines[2]}`;
        if(lines[3]) lines[3] = `Cabin #: ${lines[3]}`;
        break;
      case "Train":
        if(lines[0]) lines[0] = `Train Company: ${lines[0]}`;
        if(lines[1]) lines[1] = `Train #: ${lines[1]}`;
        if(lines[2]) lines[2] = `Coach Type: ${lines[2]}`;
        if(lines[3]) lines[3] = `Seat #: ${lines[3]}`;
        break;
    }

    if (type === "Hotel" && phase === "Check-in" && duration) lines.unshift(duration);
    if (type === "Cruise" && phase === "Embarkation" && duration) lines.unshift(duration);

    detailsFormatted = lines.join("<br>");
  }

  return {
    type: type,
    phase,
    timestamp,
    day: displayDay,
    title: title,
    details: detailsFormatted,
    address: row.ADDRESS,
    bookingRef: row["BOOKING REF"],
    duration,
    startDate: dateVal,
    startTime: timeVal,
    startUTC: utcVal
  };
}

/***********************
 * TRANSFORM ROWS
 ***********************/
function transform(rows) {
  const items = [];

  let minDate = null;
  let maxDate = null;

  rows.forEach(row => {
    const startTimestamp = toUTC(row["START DATE"], row["START TIME"], row["START UTC"]);
    const endTimestamp = toUTC(row["END DATE"], row["END TIME"], row["END UTC"]);

    const startDateObj = new Date(startTimestamp);
    const endDateObj = new Date(endTimestamp);

    if (!minDate || startDateObj < minDate) minDate = startDateObj;
    if (!maxDate || endDateObj > maxDate) maxDate = endDateObj;

    let phases = { Start: "Start", End: "End" };
    if (row.TYPE === "Hotel") phases = { Start: "Check-in", End: "Check-out" };
    if (row.TYPE === "Flight") phases = { Start: "Take off", End: "Land" };
    if (row.TYPE === "Cruise") phases = { Start: "Embarkation", End: "Disembarkation" };
    if (row.TYPE === "Train") phases = { Start: "Depart", End: "Arrive" };

    if (["Flight","Hotel","Cruise","Train"].includes(row.TYPE)) {
      const startDuration = calculateDuration(row.TYPE, startTimestamp, endTimestamp);
      items.push(makeItem(row, startTimestamp, phases.Start, startDuration, row["START DATE"], row["START TIME"], row["START UTC"], row.TYPE));
      items.push(makeItem(row, endTimestamp, phases.End, null, row["END DATE"], row["END TIME"], row["END UTC"], row.TYPE));
    } else {
      items.push(makeItem(row, startTimestamp, null, null, row["START DATE"], row["START TIME"], row["START UTC"], row.TYPE));
    }
  });

  // Add missing days
  if (minDate && maxDate) {
    const daysMap = {};
    items.forEach(i => daysMap[i.day] = true);

    for (let d = new Date(minDate); d <= maxDate; d.setDate(d.getDate() + 1)) {
      const dayStr = d.toDateString();
      if (!daysMap[dayStr]) {
        items.push({
          type: "None",
          phase: null,
          timestamp: new Date(d).getTime(),
          day: dayStr,
          title: "No plans…yet",
          details: "",
          address: "",
          bookingRef: "",
          duration: null,
          startDate: "",
          startTime: "",
          startUTC: ""
        });
      }
    }
  }

  return items.sort((a,b) => a.timestamp - b.timestamp);
}

/***********************
 * GLOBAL CALENDAR DATA
 ***********************/
async function buildGlobalCalendarData() {
  GLOBAL_DATE_MAP = {};
  GLOBAL_MIN_DATE = null;
  GLOBAL_MAX_DATE = null;

  for (const trip of TRIPS) {
    try {
      const rows = await fetchSheetRows(trip.id);
      const items = transform(rows);

      items.forEach(item => {
        if (item.type === "None") return;

        const iso = toISODateLocal(new Date(item.timestamp));
        const dayStart = startOfDayLocal(new Date(item.timestamp));

        if (!GLOBAL_MIN_DATE || dayStart < GLOBAL_MIN_DATE) GLOBAL_MIN_DATE = dayStart;
        if (!GLOBAL_MAX_DATE || dayStart > GLOBAL_MAX_DATE) GLOBAL_MAX_DATE = dayStart;

        if (!GLOBAL_DATE_MAP[iso]) {
          GLOBAL_DATE_MAP[iso] = { trips: [], types: new Set() };
        }

        if (!GLOBAL_DATE_MAP[iso].trips.some(x => x.tripId === trip.id)) {
          GLOBAL_DATE_MAP[iso].trips.push({ tripId: trip.id, tripName: trip.name });
        }

        GLOBAL_DATE_MAP[iso].types.add(item.type);
      });

    } catch (e) {
      console.warn("Failed calendar load for trip:", trip.id, e);
    }
  }

  const now = new Date();
  const nowMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  if (GLOBAL_MIN_DATE && GLOBAL_MAX_DATE) {
    const minMonth = new Date(GLOBAL_MIN_DATE.getFullYear(), GLOBAL_MIN_DATE.getMonth(), 1);
    const maxMonth = new Date(GLOBAL_MAX_DATE.getFullYear(), GLOBAL_MAX_DATE.getMonth(), 1);

    if (nowMonth >= minMonth && nowMonth <= maxMonth) CALENDAR_CURRENT_MONTH = nowMonth;
    else CALENDAR_CURRENT_MONTH = minMonth;
  }
}

/***********************
 * POPUP PICKER
 ***********************/
function showTripPicker(iso, options) {
  return new Promise(resolve => {
    const existing = document.getElementById("trip-picker-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "trip-picker-overlay";
    overlay.className = "trip-picker-overlay";

    const modal = document.createElement("div");
    modal.className = "trip-picker-modal";

    const title = document.createElement("h3");
    title.textContent = "Which trip do you want?";

    const dateLabel = document.createElement("div");
    dateLabel.className = "trip-picker-date";
    dateLabel.textContent = iso;

    const list = document.createElement("div");
    list.className = "trip-picker-list";

    options.forEach(opt => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "trip-picker-btn";
      btn.textContent = opt.tripName;

      btn.addEventListener("click", () => {
        overlay.remove();
        resolve(opt.tripId);
      });

      list.appendChild(btn);
    });

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "trip-picker-cancel";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => {
      overlay.remove();
      resolve(null);
    });

    modal.appendChild(title);
    modal.appendChild(dateLabel);
    modal.appendChild(list);
    modal.appendChild(cancel);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.remove();
        resolve(null);
      }
    });
  });
}

/***********************
 * CALENDAR RENDER (ONE MONTH)
 ***********************/
function renderGlobalCalendar() {
  if (isShareMode()) return; // <-- share mode hides calendar

  const timeline = document.getElementById("timeline");

  const existing = document.getElementById("global-calendar");
  if (existing) existing.remove();

  if (!GLOBAL_MIN_DATE || !GLOBAL_MAX_DATE || !CALENDAR_CURRENT_MONTH) return;

  const wrap = document.createElement("section");
  wrap.id = "global-calendar";
  wrap.className = "calendar";

  const header = document.createElement("div");
  header.className = "calendar-header";

  const title = document.createElement("h2");
  title.textContent = "Calendar";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "calendar-toggle";
  toggle.textContent = CALENDAR_VISIBLE ? "Hide Calendar" : "Show Calendar";

  toggle.addEventListener("click", () => {
    CALENDAR_VISIBLE = !CALENDAR_VISIBLE;
    renderGlobalCalendar();
  });

  header.appendChild(title);
  header.appendChild(toggle);
  wrap.appendChild(header);

  if (!CALENDAR_VISIBLE) {
    timeline.insertBefore(wrap, timeline.firstChild);
    return;
  }

  const nav = document.createElement("div");
  nav.className = "calendar-nav";

  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "calendar-arrow";
  prev.innerHTML = "←";

  const next = document.createElement("button");
  next.type = "button";
  next.className = "calendar-arrow";
  next.innerHTML = "→";

  const monthLabel = document.createElement("div");
  monthLabel.className = "calendar-month-label";

  nav.appendChild(prev);
  nav.appendChild(monthLabel);
  nav.appendChild(next);

  wrap.appendChild(nav);

  const monthNames = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];

  const minMonth = new Date(GLOBAL_MIN_DATE.getFullYear(), GLOBAL_MIN_DATE.getMonth(), 1);
  const maxMonth = new Date(GLOBAL_MAX_DATE.getFullYear(), GLOBAL_MAX_DATE.getMonth(), 1);

  monthLabel.textContent = `${monthNames[CALENDAR_CURRENT_MONTH.getMonth()]} ${CALENDAR_CURRENT_MONTH.getFullYear()}`;

  prev.disabled = CALENDAR_CURRENT_MONTH <= minMonth;
  next.disabled = CALENDAR_CURRENT_MONTH >= maxMonth;

  prev.addEventListener("click", () => {
    if (CALENDAR_CURRENT_MONTH <= minMonth) return;
    CALENDAR_CURRENT_MONTH = new Date(CALENDAR_CURRENT_MONTH.getFullYear(), CALENDAR_CURRENT_MONTH.getMonth() - 1, 1);
    renderGlobalCalendar();
  });

  next.addEventListener("click", () => {
    if (CALENDAR_CURRENT_MONTH >= maxMonth) return;
    CALENDAR_CURRENT_MONTH = new Date(CALENDAR_CURRENT_MONTH.getFullYear(), CALENDAR_CURRENT_MONTH.getMonth() + 1, 1);
    renderGlobalCalendar();
  });

  wrap.appendChild(renderMonthGrid(CALENDAR_CURRENT_MONTH));
  timeline.insertBefore(wrap, timeline.firstChild);
}

function renderMonthGrid(monthDate) {
  const gridWrap = document.createElement("div");
  gridWrap.className = "calendar-month";

  const grid = document.createElement("div");
  grid.className = "calendar-grid";

  ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].forEach(d => {
    const el = document.createElement("div");
    el.className = "calendar-weekday";
    el.textContent = d;
    grid.appendChild(el);
  });

  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const jsDay = firstDay.getDay();
  const mondayIndex = (jsDay + 6) % 7;

  for (let i = 0; i < mondayIndex; i++) {
    const blank = document.createElement("div");
    blank.className = "calendar-cell blank";
    grid.appendChild(blank);
  }

  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
    const iso = toISODateLocal(dateObj);

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "calendar-cell";

    const num = document.createElement("div");
    num.className = "calendar-daynum";
    num.textContent = day;

    cell.appendChild(num);

    if (iso === toISODateLocal(new Date())) cell.classList.add("today");

    const info = GLOBAL_DATE_MAP[iso];

    if (info && info.trips.length > 0) {
      cell.classList.add("active");

      // Tooltip text (trip names)
      const tooltip = info.trips.map(t => t.tripName).join("\n");
      cell.title = tooltip;

      // DOTS
      const dots = document.createElement("div");
      dots.className = "calendar-dots";

      const types = Array.from(info.types);
      const limited = types.slice(0, MAX_CALENDAR_DOTS);

      limited.forEach(type => {
        const meta = TYPE_META[type] || { color: "#aaa" };
        const dot = document.createElement("span");
        dot.className = "calendar-dot";
        dot.style.background = meta.color;
        dots.appendChild(dot);
      });

      if (types.length > MAX_CALENDAR_DOTS) {
        const more = document.createElement("span");
        more.className = "calendar-dot-more";
        more.textContent = "+";
        dots.appendChild(more);
      }

      cell.appendChild(dots);

      // CLICK BEHAVIOUR
      cell.addEventListener("click", async () => {
        let chosenTripId = info.trips[0].tripId;

        if (info.trips.length > 1) {
          const picked = await showTripPicker(iso, info.trips);
          if (!picked) return;
          chosenTripId = picked;
        }

        document.querySelectorAll(".trip-button").forEach(btn => {
          btn.classList.toggle("active", btn.dataset.tripId === chosenTripId);
        });

        setTripInUrl(chosenTripId);
        await loadTrip(chosenTripId);

        setTimeout(() => {
          const target = document.getElementById(`day-${iso}`);
          if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 250);
      });

    } else {
      cell.disabled = true;
      cell.classList.add("inactive");
    }

    grid.appendChild(cell);
  }

  gridWrap.appendChild(grid);
  return gridWrap;
}

/***********************
 * RENDER TIMELINE
 ***********************/
function render(items, tripName, tripId) {
  const timeline = document.getElementById("timeline");
  timeline.innerHTML = "";

  renderGlobalCalendar();

  // Trip title heading
  const tripTitle = document.createElement("h1");
  tripTitle.className = "trip-title";
  tripTitle.textContent = tripName;
  timeline.appendChild(tripTitle);

  // Share link under title (hide in share mode)
if (!isShareMode()) {
  const shareLink = document.createElement("button");
  shareLink.type = "button";
  shareLink.className = "trip-share-link";
  shareLink.textContent = "Share this trip";

  shareLink.addEventListener("click", async () => {
    const url = buildShareUrl(tripId);

    try {
      await navigator.clipboard.writeText(url);
      shareLink.textContent = "Copied!";
      setTimeout(() => shareLink.textContent = "Share this trip", 1200);
    } catch {
      prompt("Copy this link:", url);
    }
  });

  timeline.appendChild(shareLink);
}

  const days = {};
  items.forEach(item => {
    if (!days[item.day]) days[item.day] = [];
    days[item.day].push(item);
  });

  Object.entries(days).forEach(([day, dayItems]) => {
    if (HIDE_PAST_DAYS && isDayInPast(day)) return;

    const section = document.createElement("section");
    section.className = "day";

    const dayISO = toISODateLocal(new Date(dayItems[0].timestamp));
    section.id = `day-${dayISO}`;

    section.innerHTML = `<h3>${formatPrettyDate(new Date(dayItems[0].timestamp))}</h3>`;

    dayItems.forEach(item => {
      const meta = TYPE_META[item.type] || { icon: "circle", color: "#aaa" };
      const el = document.createElement("div");
      el.className = "item";

      let phaseText = item.phase || "";
      if (item.type === "Lounge") phaseText = "";
      if (item.type === "Show") phaseText = item.duration ? `${item.duration}` : "";

      const placeholderClass = item.type === "None" ? " placeholder" : "";

      let iconHTML = `<i data-lucide="${meta.icon}"></i>`;
      let timeHTML = `<div class="time">${formatTimeSheet(item.startDate,item.startTime,item.startUTC)}</div>`;

      if (item.type === "None") {
        iconHTML = "";
        timeHTML = "";
      }

      el.innerHTML = `
        <div class="icon${placeholderClass}" style="background:${meta.color}">
          ${iconHTML}
        </div>
        <div class="details${placeholderClass}">
          ${timeHTML}
          <div class="title"><strong>${item.title}</strong></div>
          ${phaseText ? `<div>${phaseText}</div>` : ""}
          ${item.details ? `<div class="item-details">${item.details}</div>` : ""}
          ${item.bookingRef ? `<div class="bookingRef">${item.bookingRef}</div>` : ""}
          ${item.address ? `<button class="directions" onclick="window.open('https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address)}','_blank')">Get Directions</button>` : ""}
        </div>
      `;

      section.appendChild(el);
    });

    timeline.appendChild(section);
  });

  lucide.createIcons();
}

/***********************
 * LOAD TRIP
 ***********************/
async function loadTrip(tabName) {
  try {
    const rows = await fetchSheetRows(tabName);
    const items = transform(rows);

    const trip = TRIPS.find(t => t.id === tabName);
    const displayName = trip ? trip.name : tabName;

    render(items, displayName, tabName);
  } catch (err) {
    document.getElementById("timeline").innerHTML =
      `<p style="color:red">Error loading trip: ${err.message}</p>`;
    console.error(err);
  }
}

/***********************
 * TRIP SELECTOR
 ***********************/
function initTripSelector() {
  const container = document.getElementById("trip-buttons");
  container.innerHTML = "";

  if (isShareMode()) {
    // Share mode: hide the menu entirely
    container.style.display = "none";
    return;
  } else {
    container.style.display = "";
  }

  const tripFromUrl = getTripFromUrl();
  let initialTrip = TRIPS[0];

  if (tripFromUrl) {
    const match = TRIPS.find(t => t.id === tripFromUrl);
    if (match) initialTrip = match;
  }

  TRIPS.forEach(trip => {
    const btn = document.createElement("button");
    btn.className = "trip-button";
    btn.textContent = trip.name;
    btn.dataset.tripId = trip.id;

    btn.addEventListener("click", () => {
      document.querySelectorAll(".trip-button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      setTripInUrl(trip.id);
      loadTrip(trip.id);
    });

    container.appendChild(btn);
  });

  document.querySelectorAll(".trip-button").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tripId === initialTrip.id);
  });

  setTripInUrl(initialTrip.id);
  loadTrip(initialTrip.id);
}

/***********************
 * BACK/FORWARD SUPPORT
 ***********************/
window.addEventListener("popstate", () => {
  const tripFromUrl = getTripFromUrl();
  if (!tripFromUrl) return;

  document.querySelectorAll(".trip-button").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tripId === tripFromUrl);
  });

  loadTrip(tripFromUrl);
});

/***********************
 * INIT APP
 ***********************/
async function initApp() {
  await buildGlobalCalendarData();

  // If share mode: just load that trip directly
  if (isShareMode()) {
    const tripId = getTripFromUrl() || TRIPS[0].id;
    await loadTrip(tripId);
    initTripSelector(); // hides menu
    return;
  }

  initTripSelector();
}

initApp();
