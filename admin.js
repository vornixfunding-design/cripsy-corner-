'use strict';

/* ============================================================
   CRIPSY CORNER — admin.js v2.0
   No password / login. Opens directly.
   Data stored in Supabase (settings table + event_bookings table)
   ============================================================ */

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const getLS = (key, def) => JSON.parse(localStorage.getItem(key) || JSON.stringify(def));
const setLS = (key, val) => localStorage.setItem(key, JSON.stringify(val));

/* ============================================================
   SUPABASE CLOUD ENGINE
   ============================================================ */
const CLOUD_ENABLED = (typeof supabase !== 'undefined' && supabase !== null);

async function syncCloudToLocal() {
  if (!CLOUD_ENABLED) return;
  console.log('🌦️ Syncing Cloud → Local...');
  const { data, error } = await supabase.from('settings').select('*');
  if (!error && data) {
    data.forEach(row => { localStorage.setItem(row.key, JSON.stringify(row.value)); });
  }
}

async function saveToCloud(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
  if (!CLOUD_ENABLED) return;
  try {
    await supabase.from('settings').upsert({ key, value: val, updated_at: new Date().toISOString() });
    console.log(`☁️ Synced: ${key}`);
  } catch (e) { console.error('Supabase Save Error:', e); }
}

function initCloudListeners() {
  if (!CLOUD_ENABLED) return;
  supabase
    .channel('admin:settings')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, payload => {
      const row = payload.new;
      if (!row) return;
      if (JSON.stringify(row.value) !== localStorage.getItem(row.key)) {
        localStorage.setItem(row.key, JSON.stringify(row.value));
        console.log(`🔄 Remote Update: ${row.key}`);
        const active = $('.sb-link.active');
        if (active && ['inventory','finance','bookings','calendar','contact'].includes(active.dataset.panel)) {
          active.click();
        }
      }
    })
    .subscribe();

  // Also listen for new bookings from event_bookings table
  supabase
    .channel('admin:event_bookings')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'event_bookings' }, payload => {
      console.log('📥 New booking received from website:', payload.new);
      syncBookingsFromSupabase(); // Pull latest
    })
    .subscribe();
}

/* Pull bookings from event_bookings table and merge with settings */
async function syncBookingsFromSupabase() {
  if (!CLOUD_ENABLED) return;
  const { data, error } = await supabase
    .from('event_bookings')
    .select('*')
    .order('submitted_at', { ascending: false });
  if (error || !data) return;

  // Convert Supabase rows to local format
  const mapped = data.map(row => ({
    id:          row.id,
    name:        row.name,
    phone:       row.phone,
    email:       row.email,
    eventType:   row.event_type,
    eventDate:   row.event_date,
    location:    row.location,
    people:      row.people,
    stallFee:    row.stall_fee || '',
    message:     row.message || '',
    status:      row.status || 'pending',
    submittedAt: row.submitted_at
  }));

  // Merge with any localStorage-only bookings (for backwards compat)
  const localBookings = getLS('cc_bookings', []);
  const supabaseIds   = new Set(mapped.map(b => String(b.id)));
  const localOnly     = localBookings.filter(b => !supabaseIds.has(String(b.id)));
  const merged        = [...mapped, ...localOnly].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

  setLS('cc_bookings', merged);
  console.log(`✅ Synced ${merged.length} bookings from Supabase`);
}

/* Update booking status in Supabase event_bookings table */
async function updateBookingStatusInSupabase(id, status) {
  if (!CLOUD_ENABLED) return;
  try {
    await supabase.from('event_bookings').update({ status }).eq('id', id);
  } catch (e) { console.warn('Status update failed:', e); }
}

/* ============================================================
   INIT — Start app directly (no login required)
   ============================================================ */
async function initApp() {
  if (CLOUD_ENABLED) {
    showToast('☁️ Syncing from cloud...');
    await syncCloudToLocal();
    await syncBookingsFromSupabase();
    initCloudListeners();
    showToast('✅ Cloud sync complete!');
  }
  prePopulateInventory();
  loadDashboard();
}

/* ============================================================
   NAVIGATION — Panel switching
   ============================================================ */
$$('.sb-link').forEach(btn => {
  btn.addEventListener('click', () => {
    const panelId = btn.dataset.panel;
    $$('.sb-link').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    $$('.panel').forEach(p => p.classList.remove('active'));
    $(`#panel-${panelId}`).classList.add('active');
    $('#sidebar').classList.remove('open');
    switch (panelId) {
      case 'dashboard': loadDashboard(); break;
      case 'bookings':  loadBookings(); break;
      case 'calendar':  renderAdminCalendar(); break;
      case 'inventory': renderInventory(); break;
      case 'gallery':   loadGallery(); break;
      case 'finance':   renderFinance(); break;
      case 'contact':   loadContactInfo(); break;
    }
  });
});

