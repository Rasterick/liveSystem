
            console.log("Script parsing started"); // For debugging

            let shipsData = [];
            const baseWikiUrl = "https://wiki.eveuniversity.org/";

            const inputTextElem = document.getElementById("inputText");
            const scanLocationInputElem =
              document.getElementById("scanLocationInput");
            const playersInStructuresInputElem = document.getElementById(
              "playersInStructuresInput"
            );
            const systemInputElem = document.getElementById("systemInput");

            const curseCountElem = document.getElementById("curseCount");
            const rookCountElem = document.getElementById("rookCount");
            const lachesisCountElem = document.getElementById("lachesisCount");
            const huginnCountElem = document.getElementById("huginnCount");

            const analyseButtonElem = document.getElementById("analyseButton");
            const cancelButtonElem = document.getElementById("cancelButton");
            const copyUrlButtonElem = document.getElementById("copyUrlButton");
            // *** NEW BUTTON ELEMENT ***
            const saveAndShareButtonElem =
              document.getElementById("saveAndShareButton");

            const systemInfoContainerElem = document.getElementById(
              "systemInfoContainer"
            );
            const classSummaryTableContainerElem = document.getElementById(
              "classSummaryTableContainer"
            );
            const shipSummaryTableContainerElem = document.getElementById(
              "shipSummaryTableContainer"
            );
            const unrecognizedEntriesTableContainerElem =
              document.getElementById("unrecognizedEntriesTableContainer");
            const malformedLinesInfoElem =
              document.getElementById("malformedLinesInfo");

            // *** CORRECTED escapeHtml FUNCTION ***
            function escapeHtml(unsafe) {
              if (unsafe === null || typeof unsafe === "undefined") return "";
              return String(unsafe)
                .replace(/&/g, "&")
                .replace(/</g, "<")
                .replace(/>/g, ">")
                .replace(/"/g, '"')
                .replace(/'/g, "'");
            }

            async function loadShipData() {
              try {
                const response = await fetch("data/shipData.json");
                if (!response.ok) {
                  throw new Error(
                    "HTTP error! status: " +
                      response.status +
                      " while fetching shipData.json"
                  );
                }
                const jsonData = await response.json();

                jsonData.forEach((ship) => {
                  let url = ship.URL ? String(ship.URL).trim() : "";
                  if (
                    !url ||
                    url.startsWith("<img") ||
                    (url.includes("_Shuttle") &&
                      !url.startsWith("https://wiki.eveuniversity.org/"))
                  ) {
                    const shipNameForUrl = ship.Ship.replace(/ /g, "_");
                    ship.URL = baseWikiUrl + encodeURIComponent(shipNameForUrl);
                  } else {
                    ship.URL = url;
                  }
                  ship["Faction Icon"] = ship["Faction Icon"] || "";
                  ship.Tank = ship.Tank || "";
                });

                shipsData = jsonData;
                shipsData.sort((a, b) => {
                  const lenA = a.Ship ? a.Ship.length : 0;
                  const lenB = b.Ship ? b.Ship.length : 0;
                  return lenB - lenA;
                });

                // *** MODIFIED INITIALIZATION CALL ***
                await initializeApplicationState();
              } catch (e) {
                console.error("Error loading or parsing shipData.json:", e);
                alert(
                  "Error loading ship data. Analysis may not work correctly. Please check the console for details and ensure 'data/shipData.json' exists and is valid."
                );
                systemInfoContainerElem.innerHTML =
                  '<p style="color:red;">Error loading ship database. Please try refreshing the page or contact support. (Check browser console for details)</p>';
                // Even if ship data fails, try to initialize from URL if possible
                await initializeApplicationState();
              }
            }

            // *** NEW FUNCTION TO LOAD DATA FROM SERVER ***
            async function loadScanDataFromServer(scanId) {
              try {
                const response = await fetch(
                  `/../api/load_scan.php?id=${encodeURIComponent(scanId)}`
                );
                if (!response.ok) {
                  const errorData = await response.json().catch(() => ({
                    message: `HTTP error! status: ${response.status}`,
                  }));
                  throw new Error(
                    errorData.message ||
                      `HTTP error! status: ${response.status}`
                  );
                }
                const serverData = await response.json();
                if (serverData.success && serverData.data_payload) {
                  const urlDataObject = JSON.parse(serverData.data_payload);
                  populateFieldsFromDataObject(urlDataObject);
                  return true; // Indicate success
                } else {
                  throw new Error(
                    serverData.message ||
                      "Failed to retrieve scan data from server."
                  );
                }
              } catch (e) {
                console.error("Error loading scan data from server:", e);
                alert(
                  "Error loading shared scan: " +
                    e.message +
                    "\nDisplaying a blank slate."
                );
                // Clear URL params to prevent re-attempting load on refresh
                history.replaceState(
                  null,
                  "",
                  window.location.pathname + window.location.hash
                );
                return false; // Indicate failure
              }
            }

            // *** NEW FUNCTION TO POPULATE FIELDS (extracted from old initializePage) ***
            function populateFieldsFromDataObject(dataObject) {
              if (dataObject.scanInput !== undefined) {
                inputTextElem.value = dataObject.scanInput;
              }
              if (dataObject.scanLocation !== undefined) {
                scanLocationInputElem.value = dataObject.scanLocation;
              }
              if (dataObject.playersInStructures !== undefined) {
                playersInStructuresInputElem.value =
                  dataObject.playersInStructures;
              }
              if (dataObject.systemName !== undefined) {
                systemInputElem.value = dataObject.systemName;
              }
              curseCountElem.value = dataObject.reconCurse || 0;
              rookCountElem.value = dataObject.reconRook || 0;
              lachesisCountElem.value = dataObject.reconLachesis || 0;
              huginnCountElem.value = dataObject.reconHuginn || 0;
            }

            // *** REWORKED INITIALIZATION LOGIC ***
            async function initializeApplicationState() {
              const urlParams = new URLSearchParams(window.location.search);
              const scanId = urlParams.get("scan_id");

              let dataLoaded = false;

              if (scanId) {
                console.log("Scan ID found in URL:", scanId);
                const loadedFromServer = await loadScanDataFromServer(scanId);
                if (loadedFromServer) {
                  dataLoaded = true;
                }
              } else if (
                window.location.hash &&
                window.location.hash.startsWith("#d=")
              ) {
                console.log("Hash data found in URL.");
                try {
                  const encodedData = window.location.hash.substring(3);
                  const decodedJsonString = decodeURIComponent(
                    atob(encodedData)
                  );
                  const urlDataObject = JSON.parse(decodedJsonString);
                  populateFieldsFromDataObject(urlDataObject);
                  dataLoaded = true;
                } catch (e) {
                  console.error("Error decoding data object from URL hash:", e);
                  history.replaceState(
                    null,
                    "",
                    window.location.pathname + window.location.search
                  ); // Clear bad hash
                }
              }

              if (dataLoaded) {
                if (shipsData.length > 0) {
                  performAnalysis();
                } else {
                  // Data is from URL, but ship data not yet loaded (or failed to load)
                  // Display basic info and wait for ship data if it's still loading
                  let initBaseTitle = "Analysis Time (Ship data loading...)";
                  let initTitle = initBaseTitle;
                  let initAdditionalHtml = "";
                  const initSystemName = systemInputElem.value.trim();
                  const jPatternInit = /^J\d{6}$/i;

                  if (initSystemName && jPatternInit.test(initSystemName)) {
                    const systemNameUpper = initSystemName.toUpperCase();
                    initTitle =
                      'Scan of System <a href="https://anoik.is/systems/' +
                      escapeHtml(systemNameUpper) +
                      '" target="_blank">' +
                      escapeHtml(systemNameUpper) +
                      "</a> (Ship data loading...)";
                  } else if (
                    initSystemName &&
                    !jPatternInit.test(initSystemName)
                  ) {
                    initAdditionalHtml =
                      '<p style="color:orange; text-align:center;">System name \'' +
                      escapeHtml(initSystemName) +
                      "' is not in J###### format.</p>";
                  }
                  displayCurrentTimeDate(
                    initTitle,
                    initAdditionalHtml,
                    scanLocationInputElem.value,
                    playersInStructuresInputElem.value
                  );
                }
              } else {
                // No scan_id, no hash, or failed to load from them
                displayCurrentTimeDate("Analysis Time");
              }
            }

            function determineShipIdentity(rawColumn3Text) {
              const trimmedOriginalInput = rawColumn3Text.trim();
              const lowerTrimmedOriginalInput =
                trimmedOriginalInput.toLowerCase();
              const lowerRawColumn3Text = rawColumn3Text.toLowerCase();

              if (shipsData.length === 0) {
                return { foundShip: null, effectiveName: trimmedOriginalInput };
              }

              let found = shipsData.find(
                (dbShip) =>
                  dbShip.Ship &&
                  dbShip.Ship.toLowerCase() === lowerTrimmedOriginalInput
              );
              if (found) {
                return { foundShip: found, effectiveName: found.Ship };
              }

              for (const dbShip of shipsData) {
                if (
                  dbShip.Ship &&
                  dbShip.Ship.trim() !== "" &&
                  lowerRawColumn3Text.includes(dbShip.Ship.toLowerCase())
                ) {
                  return { foundShip: dbShip, effectiveName: dbShip.Ship };
                }
              }

              return { foundShip: null, effectiveName: trimmedOriginalInput };
            }

            function appendReconShipsToTextarea() {
              let appendedText = "";
              const reconShips = [
                { name: "Curse", count: parseInt(curseCountElem.value) || 0 },
                { name: "Rook", count: parseInt(rookCountElem.value) || 0 },
                {
                  name: "Lachesis",
                  count: parseInt(lachesisCountElem.value) || 0,
                },
                { name: "Huginn", count: parseInt(huginnCountElem.value) || 0 },
              ];

              reconShips.forEach((ship) => {
                for (let i = 0; i < ship.count; i++) {
                  appendedText += "11987\tUNK\t" + ship.name + "\t-\n";
                }
              });

              if (appendedText) {
                const currentText = inputTextElem.value;
                inputTextElem.value +=
                  (currentText.trim() ? "\n" : "") + appendedText.trim();
              }
            }

            function performAnalysis() {
              appendReconShipsToTextarea();

              const rawInput = inputTextElem.value;
              const scanLocation = scanLocationInputElem.value.trim();
              const playersInStructures = playersInStructuresInputElem.value;
              const systemNameInputValue = systemInputElem.value.trim();

              const jSystemPattern = /^J\d{6}$/i;

              function getSystemDisplayInfo(baseTitle) {
                let titleResult = baseTitle;
                let additionalHtmlResult = "";
                if (
                  systemNameInputValue &&
                  jSystemPattern.test(systemNameInputValue)
                ) {
                  const systemNameUpper = systemNameInputValue.toUpperCase();
                  titleResult =
                    'Scan of System <a href="https://anoik.is/systems/' +
                    escapeHtml(systemNameUpper) +
                    '" target="_blank">' +
                    escapeHtml(systemNameUpper) +
                    "</a>";
                } else if (
                  systemNameInputValue &&
                  !jSystemPattern.test(systemNameInputValue)
                ) {
                  additionalHtmlResult =
                    '<p style="color:orange; text-align:center;">System name \'' +
                    escapeHtml(systemNameInputValue) +
                    "' is not in J###### format.</p>";
                }
                return {
                  title: titleResult,
                  additionalHtml: additionalHtmlResult,
                };
              }

              systemInfoContainerElem.innerHTML = "";
              classSummaryTableContainerElem.innerHTML =
                "<h2>Class Summary</h2>";
              shipSummaryTableContainerElem.innerHTML = "<h2>Ship Summary</h2>";
              unrecognizedEntriesTableContainerElem.innerHTML =
                "<h2>Unrecognized Entries</h2>";
              malformedLinesInfoElem.innerHTML = "";

              if (shipsData.length === 0) {
                alert(
                  "Ship data is not loaded yet. Please wait a moment and try again, or refresh the page."
                );
                const systemInfo = getSystemDisplayInfo("Analysis Time");
                displayCurrentTimeDate(
                  systemInfo.title,
                  systemInfo.additionalHtml,
                  scanLocation,
                  playersInStructures
                );
                return;
              }

              if (!rawInput.trim()) {
                // *** MODIFIED: Don't clear hash if loaded from scan_id ***
                const currentUrlParams = new URLSearchParams(
                  window.location.search
                );
                if (!currentUrlParams.has("scan_id") && window.location.hash) {
                  history.replaceState(
                    null,
                    "",
                    window.location.pathname + window.location.search
                  );
                }
                shipSummaryTableContainerElem.innerHTML +=
                  '<p style="text-align:center;">Input is empty.</p>';
                const systemInfo = getSystemDisplayInfo("Analysis Time");
                displayCurrentTimeDate(
                  systemInfo.title,
                  systemInfo.additionalHtml,
                  scanLocation,
                  playersInStructures
                );
                return;
              }

              // *** MODIFIED: Only update hash if not loaded from scan_id ***
              const currentUrlParamsForHash = new URLSearchParams(
                window.location.search
              );
              if (!currentUrlParamsForHash.has("scan_id")) {
                try {
                  const dataToEncode = {
                    scanInput: rawInput,
                    scanLocation: scanLocation,
                    playersInStructures: playersInStructures,
                    systemName: systemNameInputValue,
                    reconCurse: curseCountElem.value,
                    reconRook: rookCountElem.value,
                    reconLachesis: lachesisCountElem.value,
                    reconHuginn: huginnCountElem.value,
                  };
                  const jsonStringToEncode = JSON.stringify(dataToEncode);
                  const encodedData = btoa(
                    encodeURIComponent(jsonStringToEncode)
                  );
                  if (encodedData) {
                    window.location.hash = "d=" + encodedData;
                  } else {
                    if (window.location.hash) {
                      history.replaceState(
                        null,
                        "",
                        window.location.pathname + window.location.search
                      );
                    }
                  }
                } catch (e) {
                  console.error("Error during encoding for URL hash:", e);
                }
              }

              const lines = rawInput
                .split("\n")
                .filter((line) => line.trim() !== "");
              if (lines.length === 0) {
                shipSummaryTableContainerElem.innerHTML +=
                  '<p style="text-align:center;">No valid lines to process.</p>';
                const systemInfo = getSystemDisplayInfo("Analysis Time");
                displayCurrentTimeDate(
                  systemInfo.title,
                  systemInfo.additionalHtml,
                  scanLocation,
                  playersInStructures
                );
                return;
              }

              const shipCounts = {};
              const firstShipDataForEffectiveName = {};
              const classCounts = {};
              const unrecognizedEntries = {};
              const malformedLineDetails = { count: 0, lines: [] };

              lines.forEach((line) => {
                const parts = line.split("\t");
                if (parts.length < 3) {
                  malformedLineDetails.count++;
                  malformedLineDetails.lines.push(line);
                } else {
                  const rawColumn3Text = parts[2];
                  const idShipResult = determineShipIdentity(rawColumn3Text);

                  shipCounts[idShipResult.effectiveName] =
                    (shipCounts[idShipResult.effectiveName] || 0) + 1;

                  if (idShipResult.foundShip) {
                    if (
                      !firstShipDataForEffectiveName[idShipResult.effectiveName]
                    ) {
                      firstShipDataForEffectiveName[
                        idShipResult.effectiveName
                      ] = idShipResult.foundShip;
                    }
                    if (
                      idShipResult.foundShip.Class &&
                      idShipResult.foundShip.Class.trim() !== ""
                    ) {
                      classCounts[idShipResult.foundShip.Class] =
                        (classCounts[idShipResult.foundShip.Class] || 0) + 1;
                    }
                  } else {
                    unrecognizedEntries[idShipResult.effectiveName] =
                      (unrecognizedEntries[idShipResult.effectiveName] || 0) +
                      1;
                    if (
                      !firstShipDataForEffectiveName[idShipResult.effectiveName]
                    ) {
                      firstShipDataForEffectiveName[
                        idShipResult.effectiveName
                      ] = null;
                    }
                  }
                }
              });

              const finalSystemInfo = getSystemDisplayInfo("Analysis Time");
              displayCurrentTimeDate(
                finalSystemInfo.title,
                finalSystemInfo.additionalHtml,
                scanLocation,
                playersInStructures
              );

              if (Object.keys(classCounts).length > 0) {
                let classTableHtml =
                  "<table><thead><tr><th>Class</th><th>Count</th></tr></thead><tbody>";
                Object.keys(classCounts)
                  .sort((a, b) => a.localeCompare(b))
                  .forEach((className) => {
                    classTableHtml +=
                      "<tr><td>" +
                      escapeHtml(className) +
                      "</td><td>" +
                      classCounts[className] +
                      "</td></tr>";
                  });
                classTableHtml += "</tbody></table>";
                classSummaryTableContainerElem.innerHTML += classTableHtml;
              } else {
                classSummaryTableContainerElem.innerHTML +=
                  '<p style="text-align:center;">No recognized ship classes found.</p>';
              }

              let shipTableHtml =
                '<table class="ship-summary-table"><thead><tr><th>Count</th><th>Ship</th><th>Class</th><th>Faction Icon</th><th>ECM/Sensor</th><th>Tank</th><th>DPS</th><th>Notes</th></tr></thead><tbody>';
              const sortedRecognizedEffectiveNames = Object.keys(shipCounts)
                .filter((name) => firstShipDataForEffectiveName[name] !== null)
                .sort((a, b) => a.localeCompare(b));
              let recognizedShipsFound = false;
              sortedRecognizedEffectiveNames.forEach((effectiveName) => {
                recognizedShipsFound = true;
                const count = shipCounts[effectiveName];
                const shipDetails =
                  firstShipDataForEffectiveName[effectiveName];
                const shipLink = shipDetails.URL
                  ? '<a href="' +
                    escapeHtml(shipDetails.URL) +
                    '" target="_blank">' +
                    escapeHtml(shipDetails.Ship) +
                    "</a>"
                  : escapeHtml(shipDetails.Ship);

                const factionIconCellHtml = shipDetails["Faction Icon"] || "";
                const tankCellHtml = shipDetails.Tank || "";

                let sensorClass = "sensor-unknown";
                if (shipDetails.Sensor) {
                  const sensorLower = String(shipDetails.Sensor).toLowerCase();
                  if (sensorLower.includes("radar"))
                    sensorClass = "sensor-radar";
                  else if (sensorLower.includes("gravimetric"))
                    sensorClass = "sensor-gravimetric";
                  else if (sensorLower.includes("magnetometric"))
                    sensorClass = "sensor-magnetometric";
                  else if (sensorLower.includes("ladar"))
                    sensorClass = "sensor-ladar";
                }

                shipTableHtml +=
                  "<tr>" +
                  "<td>" +
                  count +
                  "</td>" +
                  "<td>" +
                  shipLink +
                  "</td>" +
                  "<td>" +
                  escapeHtml(shipDetails.Class) +
                  "</td>" +
                  "<td>" +
                  factionIconCellHtml +
                  "</td>" +
                  '<td class="' +
                  sensorClass +
                  '">' +
                  escapeHtml(shipDetails.Sensor) +
                  "</td>" +
                  "<td>" +
                  tankCellHtml +
                  "</td>" +
                  "<td>" +
                  escapeHtml(shipDetails.DPS) +
                  "</td>" +
                  "<td>" +
                  escapeHtml(shipDetails.Notes) +
                  "</td>" +
                  "</tr>";
              });
              if (
                !recognizedShipsFound &&
                Object.keys(unrecognizedEntries).length === 0 &&
                malformedLineDetails.count === 0
              ) {
                shipTableHtml +=
                  '<tr><td colspan="8" style="text-align:center;">No recognized ships found.</td></tr>';
              }
              shipTableHtml += "</tbody></table>";
              shipSummaryTableContainerElem.innerHTML += shipTableHtml;

              const sortedUnrecognizedNames = Object.keys(
                unrecognizedEntries
              ).sort((a, b) => a.localeCompare(b));
              if (sortedUnrecognizedNames.length > 0) {
                let unrecognizedTableHtml =
                  "<table><thead><tr><th>Count</th><th>Unrecognized Name/Text</th></tr></thead><tbody>";
                sortedUnrecognizedNames.forEach((name) => {
                  unrecognizedTableHtml +=
                    "<tr><td>" +
                    unrecognizedEntries[name] +
                    "</td><td>" +
                    escapeHtml(name) +
                    "</td></tr>";
                });
                unrecognizedTableHtml += "</tbody></table>";
                unrecognizedEntriesTableContainerElem.innerHTML +=
                  unrecognizedTableHtml;
              } else {
                unrecognizedEntriesTableContainerElem.innerHTML +=
                  '<p style="text-align:center;">No unrecognized entries.</p>';
              }

              if (malformedLineDetails.count > 0) {
                malformedLinesInfoElem.innerHTML =
                  "<p><strong>Malformed Lines Detected:</strong> " +
                  malformedLineDetails.count +
                  ". These lines had fewer than 3 tab-separated columns and were not fully processed.</p>";
              } else {
                malformedLinesInfoElem.innerHTML =
                  "<p>No malformed input lines detected.</p>";
              }
            }

            function displayCurrentTimeDate(
              title,
              additionalSystemHtml = "",
              scanLocation = "",
              playersInStructures = ""
            ) {
              const now = new Date();
              const timeString = now.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
              });
              const dateString = now.toLocaleDateString([], {
                year: "numeric",
                month: "long",
                day: "numeric",
              });

              let infoHtml = "<h2>" + title + "</h2>"; // Title is already HTML-ready if from getSystemDisplayInfo
              if (additionalSystemHtml) {
                infoHtml += additionalSystemHtml; // This is also already HTML
              }

              infoHtml += '<table class="info-table"><tbody>';
              if (scanLocation) {
                infoHtml +=
                  "<tr><td>Scanned From:</td><td>" +
                  escapeHtml(scanLocation) +
                  "</td></tr>";
              }
              if (
                (playersInStructures &&
                  String(playersInStructures).trim() !== "") ||
                parseInt(playersInStructures) === 0
              ) {
                infoHtml +=
                  "<tr><td>Players in Structures:</td><td>" +
                  escapeHtml(String(playersInStructures)) +
                  "</td></tr>";
              }
              infoHtml +=
                "<tr><td>Time:</td><td>" +
                timeString +
                "</td></tr>" +
                "<tr><td>Date:</td><td>" +
                dateString +
                "</td></tr>" +
                "</tbody></table>";
              systemInfoContainerElem.innerHTML = infoHtml;
            }

            function clearAll() {
              inputTextElem.value = "";
              scanLocationInputElem.value = "";
              playersInStructuresInputElem.value = "0";
              systemInputElem.value = "";
              curseCountElem.value = "0";
              rookCountElem.value = "0";
              lachesisCountElem.value = "0";
              huginnCountElem.value = "0";

              systemInfoContainerElem.innerHTML = "";
              classSummaryTableContainerElem.innerHTML =
                "<h2>Class Summary</h2>";
              shipSummaryTableContainerElem.innerHTML = "<h2>Ship Summary</h2>";
              unrecognizedEntriesTableContainerElem.innerHTML =
                "<h2>Unrecognized Entries</h2>";
              malformedLinesInfoElem.innerHTML = "";

              // Clear both hash and scan_id from URL
              history.replaceState(null, "", window.location.pathname);

               // ---- ADD code to refresh browser completely --- ///

            window.location.reload()

            // ---- END --- //

              displayCurrentTimeDate("Analysis Time");
            }

            function copyUrlToClipboard() {
              navigator.clipboard
                .writeText(window.location.href)
                .then(() => {
                  const originalText = copyUrlButtonElem.textContent;
                  const originalBg = copyUrlButtonElem.style.backgroundColor;
                  const originalColor = copyUrlButtonElem.style.color;

                  copyUrlButtonElem.textContent = "Copied!";
                  copyUrlButtonElem.style.backgroundColor = "#50fa7b"; // Greenish
                  copyUrlButtonElem.style.color = "#282a36"; // Dark
                  setTimeout(() => {
                    copyUrlButtonElem.textContent = originalText;
                    copyUrlButtonElem.style.backgroundColor = originalBg;
                    copyUrlButtonElem.style.color = originalColor;
                  }, 2000);
                })
                .catch((err) => {
                  console.error("Failed to copy URL: ", err);
                  alert("Failed to copy URL. Please copy it manually.");
                });
            }

            // *** NEW FUNCTION TO HANDLE SAVE AND SHARE ***
            async function handleSaveAndShare() {
              const originalButtonText = saveAndShareButtonElem.textContent;
              saveAndShareButtonElem.textContent = "Saving...";
              saveAndShareButtonElem.disabled = true;

              const dataToSave = {
                scanInput: inputTextElem.value,
                scanLocation: scanLocationInputElem.value.trim(),
                playersInStructures: playersInStructuresInputElem.value,
                systemName: systemInputElem.value.trim(),
                reconCurse: curseCountElem.value,
                reconRook: rookCountElem.value,
                reconLachesis: lachesisCountElem.value,
                reconHuginn: huginnCountElem.value,
              };
              const jsonDataString = JSON.stringify(dataToSave);

              try {
                const response = await fetch("/../api/save_scan.php", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: jsonDataString,
                });

                if (!response.ok) {
                  const errorData = await response.json().catch(() => ({
                    message: `Server error: ${response.status}`,
                  }));
                  // *** MODIFICATION FOR DEBUGGING ***
                  let err = new Error(
                    errorData.message || `Server error: ${response.status}`
                  );
                  err.serverErrorDetails = errorData; // Attach the whole errorData object
                  throw err;
                }

                const result = await response.json();

                if (result.success && result.url) {
                  // ...
                } else {
                  // *** MODIFICATION FOR DEBUGGING ***
                  let err = new Error(
                    result.message || "Failed to save scan data on server."
                  );
                  err.serverErrorDetails = result; // Attach the whole result object if it has debug info
                  throw err;
                }

                if (result.success && result.url) {
                  navigator.clipboard
                    .writeText(result.url)
                    .then(() => {
                      saveAndShareButtonElem.textContent = "Link Copied!";
                      // Optionally, navigate to the new URL or update current URL
                      // window.location.href = result.url; // This would navigate
                      // history.pushState(null, '', result.url); // This would change URL without reload
                      alert(
                        "Shareable link copied to clipboard:\n" + result.url
                      );
                    })
                    .catch((err) => {
                      console.error("Failed to copy new URL: ", err);
                      saveAndShareButtonElem.textContent =
                        "Link Ready (Copy Failed)";
                      alert(
                        "Shareable link created (failed to auto-copy, please copy manually):\n" +
                          result.url
                      );
                    });
                } else {
                  throw new Error(
                    result.message || "Failed to save scan data on server."
                  );
                }
                // ...
              } catch (error) {
                console.error("Error saving scan:", error);
                // *** MODIFICATION FOR DEBUGGING: Check for server's debug info ***
                let displayMessage = "Error saving scan: " + error.message;
                if (
                  error.serverErrorDetails &&
                  error.serverErrorDetails.debug_pdo_exception
                ) {
                  displayMessage +=
                    "\nServer DB Error: " +
                    error.serverErrorDetails.debug_pdo_exception;
                }
                alert(displayMessage);
                saveAndShareButtonElem.textContent = "Save Failed";
              }
              // ...
            }

            analyseButtonElem.addEventListener("click", performAnalysis);
            cancelButtonElem.addEventListener("click", clearAll);
            copyUrlButtonElem.addEventListener("click", copyUrlToClipboard);
            // *** ADD EVENT LISTENER FOR NEW BUTTON ***
            saveAndShareButtonElem.addEventListener(
              "click",
              handleSaveAndShare
            );

            console.log("loadShipData will be called now");
            loadShipData(); // This will eventually call initializeApplicationState
  
