<?php
// Force errors to show on screen
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

echo "<h3>Database Connection Test</h3>";

// 1. Try to load your config file
// IMPORTANT: Adjust this path if your config is in /var/www/config/db.php
$configPath = '../config/db.php'; 

if (!file_exists($configPath)) {
    // Try looking in the parent directory just in case
    $configPath = '../../config/db.php';
    if (!file_exists($configPath)) {
        die("<span style='color:red'>ERROR: Could not find db.php config file!</span>");
    }
}

echo "Loading config from: $configPath<br>";
require_once $configPath;

// 2. Output the DSN (Masking the password)
echo "DSN String: " . $dsn . "<br>";

// 3. Attempt Connection
try {
    $pdo = new PDO($dsn, $user, $pass, $options);
    echo "<span style='color:green'><strong>CONNECTION SUCCESSFUL!</strong></span><br><br>";
    
    // 4. Verify Charset Settings
    echo "<strong>Server Charset Info:</strong><br>";
    $stmt = $pdo->query("SHOW VARIABLES LIKE 'character_set_%'");
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        echo $row['Variable_name'] . ": " . $row['Value'] . "<br>";
    }

} catch (PDOException $e) {
    echo "<span style='color:red'><strong>CONNECTION FAILED:</strong></span><br>";
    echo "Error Message: " . $e->getMessage();
}
?>
