// =====================
// State
// =====================
const API = {
  tables:    'api/tables.php',
  orders:    'api/orders.php',
  analytics: 'api/analytics.php',
};

let state = {
  tables: [],
  activeTableId: null,
  activeOrder: null,
  editTableId: null,
};

// =====================
// Utilities
// =====================
const fmt  = n => '₹' + parseFloat(n).toFixed(2);
const gst  = cat => cat === 'food' ? 0.05 : 0.18;

function calcBill(items) {
  let subtotal = 0, tax = 0;
  items.forEach(it => { subtotal += +it.price; tax += +it.price * gst(it.category); });
  const svc = subtotal * 0.1;
  return { subtotal, tax, svc, total: subtotal + tax + svc };
}

async function api(url, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(url, opts);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || 'Request failed');
  return data;
}

function showAlert(selector, msg, type = 'danger') {
  const el = document.querySelector(selector);
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
  if (type === 'success') setTimeout(() => el.innerHTML = '', 3000);
}
function clearAlert(sel) { const el = document.querySelector(sel); if (el) el.innerHTML = ''; }

// =====================
// Navigation
// =====================
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('s-' + name).classList.add('active');
  document.querySelector(`.nav-btn[data-sec="${name}"]`).classList.add('active');
  if (name === 'dashboard') renderDashboard();
  else if (name === 'floor')   renderFloor();
  else if (name === 'manage')  renderManage();
  else if (name === 'analytics') renderAnalytics();
}

// =====================
// Data loaders
// =====================
async function loadTables() {
  state.tables = await api(API.tables);
}

// =====================
// Dashboard
// =====================
async function renderDashboard() {
  await loadTables();
  const stats = await api(API.analytics).catch(() => null);
  if (stats) {
    document.getElementById('m-occ').textContent     = stats.occupancy_pct + '%';
    document.getElementById('m-occ-sub').textContent = stats.occupied + ' of ' + stats.total_tables + ' tables';
    document.getElementById('m-rev').textContent     = fmt(stats.live_revenue);
    document.getElementById('m-dirty').textContent   = stats.dirty;
    document.getElementById('m-floor').textContent   = stats.top_floor || 'None';
  }

  const occupied = state.tables.filter(t => t.status === 'occupied');
  const tbody = document.getElementById('dash-occupied');
  if (occupied.length === 0) {
    tbody.innerHTML = '<div class="empty">No occupied tables right now</div>';
    return;
  }

  const rows = await Promise.all(occupied.map(async t => {
    let billHtml = '—';
    try {
      const ord = await api(API.orders + '?table_id=' + t.id);
      if (ord && ord.items && ord.items.length > 0) {
        const b = calcBill(ord.items);
        billHtml = `<span class="mono">${fmt(b.total)}</span>`;
      }
    } catch {}
    return `<div class="tbl-row">
      <div><b>T${t.table_number}</b></div>
      <div>${t.floor_zone}</div>
      <div>${t.capacity}p</div>
      <div><span class="badge badge-occupied">Occupied</span></div>
      <div style="text-align:right">${billHtml}</div>
    </div>`;
  }));
  tbody.innerHTML = rows.join('');
}

// =====================
// Floor Map
// =====================
async function renderFloor() {
  await loadTables();
  const grid = document.getElementById('floor-grid');
  if (state.tables.length === 0) { grid.innerHTML = '<div class="empty">No tables configured yet</div>'; return; }

  const cards = await Promise.all(state.tables.map(async t => {
    let billHtml = '';
    if (t.status === 'occupied') {
      try {
        const ord = await api(API.orders + '?table_id=' + t.id);
        if (ord && ord.items && ord.items.length > 0 && !ord.settled) {
          const b = calcBill(ord.items);
          billHtml = `<div class="table-bill">${fmt(b.total)}</div>`;
        }
      } catch {}
    }
    let actions = '';
    if (t.status === 'available') {
      actions = `<button class="btn btn-success btn-xs" onclick="seatTable(${t.id})">Seat Guest</button>`;
    } else if (t.status === 'occupied') {
      actions = `<button class="btn btn-info btn-xs" onclick="openOrderModal(${t.id})">Quick Order</button>`;
    } else if (t.status === 'dirty') {
      actions = `<button class="btn btn-xs" onclick="markClean(${t.id})">Mark Clean</button>`;
    }
    return `<div class="table-card ${t.status}">
      <span class="badge badge-${t.status}">${t.status.charAt(0).toUpperCase()+t.status.slice(1)}</span>
      <div class="table-num">Table ${t.table_number}</div>
      <div class="table-meta">${t.floor_zone} &bull; ${t.capacity}p</div>
      ${billHtml}
      <div class="table-actions">${actions}</div>
    </div>`;
  }));
  grid.innerHTML = cards.join('');
}

