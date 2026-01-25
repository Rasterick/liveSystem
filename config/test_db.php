<?php
// 1. Database Connection Configuration

require_once __DIR__ . '/../../config/db.php';

$dsn = "mysql:host=$host;dbname=$db;charset=$charset";
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {
     $pdo = new PDO($dsn, $user, $pass, $options);
     echo "<h1>✅ Success!</h1>";
     echo "<p>Connected successfully to the MySQL container using the hostname **'$host'**.</p>";
     
     // Optional: Run a test query
     $stmt = $pdo->query('SELECT VERSION()');
     $mysql_version = $stmt->fetchColumn();
     echo "<p>MySQL Server Version: **" . $mysql_version . "**</p>";

} catch (\PDOException $e) {
     echo "<h1>❌ Connection Failed!</h1>";
     // Display a detailed error message for debugging
     echo "<p>Error: " . $e->getMessage() . "</p>";
     // Note: In a production environment, never display $e->getMessage() to the end user.
}
?>
