'use strict';

/* ============================================================
   CRISPY CORNER — admin.js  (v3 — Supabase as Source of Truth)
   All data lives in Supabase dedicated tables.
   ============================================================ */

const $ = (s) => document.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const escHtml = (str) => String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]));

const SB = () => window.sb;
const cache = new Map();

/* --- Database Service Layer --- */
async function dbGet(table) {
  if (!SB()) return JSON.parse(localStorage.getItem(`cc_${table}`) || '[]');
  const { data, error } = await SB().from(table).select('*');
  if (error) { console.error(`DB Get Error (${table}):`, error); return []; }
  localStorage.setItem(`cc_${table}`, JSON.stringify(data));
  return data;
}

async function dbUpsert(table, rowArray) {
  if (SB()) {
    const { error } = await SB().from(table).upsert(rowArray);
    if (error) console.error(`DB Upsert Error (${table}):`, error);
  }
  await dbGet(table); // Refresh local cache
}

async function dbInsert(table, rowArray) {
  if (SB()) {
    const { error } = await SB().from(table).insert(rowArray);
    if (error) console.error(`DB Insert Error (${table}):`, error);
  }
  await dbGet(table);
}

async function dbDelete(table, matchObj) {
  if (SB()) {
    const { error } = await SB().from(table).delete().match(matchObj);
    if (error) console.error(`DB Delete Error (${table}):`, error);
  }
  await dbGet(table);
}

/* --- Authentication --- */
async function getPassword() {
  if (cache.has('cc_admin_pwd')) return cache.get('cc_admin_pwd');
  if (SB()) {
    const { data } = await SB().from('settings').select('value').eq('key', 'cc_admin_pwd').single();
    if (data) { cache.set('cc_admin_pwd', data.value); return data.value; }
  }
  return 'admin123';
}

async function checkAuth() {
  const session = sessionStorage.getItem('cc_admin_session');
  if (session === 'active') { showApp(); return; }
  $('#loginScreen').style.display = 'flex';
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#adminPassword').value;
  const correct = await getPassword();
  if (input === correct) {
    sessionStorage.setItem('cc_admin_session', 'active');
    showApp();
  } else {
    const err = $('#loginError');
    if (err) {
      err.style.display = 'block';
      setTimeout(() => err.style.display = 'none', 3000);
    } else {
      alert('❌ Incorrect password.');
    }
  }
});

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 100);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3000);
}

/* --- Migration Logic (From V2 Settings to V3 Tables) --- */
async function runMigration() {
  if (localStorage.getItem('cc_v3_migrated')) return;
  console.log("🚀 Starting Data Migration to Dedicated Tables...");
  
  try {
    const { data: settings } = await SB().from('settings').select('*');
    if (!settings) return;

    const find = (key) => settings.find(s => s.key === key)?.value;

    const bookings = find('cc_bookings');
    if (bookings?.length) await dbUpsert('bookings', bookings);

    const dates = find('cc_booked_dates');
    if (dates?.length) await dbUpsert('booked_dates', dates.map(d => ({ date_str: d })));

    const inventory = find('cc_inventory');
    if (inventory?.length) await dbUpsert('inventory', inventory);

    const accounts = find('cc_finance_accounts');
    if (accounts?.length) await dbUpsert('finance_accounts', accounts);

    const txs = find('cc_finance_transactions');
    if (txs?.length) await dbUpsert('finance_transactions', txs);

    const contact = find('cc_contact');
    if (contact) await dbUpsert('contact_info', [{ id: 1, ...contact }]);

    const gallery = find('cc_gallery');
    if (gallery?.length) {
      const mapped = gallery.map((item, i) => ({
        id: Date.now() + i,
        src: item.src,
        caption: item.caption,
        media_type: item.type || 'image',
        added_at: new Date().toISOString()
      }));
      await dbUpsert('gallery', mapped);
    }

    localStorage.setItem('cc_v3_migrated', 'true');
    showToast('✅ Data migrated to new database structure!');
  } catch (err) {
    console.error("Migration failed:", err);
  }
}

async function showApp() {
  $('#loginScreen').style.display = 'none';
  const app = $('#adminApp');
  if (app) app.style.display = 'flex';
  
  // Activate default panel (Dashboard)
  const dashBtn = $('.sb-link[data-panel="dashboard"]');
  if (dashBtn) {
    $$('.sb-link').forEach(b => b.classList.remove('active'));
    dashBtn.classList.add('active');
    $$('.panel').forEach(p => p.classList.remove('active'));
    const dashPanel = $('#panel-dashboard');
    if (dashPanel) dashPanel.classList.add('active');
  }

  if (SB()) {
    showToast('☁️ Connecting to database...');
    await runMigration();
    initRealtimeListeners();
  }
  loadDashboard();
}

