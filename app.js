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
  Walk: { icon: "footprints", color: "var(--walk)" },

  Drive: { icon: "car-front", color: "var(--drive)" },
  Food: { icon: "hamburger", color: "var(--food)" },
  Parking: { icon: "parking-circle", color: "var(--parking)" },
  "Theme Park": { icon: "ferris-wheel", color: "var(--themepark)" }
};

/***********************
 * GLOBAL STATE
 ***********************/
let activeTripId = null;

// Calendar state
const calendarState = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(), // 0-11
  dataByDate: {}, // "YYYY-MM-DD" => [{tripId, tripName}]
};

/***********************
 * SHARE MODE
 ***********************/
function isShareMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get("share") === "1";
}

function buildShareUrl(tripId) {
  const base = window.location.origin + window.location.pathname;
  return `${base}?trip=${encodeURIComponent(tripId)}&share=1`;
}

function applyShareModeUI() {
  if (!isShareMode()) return;

  const header = document.getElementById("app-header");
  const cal = document.getElementById("calendar-wrap");

  if (header) header.style.display = "none";
  if (cal) cal.style.display = "none";
}

/***********************
 * HELPER FUNCTIONS
 ***********************/
function toUTC(date, time, utcOffset) {
  const d = new Date(`${date} ${time} UTC`);
  return d.getTime() - utcOffset * 3600000;
}

function formatTimeSheet(dateStr, timeStr, utcOffset) {
  const offset = parseInt(utcOffset, 10);
  return offset !== 0 ? `${timeStr} (${offset >= 0 ? "+" : ""}${offset}h)` : timeStr;
}

function formatPrettyDate(dateObj) {
  const weekdays = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const day = dateObj.getDate();
  const suffix = (d => {
    if (d > 3 && d < 21) return "th";
    switch (d % 10) { case 1: return "st"; case 2: return "nd"; case 3: return "rd"; default: return "th"; }
  })(day);
  return `${weekdays[dateObj.getDay()]} ${day}${suffix} ${months[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
}

function toISODate(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfTodayLocal() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function scrollToDayISO(iso) {
  const el = document.getElementById(`day-${iso}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getTripStartDate(items) {
  const realItems = items.filter(i => i.type !== "None");
  if (realItems.length === 0) return null;

  const earliest = realItems.reduce(
    (min, i) => (i.timestamp < min ? i.timestamp : min),
    realItems[0].timestamp
  );
  return new Date(earliest);
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

    // Phase names
    let phases = { Start: "Start", End: "End" };
    if (row.TYPE === "Hotel") phases = { Start: "Check-in", End: "Check-out" };
    if (row.TYPE === "Flight") phases = { Start: "Take off", End: "Land" };
    if (row.TYPE === "Cruise") phases = { Start: "Embarkation", End: "Disembarkation" };
    if (row.TYPE === "Train") phases = { Start: "Depart", End: "Arrive" };

    if (["Flight","Hotel","Cruise","Train"].includes(row.TYPE)) {
      const startDuration = calculateDuration(row.TYPE, startTimestamp, endTimestamp);

      items.push(
        makeItem(
          row,
          startTimestamp,
          phases.Start,
          startDuration,
          row["START DATE"],
          row["START TIME"],
          row["START UTC"],
          row.TYPE
        )
      );

      items.push(
        makeItem(
          row,
          endTimestamp,
          phases.End,
          null,
          row["END DATE"],
          row["END TIME"],
          row["END UTC"],
          row.TYPE
        )
      );
    } else {
      items.push(
        makeItem(
          row,
          startTimestamp,
          null,
          null,
          row["START DATE"],
          row["START TIME"],
          row["START UTC"],
          row.TYPE
        )
      );
    }
  });

  // Add empty placeholder days
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
 * CALCULATE DURATION
 ***********************/
