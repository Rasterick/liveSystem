<?php
// 1. Force errors to show to screen
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

echo "<h1>Database UTF-8 Connection Test</h1>";

// 2. Load Config using your specific relative path
// Using __DIR__ makes it relative to this file's location
$configPath = __DIR__ . '/../../config/db1.php';

echo "Attempting to load config from: <code>" . $configPath . "</code><br>";

if (file_exists($configPath)) {
    echo "<span style='color:green'>✔ Config file found.</span><br>";
    require_once $configPath;
} else {
    die("<span style='color:red'>✘ ERROR: Config file not found! Check directory structure.</span>");
}

// 3. Re-Verify Variables were loaded
if (!isset($host) || !isset($user) || !isset($pass)) {
    die("<span style='color:red'>✘ ERROR: Variables \$host, \$user, or \$pass are missing from config file.</span>");
}

// 4. Force the DSN with Charset (The Critical Fix)
if (!isset($charset)) $charset = 'utf8mb4'; // Default to utf8mb4 if missing
$dsn = "mysql:host=$host;dbname=$db;charset=$charset";

echo "Target DSN: <code>$dsn</code><br><br>";

try {
    // 5. Connect
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];
    $pdo = new PDO($dsn, $user, $pass, $options);
    echo "<span style='color:green; font-weight:bold;'>✔ Database Connection Successful!</span><br><br>";

    // 6. Check Server Encoding Settings
    echo "<strong>Active Connection Settings:</strong><br>";
    $stmt = $pdo->query("SHOW VARIABLES LIKE 'character_set_%'");
    echo "<ul style='font-family:monospace'>";
    while ($row = $stmt->fetch()) {
        // Highlight the important ones
        $val = $row['Value'];
        if ($row['Variable_name'] == 'character_set_client' || $row['Variable_name'] == 'character_set_connection') {
             if ($val != 'utf8mb4') $val = "<span style='color:red'>$val (BAD)</span>";
             else $val = "<span style='color:green'>$val (GOOD)</span>";
        }
        echo "<li>" . $row['Variable_name'] . " = " . $val . "</li>";
    }
    echo "</ul>";

    // 7. READ DATA: Check the last 5 tags
    echo "<h3>Recent Entries in `intel_tags`:</h3>";
    $tags = $pdo->query("SELECT * FROM intel_tags ORDER BY tag_id DESC LIMIT 5");
    
    if ($tags->rowCount() > 0) {
        echo "<table border='1' cellpadding='5' style='border-collapse:collapse;'>";
        echo "<tr style='background:#eee'><th>ID</th><th>Raw String (UTF-8)</th><th>Clean String</th></tr>";
        while ($row = $tags->fetch()) {
            echo "<tr>";
            echo "<td>" . $row['tag_id'] . "</td>";
            // We verify if symbols render correctly here
            echo "<td style='font-size:1.2em'>" . htmlspecialchars($row['tag_string']) . "</td>";
            echo "<td>" . htmlspecialchars($row['tag_clean']) . "</td>";
            echo "</tr>";
        }
        echo "</table>";
    } else {
        echo "<em>Table is empty.</em>";
    }

} catch (PDOException $e) {
    echo "<div style='border:1px solid red; padding:10px; background:#ffeeee'>";
    echo "<strong>CONNECTION FAILED:</strong> " . $e->getMessage();
    echo "</div>";
}
?>