function initRealtimeListeners() {
  if (!SB()) return;
  const tables = ['bookings', 'booked_dates', 'inventory', 'finance_transactions', 'gallery', 'contact_info'];
  tables.forEach(table => {
    SB().channel(`admin:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: table }, async () => {
        console.log(`🔄 Realtime update for ${table}`);
        await dbGet(table);
        refreshActivePanel();
      })
      .subscribe();
  });
}

function refreshActivePanel() {
  const active = $('.sb-link.active')?.dataset.panel;
  if (active === 'dashboard') loadDashboard();
  if (active === 'bookings') loadBookings();
  if (active === 'calendar') renderAdminCalendar();
  if (active === 'inventory') renderInventory();
  if (active === 'finance') renderFinance();
  if (active === 'gallery') loadGallery();
  if (active === 'contact') loadContactInfo();
}

/* --- Panel Switching --- */
$$('.sb-link').forEach(btn => {
  btn.addEventListener('click', () => {
    const pane = btn.dataset.panel;
    if (!pane) return;
    $$('.sb-link').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    $$('.panel').forEach(p => p.classList.remove('active'));
    const targetPanel = $(`#panel-${pane}`);
    if (targetPanel) targetPanel.classList.add('active');
    refreshActivePanel();
    if (window.innerWidth < 1024) $('#sidebar').classList.remove('open');
  });
});

$('#topbarMenu')?.addEventListener('click', () => {
  $('#sidebar')?.classList.toggle('open');
});

/* ============================================================
   DASHBOARD
   ============================================================ */
