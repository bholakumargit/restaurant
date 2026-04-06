<?php
require_once '../includes/db.php';
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$db = getDB();
$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int)$_GET['id'] : null;

if ($method === 'GET') {
    $rows = $db->query("SELECT * FROM tables ORDER BY table_number")->fetchAll();
    jsonResponse($rows);
}

if ($method === 'POST') {
    $d = getInput();
    $num   = (int)($d['table_number'] ?? 0);
    $cap   = (int)($d['capacity'] ?? 0);
    $floor = trim($d['floor_zone'] ?? '');
    $status = $d['status'] ?? 'available';

    if ($num < 1)          jsonResponse(['error' => 'Invalid table number'], 400);
    if ($cap < 1)          jsonResponse(['error' => 'Invalid capacity'], 400);
    if ($floor === '')     jsonResponse(['error' => 'Floor/zone required'], 400);
    if (!in_array($status, ['available','occupied','dirty'])) jsonResponse(['error' => 'Invalid status'], 400);

    $dup = $db->prepare("SELECT id FROM tables WHERE table_number = ?");
    $dup->execute([$num]);
    if ($dup->fetch()) jsonResponse(['error' => 'Table number already exists'], 409);

    $stmt = $db->prepare("INSERT INTO tables (table_number, capacity, floor_zone, status) VALUES (?,?,?,?)");
    $stmt->execute([$num, $cap, $floor, $status]);
    $newId = $db->lastInsertId();
    $row = $db->query("SELECT * FROM tables WHERE id = $newId")->fetch();
    jsonResponse($row, 201);
}

if ($method === 'PUT' && $id) {
    $d = getInput();
    $num   = (int)($d['table_number'] ?? 0);
    $cap   = (int)($d['capacity'] ?? 0);
    $floor = trim($d['floor_zone'] ?? '');
    $status = $d['status'] ?? 'available';

    if ($num < 1)       jsonResponse(['error' => 'Invalid table number'], 400);
    if ($cap < 1)       jsonResponse(['error' => 'Invalid capacity'], 400);
    if ($floor === '')  jsonResponse(['error' => 'Floor/zone required'], 400);

    $dup = $db->prepare("SELECT id FROM tables WHERE table_number = ? AND id != ?");
    $dup->execute([$num, $id]);
    if ($dup->fetch()) jsonResponse(['error' => 'Table number already exists'], 409);

    $db->prepare("UPDATE tables SET table_number=?,capacity=?,floor_zone=?,status=? WHERE id=?")
       ->execute([$num, $cap, $floor, $status, $id]);
    $row = $db->query("SELECT * FROM tables WHERE id = $id")->fetch();
    jsonResponse($row);
}

if ($method === 'DELETE' && $id) {
    // Check active order
    $active = $db->prepare(
        "SELECT o.id FROM orders o WHERE o.table_id = ? AND o.settled = 0 AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id)"
    );
    $active->execute([$id]);
    if ($active->fetch()) jsonResponse(['error' => 'Cannot delete: table has an active order'], 409);

    $db->prepare("DELETE FROM tables WHERE id = ?")->execute([$id]);
    jsonResponse(['success' => true]);
}
