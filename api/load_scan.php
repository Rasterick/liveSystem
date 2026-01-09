<?php

// -- Get Database credentials

//require_once __DIR__ . '/config/db_config.php';

require_once __DIR__ . '/../../config/db.php';

// load_scan.php
header('Content-Type: application/json');



$dsn = "mysql:host=$host;dbname=$db;charset=$charset";
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

if (!isset($_GET['id'])) {
    http_response_code(400); // Bad Request
    echo json_encode(['success' => false, 'message' => 'Scan ID not provided.']);
    exit;
}

$scanId = $_GET['id'];

// Basic validation for scanId (adjust as needed based on your ID format)
if (!ctype_alnum($scanId) || strlen($scanId) > 16) { // Example: Alphanumeric, max 16 chars
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid Scan ID format.']);
    exit;
}

try {
    $pdo = new PDO($dsn, $user, $pass, $options);

    $stmt = $pdo->prepare("SELECT data_payload FROM shared_scans WHERE id = ?");
    $stmt->execute([$scanId]);
    $data_payload_string = $stmt->fetchColumn();

    if ($data_payload_string) {
        // The data_payload is already a JSON string.
        // We send it back, and the client will parse it.
        echo json_encode(['success' => true, 'data_payload' => $data_payload_string]);
    } else {
        http_response_code(404); // Not Found
        echo json_encode(['success' => false, 'message' => 'Scan ID not found.']);
    }
} catch (\PDOException $e) {
    http_response_code(500); // Internal Server Error
    error_log("DB Fetch Error (load_scan.php ID: ".$scanId."): " . $e->getMessage());
    echo json_encode(['success' => false, 'message' => 'Error fetching scan data from database. Please try again later.']);
}
?>
