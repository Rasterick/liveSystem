<?php
// --- Configuration and Headers ---
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$DRAWING_AREA = 720; // Fixed drawing area for padding

// --- Input Validation ---
if (!isset($_GET['systemName']) || empty($_GET['systemName'])) {
    http_response_code(400);
    echo json_encode(["error" => "System name is required."]);
    exit;
}


$systemName = trim($_GET['systemName']);

//$systemName = filter_var(trim($_GET['systemName']), FILTER_SANITIZE_STRING);
// Replace with no filter, then apply htmlspecialchars() later
// Or, if using filter_var for sanitization, remove the constant entirely.
//$input = filter_var($input, FILTER_UNSAFE_RAW); // Use the default, then manually sanitize
// OR, simply cast it to string if no complex sanitization is needed
//$input = (string)$input;

// --- Database Connection ---

// Copy this block into get_system_data.php, replacing your existing mysqli connection code

require_once 'db_connect.php'; // This defines $pdo


// --- 2. SQL Query: Get System ID and Security ---
$sql_id_lookup = "SELECT solarSystemID, security FROM mapSolarSystems WHERE solarSystemName = ?";
$stmt_id = $pdo->prepare($sql_id_lookup);
$stmt_id->execute([$systemName]);

$systemInfo = $stmt_id->fetch();

if (!$systemInfo) {
    http_response_code(404);
    echo json_encode(["error" => "System not found."]);
    exit;
}

$systemID = $systemInfo['solarSystemID'];
$securityStatus = $systemInfo['security'];

// --- In api/get_system_data.php, after step 2 (getting $systemID) ---




// --- 4. Dynamic Scaling Calculation (Required for correct map visibility) ---
//$R_max = sqrt($maxRadiusSq);




// --------------------------------------------------------------------
$wormholeDetails = [
    'class' => null,
    'effect' => 'No Effect',
    'static1_code' => null, // Generic code (low, c4, etc.)
    'static2_code' => null, // Generic code
    'static1_name' => null, // Specific name (e.g., U210, K162)
    'static2_name' => null, // Specific name
    'ship_limit' => 'Unknown',
];

// CRITICAL FIX: Initialize $whInfo to prevent 'Undefined variable' Notice if no row is found
$whInfo = false;

// 1. Fetch Generic Codes (class, effect, static1/2) from wormholesystems table
$sql_wh = "SELECT class, effect, static1, static2 FROM wormholesystems WHERE solarsystemid = ?";
$stmt_wh = $pdo->prepare($sql_wh);

$stmt_wh->execute([$systemID]);

$whInfo = $stmt_wh->fetch();

if ($whInfo) {
    // System is a known Wormhole
    $wormholeDetails['class'] = $whInfo['class'];
    $wormholeDetails['effect'] = $whInfo['effect'];
    $wormholeDetails['static1_code'] = $whInfo['static1'];
    $wormholeDetails['static2_code'] = $whInfo['static2'];

    // Simplified Ship Limit (Based on standard class rules)
    $wormholeDetails['ship_limit'] = ($whInfo['class'] > 3) ? 'Battleship' : 'Battlecruiser';

    // 2. Fetch Specific Wormhole Type Names (U210, B274, etc.)
    // We join systemstatic (to get the TypeID of the static) and invtypes (to get the name of the static)
  $sql_static_names = "SELECT
                        T.typeName,
                        D.valueFloat AS targetClass
                     FROM
                        systemstatic S
                     JOIN
                        invtypes T ON S.typeId = T.typeID
                     JOIN
                        dgmtypeattributes D ON S.typeId = D.typeID
                     WHERE
                        S.solarsystemId = ? AND D.attributeID = 1381
                     ORDER BY
                        targetClass ASC"; // Sort by C4, then C5, etc.

$stmt_static = $pdo->prepare($sql_static_names);

$stmt_static->execute([$systemID]);

// PDO: fetchAll(PDO::FETCH_ASSOC) returns an array of all rows found
$rows = $stmt_static->fetchAll(PDO::FETCH_ASSOC);

$static_names = [];
foreach ($rows as $row) {
    $static_names[] = $row['typeName'];
}

// In PDO, you don't need $stmt->close();
// You can just let it go out of scope or set it to null:
$stmt_static = null;
    // 3. Initial Assignment: Assume the sorted SQL names correspond to the database order (static1, static2)
$wormholeDetails['static1_name'] = isset($static_names[0]) ? $static_names[0] : null;
$wormholeDetails['static2_name'] = isset($static_names[1]) ? $static_names[1] : null;

// --- CRITICAL ROBUST SWAP CHECK ---
// We convert the generic codes (e.g., 'high', 'C4') to an integer value.
// We expect static1 to generally be 'lower' or the same as static2.

$code1_val = strtolower($wormholeDetails['static1_code']);
$code2_val = strtolower($wormholeDetails['static2_code']);

// Use a simple alphabetical/numeric comparison: 'c4' < 'c5', 'low' < 'high'.
// If the second code is numerically or alphabetically less than the first, the codes are reversed.
// Example: If static1_code is 'c5' and static2_code is 'c4', we swap the names.

if ($code2_val < $code1_val) {
    // This is the trigger: The database listed the static codes in reverse order (e.g., C5 then C4).
    // Our SQL result is sorted correctly (C4 name then C5 name). We must swap the names to match the generic codes.

    $temp_name = $wormholeDetails['static1_name'];
    $wormholeDetails['static1_name'] = $wormholeDetails['static2_name'];
    $wormholeDetails['static2_name'] = $temp_name;

    // Add a quick check for systems that use non-numeric codes like 'high' and 'low'
} elseif ($code1_val === 'high' && $code2_val === 'low') {
    // Specific check for high/low static reversal
    $temp_name = $wormholeDetails['static1_name'];
    $wormholeDetails['static1_name'] = $wormholeDetails['static2_name'];
    $wormholeDetails['static2_name'] = $temp_name;
}
}

