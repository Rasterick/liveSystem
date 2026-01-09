const systemData = {}; // --- 1. System Data (The static JSON remains for initial page load) ---

// --- 2. Global State and Constants ---
const CANVAS_SIZE = 800;
const CENTER_OFFSET = CANVAS_SIZE / 2;
const AU_IN_METERS = 149597870700;
const inputElement = document.getElementById("system-input"); // FIX: Define globally

let CURRENT_SCALE_FACTOR = 0;

let viewBoxX = 0;
let viewBoxY = 0;
let viewBoxWidth = CANVAS_SIZE;
let viewBoxHeight = CANVAS_SIZE;

let scanRingsVisible = true;
//et currentURL ="";

// --- New Global State for Cursor Position ---
let mouseX = 0;
let mouseY = 0;

let isAwaitingScanOrigin = false;

// --- New Global Variables for Drag-to-Pan ---
let isDragging = false;
let startX = 0;
let startY = 0;
let currentViewBox = { x: 0, y: 0, w: 800, h: 800 };

let currentSystemID = null; // This will hold the ID for the currently loaded system

let intelVisible = true; // Global state for intel visibility

let addMarkerContainer = false;

let currentSystemName = "";

const rootStyles = getComputedStyle(document.documentElement);
const colorMap = {
  Star: "--star-color",
  Barren: "--barren-color",
  Lava: "--lava-color",
  Storm: "--storm-color",
  Temperate: "--temperate-color",
  Oceanic: "--oceanic-color",
  Gas: "--gas-color",
  Ice: "--ice-color",
  Shattered: "--shattered-color",
  Moon: "--moon-color",
  orbit: "--orbit-color",
};

function toggleAddMarker() {
   // Always reset UI state
      isAddingMarker = false;
      document.getElementById("customMarkerControls").style.display = "none";

}


document.getElementById('toggle-intel').addEventListener('click', function() {
    intelVisible = !intelVisible; // Flip the state
    
    // Apply visibility to all current markers
    const markers = document.querySelectorAll('.user-marker');
    markers.forEach(m => {
        m.style.visibility = intelVisible ? 'visible' : 'hidden';
        // This prevents right-clicking things you can't see
        m.style.pointerEvents = intelVisible ? 'all' : 'none';
    });

    // Update button appearance
    this.textContent = intelVisible ? "Hide Intel" : "Show Intel";
    this.classList.toggle('btn-secondary', intelVisible);
    this.classList.toggle('btn-warning', !intelVisible);
});

  // 3. The "Stamping" Function
  function placeSymbolMarker(type, x, y, color, labelText, dbID = null) {
    const svgNS = "http://www.w3.org/2000/svg";
    const map = document.getElementById("system-map");

    const group = document.createElementNS(svgNS, "g");
    group.setAttribute("class", "user-marker");
    group.setAttribute("transform", `translate(${x}, ${y})`);

    if (dbID) {
      group.setAttribute("data-id", dbID);
    }

    // --- ADDED: INVISIBLE HITBOX ---
    // A circle with a radius of 20px (40px total diameter) makes clicking easy.
    // We place this FIRST so it is at the back of the group.
    const hitbox = document.createElementNS(svgNS, "circle");
    hitbox.setAttribute("r", "20"); 
    hitbox.setAttribute("fill", "transparent");
    hitbox.setAttribute("class", "marker-hitbox");
    group.appendChild(hitbox);

    const use = document.createElementNS(svgNS, "use");
    use.setAttributeNS("http://www.w3.org/1999/xlink", "href", `#icon-${type}`);
    use.setAttribute("fill", color);
    use.setAttribute("width", "20");
    use.setAttribute("height", "20");
    use.setAttribute("x", "-10");
    use.setAttribute("y", "-10");
    // Pointer-events: none ensures the click "falls through" to the hitbox
    use.style.pointerEvents = "none"; 

    const text = document.createElementNS(svgNS, "text");
    text.textContent = labelText;
    text.setAttribute("fill", color);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("y", "25");
    text.setAttribute(
      "style",
      "font-size: 10px; font-family: sans-serif; pointer-events: none;"
    );

    group.appendChild(use);
    group.appendChild(text);
    map.appendChild(group);

    group.style.cursor = "pointer";
    group.setAttribute("title", "Right-click to delete");

    group.addEventListener('contextmenu', function(e) {
        e.preventDefault(); 

        if (!dbID) {
            console.error("This marker has no database ID and cannot be deleted yet.");
            return;
        }
        if (confirm(`Delete marker "${labelText}"?`)) {
            fetch('api/delete_marker.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: dbID })
            })
            .then(res => res.json())
            .then(result => {
                if (result.status === 'success') {
                    group.remove(); 
                }
            });
        }
    });
}