function calculateDuration(type, start, end) {
  switch(type) {
    case "Hotel": {
      const nights = Math.ceil((end - start) / (1000*60*60*24));
      const fixed = nights < 1 ? 1 : nights;
      return `${fixed} night${fixed !== 1 ? "s" : ""}`;
    }
    case "Cruise": {
      const days = Math.ceil((end - start) / (1000*60*60*24));
      return `${days} day${days > 1 ? "s" : ""}`;
    }
    default: {
      const mins = Math.round((end - start) / 60000);
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

  // Uber cleanup
  if (type === "Uber") {
    const parts = title.split(">");
    if (parts.length > 1) title = "Uber to " + parts[1].trim();
    else title = "Uber to " + title.replace(/\bUber\b/i,"").trim();
  }

  // Walk cleanup
  if (type === "Walk") {
    const parts = title.split(">");
    if (parts.length > 1) title = "Walk to " + parts[1].trim();
    else title = "Walk to " + title.replace(/\bUber\b/i,"").trim();
  }

  // Day grouping should be based on the sheet's date/time, NOT UTC
  const localDate = new Date(`${dateVal} ${timeVal}`);
  const displayDay = localDate.toDateString();

  const multiPhase = ["Flight","Hotel","Cruise","Train"];
  const includeDetails = !(multiPhase.includes(type) && phase && !["Check-in","Take off","Embarkation","Depart"].includes(phase));

  let detailsFormatted = [];
  if (row.DETAILS && includeDetails) {
    detailsFormatted = row.DETAILS.split("\n").filter(line => line.trim() !== "");

    switch(type) {
      case "Hotel":
        detailsFormatted = detailsFormatted.map(line => `Room Type: ${line}`);
        break;

      case "Flight":
        if(detailsFormatted[0]) detailsFormatted[0] = `Flight #: ${detailsFormatted[0]}`;
        if(detailsFormatted[1]) detailsFormatted[1] = `Aircraft: ${detailsFormatted[1]}`;
        if(detailsFormatted[2]) detailsFormatted[2] = `Cabin: ${detailsFormatted[2]}`;
        break;

      case "Cruise":
        if(detailsFormatted[0]) detailsFormatted[0] = `Cruise Line: ${detailsFormatted[0]}`;
        if(detailsFormatted[1]) detailsFormatted[1] = `Ship: ${detailsFormatted[1]}`;
        if(detailsFormatted[2]) detailsFormatted[2] = `Cabin Type: ${detailsFormatted[2]}`;
        if(detailsFormatted[3]) detailsFormatted[3] = `Cabin #: ${detailsFormatted[3]}`;
        if (phase === "Embarkation" && duration) detailsFormatted.unshift(`${duration}`);
        break;

      case "Train":
        if(detailsFormatted[0]) detailsFormatted[0] = `Train Company: ${detailsFormatted[0]}`;
        if(detailsFormatted[1]) detailsFormatted[1] = `Train #: ${detailsFormatted[1]}`;
        if(detailsFormatted[2]) detailsFormatted[2] = `Coach Type: ${detailsFormatted[2]}`;
        if(detailsFormatted[3]) detailsFormatted[3] = `Seat #: ${detailsFormatted[3]}`;
        break;
    }

    // Add Hotel duration to Check-in
    if (type === "Hotel" && phase === "Check-in" && duration) {
      detailsFormatted.unshift(`${duration}`);
    }

    detailsFormatted = detailsFormatted.join("<br>");
  } else detailsFormatted = "";

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
 * RENDER TIMELINE
 ***********************/
function render(items, tripName, tripId) {
  const timeline = document.getElementById("timeline");
  timeline.innerHTML = "";

  // Trip title heading
  const tripTitle = document.createElement("h1");
  tripTitle.className = "trip-title";
  tripTitle.textContent = tripName;
  timeline.appendChild(tripTitle);

  // Share button under title (hide in share mode)
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

  const todayStart = startOfTodayLocal();

  Object.entries(days).forEach(([day, dayItems]) => {
    // Hide days that have passed
    const dayDateObj = new Date(dayItems[0].timestamp);
    const dayStart = new Date(dayDateObj.getFullYear(), dayDateObj.getMonth(), dayDateObj.getDate()).getTime();
    if (dayStart < todayStart) return;

    const iso = toISODate(dayDateObj);

    const section = document.createElement("section");
    section.className = "day";
    section.id = `day-${iso}`;
    section.innerHTML = `<h3>${formatPrettyDate(dayDateObj)}</h3>`;

    dayItems.forEach(item => {
      const meta = TYPE_META[item.type] || { icon: "circle", color: "#aaa" };
      const el = document.createElement("div");
      el.className = "item";

      let phaseText = item.phase || "";
      if (["Flight","Train"].includes(item.type)) phaseText = item.phase || "";
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
          ${phaseText ? `<div class="phase">${phaseText}</div>` : ""}
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
 * TRIP SELECTOR (BUTTONS)
 ***********************/
async function initTripSelector() {
  const container = document.getElementById("trip-buttons-inner");
  container.innerHTML = "";

  // Share mode: only show one trip (from URL)
  if (isShareMode()) {
    const tripFromUrl = new URLSearchParams(window.location.search).get("trip");
    if (!tripFromUrl) {
      document.getElementById("timeline").innerHTML = `<p style="color:red">No trip specified.</p>`;
      return;
    }

    activeTripId = tripFromUrl;
    await loadTrip(tripFromUrl, { updateUrl: false });
    return;
  }

  // Hide trips that are fully in the past by checking each tab quickly
  const visibleTrips = [];

  for (const trip of TRIPS) {
    try {
      const rows = await fetchSheetRows(trip.id);
      const items = transform(rows);

      const realItems = items.filter(i => i.type !== "None");
      if (realItems.length === 0) continue;

      const latest = realItems.reduce((max, i) => (i.timestamp > max ? i.timestamp : max), realItems[0].timestamp);
      if (latest >= startOfTodayLocal()) {
        visibleTrips.push(trip);
      }
    } catch {
      // If tab fails, keep it visible rather than losing it
      visibleTrips.push(trip);
    }
  }

  // Build buttons
  visibleTrips.forEach((trip, index) => {
    const btn = document.createElement("button");
    btn.className = "trip-button";
    btn.textContent = trip.name;
    btn.dataset.tripId = trip.id;

    btn.addEventListener("click", async () => {
      document.querySelectorAll(".trip-button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeTripId = trip.id;

      await loadTrip(trip.id, { updateUrl: true });

      // If calendar open, jump to trip start month
      const cal = document.getElementById("calendar-wrap");
      const isOpen = cal && cal.style.display !== "none";
      if (isOpen) {
        const rows = await fetchSheetRows(trip.id);
        const items = transform(rows);
        const tripStart = getTripStartDate(items);
        if (tripStart) setCalendarMonth(tripStart.getFullYear(), tripStart.getMonth());
      }
    });

    container.appendChild(btn);

    // Auto-load first trip unless URL specifies one
    if (index === 0) btn.classList.add("active");
  });

  // URL trip support
  const tripFromUrl = new URLSearchParams(window.location.search).get("trip");
  const firstTrip = visibleTrips[0];

  if (tripFromUrl && visibleTrips.some(t => t.id === tripFromUrl)) {
    activeTripId = tripFromUrl;
    await loadTrip(tripFromUrl, { updateUrl: false });

    // Activate correct button
    document.querySelectorAll(".trip-button").forEach(b => {
      if (b.dataset.tripId === tripFromUrl) b.classList.add("active");
      else b.classList.remove("active");
    });
  } else if (firstTrip) {
    activeTripId = firstTrip.id;
    await loadTrip(firstTrip.id, { updateUrl: true });
  }

  lucide.createIcons();
}

/***********************
 * LOAD TRIP
 ***********************/
async function loadTrip(tabName, opts = { updateUrl: true }) {
  try {
    const rows = await fetchSheetRows(tabName);
    const items = transform(rows);

    const trip = TRIPS.find(t => t.id === tabName);
    const displayName = trip ? trip.name : tabName;

    render(items, displayName, tabName);

    // Update URL
    if (!isShareMode() && opts.updateUrl) {
      history.pushState({}, "", `?trip=${encodeURIComponent(tabName)}`);
    }

  } catch (err) {
    document.getElementById("timeline").innerHTML =
      `<p style="color:red">Error loading trip: ${err.message}</p>`;
    console.error(err);
  }
}

/***********************
 * CALENDAR (GLOBAL)
 ***********************/
function initCalendar() {
  if (isShareMode()) return;

  const main = document.body;

  const wrap = document.createElement("div");
  wrap.id = "calendar-wrap";
  wrap.style.display = "none"; // starts hidden
  main.insertBefore(wrap, document.getElementById("timeline"));

  wrap.innerHTML = `
    <div class="calendar-header">
      <button class="cal-nav" id="cal-prev" title="Previous month">
        <i data-lucide="chevron-left"></i>
      </button>
      <div class="calendar-title" id="cal-title"></div>
      <button class="cal-nav" id="cal-next" title="Next month">
        <i data-lucide="chevron-right"></i>
      </button>
    </div>

    <div class="calendar-weekdays">
      <div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div><div>Sun</div>
    </div>

    <div class="calendar-grid" id="calendar-grid"></div>
  `;

  document.getElementById("cal-prev").addEventListener("click", () => {
    calendarState.month--;
    if (calendarState.month < 0) {
      calendarState.month = 11;
      calendarState.year--;
    }
    renderCalendar();
  });

  document.getElementById("cal-next").addEventListener("click", () => {
    calendarState.month++;
    if (calendarState.month > 11) {
      calendarState.month = 0;
      calendarState.year++;
    }
    renderCalendar();
  });

  buildGlobalCalendarData().then(() => {
    renderCalendar();
  });
}

async function buildGlobalCalendarData() {
  calendarState.dataByDate = {};

  for (const trip of TRIPS) {
    try {
      const rows = await fetchSheetRows(trip.id);
      const items = transform(rows);

      const realItems = items.filter(i => i.type !== "None");

      // Map by day ISO
      realItems.forEach(item => {
        const dayObj = new Date(item.timestamp);
        const iso = toISODate(dayObj);

        if (!calendarState.dataByDate[iso]) calendarState.dataByDate[iso] = [];
        calendarState.dataByDate[iso].push({
          tripId: trip.id,
          tripName: trip.name
        });
      });

    } catch (e) {
      console.warn("Calendar trip load failed:", trip.id);
    }
  }
}

function setCalendarMonth(year, monthIndex) {
  calendarState.year = year;
  calendarState.month = monthIndex;
  renderCalendar();
}

function renderCalendar() {
  const months = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];

  const title = document.getElementById("cal-title");
  const grid = document.getElementById("calendar-grid");

  if (!title || !grid) return;

  title.textContent = `${months[calendarState.month]} ${calendarState.year}`;
  grid.innerHTML = "";

  // Calendar starts on Monday
  const firstDay = new Date(calendarState.year, calendarState.month, 1);
  const lastDay = new Date(calendarState.year, calendarState.month + 1, 0);

  const startWeekday = (firstDay.getDay() + 6) % 7; // convert Sunday=0 to Monday=0
  const totalDays = lastDay.getDate();

  // Empty leading cells
  for (let i = 0; i < startWeekday; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-day empty";
    grid.appendChild(empty);
  }

  for (let day = 1; day <= totalDays; day++) {
    const d = new Date(calendarState.year, calendarState.month, day);
    const iso = toISODate(d);

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "calendar-day";
    cell.textContent = day;

    const tripsOnDay = calendarState.dataByDate[iso] || [];

    if (tripsOnDay.length > 0) {
      cell.classList.add("has-event");

      // Hover tooltip with trip names
      const uniqueTrips = [...new Set(tripsOnDay.map(t => t.tripName))];
      cell.title = uniqueTrips.join(" • ");

      cell.addEventListener("click", async () => {
        // If only one trip, go directly
        const uniqueTripIds = [...new Set(tripsOnDay.map(t => t.tripId))];

        if (uniqueTripIds.length === 1) {
          await goToCalendarTripDay(uniqueTripIds[0], iso);
        } else {
          showTripChooser(uniqueTripIds, iso);
        }
      });
    }

    grid.appendChild(cell);
  }

  lucide.createIcons();
}

async function goToCalendarTripDay(tripId, iso) {
  // Load the trip
  activeTripId = tripId;

  // Activate menu button
  document.querySelectorAll(".trip-button").forEach(b => {
    if (b.dataset.tripId === tripId) b.classList.add("active");
    else b.classList.remove("active");
  });

  await loadTrip(tripId, { updateUrl: true });

  // Close calendar automatically
  const cal = document.getElementById("calendar-wrap");
  const toggle = document.getElementById("calendar-toggle");
  if (cal) cal.style.display = "none";
  if (toggle) toggle.classList.remove("active");

  // Scroll to the day
  setTimeout(() => scrollToDayISO(iso), 250);
}

function showTripChooser(tripIds, iso) {
  // Build overlay
  const overlay = document.createElement("div");
  overlay.className = "trip-chooser-overlay";

  const box = document.createElement("div");
  box.className = "trip-chooser-box";

  box.innerHTML = `
    <h3>Which trip?</h3>
    <div class="trip-chooser-buttons"></div>
    <button class="trip-chooser-cancel">Cancel</button>
  `;

  const btnWrap = box.querySelector(".trip-chooser-buttons");

  tripIds.forEach(id => {
    const trip = TRIPS.find(t => t.id === id);
    const name = trip ? trip.name : id;

    const b = document.createElement("button");
    b.type = "button";
    b.textContent = name;

    b.addEventListener("click", async () => {
      document.body.removeChild(overlay);
      await goToCalendarTripDay(id, iso);
    });

    btnWrap.appendChild(b);
  });

  box.querySelector(".trip-chooser-cancel").addEventListener("click", () => {
    document.body.removeChild(overlay);
  });

  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

/***********************
 * CALENDAR TOGGLE BUTTON
 ***********************/
function initCalendarToggle() {
  if (isShareMode()) return;

  const btn = document.getElementById("calendar-toggle");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const cal = document.getElementById("calendar-wrap");
    if (!cal) return;

    const isOpen = cal.style.display !== "none";

    if (isOpen) {
      cal.style.display = "none";
      btn.classList.remove("active");
    } else {
      cal.style.display = "block";
      btn.classList.add("active");

      // Jump to active trip start month if possible
      if (activeTripId) {
        const trip = TRIPS.find(t => t.id === activeTripId);
        if (trip) {
          fetchSheetRows(trip.id).then(rows => {
            const items = transform(rows);
            const tripStart = getTripStartDate(items);
            if (tripStart) setCalendarMonth(tripStart.getFullYear(), tripStart.getMonth());
          });
        }
      }
    }

    lucide.createIcons();
  });

  lucide.createIcons();
}

/***********************
 * INIT APP
 ***********************/
applyShareModeUI();
initCalendar();
initCalendarToggle();
initTripSelector();