// --- 3. Complex Query Execution (The Main Data Fetch) ---
// Joins systems, denormalize (celestials), and invtypes (type names)
$sql = "SELECT
            B.itemID, B.itemName, B.typeID, C.typeName,
            B.x, B.y, B.z, B.orbitID,B.groupID
        FROM
            mapSolarSystems A
        JOIN
            mapdenormalize B ON A.solarSystemID = B.solarSystemID
        JOIN
            invtypes C ON B.typeID = C.typeID
        WHERE
            A.solarSystemID = ?
        ORDER BY
            B.celestialIndex, B.orbitIndex";

$stmt = $pdo->prepare($sql);
$stmt->execute([$systemID]);


$planets = [];
$starData = null;
$stargates = [];
$maxRadiusSq = 0; // Initialize for dynamic scaling

// --- Replacing the while loop (Around line 180) ---

while ($row = $stmt->fetch()) {
    $itemType = $row['typeName'];
    $itemGroupID = $row['groupID'];

    // Calculate R_max dynamically (required for proper scaling)
    $r_sq = $row['x']**2 + $row['y']**2 + $row['z']**2;
    if ($r_sq > $maxRadiusSq) $maxRadiusSq = $r_sq;

    $celestial = [
        'id' => $row['itemID'],
        'name' => $row['itemName'],
        'type' => $row['typeName'],
        'type_id' => $row['typeID'],
        'position_m' => ['x' => (float)$row['x'], 'y' => (float)$row['y'], 'z' => (float)$row['z']],
        'moons' => []
    ];

    // CRITICAL: Prioritize GroupID for unambiguous classification.
    // 1. Stargates (GroupID 10) - MUST BE CHECKED EARLY
    if ($itemGroupID == 10) {
        $stargates[] = $celestial;
    }
    // 2. Planets (GroupID 7)
    elseif ($itemGroupID == 7) {
        $planets[$celestial['id']] = $celestial;
    }
    // 3. Moons (GroupID 8)
    elseif ($itemGroupID == 8) {
        $parentPlanetID = $row['orbitID'];
        if (isset($planets[$parentPlanetID])) {
            unset($celestial['moons']);
            $planets[$parentPlanetID]['moons'][] = $celestial;
        }
    }
    // 4. Star (GroupID 6 or Check for 'Star' type)
    elseif (strpos($itemType, 'Star') !== false || $itemGroupID == 6) {
        $starData = $celestial;
    }
    // All other objects (stations, asteroid belts, etc.) are ignored.
}




// --- 4. Dynamic Scaling Calculation (Required for correct map visibility) ---
$R_max = sqrt($maxRadiusSq);

$DRAWING_AREA = 720;
$FALLBACK_R_MAX = 100000000000; // 100 billion meters (a safe arbitrary orbit)

// CRITICAL FIX: Only calculate the scale factor once, using a safe R_max.
$R_max_safe = ($R_max > 0) ? $R_max : $FALLBACK_R_MAX;

// Calculate the scale factor: S = Drawing Area / (2 * R_max_safe)
$dynamicScaleFactor = ($DRAWING_AREA / (2 * $R_max_safe));

// --- NEW: Fetch markers for this specific system ---
// We place this here because $systemID is already defined and verified above.
$sql_markers = "SELECT id, markerType, label, color, x_pos, y_pos FROM map_markers WHERE solarSystemID = ?";
$stmt_markers = $pdo->prepare($sql_markers);
$stmt_markers->execute([$systemID]);
$markers = $stmt_markers->fetchAll(PDO::FETCH_ASSOC);


// --- 5. Final Aggregation (Guaranteed Origin Fix) ---
if (!$starData) {
    // If no star was found, force the origin fix to prevent JS crash
    $starData = [
        'name' => $systemName . ' Sun (Forced)',
        'type' => 'Star (G0 V Class)',
        'position_m' => ['x' => 0.0, 'y' => 0.0, 'z' => 0.0],
    ];
} else {
    // Ensure the found star is also centered at (0,0,0) for map drawing
    $starData['position_m'] = ['x' => 0.0, 'y' => 0.0, 'z' => 0.0];
}

$systemType = $whInfo ? 'Wormhole (C' . $wormholeDetails['class'] . ')' : 'K-Space';

if (strpos($systemName, 'J') === 0 && !$whInfo) {
    $systemType = 'Wormhole (J-Space, Unknown Class)';
}

// Build the final static string: Code Name / Code Name
$static1_display = $wormholeDetails['static1_code'];
if ($wormholeDetails['static1_name']) {
    $static1_display .= ' ' . $wormholeDetails['static1_name'];
}

$static2_display = $wormholeDetails['static2_code'];
if ($wormholeDetails['static2_name']) {
    $static2_display .= ' ' . $wormholeDetails['static2_name'];
}

// Concatenate the two statics, removing extra slashes/spaces if only one exists
$statics_combined = trim($static1_display . ' / ' . $static2_display, ' / ');

$finalAggregatedData = [
    'system_id' => $systemID,
    'system_name' => $systemName,
    'security_status' => $securityStatus,
    'dynamic_scale_factor' => (float)$dynamicScaleFactor,
    'star' => $starData,
    'planets' => array_values($planets),
    'stargates' => $stargates,
    'system_type' => $systemType,
    'wh_effect' => $wormholeDetails['effect'],
    'wh_statics' => $statics_combined,
    'ship_limit' => $wormholeDetails['ship_limit'],
    'security_status' => (float)$securityStatus,
    'markers' => $markers
];

// --- 6. Send JSON Response ---
echo json_encode($finalAggregatedData);
?>