// --- 3. HELPER FUNCTIONS (DEFINED FIRST) ---
// All functions must be defined using function declaration for reliability.
// --- Utility to Read URL Parameters ---
function getSystemFromURL() {
  const urlParams = new URLSearchParams(window.location.search);
  // Returns the value of 'system' or null if not found
  return urlParams.get("system");
}

function calculateDistance(pos) {
  return Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
}

// FIX: Updated to accept and use the dynamic scale factor
// Inside your <script> block
function transformCoordinates(x_eve, z_eve, currentScaleFactor) {
  // FIX: NaN Prevention - Ensure a safe non-zero number is used
  const safeScaleFactor =
    currentScaleFactor &&
    !isNaN(currentScaleFactor) &&
    currentScaleFactor > 1e-12
      ? currentScaleFactor
      : 2.95e-10;

  // FINAL FIX: Re-apply the X-axis inversion to fix the mirroring.
  const cx = -(x_eve * safeScaleFactor) + CENTER_OFFSET;

  // Y-axis inversion for North-up remains
  const cy = -(z_eve * safeScaleFactor) + CENTER_OFFSET;
  return { cx, cy };
}

function createCircle(cx, cy, r, className, data) {
  // ... (body of createCircle) ...
  const circle = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "circle"
  );
  circle.setAttribute("cx", cx);
  circle.setAttribute("cy", cy);
  circle.setAttribute("r", r);
  circle.setAttribute("class", className);
  circle.dataset.name = data.name;
  circle.dataset.type = data.type;
  circle.dataset.moons = data.moons ? data.moons.length : 0;
  circle.dataset.distance = calculateDistance(data.position_m);
  const titleElement = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "title"
  );
  titleElement.textContent = data.name;
  circle.appendChild(titleElement);
  circle.addEventListener("click", handleCelestialClick);
  return circle;
}

function createOrbit(radius_m, currentScaleFactor) {
  const r_svg = radius_m * currentScaleFactor;
  const orbit = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "circle"
  );
  orbit.setAttribute("cx", CENTER_OFFSET);
  orbit.setAttribute("cy", CENTER_OFFSET);
  orbit.setAttribute("r", r_svg);
  orbit.setAttribute("class", "orbit");
  return orbit;
}

function handleCelestialClick(event) {
  const element = event.target;
  const data = element.dataset;
  const infoPanel = document.getElementById("info-panel");
  const distanceMeters = parseFloat(data.distance);
  const distanceAU = (distanceMeters / AU_IN_METERS).toFixed(4);
  const distanceKM = (distanceMeters / 1000).toFixed(2);
  let html = `<div class="info-header">CELESTIAL DETAILS: ${data.name}</div>`;
  if (data.type && data.type.includes("Star")) {
//    html += `<p><strong>Star Name:</strong> ${data.name}</p>`;
    html += `<p><strong>Star Type:</strong> ${data.type}</p>`;
    html += `<p><strong>Position:</strong> Center of System</p>`;
  } else {
//    html += `<p><strong>Name:</strong> ${data.name}</p>`;
    html += `<p><strong>Type:</strong> ${data.type}</p>`;
    html += `<p><strong>Number of Moons:</strong> ${data.moons}</p>`;
    html += `<p><strong>Distance from Sun:</strong> ${distanceAU} AU (${distanceKM} Km)</p>`;
  }
  infoPanel.innerHTML = html;
}

function applySvgColors() {
  // ... (body of applySvgColors) ...
  const svg = document.getElementById("system-map");
  for (const [className, varName] of Object.entries(colorMap)) {
    const color = rootStyles.getPropertyValue(varName).trim();
    svg.querySelectorAll(`.${className}`).forEach((el) => {
      if (className === "orbit") {
        el.setAttribute("stroke", color);
      } else {
        el.setAttribute("fill", color);
      }
    });
  }
}

function toggleTheme() {
  document.getElementById("app-body").classList.toggle("light-theme");
  setTimeout(applySvgColors, 100);
}

// --- Updated zoomMap Function for Pan Integration ---