$('#topbarMenu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));

/* ============================================================
   DASHBOARD
   ============================================================ */
function loadDashboard() {
  const bookings = getLS('cc_bookings', []);
  $('#dsTotalBookings').textContent = bookings.length;
  $('#dsPending').textContent   = bookings.filter(b => b.status === 'pending').length;
  $('#dsConfirmed').textContent  = bookings.filter(b => b.status === 'confirmed').length;

  const inventory = getLS('cc_inventory', []);
  const stockVal  = inventory.reduce((s, i) => s + ((i.qty || 0) * (i.price || 0)), 0);
  const dsHealth  = $('#dsFinancialHealth');
  if (dsHealth) dsHealth.textContent = `₹${stockVal.toLocaleString('en-IN')}`;

  const list = $('#dashRecentList');
  const recent = bookings.slice(0, 5);
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
function loadBookings() {
  const filter = $('#bookingFilter').value || 'all';
  renderBookingsList(filter);
}

$('#bookingFilter').addEventListener('change', loadBookings);

function renderBookingsList(filter) {
  let bookings = getLS('cc_bookings', []);
  if (filter !== 'all') bookings = bookings.filter(b => b.status === filter);
  const list  = $('#bookingsList');
  const empty = $('#bookingsEmpty');
  if (bookings.length === 0) {
    list.innerHTML = ''; empty.style.display = 'block'; return;
  }
  empty.style.display = 'none';
  list.innerHTML = bookings.map(b => buildBookingCard(b, false)).join('');
  attachBookingActions(list);
}

function buildBookingCard(b, compact) {
  const statusClass = `status-${b.status}`;
  const statusLabel = b.status.charAt(0).toUpperCase() + b.status.slice(1);
  const date = b.submittedAt ? new Date(b.submittedAt).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
  const eventTypeLabels = {
    'college-fest':'🎓 College Fest','school-event':'🏫 School Event',
    'birthday':'🎂 Birthday Party','exhibition':'🎪 Exhibition',
    'corporate':'🏢 Corporate Event','other':'🎉 Other'
  };
  return `
    <div class="booking-card" data-id="${b.id}">
      <div class="bc-top">
        <div>
          <div class="bc-name">${escHtml(b.name)}</div>
          <div class="bc-date">Submitted: ${date}</div>
        </div>
        <div class="bc-status ${statusClass}">${statusLabel}</div>
      </div>
      <div class="bc-details">
        <div class="bc-detail"><strong>📞 Phone</strong>${escHtml(b.phone)}</div>
        <div class="bc-detail"><strong>✉️ Email</strong>${escHtml(b.email)}</div>
        <div class="bc-detail"><strong>🎭 Event Type</strong>${eventTypeLabels[b.eventType] || b.eventType}</div>
        <div class="bc-detail"><strong>📅 Event Date</strong>${b.eventDate}</div>
        <div class="bc-detail"><strong>📍 Location</strong>${escHtml(b.location)}</div>
        <div class="bc-detail"><strong>👥 People</strong>~${b.people}</div>
        ${b.stallFee ? `<div class="bc-detail"><strong>💰 Stall Fee</strong>₹${escHtml(b.stallFee)}</div>` : ''}
      </div>
      ${b.message ? `<div class="bc-message">"${escHtml(b.message)}"</div>` : ''}
      ${!compact ? `
      <div class="bc-actions">
        <button class="btn-admin btn-sm btn-confirm" data-action="confirm" data-id="${b.id}">✅ Confirm</button>
        <button class="btn-admin btn-sm btn-reject"  data-action="reject"  data-id="${b.id}">❌ Reject</button>
        <button class="btn-admin btn-sm btn-delete"  data-action="delete"  data-id="${b.id}">🗑️ Delete</button>
        <button class="btn-admin btn-sm btn-primary" data-action="notify-team" data-id="${b.id}">📢 Notify Team</button>
        <a href="https://wa.me/${(b.phone||'').replace(/\D/g,'')}?text=Hi ${encodeURIComponent(b.name)}! We've received your booking request for ${b.eventDate}." target="_blank" class="btn-admin btn-sm btn-ghost">💬 WhatsApp Customer</a>
      </div>` : ''}
    </div>
  `;
}

function attachBookingActions(container) {
  $$('[data-action]', container).forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      const id     = parseInt(btn.dataset.id);
      let bookings = getLS('cc_bookings', []);

      if (action === 'delete') {
        if (!confirm('Delete this booking request?')) return;
        bookings = bookings.filter(b => b.id !== id);
        // Also delete from Supabase
        if (CLOUD_ENABLED) await supabase.from('event_bookings').delete().eq('id', id);
      } else if (action === 'notify-team') {
        notifyTeam(id); return;
      } else {
        const newStatus = action === 'confirm' ? 'confirmed' : 'rejected';
        bookings = bookings.map(b => b.id === id ? { ...b, status: newStatus } : b);
        // Update status in Supabase
        await updateBookingStatusInSupabase(id, newStatus);
        const b = bookings.find(item => item.id === id);
        if (b) notifyCustomerStatus(b);
      }
      saveToCloud('cc_bookings', bookings);
      loadBookings(); loadDashboard();
    });
  });
}