async function seatTable(id) {
  await api(API.tables + '?id=' + id, 'PUT', {
    ...state.tables.find(t => t.id == id),
    status: 'occupied'
  }).catch(e => alert(e.message));
  renderFloor();
}

async function markClean(id) {
  const t = state.tables.find(x => x.id == id);
  await api(API.tables + '?id=' + id, 'PUT', { ...t, status: 'available' }).catch(e => alert(e.message));
  renderFloor();
}

// =====================
// Manage Tables
// =====================
async function renderManage() {
  await loadTables();
  clearAlert('#manage-alert');
  const body = document.getElementById('tbl-list-body');
  if (state.tables.length === 0) {
    body.innerHTML = '<div class="empty" style="padding:24px">No tables yet — add one above</div>';
    return;
  }
  body.innerHTML = state.tables.map(t => {
    const canDel = t.status !== 'occupied';
    return `<div class="tbl-row">
      <div><b>${t.table_number}</b></div>
      <div>${t.floor_zone}</div>
      <div>${t.capacity}p</div>
      <div><span class="badge badge-${t.status}">${t.status.charAt(0).toUpperCase()+t.status.slice(1)}</span></div>
      <div class="tbl-actions">
        <button class="btn btn-sm" onclick="openTableModal(${t.id})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteTable(${t.id})" ${canDel?'':'disabled title="Active order"'}>Delete</button>
      </div>
    </div>`;
  }).join('');
}

function openTableModal(id = null) {
  state.editTableId = id;
  clearAlert('#tbl-modal-error');
  document.getElementById('tbl-modal-title').textContent = id ? 'Edit Table' : 'Add Table';
  if (id) {
    const t = state.tables.find(x => x.id == id);
    document.getElementById('f-tnum').value   = t.table_number;
    document.getElementById('f-tcap').value   = t.capacity;
    document.getElementById('f-tfloor').value = t.floor_zone;
    document.getElementById('f-tstatus').value= t.status;
  } else {
    document.getElementById('f-tnum').value   = '';
    document.getElementById('f-tcap').value   = '4';
    document.getElementById('f-tfloor').value = '';
    document.getElementById('f-tstatus').value= 'available';
  }
  openOverlay('modal-table');
}

async function saveTable() {
  clearAlert('#tbl-modal-error');
  const body = {
    table_number: parseInt(document.getElementById('f-tnum').value),
    capacity:     parseInt(document.getElementById('f-tcap').value),
    floor_zone:   document.getElementById('f-tfloor').value.trim(),
    status:       document.getElementById('f-tstatus').value,
  };
  if (!body.table_number || body.table_number < 1) { showAlert('#tbl-modal-error', 'Enter a valid table number'); return; }
  if (!body.floor_zone) { showAlert('#tbl-modal-error', 'Floor/zone is required'); return; }

  try {
    if (state.editTableId) {
      await api(API.tables + '?id=' + state.editTableId, 'PUT', body);
    } else {
      await api(API.tables, 'POST', body);
    }
    closeOverlay('modal-table');
    renderManage();
  } catch (e) {
    showAlert('#tbl-modal-error', e.message);
  }
}

async function deleteTable(id) {
  if (!confirm('Delete this table?')) return;
  try {
    await api(API.tables + '?id=' + id, 'DELETE');
    renderManage();
  } catch (e) {
    showAlert('#manage-alert', e.message);
  }
}

// =====================
// Order Modal
// =====================
async function openOrderModal(tableId) {
  state.activeTableId = tableId;
  const t = state.tables.find(x => x.id == tableId);
  document.getElementById('order-title').textContent = 'Table ' + t.table_number;
  clearAlert('#order-alert');
  document.getElementById('item-err').textContent = '';
  openOverlay('modal-order');

  try {
    state.activeOrder = await api(API.orders + '?action=open', 'POST', { table_id: tableId });
    renderOrderModal();
  } catch (e) {
    showAlert('#order-alert', e.message);
  }
}