function zoomMap(factor) {
  const svg = document.getElementById("system-map");
  if (!svg) return;

  // Calculate the new width and height based on the current state
  const newWidth = currentViewBox.w * factor;
  const newHeight = currentViewBox.h * factor;

  // Calculate the new X and Y to keep the current center point (400, 400) stable
  const dx = (currentViewBox.w - newWidth) / 2;
  const dy = (currentViewBox.h - newHeight) / 2;

  const newX = currentViewBox.x + dx;
  const newY = currentViewBox.y + dy;

  // 1. Update the SVG viewBox attribute
  svg.setAttribute("viewBox", `${newX} ${newY} ${newWidth} ${newHeight}`);

  // 2. CRITICAL FIX: Update the global state
  currentViewBox.x = newX;
  currentViewBox.y = newY;
  currentViewBox.w = newWidth;
  currentViewBox.h = newHeight;
}

// --- Updated resetMapZoom Function ---

function resetMapZoom() {
  const svg = document.getElementById("system-map");
  if (!svg) return;

  const initialViewBox = "0 0 800 800";
  svg.setAttribute("viewBox", initialViewBox);

  // CRITICAL FIX: Update the global state on reset
  currentViewBox = { x: 0, y: 0, w: 800, h: 800 };
}

// --- Update loadSystemData to call it ---
async function loadSystemData(systemName) {
  //console.log(`Loading data for: ${systemName}`);

  // 1. Clear any old tactical rings from the previous system
  clearScanRange();

  document.getElementById("system-map").innerHTML = "";
  document.getElementById("info-panel").innerHTML = "Loading system details...";

  try {
    const response = await fetch(
      `api/get_system_data.php?systemName=${systemName}`
    );
    const data = await response.json();

    if (data.system_id) {
      currentSystemID = data.system_id; // Matches 'system_id' from your PHP
      console.log("System ID verified:", currentSystemID);

      

      // --- NEW: Restore Saved Markers ---
      if (data.markers && Array.isArray(data.markers)) {
    data.markers.forEach(m => {
        placeSymbolMarker(m.markerType, parseFloat(m.x_pos), parseFloat(m.y_pos), m.color, m.label, m.id);
    });

    // NEW: Check global state and hide them immediately if intelVisible is false
    if (!intelVisible) {
        document.querySelectorAll('.user-marker').forEach(m => {
            m.style.visibility = 'hidden';
        });
    }
    console.log(`Restored ${data.markers.length} markers.`);
}

      // 1. Clear any existing markers from the previous system
      document.querySelectorAll(".user-marker").forEach((el) => el.remove());

      drawSystemMap(data);

      // 2. Loop through the markers array sent by get_system_data.php
      if (data.markers && Array.isArray(data.markers)) {
        data.markers.forEach(m => {
            placeSymbolMarker(
                m.markerType, 
                parseFloat(m.x_pos), 
                parseFloat(m.y_pos), 
                m.color, 
                m.label, 
                m.id
            );
        });
        console.log(`Restored ${data.markers.length} markers.`);
      }
    } else {
      console.error(
        "Critical Error: system_id not found in PHP response",
        data
      );
    }

    currentSystemID = data.system_id; // Store the current system ID globally
    console.log("Current System ID set to:", currentSystemID);

    const S = data.dynamic_scale_factor;
    const DRAWING_AREA = 720; // Must match the value used in PHP
    const R_max_calculated = DRAWING_AREA / (2 * S);

    // --- SUCCESS ---

    // CRITICAL FIX: Call the legend update function here
    updateLegendTable(data);

    updateDiameterLegend(R_max_calculated);

    document.getElementById("info-panel").innerHTML = `System loaded: ${
      data.system_name
    } (Security: ${data.security_status.toFixed(2)})`;

    // Update the system header //
    document.getElementById(
      "system-header"
    ).innerText = `EVE System Map: ${data.system_name}`;
  } catch (error) {
    console.error("System load failed:", error);
    document.getElementById("info-panel").innerHTML =
      "Fatal error loading system data.";
  }
}

function deleteMarker(id, element) {
    fetch('api/delete_marker.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id })
    })
    .then(res => res.json())
    .then(result => {
        if (result.status === 'success') {
            element.remove(); // Remove from screen
        }
    });
}



