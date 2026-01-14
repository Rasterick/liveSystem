<?php
// /var/www/html/api/get_pilot_intel.php

// --- CRITICAL SETTINGS ---
ini_set('display_errors', 0); // Prevent PHP warnings from breaking JSON
error_reporting(E_ALL);       // Still log errors internally
header('Content-Type: application/json');
require_once 'db_connect.php';

// --- CONFIGURATION ---
define('USER_AGENT', 'GrimIntel/1.0 (abonriff@gmail.com)'); 

// ---------------------------------------------------------
// HELPER: Fuzzy Logic & Tag Analysis
// ---------------------------------------------------------
function analyzeTag($rawTag) {
    $rawTag = trim($rawTag);
    $cleanText = preg_replace('/[^a-zA-Z0-9\s]/u', '', $rawTag); 
    return ['full' => $rawTag, 'clean' => trim($cleanText)];
}

// ---------------------------------------------------------
// HELPER: search Tags
// ---------------------------------------------------------

function searchTags($searchQuery) {
    global $pdo;

    // 1. Get all tags for fuzzy matching
    $stmt = $pdo->query("SELECT tag_id, tag_string, tag_clean FROM intel_tags");
    $allTags = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $matches = [];
    $searchClean = preg_replace('/[^a-zA-Z0-9\s]/u', '', $searchQuery);
    
    // 2. Calculate Scores
    foreach ($allTags as $row) {
        $score = 0;
        $dbString = $row['tag_string'];
        $dbClean = $row['tag_clean'];

        if (!empty($searchClean) && !empty($dbClean)) {
            similar_text(strtoupper($searchClean), strtoupper($dbClean), $percent);
            $score = $percent;
        } else {
            similar_text($searchQuery, $dbString, $percent);
            $score = $percent;
        }

        if ($score > 60) {
            $matches[] = [
                'tag_id' => $row['tag_id'],
                'tag' => $row['tag_string'],
                'score' => $score // Keep as float for sorting
            ];
        }
    }

    // 3. Sort by Score
    usort($matches, function($a, $b) {
        return $b['score'] <=> $a['score'];
    });

    // 4. Slice top 5 results
    $topMatches = array_slice($matches, 0, 5);

    // 5. ENHANCEMENT: Fetch Context (Pilot + System) for these specific tags
    foreach ($topMatches as &$match) {
        // Default values
        $match['last_seen'] = 'No sightings';
        
        try {
            $sql = "SELECT c.character_name, m.solarSystemName
                    FROM intel_sightings s
                    JOIN intel_characters c ON s.character_id = c.character_id
                    LEFT JOIN mapSolarSystems m ON s.solar_system_id = m.solarSystemID
                    WHERE s.tag_id = :tid
                    ORDER BY s.sighting_date DESC LIMIT 1";
            
            $stmt = $pdo->prepare($sql);
            $stmt->execute(['tid' => $match['tag_id']]);
            $info = $stmt->fetch();

            if ($info) {
                $pilot = $info['character_name'];
                $sys = $info['solarSystemName'] ?? 'Unknown Space';
                $match['last_seen'] = "$pilot [$sys]";
            }
        } catch (Exception $e) { /* Ignore errors */ }
        
        // Format score for display
        $match['score'] = round($match['score'], 0) . '%';
    }

    return $topMatches;
}