function notifyTeam(id) {
  const b = getLS('cc_bookings', []).find(item => item.id === id);
  if (!b) return;
  const msg = `🔔 *CRIPSY CORNER: NEW EVENT BOOKING!*\n━━━━━━━━━━━━━━\n👤 *CLIENT:* ${b.name}\n📅 *DATE:* ${b.eventDate}\n📍 *VENUE:* ${b.location}\n💰 *STALL FEE:* ₹${b.stallFee || '0'}\n👥 *CROWD:* ~${b.people} People\n━━━━━━━━━━━━━━\nCheck Admin Panel to confirm! 🌶️`;
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

function notifyCustomerStatus(b) {
  const status = b.status === 'confirmed' ? '✅ *ACCEPTED*' : '❌ *REJECTED*';
  const msg = `Hi ${b.name}! Your booking request for Crispy Corner on ${b.eventDate} has been ${status}.\n\n${b.status === 'confirmed' ? 'We will contact you shortly. Get ready for some Crispy magic! 🌶️✨' : 'Unfortunately we are unavailable for this event. Thank you for your interest!'}`;
  window.open(`https://wa.me/${(b.phone||'').replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`, '_blank');
}

$('#clearBookingsBtn').addEventListener('click', () => {
  if (!confirm('Clear ALL booking requests? This cannot be undone.')) return;
  saveToCloud('cc_bookings', []);
  loadBookings(); loadDashboard();
});

/* ============================================================
   AVAILABILITY CALENDAR (Admin)
   ============================================================ */
let adminCalDate = new Date();
adminCalDate.setDate(1);

function renderAdminCalendar() {
  const bookedDates = getLS('cc_booked_dates', []);
  const year  = adminCalDate.getFullYear();
  const month = adminCalDate.getMonth();
  const today = new Date(); today.setHours(0,0,0,0);
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  $('#adminCalMonth').textContent = `${monthNames[month]} ${year}`;
  const container = $('#adminCalDays');
  container.innerHTML = '';
  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement('div'); el.className = 'cal-admin-day empty'; container.appendChild(el);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr  = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const thisDate = new Date(year, month, d);
    const el = document.createElement('div');
    el.className = 'cal-admin-day';
    el.textContent = d;
    if (thisDate < today) { el.classList.add('past'); }
    else { el.classList.add(bookedDates.includes(dateStr) ? 'booked' : 'available'); }
    if (!el.classList.contains('past')) el.addEventListener('click', () => toggleDateBooked(dateStr));
    container.appendChild(el);
  }
  renderBookedDatesList();
}

function toggleDateBooked(dateStr) {
  let booked = getLS('cc_booked_dates', []);
  if (booked.includes(dateStr)) booked = booked.filter(d => d !== dateStr);
  else { booked.push(dateStr); booked.sort(); }
  saveToCloud('cc_booked_dates', booked);
  renderAdminCalendar();
}

function renderBookedDatesList() {
  const booked = getLS('cc_booked_dates', []).sort();
  const list = $('#bookedDatesList');
  if (booked.length === 0) { list.innerHTML = `<span style="color:#666;font-size:13px;">No dates marked as booked yet.</span>`; return; }
  list.innerHTML = booked.map(d => {
    const formatted = new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'long', year:'numeric' });
    return `<div class="booked-date-pill">${formatted}<button class="booked-date-remove" data-date="${d}" title="Remove">✕</button></div>`;
  }).join('');
  $$('.booked-date-remove', list).forEach(btn => btn.addEventListener('click', () => toggleDateBooked(btn.dataset.date)));
}

$('#adminCalPrev').addEventListener('click', () => { adminCalDate.setMonth(adminCalDate.getMonth()-1); renderAdminCalendar(); });
$('#adminCalNext').addEventListener('click', () => { adminCalDate.setMonth(adminCalDate.getMonth()+1); renderAdminCalendar(); });

/* ============================================================
   INVENTORY — Pre-populate & Render
   ============================================================ */
function prePopulateInventory() {
  let inv = getLS('cc_inventory', []);
  if (inv.length > 0 && (typeof inv[0].stock === 'string' || !('price' in inv[0]))) {
    inv = inv.map(item => ({
      ...item,
      qty:   item.qty || (String(item.stock).match(/\d+/) ? parseInt(String(item.stock).match(/\d+/)[0]) : 0),
      unit:  item.unit || (String(item.stock).match(/[a-zA-Z]+/) ? String(item.stock).match(/[a-zA-Z]+/)[0] : 'units'),
      min:   parseInt(item.min) || 5, price: parseFloat(item.price) || 0
    }));
    saveToCloud('cc_inventory', inv);
  }
  if (inv.length === 0) {
    inv = [
      { name:'Blue Lays',        category:'packets', qty:50, unit:'packs',   min:10, price:10  },
      { name:'Yellow Lays',      category:'packets', qty:50, unit:'packs',   min:10, price:10  },
      { name:'Dark Yellow Lays', category:'packets', qty:50, unit:'packs',   min:10, price:10  },
      { name:'Tedhe Medhe',      category:'packets', qty:50, unit:'packs',   min:10, price:20  },
      { name:'Kurkure Red',      category:'packets', qty:50, unit:'packs',   min:10, price:20  },
      { name:'Tandoori Mayo',    category:'sauces',  qty:5,  unit:'bottles', min:2,  price:150 },
      { name:'White Mayo',       category:'sauces',  qty:5,  unit:'bottles', min:2,  price:120 },
      { name:'Schezwan Sauce',   category:'sauces',  qty:5,  unit:'bottles', min:2,  price:95  },
      { name:'Sweet Corn Packets',category:'raw',    qty:20, unit:'packs',   min:5,  price:40  },
      { name:'Onion (kg)',       category:'raw',     qty:10, unit:'kg',      min:2,  price:30  },
      { name:'Cucumber',         category:'raw',     qty:10, unit:'units',   min:2,  price:15  },
      { name:'Chiliflex / Oregano',category:'raw',   qty:20, unit:'packs',   min:5,  price:5   }
    ];
    saveToCloud('cc_inventory', inv);
  }
  renderInvLog();
}

