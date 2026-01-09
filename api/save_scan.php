<?php

ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// ... rest of your save_scan.php code
// header('Content-Type: application/json'); // Move this after error reporting
// ...

require_once __DIR__ . '/../../config/db.php';

header('Content-Type: application/json');

// 1. Get the posted data
$inputJSON = file_get_contents('php://input');
$input = json_decode($inputJSON, TRUE); // Convert JSON to an array

if (empty($input)) { // Or check for a specific key if not sending raw JSON
    echo json_encode(['success' => false, 'message' => 'No data received.']);
    exit;
}

$scanDataString = $inputJSON; // Store the raw JSON string


$dsn = "mysql:host=$host;dbname=$db;charset=$charset";
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];
try {
    $pdo = new PDO($dsn, $user, $pass, $options);
} catch (\PDOException $e) {
    error_log("DB Connection Error: " . $e->getMessage());
    echo json_encode(['success' => false, 'message' => 'Database connection error.']);
    exit;
}

// 3. Generate Unique ID (and ensure it's unique)
$uniqueId = null;
$isUnique = false;
$attempts = 0;
do {
    $uniqueId = bin2hex(random_bytes(5)); // 10 hex characters
    $stmt = $pdo->prepare("SELECT id FROM shared_scans WHERE id = ?");
    $stmt->execute([$uniqueId]);
    if ($stmt->fetchColumn() === false) {
        $isUnique = true;
    }
    $attempts++;
    if ($attempts > 10) { // Safety break
        error_log("Failed to generate unique ID after multiple attempts.");
        echo json_encode(['success' => false, 'message' => 'Could not generate a unique ID.']);
        exit;
    }
} while (!$isUnique);


// In save_scan.php

// ... (your existing code before the INSERT try...catch) ...

// 4. Store in Database
try {
    $stmt = $pdo->prepare("INSERT INTO shared_scans (id, data_payload, created_at) VALUES (?, ?, NOW())");
    $stmt->execute([$uniqueId, $inputJSON]);
} catch (\PDOException $e) {
    // Log to server error log if possible (though you can't access it easily)
    error_log("DB Insert Error (save_scan.php): " . $e->getMessage());

    // *** MODIFICATION FOR DEBUGGING: Send detailed error back to client ***
    http_response_code(500); // Still indicate server error
    echo json_encode([
        'success' => false,
        'message' => 'Error saving data to database. See details.', // Generic message
       // 'debug_pdo_exception' => $e->getMessage(), // <<< ADD THIS LINE
       // 'debug_pdo_code' => $e->getCode()          // <<< ADD THIS LINE (optional)
    ]);
    exit;
}

// ... (rest of your script, like constructing shareable URL and success response) ...

// 5. Construct Shareable URL
// Option A: Same page, loads data via query param
$shareableUrl = "https://intel.grim-horizon.org/dscan.html?scan_id=" . $uniqueId;
// Option B: Dedicated viewer page
// $shareableUrl = "https://gpi-services.co.uk/view_scan.php?id=" . $uniqueId;

// 6. Return Response
echo json_encode(['success' => true, 'url' => $shareableUrl, 'id' => $uniqueId]);

?>
