<?php
require_once '../includes/db.php';
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

$db = getDB();

$tables = $db->query("SELECT * FROM tables")->fetchAll();
$total  = count($tables);
$occ    = count(array_filter($tables, fn($t) => $t['status'] === 'occupied'));
$dirty  = count(array_filter($tables, fn($t) => $t['status'] === 'dirty'));

// Live revenue: sum of items on unsettled orders
$rev = $db->query("
    SELECT SUM(oi.price) as sub,
           SUM(CASE WHEN oi.category='food' THEN oi.price*0.05 ELSE oi.price*0.18 END) as tax,
           SUM(oi.price)*0.10 as svc
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.settled = 0
")->fetch();

$subtotal = (float)($rev['sub'] ?? 0);
$tax      = (float)($rev['tax'] ?? 0);
$svc      = (float)($rev['svc'] ?? 0);
$total_rev = $subtotal + $tax + $svc;

// Top floor
$floorData = $db->query("
    SELECT t.floor_zone, COUNT(*) as cnt
    FROM tables t
    JOIN orders o ON o.table_id = t.id
    JOIN order_items oi ON oi.order_id = o.id
    WHERE o.settled = 0
    GROUP BY t.floor_zone
    ORDER BY cnt DESC
    LIMIT 1
")->fetch();
$topFloor = $floorData ? $floorData['floor_zone'] : 'None';

// Floor occupancy breakdown
$floorStats = $db->query("
    SELECT floor_zone,
           SUM(status='occupied') as occupied,
           COUNT(*) as total
    FROM tables
    GROUP BY floor_zone
")->fetchAll();

// Category revenue split
$catRev = $db->query("
    SELECT category, SUM(price) as total
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.settled = 0
    GROUP BY category
")->fetchAll();
$catMap = [];
foreach ($catRev as $r) $catMap[$r['category']] = (float)$r['total'];

echo json_encode([
    'total_tables'    => $total,
    'occupied'        => $occ,
    'dirty'           => $dirty,
    'occupancy_pct'   => $total > 0 ? round($occ / $total * 100) : 0,
    'live_revenue'    => round($total_rev, 2),
    'top_floor'       => $topFloor,
    'floor_stats'     => $floorStats,
    'cat_revenue'     => $catMap,
]);
