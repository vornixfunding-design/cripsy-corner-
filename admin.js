'use strict';

/* ============================================================
   CRIPSY CORNER — admin.js
   All data stored in localStorage (no backend needed)
   Keys: cc_bookings | cc_gallery | cc_booked_dates | cc_contact | cc_admin_pwd
   ============================================================ */

/* ---- Helpers ---- */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const getLS = (key, def) => JSON.parse(localStorage.getItem(key) || JSON.stringify(def));
const setLS = (key, val) => localStorage.setItem(key, JSON.stringify(val));

/* ============================================================
   1. AUTH — Login / Logout
   ============================================================ */
const DEFAULT_PWD = 'admin123';

function getPassword() { return localStorage.getItem('cc_admin_pwd') || DEFAULT_PWD; }

function checkAuth() {
  const authed = sessionStorage.getItem('cc_admin_authed');
  if (authed === 'yes') showApp();
}

$('#loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const entered = $('#adminPassword').value;
  if (entered === getPassword()) {
    sessionStorage.setItem('cc_admin_authed', 'yes');
    $('#loginError').style.display = 'none';
    showApp();
  } else {
    $('#loginError').style.display = 'block';
    $('#adminPassword').value = '';
    $('#adminPassword').focus();
  }
});

function showApp() {
  $('#loginScreen').style.display = 'none';
  $('#adminApp').style.display = 'flex';
  loadDashboard();
}

$('#logoutBtn').addEventListener('click', logout);
$('#topbarLogout').addEventListener('click', logout);
function logout() {
  sessionStorage.removeItem('cc_admin_authed');
  location.reload();
}

/* ============================================================
   2. NAVIGATION — Panel switching
   ============================================================ */
$$('.sb-link').forEach(btn => {
  btn.addEventListener('click', () => {
    const panelId = btn.dataset.panel;
    // Update active link
    $$('.sb-link').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // Show panel
    $$('.panel').forEach(p => p.classList.remove('active'));
    $(`#panel-${panelId}`).classList.add('active');
    // Close sidebar on mobile
    $('#sidebar').classList.remove('open');
    // Load panel data
    switch (panelId) {
      case 'dashboard': loadDashboard(); break;
      case 'bookings': loadBookings(); break;
      case 'calendar': renderAdminCalendar(); break;
      case 'inventory': renderInventory(); break;
      case 'gallery': loadGallery(); break;
      case 'contact': loadContactInfo(); break;
    }
  });
});

// Mobile sidebar toggle
$('#topbarMenu').addEventListener('click', () => {
  $('#sidebar').classList.toggle('open');
});

/* ============================================================
   3. DASHBOARD
   ============================================================ */
