document.addEventListener('DOMContentLoaded', function () {
    const getIntelButton = document.querySelector('.intel-button');
    const intelInput = document.querySelector('.intel-input');
    const copyUrlButton = document.getElementById('copy-url-button');

    // Check for URL parameters on page load
    //const urlParams = new URLSearchParams(window.location.search);
    //const entityNameFromUrl = urlParams.get('name');
    //if (entityNameFromUrl) {
    //    intelInput.value = entityNameFromUrl;
    //    getIntelButton.click();
    //}

    copyUrlButton.addEventListener('click', () => {
        const entityName = intelInput.value.trim();
        if (entityName) {
            const url = new URL(window.location.href);
            url.searchParams.set('name', entityName);
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(url.href).then(() => {
                    alert('URL copied to clipboard!');
                }, () => {
                    alert('Failed to copy URL.');
                });
            } else {
                window.prompt("Copy this URL:", url.href);
            }
        } else {
            alert('Please enter a name first.');
        }
    });

document.getElementById('clearBtn').addEventListener('click', () => {
    // This grabs the "base" URL (e.g., "http://mysite.com/app.html")
    // ignoring any query parameters or hashes
    const cleanURL = window.location.origin + window.location.pathname;
    
    // Forces the browser to navigate to this clean URL, effectively 
    // reloading the page from scratch.
    window.location.href = cleanURL;
});

    getIntelButton.addEventListener('click', async () => {
        const entityName = intelInput.value.trim();
        if (!entityName) {
            alert('Please enter a name.');
            return;
        }

        // Clear the associations chart before fetching new data
        const associationsCanvas = document.getElementById('associationsChartCanvas');
        if (window.associationsChartCanvas instanceof Chart) {
            window.associationsChartCanvas.destroy();
        }

        try {
            // Step 1: Fetch stats from the PHP backend
            const zkbResponse = await fetch(`config/get_zkb_stats.php?name=${encodeURIComponent(entityName)}`);
            const responseData = await zkbResponse.json();

            if (responseData.error) {
                alert(`Error: ${responseData.error}`);
                return;
            }

            const zkbStats = responseData.zkbStats;
            const latestKill = responseData.latestKill;
            const resolvedNames = responseData.resolvedNames;

            // The PHP script now resolves entityType and entityId
            const entityId = zkbStats.info.id;
            const entityType = zkbStats.info.type; // Assuming PHP returns 'character', 'corporation', or 'alliance'

            // Step 3: Populate the main info boxes immediately
            populateMainInfoBoxes(zkbStats, entityName, entityType, latestKill, resolvedNames);

            document.getElementById('last10KillsLossesHeader').textContent = `${entityName}: Last 10 Kills/Losses`;

        // Get references for Last 10 Kills/Losses section
        const last10KillsLossesBox = document.querySelector('.info-column:nth-child(2) .info-box:nth-child(2)');
        const associationsBox = document.querySelector('.info-column:nth-child(2) .info-box:nth-child(1)');
        const last10KillsLossesContent = document.getElementById('last10KillsLossesContent');
        const toggleButton = document.querySelector('.toggle-kills-losses');
        // associationsCanvas is already defined above

        // Always show Last 10 Kills/Losses box and Associations box
        last10KillsLossesBox.style.display = 'flex';
        associationsBox.style.display = 'flex';

        // Always load Last 10 Kills/Losses data
        loadLast10KillsLosses(entityId, resolvedNames, entityName, entityType, last10KillsLossesContent, toggleButton, associationsCanvas);
        loadTopStatsCharts(zkbStats, resolvedNames, entityType);

        } catch (error) {
            console.error('Error fetching intel:', error);
            alert('An error occurred while fetching intel.');
        }
    });

    // New function to populate main info boxes (character and combat activity)
    function populateMainInfoBoxes(data, name, type, latestKill, resolvedNames) {
        console.log('populateMainInfoBoxes - data.info:', data.info);
        console.log('populateMainInfoBoxes - resolvedNames:', resolvedNames);

        // Update headers
        const entityId = data.info.id;
        let zkillboardURL = 'https://zkillboard.com/';
        let evewhoURL = 'https://evewho.com/';
        
        let simpleType = '';
        if (type === "characterID") {
            simpleType = 'character';
        } else if (type === "corporationID") {
            simpleType = 'corporation';
        } else if (type === "allianceID") {
            simpleType = 'alliance';
        }

        if (simpleType) {
            zkillboardURL += `${simpleType}/${entityId}/`;
            evewhoURL += `${simpleType}/${entityId}`;
        }

        // Update headers
        const headerElement = document.querySelector('.info-column:nth-child(1) .info-box:nth-child(1) .info-box-header');
        headerElement.innerHTML = `
            <div class="header-text">${type.charAt(0).toUpperCase() + type.slice(1).replace('ID', '')}: ${name}</div>
            <div class="entity-links">
                <a href="${zkillboardURL}" target="_blank">(zKillboard)</a>
                <a href="${evewhoURL}" target="_blank">(EVE Who)</a>
            </div>
        `;
        document.querySelector('.info-column:nth-child(1) .info-box:nth-child(2) .info-box-header').textContent = `${name}: Combat (Last 10)`;
        document.querySelector('.info-column:nth-child(2) .info-box:nth-child(1) .info-box-header').textContent = `${name}: Associations`;
        document.getElementById('last10KillsLossesHeader').textContent = `${name}: Last 10 Kills/Losses`;

        // --- Populate Character Box ---
        const charBox = document.querySelector('.info-column:nth-child(1) .info-box:nth-child(1) .info-box-content');

        // Basic info, varies by type
        let charHtml = '';
console.log('type', type);

        if (type === 'characterID') {
            charHtml += `
                ${data.info.birthday ? `<p><span class="info-label">Birthday:</span> ${new Date(data.info.birthday).toLocaleDateString()}</p>` : ''}
                ${data.info.gender ? `<p><span class="info-label">Gender:</span> ${data.info.gender}</p>` : ''}
                ${data.info.race_id ? `<p><span class="info-label">Race:</span> ${resolvedNames[data.info.race_id] || data.info.race_id}</p>` : ''}
                ${data.info.corporation_id ? `<p><span class="info-label">Corporation:</span> ${resolvedNames[data.info.corporation_id] || data.info.corporation_id}</p>` : ''}
                ${data.info.alliance_id ? `<p><span class="info-label">Alliance:</span> ${resolvedNames[data.info.alliance_id] || 'None'}</p>` : ''}
                ${data.info.security_status !== undefined ? `<p><span class="info-label">Security Status:</span> ${data.info.security_status.toFixed(2)}</p>` : ''}
            `;
        } else if (type === 'corporationID') {
            charHtml += `
                ${data.info.ticker ? `<p><span class="info-label">Ticker:</span> ${data.info.ticker}</p>` : ''}
                ${data.info.member_count !== undefined ? `<p><span class="info-label">Member Count:</span> ${data.info.member_count}</p>` : ''}
                ${data.info.date_founded ? `<p><span class="info-label">Date Founded:</span> ${new Date(data.info.date_founded).toLocaleDateString()}</p>` : ''}
                ${data.info.alliance_id ? `<p><span class="info-label">Alliance:</span> ${resolvedNames[data.info.alliance_id] || 'None'}</p>` : ''}
            `;
        } else if (type === 'allianceID') {
            charHtml += `
                ${data.info.ticker ? `<p><span class="info-label">Ticker:</span> ${data.info.ticker}</p>` : ''}
                ${data.info.date_founded ? `<p><span class="info-label">Date Founded:</span> ${new Date(data.info.date_founded).toLocaleDateString()}</p>` : ''}
            `;
        }

        charHtml += `
            <hr>
            <p><span class="info-label">Total Kills:</span> ${data.allTimeSum ?? 0}</p>
            <p><span class="info-label">Total Losses:</span> ${data.shipsLost ?? 0}</p>
            <p><span class="info-label">ISK Destroyed:</span> ${(data.iskDestroyed ?? 0).toLocaleString()}</p>
            <p><span class="info-label">ISK Lost:</span> ${(data.iskLost ?? 0).toLocaleString()}</p>
            <p><span class="info-label">Solo Kills:</span> ${data.soloKills ?? 0}</p>
            <hr>
        `;

        // Danger Ratio Logic
        const dangerRatio = data.dangerRatio ?? 0;
        let dangerText = '';
        let dangerColorClass = '';
        if (dangerRatio < 50) {
            dangerText = 'Snuggly';
            dangerColorClass = 'text-green';
        } else if (dangerRatio >= 50 && dangerRatio < 75) {
            dangerText = 'Moderate';
            dangerColorClass = 'text-orange';
        } else {
            dangerText = 'Dangerous';
            dangerColorClass = 'text-red';
        }

        charHtml += `<p><span class="info-label">Danger Ratio:</span> <span class="${dangerColorClass}">${dangerRatio}% (${dangerText})</span></p>`

        // Logic for "Potential Seeder"
        const totalKills = data.allTimeSum ?? 0;
        const totalLosses = data.shipsLost ?? 0;
        let seederStatus = "";

        if (totalKills < 5 && totalLosses < 10) {
            seederStatus = " and is a potential seeder or very new character.";
        }

        const pilotName = name; // 'name' is already available in this scope
        //const message = `${name} appears to be quite ${dangerText}, and has ${totalKills} kills and ${totalLosses} losses.${seederStatus}`;
        //alert(message);

        charHtml += `
            <p><span class="info-label">Gang Ratio:</span> ${data.gangRatio ?? 0}%</p>
            <p><span class="info-label">Solo Ratio:</span> ${data.soloRatio ?? 0}%</p>
            <p><span class="info-label">Average Gang Size:</span> ${data.avgGangSize ?? 0}</p>
        `;

        // Construct and add the Last Kill HTML
        let lastKillTime = 'Unknown Date';
        let location = 'Unknown System';
        let description = '';
        let zkbLink = '';

        if (latestKill) {
            lastKillTime = latestKill.killmail_time ? new Date(latestKill.killmail_time).toLocaleString() : 'Unknown Date';
            location = (latestKill.solar_system_id && resolvedNames[latestKill.solar_system_id]) ? resolvedNames[latestKill.solar_system_id] : 'Unknown System';
            zkbLink = latestKill.killmail_id ? `<a href="https://zkillboard.com/kill/${latestKill.killmail_id}/" target="_blank">(ZKB)</a>` : '';

            // Determine the main entity's role in the killmail
            let mainEntityRole = '';
            if (latestKill.victim?.character_id == data.info.id || latestKill.victim?.corporation_id == data.info.id || latestKill.victim?.alliance_id == data.info.id) {
                mainEntityRole = 'victim';
            } else if (latestKill.attackers?.some(a => a.character_id == data.info.id || a.corporation_id == data.info.id || a.alliance_id == data.info.id)) {
                mainEntityRole = 'attacker';
            }

            const victimName = resolvedNames[latestKill.victim?.character_id] || resolvedNames[latestKill.victim?.corporation_id] || resolvedNames[latestKill.victim?.alliance_id] || 'Unknown Victim';
            const victimCorp = resolvedNames[latestKill.victim?.corporation_id] || 'Unknown Corp';
            const victimShip = resolvedNames[latestKill.victim?.ship_type_id] || 'Unknown Ship';

            console.log('PJM - populateMainInfoBoxes - mainEntityRole:', mainEntityRole);

            if (mainEntityRole === 'victim') {
                const finalBlowAttacker = latestKill.attackers?.find(a => a.final_blow) || latestKill.attackers?.[0];
                const finalBlowAttackerName = resolvedNames[finalBlowAttacker?.character_id] || resolvedNames[finalBlowAttacker?.corporation_id] || resolvedNames[finalBlowAttacker?.alliance_id] || 'Unknown Attacker';
                const finalBlowAttackerShip = resolvedNames[finalBlowAttacker?.ship_type_id] || 'Unknown Ship';
                const totalAttackers = latestKill.attackers?.length || 1;
                const otherPilotsText = totalAttackers > 1 ? ` with ${totalAttackers - 1} other pilot${totalAttackers - 1 > 1 ? 's' : ''}` : '';

                description = `${name} was killed in a ${victimShip} by ${finalBlowAttackerName} in a ${finalBlowAttackerShip}${otherPilotsText}.`;
            } else if (mainEntityRole === 'attacker') {
                const targetVictimName = resolvedNames[latestKill.victim?.character_id] || resolvedNames[latestKill.victim?.corporation_id] || resolvedNames[latestKill.victim?.alliance_id] || 'Unknown Victim';
                const targetVictimCorp = resolvedNames[latestKill.victim?.corporation_id] || 'Unknown Corp';
                const targetVictimShip = resolvedNames[latestKill.victim?.ship_type_id] || 'Unknown Ship';
                const totalAttackers = latestKill.attackers?.length || 1;
                const otherPilotsText = totalAttackers > 1 ? ` with ${totalAttackers - 1} other pilot${totalAttackers - 1 > 1 ? 's' : ''}` : '';

                description = `${name} killed ${targetVictimName} (${targetVictimCorp}) in a ${targetVictimShip}${otherPilotsText}.`;
            } else {
                // Fallback for cases where the entity is neither victim nor direct attacker (e.g., involved in a larger fleet kill)
                description = `${name} was involved in a killmail.`;
            }
        }

        charHtml += `
            <p>
                <span class="info-label">Last Kill:</span> 
                <span>(${lastKillTime} in ${location}) - ${description}</span>
                ${zkbLink}
            </p>
        `;

        charBox.innerHTML = charHtml;

        // --- Populate Associations Box (Empty) ---
        const assocBox = document.querySelector('.info-column:nth-child(2) .info-box:nth-child(1) .info-box-content');

        // --- Populate Combat Box (Chart) ---
        const combatBox = document.querySelector('.info-column:nth-child(1) .info-box:nth-child(2) .info-box-content');
        const recentMonths = data.months ? Object.values(data.months).slice(-10) : [];

        // Prepare data for Chart.js
        const labels = recentMonths.map(m => `${m.year}-${m.month}`);
        const shipsDestroyed = recentMonths.map(m => m.shipsDestroyed);
        const shipsLost = recentMonths.map(m => m.shipsLost);

        const ctx = document.getElementById('combatActivityChart').getContext('2d');
        if (window.combatActivityChart instanceof Chart) {
            window.combatActivityChart.destroy();
        }
        window.combatActivityChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Ships Destroyed',
                        data: shipsDestroyed,
                        backgroundColor: 'rgba(75, 192, 192, 0.6)',
                        borderColor: 'rgba(75, 192, 192, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Ships Lost',
                        data: shipsLost,
                        backgroundColor: 'rgba(255, 99, 132, 0.6)',
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                indexAxis: 'y', // Horizontal bar chart
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        beginAtZero: true
                    }
                }
            }
        });

        // The chart will now render in the canvas element
    }

    // New asynchronous function to load and populate Last 10 Kills/Losses
    async function loadLast10KillsLosses(entityId, resolvedNames, entityName, entityType, last10KillsLossesContent, toggleButton, associationsCanvas) {
        console.log('loadLast10KillsLosses - entityType:', entityType);
        console.log('loadLast10KillsLosses - entityId:', entityId);

        try {
            if (last10KillsLossesContent) {
    		// Reserve 500px of vertical space immediately so the layout doesn't jump later
    		last10KillsLossesContent.innerHTML = `
        		<div style="min-height: 500px; display: flex; flex-direction: column; justify-content: center; align-items: center; background: rgba(0,0,0,0.2); border-radius: 4px;">
            		<div style="font-size: 1.2rem; color: #aaa;">
                	<i class="fas fa-satellite-dish fa-spin"></i> Retrieving Combat Logs...
            		</div>
        		</div>
    		`;
	    }

            const last10Response = await fetch(`/config/get_last_10_kills_losses.php?entityId=${entityId}&entityType=${entityType}`);
            const last10Data = await last10Response.json();

            console.log('loadLast10KillsLosses - last10Data:', last10Data);

            if (last10Data.error) {
                console.error('Error fetching last 10 kills/losses:', last10Data.error);
                if (last10KillsLossesContent) {
                    last10KillsLossesContent.innerHTML = '<p>Error retrieving data.</p>';
                }
                return;
            }

            // Merge resolved names from last 10 kills/losses into main resolvedNames
            Object.assign(resolvedNames, last10Data.resolvedNames);

            let showingKills = true; // Initial state

            // If no kills but losses exist, show losses by default
            if (last10Data.kills.length === 0 && last10Data.losses.length > 0) {
                showingKills = false;
            }

            function renderList() {
                if (!last10KillsLossesContent) return; // Defensive check
                last10KillsLossesContent.innerHTML = ''; // Clear previous content
                const listToRender = showingKills ? last10Data.kills : last10Data.losses;
                const listTitle = showingKills ? 'Last 10 Kills' : 'Last 10 Losses';

                console.log('renderList - listToRender:', listToRender);
                console.log('renderList - listToRender.length:', listToRender.length);

                const last10KillsLossesHeader = document.getElementById('last10KillsLossesHeader');
                if (last10KillsLossesHeader) {
                    last10KillsLossesHeader.textContent = `${entityName}: ${listTitle}`;
                }

                if (listToRender.length === 0) {
                    last10KillsLossesContent.innerHTML = `<p>No ${listTitle.toLowerCase()} found.</p>`;
                    return;
                }

                listToRender.forEach(killmail => {
                    last10KillsLossesContent.innerHTML += renderKillmailDetails(killmail, resolvedNames, entityId, entityType, entityName);
                });
            }

            // Initial render
            renderList();

            // Toggle button event listener
            if (toggleButton) {
                toggleButton.onclick = () => {
                    showingKills = !showingKills;
                    renderList();
                };
            }

            // --- Populate Associations Box (Chart) ---
            const assocBox = document.querySelector('.info-column:nth-child(2) .info-box:nth-child(1) .info-box-content');
            console.log('loadLast10KillsLosses - associationsCanvas:', associationsCanvas);

            console.log('loadLast10KillsLosses - entityType:', entityType);

            if (entityType === 'characterID') {
                const associatedCharacters = {};

                // Aggregate characters from kills where the main character is an attacker
                last10Data.kills.forEach(killmail => {
                    const mainCharacterIsAttacker = (killmail.attackers || []).some(attacker => attacker.character_id == entityId);

                    if (mainCharacterIsAttacker) {
                        // Add victim of this kill
                        if (killmail.victim?.character_id && killmail.victim.character_id != entityId) {
                            associatedCharacters[killmail.victim.character_id] = (associatedCharacters[killmail.victim.character_id] || 0) + 1;
                        }
                        // Add all other attackers involved in this kill
                        (killmail.attackers || []).forEach(attacker => {
                            if (attacker.character_id && attacker.character_id != entityId) {
                                associatedCharacters[attacker.character_id] = (associatedCharacters[attacker.character_id] || 0) + 1;
                            }
                        });
                    }
                });

                console.log('Associated Characters (raw):', associatedCharacters);

                // Convert to array and sort by incidence
                const sortedAssociations = Object.entries(associatedCharacters)
                    .sort(([, countA], [, countB]) => countB - countA)
                    .slice(0, 20); // Get top 20

                console.log('Sorted Associations:', sortedAssociations);

                const assocLabels = sortedAssociations.map(([id,]) => resolvedNames[id] || id);
                const assocData = sortedAssociations.map(([, count]) => count);
                const assocIds = sortedAssociations.map(([id,]) => id);

                console.log('Associations Labels:', assocLabels);
                console.log('Associations Data:', assocData);
                console.log('Associations Ids:', assocIds);


                if (associationsCanvas) {
                    renderHorizontalBarChart(
                        associationsCanvas,
                        assocLabels,
                        assocData,
                        'Combat Incidence',
                        'rgba(255, 159, 64, 0.6)',
                        assocIds,
                        entityType // Pass entityType to renderHorizontalBarChart
                    );
                }
            } else if (associationsCanvas) {
                // Clear the canvas if it's not a character
                const ctx = associationsCanvas.getContext('2d');
                ctx.clearRect(0, 0, associationsCanvas.width, associationsCanvas.height);
                // Display a message
                if (assocBox) {
                    assocBox.innerHTML = '<p>Associations are only available for characters.</p>';
                }
            }

        } catch (error) {
            console.error('Error loading last 10 kills/losses:', error);
        }
    }
    function loadTopStatsCharts(data, resolvedNames, entityType) {
        // --- Populate Top Stats Box (Charts) ---
        const zkbBox = document.querySelector('.info-column:nth-child(3) .info-box .info-box-content');
        const topCorps = (data.topAllTime?.find(t => t.type === 'corporation')?.data || []).slice(0, 10);
        const topAlliances = (data.topAllTime?.find(t => t.type === 'alliance')?.data || []).slice(0, 10);
        const topShips = (data.topAllTime?.find(t => t.type === 'ship')?.data || []).slice(0, 10);
        const topSystems = (data.topAllTime?.find(t => t.type === 'system')?.data || []).slice(0, 10);

        // Get canvas elements
        const topCorpsCanvas = document.getElementById('topCorpsChart');
        const topAlliancesCanvas = document.getElementById('topAlliancesChart');
        const topShipsCanvas = document.getElementById('topShipsChart');
        const topSystemsCanvas = document.getElementById('topSystemsChart');

        // Get parent info-box elements to control visibility
        const topCorpsBox = topCorpsCanvas ? topCorpsCanvas.closest('.info-box-content').previousElementSibling : null;
        const topAlliancesBox = topAlliancesCanvas ? topAlliancesCanvas.closest('.info-box-content').previousElementSibling : null;

        // Hide/show charts based on entityType
        if (entityType === 'corporationID') {
            if (topCorpsBox) topCorpsBox.style.display = 'none';
            if (topCorpsCanvas) topCorpsCanvas.style.display = 'none';
        } else {
            if (topCorpsBox) topCorpsBox.style.display = 'block';
            if (topCorpsCanvas) topCorpsCanvas.style.display = 'block';
        }

        if (entityType === 'allianceID') {
            if (topCorpsBox) topCorpsBox.style.display = 'none';
            if (topCorpsCanvas) topCorpsCanvas.style.display = 'none';
            if (topAlliancesBox) topAlliancesBox.style.display = 'none';
            if (topAlliancesCanvas) topAlliancesCanvas.style.display = 'none';
        } else {
            if (topAlliancesBox) topAlliancesBox.style.display = 'block';
            if (topAlliancesCanvas) topAlliancesCanvas.style.display = 'block';
        }

        // Render Top Corporations Chart
        if (topCorpsCanvas && entityType !== 'corporationID' && entityType !== 'allianceID') {
            renderHorizontalBarChart(
                topCorpsCanvas,
                topCorps.map(c => resolvedNames[c.corporationID] || c.corporationID),
                topCorps.map(c => c.kills),
                'Kills',
                'rgba(54, 162, 235, 0.6)'
            );
        }

        // Render Top Alliances Chart
        if (topAlliancesCanvas && entityType !== 'allianceID') {
            renderHorizontalBarChart(
                topAlliancesCanvas,
                topAlliances.map(a => resolvedNames[a.allianceID] || a.allianceID),
                topAlliances.map(a => a.kills),
                'Kills',
                'rgba(153, 102, 255, 0.6)'
            );
        }

        // Render Top Ships Chart
        if (topShipsCanvas) {
            renderHorizontalBarChart(
                topShipsCanvas,
                topShips.map(s => resolvedNames[s.shipTypeID] || s.shipTypeID),
                topShips.map(s => s.kills),
                'Kills',
                'rgba(255, 206, 86, 0.6)'
            );
        }

        // Render Top Systems Chart
        if (topSystemsCanvas) {
            renderHorizontalBarChart(
                topSystemsCanvas,
                topSystems.map(s => resolvedNames[s.solarSystemID] || s.solarSystemID),
                topSystems.map(s => s.kills),
                'Kills',
                'rgba(75, 192, 192, 0.6)'
            );
        }
    }

    // Helper function to render a single killmail's details
    function renderKillmailDetails(killmail, resolvedNames, mainEntityId, mainEntityType, mainEntityName) {
        console.log('renderKillmailDetails - killmail:', killmail);
        console.log('renderKillmailDetails - mainEntityType:', mainEntityType);
        console.log('renderKillmailDetails - mainEntityId:', mainEntityId);
        console.log('renderKillmailDetails - mainEntityName:', mainEntityName);

        if (!killmail) return '';

        const killmailTime = killmail.killmail_time ? new Date(killmail.killmail_time).toLocaleString() : 'Unknown Date';
        const location = (killmail.solar_system_id && resolvedNames[killmail.solar_system_id]) ? resolvedNames[killmail.solar_system_id] : 'Unknown System';
        const zkbLink = killmail.killmail_id ? `<a href="https://zkillboard.com/kill/${killmail.killmail_id}/" target="_blank" class="zkb-link">(ZKB)</a>` : '';

        let description = '';

        // Determine if the main entity is the victim
        let isVictim = false;
        if (mainEntityType === 'characterID' && killmail.victim?.character_id == mainEntityId) {
            isVictim = true;
        } else if (mainEntityType === 'corporationID' && killmail.victim?.corporation_id == mainEntityId) {
            isVictim = true;
        } else if (mainEntityType === 'allianceID' && killmail.victim?.alliance_id == mainEntityId) {
            isVictim = true;
        }

        // Determine if the main entity is an attacker
        let isAttacker = false;
        if (killmail.attackers) {
            isAttacker = killmail.attackers.some(attacker => {
                if (mainEntityType === 'characterID' && attacker.character_id == mainEntityId) return true;
                if (mainEntityType === 'corporationID' && attacker.corporation_id == mainEntityId) return true;
                if (mainEntityType === 'allianceID' && attacker.alliance_id == mainEntityId) return true;
                return false;
            });
        }

        const victimName = resolvedNames[killmail.victim?.character_id] || resolvedNames[killmail.victim?.corporation_id] || resolvedNames[killmail.victim?.alliance_id] || 'Unknown Victim';
        const victimCorp = resolvedNames[killmail.victim?.corporation_id] || 'Unknown Corp';
        const victimShip = resolvedNames[killmail.victim?.ship_type_id] || 'Unknown Ship';

        console.log('renderKillmailDetails - isVictim:', isVictim);
        console.log('renderKillmailDetails - isAttacker:', isAttacker);

        if (isVictim) {
            // This is a loss
            const finalBlowAttacker = killmail.attackers?.find(a => a.final_blow) || killmail.attackers?.[0];
            const finalBlowAttackerName = resolvedNames[finalBlowAttacker?.character_id] || resolvedNames[finalBlowAttacker?.corporation_id] || resolvedNames[finalBlowAttacker?.alliance_id] || 'Unknown Attacker';
            const finalBlowAttackerShip = resolvedNames[finalBlowAttacker?.ship_type_id] || 'Unknown Ship';
            const totalAttackers = killmail.attackers?.length || 1;
            const otherPilotsText = totalAttackers > 1 ? ` with ${totalAttackers - 1} other pilot${totalAttackers - 1 > 1 ? 's' : ''}` : '';

            description = `${mainEntityName} was killed in a ${victimShip} by ${finalBlowAttackerName} in a ${finalBlowAttackerShip}${otherPilotsText}.`;
        } else if (isAttacker) {
            // This is a kill
            const targetVictimName = resolvedNames[killmail.victim?.character_id] || resolvedNames[killmail.victim?.corporation_id] || resolvedNames[killmail.victim?.alliance_id] || 'Unknown Victim';
            const targetVictimCorp = resolvedNames[killmail.victim?.corporation_id] || 'Unknown Corp';
            const targetVictimShip = resolvedNames[killmail.victim?.ship_type_id] || 'Unknown Ship';
            const totalAttackers = killmail.attackers?.length || 1;
            const otherPilotsText = totalAttackers > 1 ? ` with ${totalAttackers - 1} other pilot${totalAttackers - 1 > 1 ? 's' : ''}` : '';

            description = `${mainEntityName} killed ${targetVictimName} (${targetVictimCorp}) in a ${targetVictimShip}${otherPilotsText}.`;
        } else {
            // Fallback for cases where the entity is neither victim nor direct attacker (e.g., involved in a larger fleet kill)
            description = `${mainEntityName} was involved in a killmail.`;
        }
        console.log('renderKillmailDetails - description:', description);

        return `
            <p>
                <span class="info-label">(${new Date(killmail.killmail_time).toLocaleString()} in ${location}) - ${description}</span>
                ${zkbLink}
            </p>
        `;
    }

    // Helper function to render a horizontal bar chart
    function renderHorizontalBarChart(canvasElement, labels, data, labelText, backgroundColor, ids = null, mainEntityType = 'character') {
        if (!canvasElement) return; // Defensive check
        const ctx = canvasElement.getContext('2d');
        if (window[canvasElement.id] instanceof Chart) {
            window[canvasElement.id].destroy();
        }
        window[canvasElement.id] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: labelText,
                    data: data,
                    backgroundColor: backgroundColor,
                    borderColor: backgroundColor.replace('0.6', '1'),
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        beginAtZero: true
                    },
                    y: {
                        ticks: {
                            autoSkip: false
                        }
                    }
                },
                onClick: (e) => {
                    const canvasPosition = Chart.helpers.getRelativePosition(e, window[canvasElement.id]);

                    // Substitute the appropriate scale IDs
                    const dataX = window[canvasElement.id].scales.y.getValueForPixel(canvasPosition.y);
                    const dataY = window[canvasElement.id].scales.x.getValueForPixel(canvasPosition.x);

                    const id = ids[dataX];
                    // Determine the correct zKillboard URL based on entityType
                    let zkbUrl = `https://zkillboard.com/`;
                    if (mainEntityType === 'characterID') {
                        zkbUrl += `character/${id}/`;
                    } else if (mainEntityType === 'corporationID') {
                        zkbUrl += `corporation/${id}/`;
                    } else if (mainEntityType === 'allianceID') {
                        zkbUrl += `alliance/${id}/`;
                    }
                    window.open(zkbUrl, '_blank');
                },
                plugins: {
                    legend: {
                        display: false
                    }
                },
                barPercentage: 0.5,
                categoryPercentage: 0.5
            }
        });
    }

    // Dropdown menu logic
    const menuItems = document.querySelectorAll('.top-nav .menu-item');
    menuItems.forEach(item => {
        item.addEventListener('mouseenter', () => {
            const dropdown = item.querySelector('.dropdown');
            if (dropdown) dropdown.style.display = 'block';
        });
        item.addEventListener('mouseleave', () => {
            const dropdown = item.querySelector('.dropdown');
            if (dropdown) dropdown.style.display = 'none';
        });
    });
    // 4. TRIGGER THE CLICK (Now that the brain is ready!)
    // Move this block to the very bottom, right before the closing "});"
    const urlParams = new URLSearchParams(window.location.search);
    const entityNameFromUrl = urlParams.get('name');
    
    if (entityNameFromUrl) {
        // Decode the URI component to handle spaces (Tyrom+hir -> Tyrom hir)
        intelInput.value = decodeURIComponent(entityNameFromUrl);
        
        // Now when we click, the listener above exists to catch it!
        getIntelButton.click();
    }
});