// ---------------------------------------------------------
// HELPER: Fetch Associates + Ships + Systems
// ---------------------------------------------------------
function getRecentAssociates($charID, $limit = 10) { 
    global $pdo; 
    
    // 1. Get Recent Kills
    $url = "https://zkillboard.com/api/characterID/$charID/kills/";
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_USERAGENT, USER_AGENT);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); 
    curl_setopt($ch, CURLOPT_ENCODING, ""); 
    $json = curl_exec($ch);
    curl_close($ch);
    
    $rawKills = json_decode($json, true);
    if (!$rawKills || isset($rawKills['error']) || !is_array($rawKills)) return [];

    // 2. Process Associates
    $kills = array_slice($rawKills, 0, $limit);
    $mh = curl_multi_init();
    $curl_handles = [];
    
    foreach ($kills as $k) {
        if (!isset($k['zkb']['hash'])) continue;
        $id = $k['killmail_id'];
        $hash = $k['zkb']['hash'];
        $esiUrl = "https://esi.evetech.net/latest/killmails/$id/$hash/";
        
        $c = curl_init($esiUrl);
        curl_setopt($c, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($c, CURLOPT_USERAGENT, USER_AGENT);
        curl_setopt($c, CURLOPT_SSL_VERIFYPEER, false);
        curl_multi_add_handle($mh, $c);
        $curl_handles[] = $c;
    }

    $running = null;
    do { curl_multi_exec($mh, $running); } while ($running);

    $tally = []; 
    foreach ($curl_handles as $c) {
        $content = curl_multi_getcontent($c);
        if ($content) {
            $data = json_decode($content, true);
            if (isset($data['attackers'])) {
                $sysID = $data['solar_system_id'];
                foreach ($data['attackers'] as $atkr) {
                    if (!isset($atkr['character_id']) || $atkr['character_id'] == $charID) continue;
                    $aID = $atkr['character_id'];
                    $sID = $atkr['ship_type_id'] ?? 0;
                    if (!isset($tally[$aID])) $tally[$aID] = ['count' => 0, 'ships' => [], 'systems' => []];
                    $tally[$aID]['count']++;
                    if ($sID > 0) {
                        if (!isset($tally[$aID]['ships'][$sID])) $tally[$aID]['ships'][$sID] = 0;
                        $tally[$aID]['ships'][$sID]++;
                    }
                    if ($sysID > 0) {
                        if (!isset($tally[$aID]['systems'][$sysID])) $tally[$aID]['systems'][$sysID] = 0;
                        $tally[$aID]['systems'][$sysID]++;
                    }
                }
            }
        }
        curl_multi_remove_handle($mh, $c);
    }
    curl_multi_close($mh);

    if (empty($tally)) return [];
    uasort($tally, function($a, $b) { return $b['count'] <=> $a['count']; });
    $topAssociates = array_slice($tally, 0, 6, true);

    // 3. Name Resolution (Associates)
    $pilotIDs = array_keys($topAssociates);
    $ch = curl_init("https://esi.evetech.net/latest/universe/names/");
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($pilotIDs));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_USERAGENT, USER_AGENT);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    $pilotNames = json_decode(curl_exec($ch), true);
    curl_close($ch);

    // 4. DB Lookups (Associates Ships/Systems)
    $allShipIDs = [];
    $allSysIDs = [];
    foreach ($topAssociates as $assoc) {
        foreach (array_keys($assoc['ships']) as $sID) $allShipIDs[] = $sID;
        foreach (array_keys($assoc['systems']) as $sysID) $allSysIDs[] = $sysID;
    }
    $allShipIDs = array_values(array_unique($allShipIDs));
    $allSysIDs = array_values(array_unique($allSysIDs));
    
    $shipMap = []; $sysMap = [];
    try {
        if (!empty($allShipIDs)) {
            $placeholders = implode(',', array_fill(0, count($allShipIDs), '?'));
            $stmt = $pdo->prepare("SELECT typeID, typeName FROM invtypes WHERE typeID IN ($placeholders)");
            $stmt->execute($allShipIDs);
            while ($row = $stmt->fetch()) $shipMap[$row['typeID']] = $row['typeName'];
        }
        if (!empty($allSysIDs)) {
            $placeholders = implode(',', array_fill(0, count($allSysIDs), '?'));
            $stmt = $pdo->prepare("SELECT solarSystemID, solarSystemName FROM mapSolarSystems WHERE solarSystemID IN ($placeholders)");
            $stmt->execute($allSysIDs);
            while ($row = $stmt->fetch()) $sysMap[$row['solarSystemID']] = $row['solarSystemName'];
        }
    } catch (Exception $e) { /* Silent fail */ }

    // 5. Build Final List
    $finalList = [];
    foreach ($topAssociates as $id => $data) {
        $pName = "Unknown $id";
        if ($pilotNames) foreach ($pilotNames as $n) if ($n['id'] == $id) { $pName = $n['name']; break; }
        
        arsort($data['ships']);
        $topShips = [];
        foreach (array_slice($data['ships'], 0, 3, true) as $sID => $count) {
            $topShips[] = ['id' => $sID, 'name' => $shipMap[$sID] ?? "Type $sID", 'count' => $count];
        }

        arsort($data['systems']);
        $topSystems = [];
        foreach (array_slice($data['systems'], 0, 3, true) as $sysID => $count) {
            $topSystems[] = ['name' => $sysMap[$sysID] ?? "Sys $sysID", 'count' => $count];
        }
        $finalList[] = ['id' => $id, 'name' => $pName, 'count' => $data['count'], 'top_ships' => $topShips, 'top_systems' => $topSystems];
    }
    return $finalList;
}