// --- New Function for System Diameter Legend ---
function updateDiameterLegend(R_max_meters) {
  const AU_IN_METERS = 149597870700; // Define or access global constant
  const infoPanel = document.getElementById("info-panel"); // Re-use info panel for visibility

  if (R_max_meters <= 1e-12) {
    // Handle R_max being near zero or the safe fallback
    R_max_meters = 1000000000000; // Use a visual default if scale is missing
  }

  const diameterMeters = R_max_meters * 2;
  const diameterAU = (diameterMeters / AU_IN_METERS).toFixed(2); // Diameter in AU
  const diameterKm = (diameterMeters / 1000)
    .toFixed(0)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ","); // Diameter in KM, formatted

  // Create a dedicated DIV or P element below the map for this info
  // For simplicity, let's create a temporary element or add it to the info panel area.

  // If you prefer a static line below the map container, use a dedicated ID (e.g., system-diameter-display)
  const diameterDiv = document.getElementById("system-diameter-display");
  if (diameterDiv) {
    diameterDiv.innerHTML = `
            System Diameter: <strong>${diameterAU}  AU</strong> 
            (Approx. ${diameterKm} km) Radius: ${diameterAU / 2} AU
        `;
  }
}

//----- SVG Marker Placemnent Functions ----- ///
/**
 * Converts screen coordinates (mouse click) to SVG coordinates
 * based on the map's viewBox.
 */
function getSVGCoordinates(event) {
  const svg = document.getElementById("system-map");
  const pt = svg.createSVGPoint();

  // Pass the client mouse coordinates to the point object
  pt.x = event.clientX;
  pt.y = event.clientY;

  // Transform the point using the SVG's Current Transformation Matrix (CTM)
  // .inverse() allows us to map screen pixels back to SVG units
  const cursorPoint = pt.matrixTransform(svg.getScreenCTM().inverse());

  return {
    x: cursorPoint.x,
    y: cursorPoint.y,
  };
}

/// - END OF  SVG Marker Placemnent Functions ----- ///

// --- 4. AUTOCOMPLETE AND LOAD SYSTEM FUNCTIONS ---

// Function to handle the autocomplete request
async function fetchAutocomplete(query) {
  const resultsContainer = document.getElementById("autocomplete-results");
  const loadButton = document.getElementById("load-system-btn");

  if (query.length < 3) {
    resultsContainer.innerHTML = "";
    loadButton.disabled = true;
    return;
  }

  try {
    const response = await fetch(`api/autocomplete.php?query=${query}`);
    const results = await response.json();

    if (results.error) {
      console.error("API Error:", results.error);
      displayAutocomplete([]);
    } else {
      displayAutocomplete(results);
    }
  } catch (error) {
    console.error("Network/Fetch failed:", error);
    displayAutocomplete([]);
  }
}

// Function to display the results as clickable options
function displayAutocomplete(results) {
  // ... (body of displayAutocomplete) ...
  const container = document.getElementById("autocomplete-results");
  container.innerHTML = "";

  if (results.length === 0) {
    container.innerHTML = '<div style="padding: 5px;">No matches found.</div>';
    return;
  }

  const ul = document.createElement("ul");
  ul.style.listStyleType = "none";
  ul.style.padding = "5px";
  ul.style.margin = "0";

  results.forEach((name) => {
    const li = document.createElement("li");
    li.textContent = name;
    li.style.cursor = "pointer";
    li.style.padding = "3px 0";
    li.style.borderBottom = "1px solid #444";

    li.onclick = () => selectSystem(name);

    ul.appendChild(li);
  });
  container.appendChild(ul);
}

// Function to handle a system selection
function selectSystem(name) {
  document.getElementById("system-input").value = name;
  document.getElementById("autocomplete-results").innerHTML = "";
  document.getElementById("load-system-btn").disabled = false;
}

