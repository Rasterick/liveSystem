<?php
// /var/www/html/api/process_pilots.php
header('Content-Type: application/json');

require_once 'db_connect.php'; 

$userAgent = 'GrimIntel/1.0 (admin@grim-horizon.org)';

$input = json_decode(file_get_contents('php://input'), true);
if (!$input || empty($input['names'])) { echo json_encode([]); exit; }

// 1. Clean Input
$namesRaw = explode("\n", $input['names']);
$namesClean = array_values(array_unique(array_filter(array_map('trim', $namesRaw))));
// Note: We removed the hard slice here to let the JS warning handle the UX, 
// but we still limit processing to prevent timeout if you prefer.
$namesClean = array_slice($namesClean, 0, 105); 

// 2. Get IDs (ESI)
$ch = curl_init('https://esi.evetech.net/latest/universe/ids/?datasource=tranquility');
curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($namesClean));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
$esiResult = json_decode(curl_exec($ch), true);
curl_close($ch);

if (!isset($esiResult['characters'])) { echo json_encode(['error' => 'No characters found']); exit; }

// 3. Get Stats (zKill - Parallel)
$mh = curl_multi_init();
$curl_handles = [];

foreach ($esiResult['characters'] as $char) {
    $id = $char['id'];
    $ch = curl_init("https://zkillboard.com/api/stats/characterID/$id/");
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_USERAGENT, $userAgent);
    $curl_handles[$id] = $ch;
    curl_multi_add_handle($mh, $ch);
}

$running = null;
do { curl_multi_exec($mh, $running); } while ($running);

// 4. Processing
$rawStats = [];
$shipIds = [];
$systemIds = [];
$orgIdsToResolve = []; 

foreach ($curl_handles as $id => $ch) {
    $json = curl_multi_getcontent($ch);
    $data = json_decode($json, true);
    $rawStats[$id] = $data;

    if ($data) {
        if (isset($data['topAllTime'])) {
            foreach($data['topAllTime'] as $group) {
                if ($group['type'] === 'ship') {
                    foreach (array_slice($group['data'], 0, 5) as $row) $shipIds[] = $row['shipTypeID'];
                }
                if ($group['type'] === 'system') {
                    foreach (array_slice($group['data'], 0, 5) as $row) $systemIds[] = $row['solarSystemID'];
                }
            }
        }
        if (isset($data['info']['corporation_id'])) $orgIdsToResolve[] = $data['info']['corporation_id'];
        if (isset($data['info']['alliance_id'])) $orgIdsToResolve[] = $data['info']['alliance_id'];
    }
    curl_multi_remove_handle($mh, $ch);
    curl_close($ch);
}
curl_multi_close($mh);

// 4a. SQL Lookup
$shipNames = [];
if (!empty($shipIds)) {
    $ids = implode(',', array_unique($shipIds));
    $stmt = $pdo->query("SELECT typeID, typeName FROM invtypes WHERE typeID IN ($ids)");
    while ($row = $stmt->fetch()) $shipNames[$row['typeID']] = $row['typeName'];
}

$systemNames = [];
if (!empty($systemIds)) {
    $ids = implode(',', array_unique($systemIds));
    $stmt = $pdo->query("SELECT solarSystemID, solarSystemName FROM mapSolarSystems WHERE solarSystemID IN ($ids)");
    while ($row = $stmt->fetch()) $systemNames[$row['solarSystemID']] = $row['solarSystemName'];
}

// 4b. ESI Lookup
$orgNames = [];
if (!empty($orgIdsToResolve)) {
    $uniqueOrgIds = array_values(array_unique($orgIdsToResolve));
    $ch = curl_init('https://esi.evetech.net/latest/universe/names/?datasource=tranquility');
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($uniqueOrgIds));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    $orgResult = json_decode(curl_exec($ch), true);
    curl_close($ch);
    
    if (is_array($orgResult)) {
        foreach ($orgResult as $item) {
            $orgNames[$item['id']] = $item['name'];
        }
    }
}