// ---------------------------------------------------------
// HELPER: Get Public Bio
// ---------------------------------------------------------
function getPilotBio($charID) {
    $url = "https://esi.evetech.net/latest/characters/$charID/";
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_USERAGENT, USER_AGENT);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    $data = json_decode(curl_exec($ch), true);
    curl_close($ch);
    
    if (!$data || isset($data['error'])) return null;

    $ids = [];
    if (isset($data['corporation_id'])) $ids[] = $data['corporation_id'];
    if (isset($data['alliance_id'])) $ids[] = $data['alliance_id'];
    
    $namesMap = [];
    if (!empty($ids)) {
        $ch = curl_init("https://esi.evetech.net/latest/universe/names/");
        curl_setopt($ch, CURLOPT_POST, 1);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($ids));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_USERAGENT, USER_AGENT);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        $namesJson = curl_exec($ch);
        curl_close($ch);
        
        $nameData = json_decode($namesJson, true);
        if ($nameData) foreach ($nameData as $n) $namesMap[$n['id']] = $n['name'];
    }

    return [
        'birthday' => $data['birthday'],
        'sec_status' => $data['security_status'] ?? 0.0,
        'corp_name' => $namesMap[$data['corporation_id']] ?? 'Unknown Corp',
        'ally_name' => $namesMap[$data['alliance_id'] ?? 0] ?? null 
    ];
}

// ---------------------------------------------------------
// MAIN PROCESS
// ---------------------------------------------------------
$results = ['status' => 'error', 'message' => 'Invalid Request'];