function renderInventory() {
  const inv       = getLS('cc_inventory', []);
  const list      = $('#inventoryList');
  if (!list) return;
  const query     = ($('#invSearchInput') ? $('#invSearchInput').value : '').toLowerCase();
  const catFilter = ($('#invCategoryFilter') ? $('#invCategoryFilter').value : 'all');
  let total=0, low=0, out=0, units=0, value=0;
  inv.forEach(item => { const q=parseFloat(item.qty)||0, p=parseFloat(item.price)||0; total++; units+=q; value+=q*p; if(q<=0)out++; else if(q<=(parseFloat(item.min)||0))low++; });
  const set = (id, v) => { const el=$(id); if(el)el.textContent=v; };
  set('#invStatTotal', total); set('#invStatLow', low); set('#invStatOut', out);
  set('#invStatValue', units); set('#invStatValTotal', `₹${value.toLocaleString('en-IN')}`);
  const filtered = inv.map((item, i) => ({...item, originalIndex:i}))
    .filter(item => item.name.toLowerCase().includes(query) && (catFilter==='all' || item.category===catFilter));
  if (filtered.length === 0) {
    list.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:60px;color:var(--text-muted);"><div style="font-size:32px;margin-bottom:10px;">🔍</div>No items found.</td></tr>`; return;
  }
  list.innerHTML = filtered.map(item => {
    const qty=parseFloat(item.qty)||0, min=parseFloat(item.min)||0, price=item.price||0, unit=item.unit||'units', cat=item.category||'packets';
    const hp=min>0?Math.min(100,(qty/(min*3))*100):(qty>0?100:0);
    const hc=qty<=0?'#ff4444':qty<=min?'var(--orange)':'var(--green)';
    return `<tr>
      <td style="padding:16px 12px;text-align:center;"><div class="is-icon" style="width:36px;height:36px;font-size:18px;">${cat==='packets'?'🍿':cat==='sauces'?'🧴':'🥬'}</div></td>
      <td style="padding:16px 12px;"><div style="font-weight:800;color:#fff;">${escHtml(item.name)}</div><div style="font-size:10px;opacity:0.5;">₹${price}/unit</div></td>
      <td style="padding:16px 12px;"><span class="badge" style="background:rgba(255,255,255,0.05);">${cat.toUpperCase()}</span></td>
      <td style="padding:16px 12px;">
        <div class="stock-health-container">
          <div class="sh-text"><span style="color:${hc}">${qty} ${unit}</span><span style="opacity:0.4;">min: ${min}</span></div>
          <div class="stock-health-bar"><div class="sh-fill" style="width:${hp}%;background:${hc}"></div></div>
        </div>
      </td>
      <td style="padding:16px 12px;">
        <div class="stock-adj-wrap">
          <button class="btn-adj" onclick="updateStockQty(${item.originalIndex},-1)">−</button>
          <span class="adj-val">${qty}</span>
          <button class="btn-adj" onclick="updateStockQty(${item.originalIndex},1)">+</button>
        </div>
      </td>
      <td style="padding:16px 12px;">
        <button class="btn-admin btn-sm btn-ghost" onclick="editInvItem(${item.originalIndex})">✏️ Edit</button>
        <button class="btn-admin btn-sm btn-ghost" style="color:#f87171;" onclick="deleteInvItem(${item.originalIndex})">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

function logInvChange(name, delta, newQty) {
  const logs = getLS('cc_inventory_log', []);
  const type = delta > 0 ? 'positive' : 'negative';
  logs.unshift({ id:Date.now(), name, change:Math.abs(delta), newQty, type, icon:delta>0?'📈':'📉', time:new Date().toISOString() });
  saveToCloud('cc_inventory_log', logs.slice(0, 15));
  renderInvLog();
}

function renderInvLog() {
  const container = $('#invActivityLog');
  if (!container) return;
  const logs = getLS('cc_inventory_log', []);
  if (logs.length === 0) { container.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">No recent changes recorded.</p>`; return; }
  container.innerHTML = logs.map(l => {
    const time = new Date(l.time).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
    return `<div class="log-item ${l.type}"><div class="log-icon">${l.icon}</div>
      <div class="log-content"><div class="log-header"><strong>${escHtml(l.name)}</strong><span class="log-time">${time}</span></div>
      <div class="log-msg">${l.type==='positive'?'Restocked':'Sold/Used'} ${l.change} units. Now: <span class="log-stock-info">${l.newQty}</span></div></div></div>`;
  }).join('');
}

const clearLogBtn = $('#clearInvLogBtn');
if (clearLogBtn) clearLogBtn.addEventListener('click', () => { if(confirm('Clear the activity log?')){ saveToCloud('cc_inventory_log',[]); renderInvLog(); } });

window.updateStockQty = (idx, delta) => {
  const items = getLS('cc_inventory', []);
  if (!items[idx]) return;
  items[idx].qty = Math.max(0, (parseFloat(items[idx].qty)||0) + delta);
  saveToCloud('cc_inventory', items);
  logInvChange(items[idx].name, delta, items[idx].qty);
  renderInventory();
};

const sInput = $('#invSearchInput'); if(sInput) sInput.addEventListener('input', renderInventory);
const cFilter = $('#invCategoryFilter'); if(cFilter) cFilter.addEventListener('change', renderInventory);
const rOBtn = $('#reorderInvBtn'); if(rOBtn) rOBtn.addEventListener('click', generateReorderList);

function generateReorderList() {
  const low = getLS('cc_inventory', []).filter(item => (parseFloat(item.qty)||0) <= (parseFloat(item.min)||5));
  if (low.length === 0) { alert('✅ High Stock! No items need reordering.'); return; }
  let msg = `🛒 *CRIPSY CORNER: SHOPPING LIST*\n━━━━━━━━━━━━\n`;
  low.forEach(item => { msg += `• *${item.name}*: ${item.qty} ${item.unit||'units'} left\n`; });
  msg += `━━━━━━━━━━━━\n📅 _${new Date().toLocaleDateString('en-IN')}_`;
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

const addIBtn = $('#addInvBtn');
if (addIBtn) addIBtn.addEventListener('click', () => {
  const form = $('#addInvForm'); if(form) form.reset();
  const idEl = $('#inv-id'); if(idEl) idEl.value = '';
  const titleEl = $('#invFormTitle'); if(titleEl) titleEl.textContent = '➕ Add New Item';
  const wrap = $('#addInvFormWrap'); if(wrap) wrap.style.display = 'block';
});

const cancelIBtn = $('#cancelInvBtn');
if (cancelIBtn) cancelIBtn.addEventListener('click', () => { const wrap=$('#addInvFormWrap'); if(wrap) wrap.style.display='none'; });

const invFm = $('#addInvForm');
if (invFm) {
  invFm.addEventListener('submit', e => {
    e.preventDefault();
    const idEl = $('#inv-id'); const idStr = idEl ? idEl.value : '';
    const items = getLS('cc_inventory', []);
    const newItem = {
      name:     $('#inv-name')?.value||'',     category: $('#inv-category')?.value||'packets',
      qty:      parseFloat($('#inv-qty')?.value)||0,  unit: $('#inv-unit')?.value||'units',
      min:      parseFloat($('#inv-min')?.value)||0,  price: parseFloat($('#inv-price')?.value)||0
    };
    if (idStr !== '') {
      const idx=parseInt(idStr), oldQty=items[idx]?.qty||0, diff=newItem.qty-oldQty;
      items[idx]=newItem; if(diff!==0) logInvChange(newItem.name, diff, newItem.qty);
    } else { items.push(newItem); logInvChange(newItem.name, newItem.qty, newItem.qty); }
    saveToCloud('cc_inventory', items);
    const wrap=$('#addInvFormWrap'); if(wrap) wrap.style.display='none';
    renderInventory(); showToast('📦 Inventory updated!');
  });
}

window.editInvItem = i => {
  const items = getLS('cc_inventory', []); const item = items[i]; if (!item) return;
  const set = (id, val) => { const el=$(id); if(el) el.value=val; };
  set('#inv-id',i); set('#inv-name',item.name||''); set('#inv-category',item.category||'packets');
  set('#inv-qty',item.qty||0); set('#inv-unit',item.unit||'units'); set('#inv-min',item.min||0); set('#inv-price',item.price||0);
  const titleEl=$('#invFormTitle'); if(titleEl) titleEl.textContent='✏️ Edit Item';
  const wrap=$('#addInvFormWrap'); if(wrap){ wrap.style.display='block'; wrap.scrollIntoView({behavior:'smooth'}); }
};

window.deleteInvItem = i => {
  const items = getLS('cc_inventory', []); const item = items[i]; if(!item) return;
  if (!confirm(`Delete ${item.name}?`)) return;
  items.splice(i, 1); saveToCloud('cc_inventory', items);
  showToast(`🗑️ ${item.name} deleted.`); renderInventory();
};

const expBtn = $('#exportInvBtn');
if (expBtn) expBtn.addEventListener('click', () => {
  const inv = getLS('cc_inventory', []);
  if (inv.length===0) { alert('No inventory to export!'); return; }
  let csv = 'Item Name,Category,Quantity,Unit,Min Level,Price,Total Value\n';
  inv.forEach(item => { const q=parseFloat(item.qty)||0, p=parseFloat(item.price)||0; csv += `"${item.name}","${item.category}",${q},"${item.unit}",${item.min},${p},${q*p}\n`; });
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  const a=document.createElement('a'); a.href=url; a.download=`cripsy_inventory_${new Date().toISOString().split('T')[0]}.csv`; a.click();
});

/* ============================================================
   GALLERY MANAGER
   ============================================================ */
let pendingFiles = [];

function loadGallery() {
  const items = getLS('cc_gallery', []);
  const grid  = $('#galleryAdminGrid');
  const empty = $('#galleryEmpty');
  if (items.length === 0) { grid.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display = 'none';
  grid.innerHTML = items.map((item, i) => `
    <div class="gallery-admin-item">
      ${item.type==='video' ? `<video src="${item.src}" muted loop autoplay playsinline style="width:100%;height:100%;object-fit:cover;"></video>`
        : `<img src="${item.src}" alt="${escHtml(item.caption||'')}" />`}
      <div class="gallery-admin-overlay">
        <div class="gallery-admin-caption">${escHtml(item.caption||'No caption')}</div>
        <button class="gallery-admin-delete" data-index="${i}">🗑️ Remove</button>
      </div>
    </div>`).join('');
  $$('.gallery-admin-delete', grid).forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      if (!confirm('Remove this item from gallery?')) return;
      const items = getLS('cc_gallery', []); items.splice(idx,1);
      saveToCloud('cc_gallery', items); loadGallery(); loadDashboard();
    });
  });
}

