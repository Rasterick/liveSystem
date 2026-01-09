<?php
header('Content-Type: application/json');
require_once 'db_connect.php';

$data = json_decode(file_get_contents('php://input'), true);

if (!isset($data['id'])) {
    echo json_encode(['error' => 'No ID provided']);
    exit;
}

try {
    $stmt = $pdo->prepare("DELETE FROM map_markers WHERE id = ?");
    $stmt->execute([$data['id']]);
    echo json_encode(['status' => 'success']);
} catch (PDOException $e) {
    echo json_encode(['error' => $e->getMessage()]);
}