try {
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $inputJSON = file_get_contents('php://input');
        $data = json_decode($inputJSON, true);

        if (isset($data['search_tag'])) {
          $results = ['status' => 'success', 'data' => searchTags($data['search_tag'])];
          echo json_encode($results);
          exit; // Stop here, don't run the rest of the pilot logic
        }

        if (!isset($data['character_name'])) throw new Exception('Missing character_name');
        $charName = trim($data['character_name']);
        $dscanText = $data['dscan_data'] ?? ''; 

        $pdo->beginTransaction();

        // 1. Identity Check
        $stmt = $pdo->prepare("SELECT character_id, zkill_stats_json, last_updated FROM intel_characters WHERE character_name = :name LIMIT 1");
        $stmt->execute(['name' => $charName]);
        $row = $stmt->fetch();
        
        $charID = $row['character_id'] ?? null;
        $zkillStats = $row['zkill_stats_json'] ?? null;

        if (!$charID) {
            $ch = curl_init("https://esi.evetech.net/latest/universe/ids/?datasource=tranquility&language=en");
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([$charName]));
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_USERAGENT, USER_AGENT);
            $esiData = json_decode(curl_exec($ch), true);
            curl_close($ch);
            
            if (isset($esiData['characters'][0]['id'])) {
                $charID = $esiData['characters'][0]['id'];
                $pdo->prepare("INSERT INTO intel_characters (character_id, character_name, last_updated) VALUES (:id, :name, NOW())")
                    ->execute(['id' => $charID, 'name' => $charName]);
            } else {
                throw new Exception("Pilot not found via ESI.");
            }
        }

        // 2. Fetch Stats (With Force Update logic)
        $decodedStats = json_decode($zkillStats, true);
        $forceUpdate = false;
        
        // Update if missing, empty, or old
        if (!$decodedStats || !isset($decodedStats['topAllTime']) || (isset($row['last_updated']) && strtotime($row['last_updated']) < strtotime('-24 hours'))) {
            $forceUpdate = true;
        }

        if ($forceUpdate) {
            $ch = curl_init("https://zkillboard.com/api/stats/characterID/$charID/");
            curl_setopt($ch, CURLOPT_USERAGENT, USER_AGENT);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_ENCODING, ""); 
            $rawStats = curl_exec($ch);
            
            if ($rawStats) {
                $zkillStats = $rawStats;
                $decodedStats = json_decode($rawStats, true); // Update local var
                $pdo->prepare("UPDATE intel_characters SET zkill_stats_json = :stats, last_updated = NOW() WHERE character_id = :id")
                    ->execute(['stats' => $zkillStats, 'id' => $charID]);
            }
        }
        $threatData = $decodedStats;

        // 3. Process Tags (Hidden for brevity, logic remains same)
        $potentialAlts = []; $sightingsCount = 0;
        if (!empty($dscanText)) {
             $lines = explode("\n", $dscanText);
             foreach ($lines as $line) {
                $line = trim($line);
                if (empty($line)) continue;

                $parts = explode("\t", $line);
                $count = count($parts);

                // Initialize variables
                $iconID = 0;
                $rawTagString = '';
                $shipTypeName = ''; // We need this to find the real ID

                // =========================================================
                // 1. SMART PARSING LOGIC (Handles Standard D-Scan & Your Ingest Tool)
                // =========================================================
                if ($count >= 4) {
                    // Standard D-Scan: [0]Icon [1]Name [2]Type [3]Dist
                    $iconID = intval($parts[0]);
                    $rawTagString = trim($parts[1]);
                    $shipTypeName = trim($parts[2]); 
                } 
                elseif ($count === 3) {
                    // AMBIGUOUS: Could be Custom (0/Tag/Ship) OR Standard (Name/Type/Dist)
                    if (is_numeric(trim($parts[0]))) {
                        // Your Ingest Tool: [0]0 [1]Tag [2]Ship
                        $iconID = intval($parts[0]);
                        $rawTagString = trim($parts[1]);
                        $shipTypeName = trim($parts[2]);
                    } else {
                        // Standard w/o Icon: [0]Name [1]Type [2]Dist
                        $rawTagString = trim($parts[0]);
                        $shipTypeName = trim($parts[1]);
                    }
                } 
                elseif ($count == 2) {
                     // Legacy fallback: [0]Icon [1]Tag
                     $iconID = intval($parts[0]);
                     $rawTagString = trim($parts[1]);
                }

                if (empty($rawTagString)) continue;

                // =========================================================
                // 2. RESOLVE SHIP TYPE ID (The Missing Piece)
                // =========================================================
                $finalShipTypeID = 0;
                if (!empty($shipTypeName)) {
                    // Look up "Wolf" or "Kikimora" to get the real ID (e.g. 11371)
                    try {
                        $shipStmt = $pdo->prepare("SELECT typeID FROM invTypes WHERE typeName = :name LIMIT 1");
                        $shipStmt->execute(['name' => $shipTypeName]);
                        $shipRow = $shipStmt->fetch();
                        if ($shipRow) {
                            $finalShipTypeID = $shipRow['typeID'];
                        }
                    } catch (Exception $e) { /* Ignore lookup errors */ }
                }

                // If lookup failed, fallback to iconID if it looks like a valid TypeID (rare but possible)
                if ($finalShipTypeID == 0 && $iconID > 0) {
                     $finalShipTypeID = $iconID;
                }

                // =========================================================
                // 3. RESOLVE SOLAR SYSTEM (Your Existing Logic)
                // =========================================================
                $solarSystemID = null;
                if (isset($data['solar_system']) && !empty($data['solar_system'])) {
                    $sysName = trim($data['solar_system']);
                    $sysStmt = $pdo->prepare("SELECT solarSystemID FROM mapsolarsystems WHERE solarSystemName = :name LIMIT 1");
                    $sysStmt->execute(['name' => $sysName]);
                    $sysRow = $sysStmt->fetch();
                    if ($sysRow) $solarSystemID = $sysRow['solarSystemID'];
                }

                // =========================================================
                // 4. PROCESS TAGS (Your Existing Logic)
                // =========================================================
                $tagData = analyzeTag($rawTagString);
                $findTag = $pdo->prepare("SELECT tag_id, tag_clean FROM intel_tags WHERE tag_string = :tag");
                $findTag->execute(['tag' => $tagData['full']]);
                $tagRow = $findTag->fetch();
                $tagID = $tagRow['tag_id'] ?? null;

                if (!$tagID) {
                    $pdo->prepare("INSERT INTO intel_tags (tag_string, tag_clean) VALUES (:full, :clean)")
                        ->execute(['full' => $tagData['full'], 'clean' => $tagData['clean']]);
                    $tagID = $pdo->lastInsertId();
                }

                // =========================================================
                // 5. INSERT SIGHTING (Updated to use finalShipTypeID)
                // =========================================================
                $pdo->prepare("INSERT INTO intel_sightings (character_id, tag_id, ship_type_id, solar_system_id, sighting_date, source) VALUES (:cid, :tid, :ship, :sys, NOW(), 'dscan')")
                    ->execute([
                        'cid' => $charID, 
                        'tid' => $tagID, 
                        'ship' => $finalShipTypeID, // <--- CRITICAL FIX: Uses the resolved ID (11371), not the Icon (0)
                        'sys' => $solarSystemID
                    ]);

                $sightingsCount++;

                // =========================================================
                // 6. CHECK FOR ALTS (Your Existing Logic)
                // =========================================================
                $sql = "SELECT DISTINCT c.character_name, c.character_id, t.tag_string 
                        FROM intel_sightings s
                        JOIN intel_characters c ON s.character_id = c.character_id
                        JOIN intel_tags t ON s.tag_id = t.tag_id
                        WHERE (t.tag_string = :full OR (t.tag_clean = :clean AND t.tag_clean != ''))
                        AND c.character_id != :self_id LIMIT 5";
                $altCheck = $pdo->prepare($sql);
                $altCheck->execute(['full' => $tagData['full'], 'clean' => $tagData['clean'], 'self_id' => $charID]);
                while ($alt = $altCheck->fetch()) {
                    $potentialAlts[$alt['character_id']] = ['name' => $alt['character_name'], 'matched_tag' => $alt['tag_string'], 'probability' => ($alt['tag_string'] === $tagData['full']) ? 100 : 75];
                }
             }
        }
        $pdo->commit();

        // 4. Get Associates
        $associates = getRecentAssociates($charID);

        // 5. EXTRACT THREAT DATA (The Fix)
        $topShipsRaw = [];
        $topSystemsRaw = [];
        $allShipIDs = [];
        $allSysIDs = [];

        if (isset($threatData['topAllTime']) && is_array($threatData['topAllTime'])) {
            foreach ($threatData['topAllTime'] as $group) {
                // FIX: Lowercase type check to be safe
                $type = strtolower($group['type'] ?? ''); 

                // FIX: Check for 'ship' and use 'shipTypeID'
                if ($type === 'ship') {
                    foreach (array_slice($group['data'], 0, 5) as $item) {
                        $sID = $item['shipTypeID'] ?? $item['id'] ?? 0; // <--- The Fix
                        if ($sID > 0) {
                            $topShipsRaw[] = ['id' => $sID, 'count' => $item['kills'] ?? 0];
                            $allShipIDs[] = $sID;
                        }
                    }
                }
                
                // FIX: Check for 'system' and use 'solarSystemID'
                if ($type === 'system' || $type === 'solarsystem') {
                    foreach (array_slice($group['data'], 0, 5) as $item) {
                        $sysID = $item['solarSystemID'] ?? $item['id'] ?? 0; // <--- The Fix
                        if ($sysID > 0) {
                            $topSystemsRaw[] = ['id' => $sysID, 'count' => $item['kills'] ?? 0];
                            $allSysIDs[] = $sysID;
                        }
                    }
                }
            }
        }

        // DB Resolve Names (Threat Data)
        $shipNames = [];
        $sysNames = [];

        if (!empty($allShipIDs)) {
            $allShipIDs = array_values(array_unique($allShipIDs));
            $placeholders = implode(',', array_fill(0, count($allShipIDs), '?'));
            $stmt = $pdo->prepare("SELECT typeID, typeName FROM invtypes WHERE typeID IN ($placeholders)");
            $stmt->execute($allShipIDs);
            while ($row = $stmt->fetch()) $shipNames[$row['typeID']] = $row['typeName'];
        }

        if (!empty($allSysIDs)) {
            $allSysIDs = array_values(array_unique($allSysIDs));
            $placeholders = implode(',', array_fill(0, count($allSysIDs), '?'));
            $stmt = $pdo->prepare("SELECT solarSystemID, solarSystemName FROM mapSolarSystems WHERE solarSystemID IN ($placeholders)");
            $stmt->execute($allSysIDs);
            while ($row = $stmt->fetch()) $sysNames[$row['solarSystemID']] = $row['solarSystemName'];
        }

        // Formatted Arrays
        $topShips = [];
        foreach ($topShipsRaw as $item) {
            $topShips[] = [
                'name'  => $shipNames[$item['id']] ?? "Unknown Ship",
                'count' => $item['count'],
                'id'    => $item['id']
            ];
        }

        $topSystems = [];
        foreach ($topSystemsRaw as $item) {
            $topSystems[] = [
                'name'  => $sysNames[$item['id']] ?? "Unknown System",
                'count' => $item['count']
            ];
        }

        $bio = getPilotBio($charID);
        // Age Calc
        $ageStr = "Unknown";
        if ($bio && isset($bio['birthday'])) {
            $birthDate = new DateTime($bio['birthday']);
            $now = new DateTime();
            $interval = $now->diff($birthDate);
            $ageStr = $interval->y . "y " . $interval->m . "m";
        }

        // ... existing code ...
        // --- STEP 4: GET ASSOCIATES ---
        $associates = getRecentAssociates($charID);

        // =========================================================
        // NEW: GET PILOT'S OWN TAGS
        // =========================================================
        $myTags = [];
        try {
            // 1. Fetch raw rows (Remove DISTINCT to satisfy Strict SQL)
            $tagStmt = $pdo->prepare("
                SELECT t.tag_string 
                FROM intel_sightings s
                JOIN intel_tags t ON s.tag_id = t.tag_id
                WHERE s.character_id = :id
                ORDER BY s.sighting_id DESC 
                LIMIT 20
            ");
            
            $tagStmt->execute(['id' => $charID]);
            
            while ($row = $tagStmt->fetch()) {
                // 2. Add to array
                $myTags[] = $row['tag_string'];
            }
            
            // 3. Remove duplicates in PHP (Safe and Strict-Compliant)
            $myTags = array_values(array_unique($myTags));
            // Optional: Slice to top 10 after deduping
            $myTags = array_slice($myTags, 0, 10);

        } catch (Exception $e) { 
            // Optional: If you want to see errors in the future, log them
            // error_log($e->getMessage());
        }
        // =========================================================

        // --- RESPONSE ---
        $threatData = json_decode($zkillStats, true);
        $bio = getPilotBio($charID);

        $results = [
            'status' => 'success',
            'data' => [
                'character' => $charName,
                'id' => $charID,
                'sightings' => $sightingsCount,
                'tags' => $myTags,
                'bio' => [
                    'age' => $ageStr,
                    'sec_status' => number_format($bio['sec_status'] ?? 0, 1),
                    'corp' => $bio['corp_name'] ?? 'Unknown',
                    'alliance' => $bio['ally_name'] ?? ''
                ],
                'threat' => [
                    'dangerRatio' => $threatData['dangerRatio'] ?? 0,
                    'gangRatio' => $threatData['gangRatio'] ?? 0,
                    'shipsDestroyed' => $threatData['shipsDestroyed'] ?? 0,
                    'shipsLost' => $threatData['shipsLost'] ?? 0,
                    'iskDestroyed' => $threatData['iskDestroyed'] ?? 0,
                    'iskLost' => $threatData['iskLost'] ?? 0,
                    'soloKills' => $threatData['soloKills'] ?? 0,
                    'top_ships' => $topShips,
                    'top_systems' => $topSystems
                ],
                'alts' => array_values($potentialAlts),
                'associates' => $associates
            ]
        ];
    }
} catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    $results = ['status' => 'error', 'message' => $e->getMessage()];
}

echo json_encode($results);
?>
