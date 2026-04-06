<?php
require_once '../includes/db.php';
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$db = getDB();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// GET /api/orders.php?table_id=X  -> get order + items for table
if ($method === 'GET' && isset($_GET['table_id'])) {
    $tableId = (int)$_GET['table_id'];
    $order = $db->prepare("SELECT * FROM orders WHERE table_id = ? ORDER BY id DESC LIMIT 1");
    $order->execute([$tableId]);
    $ord = $order->fetch();
    if (!$ord) { jsonResponse(null); }
    $items = $db->prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id");
    $items->execute([$ord['id']]);
    $ord['items'] = $items->fetchAll();
    jsonResponse($ord);
}

// POST /api/orders.php  body: {table_id} -> create or return existing open order
if ($method === 'POST' && $action === 'open') {
    $d = getInput();
    $tableId = (int)($d['table_id'] ?? 0);
    if (!$tableId) jsonResponse(['error' => 'table_id required'], 400);

    $existing = $db->prepare("SELECT * FROM orders WHERE table_id = ? AND settled = 0 ORDER BY id DESC LIMIT 1");
    $existing->execute([$tableId]);
    $ord = $existing->fetch();
    if (!$ord) {
        $db->prepare("INSERT INTO orders (table_id, settled) VALUES (?,0)")->execute([$tableId]);
        $ordId = $db->lastInsertId();
        $ord = $db->query("SELECT * FROM orders WHERE id = $ordId")->fetch();
    }
    $items = $db->prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id");
    $items->execute([$ord['id']]);
    $ord['items'] = $items->fetchAll();
    jsonResponse($ord, 201);
}

// POST /api/orders.php?action=add_item  body: {order_id, item_name, category, price}
if ($method === 'POST' && $action === 'add_item') {
    $d = getInput();
    $ordId = (int)($d['order_id'] ?? 0);
    $name  = trim($d['item_name'] ?? '');
    $cat   = $d['category'] ?? '';
    $price = (float)($d['price'] ?? 0);

    if (!$ordId)           jsonResponse(['error' => 'order_id required'], 400);
    if ($name === '')      jsonResponse(['error' => 'Item name required'], 400);
    if (!in_array($cat, ['food','beverage'])) jsonResponse(['error' => 'Invalid category'], 400);
    if ($price <= 0)       jsonResponse(['error' => 'Price must be greater than 0'], 400);

    // Check order not settled
    $ord = $db->query("SELECT * FROM orders WHERE id = $ordId")->fetch();
    if (!$ord)             jsonResponse(['error' => 'Order not found'], 404);
    if ($ord['settled'])   jsonResponse(['error' => 'Order is already settled'], 409);

    $db->prepare("INSERT INTO order_items (order_id, item_name, category, price) VALUES (?,?,?,?)")
       ->execute([$ordId, $name, $cat, $price]);
    $itemId = $db->lastInsertId();
    $item = $db->query("SELECT * FROM order_items WHERE id = $itemId")->fetch();
    jsonResponse($item, 201);
}

// DELETE /api/orders.php?action=remove_item&item_id=X
if ($method === 'DELETE' && $action === 'remove_item') {
    $itemId = (int)($_GET['item_id'] ?? 0);
    if (!$itemId) jsonResponse(['error' => 'item_id required'], 400);
    // check not settled
    $item = $db->query("SELECT oi.*, o.settled FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.id=$itemId")->fetch();
    if (!$item)           jsonResponse(['error' => 'Item not found'], 404);
    if ($item['settled']) jsonResponse(['error' => 'Order is settled'], 409);
    $db->prepare("DELETE FROM order_items WHERE id = ?")->execute([$itemId]);
    jsonResponse(['success' => true]);
}

// POST ?action=checkout  body: {order_id}
if ($method === 'POST' && $action === 'checkout') {
    $d = getInput();
    $ordId = (int)($d['order_id'] ?? 0);
    if (!$ordId) jsonResponse(['error' => 'order_id required'], 400);

    $ord = $db->query("SELECT * FROM orders WHERE id = $ordId")->fetch();
    if (!$ord)           jsonResponse(['error' => 'Order not found'], 404);
    if ($ord['settled']) jsonResponse(['error' => 'Already settled'], 409);

    $db->prepare("UPDATE orders SET settled=1, settled_at=NOW() WHERE id=?")->execute([$ordId]);
    $db->prepare("UPDATE tables SET status='dirty' WHERE id=?")->execute([$ord['table_id']]);
    jsonResponse(['success' => true]);
}

// POST ?action=transfer  body: {order_id, target_table_id}
if ($method === 'POST' && $action === 'transfer') {
    $d = getInput();
    $ordId    = (int)($d['order_id'] ?? 0);
    $targetId = (int)($d['target_table_id'] ?? 0);
    if (!$ordId || !$targetId) jsonResponse(['error' => 'order_id and target_table_id required'], 400);

    $target = $db->query("SELECT * FROM tables WHERE id = $targetId")->fetch();
    if (!$target)                          jsonResponse(['error' => 'Target table not found'], 404);
    if ($target['status'] !== 'available') jsonResponse(['error' => 'Target Table Occupied'], 409);

    $ord = $db->query("SELECT * FROM orders WHERE id = $ordId")->fetch();
    if (!$ord)           jsonResponse(['error' => 'Order not found'], 404);
    if ($ord['settled']) jsonResponse(['error' => 'Order already settled'], 409);

    // Move order to target table
    $srcId = $ord['table_id'];
    $db->prepare("UPDATE orders SET table_id=? WHERE id=?")->execute([$targetId, $ordId]);
    $db->prepare("UPDATE tables SET status='occupied' WHERE id=?")->execute([$targetId]);
    $db->prepare("UPDATE tables SET status='available' WHERE id=?")->execute([$srcId]);
    jsonResponse(['success' => true]);
}