// --- 5. MAIN DRAWING LOGIC ---
function drawSystemMap(inputData) {
  const systemData = inputData || { planets: [] };
  const svg = document.getElementById("system-map");

  const initialViewBox = "0 0 800 800";
  svg.setAttribute("viewBox", initialViewBox);
  currentViewBox = { x: 0, y: 0, w: 800, h: 800 };

  // 1. CRITICAL: Extract the dynamic scale factor FIRST
  const SCALE_FACTOR = systemData.dynamic_scale_factor || 2.95e-10;

  CURRENT_SCALE_FACTOR = SCALE_FACTOR; // Update global state

  if (SCALE_FACTOR === 0) {
    document.getElementById("info-panel").innerHTML =
      "Error: Scale factor zero. System data might be incomplete.";
    return;
  }

  // Clear the map and reset zoom BEFORE drawing
  svg.innerHTML = "";
  resetMapZoom();

  // --- Star Logic (Guaranteed to exist by PHP/JS fix) ---
  const star = systemData.star || {};
  star.position_m = star.position_m || { x: 0.0, y: 0.0, z: 0.0 };
  star.name = star.name || systemData.system_name + " Sun";
  star.type = star.type || "Star";

  // 1. Draw the Star
  const starPos = transformCoordinates(
    star.position_m.x,
    star.position_m.z,
    SCALE_FACTOR
  );
  svg.appendChild(
    createCircle(starPos.cx, starPos.cy, 5, "Star", {
      ...star,
      ...{ moons: 0 },
    })
  );

  // 2. Draw Planets, Moons, and Orbits
  const planetsArray = systemData.planets || [];

  planetsArray.forEach((planet) => {
    const pos = planet.position_m;

    // a. Calculate orbit and draw orbit ring
    const orbitRadius_m = calculateDistance(pos);
    svg.appendChild(createOrbit(orbitRadius_m, SCALE_FACTOR));

    // b. Calculate position
    const { cx: planet_cx, cy: planet_cy } = transformCoordinates(
      pos.x,
      pos.z,
      SCALE_FACTOR
    );

    // c. Determine type class (defensive logic remains)
    const typeString = planet.type || "Unknown Type";
    const match = typeString.match(/\(([^)]+)\)/);
    const typeClass = match
      ? match[1].replace(/ /g, "")
      : typeString.replace(/ /g, "");

    // d. Draw Planet
    svg.appendChild(createCircle(planet_cx, planet_cy, 3, typeClass, planet));

    // e. Draw Moons (uncommented for future use)
    // if (planet.moons) {
    //     planet.moons.forEach((moon) => {
    //         const { cx: moon_cx, cy: moon_cy } = transformCoordinates(moon.position_m.x, moon.position_m.z, SCALE_FACTOR);
    //         svg.appendChild(createCircle(moon_cx, moon_cy, 1.5, "Moon", { ...moon, ...{ type: "Moon", moons: 0 } }));
    //     });
    // }
  });

  // 3. Draw Stargates (As Squares for tactical context) - MOVED TO THE END
  const gatesArray = systemData.stargates || [];

  const GATE_LABEL_OFFSET_INCREMENT = 10; // Pixels to shift the label down for clustered gates
  let labelVerticalOffset = 0;

  gatesArray.forEach((gate, index) => {
    const { cx: gate_cx, cy: gate_cy } = transformCoordinates(
      gate.position_m.x,
      gate.position_m.z,
      SCALE_FACTOR
    );

    // Use an SVG rect element to draw a square
    const size = 5;
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", gate_cx - size / 2);
    rect.setAttribute("y", gate_cy - size / 2);
    rect.setAttribute("width", size);
    rect.setAttribute("height", size);
    rect.setAttribute("class", "Stargate");
    rect.dataset.name = gate.name;
    rect.dataset.type = gate.type;
    rect.dataset.distance = calculateDistance(gate.position_m);

    // Attach the click event listener
    //rect.addEventListener('click', () => {
    //    updateLegendTable(gate);
    //});

    svg.appendChild(rect);

    if (index === 0) {
      labelVerticalOffset = 0;
    } else {
      // Get the coordinates of the previous gate
      const prevGate = gatesArray[index - 1];
      const { cx: prev_cx, cy: prev_cy } = transformCoordinates(
        prevGate.position_m.x,
        prevGate.position_m.z,
        SCALE_FACTOR
      );

      // Calculate the screen distance between the current and previous gate
      const screenDistance = Math.sqrt(
        Math.pow(gate_cx - prev_cx, 2) + Math.pow(gate_cy - prev_cy, 2)
      );

      // Define a threshold (e.g., if closer than 20 pixels, treat as a cluster)
      const CLUSTER_THRESHOLD = 20;

      if (screenDistance < CLUSTER_THRESHOLD) {
        // Clustered: Shift the label down further
        labelVerticalOffset += GATE_LABEL_OFFSET_INCREMENT;
      } else {
        // Not clustered: Reset the offset for this new group
        labelVerticalOffset = 0;
      }
    }

    // OPTIONAL: Add a label for the gate name (useful for K-space)
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");

    // Apply horizontal shift (right of the square) and the calculated vertical shift
    text.setAttribute("x", gate_cx + size);
    text.setAttribute("y", gate_cy + labelVerticalOffset); // <--- APPLIED SHIFT HERE

    text.setAttribute("fill", "var(--text-color)");
    text.setAttribute("font-size", "8");
    text.textContent = gate.name.replace("Stargate (", "").replace(")", "");
    svg.appendChild(text);
  });

  applySvgColors();
}

