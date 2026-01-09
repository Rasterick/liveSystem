// ... above the POST block ...
use PHPMailer\PHPMailer\SMTP; 
// ...

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    // ... input validation ...

    $mail = new PHPMailer(true);

    try {
        // --- FORCE DEBUG OUTPUT TO STDOUT (DOCKER LOGS) ---
        $mail->SMTPDebug = SMTP::DEBUG_SERVER; 
        $mail->Debugoutput = function($str, $level) { 
            // Write the debug string to the standard output, which Docker captures.
            error_log('SMTP DEBUG: ' . $str, 4); 
        };
        // ----------------------------------------------------
        
        // --- SMTP CONFIGURATION ---
        $mail->isSMTP(); 
        $mail->Host       = getenv('MAIL_HOST'); // e.g., smtp.gmail.com
        // ... rest of config ...
        
        $mail->send();

        // SUCCESS RESPONSE HERE
        // ...

    } catch (Exception $e) {
        // Log the final PHPMailer error message cleanly
        error_log("PHPMailer Final Error: " . $mail->ErrorInfo, 0); // Write to PHP error log
        
        // CATCH BLOCK RETURNS JSON
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['status' => 'error', 'message' => 'Mailer failed. Check server logs.']);
        exit;
    }
}
