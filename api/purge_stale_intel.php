<?php
// purge_stale_intel.php
include 'db_connect.php'; // Your PDO connection
$data = json_decode(file_get_contents('php://input'), true);

if (isset($data['systemID'])) {
    // Define which types are volatile (can be deleted)
    // Add all your site/wormhole icon names here
    $volatileTypes = ['wormhole', 'combat site', 'relic site', 'data site', 'ore site', 'gas site', 'bubbled wormhole'];
    
    $inQuery = implode(',', array_fill(0, count($volatileTypes), '?'));

    // SQL: Delete if type is volatile AND older than 24 hours
    $sql = "DELETE FROM map_markers 
            WHERE solarSystemID = ? 
            AND markerType IN ($inQuery) 
            AND created_at < NOW() - INTERVAL 24 HOUR";

    $stmt = $pdo->prepare($sql);
    
    // Merge systemID with the volatile types for the prepared statement
    $params = array_merge([$data['systemID']], $volatileTypes);
    $stmt->execute($params);

    echo json_encode([
        'status' => 'success', 
        'deleted_count' => $stmt->rowCount()
    ]);
}
?>
