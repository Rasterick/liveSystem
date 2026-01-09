document.addEventListener("DOMContentLoaded", () => {
              const logFileInput = document.getElementById("logFile");
              const processButton = document.getElementById("processButton");
              const resultsTableContainer = document.getElementById(
                "resultsTableContainer"
              );

              const JOIN_KEYWORDS = /\b(in|x)\b/i;
              const LEAVE_KEYWORDS = /\b(out)\b/i;
              const IFA_END_KEYWORD = /IFA end/i;
              const LOG_LINE_REGEX =
                /^\[\s*(\d{4}\.\d{2}\.\d{2}\s\d{2}:\d{2}:\d{2})\s*\]\s*([^>]+?)\s*>\s*(.*)$/;

              processButton.addEventListener("click", () => {
                const file = logFileInput.files[0];
                if (!file) {
                  alert("Please select a log file first.");
                  return;
                }

                const reader = new FileReader();
                reader.onload = (event) => {
                  try {
                    const logText = event.target.result;
                    processLogContent(logText);
                  } catch (error) {
                    console.error("Error processing log file:", error);
                    resultsTableContainer.innerHTML = `<p style="color: red;">Error processing log file: ${error.message}</p>`;
                  }
                };
                reader.onerror = () => {
                  alert("Error reading file.");
                  resultsTableContainer.innerHTML = `<p style="color: red;">Error reading file.</p>`;
                };
                reader.readAsText(file);
              });

              function parseTimestamp(timestampStr) {
                // Expects "YYYY.MM.DD HH:MM:SS"
                const parts = timestampStr.match(
                  /(\d{4})\.(\d{2})\.(\d{2})\s(\d{2}):(\d{2}):(\d{2})/
                );
                if (!parts) return null;
                // Month is 0-indexed in JavaScript Date
                return new Date(
                  parts[1],
                  parts[2] - 1,
                  parts[3],
                  parts[4],
                  parts[5],
                  parts[6]
                );
              }

              function formatDate(dateObj) {
                if (!dateObj) return "N/A";
                const YYYY = dateObj.getFullYear();
                const MM = String(dateObj.getMonth() + 1).padStart(2, "0");
                const DD = String(dateObj.getDate()).padStart(2, "0");
                const hh = String(dateObj.getHours()).padStart(2, "0");
                const mm = String(dateObj.getMinutes()).padStart(2, "0");
                const ss = String(dateObj.getSeconds()).padStart(2, "0");
                return `${YYYY}.${MM}.${DD} ${hh}:${mm}:${ss}`;
              }

              function formatDuration(totalMs) {
                if (totalMs <= 0) return "00:00:00";
                let seconds = Math.floor((totalMs / 1000) % 60);
                let minutes = Math.floor((totalMs / (1000 * 60)) % 60);
                let hours = Math.floor(totalMs / (1000 * 60 * 60));

                hours = String(hours).padStart(2, "0");
                minutes = String(minutes).padStart(2, "0");
                seconds = String(seconds).padStart(2, "0");
                return `${hours}:${minutes}:${seconds}`;
              }

              function msToMinutes(totalMs) {
                if (totalMs <= 0) return 0;
                return parseFloat((totalMs / (1000 * 60)).toFixed(2));
              }

              function processLogContent(logText) {
                const lines = logText
                  .split("\n")
                  .map((line) => line.trim())
                  .filter((line) => line.length > 0);
                let ifaStartTime = null;
                let ifaEndTime = null;
                const rawLogEntries = [];

                // First pass: determine IFA start/end times and collect all valid log entries
                for (const line of lines) {
                  const match = line.match(LOG_LINE_REGEX);
                  if (match) {
                    const timestamp = parseTimestamp(match[1]);
                    const name = match[2].trim();
                    const message = match[3].trim();

                    if (!timestamp) continue; // Skip if timestamp is invalid

                    if (!ifaStartTime) {
                      // First valid log entry's timestamp is IFA start
                      ifaStartTime = timestamp;
                    }
                    rawLogEntries.push({ timestamp, name, message });

                    if (IFA_END_KEYWORD.test(message)) {
                      ifaEndTime = timestamp;
                    }
                  }
                }

                if (!ifaStartTime) {
                  resultsTableContainer.innerHTML =
                    '<p style="color: red;">Could not determine IFA start time (no valid log entries found).</p>';
                  return;
                }
                if (!ifaEndTime) {
                  // If no explicit "IFA end", use the timestamp of the last valid log entry
                  if (rawLogEntries.length > 0) {
                    ifaEndTime =
                      rawLogEntries[rawLogEntries.length - 1].timestamp;
                    console.warn(
                      "No explicit 'IFA end' found. Using timestamp of the last log entry as IFA end."
                    );
                  } else {
                    resultsTableContainer.innerHTML =
                      '<p style="color: red;">Could not determine IFA end time.</p>';
                    return;
                  }
                }

                // Filter entries within the IFA period
                const filteredLogEntries = rawLogEntries.filter(
                  (entry) =>
                    entry.timestamp >= ifaStartTime &&
                    entry.timestamp <= ifaEndTime
                );

                const characterData = {};

                for (const entry of filteredLogEntries) {
                  const { timestamp, name, message } = entry;
                  if (!characterData[name]) {
                    characterData[name] = {
                      events: [],
                      totalTimeMs: 0,
                      firstJoinTime: null, // Actual first join event time
                      lastLeaveTime: null, // Actual last leave event time
                    };
                  }

                  if (JOIN_KEYWORDS.test(message)) {
                    characterData[name].events.push({
                      type: "join",
                      time: timestamp,
                    });
                    if (
                      !characterData[name].firstJoinTime ||
                      timestamp < characterData[name].firstJoinTime
                    ) {
                      characterData[name].firstJoinTime = timestamp;
                    }
                  } else if (LEAVE_KEYWORDS.test(message)) {
                    characterData[name].events.push({
                      type: "leave",
                      time: timestamp,
                    });
                    // lastLeaveTime will be updated during calculation to ensure it's the LATEST leave
                  }
                }

                const results = [];

                for (const name in characterData) {
                  const data = characterData[name];
                  data.events.sort((a, b) => a.time - b.time);

                  let currentSessionStartTime = null;
                  let charTotalTimeMs = 0;
                  let charLastEffectiveLeaveTime = null; // Tracks the end of the last segment of presence

                  for (const event of data.events) {
                    if (event.type === "join") {
                      if (currentSessionStartTime === null) {
                        // Start of a new session
                        currentSessionStartTime = event.time;
                      }
                      // If already in a session, this join is ignored for start time, previous start time is kept.
                    } else if (event.type === "leave") {
                      if (currentSessionStartTime !== null) {
                        // Was in a session
                        charTotalTimeMs += event.time - currentSessionStartTime;
                        charLastEffectiveLeaveTime = event.time;
                        currentSessionStartTime = null; // End current session
                      }
                      // If not in a session (e.g. multiple 'out' messages), this leave is ignored.
                    }
                  }

                  // If still in a session when IFA ends (or last event was a join)
                  if (currentSessionStartTime !== null) {
                    charTotalTimeMs += ifaEndTime - currentSessionStartTime;
                    charLastEffectiveLeaveTime = ifaEndTime; // Effective leave is IFA end
                  }

                  data.totalTimeMs = charTotalTimeMs;

                  // Determine overall Start and End times for display
                  // StartTime is the firstJoinTime. If no join event, but other messages, this might be an issue.
                  // For now, we require an explicit join.
                  let displayStartTime = data.firstJoinTime;

                  // EndTime is the latest of their last leave event or ifaEndTime if they were active till the end.
                  // Or if they never left, it's ifaEndTime.
                  let displayEndTime = null;
                  const leaveEvents = data.events
                    .filter((e) => e.type === "leave")
                    .map((e) => e.time);
                  if (leaveEvents.length > 0) {
                    displayEndTime = new Date(Math.max(...leaveEvents));
                  }

                  // If the character was active until the end (last event was join or no leave after last join)
                  // and their last actual leave is before ifaEndTime, or they never left
                  if (
                    charLastEffectiveLeaveTime &&
                    charLastEffectiveLeaveTime.getTime() ===
                      ifaEndTime.getTime()
                  ) {
                    displayEndTime = ifaEndTime;
                  } else if (displayEndTime === null && data.firstJoinTime) {
                    // Joined but never left
                    displayEndTime = ifaEndTime;
                  } else if (
                    displayEndTime &&
                    charLastEffectiveLeaveTime &&
                    displayEndTime < charLastEffectiveLeaveTime
                  ) {
                    // This can happen if the last effective leave was ifaEndTime
                    displayEndTime = charLastEffectiveLeaveTime;
                  }

                  if (data.totalTimeMs > 0 || data.firstJoinTime) {
                    // Only add if they had activity or at least one join
                    results.push({
                      characterName: name,
                      startTime: formatDate(displayStartTime || ifaStartTime), // Fallback to ifaStartTime if no explicit join
                      endTime: formatDate(displayEndTime || ifaEndTime), // Fallback to ifaEndTime
                      timeInChat: formatDuration(data.totalTimeMs),
                      timeInChatMinutes: msToMinutes(data.totalTimeMs),
                    });
                  }
                }

                results.sort((a, b) =>
                  a.characterName.localeCompare(b.characterName)
                );
                displayResultsTable(results);
              }

              function displayResultsTable(data) {
                if (data.length === 0) {
                  resultsTableContainer.innerHTML =
                    "<p>No character activity found within the IFA period or matching criteria.</p>";
                  return;
                }

                let tableHTML = `
            <table>
                <thead>
                    <tr>
                        <th>Character Name</th>
                        <th>Start Time</th>
                        <th>End Time</th>
                        <th>Time in Chat</th>
                        <th>Time in Chat (Minutes)</th>
                    </tr>
                </thead>
                <tbody>
        `;
                data.forEach((char) => {
                  tableHTML += `
                <tr>
                    <td>${char.characterName}</td>
                    <td>${char.startTime}</td>
                    <td>${char.endTime}</td>
                    <td>${char.timeInChat}</td>
                    <td>${char.timeInChatMinutes}</td>
                </tr>
            `;
                });
                tableHTML += `</tbody></table>`;
                resultsTableContainer.innerHTML = tableHTML;
              }
            });