$('#fileInput').addEventListener('change', e => { handleFiles(Array.from(e.target.files)); e.target.value=''; });
const uploadArea = $('#uploadArea');
uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', e => { e.preventDefault(); uploadArea.classList.remove('dragover'); handleFiles(Array.from(e.dataTransfer.files)); });
uploadArea.addEventListener('click', () => $('#fileInput').click());

function handleFiles(files) {
  if (!files.length) return;
  const valid = files.filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
  if (!valid.length) { alert('Please select image or video files only.'); return; }
  pendingFiles = [];
  const previewRow = $('#uploadPreviewRow');
  previewRow.innerHTML = '';
  let loaded = 0;
  valid.forEach((file, i) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target.result;
      const isVideo = file.type.startsWith('video/');
      pendingFiles.push({ dataUrl, caption: file.name.split('.')[0], type: isVideo?'video':'image' });
      const wrapper = document.createElement('div');
      wrapper.className = 'upload-preview-item';
      wrapper.innerHTML = isVideo
        ? `<video src="${dataUrl}" style="width:120px;height:90px;object-fit:cover;border-radius:10px;" muted></video>`
        : `<img src="${dataUrl}" style="width:120px;height:90px;object-fit:cover;border-radius:10px;" />`;
      const captionInput = document.createElement('input');
      captionInput.type = 'text'; captionInput.className = 'upload-preview-caption';
      captionInput.placeholder = 'Add caption...'; captionInput.value = pendingFiles[pendingFiles.length-1].caption;
      const pIdx = pendingFiles.length-1;
      captionInput.addEventListener('input', () => { pendingFiles[pIdx].caption = captionInput.value; });
      const removeBtn = document.createElement('button');
      removeBtn.className = 'upload-preview-remove'; removeBtn.innerHTML = '×';
      removeBtn.addEventListener('click', () => {
        pendingFiles.splice(i, 1); wrapper.remove();
        if (!pendingFiles.length) { $('#uploadForm').style.display='none'; uploadArea.style.display='block'; }
      });
      wrapper.appendChild(captionInput); wrapper.appendChild(removeBtn); previewRow.appendChild(wrapper);
      loaded++;
      if (loaded === valid.length) { uploadArea.style.display='none'; $('#uploadForm').style.display='block'; }
    };
    reader.readAsDataURL(file);
  });
}