// 5. Build Response
$finalData = [];
foreach ($esiResult['characters'] as $char) {
    $id = $char['id'];
    $data = $rawStats[$id] ?? null;
    if (!$data) continue;

    $topShips = [];
    $topSystems = [];
    $corpTicker = '';
    $allianceTicker = '';
    
    $corpId = $data['info']['corporation_id'] ?? 0;
    $allianceId = $data['info']['alliance_id'] ?? 0;
    
    // Resolve Names
    $corpName = $orgNames[$corpId] ?? 'Unknown';
    
    // LOGIC FIX: Handle No Alliance
    if ($allianceId == 0) {
        $allianceName = '-';
        $allianceTicker = '';
    } else {
        $allianceName = $orgNames[$allianceId] ?? 'Unknown';
    }

    if(isset($data['topLists'])) {
        foreach($data['topLists'] as $list) {
            if ($list['type'] === 'corporation') {
                foreach($list['values'] as $val) {
                    if (isset($val['corporationID']) && $val['corporationID'] == $corpId) {
                        $corpTicker = $val['cticker'] ?? '';
                    }
                }
            }
            if ($list['type'] === 'alliance') {
                 foreach($list['values'] as $val) {
                    if (isset($val['allianceID']) && $val['allianceID'] == $allianceId) {
                        $allianceTicker = $val['aticker'] ?? '';
                    }
                }
            }
        }
    }

    if(isset($data['topAllTime'])) {
        foreach($data['topAllTime'] as $group) {
            if ($group['type'] === 'ship') {
                foreach (array_slice($group['data'], 0, 5) as $r) {
                    $topShips[] = ['name' => $shipNames[$r['shipTypeID']] ?? $r['shipTypeID'], 'count' => $r['kills']];
                }
            }
            if ($group['type'] === 'system') {
                foreach (array_slice($group['data'], 0, 5) as $r) {
                    $topSystems[] = ['name' => $systemNames[$r['solarSystemID']] ?? $r['solarSystemID'], 'count' => $r['kills']];
                }
            }
        }
    }

    $kills = $data['shipsDestroyed'] ?? 0;
    $losses = $data['shipsLost'] ?? 0;
    $iskDestroyed = $data['iskDestroyed'] ?? 0;
    $iskLost = $data['iskLost'] ?? 0;
    $iskRatio = ($iskLost > 0) ? round($iskDestroyed / $iskLost, 1) : (($iskDestroyed > 0) ? "∞" : "0.0");
    $birthday = $data['info']['birthday'] ?? '';

    $finalData[] = [
        'id' => $id,
        'name' => $char['name'],
        'birthday' => $birthday,
        'portrait' => "https://images.evetech.net/characters/$id/portrait?size=128",
        'dangerRatio' => $data['dangerRatio'] ?? 0,
        'kills' => $kills,
        'losses' => $losses,
        'kd' => ($losses > 0) ? round($kills/$losses, 2) : $kills,
        'soloKills' => $data['soloKills'] ?? 0,
        'soloRatio' => isset($data['soloKills']) ? round(($data['soloKills'] / max($kills, 1)) * 100, 1) : 0,
        'iskDestroyed' => $iskDestroyed,
        'iskLost' => $iskLost,
        'iskRatio' => $iskRatio,
        'secStatus' => number_format($data['info']['secStatus'] ?? 0, 1),
        'topShips' => $topShips,
        'topSystems' => $topSystems,
        'corpId' => $corpId,
        'corpName' => $corpName,
        'corpTicker' => $corpTicker,
        'allianceId' => $allianceId,
        'allianceName' => $allianceName, // Will be '-' if empty
        'allianceTicker' => $allianceTicker
    ];
}

usort($finalData, function($a, $b) { return $b['dangerRatio'] <=> $a['dangerRatio']; });
echo json_encode($finalData);
?>