// --- New Functions to Draw and Clear the Range ---

// --- Updated drawScanRange() function (Only Sets State) ---
function drawScanRange() {
  if (CURRENT_SCALE_FACTOR === 0) {
    alert("Please load a system first.");
    return;
  }

  const inputElement = document.getElementById("scan-range-input");
  const rangeAU = parseFloat(inputElement.value);

  if (isNaN(rangeAU) || rangeAU <= 0.0 || rangeAU > 14.3) {
    alert("Please enter a scan range between 0.1 and 14.3 AU.");
    return;
  }

  // 1. Clear any old range circle IMMEDIATELY. (Ensure the map is clean)
  //clearScanRange();

  // 2. Set the state and store the range
  isAwaitingScanOrigin = true;
  document.getElementById("system-map").dataset.scanRangeAu = rangeAU;

  // 3. Notify the user and provide a visual cue
  alert("Choose location for scan origin by clicking anywhere on the map.");
  document.getElementById("system-map").style.cursor = "crosshair";

  // *** CRITICAL: NOTE that all drawing logic has been removed from here! ***
}

// --- Updated clearScanRange Function ---
// --- Corrected clearScanRange Function ---
function clearScanRange() {
  const svg = document.getElementById("system-map");
  if (!svg) return;

  // Selects ALL elements with the class 'scan-overlay-group'
  const existingRanges = svg.querySelectorAll(".scan-overlay-group");

  // Loop through all found groups and remove them
  existingRanges.forEach((element) => {
    element.remove();
  });
}

// --- New Function to set up map interactions ---
function setupMapInteractions() {
  const svg = document.getElementById("system-map");

  // Check if the map exists before adding the listener
  if (!svg) return;

  svg.addEventListener("click", (event) => {
    // If we are currently waiting for a scan origin click:
    if (isAwaitingScanOrigin) {
      event.stopPropagation();
      event.preventDefault(); // <-- CRITICAL: Stops default browser behavior

      // 1. Get the coordinates using the SVG transformation matrix
      const svgPoint = svg.createSVGPoint();
      svgPoint.x = event.clientX;
      svgPoint.y = event.clientY;

      const CTM = svg.getScreenCTM();
      if (!CTM) return;
      const transformedPoint = svgPoint.matrixTransform(CTM.inverse());

      const clickX_svg = transformedPoint.x;
      const clickY_svg = transformedPoint.y;

      // 2. Draw the circle at the clicked SVG coordinate
      drawScanCircleAtOrigin(clickX_svg, clickY_svg);

      // 3. Reset the state and cursor
      isAwaitingScanOrigin = false;
      document.getElementById("system-map").style.cursor = "default"; // <-- CRITICAL: Reset cursor
    }
    // NOTE: The click logic for celestial objects would typically run here (outside the IF)
    // but since your objects have their own listeners, this is fine.
  });
}

// --- New Function to Toggle Visibility of D-Scan Rings ---
function toggleScanRings() {
  const svg = document.getElementById("system-map");
  if (!svg) return;

  // Select all the groups containing the rings, crosses, and labels
  const allRings = svg.querySelectorAll(".scan-overlay-group");

  // Iterate through the NodeList and toggle the class
  allRings.forEach((group) => {
    group.classList.toggle("hidden-scan-ring");
  });

  // Update the state (optional, for future features like button text change)
  scanRingsVisible = !scanRingsVisible;

  // Optional: Update button text to reflect current action
  const button = document.querySelector('button[onclick="toggleScanRings()"]');
  if (button) {
    button.textContent = scanRingsVisible
      ? "Hide Scan Rings"
      : "Show Scan Rings";
  }
}

// --- New Core Drawing Function (called by the click handler) ---