$('#addToGalleryBtn').addEventListener('click', () => {
  if (!pendingFiles.length) return;
  const gallery = getLS('cc_gallery', []);
  pendingFiles.forEach(f => { gallery.push({ src:f.dataUrl, caption:f.caption, type:f.type, addedAt:new Date().toISOString() }); });
  saveToCloud('cc_gallery', gallery);
  pendingFiles = []; $('#uploadForm').style.display='none'; uploadArea.style.display='block'; $('#uploadPreviewRow').innerHTML='';
  loadGallery(); loadDashboard(); showToast('✅ Gallery updated!');
});

$('#cancelUploadBtn').addEventListener('click', () => {
  pendingFiles = []; $('#uploadForm').style.display='none'; uploadArea.style.display='block'; $('#uploadPreviewRow').innerHTML='';
});

/* ============================================================
   CONTACT INFO
   ============================================================ */
function loadContactInfo() {
  const info = getLS('cc_contact', {});
  const set = (id, val) => { const el=$(id); if(el) el.value=val||''; };
  set('#ci-phone', info.phone); set('#ci-whatsapp', info.whatsapp); set('#ci-email', info.email);
  set('#ci-instagram', info.instagram); set('#ci-city', info.city);
  set('#ci-team1', info.team1); set('#ci-team2', info.team2); set('#ci-team3', info.team3);
  renderContactSnippet(info);
}

$('#contactFormAdmin').addEventListener('submit', e => {
  e.preventDefault();
  const info = {
    phone:     $('#ci-phone').value, whatsapp:  $('#ci-whatsapp').value,
    email:     $('#ci-email').value, instagram: $('#ci-instagram').value,
    city:      $('#ci-city').value,  team1:     $('#ci-team1').value,
    team2:     $('#ci-team2').value, team3:     $('#ci-team3').value
  };
  saveToCloud('cc_contact', info);
  const note = $('#contactSavedNote'); note.style.display='block';
  setTimeout(()=>note.style.display='none', 3000);
  renderContactSnippet(info); showToast('✅ Contact info saved!');
});

function renderContactSnippet(info) {
  const snippet = $('#contactSnippet');
  snippet.innerHTML = `
    <div>📞 <strong>Phone:</strong> ${info.phone||'—'}</div>
    <div>💬 <strong>WhatsApp:</strong> ${info.whatsapp||'—'}</div>
    <div>✉️ <strong>Email:</strong> ${info.email||'—'}</div>
    <div>📸 <strong>Instagram:</strong> ${info.instagram||'—'}</div>
    <div>📍 <strong>City:</strong> ${info.city||'—'}</div>
    <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.05);">
      <strong>👥 Team:</strong><br/>1: ${info.team1||'—'}<br/>2: ${info.team2||'—'}<br/>3: ${info.team3||'—'}
    </div>`;
}