async function loadDashboard() {
  let bookings = await dbGet('bookings') || [];
  const gallery = await dbGet('gallery') || [];
  const inv = await dbGet('inventory') || [];
  
  $('#dsTotalBookings').textContent = bookings.length;
  $('#dsPending').textContent = bookings.filter(b => b.status === 'pending').length;
  $('#dsConfirmed').textContent = bookings.filter(b => b.status === 'confirmed').length;

  let stockValue = inv.reduce((s, i) => s + ((parseFloat(i.qty)||0) * (parseFloat(i.price)||0)), 0);
  const dsHealth = $('#dsFinancialHealth');
  if (dsHealth) dsHealth.textContent = `₹${stockValue.toLocaleString('en-IN')}`;

  const recent = bookings.sort((a,b) => new Date(b.submitted_at) - new Date(a.submitted_at)).slice(0, 5);
  const list = $('#dashRecentList');
  if (!list) return;
  if (recent.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>No booking requests yet.</p></div>`;
    return;
  }
  list.innerHTML = recent.map(b => buildBookingCard(b, true)).join('');
  attachBookingActions(list);
}

/* ============================================================
   BOOKINGS
   ============================================================ */
async function loadBookings() {
  const filter = $('#bookingFilter').value || 'all';
  await renderBookingsList(filter);
}

$('#bookingFilter').addEventListener('change', loadBookings);

async function renderBookingsList(filter) {
  let bookings = await dbGet('bookings') || [];
  bookings.sort((a,b) => new Date(b.submitted_at) - new Date(a.submitted_at));
  if (filter !== 'all') bookings = bookings.filter(b => b.status === filter);

  const list = $('#bookingsList');
  const empty = $('#bookingsEmpty');
  if (!list) return;

  if (bookings.length === 0) {
    list.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';
  list.innerHTML = bookings.map(b => buildBookingCard(b, false)).join('');
  attachBookingActions(list);
}

function buildBookingCard(b, compact) {
  const statusClass = `status-${b.status}`;
  const statusLabel = b.status.charAt(0).toUpperCase() + b.status.slice(1);
  const dateStr = b.submitted_at ? new Date(b.submitted_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
  const et = b.event_type || b.eventType || '';
  const ed = b.event_date || b.eventDate || '';
  const sf = b.stall_fee || b.stallFee || '';
  const phone = b.phone || '';

  return `
    <div class="booking-card" data-id="${b.id}">
      <div class="bc-top">
        <div>
          <div class="bc-name">${escHtml(b.name)}</div>
          <div class="bc-date">Submitted: ${dateStr}</div>
        </div>
        <div class="bc-status ${statusClass}">${statusLabel}</div>
      </div>
      <div class="bc-details">
        <div class="bc-detail"><strong>📞 Phone</strong>${escHtml(phone)}</div>
        <div class="bc-detail"><strong>✉️ Email</strong>${escHtml(b.email)}</div>
        <div class="bc-detail"><strong>📅 Date</strong>${escHtml(ed)}</div>
        <div class="bc-detail"><strong>📍 Venue</strong>${escHtml(b.location)}</div>
        <div class="bc-detail"><strong>👥 People</strong>~${b.people}</div>
        ${sf ? `<div class="bc-detail"><strong>💰 Stall Fee</strong>₹${escHtml(sf)}</div>` : ''}
      </div>
      ${!compact ? `
      <div class="bc-actions">
        <button class="btn-admin btn-sm btn-confirm" data-action="confirm" data-id="${b.id}">✅ Confirm</button>
        <button class="btn-admin btn-sm btn-reject"  data-action="reject"  data-id="${b.id}">❌ Reject</button>
        <button class="btn-admin btn-sm btn-delete" data-action="delete" data-id="${b.id}">🗑️ Delete</button>
        <a href="https://wa.me/${phone.replace(/\D/g,'')}" target="_blank" class="btn-admin btn-sm btn-ghost">💬 WhatsApp</a>
      </div>` : ''}
    </div>
  `;
}

function attachBookingActions(container) {
  $$('[data-action]', container).forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (action === 'delete') {
        if (!confirm('Delete this booking request?')) return;
        await dbDelete('bookings', { id });
      } else {
        const newStatus = action === 'confirm' ? 'confirmed' : 'rejected';
        await dbUpsert('bookings', [{ id, status: newStatus }]);
      }
      loadBookings();
    });
  });
}

/* ============================================================
   AVAILABILITY CALENDAR
   ============================================================ */
let adminCalDate = new Date();
adminCalDate.setDate(1);

async function renderAdminCalendar() {
  const rows = await dbGet('booked_dates');
  const bookedDates = rows.map(r => r.date_str);

  const year = adminCalDate.getFullYear();
  const month = adminCalDate.getMonth();
  const today = new Date(); today.setHours(0,0,0,0);

  $('#adminCalMonth').textContent = `${new Intl.DateTimeFormat('en-US', {month:'long'}).format(adminCalDate)} ${year}`;
  const container = $('#adminCalDays');
  if (!container) return;
  container.innerHTML = '';

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    container.appendChild(Object.assign(document.createElement('div'), {className:'cal-admin-day empty'}));
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const el = document.createElement('div');
    el.className = 'cal-admin-day';
    el.textContent = d;
    if (new Date(year, month, d) < today) el.classList.add('past');
    else if (bookedDates.includes(dateStr)) el.classList.add('booked');
    else el.classList.add('available');

    if (!el.classList.contains('past')) {
      el.addEventListener('click', async () => {
        if (bookedDates.includes(dateStr)) await dbDelete('booked_dates', { date_str: dateStr });
        else await dbInsert('booked_dates', [{ date_str: dateStr }]);
        renderAdminCalendar();
      });
    }
    container.appendChild(el);
  }
}

$('#adminCalPrev').addEventListener('click', () => { adminCalDate.setMonth(adminCalDate.getMonth()-1); renderAdminCalendar(); });
$('#adminCalNext').addEventListener('click', () => { adminCalDate.setMonth(adminCalDate.getMonth()+1); renderAdminCalendar(); });

/* ============================================================
   INVENTORY MANAGEMENT
   ============================================================ */
async function renderInventory() {
  const inv = await dbGet('inventory') || [];
  const list = $('#inventoryList');
  if (!list) return;

  const query = $('#invSearchInput')?.value.toLowerCase() || '';
  const catFilter = $('#invCategoryFilter')?.value || 'all';

  const filtered = inv.filter(item => {
    return (item.name.toLowerCase().includes(query)) && (catFilter === 'all' || item.category === catFilter);
  });

  list.innerHTML = filtered.map(item => `
    <tr>
      <td style="padding:16px 12px;"><strong>${escHtml(item.name)}</strong></td>
      <td><span class="badge">${item.category.toUpperCase()}</span></td>
      <td>${item.qty} ${item.unit}</td>
      <td>₹${item.price}</td>
      <td>
        <button class="btn-adj" onclick="updateStockQty(${item.id}, 1)">+</button>
        <button class="btn-adj" onclick="updateStockQty(${item.id}, -1)">−</button>
      </td>
      <td>
        <button class="btn-admin btn-sm btn-ghost" onclick="deleteInvItem(${item.id})">🗑️</button>
      </td>
    </tr>
  `).join('');
}

window.updateStockQty = async (id, delta) => {
  const items = await dbGet('inventory');
  const item = items.find(i => i.id == id);
  if (!item) return;
  const newQty = Math.max(0, (parseFloat(item.qty)||0) + delta);
  await dbUpsert('inventory', [{ id, qty: newQty }]);
  renderInventory();
};

window.deleteInvItem = async (id) => {
  if (!confirm('Delete this item?')) return;
  await dbDelete('inventory', { id });
  renderInventory();
};

$('#addInvForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const newItem = {
    id: Date.now(),
    name: $('#inv-name').value,
    category: $('#inv-category').value,
    qty: parseFloat($('#inv-qty').value) || 0,
    unit: $('#inv-unit').value,
    min_level: parseFloat($('#inv-min').value) || 0,
    price: parseFloat($('#inv-price').value) || 0
  };
  await dbInsert('inventory', [newItem]);
  $('#addInvFormWrap').style.display = 'none';
  renderInventory();
});

$('#addInvBtn')?.addEventListener('click', () => $('#addInvFormWrap').style.display = 'block');
$('#cancelInvBtn')?.addEventListener('click', () => $('#addInvFormWrap').style.display = 'none');
$('#invSearchInput')?.addEventListener('input', renderInventory);
$('#invCategoryFilter')?.addEventListener('change', renderInventory);

/* ============================================================
   FINANCE SUITE
   ============================================================ */
async function renderFinance() {
  const accounts = await dbGet('finance_accounts') || [];
  const txs = await dbGet('finance_transactions') || [];

  $('#finTotalSales').textContent = `₹${txs.filter(t => t.tx_type === 'income').reduce((a,b) => a + parseFloat(b.amount), 0).toLocaleString()}`;
  $('#finTotalExpenses').textContent = `₹${txs.filter(t => t.tx_type === 'expense').reduce((a,b) => a + parseFloat(b.amount), 0).toLocaleString()}`;

  const accGrid = $('#financeAccountsGrid');
  if (accGrid) {
    accGrid.innerHTML = accounts.map(acc => `
      <div class="inv-stat-card" style="border-left:4px solid ${acc.color}">
        <div class="is-info">
          <span class="is-label">${escHtml(acc.name)}</span>
          <div class="is-value">₹${parseFloat(acc.balance).toLocaleString()}</div>
        </div>
      </div>
    `).join('') + `<button id="addFinAccountBtn" class="add-inv-btn-card">+</button>`;
  }

  const list = $('#transactionLedgerBody');
  if (list) {
    list.innerHTML = txs.sort((a,b) => new Date(b.tx_date) - new Date(a.tx_date)).map(t => `
      <tr>
        <td>${t.tx_date}</td>
        <td>${escHtml(t.description)}</td>
        <td><span class="fin-type-badge fin-type-${t.tx_type}">${t.tx_type}</span></td>
        <td>₹${t.amount}</td>
        <td><button onclick="deleteTransaction(${t.id})">✕</button></td>
      </tr>
    `).join('');
  }
}

$('#addTransactionForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const tx = {
    id: Date.now(),
    tx_type: $('#fin-type').value,
    tx_date: $('#fin-date').value,
    amount: parseFloat($('#fin-amount').value),
    account_id: $('#fin-account').value,
    description: $('#fin-desc').value
  };
  await dbInsert('finance_transactions', [tx]);
  renderFinance();
});

window.deleteTransaction = async (id) => {
  await dbDelete('finance_transactions', { id });
  renderFinance();
};

/* ============================================================
   GALLERY MANAGER
   ============================================================ */
async function loadGallery() {
  const items = await dbGet('gallery') || [];
  const grid = $('#galleryAdminGrid');
  if (!grid) return;
  grid.innerHTML = items.map(item => `
    <div class="gallery-admin-item">
      <img src="${item.src}" />
      <button onclick="deleteGalleryItem(${item.id}, '${item.storage_path}')">🗑️</button>
    </div>
  `).join('');
}

window.deleteGalleryItem = async (id, path) => {
  if (path && SB()) await SB().storage.from('gallery').remove([path]);
  await dbDelete('gallery', { id });
  loadGallery();
};

$('#fileInput')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  showToast('📤 Uploading...');
  const fileName = `${Date.now()}-${file.name}`;
  const { data, error } = await SB().storage.from('gallery').upload(fileName, file);
  if (!error) {
    const { data: url } = SB().storage.from('gallery').getPublicUrl(data.path);
    await dbInsert('gallery', [{ id: Date.now(), src: url.publicUrl, storage_path: data.path, media_type: 'image', added_at: new Date().toISOString() }]);
    loadGallery();
  }
});

/* ============================================================
   CONTACT & SETTINGS
   ============================================================ */
async function loadContactInfo() {
  const rows = await dbGet('contact_info');
  const info = rows[0] || {};
  ['phone', 'whatsapp', 'email', 'instagram', 'city'].forEach(f => {
    if ($(`#ci-${f}`)) $(`#ci-${f}`).value = info[f] || '';
  });
}

$('#contactFormAdmin')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const info = { id: 1, phone: $('#ci-phone').value, whatsapp: $('#ci-whatsapp').value, email: $('#ci-email').value, instagram: $('#ci-instagram').value, city: $('#ci-city').value };
  await dbUpsert('contact_info', [info]);
  showToast('✅ Saved');
});

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  if ($('#fin-date')) $('#fin-date').valueAsDate = new Date();
  checkAuth();
});