// --- Corrected drawScanCircleAtOrigin Function ---
// --- Corrected drawScanCircleAtOrigin Function ---
function drawScanCircleAtOrigin(originX_svg, originY_svg) {
  const svg = document.getElementById("system-map");
  const rangeAU = parseFloat(svg.dataset.scanRangeAu);

  if (!rangeAU || CURRENT_SCALE_FACTOR === 0) return;

  // 1. Calculate the radius
  const rangeMeters = rangeAU * AU_IN_METERS;
  const screenRadius = rangeMeters * CURRENT_SCALE_FACTOR;

  // 2. Generate a unique group for the ring and cross
  const uniqueId = "scan-overlay-" + Date.now();
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("id", uniqueId);
  group.setAttribute("class", "scan-overlay-group");

  // --- DRAW THE RING ---
  const scanCircle = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "circle"
  );
  scanCircle.setAttribute("cx", originX_svg);
  scanCircle.setAttribute("cy", originY_svg);
  scanCircle.setAttribute("r", screenRadius);
  scanCircle.setAttribute("stroke", "cyan");
  scanCircle.setAttribute("stroke-width", "1.5");
  scanCircle.setAttribute("fill", "none");
  scanCircle.setAttribute("stroke-dasharray", "4 4");
  group.appendChild(scanCircle);

  // --- DRAW THE CROSSHAIR (4 lines making a cross) ---
  const crossSize = 5;

  // Horizontal Line
  const lineH = document.createElementNS("http://www.w3.org/2000/svg", "line");
  lineH.setAttribute("x1", originX_svg - crossSize);
  lineH.setAttribute("y1", originY_svg);
  lineH.setAttribute("x2", originX_svg + crossSize);
  lineH.setAttribute("y2", originY_svg);
  lineH.setAttribute("stroke", "red");
  lineH.setAttribute("stroke-width", "1.5");
  group.appendChild(lineH);

  // Vertical Line
  const lineV = document.createElementNS("http://www.w3.org/2000/svg", "line");
  lineV.setAttribute("x1", originX_svg);
  lineV.setAttribute("y1", originY_svg - crossSize);
  lineV.setAttribute("x2", originX_svg);
  lineV.setAttribute("y2", originY_svg + crossSize);
  lineV.setAttribute("stroke", "red");
  lineV.setAttribute("stroke-width", "1.5");
  group.appendChild(lineV);

  // --- ADD RANGE LABEL ---
  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute("x", originX_svg + crossSize + 2);
  text.setAttribute("y", originY_svg - crossSize);
  text.setAttribute("fill", "red");
  text.setAttribute("font-size", "10");
  text.textContent = `${rangeAU.toFixed(1)} AU`;
  group.appendChild(text);

  // 3. FINAL FIX: Insert the entire group into the SVG
  svg.insertBefore(group, svg.firstChild);
}

// - System Legend

// --- New Function for M3.4 ---
function updateLegendTable(data) {
  const tableBody = document.querySelector("#legend-table tbody");

  console.log("Updating Legend Table with data:", data);

  // Row 0: System Type
  tableBody.rows[0].cells[1].innerHTML = data.system_type;

  // Row 1: Security Status
  let securityDisplay = `${data.security_status.toFixed(3)}`;
  if (data.system_type.includes("Wormhole")) {
    securityDisplay += " (Wormhole Space)";
  } else if (data.security_status <= 0.0) {
    securityDisplay += " (Null Sec)";
  }
  tableBody.rows[1].cells[1].innerHTML = securityDisplay;

  // Row 2: Static Connections
  // Cleans up "C4 / C5" to "C4, C5" and handles null/empty statics
  let staticsDisplay = "";
  if (data.wh_statics) {
    const parts = data.wh_statics
      .split(" / ")
      .filter((s) => s.trim() !== "null" && s.trim() !== "");
    staticsDisplay = parts.join(", ");
  }
  tableBody.rows[2].cells[1].innerHTML = staticsDisplay || "None (Transient)";

  // Row 3: Wormhole Effect
  tableBody.rows[3].cells[1].innerHTML = data.wh_effect;

  // Row 4: Ship Size Limit
  tableBody.rows[4].cells[1].innerHTML = data.ship_limit;
}