/* ============================================================
   SETTINGS
   ============================================================ */
$('#clearAllBookings').addEventListener('click', () => {
  if (!confirm('Clear ALL bookings? Cannot be undone.')) return;
  saveToCloud('cc_bookings', []); loadDashboard(); showToast('Bookings cleared.');
});
$('#clearAllGallery').addEventListener('click', () => {
  if (!confirm('Clear ALL gallery items? Cannot be undone.')) return;
  saveToCloud('cc_gallery', []); loadDashboard(); showToast('Gallery cleared.');
});
$('#clearCalendar').addEventListener('click', () => {
  if (!confirm('Reset all booked dates?')) return;
  saveToCloud('cc_booked_dates', []); showToast('Calendar reset.');
});

const forceSyncBtn = $('#forceSyncBtn');
if (forceSyncBtn) forceSyncBtn.addEventListener('click', async () => {
  if (!CLOUD_ENABLED) { showToast('⚠️ Supabase not connected!'); return; }
  showToast('☁️ Syncing all data to cloud...');
  const keys = ['cc_bookings','cc_gallery','cc_booked_dates','cc_contact','cc_inventory','cc_inventory_log','cc_fin_transactions','cc_fin_accounts'];
  for (const k of keys) {
    const data = localStorage.getItem(k);
    if (data) await saveToCloud(k, JSON.parse(data));
  }
  showToast('✅ All data synced to Supabase!');
});

/* ============================================================
   FINANCE SUITE
   ============================================================ */
const DEF_ACCOUNTS = [
  { id:'acc_cash',   name:'💸 Physical Cash',       opening:0, balance:0, color:'#22c55e' },
  { id:'acc_jatin',  name:'🏦 Jatin Bank (SBI)',    opening:0, balance:0, color:'#fbbf24' },
  { id:'acc_aalekh', name:'🏦 Aalekh Bank (HDFC)',  opening:0, balance:0, color:'#3b82f6' }
];
function getFinAccounts()      { return getLS('cc_fin_accounts', DEF_ACCOUNTS); }
function getFinTransactions()  { return getLS('cc_fin_transactions', []); }

function renderFinance() {
  const accounts = getFinAccounts(), txs = getFinTransactions(), inventory = getLS('cc_inventory', []);
  let totalSales=0, totalExpenses=0, totalInvestment=0;
  txs.forEach(t => { if(t.type==='income')totalSales+=t.amount; if(t.type==='expense')totalExpenses+=t.amount; if(t.type==='investment')totalInvestment+=t.amount; });
  const stockValue = inventory.reduce((s,i)=>s+((i.qty||0)*(i.price||0)),0);
  $('#finTotalInvestment').textContent = `₹${totalInvestment.toLocaleString()}`;
  $('#finTotalSales').textContent      = `₹${totalSales.toLocaleString()}`;
  $('#finTotalExpenses').textContent   = `₹${totalExpenses.toLocaleString()}`;
  $('#finStockAsset').textContent      = `₹${stockValue.toLocaleString()}`;
  const dsHealth = $('#dsFinancialHealth'); if(dsHealth) dsHealth.textContent=`₹${stockValue.toLocaleString()}`;

  const accGrid = $('#financeAccountsGrid'), addBtn = $('#addFinAccountBtn');
  accGrid.innerHTML = '';
  accounts.forEach(acc => {
    const card = document.createElement('div'); card.className='inv-stat-card'; card.style.borderLeft=`4px solid ${acc.color||'var(--border)'}`;
    card.innerHTML=`<div class="is-icon" style="background:${acc.color}15;color:${acc.color};">🏦</div>
      <div class="is-info"><span class="is-label">${escHtml(acc.name)}</span><div class="is-value">₹${acc.balance.toLocaleString()}</div>
      <div style="font-size:10px;opacity:0.6;margin-top:4px;">Opening: ₹${acc.opening}</div></div>`;
    accGrid.appendChild(card);
  });
  accGrid.appendChild(addBtn);

  const accSelect = $('#fin-account');
  accSelect.innerHTML = accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  renderLedger();
}

function renderLedger() {
  const txs = getFinTransactions(), accounts = getFinAccounts();
  const query = ($('#finSearchLedger')?$('#finSearchLedger').value.toLowerCase():'');
  const list = $('#transactionLedgerBody'); list.innerHTML='';
  const filtered = txs.filter(t=>(t.desc||'').toLowerCase().includes(query)).sort((a,b)=>new Date(b.date)-new Date(a.date));
  if (!filtered.length) { list.innerHTML='<tr><td colspan="6" style="text-align:center;padding:40px;opacity:0.5;">No transactions recorded.</td></tr>'; return; }
  filtered.forEach(t => {
    const acc = accounts.find(a=>a.id===t.accountId)||{name:'Unknown'};
    const row = document.createElement('tr');
    row.innerHTML=`<td style="white-space:nowrap;">${t.date}</td>
      <td><strong>${escHtml(t.desc)}</strong>${t.member?`<br><small style="color:var(--orange)">Investor: ${t.member}</small>`:''}</td>
      <td><small>${escHtml(acc.name)}</small></td>
      <td><span class="fin-type-badge fin-type-${t.type}">${t.type}</span></td>
      <td><span class="${t.type==='income'||t.type==='investment'?'amt-pos':'amt-neg'}">${t.type==='income'||t.type==='investment'?'+':'-'}₹${t.amount.toLocaleString()}</span></td>
      <td><button class="btn-adj" onclick="deleteTransaction(${t.id})" title="Delete">✕</button></td>`;
    list.appendChild(row);
  });
}

