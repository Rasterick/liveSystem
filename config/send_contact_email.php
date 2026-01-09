<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

require __DIR__ . '/../vendor/autoload.php';

// Function to parse .env file
function parseEnv($filePath) {
    if (!file_exists($filePath)) {
        throw new Exception(".env file not found");
    }

    $lines = file($filePath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) {
            continue;
        }

        list($name, $value) = explode('=', $line, 2);
        $name = trim($name);
        $value = trim($value);

        if (!array_key_exists($name, $_SERVER) && !array_key_exists($name, $_ENV)) {
            putenv(sprintf('%s=%s', $name, $value));
            $_ENV[$name] = $value;
            $_SERVER[$name] = $value;
        }
    }
}

try {

    parseEnv(__DIR__ . '/../../.env');
} catch (Exception $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['status' => 'error', 'message' => 'Could not load environment variables.']);
    exit;
}


if ($_SERVER["REQUEST_METHOD"] == "POST") {
    // Sanitize and validate input
    $name = htmlspecialchars(trim($_POST["name"]));
    $email = filter_var(trim($_POST["email"]), FILTER_SANITIZE_EMAIL);
    $message = htmlspecialchars(trim($_POST["message"]));

    if (empty($name) || !filter_var($email, FILTER_VALIDATE_EMAIL) || empty($message)) {
        http_response_code(400);
        echo "Please fill out all fields and provide a valid email address.";
        exit;
    }

    $mail = new PHPMailer(true);

    try {
        //Server settings
	$mail->SMTPDebug = SMTP::DEBUG_SERVER;
        $mail->isSMTP();
        $mail->Host       = getenv('MAIL_HOST');  // Set the SMTP server to send through
        $mail->SMTPAuth   = true;
        $mail->Username   = getenv('MAIL_USERNAME'); // SMTP username
        $mail->Password   = getenv('MAIL_PASSWORD');        // SMTP password
        //$mail->SMTPSecure = getenv('MAIL_ENCRYPTION'); // MailHog does not use encryption
        //$mail->SMTPSecure = PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
	
	$mail->SMTPSecure = PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS; // <--- Use SMTPS constant
	$mail->Port       = 465;
	//$mail->Port       = getenv('MAIL_PORT');

        //Recipients
        $mail->setFrom('peteabonriff@gmail.com', 'Mailer');
        $mail->addAddress('abonriff@gmail.com', 'Abon Riff');     // Add a recipient

        // Content
        $mail->isHTML(true);
        $mail->Subject = 'New Contact Form Submission from ' . $name;
        $mail->Body    = "You have received a new message from your website contact form.<br><br>".
                         "Here are the details:<br>".
                         "<b>Name:</b> {$name}<br>".
                         "<b>Email:</b> {$email}<br>".
                         "<b>Message:</b><br>{$message}";
        $mail->AltBody = "You have received a new message from your website contact form.\n\n".
                         "Here are the details:\n".
                         "Name: {$name}\n".
                         "Email: {$email}\n".
                         "Message:\n{$message}";

        $mail->send();
        header('Content-Type: application/json');
        echo json_encode(['status' => 'success', 'message' => 'Message has been sent successfully!']);
    } catch (Exception $e) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['status' => 'error', 'message' => "Message could not be sent. Mailer Error: {$mail->ErrorInfo}"]);
    }
} else {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['status' => 'error', 'message' => 'There was a problem with your submission, please try again.']);
}
?>
