// =========================================================
// 1. TAB SWITCHING LOGIC (New)
// =========================================================
function switchTab(mode) {
  // 1. Remove 'active' class from all buttons
  document
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.remove("active"));

  // 2. Hide all sections
  document
    .querySelectorAll(".mode-section")
    .forEach((s) => (s.style.display = "none"));

  // 3. Activate clicked button and show relevant section
  // (event.currentTarget ensures we grab the button even if user clicks the icon inside)
  if (event && event.currentTarget) {
    event.currentTarget.classList.add("active");
  }

  const targetSection = document.getElementById(`mode-${mode}`);
  if (targetSection) targetSection.style.display = "block";
}
// =========================================================
// TAG HUNTER (New)
// =========================================================
async function searchTags() {
    const query = document.getElementById('tagSearchInput').value.trim();
    const resultsDiv = document.getElementById('tag-results');
    
    if (query.length < 2) {
        resultsDiv.innerHTML = '<span style="color:orange">Enter at least 2 characters.</span>';
        return;
    }

    resultsDiv.innerHTML = 'Searching database...';

    try {
        const response = await fetch('api/get_pilot_intel.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ search_tag: query })
        });

        const result = await response.json();

        if (result.status === 'success' && result.data.length > 0) {
            // Build list with Context
            const html = result.data.map(item => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid #444;">
                    
                    <div style="display:flex; flex-direction:column;">
                        <span style="color:var(--highlight-cyan); font-family:monospace; font-size:0.9rem;">
                            ${item.tag}
                        </span>
                        <span style="color:#aaa; font-size:0.75rem;">
                            <i class="fas fa-history"></i> ${item.last_seen}
                        </span>
                    </div>

                    <div style="text-align:right;">
                        <span style="color:#555; font-size:0.75rem; display:block;">MATCH</span>
                        <span style="color:#fff; font-weight:bold;">${item.score}</span>
                    </div>

                </div>
            `).join('');
            resultsDiv.innerHTML = html;
        } else {
            resultsDiv.innerHTML = '<span style="color:#777">No matching tags found.</span>';
        }
    } catch (e) {
        resultsDiv.innerHTML = '<span style="color:red">Search failed.</span>';
    }
}



// =========================================================
// 2. INGEST PARSER (New - Builds the 5-Column Table)
// =========================================================
// =========================================================
// 2. INGEST PARSER (Updated to pass Ship Type)
// =========================================================
function parseDscanInput() {
    const raw = document.getElementById('rawDscan').value;
    const lines = raw.split('\n');
    const container = document.getElementById('staging-rows');
    container.innerHTML = ''; 

    let count = 0;

    lines.forEach((line) => {
        const parts = line.split('\t');
        
        // Needs at least: [0]ID(optional) [1]Name(Tag) [2]Type(Ship)
        if (parts.length >= 3) {
            count++;
            
            // Adjust indices based on typical D-Scan format: Icon | Name | Type | Dist
            const tag = parts[1] || "???"; 
            const ship = parts[2] || "Unknown";

            const row = document.createElement('div');
            row.className = 'staging-row';
            row.id = `row-${count}`;
            
            // ESCAPE QUOTES for both Tag and Ship to prevent JS errors
            const safeTag = tag.replace(/'/g, "\\'");
            const safeShip = ship.replace(/'/g, "\\'");

            row.innerHTML = `
                <div class="col-id">${count}</div>
                <div class="col-tag">${tag}</div>
                <div class="col-ship" title="${ship}">${ship}</div>
                <div class="col-pilot">
                    <input type="text" class="table-input" id="input-${count}" placeholder="Paste Pilot Name...">
                </div>
                <div class="col-action">
                    <button class="btn-link" onclick="linkTarget(${count}, '${safeTag}', '${safeShip}')">LINK</button>
                </div>
            `;
            container.appendChild(row);
        }
    });

    if (count > 0) {
        document.getElementById('ingest-staging').style.display = 'block';
    } else {
        alert("No valid scan lines found. Ensure you copy the full D-Scan row.");
    }
}
// =========================================================
// 3. LINKER FUNCTION (New - Sends 1 Row to DB)
// =========================================================
async function linkTarget(rowId, tag, shipType) { // <--- Added shipType here
    const input = document.getElementById(`input-${rowId}`);
    const name = input.value.trim();
    
    // Get System Name
    const sysInput = document.getElementById('solarSystemInput');
    const systemName = sysInput ? sysInput.value.trim() : '';
    
    if (!name) {
        alert("Please enter a pilot name first.");
        input.focus();
        return;
    }

    const btn = input.parentElement.nextElementSibling.querySelector('button');
    const originalText = btn.innerText;
    btn.innerText = "...";
    btn.disabled = true;

    try {
        // Construct the 3-column string: IconID (0) + TAB + Tag + TAB + ShipType
        // The PHP script will split this by "\t" and read parts[2] as the Ship Type.
        const dscanString = `0\t${tag}\t${shipType}`;

        const payload = { 
            character_name: name,
            dscan_data: dscanString 
        };
        
        if(systemName) {
            payload.solar_system = systemName;
        }

        const response = await fetch('api/get_pilot_intel.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();

        if (result.status === 'success') {
            const row = document.getElementById(`row-${rowId}`);
            row.style.opacity = '0';
            setTimeout(() => {
                row.remove();
                if(document.getElementById('staging-rows').children.length === 0) {
                    document.getElementById('ingest-staging').style.display = 'none';
                }
            }, 300);
        } else {
            alert("Error: " + result.message);
            btn.innerText = originalText;
            btn.disabled = false;
        }
    } catch (e) {
        console.error(e);
        alert("Connection failed.");
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

// =========================================================
// 4. MAIN SEARCH LOGIC (Existing functionality)
// =========================================================
document.addEventListener("DOMContentLoaded", () => {
  const intelForm = document.getElementById("intelForm");
  if (!intelForm) return; // Exit if page structure is wrong

  intelForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    const charName = document.getElementById("charName").value;
    const statusDisplay = document.getElementById("status-display");
    const submitBtn = document.querySelector(".btn-submit");

    // UI Reset
    statusDisplay.style.display = "none";
    statusDisplay.className = "";
    submitBtn.innerHTML = "SCANNING...";
    submitBtn.disabled = true;

    try {
      const response = await fetch("api/get_pilot_intel.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character_name: charName }),
      });

      const result = await response.json();

      // Re-enable button
      submitBtn.innerHTML = "INITIATE SCAN";
      submitBtn.disabled = false;

      if (result.status === "success") {
        statusDisplay.style.display = "block";
        statusDisplay.classList.add("status-success");
        statusDisplay.innerHTML = `<strong>> INTEL ACQUIRED</strong><br>Dossier loaded.`;

        // --- SWITCH LAYOUT ---
        const placeholder = document.getElementById("right-panel-placeholder");
        if (placeholder) placeholder.style.display = "none";

        document.getElementById("left-panel-content").style.display = "block";
        document.getElementById("right-panel-content").style.display = "block";

        // --- POPULATE DATA ---
        const data = result.data;
        const bio = data.bio || {};
        const threat = data.threat || {};

        // Safe Helper
        const setText = (id, txt) => {
          const el = document.getElementById(id);
          if (el) el.innerText = txt;
        };

        // 1. Identity
        setText("disp-name", data.character);
        setText("disp-age", bio.age || "Unknown");
        setText("disp-corp", bio.corp || "Unknown");
        setText("disp-ally", bio.alliance || "");

        const allyRow = document.getElementById("row-alliance");
        if (allyRow) allyRow.style.display = bio.alliance ? "block" : "none";

        const portrait = document.getElementById("pilot-portrait");
        if (portrait)
          portrait.src = `https://images.evetech.net/characters/${data.id}/portrait?size=128`;

        setText("threat-val", (threat.dangerRatio || 0) + "%");

        // 2. Stats
        const kills = threat.shipsDestroyed || 0;
        const losses = threat.shipsLost || 0;
        setText("disp-kills", kills.toLocaleString());
        setText("disp-losses", losses.toLocaleString());
        setText("disp-kd", losses > 0 ? (kills / losses).toFixed(2) : kills);

        let isk = threat.iskDestroyed || 0;
        setText("disp-isk", (isk / 1000000000).toFixed(2) + "b");
        setText("disp-sec", bio.sec_status);

        // 3. Render Tags (if any)
        const tagContainer = document.getElementById("disp-tags");
        if (tagContainer) {
          // You need to ensure your PHP returns 'tags' in the JSON for this to work
          // If not, it just stays empty, which is fine.
          if (data.tags && data.tags.length > 0) {
            tagContainer.innerHTML = data.tags
              .map((t) => `<span class="tag-badge">${t}</span>`)
              .join(" ");
          } else {
            tagContainer.innerHTML = "";
          }
        }

        // 4. Populate Lists (Ships / Systems)
        const populateList = (listId, items, isShip) => {
          const list = document.getElementById(listId);
          if (!list) return;
          list.innerHTML = "";
          if (items && items.length > 0) {
            items.forEach((item) => {
              const iconHtml = isShip
                ? `<img src="https://images.evetech.net/types/${item.id}/icon?size=64" class="eve-icon">`
                : `<div class="eve-icon sys-icon"><i class="fas fa-map-marker-alt"></i></div>`;

              list.innerHTML += `
                                <li>
                                    ${iconHtml}
                                    <div class="list-info">
                                        <span class="name">${item.name}</span>
                                        <span class="count">${item.count} kills</span>
                                    </div>
                                </li>`;
            });
          } else {
            list.innerHTML =
              '<li style="color:#666; font-style:italic; padding:5px;">No data available</li>';
          }
        };

        populateList("list-top-ships", threat.top_ships, true);
        populateList("list-top-systems", threat.top_systems, false);

        // 5. Populate Alts List
        const altsList = document.getElementById("list-alts");
        if (altsList) {
          altsList.innerHTML = "";
          if (data.alts && data.alts.length > 0) {
            data.alts.forEach((alt) => {
              altsList.innerHTML += `
                                <div class="list-item">
                                    <span>${alt.name}</span>
                                    <span class="prob-${
                                      alt.probability >= 90 ? "high" : "med"
                                    }">
                                        ${alt.probability}% [${alt.matched_tag}]
                                    </span>
                                </div>`;
            });
          } else {
            altsList.innerHTML =
              '<div class="list-empty">No shared tags detected.</div>';
          }
        }

        // 6. Populate Associates Grid
        const assocGrid = document.getElementById("grid-associates");
        if (assocGrid) {
          assocGrid.innerHTML = "";
          if (data.associates && data.associates.length > 0) {
            data.associates.forEach((assoc) => {
              let shipsHtml = "";
              if (assoc.top_ships) {
                assoc.top_ships.forEach((ship) => {
                  shipsHtml += `
                                        <div class="assoc-stat-line">
                                            <img src="https://images.evetech.net/types/${ship.id}/icon?size=32" class="ship-icon-mini">
                                            <span>${ship.name}</span>
                                            <span class="count-badge">x${ship.count}</span>
                                        </div>`;
                });
              }
              assocGrid.innerHTML += `
                                <div class="assoc-card">
                                    <img src="https://images.evetech.net/characters/${assoc.id}/portrait?size=128" class="assoc-portrait">
                                    <div class="assoc-details">
                                        <a href="https://zkillboard.com/character/${assoc.id}/" target="_blank" class="assoc-name">${assoc.name}</a>
                                        <div style="font-size:0.75rem; color:#aaa; margin-bottom:8px;">
                                            Fleets: <span style="color:#fff">${assoc.count}</span>
                                        </div>
                                        ${shipsHtml}
                                    </div>
                                </div>`;
            });
          } else {
            assocGrid.innerHTML =
              '<div class="list-empty">No recent fleet activity.</div>';
          }
        }

        // 7. Render Graph (Delayed for Layout Reflow)
        setTimeout(() => {
          renderAltGraph(data);
          const chartDom = document.getElementById("intel-graph");
          const myChart = echarts.getInstanceByDom(chartDom);
          if (myChart) myChart.resize();
        }, 300);
      } else {
        throw new Error(result.message || "Unknown server error");
      }
    } catch (error) {
      statusDisplay.style.display = "block";
      statusDisplay.classList.add("status-error");
      statusDisplay.innerHTML = `<strong>> ERROR</strong><br>${error.message}`;
      submitBtn.innerHTML = "INITIATE SCAN";
      submitBtn.disabled = false;
    }
  });
});

