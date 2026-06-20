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

function base64UrlDecode($data) {
    $remainder = strlen($data) % 4;
    if ($remainder) {
        $padlen = 4 - $remainder;
        $data .= str_repeat('=', $padlen);
    }
    return base64_decode(strtr($data, '-_', '+/'));
}

// Authentication and Authorization via Firebase ID Token
function verifyFirebaseToken($token) {
    if (!$token) return null;

    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;

    $headerStr = base64UrlDecode($parts[0]);
    $payloadStr = base64UrlDecode($parts[1]);
    $signature = base64UrlDecode($parts[2]);

    $header = json_decode($headerStr, true);
    $payload = json_decode($payloadStr, true);

    if (!$header || !$payload) return null;

    if (isset($payload['exp']) && $payload['exp'] < time()) return null;
    $projectId = "keep-in-rent";
    if (!isset($payload['aud']) || $payload['aud'] !== $projectId) return null;
    if (!isset($payload['iss']) || $payload['iss'] !== 'https://securetoken.google.com/' . $projectId) return null;

    $cacheFile = sys_get_temp_dir() . '/firebase_keys.json';
    $keysJson = '';

    if (file_exists($cacheFile) && (time() - filemtime($cacheFile) < 3600)) {
        $keysJson = file_get_contents($cacheFile);
    } else {
        $keysJson = @file_get_contents('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
        if ($keysJson) {
            file_put_contents($cacheFile, $keysJson);
        }
    }

    if (!$keysJson) return null;
    $keys = json_decode($keysJson, true);

    $kid = $header['kid'] ?? null;
    if (!$kid || !isset($keys[$kid])) return null;

    $publicKey = $keys[$kid];
    $dataToVerify = $parts[0] . '.' . $parts[1];

    $valid = openssl_verify($dataToVerify, $signature, $publicKey, OPENSSL_ALGO_SHA256);
    if ($valid !== 1) return null;

    return $payload['email'] ?? null;
}

$headers = apache_request_headers();
$authHeader = $headers['Authorization'] ?? '';
$token = '';
if (preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
    $token = $matches[1];
}

$userEmail = verifyFirebaseToken($token);

if ($_SERVER['REQUEST_METHOD'] !== 'OPTIONS') {
    if (!$userEmail) {
        http_response_code(401);
        echo json_encode(["error" => "Unauthorized"]);
        exit();
    }
}

$action = isset($_GET['action']) ? $_GET['action'] : '';

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

function verifyPropertyOwnership($conn, $property_id, $user_id) {
    global $userEmail;
    if ($userEmail === 'vegendigital@gmail.com') return;

    $stmt = $conn->prepare("
        SELECT id FROM properties WHERE id = ? AND user_id = ?
        UNION
        SELECT property_id AS id FROM property_users WHERE property_id = ? AND user_id = ?
    ");
    $stmt->execute([$property_id, $user_id, $property_id, $user_id]);
    if (!$stmt->fetch()) {
        http_response_code(403);
        echo json_encode(["error" => "Forbidden: You do not own this property"]);
        exit();
    }
}

function enforceSuperAdmin($email) {
    if ($email !== 'vegendigital@gmail.com') {
        http_response_code(403);
        echo json_encode(["error" => "Forbidden: Super Admin only"]);
        exit();
    }
}

$user_id = null;
if ($userEmail) {
    $user_id = getUserId($conn, $userEmail);
}

switch($action) {
    case 'get_settings':
        $stmt = $conn->query("SELECT setting_key, setting_value FROM global_settings");
        $settings = [];
        while($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $settings[$row['setting_key']] = json_decode($row['setting_value'], true);
        }
        echo json_encode($settings);
        break;

    case 'get_properties':
        if ($userEmail === 'vegendigital@gmail.com') {
            $stmt = $conn->prepare("SELECT p.*, u.email as owner_email FROM properties p JOIN users u ON p.user_id = u.id");
            $stmt->execute();
        } else {
            $stmt = $conn->prepare("
                SELECT p.* FROM properties p WHERE p.user_id = ?
                UNION
                SELECT p.* FROM properties p JOIN property_users pu ON p.id = pu.property_id WHERE pu.user_id = ?
            ");
            $stmt->execute([$user_id, $user_id]);
        }
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        break;

    case 'add_property':
        $data = json_decode(file_get_contents("php://input"), true);

        $sql = "INSERT INTO properties (user_id, calle, cp, ciudad, pais, m2, habitaciones, banos, capacidad, piscina, cochera, balcon, ascensor, custom_features)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        $stmt = $conn->prepare($sql);
        $stmt->execute([
            $user_id, $data['alias'] ?? null, $data['alias'] ?? null, $data['calle'], $data['cp'], $data['ciudad'], $data['pais'],
            $data['m2'] ?: null, $data['habitaciones'] ?: null, $data['banos'] ?: null, $data['capacidad'] ?: null,
            $data['piscina'], $data['cochera'], $data['balcon'], $data['ascensor'], json_encode($data['custom_features'])
        ]);
        echo json_encode(["property_id" => $conn->lastInsertId()]);
        break;

    case 'updateConfig':
        $property_id = $_GET['property_id'];
        verifyPropertyOwnership($conn, $property_id, $user_id);
        $data = json_decode(file_get_contents("php://input"), true);

        $sql = "UPDATE properties SET calle=?, cp=?, ciudad=?, pais=?, m2=?, habitaciones=?, banos=?, capacidad=?, piscina=?, cochera=?, balcon=?, ascensor=?, custom_features=? WHERE id=?";
        $stmt = $conn->prepare($sql);
        $stmt->execute([
            $data['alias'] ?? null, $data['calle'], $data['cp'], $data['ciudad'], $data['pais'],
            $data['m2'] ?: null, $data['habitaciones'] ?: null, $data['banos'] ?: null, $data['capacidad'] ?: null,
            $data['piscina'], $data['cochera'], $data['balcon'], $data['ascensor'], json_encode($data['custom_features']),
            $property_id
        ]);
        echo json_encode(["status" => "success"]);
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

        $stmtP = $conn->prepare("SELECT * FROM properties WHERE id = ?");
        $stmtP->execute([$property_id]);
        $prop = $stmtP->fetch(PDO::FETCH_ASSOC);

        // Map DB columns back to config object expected by frontend
        $config = [];
        if ($prop) {
            $config['alias'] = $prop['alias'];
            $config['calle'] = $prop['calle'];
            $config['ciudad'] = $prop['ciudad'];
            $config['cp'] = $prop['cp'];
            $config['pais'] = $prop['pais'];
            $config['m2'] = $prop['m2'];
            $config['rooms'] = $prop['habitaciones'];
            $config['baths'] = $prop['banos'];
            $config['pax'] = $prop['capacidad'];
            $config['floor'] = $prop['piscina']; // using piscina as floor mapping in front
            $config['elevator'] = $prop['ascensor'];
            $config['customFeatures'] = json_decode($prop['custom_features'], true);
        }

        echo json_encode([
            "bookings" => $stmtB->fetchAll(PDO::FETCH_ASSOC),
            "expenses" => $stmtE->fetchAll(PDO::FETCH_ASSOC),
            "bank_records" => $stmtBank->fetchAll(PDO::FETCH_ASSOC),
            "config" => $config
        ]);
        break;

    case 'save_booking':
        $data = json_decode(file_get_contents("php://input"), true);
        verifyPropertyOwnership($conn, $data['property_id'], $user_id);

        if(isset($data['id']) && $data['id']) {
            $sql = "UPDATE bookings SET booking_ref=?, platform=?, origin=?, checkin=?, checkout=?, bruto=?, fee_banco=?, fee_admin=?, limpieza=?, net=?, nights=?, guest_name=?, guest_phone=?, guest_address=?, adults=?, children=?, comm_canal_pct=?, tax_banco_pct=?, fee_admin_pct=?, tax_banco_val=?, advance_payment=?, advance_date=?, balance_payment=?, balance_date=? WHERE id=? AND property_id=?";
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                $data['booking_ref'], $data['platform'], $data['origin'], $data['checkin'], $data['checkout'],
                $data['bruto'], $data['fee_banco'], $data['fee_admin'], $data['limpieza'], $data['net'], $data['nights'],
                $data['guest_name'] ?? null, $data['guest_phone'] ?? null, $data['guest_address'] ?? null,
                $data['adults'] ?? 1, $data['children'] ?? 0,
                $data['comm_canal_pct'] ?? 15.0, $data['tax_banco_pct'] ?? 3.0, $data['fee_admin_pct'] ?? 20.0, $data['tax_banco_val'] ?? 0.0,
                $data['advance_payment'] ?? 0.0, empty($data['advance_date']) ? null : $data['advance_date'], $data['balance_payment'] ?? 0.0, empty($data['balance_date']) ? null : $data['balance_date'],
                $data['id'], $data['property_id']
            ]);
            echo json_encode(["data" => array_merge($data, ["id" => $data['id']])]);
        } else {
            $sql = "INSERT INTO bookings (property_id, booking_ref, platform, origin, checkin, checkout, bruto, fee_banco, fee_admin, limpieza, net, nights, guest_name, guest_phone, guest_address, adults, children, comm_canal_pct, tax_banco_pct, fee_admin_pct, tax_banco_val, advance_payment, advance_date, balance_payment, balance_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
            $stmt = $conn->prepare($sql);
            $stmt->execute([
                $data['property_id'], $data['booking_ref'], $data['platform'], $data['origin'], $data['checkin'], $data['checkout'],
                $data['bruto'], $data['fee_banco'], $data['fee_admin'], $data['limpieza'], $data['net'], $data['nights'],
                $data['guest_name'] ?? null, $data['guest_phone'] ?? null, $data['guest_address'] ?? null,
                $data['adults'] ?? 1, $data['children'] ?? 0,
                $data['comm_canal_pct'] ?? 15.0, $data['tax_banco_pct'] ?? 3.0, $data['fee_admin_pct'] ?? 20.0, $data['tax_banco_val'] ?? 0.0,
                $data['advance_payment'] ?? 0.0, $data['advance_date'] ?: null, $data['balance_payment'] ?? 0.0, $data['balance_date'] ?: null
            ]);
            echo json_encode(["data" => array_merge($data, ["id" => $conn->lastInsertId()])]);
        }
        break;

    case 'delete_booking':
        $data = json_decode(file_get_contents("php://input"), true);
        verifyPropertyOwnership($conn, $data['property_id'], $user_id);

        $stmt = $conn->prepare("DELETE FROM bookings WHERE id = ? AND property_id = ?");
        $stmt->execute([$data['id'], $data['property_id']]);
        echo json_encode(["status" => "success"]);
        break;

    // --- SUPER ADMIN ACTIONS ---
    case 'admin_get_users':
        enforceSuperAdmin($userEmail);
        $stmt = $conn->query("SELECT id, email FROM users");
        echo json_encode(["users" => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
        break;

    case 'admin_link_property':
        enforceSuperAdmin($userEmail);
        $data = json_decode(file_get_contents("php://input"), true);
        $target_user_id = getUserId($conn, $data['user_email']);
        $prop_id = $data['property_id'];

        $stmt = $conn->prepare("INSERT IGNORE INTO property_users (property_id, user_id, role) VALUES (?, ?, 'editor')");
        $stmt->execute([$prop_id, $target_user_id]);
        echo json_encode(["status" => "success"]);
        break;

    case 'admin_update_settings':
        enforceSuperAdmin($userEmail);
        $data = json_decode(file_get_contents("php://input"), true);
        $key = $data['key'];
        // The front sends an array for categories and platforms, we encode it
        $valArray = array_map('trim', explode(',', $data['val']));
        $val = json_encode($valArray);

        $stmt = $conn->prepare("INSERT INTO global_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?");
        $stmt->execute([$key, $val, $val]);
        echo json_encode(["status" => "success"]);
        break;

    case 'admin_delete_property':
        enforceSuperAdmin($userEmail);
        $data = json_decode(file_get_contents("php://input"), true);
        $stmt = $conn->prepare("DELETE FROM properties WHERE id = ?");
        $stmt->execute([$data['property_id']]);
        echo json_encode(["status" => "success"]);
        break;

    case 'admin_delete_user':
        enforceSuperAdmin($userEmail);
        $data = json_decode(file_get_contents("php://input"), true);
        $target_user_id = $data['user_id'];

        $adminId = getUserId($conn, $userEmail);
        if ($target_user_id == $adminId) {
             http_response_code(400);
             echo json_encode(["error" => "Cannot delete super admin"]);
             exit();
        }

        $stmt = $conn->prepare("DELETE FROM users WHERE id = ?");
        $stmt->execute([$target_user_id]);
        echo json_encode(["status" => "success"]);
        break;

    case 'save_expense':
        $data = json_decode(file_get_contents("php://input"), true);
        verifyPropertyOwnership($conn, $data['property_id'], $user_id);

        if(isset($data['id']) && $data['id']) {
            $sql = "UPDATE expenses SET date=?, category=?, supplier=?, amount=?, observations=? WHERE id=? AND property_id=?";
            $stmt = $conn->prepare($sql);
            $stmt->execute([$data['date'], $data['category'], $data['supplier'] ?? null, $data['amount'], $data['observations'], $data['id'], $data['property_id']]);
            echo json_encode(["data" => array_merge($data, ["id" => $data['id']])]);
        } else {
            $sql = "INSERT INTO expenses (property_id, date, category, supplier, amount, observations) VALUES (?, ?, ?, ?, ?, ?)";
            $stmt = $conn->prepare($sql);
            $stmt->execute([$data['property_id'], $data['date'], $data['category'], $data['supplier'] ?? null, $data['amount'], $data['observations']]);
            echo json_encode(["data" => array_merge($data, ["id" => $conn->lastInsertId()])]);
        }
        break;

    case 'delete_expense':
        $data = json_decode(file_get_contents("php://input"), true);
        verifyPropertyOwnership($conn, $data['property_id'], $user_id);

        $stmt = $conn->prepare("DELETE FROM expenses WHERE id = ? AND property_id = ?");
        $stmt->execute([$data['id'], $data['property_id']]);
        echo json_encode(["status" => "success"]);
        break;

    case 'updateBank':
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

    case 'importData':
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
                $sqlB = "INSERT INTO bookings (property_id, booking_ref, platform, origin, checkin, checkout, bruto, fee_banco, fee_admin, limpieza, net, nights) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                $stmtB = $conn->prepare($sqlB);
                foreach ($data['bookings'] as $b) {
                    $stmtB->execute([$property_id, $b['booking_ref'] ?? '', $b['platform'] ?? '', $b['origin'] ?? '', $b['checkin'], $b['checkout'], $b['bruto'], $b['fee_banco'] ?? 0, $b['fee_admin'] ?? 0, $b['limpieza'] ?? 0, $b['net'], $b['nights']]);
                }
            }

            // Insert Expenses
            if (isset($data['expenses']) && is_array($data['expenses'])) {
                $sqlE = "INSERT INTO expenses (property_id, date, category, supplier, amount, observations) VALUES (?, ?, ?, ?, ?, ?)";
                $stmtE = $conn->prepare($sqlE);
                foreach ($data['expenses'] as $e) {
                    $stmtE->execute([$property_id, $e['date'], $e['category'], $e['supplier'] ?? null, $e['amount'], $e['observations']]);
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
