<?php
// api/save_marker.php
header('Content-Type: application/json');

require_once 'db_connect.php'; // This defines $pdo

$data = json_decode(file_get_contents('php://input'), true);

if (!$data || !isset($data['systemID'])) {
    echo json_encode([
        'error' => 'Invalid data provided',
        'received' => $data // This will show you exactly what PHP caught
    ]);
    exit;
}

try {
    $sql = "INSERT INTO map_markers (solarSystemID, markerType, label, color, x_pos, y_pos) 
            VALUES (?, ?, ?, ?, ?, ?)";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        $data['systemID'],
        $data['type'],
        $data['label'],
        $data['color'],
        $data['x'],
        $data['y']
    ]);

    echo json_encode(['status' => 'success', 'markerID' => $pdo->lastInsertId()]);
} catch (PDOException $e) {
    echo json_encode(['error' => $e->getMessage()]);
}