function loadDashboard() {
  const bookings = getLS('cc_bookings', []);
  const gallery  = getLS('cc_gallery', []);

  $('#dsTotalBookings').textContent = bookings.length;
  $('#dsPending').textContent   = bookings.filter(b => b.status === 'pending').length;
  $('#dsConfirmed').textContent  = bookings.filter(b => b.status === 'confirmed').length;
  $('#dsGallery').textContent    = gallery.length;

  // Recent 5 bookings
  const recent = bookings.slice(0, 5);
  const list = $('#dashRecentList');
  if (recent.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>No booking requests yet.</p></div>`;
    return;
  }
  list.innerHTML = recent.map(b => buildBookingCard(b, true)).join('');
  attachBookingActions(list);
}

/* ============================================================
   4. BOOKINGS
   ============================================================ */
function loadBookings() {
  const filter = $('#bookingFilter').value || 'all';
  renderBookingsList(filter);
}

$('#bookingFilter').addEventListener('change', loadBookings);

function renderBookingsList(filter) {
  let bookings = getLS('cc_bookings', []);
  if (filter !== 'all') bookings = bookings.filter(b => b.status === filter);

  const list = $('#bookingsList');
  const empty = $('#bookingsEmpty');

  if (bookings.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
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
    'college-fest': '🎓 College Fest', 'school-event': '🏫 School Event',
    'birthday': '🎂 Birthday Party', 'exhibition': '🎪 Exhibition',
    'corporate': '🏢 Corporate Event', 'other': '🎉 Other'
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
        <button class="btn-admin btn-sm btn-delete" data-action="delete" data-id="${b.id}">🗑️ Delete</button>
        <button class="btn-admin btn-sm btn-primary" data-action="notify-team" data-id="${b.id}">📢 Notify Team</button>
        <a href="https://wa.me/${b.phone.replace(/\D/g,'')}?text=Hi ${encodeURIComponent(b.name)}! We've received your booking request for ${b.eventDate}. We're excited to discuss this with you!" target="_blank" class="btn-admin btn-sm btn-ghost">💬 WhatsApp Customer</a>
      </div>` : ''}
    </div>
  `;
}

function attachBookingActions(container) {
  $$('[data-action]', container).forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const id = parseInt(btn.dataset.id);
      let bookings = getLS('cc_bookings', []);

      if (action === 'delete') {
        if (!confirm('Delete this booking request?')) return;
        bookings = bookings.filter(b => b.id !== id);
      } else if (action === 'notify-team') {
        notifyTeam(id);
        return;
      } else {
        bookings = bookings.map(b => b.id === id ? { ...b, status: action === 'confirm' ? 'confirmed' : 'rejected' } : b);
        if (action === 'confirm' || action === 'reject') {
          const b = bookings.find(item => item.id === id);
          notifyCustomerStatus(b);
        }
      }
      setLS('cc_bookings', bookings);
      loadBookings();
      loadDashboard();
    });
  });
}

// Notify Team link
function notifyTeam(id) {
  const b = getLS('cc_bookings', []).find(item => item.id === id);
  const info = getLS('cc_contact_info', {});
  if (!b) return;

  const msg = `🔔 *CRIPSY CORNER: NEW EVENT BOOKING!*
━━━━━━━━━━━━━━
👤 *CLIENT:* ${b.name}
📅 *DATE:* ${b.eventDate}
📍 *VENUE:* ${b.location}
💰 *STALL FEE:* ₹${b.stallFee || '0'}
👥 *CROWD:* ~${b.people} People
━━━━━━━━━━━━━━
Please check the Admin Panel to update inventory and confirm our availability! ✨🌶️`;

  // For static web, we open the WhatsApp link for the current admin to send to the group or their numbers.
  // Mentioning team members specifically if numbers are set.
  const teamMsg = `📢 Hey Team! We've got a new request from ${b.name}. Check the details below.`;
  
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

// ------------------------------------------------------------
// INVENTORY PRE-POPULATION
// ------------------------------------------------------------
function prePopulateInventory() {
  const inv = getLS('cc_inventory', []);
  if (inv.length > 0) return; // Only populate if empty

  const defaults = [
    { name: 'Blue Lays', category: 'packets', stock: '50', min: 10 },
    { name: 'Yellow Lays', category: 'packets', stock: '50', min: 10 },
    { name: 'Dark Yellow Lays', category: 'packets', stock: '50', min: 10 },
    { name: 'Tedhe Medhe', category: 'packets', stock: '50', min: 10 },
    { name: 'Kurkure Red', category: 'packets', stock: '50', min: 10 },
    { name: 'Kurkure Green', category: 'packets', stock: '50', min: 10 },
    { name: 'Mexilla (Yellow/Red)', category: 'packets', stock: '50', min: 10 },
    { name: 'Tandoori Mayo', category: 'sauces', stock: '5 units', min: 2 },
    { name: 'White Mayo', category: 'sauces', stock: '5 units', min: 2 },
    { name: 'Schezwan Sauce', category: 'sauces', stock: '5 units', min: 2 },
    { name: 'Sweet Corn Packets', category: 'raw', stock: '20', min: 5 },
    { name: 'Onion (kg)', category: 'raw', stock: '10', min: 2 },
    { name: 'Cucumber', category: 'raw', stock: '10', min: 2 },
    { name: 'Chiliflex / Oregano', category: 'raw', stock: '20', min: 5 }
  ];

  setLS('cc_inventory', defaults);
}

// Initializing
document.addEventListener('DOMContentLoaded', () => {
  prePopulateInventory();
  // Existing init logic...
});

function notifyCustomerStatus(b) {
  const status = b.status === 'confirmed' ? '✅ *ACCEPTED*' : '❌ *REJECTED*';
  const msg = `Hi ${b.name}! Your booking request for Cripsy Corner on ${b.eventDate} has been ${status}. 

${b.status === 'confirmed' ? 'We will contact you shortly to discuss further details. Get ready for some Cripsy magic! 🌶️✨' : 'Unfortunately, we are unavailable or unable to host a stall at this event. Thank you for your interest!'}`;
  
  window.open(`https://wa.me/${b.phone.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`, '_blank');
}

$('#clearBookingsBtn').addEventListener('click', () => {
  if (!confirm('Clear ALL booking requests? This cannot be undone.')) return;
  setLS('cc_bookings', []);
  loadBookings();
  loadDashboard();
});

/* ============================================================
   5. AVAILABILITY CALENDAR (Admin)
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

  const firstDay   = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();

  // Empty padding cells
  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement('div');
    el.className = 'cal-admin-day empty';
    container.appendChild(el);
  }

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr  = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const thisDate = new Date(year, month, d);
    const el = document.createElement('div');
    el.className = 'cal-admin-day';
    el.textContent = d;

    if (thisDate < today) {
      el.classList.add('past');
    } else if (thisDate.toDateString() === today.toDateString()) {
      el.classList.add('today');
      el.classList.add(bookedDates.includes(dateStr) ? 'booked' : 'available');
    } else {
      el.classList.add(bookedDates.includes(dateStr) ? 'booked' : 'available');
    }

    // Click to toggle booked/available
    if (!el.classList.contains('past')) {
      el.addEventListener('click', () => toggleDateBooked(dateStr));
    }
    container.appendChild(el);
  }

  renderBookedDatesList();
}

function toggleDateBooked(dateStr) {
  let booked = getLS('cc_booked_dates', []);
  if (booked.includes(dateStr)) {
    booked = booked.filter(d => d !== dateStr);
  } else {
    booked.push(dateStr);
    booked.sort();
  }
  setLS('cc_booked_dates', booked);
  renderAdminCalendar();
}

function renderBookedDatesList() {
  const booked = getLS('cc_booked_dates', []).sort();
  const list = $('#bookedDatesList');
  if (booked.length === 0) {
    list.innerHTML = `<span style="color:#666;font-size:13px;">No dates marked as booked yet.</span>`;
    return;
  }
  list.innerHTML = booked.map(d => {
    const formatted = new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'long', year:'numeric' });
    return `<div class="booked-date-pill">${formatted}<button class="booked-date-remove" data-date="${d}" title="Remove">✕</button></div>`;
  }).join('');

  $$('.booked-date-remove', list).forEach(btn => {
    btn.addEventListener('click', () => toggleDateBooked(btn.dataset.date));
  });
}

$('#adminCalPrev').addEventListener('click', () => { adminCalDate.setMonth(adminCalDate.getMonth()-1); renderAdminCalendar(); });
$('#adminCalNext').addEventListener('click', () => { adminCalDate.setMonth(adminCalDate.getMonth()+1); renderAdminCalendar(); });

/* ============================================================
   6. INVENTORY MANAGEMENT
   ============================================================ */
function renderInventory() {
  const inv = getLS('cc_inventory', []);
  const list = $('#inventoryList');
  const lowStockEl = $('#lowStockCount');
  
  if (!list) return;
  
  let lowCount = 0;
  
  if (inv.length === 0) {
    list.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px; color:#666;">No inventory items yet. Add your first item!</td></tr>';
    lowStockEl.textContent = 0;
    return;
  }

  list.innerHTML = inv.map((item, i) => {
    const current = parseFloat(item.stock) || 0;
    const min = parseFloat(item.min) || 0;
    const isLow = current <= min;
    if (isLow) lowCount++;

    return `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
        <td style="padding:12px;"><strong>${escHtml(item.name)}</strong></td>
        <td style="padding:12px;"><span style="font-size:11px; text-transform:uppercase; opacity:0.6;">${item.category}</span></td>
        <td style="padding:12px;">${item.stock}</td>
        <td style="padding:12px;">
          <span style="padding:4px 8px; border-radius:4px; font-size:11px; font-weight:800; ${isLow ? 'background:rgba(233,30,30,0.15); color:#f87171;' : 'background:rgba(0,200,100,0.1); color:#4ade80;'}">
            ${isLow ? '🔴 LOW STOCK' : '🟢 IN STOCK'}
          </span>
        </td>
        <td style="padding:12px;">
          <button class="btn-admin btn-sm btn-ghost" onclick="editInvItem(${i})">✏️</button>
          <button class="btn-admin btn-sm btn-ghost" style="color:#f87171;" onclick="deleteInvItem(${i})">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
  
  lowStockEl.textContent = lowCount;
}

$('#addInvBtn').addEventListener('click', () => {
  $('#addInvForm').reset();
  $('#inv-id').value = '';
  $('#addInvFormWrap').style.display = 'block';
});

$('#cancelInvBtn').addEventListener('click', () => {
  $('#addInvFormWrap').style.display = 'none';
});

$('#addInvForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const idStr = $('#inv-id').value;
  const items = getLS('cc_inventory', []);
  
  const newItem = {
    name: $('#inv-name').value,
    category: $('#inv-category').value,
    stock: $('#inv-stock').value,
    min: $('#inv-min').value
  };

  if (idStr !== '') {
    items[parseInt(idStr)] = newItem;
  } else {
    items.push(newItem);
  }

  setLS('cc_inventory', items);
  $('#addInvFormWrap').style.display = 'none';
  renderInventory();
  showToast('📦 Inventory updated!');
});

window.editInvItem = (i) => {
  const items = getLS('cc_inventory', []);
  const item = items[i];
  $('#inv-id').value = i;
  $('#inv-name').value = item.name;
  $('#inv-category').value = item.category;
  $('#inv-stock').value = item.stock;
  $('#inv-min').value = item.min;
  $('#addInvFormWrap').style.display = 'block';
  $('#addInvFormWrap').scrollIntoView({ behavior: 'smooth' });
};

window.deleteInvItem = (i) => {
  if (!confirm('Delete this item from inventory?')) return;
  const items = getLS('cc_inventory', []);
  items.splice(i, 1);
  setLS('cc_inventory', items);
  renderInventory();
};

/* ============================================================
   7. GALLERY MANAGER
   ============================================================ */
let pendingFiles = []; // Array of { file, dataUrl, caption, type }

function loadGallery() {
  const items = getLS('cc_gallery', []);
  const grid  = $('#galleryAdminGrid');
  const empty = $('#galleryEmpty');

  if (items.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  grid.innerHTML = items.map((item, i) => `
    <div class="gallery-admin-item">
      ${item.type === 'video'
        ? `<video src="${item.src}" muted loop autoplay playsinline style="width:100%;height:100%;object-fit:cover;"></video>`
        : `<img src="${item.src}" alt="${escHtml(item.caption || '')}" />`
      }
      <div class="gallery-admin-overlay">
        <div class="gallery-admin-caption">${escHtml(item.caption || 'No caption')}</div>
        <button class="gallery-admin-delete" data-index="${i}">🗑️ Remove</button>
      </div>
    </div>
  `).join('');

  $$('.gallery-admin-delete', grid).forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      if (!confirm('Remove this item from gallery?')) return;
      const items = getLS('cc_gallery', []);
      items.splice(idx, 1);
      setLS('cc_gallery', items);
      loadGallery();
      loadDashboard();
    });
  });
}

// File input change
$('#fileInput').addEventListener('change', (e) => {
  handleFiles(Array.from(e.target.files));
  e.target.value = ''; // reset
});

// Drag and drop
const uploadArea = $('#uploadArea');
uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  handleFiles(Array.from(e.dataTransfer.files));
});
uploadArea.addEventListener('click', () => $('#fileInput').click());

function handleFiles(files) {
  if (files.length === 0) return;
  const validFiles = files.filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
  if (validFiles.length === 0) { alert('Please select image or video files only.'); return; }

  pendingFiles = [];
  const previewRow = $('#uploadPreviewRow');
  previewRow.innerHTML = '';

  let loaded = 0;
  validFiles.forEach((file, i) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      const isVideo = file.type.startsWith('video/');
      pendingFiles.push({ dataUrl, caption: file.name.split('.')[0], type: isVideo ? 'video' : 'image' });

      const wrapper = document.createElement('div');
      wrapper.className = 'upload-preview-item';
      if (isVideo) {
        wrapper.innerHTML = `<video src="${dataUrl}" style="width:120px;height:90px;object-fit:cover;border-radius:10px;border:1px solid rgba(255,255,255,0.1);" muted></video>`;
      } else {
        wrapper.innerHTML = `<img src="${dataUrl}" style="width:120px;height:90px;object-fit:cover;border-radius:10px;border:1px solid rgba(255,255,255,0.1);" />`;
      }
      const captionInput = document.createElement('input');
      captionInput.type = 'text';
      captionInput.className = 'upload-preview-caption';
      captionInput.placeholder = 'Add caption...';
      captionInput.value = pendingFiles[pendingFiles.length-1].caption;
      captionInput.addEventListener('input', () => { pendingFiles[loaded].caption = captionInput.value; });

      const removeBtn = document.createElement('button');
      removeBtn.className = 'upload-preview-remove';
      removeBtn.innerHTML = '×';
      removeBtn.addEventListener('click', () => {
        pendingFiles.splice(i, 1);
        wrapper.remove();
        if (pendingFiles.length === 0) {
          $('#uploadForm').style.display = 'none';
          uploadArea.style.display = 'block';
        }
      });

      wrapper.appendChild(captionInput);
      wrapper.appendChild(removeBtn);
      previewRow.appendChild(wrapper);
      loaded++;

      if (loaded === validFiles.length) {
        uploadArea.style.display = 'none';
        $('#uploadForm').style.display = 'block';
      }
    };
    reader.readAsDataURL(file);
  });
}

$('#addToGalleryBtn').addEventListener('click', () => {
  if (pendingFiles.length === 0) return;
  const gallery = getLS('cc_gallery', []);
  pendingFiles.forEach(f => {
    gallery.push({ src: f.dataUrl, caption: f.caption, type: f.type, addedAt: new Date().toISOString() });
  });
  setLS('cc_gallery', gallery);
  pendingFiles = [];
  $('#uploadForm').style.display = 'none';
  uploadArea.style.display = 'block';
  $('#uploadPreviewRow').innerHTML = '';
  loadGallery();
  loadDashboard();
  showToast('✅ Gallery updated! Refresh website to see changes.');
});

$('#cancelUploadBtn').addEventListener('click', () => {
  pendingFiles = [];
  $('#uploadForm').style.display = 'none';
  uploadArea.style.display = 'block';
  $('#uploadPreviewRow').innerHTML = '';
});

/* ============================================================
   7. CONTACT INFO
   ============================================================ */
function loadContactInfo() {
  const info = getLS('cc_contact', {});
  $('#ci-phone').value = info.phone || '';
  $('#ci-whatsapp').value = info.whatsapp || '';
  $('#ci-email').value = info.email || '';
  $('#ci-instagram').value = info.instagram || '';
  $('#ci-city').value = info.city || '';
  $('#ci-team1').value = info.team1 || '';
  $('#ci-team2').value = info.team2 || '';
  $('#ci-team3').value = info.team3 || '';

  renderContactSnippet(info);
}

$('#contactFormAdmin').addEventListener('submit', (e) => {
  e.preventDefault();
  const info = {
    phone: $('#ci-phone').value,
    whatsapp: $('#ci-whatsapp').value,
    email: $('#ci-email').value,
    instagram: $('#ci-instagram').value,
    city: $('#ci-city').value,
    team1: $('#ci-team1').value,
    team2: $('#ci-team2').value,
    team3: $('#ci-team3').value
  };
  setLS('cc_contact', info);
  const note = $('#contactSavedNote');
  note.style.display = 'block';
  setTimeout(() => note.style.display = 'none', 3000);
  renderContactSnippet(info);
  showToast('✅ Contact & Team info saved!');
});

function renderContactSnippet(info) {
  const snippet = $('#contactSnippet');
  snippet.innerHTML = `
    <div>📞 <strong>Phone:</strong> ${info.phone || '—'}</div>
    <div>💬 <strong>WhatsApp:</strong> ${info.whatsapp || '—'}</div>
    <div>✉️ <strong>Email:</strong> ${info.email || '—'}</div>
    <div>📸 <strong>Instagram:</strong> ${info.instagram || '—'}</div>
    <div>📍 <strong>City:</strong> ${info.city || '—'}</div>
    <div style="margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.05);">
      <strong>👥 Team Members:</strong><br/>
      1: ${info.team1 || '—'}<br/>
      2: ${info.team2 || '—'}<br/>
      3: ${info.team3 || '—'}
    </div>
    <br/>
    <small style="color:#666;">Update these in your index.html file manually for the website to reflect the changes.</small>
  `;
}

/* ============================================================
   8. SETTINGS — Change Password
   ============================================================ */
$('#changePasswordForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const current  = $('#currentPwd').value;
  const next     = $('#newPwd').value;
  const confirm  = $('#confirmPwd').value;
  const msg = $('#pwdMsg');

  if (current !== getPassword()) {
    msg.textContent = '❌ Current password is incorrect.';
    msg.className = 'pwd-msg error'; return;
  }
  if (next.length < 6) {
    msg.textContent = '❌ New password must be at least 6 characters.';
    msg.className = 'pwd-msg error'; return;
  }
  if (next !== confirm) {
    msg.textContent = '❌ Passwords do not match.';
    msg.className = 'pwd-msg error'; return;
  }
  localStorage.setItem('cc_admin_pwd', next);
  msg.textContent = '✅ Password changed successfully!';
  msg.className = 'pwd-msg success';
  $('#changePasswordForm').reset();
  setTimeout(() => msg.textContent = '', 4000);
});

// Settings — data clear
$('#clearAllBookings').addEventListener('click', () => {
  if (!confirm('Clear ALL booking requests? Cannot be undone.')) return;
  setLS('cc_bookings', []); loadDashboard(); showToast('Bookings cleared.');
});
$('#clearAllGallery').addEventListener('click', () => {
  if (!confirm('Clear ALL gallery items? Cannot be undone.')) return;
  setLS('cc_gallery', []); loadDashboard(); showToast('Gallery cleared.');
});
$('#clearCalendar').addEventListener('click', () => {
  if (!confirm('Reset all booked dates?')) return;
  setLS('cc_booked_dates', []); showToast('Calendar reset.');
});

/* ============================================================
   9. TOAST NOTIFICATIONS
   ============================================================ */
function showToast(msg, duration = 3000) {
  let toast = document.createElement('div');
  toast.style.cssText = `
    position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(80px);
    background:#1e1e1e;border:1px solid rgba(255,122,0,0.3);color:#fff;
    padding:12px 24px;border-radius:30px;font-size:14px;font-weight:700;
    z-index:9999;transition:transform 0.4s cubic-bezier(0.34,1.56,0.64,1),opacity 0.3s;
    box-shadow:0 8px 30px rgba(0,0,0,0.5);pointer-events:none;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(30px)';
      setTimeout(() => toast.remove(), 400);
    }, duration);
  });
}

/* ============================================================
   10. UTILITY
   ============================================================ */
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ============================================================
   INIT
   ============================================================ */
checkAuth();
