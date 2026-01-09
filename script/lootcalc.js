const WEBHOOK_URL = 'https://n8n.grim-horizon.org/webhook/testForm_001';

        document.getElementById('analysis-form').addEventListener('submit', function(event) {
            event.preventDefault();
            handleAnalysis();
        });

        async function handleAnalysis() {
            const form = document.getElementById('analysis-form');
            const resultContainer = document.querySelector('#anomalies-table tbody');
            const grandTotalElement = document.getElementById('grand-total-value');
            const totalSitesElement = document.getElementById('total-sites-count');

            // Clear previous results and set status
            resultContainer.innerHTML = '<tr><td colspan="5">Processing data...</td></tr>';
            grandTotalElement.textContent = 'Processing...';
            totalSitesElement.textContent = '...';

            const payload = {
                system_name: document.getElementById('system-input').value,
                structures_count: document.getElementById('structures-input').value,
                scan_data: document.getElementById('probe-scan-paste').value
            };

            try {
                const response = await fetch(WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    throw new Error(`HTTP Error! Status: ${response.status}`);
                }


                const responseText = await response.text();
                const dataArray = JSON.parse(responseText.trim());

                const data = dataArray[0];



                // --- Display Logic ---
                if (data && data.grandTotal !== undefined && data.breakdown) {
                    const totalSites = data.breakdown.reduce((sum, item) => sum + item.count, 0);

                    const formattedTotal = formatIsk(data.grandTotal);
                    grandTotalElement.textContent = formattedTotal;
                    totalSitesElement.textContent = totalSites;

                    buildResultsTable(data.breakdown, resultContainer);
                } else {
                    grandTotalElement.textContent = 'Error: Invalid data format.';
                    resultContainer.innerHTML = '<tr><td colspan="5">Could not parse data from server.</td></tr>';
                }

            } catch (error) {
                console.error('Analysis failed:', error);
                grandTotalElement.textContent = 'Analysis Failed.';
                resultContainer.innerHTML = `<tr><td colspan="5">Connection/Server Error. (${error.message})</td></tr>`;
            }
        }

        function formatIsk(value) {
            if (typeof value !== 'number') return 'N/A';
            return value.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' ISK';
        }

        function buildResultsTable(breakdown, container) {
            container.innerHTML = ''; // Clear processing message

            if (!breakdown || breakdown.length === 0) {
                container.innerHTML = '<tr><td colspan="5">No anomalies found that match valuation criteria.</td></tr>';
                return;
            }

            breakdown.forEach(item => {
                const row = container.insertRow();
                const totalValueClass = (item.totalValue > 0) ? 'value-calculated' : 'value-zero';

                // Assuming item.siteGroup, item.baseValue, item.totalValue, and item.count are returned by n8n
                row.insertCell().textContent = item.siteType;
                row.insertCell().textContent = item.group; // || 'N/A'; // Added Group column
                row.insertCell().textContent = item.count;
                row.insertCell().textContent = formatIsk(item.baseValue);

                const totalCell = row.insertCell();
                totalCell.textContent = formatIsk(item.totalValue);
                totalCell.classList.add(totalValueClass);
            });
        }
