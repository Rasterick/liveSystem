document.getElementById('analyzeBtn').addEventListener('click', async () => {
    const inputArea = document.getElementById('pasteArea');
    const inputNames = inputArea.value;
    const grid = document.getElementById('cardGrid');
    
    // 1. Validation
    if(!inputNames.trim()) { alert("Please paste some names first."); return; }

    // 2. Warning for >100 pilots
    const nameCount = inputNames.split('\n').filter(n => n.trim() !== '').length;
    if (nameCount > 100) {
        const proceed = confirm(`Warning: You have entered ${nameCount} names.\n\nProcessing more than 100 pilots may result in timeouts or API limits.\n\nDo you want to continue anyway?`);
        if (!proceed) return;
    }

    // 3. Show Loading State
    grid.innerHTML = '<div class="loader"><h3>Scanning Intelligence Channels...</h3><p>Consulting zKillboard & EVE Database...</p></div>';
    document.getElementById('summaryBar').style.display = 'none'; // Hide summary during load

    try {
        // 4. Fetch Data
        const response = await fetch('api/process_pilots.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ names: inputNames })
        });

        const pilots = await response.json(); // <--- THIS is the variable that was missing/misplaced
        
        // 5. Handle Response
        if (pilots.error) {
            grid.innerHTML = `<div style="color:red; text-align:center;">${pilots.error}</div>`;
        } else {
            updateSummary(pilots); // Update the top bar
            renderCards(pilots);   // Render the cards
        }

    } catch (error) {
        console.error('Error:', error);
        grid.innerHTML = '<div style="color:red; text-align:center;">Connection Failed. Check console.</div>';
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

// --- HELPER FUNCTIONS ---

function calculateAge(birthdayString) {
    if (!birthdayString) return 'Unknown';
    const birthDate = new Date(birthdayString);
    const now = new Date();
    
    let years = now.getFullYear() - birthDate.getFullYear();
    let days = 0;
    
    const monthDiff = now.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
        years--;
    }

    const lastBirthday = new Date(now.getFullYear(), birthDate.getMonth(), birthDate.getDate());
    if (now < lastBirthday) {
        lastBirthday.setFullYear(now.getFullYear() - 1);
    }
    const diffTime = Math.abs(now - lastBirthday);
    days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

    return `${years}y ${days}d`;
}

function formatISK(amount) {
    if (amount >= 1000000000) return (amount / 1000000000).toFixed(2) + 'b';
    if (amount >= 1000000) return (amount / 1000000).toFixed(2) + 'm';
    if (amount >= 1000) return (amount / 1000).toFixed(1) + 'k';
    return amount.toLocaleString();
}

function updateSummary(pilots) {
    const bar = document.getElementById('summaryBar');
    if (pilots.length > 0) bar.style.display = 'flex';

    let high = 0, med = 0, low = 0;

    pilots.forEach(p => {
        if (p.dangerRatio >= 80) high++;
        else if (p.dangerRatio >= 50) med++;
        else low++;
    });

    document.getElementById('sumTotal').innerText = pilots.length;
    document.getElementById('sumHigh').innerText = high;
    document.getElementById('sumMed').innerText = med;
    document.getElementById('sumLow').innerText = low;
}

function renderCards(pilots) {
    const grid = document.getElementById('cardGrid');
    
    // Build one giant HTML string (Performance Optimized)
    const cardsHTML = pilots.map(p => {
        let threatClass = 'low';
        if (p.dangerRatio >= 80) threatClass = 'high';
        else if (p.dangerRatio >= 50) threatClass = 'medium';

        const age = calculateAge(p.birthday);
        const secClass = p.secStatus < 0 ? 'stat-red' : 'stat-green';
        const iskRatioClass = parseFloat(p.iskRatio) >= 1 ? 'stat-green' : 'stat-red';
        const kdClass = p.kd >= 1 ? 'stat-green' : 'stat-red';

        const zkill = `https://zkillboard.com/character/${p.id}/`;
        const evewho = `https://evewho.com/character/${p.id}`;
        const grimIntel = `https://intel.grim-horizon.org/combatintel.html?name=${encodeURIComponent(p.name)}`;

        const shipList = p.topShips.map(s => `<li>${s.name} <span class="count">${s.count}</span></li>`).join('');
        const sysList = p.topSystems.map(s => `<li>${s.name} <span class="count">${s.count}</span></li>`).join('');
        
        const corpImg = p.corpId ? `https://images.evetech.net/corporations/${p.corpId}/logo?size=32` : '';
        const alliImg = p.allianceId ? `https://images.evetech.net/alliances/${p.allianceId}/logo?size=32` : '';

        const corpHtml = p.corpName && p.corpName !== 'Unknown' ? `
            <div class="org-row">
                <img src="${corpImg}" class="org-icon"> 
                <span class="org-name" title="${p.corpName}">${p.corpName}</span>
                ${p.corpTicker ? `<span class="ticker">[${p.corpTicker}]</span>` : ''}
            </div>` : '';

        let alliHtml = '';
        if (p.allianceName === '-') {
             alliHtml = `<div class="org-row" style="padding-left:24px; color:#555;">-</div>`;
        } else if (p.allianceName) {
             alliHtml = `
            <div class="org-row">
                <img src="${alliImg}" class="org-icon"> 
                <span class="org-name" title="${p.allianceName}">${p.allianceName}</span>
                ${p.allianceTicker ? `<span class="ticker">[${p.allianceTicker}]</span>` : ''}
            </div>`;
        }

        return `
            <div class="pilot-card threat-${threatClass}">
                <div class="card-header">
                    <img src="${p.portrait}" class="portrait">
                    <div class="header-info">
                        <div class="name-age-row">
                            <h3>${p.name}</h3>
                            <span class="pilot-age">${age}</span>
                        </div>
                        <div class="org-container">
                            ${corpHtml}
                            ${alliHtml}
                        </div>
                    </div>
                    <div class="danger-score ${threatClass}-text">
                        <span class="danger-val">${p.dangerRatio}</span><span class="danger-unit">%</span>
                        <div class="danger-label">DANGER</div>
                    </div>
                </div>
                
                <div class="stats-grid-container">
                    <div class="stat-row">
                        <span class="label">KILLS:</span> <span class="value">${p.kills}</span>
                        <span class="label">ISK DEST:</span> <span class="value">${formatISK(p.iskDestroyed)}</span>
                    </div>
                    <div class="stat-row">
                        <span class="label">LOSSES:</span> <span class="value">${p.losses}</span>
                        <span class="label">ISK LOST:</span> <span class="value">${formatISK(p.iskLost)}</span>
                    </div>
                    <div class="stat-row">
                        <span class="label">K/D:</span> <span class="value ${kdClass}">${p.kd}</span>
                        <span class="label">ISK RATIO:</span> <span class="value ${iskRatioClass}">${p.iskRatio}</span>
                    </div>
                    <div class="stat-row">
                        <span class="label">SOLO:</span> <span class="value">${p.soloKills}</span>
                        <span class="label">SOLO:</span> <span class="value">${p.soloRatio}%</span>
                    </div>
                    <div class="stat-row">
                        <span class="label">SEC:</span> <span class="value ${secClass}">${p.secStatus}</span>
                        <span class="label">DANGER:</span> <span class="value">${p.dangerRatio}%</span>
                    </div>
                </div>

                <div class="top-lists">
                    <div class="list-col">
                        <small>TOP SHIPS</small>
                        <ul>${shipList}</ul>
                    </div>
                    <div class="list-col">
                        <small>TOP SYSTEMS</small>
                        <ul>${sysList}</ul>
                    </div>
                </div>

                <div class="actions">
                    <a href="${zkill}" target="_blank" class="btn">zKill</a>
                    <a href="${evewho}" target="_blank" class="btn">EveWho</a>
                    <a href="${grimIntel}" target="_blank" class="btn btn-grim">Grim Intel</a>
                </div>
            </div>
        `;
    }).join('');

    grid.innerHTML = cardsHTML;
}
