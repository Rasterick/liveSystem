<?php
// api/update_marker.php
header('Content-Type: application/json');
require_once 'db_connect.php';

$data = json_decode(file_get_contents('php://input'), true);

// We need the ID to find the marker and the new X/Y to move it
if (!isset($data['id']) || !isset($data['x']) || !isset($data['y'])) {
    echo json_encode(['error' => 'Missing required data: id, x, or y']);
    exit;
}

try {
    // Standard SQL UPDATE for the coordinates
    $stmt = $pdo->prepare("UPDATE map_markers SET x_pos = ?, y_pos = ? WHERE id = ?");
    $stmt->execute([$data['x'], $data['y'], $data['id']]);
    
    echo json_encode(['status' => 'success', 'message' => 'Marker position updated']);
} catch (PDOException $e) {
    echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
}