function renderOrderModal() {
  const ord = state.activeOrder;
  if (!ord) return;

  const settled = !!+ord.settled;
  document.getElementById('settled-badge').innerHTML = settled
    ? '<span class="badge-settled">Settled</span>' : '';

  const form = document.getElementById('order-add-form');
  form.style.opacity      = settled ? '0.45' : '1';
  form.style.pointerEvents= settled ? 'none' : 'auto';

  const items = ord.items || [];
  if (items.length === 0) {
    document.getElementById('order-items').innerHTML = '<div class="empty">No items yet</div>';
  } else {
    document.getElementById('order-items').innerHTML = items.map(it => `
      <div class="order-item">
        <div class="item-name">
          ${it.item_name}
          <span class="badge badge-${it.category}" style="margin-left:5px">${it.category==='food'?'Food':'Bev'}</span>
        </div>
        <div class="item-right">
          <span class="mono">${fmt(it.price)}</span>
          ${!settled ? `<button class="btn btn-xs btn-danger" onclick="removeItem(${it.id})">✕</button>` : ''}
        </div>
      </div>`).join('');
  }

  // Bill
  let billHtml = '';
  if (items.length > 0) {
    const b = calcBill(items);
    const foodTax = items.filter(i=>i.category==='food').reduce((s,i)=>s+(+i.price)*0.05,0);
    const bevTax  = items.filter(i=>i.category==='beverage').reduce((s,i)=>s+(+i.price)*0.18,0);
    billHtml = `
      <div class="bill-row"><span>Subtotal</span><span class="mono">${fmt(b.subtotal)}</span></div>
      ${foodTax>0?`<div class="bill-row"><span>GST Food 5%</span><span class="mono">${fmt(foodTax)}</span></div>`:''}
      ${bevTax>0?`<div class="bill-row"><span>GST Bev 18%</span><span class="mono">${fmt(bevTax)}</span></div>`:''}
      <div class="bill-row"><span>Service 10%</span><span class="mono">${fmt(b.svc)}</span></div>
      <div class="bill-row total"><span>Total Payable</span><span class="mono">${fmt(b.total)}</span></div>`;
  }
  document.getElementById('bill-summary').innerHTML = billHtml;

  // Actions
  let acts = '';
  if (!settled && items.length > 0) {
    acts = `<button class="btn btn-success btn-sm" onclick="doCheckout()">Checkout &amp; Settle</button>
            <button class="btn btn-sm" onclick="openTransfer()">Transfer Table</button>
            <button class="btn btn-sm" onclick="openSplit()">Split Bill</button>`;
  }
  document.getElementById('order-actions').innerHTML = acts;
}

async function addItem() {
  const name  = document.getElementById('i-name').value.trim();
  const cat   = document.getElementById('i-cat').value;
  const price = parseFloat(document.getElementById('i-price').value);
  const err   = document.getElementById('item-err');

  if (!name)          { err.textContent = 'Item name is required'; return; }
  if (!price || price <= 0) { err.textContent = 'Price must be greater than 0'; return; }
  err.textContent = '';

  try {
    await api(API.orders + '?action=add_item', 'POST', {
      order_id: state.activeOrder.id, item_name: name, category: cat, price
    });
    document.getElementById('i-name').value  = '';
    document.getElementById('i-price').value = '';
    state.activeOrder = await api(API.orders + '?table_id=' + state.activeTableId);
    renderOrderModal();
  } catch (e) { err.textContent = e.message; }
}

async function removeItem(itemId) {
  try {
    await api(API.orders + '?action=remove_item&item_id=' + itemId, 'DELETE');
    state.activeOrder = await api(API.orders + '?table_id=' + state.activeTableId);
    renderOrderModal();
  } catch (e) { showAlert('#order-alert', e.message); }
}

async function doCheckout() {
  if (!confirm('Settle and close this order?')) return;
  try {
    await api(API.orders + '?action=checkout', 'POST', { order_id: state.activeOrder.id });
    state.activeOrder = await api(API.orders + '?table_id=' + state.activeTableId);
    await loadTables();
    renderOrderModal();
    renderFloor();
  } catch (e) { showAlert('#order-alert', e.message); }
}

// =====================
// Transfer
// =====================
async function openTransfer() {
  await loadTables();
  const avail = state.tables.filter(t => t.status === 'available' && t.id != state.activeTableId);
  const sel = document.getElementById('transfer-sel');
  sel.innerHTML = avail.length
    ? avail.map(t=>`<option value="${t.id}">Table ${t.table_number} (${t.floor_zone})</option>`).join('')
    : '<option value="">— No available tables —</option>';
  clearAlert('#transfer-err');
  openOverlay('modal-transfer');
}

async function doTransfer() {
  const targetId = parseInt(document.getElementById('transfer-sel').value);
  if (!targetId) { showAlert('#transfer-err', 'Select a valid target table'); return; }
  try {
    await api(API.orders + '?action=transfer', 'POST', {
      order_id: state.activeOrder.id, target_table_id: targetId
    });
    closeOverlay('modal-transfer');
    closeOverlay('modal-order');
    await loadTables();
    renderFloor();
  } catch (e) { showAlert('#transfer-err', e.message); }
}

// =====================
// Split Bill
// =====================
function openSplit() {
  const items = state.activeOrder?.items || [];
  if (items.length === 0) return;
  document.getElementById('split-items').innerHTML = items.map((it, i) => `
    <div class="split-row">
      <div style="flex:1">
        <div>${it.item_name}</div>
        <div style="font-size:11px;color:var(--text3)">${fmt(it.price)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <input type="number" class="split-input" id="sp-${i}" value="1" min="1" max="20" oninput="recalcSplit()">
        <span style="font-size:11px;color:var(--text3)">person(s)</span>
      </div>
    </div>`).join('');
  recalcSplit();
  openOverlay('modal-split');
}

