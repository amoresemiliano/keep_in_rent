<?php
// Simple .env parser and JSON output
header('Content-Type: application/json');

$envPath = __DIR__ . '/.env';
$config = [
    "apiKey" => "",
    "authDomain" => "",
    "projectId" => "",
    "storageBucket" => "",
    "messagingSenderId" => "",
    "appId" => "",
    "measurementId" => ""
];

if (file_exists($envPath)) {
    $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) continue;

        $parts = explode('=', $line, 2);
        if (count($parts) !== 2) continue; // Skip malformed lines

        $name = trim($parts[0]);
        $value = trim($parts[1]);

        // Remove surrounding quotes if present
        $value = trim($value, '"\'');

        if ($name === 'FIREBASE_API_KEY' || $name === 'VITE_FIREBASE_API_KEY') $config['apiKey'] = $value;
        if ($name === 'FIREBASE_AUTH_DOMAIN' || $name === 'VITE_FIREBASE_AUTH_DOMAIN') $config['authDomain'] = $value;
        if ($name === 'FIREBASE_PROJECT_ID' || $name === 'VITE_FIREBASE_PROJECT_ID') $config['projectId'] = $value;
        if ($name === 'FIREBASE_STORAGE_BUCKET' || $name === 'VITE_FIREBASE_STORAGE_BUCKET') $config['storageBucket'] = $value;
        if ($name === 'FIREBASE_MESSAGING_SENDER_ID' || $name === 'VITE_FIREBASE_MESSAGING_SENDER_ID') $config['messagingSenderId'] = $value;
        if ($name === 'FIREBASE_APP_ID' || $name === 'VITE_FIREBASE_APP_ID') $config['appId'] = $value;
        if ($name === 'FIREBASE_MEASUREMENT_ID' || $name === 'VITE_FIREBASE_MEASUREMENT_ID') $config['measurementId'] = $value;
    }
} else {
    // Fallback logic could go here or return error
}

echo json_encode($config);
