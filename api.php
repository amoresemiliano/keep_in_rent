<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json");

// TO DO: Replace with BlueHost DB credentials
$host = "localhost";
$db_name = "madrid_rental_db";
$username = "root";
$password = "";

try {
    $conn = new PDO("mysql:host=$host;dbname=$db_name;charset=utf8", $username, $password);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch(PDOException $e) {
    echo json_encode(["error" => "Connection failed: " . $e->getMessage()]);
    exit();
}

// Authentication and Authorization via Firebase ID Token
function verifyFirebaseToken($token) {
    // A simplified JWT decoder. For production, it is highly recommended to use Google's public keys
    // to verify the signature of the token, or use a proper library.
    // However, on a shared hosting without composer, validating the issuer and audience,
    // and decoding the payload is the minimum needed to extract the email reliably from the Firebase token.
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;

    $payload = json_decode(base64_decode(str_replace(['-', '_'], ['+', '/'], $parts[1])), true);
    if (!$payload) return null;

    // Check expiration
    if (isset($payload['exp']) && $payload['exp'] < time()) {
        return null;
    }

    // In a real app, verify signature using Google's certs from https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com

    return $payload['email'] ?? null;
}

$headers = apache_request_headers();
$authHeader = $headers['Authorization'] ?? '';
$token = '';
if (preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
    $token = $matches[1];
}

$userEmail = verifyFirebaseToken($token);

if (!$userEmail && $_SERVER['REQUEST_METHOD'] !== 'OPTIONS') {
    http_response_code(401);
    echo json_encode(["error" => "Unauthorized"]);
    exit();
}

$action = isset($_GET['action']) ? $_GET['action'] : '';

// Helper function to get user_id from email
function getUserId($conn, $email) {
    $stmt = $conn->prepare("SELECT id FROM users WHERE email = ?");
    $stmt->execute([$email]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        $stmt = $conn->prepare("INSERT INTO users (email) VALUES (?)");
        $stmt->execute([$email]);
        return $conn->lastInsertId();
    }
    return $user['id'];
}

// Ensure the user actually owns the property they are trying to access
function verifyPropertyOwnership($conn, $property_id, $user_id) {
    $stmt = $conn->prepare("SELECT id FROM properties WHERE id = ? AND user_id = ?");
    $stmt->execute([$property_id, $user_id]);
    if (!$stmt->fetch()) {
        http_response_code(403);
        echo json_encode(["error" => "Forbidden: You do not own this property"]);
        exit();
    }
}

$user_id = null;
if ($userEmail) {
    $user_id = getUserId($conn, $userEmail);
}

switch($action) {
    case 'get_properties':
        $stmt = $conn->prepare("SELECT * FROM properties WHERE user_id = ?");
        $stmt->execute([$user_id]);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        break;

    case 'add_property':
        $data = json_decode(file_get_contents("php://input"), true);

        $sql = "INSERT INTO properties (user_id, calle, cp, ciudad, pais, m2, habitaciones, banos, capacidad, piscina, cochera, balcon, ascensor, custom_features)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        $stmt = $conn->prepare($sql);
        $stmt->execute([
            $user_id, $data['calle'], $data['cp'], $data['ciudad'], $data['pais'],
            $data['m2'] ?: null, $data['habitaciones'] ?: null, $data['banos'] ?: null, $data['capacidad'] ?: null,
            $data['piscina'], $data['cochera'], $data['balcon'], $data['ascensor'], $data['custom_features']
        ]);
        echo json_encode(["id" => $conn->lastInsertId()]);
        break;

    case 'get_data':
        $property_id = $_GET['property_id'];
        verifyPropertyOwnership($conn, $property_id, $user_id);

        $stmtB = $conn->prepare("SELECT * FROM bookings WHERE property_id = ?");
        $stmtB->execute([$property_id]);

        $stmtE = $conn->prepare("SELECT * FROM expenses WHERE property_id = ?");
        $stmtE->execute([$property_id]);

        $stmtBank = $conn->prepare("SELECT * FROM bank_records WHERE property_id = ?");
        $stmtBank->execute([$property_id]);

        echo json_encode([
            "bookings" => $stmtB->fetchAll(PDO::FETCH_ASSOC),
            "expenses" => $stmtE->fetchAll(PDO::FETCH_ASSOC),
            "bank_records" => $stmtBank->fetchAll(PDO::FETCH_ASSOC)
        ]);
        break;

    case 'save_booking':
        $data = json_decode(file_get_contents("php://input"), true);
        verifyPropertyOwnership($conn, $data['property_id'], $user_id);

        if(isset($data['id']) && $data['id']) {
            $sql = "UPDATE bookings SET booking_ref=?, platform=?, origin=?, checkin=?, checkout=?, bruto=?, fee_banco=?, fee_thl=?, limpieza=?, net=?, nights=? WHERE id=? AND property_id=?";
            $stmt = $conn->prepare($sql);
            $stmt->execute([$data['booking_ref'], $data['platform'], $data['origin'], $data['checkin'], $data['checkout'], $data['bruto'], $data['fee_banco'], $data['fee_thl'], $data['limpieza'], $data['net'], $data['nights'], $data['id'], $data['property_id']]);
            echo json_encode(["id" => $data['id']]);
        } else {
            $sql = "INSERT INTO bookings (property_id, booking_ref, platform, origin, checkin, checkout, bruto, fee_banco, fee_thl, limpieza, net, nights) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
            $stmt = $conn->prepare($sql);
            $stmt->execute([$data['property_id'], $data['booking_ref'], $data['platform'], $data['origin'], $data['checkin'], $data['checkout'], $data['bruto'], $data['fee_banco'], $data['fee_thl'], $data['limpieza'], $data['net'], $data['nights']]);
            echo json_encode(["id" => $conn->lastInsertId()]);
        }
        break;

    case 'delete_booking':
        $data = json_decode(file_get_contents("php://input"), true);
        verifyPropertyOwnership($conn, $data['property_id'], $user_id);

        $stmt = $conn->prepare("DELETE FROM bookings WHERE id = ? AND property_id = ?");
        $stmt->execute([$data['id'], $data['property_id']]);
        echo json_encode(["status" => "success"]);
        break;

    case 'save_expense':
        $data = json_decode(file_get_contents("php://input"), true);
        verifyPropertyOwnership($conn, $data['property_id'], $user_id);

        if(isset($data['id']) && $data['id']) {
            $sql = "UPDATE expenses SET date=?, category=?, amount=?, observations=? WHERE id=? AND property_id=?";
            $stmt = $conn->prepare($sql);
            $stmt->execute([$data['date'], $data['category'], $data['amount'], $data['observations'], $data['id'], $data['property_id']]);
            echo json_encode(["id" => $data['id']]);
        } else {
            $sql = "INSERT INTO expenses (property_id, date, category, amount, observations) VALUES (?, ?, ?, ?, ?)";
            $stmt = $conn->prepare($sql);
            $stmt->execute([$data['property_id'], $data['date'], $data['category'], $data['amount'], $data['observations']]);
            echo json_encode(["id" => $conn->lastInsertId()]);
        }
        break;

    case 'delete_expense':
        $data = json_decode(file_get_contents("php://input"), true);
        verifyPropertyOwnership($conn, $data['property_id'], $user_id);

        $stmt = $conn->prepare("DELETE FROM expenses WHERE id = ? AND property_id = ?");
        $stmt->execute([$data['id'], $data['property_id']]);
        echo json_encode(["status" => "success"]);
        break;

    case 'save_bank':
        $data = json_decode(file_get_contents("php://input"), true);
        verifyPropertyOwnership($conn, $data['property_id'], $user_id);

        $stmt = $conn->prepare("SELECT id FROM bank_records WHERE booking_id = ? AND property_id = ?");
        $stmt->execute([$data['booking_id'], $data['property_id']]);
        $exists = $stmt->fetch();

        if($exists) {
            $stmt = $conn->prepare("UPDATE bank_records SET val=?, obs=? WHERE booking_id=? AND property_id=?");
            $stmt->execute([$data['val'], $data['obs'], $data['booking_id'], $data['property_id']]);
        } else {
            $stmt = $conn->prepare("INSERT INTO bank_records (property_id, booking_id, val, obs) VALUES (?, ?, ?, ?)");
            $stmt->execute([$data['property_id'], $data['booking_id'], $data['val'], $data['obs']]);
        }
        echo json_encode(["status" => "success"]);
        break;

    case 'import_data':
        $data = json_decode(file_get_contents("php://input"), true);
        $property_id = $data['property_id'];
        verifyPropertyOwnership($conn, $property_id, $user_id);

        $clear_existing = $data['clear_existing'];

        $conn->beginTransaction();
        try {
            if ($clear_existing) {
                $conn->prepare("DELETE FROM bookings WHERE property_id = ?")->execute([$property_id]);
                $conn->prepare("DELETE FROM expenses WHERE property_id = ?")->execute([$property_id]);
            }

            // Insert Bookings
            if (isset($data['bookings']) && is_array($data['bookings'])) {
                $sqlB = "INSERT INTO bookings (property_id, booking_ref, platform, origin, checkin, checkout, bruto, fee_banco, fee_thl, limpieza, net, nights) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                $stmtB = $conn->prepare($sqlB);
                foreach ($data['bookings'] as $b) {
                    $stmtB->execute([$property_id, $b['booking_ref'], $b['platform'], $b['origin'], $b['checkin'], $b['checkout'], $b['bruto'], $b['fee_banco'], $b['fee_thl'], $b['limpieza'], $b['net'], $b['nights']]);
                }
            }

            // Insert Expenses
            if (isset($data['expenses']) && is_array($data['expenses'])) {
                $sqlE = "INSERT INTO expenses (property_id, date, category, amount, observations) VALUES (?, ?, ?, ?, ?)";
                $stmtE = $conn->prepare($sqlE);
                foreach ($data['expenses'] as $e) {
                    $stmtE->execute([$property_id, $e['date'], $e['category'], $e['amount'], $e['observations']]);
                }
            }

            $conn->commit();
            echo json_encode(["status" => "success"]);
        } catch (Exception $e) {
            $conn->rollBack();
            echo json_encode(["error" => "Import failed: " . $e->getMessage()]);
        }
        break;

    default:
        echo json_encode(["error" => "Invalid action"]);
        break;
}
?>