// --- 6. INITIALIZATION ---
// --- 6. INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
    // 1. Unify the Input Element Reference
    const systemInput = document.getElementById("system-input");
    const autocompleteResults = document.getElementById("autocomplete-results");

    // 2. URL Parameter Handling (Direct Load)
    const urlParams = new URLSearchParams(window.location.search);
    const systemFromURL = urlParams.get('system');

    if (systemFromURL) {
        console.log("URL Parameter detected. Auto-loading:", systemFromURL);
        if (systemInput) {
            systemInput.value = systemFromURL;
            loadSystemData(systemFromURL); 
        }
    } else if (systemInput && systemInput.value) {
        // Load default (Jita) if no URL param
        loadSystemData(systemInput.value);
    }

    // 3. Autocomplete Listener
    if (systemInput) {
        systemInput.addEventListener("input", (event) => {
            clearTimeout(systemInput.timer);
            systemInput.timer = setTimeout(() => {
                fetchAutocomplete(event.target.value);
            }, 300);
        });
    }

    const loadBtn = document.getElementById("load-system-btn");
    if (loadBtn && systemInput) {
        loadBtn.addEventListener("click", () => {
            const name = systemInput.value.trim();
            if (name) {
                // Set the global name before loading
                currentSystemName = name; 
                loadSystemData(name);
            }
        });
    }

    // Also allow pressing "Enter" in the input field to load
    systemInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            const name = systemInput.value.trim();
            if (name) {
                currentSystemName = name;
                loadSystemData(name);
                // Clear autocomplete results if they are open
                document.getElementById("autocomplete-results").innerHTML = "";
            }
        }
    });

    // 4. Share URL Button
    const shareBtn = document.getElementById('toggle-getURL');
    if (shareBtn) {
        shareBtn.addEventListener('click', function() {
            const baseUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
            if (!currentSystemName) {
                alert("Please load a system first!");
                return;
            }
            const shareUrl = `${baseUrl}?system=${encodeURIComponent(currentSystemName)}`;
            navigator.clipboard.writeText(shareUrl).then(() => {
                alert("Direct link copied to clipboard!\n" + shareUrl);
            });
        });
    }

    // 5. Map Zoom (Mouse Wheel)
    const mapContainer = document.getElementById("map-container");
    if (mapContainer) {
        mapContainer.addEventListener("wheel", (event) => {
            event.preventDefault();
            const factor = event.deltaY < 0 ? 0.9 : 1.1;
            zoomMap(factor);
        });
    }

    // 6. Map Panning (Mouse Drag)
    const svgMap = document.getElementById("system-map");
    if (svgMap) {
        svgMap.addEventListener("mousedown", (e) => {
            if (!isAwaitingScanOrigin) {
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                e.preventDefault();
                svgMap.style.cursor = "grabbing";
            }
        });

        window.addEventListener("mousemove", (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const scaleFactor = currentViewBox.w / 800;
            const newX = currentViewBox.x - (dx * scaleFactor);
            const newY = currentViewBox.y - (dy * scaleFactor);
            svgMap.setAttribute("viewBox", `${newX} ${newY} ${currentViewBox.w} ${currentViewBox.h}`);
        });

        window.addEventListener("mouseup", (e) => {
            if (isDragging) {
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                const scaleFactor = currentViewBox.w / 800;
                currentViewBox.x -= dx * scaleFactor;
                currentViewBox.y -= dy * scaleFactor;
                isDragging = false;
                svgMap.style.cursor = "grab";
            }
        });
    }

    // 7. Marker Logic
    let isAddingMarker = false;
    const prepareBtn = document.getElementById("prepareCustomMarkerButton");
    if (prepareBtn) {
        prepareBtn.addEventListener("click", () => {
            isAddingMarker = true;
            document.getElementById("customMarkerControls").style.display = "flex";
        });
    }

    if (svgMap) {
        svgMap.addEventListener("click", function (event) {
            if (!isAddingMarker) return;
            const coords = getSVGCoordinates(event);
            const shape = document.getElementById("markerShape").value;
            const color = document.getElementById("markerColor").value;
            const labelText = prompt("Enter a label for this marker:", "");

            if (labelText) {
                const markerData = {
                    systemID: currentSystemID,
                    type: shape,
                    label: labelText,
                    color: color,
                    x: coords.x,
                    y: coords.y,
                };

                fetch("api/save_marker.php", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(markerData),
                })
                .then(res => res.json())
                .then(result => {
                    if (result.status === "success") {
                        placeSymbolMarker(shape, coords.x, coords.y, color, labelText, result.markerID);
                    }
                });
            }
            isAddingMarker = false;
            document.getElementById("customMarkerControls").style.display = "none";
        });
    }

    // Initial setup
    setupMapInteractions();
    svgMap.style.cursor = "grab";
});