function recalcSplit() {
  const items = state.activeOrder?.items || [];
  const bill  = calcBill(items);
  const personMap = {};
  items.forEach((it, i) => {
    const n = parseInt(document.getElementById('sp-' + i)?.value || 1) || 1;
    const share = ((+it.price) * (1 + gst(it.category)) + (+it.price) * 0.1) / n;
    for (let p = 1; p <= n; p++) {
      const key = 'Person ' + p;
      personMap[key] = (personMap[key] || 0) + share;
    }
  });
  let html = `<div style="border-top:1px solid var(--border);padding-top:12px;margin-top:4px">
    <div style="font-size:11px;color:var(--text3);margin-bottom:10px">Split of total ${fmt(bill.total)}</div>`;
  Object.keys(personMap).sort().forEach(p => {
    html += `<div class="bill-row"><span>${p}</span><span class="mono">${fmt(personMap[p])}</span></div>`;
  });
  html += '</div>';
  document.getElementById('split-summary').innerHTML = html;
}

// =====================
// Analytics
// =====================
async function renderAnalytics() {
  const stats = await api(API.analytics).catch(() => null);
  if (!stats) { document.getElementById('analytics-content').innerHTML = '<div class="empty">Failed to load analytics</div>'; return; }

  const floors = stats.floor_stats || [];
  const floorRows = floors.map(f => {
    const pct = f.total > 0 ? Math.round(f.occupied / f.total * 100) : 0;
    return `<div class="bar-row">
      <div class="bar-label" title="${f.floor_zone}">${f.floor_zone}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:var(--red)"></div></div>
      <div class="bar-val">${pct}%</div>
    </div>`;
  }).join('') || '<div class="empty" style="padding:12px 0">No data</div>';

  const cat    = stats.cat_revenue || {};
  const catTot = (cat.food || 0) + (cat.beverage || 0);
  const fp     = catTot > 0 ? Math.round((cat.food||0)/catTot*100) : 0;
  const bp     = catTot > 0 ? Math.round((cat.beverage||0)/catTot*100) : 0;

  document.getElementById('analytics-content').innerHTML = `
    <div class="card">
      <h4 style="font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:14px">Occupancy by Zone</h4>
      ${floorRows}
    </div>
    <div class="card">
      <h4 style="font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:14px">Revenue Mix</h4>
      <div class="bar-row">
        <div class="bar-label">Food</div>
        <div class="bar-track"><div class="bar-fill" style="width:${fp}%;background:var(--green)"></div></div>
        <div class="bar-val">${fp}%</div>
      </div>
      <div class="bar-row">
        <div class="bar-label">Beverage</div>
        <div class="bar-track"><div class="bar-fill" style="width:${bp}%;background:var(--blue)"></div></div>
        <div class="bar-val">${bp}%</div>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:10px">Food: ${fmt(cat.food||0)} &bull; Bev: ${fmt(cat.beverage||0)}</div>
    </div>
    <div class="card">
      <h4 style="font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:14px">Table Status</h4>
      <div style="display:flex;gap:20px">
        <div><div style="font-size:24px;font-weight:500;color:var(--green)">${stats.total_tables - stats.occupied - stats.dirty}</div><div style="font-size:11px;color:var(--text3)">Available</div></div>
        <div><div style="font-size:24px;font-weight:500;color:var(--red)">${stats.occupied}</div><div style="font-size:11px;color:var(--text3)">Occupied</div></div>
        <div><div style="font-size:24px;font-weight:500;color:var(--amber)">${stats.dirty}</div><div style="font-size:11px;color:var(--text3)">Dirty</div></div>
      </div>
    </div>
    <div class="card">
      <h4 style="font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:14px">Orders Summary</h4>
      <div class="bill-row"><span>Occupancy</span><span><b>${stats.occupancy_pct}%</b></span></div>
      <div class="bill-row"><span>Live Revenue</span><span class="mono"><b>${fmt(stats.live_revenue)}</b></span></div>
      <div class="bill-row"><span>Top Zone</span><span><b>${stats.top_floor}</b></span></div>
    </div>`;
}

// =====================
// Overlay helpers
// =====================
function openOverlay(id)  { document.getElementById(id).classList.add('open'); }
function closeOverlay(id) { document.getElementById(id).classList.remove('open'); }

document.querySelectorAll('.overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
});

// =====================
// Boot
// =====================
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => showSection(btn.dataset.sec));
});
renderDashboard();
