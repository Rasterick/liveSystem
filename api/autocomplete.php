<?php

// Note: No characters or whitespace should exist before this opening tag.

// --- Configuration and Headers ---
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once 'db_connect.php'; // This defines $pdo
// ---------------------------------------------------


// --- Input Handling ---
$searchTerm = isset($_GET['query']) ? trim($_GET['query']) : '';

if (empty($searchTerm)) {
    echo json_encode([]); // Return empty array if no search term
    exit;
}

// Prepare the parameter for a "starts with" search
$searchParam = $searchTerm . '%';

// --- SQL Query Definition (Case-Insensitive Search) ---
$sql = "SELECT
            solarSystemName
        FROM
            mapSolarSystems
        WHERE
            LOWER(solarSystemName) LIKE LOWER(?)
        ORDER BY
            solarSystemName ASC
        LIMIT
            10";

try {
$stmt = $pdo->prepare($sql);
    // The screenshot shows the parameter name is 'query', so ensure your PHP is set to look for 'query'
    // This is assuming you applied Fix Option A from the previous turn:
    // $searchTerm = isset($_GET['query']) ? trim($_GET['query']) : '';
    $stmt->execute([$searchParam]);

    // Fetch all results as a simple array of strings: ["Amamake", "Amane", ...]
    $systemNames = $stmt->fetchAll(PDO::FETCH_COLUMN);

    // Return the results as JSON
    echo json_encode($systemNames);
    exit;

} catch (\PDOException $e) {
    // Handle database query error
    http_response_code(500);
    echo json_encode(['error' => 'Error fetching system data.']);
    // Log the full error to the server logs
    error_log("Autocomplete DB Error: " . $e->getMessage());
    exit;
}

// Note: No closing PHP tag (?>) to prevent accidental trailing whitespace.