$('#addTransactionForm').addEventListener('submit', e => {
  e.preventDefault();
  const type=($('#fin-type').value), amount=parseFloat($('#fin-amount').value), accountId=$('#fin-account').value;
  const date=$('#fin-date').value, desc=$('#fin-desc').value, member=(type==='investment'?$('#fin-member').value:null);
  if(isNaN(amount)||amount<=0) return;
  const txs=getFinTransactions(), accounts=getFinAccounts();
  const acc=accounts.find(a=>a.id===accountId); if(!acc) return;
  txs.unshift({id:Date.now(),type,date,amount,accountId,desc,member});
  if(type==='income'||type==='investment') acc.balance+=amount; else acc.balance-=amount;
  saveToCloud('cc_fin_transactions',txs); saveToCloud('cc_fin_accounts',accounts);
  e.target.reset(); $('#fin-date').valueAsDate=new Date(); renderFinance(); showToast('✅ Transaction Recorded');
});

window.deleteTransaction = id => {
  if(!confirm('Revert and delete this transaction?')) return;
  let txs=getFinTransactions(), accounts=getFinAccounts();
  const t=txs.find(tx=>tx.id===id); if(!t) return;
  const acc=accounts.find(a=>a.id===t.accountId);
  if(acc){ if(t.type==='income'||t.type==='investment') acc.balance-=t.amount; else acc.balance+=t.amount; }
  txs=txs.filter(tx=>tx.id!==id);
  saveToCloud('cc_fin_transactions',txs); saveToCloud('cc_fin_accounts',accounts);
  renderFinance(); showToast('🗑️ Transaction Reverted');
};

$('#newProgramBtn').addEventListener('click', () => {
  if(prompt('Type "RESET-FINANCE" to start new program:')!=='RESET-FINANCE') return;
  const accounts=getFinAccounts(), txs=getFinTransactions();
  const history=getLS('cc_fin_history',[]);
  history.push({sessionId:Date.now(),date:new Date().toLocaleDateString(),totalSales:txs.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0),transactions:txs});
  accounts.forEach(a=>a.balance=a.opening);
  saveToCloud('cc_fin_history',history); saveToCloud('cc_fin_transactions',[]); saveToCloud('cc_fin_accounts',accounts);
  renderFinance(); showToast('🧹 Clean slate started!');
});

$('#finSearchLedger').addEventListener('input', renderLedger);
$('#fin-type').addEventListener('change', e=>{ $('#fin-member-wrap').style.display=(e.target.value==='investment'?'block':'none'); });

$('#exportFinLog').addEventListener('click', () => {
  const txs=getFinTransactions(); if(!txs.length){alert('No data to export.');return;}
  let csv='Date,Description,Account,Type,Amount,Member\n';
  txs.forEach(t=>{ csv+=`${t.date},"${(t.desc||'').replace(/"/g,'')}",${t.accountId},${t.type},${t.amount},${t.member||''}\n`; });
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  const a=document.createElement('a'); a.href=url; a.download=`Cripsy_Finance_${Date.now()}.csv`; a.click();
});

$('#addFinAccountBtn').addEventListener('click', () => {
  const name=prompt('Enter Bank/Account Name:'); if(!name) return;
  const opening=parseFloat(prompt('Initial Balance (₹):')||0);
  const accounts=getFinAccounts();
  accounts.push({id:'acc_'+Date.now(),name,opening,balance:opening,color:'#'+Math.floor(Math.random()*16777215).toString(16)});
  saveToCloud('cc_fin_accounts',accounts); renderFinance(); showToast('🏦 Account Added');
});

/* ============================================================
   TOAST NOTIFICATIONS
   ============================================================ */
function showToast(msg, duration=3000) {
  const toast = document.createElement('div');
  toast.style.cssText=`position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(80px);background:#1e1e1e;border:1px solid rgba(255,122,0,0.3);color:#fff;padding:12px 24px;border-radius:30px;font-size:14px;font-weight:700;z-index:9999;transition:transform 0.4s cubic-bezier(0.34,1.56,0.64,1),opacity 0.3s;box-shadow:0 8px 30px rgba(0,0,0,0.5);pointer-events:none;`;
  toast.textContent = msg; document.body.appendChild(toast);
  requestAnimationFrame(()=>{
    toast.style.transform='translateX(-50%) translateY(0)';
    setTimeout(()=>{ toast.style.opacity='0'; toast.style.transform='translateX(-50%) translateY(30px)'; setTimeout(()=>toast.remove(),400); }, duration);
  });
}

/* ============================================================
   UTILITY
   ============================================================ */
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ============================================================
   START
   ============================================================ */
initApp();
if ($('#fin-date')) $('#fin-date').valueAsDate = new Date();
