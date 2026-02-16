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

  // NEW TYPES
  Drive: { icon: "car-front", color: "var(--drive)" },
  Food: { icon: "hamburger", color: "var(--food)" },
  Parking: { icon: "parking-circle", color: "var(--parking)" },
  "Theme Park": { icon: "ferris-wheel", color: "var(--themepark)" }
};

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
    if (d > 3 && d < 21) return 'th';
    switch (d % 10) { case 1: return 'st'; case 2: return 'nd'; case 3: return 'rd'; default: return 'th'; }
  })(day);
  return `${weekdays[dateObj.getDay()]} ${day}${suffix} ${months[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
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
      items.push(makeItem(row, startTimestamp, phases.Start, startDuration, row["START DATE"], row["START TIME"], row["START UTC"], row.TYPE));
      items.push(makeItem(row, endTimestamp, phases.End, null, row["END DATE"], row["END TIME"], row["END UTC"], row.TYPE));
    } else {
      items.push(makeItem(row, startTimestamp, null, null, row["START DATE"], row["START TIME"], row["START UTC"], row.TYPE));
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
    case "Hotel":
      const nights = Math.ceil((end - start)/(1000*60*60*24));
      return `${nights < 1 ? 1 : nights} night${nights !== 1 ? "s" : ""}`;
    case "Cruise":
      const days = Math.ceil((end-start)/(1000*60*60*24));
      return `${days} day${days>1?"s":""}`;
    default:
      const mins = Math.round((end-start)/60000);
      return `${Math.floor(mins/60)}h ${mins%60}m`;
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

  const localDate = new Date(`${dateVal} ${timeVal}`);
  const displayDay = localDate.toDateString();

  const multiPhase = ["Flight","Hotel","Cruise","Train"];
  const includeDetails = !(multiPhase.includes(type) && phase && !["Check-in","Take off","Embarkation","Depart"].includes(phase));

  let detailsFormatted = [];
  if (row.DETAILS && includeDetails) {
    detailsFormatted = row.DETAILS.split("\n").filter(line => line.trim() !== "");

    switch(type) {
      case "Hotel": detailsFormatted = detailsFormatted.map(line => `Room Type: ${line}`); break;
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
function render(items, tripName) {
  const timeline = document.getElementById("timeline");
timeline.innerHTML = "";

// Trip title heading
const tripTitle = document.createElement("h1");
tripTitle.className = "trip-title";
tripTitle.textContent = tripName;
timeline.appendChild(tripTitle);



  const days = {};
  items.forEach(item => {
    if (!days[item.day]) days[item.day] = [];
    days[item.day].push(item);
  });

  Object.entries(days).forEach(([day, dayItems]) => {
    const section = document.createElement("section");
    section.className = "day";
    section.innerHTML = `<h3>${formatPrettyDate(new Date(dayItems[0].timestamp))}</h3>`;

    dayItems.forEach(item => {
      const meta = TYPE_META[item.type] || { icon: "circle", color: "#aaa" };
      const el = document.createElement("div");
      el.className = "item";

      let phaseText = item.phase || "";
      if (["Flight","Train"].includes(item.type)) phaseText = item.phase || "";
      if (item.type === "Lounge") phaseText = "";
      if (item.type === "Show") phaseText = item.duration ? `${item.duration}` : "";

      // Special styling for placeholders
      const placeholderClass = item.type === "None" ? " placeholder" : "";

      let iconHTML = `<i data-lucide="${meta.icon}"></i>`;
let timeHTML = `<div class="time">${formatTimeSheet(item.startDate,item.startTime,item.startUTC)}</div>`;

// If placeholder, remove icon and time
if (item.type === "None") {
  iconHTML = "";       // no icon
  timeHTML = "";       // no time
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
 * TRIP SELECTOR (BUTTONS)
 ***********************/
function initTripSelector() {
  const container = document.getElementById("trip-buttons");
  container.innerHTML = "";

  TRIPS.forEach((trip, index) => {
    const btn = document.createElement("button");
    btn.className = "trip-button";
    btn.textContent = trip.name;
    btn.dataset.tripId = trip.id;

    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".trip-button")
        .forEach(b => b.classList.remove("active"));

      btn.classList.add("active");
      loadTrip(trip.id);
    });

    container.appendChild(btn);

    // Auto-load + highlight first trip
    if (index === 0) {
      btn.classList.add("active");
      loadTrip(trip.id);
    }
  });
}

/***********************
 * LOAD TRIP
 ***********************/
async function loadTrip(tabName) {
  try {
    const rows = await fetchSheetRows(tabName);
    const items = transform(rows);

    // Find friendly trip name from TRIPS config
    const trip = TRIPS.find(t => t.id === tabName);
    const displayName = trip ? trip.name : tabName;

    render(items, displayName);
  } catch (err) {
    document.getElementById("timeline").innerHTML =
      `<p style="color:red">Error loading trip: ${err.message}</p>`;
    console.error(err);
  }
}

/***********************
 * INIT APP
 ***********************/
initTripSelector();