// =========================================================
// 5. GRAPH RENDERER: TACTICAL RADAR
// =========================================================
function renderAltGraph(data) {
    const chartDom = document.getElementById("intel-graph");
    if (!chartDom) return;

    echarts.dispose(chartDom);
    const myChart = echarts.init(chartDom, "dark");

    const threat = data.threat || {};
    const nodes = [];
    const links = [];

    // --- 1. CENTER NODE (THE PILOT) ---
    nodes.push({
        id: 'main',
        name: data.character,
        symbolSize: 60,
        itemStyle: { 
            color: '#00f0ff', 
            borderColor: '#fff', 
            borderWidth: 2,
            shadowBlur: 10,
            shadowColor: '#00f0ff'
        },
        label: { show: true, position: "inside", color: "#000", fontWeight: "bold" },
        category: 0
    });

    // --- 2. ALTS (RED NODES) ---
    // These are the most critical, so they get high visibility
    if (data.alts) {
        data.alts.forEach((alt, idx) => {
            const nodeId = `alt_${idx}`;
            nodes.push({
                id: nodeId,
                name: alt.name,
                symbolSize: 45,
                itemStyle: { color: '#ff2a2a' }, // Threat Red
                label: { show: true, position: 'bottom', color: '#ff2a2a' },
                // Custom tooltip data
                extra: `<span style="color:#ff2a2a">SUSPECTED ALT</span><br>Shared Tag: ${alt.matched_tag}`
            });

            links.push({
                source: 'main',
                target: nodeId,
                lineStyle: { color: '#ff2a2a', type: 'dashed', width: 3 }
            });
        });
    }

    // --- 3. TOP SHIPS (CYAN NODES) ---
    // Shows the "Doctrine"
    if (threat.top_ships) {
        threat.top_ships.slice(0, 5).forEach((ship, idx) => {
            const nodeId = `ship_${idx}`;
            // Scale size based on relative kill count (min 20, max 50)
            const size = Math.max(20, Math.min(50, ship.count * 1.5));
            
            nodes.push({
                id: nodeId,
                name: ship.name,
                symbolSize: size,
                itemStyle: { color: 'rgba(0, 240, 255, 0.6)', borderColor: '#00f0ff' },
                label: { show: true, position: 'top', fontSize: 10, color: '#ccc' },
                extra: `Top Ship: ${ship.count} Kills`
            });

            links.push({
                source: 'main',
                target: nodeId,
                lineStyle: { color: 'rgba(0, 240, 255, 0.3)', width: 1 }
            });
        });
    }

    // --- 4. TOP SYSTEMS (GREEN NODES) ---
    // Shows the "Hunting Ground"
    if (threat.top_systems) {
        threat.top_systems.slice(0, 5).forEach((sys, idx) => {
            const nodeId = `sys_${idx}`;
            
            nodes.push({
                id: nodeId,
                name: sys.name,
                symbolSize: 25,
                itemStyle: { color: 'rgba(46, 204, 113, 0.6)', borderColor: '#2ecc71' }, // Emerald Green
                label: { show: true, position: 'bottom', fontSize: 10, color: '#ccc' },
                extra: `Active System: ${sys.count} Kills`
            });

            links.push({
                source: 'main',
                target: nodeId,
                lineStyle: { color: 'rgba(46, 204, 113, 0.3)', width: 1 }
            });
        });
    }

    // --- CHART CONFIGURATION ---
    const option = {
        backgroundColor: "transparent",
        tooltip: {
            backgroundColor: 'rgba(20, 20, 20, 0.9)',
            borderColor: '#333',
            textStyle: { color: '#eee' },
            formatter: function (params) {
                if (params.dataType === "node") {
                    const extraInfo = params.data.extra ? `<br/>${params.data.extra}` : '';
                    return `<b>${params.name}</b>${extraInfo}`;
                }
                return null;
            },
        },
        series: [{
            type: "graph",
            layout: "force",
            data: nodes,
            links: links,
            roam: true, // Allow zooming/panning
            label: { show: true },
            force: {
                repulsion: 400,
                edgeLength: [80, 150], // Range of distances
                gravity: 0.05
            },
            lineStyle: { curveness: 0.1 }
        }]
    };

    myChart.setOption(option);
    window.addEventListener("resize", () => myChart.resize());
}
