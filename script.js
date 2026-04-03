'use strict';

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

/* 🐘 SUPABASE LIVE SYNC ENGINE — Dedicated Tables Sync */
const SB = () => window.sb;

async function syncAllFromCloud() {
    if (!SB()) return;
    try {
        console.log("☁️ Syncing Cloud Data...");
        
        // Parallel fetch for speed
        const [bookings, dates, gallery, contact] = await Promise.all([
            SB().from('bookings').select('*'),
            SB().from('booked_dates').select('*'),
            SB().from('gallery').select('*'),
            SB().from('contact_info').select('*').eq('id', 1).single()
        ]);

        if (bookings.data) localStorage.setItem('cc_bookings', JSON.stringify(bookings.data));
        if (dates.data) localStorage.setItem('cc_booked_dates', JSON.stringify(dates.data.map(d => d.date_str)));
        if (gallery.data) {
            localStorage.setItem('cc_gallery', JSON.stringify(gallery.data.map(g => ({ 
                src: g.src, 
                caption: g.caption, 
                type: g.media_type 
            }))));
        }
        if (contact.data) localStorage.setItem('cc_contact', JSON.stringify(contact.data));

        // Initial UI update
        refreshPublicUI();
    } catch (e) { console.error("Sync error:", e); }
}

function refreshPublicUI() {
    if (typeof loadContactInfo === 'function') loadContactInfo();
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof loadAdminGallery === 'function') loadAdminGallery();
}

if (SB()) {
    console.log("🐘 Live Home Sync Active");
    syncAllFromCloud();

    // Individual table listeners
    const tables = ['bookings', 'booked_dates', 'gallery', 'contact_info'];
    tables.forEach(table => {
        SB().channel(`public:${table}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: table }, () => {
                console.log(`🔄 Remote Update: ${table}`);
                syncAllFromCloud();
            })
            .subscribe();
    });
}

// Mobile Menu Toggle
const navToggle = $('#navToggle');
const navLinks = $('#navLinks');
if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    const expanded = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', !expanded);
    navLinks.classList.toggle('active');
  });
}

// Close menu when link is clicked
$$('.nav-link').forEach(link => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('active');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

// Scroll Effects (Navbar & Reveal)
window.addEventListener('scroll', () => {
  const nav = $('#navbar');
  if (window.scrollY > 50) nav.classList.add('scrolled');
  else nav.classList.remove('scrolled');

  // Reveal elements on scroll
  const reveals = $$('.reveal-up, .reveal-left, .reveal-right');
  reveals.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.85) el.classList.add('active');
  });
});

// Booking Form Logic
const bookingForm = $('#bookingForm');
if (bookingForm) {
  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = $('#submitBtn');
    const formSuccess = $('#formSuccess');
    
    if (submitBtn.disabled) return;
    submitBtn.disabled = true;
    submitBtn.querySelector('.submit-text').style.display = 'none';
    submitBtn.querySelector('.submit-loading').style.display = 'inline';

    // Form submission data
    const submission = {
      id: Date.now(),
      name: $('#fullName').value,
      phone: $('#phoneNumber').value,
      email: $('#emailAddress').value,
      event_type: $('#eventType').value,
      event_date: $('#eventDate').value,
      location: $('#eventLocation').value,
      people: $('#expectedPeople').value,
      stall_fee: $('#stallFee').value,
      message: $('#message').value,
      status: 'pending',
      submitted_at: new Date().toISOString()
    };

    // 2. Save directly to Supabase table
    if (SB()) {
        try {
            const { error } = await SB().from('bookings').insert([submission]);
            if (error) throw error;
            console.log("☁️ Booking Synced to Supabase");
        } catch (e) { 
            console.error("Supabase Save Error:", e);
            // Local fallback if cloud fails
            const local = JSON.parse(localStorage.getItem('cc_bookings') || '[]');
            local.unshift(submission);
            localStorage.setItem('cc_bookings', JSON.stringify(local));
        }
    } else {
        const local = JSON.parse(localStorage.getItem('cc_bookings') || '[]');
        local.unshift(submission);
        localStorage.setItem('cc_bookings', JSON.stringify(local));
    }

    await new Promise(r => setTimeout(r, 600)); // Snappy fake loading
    submitBtn.style.display = 'none';
    formSuccess.style.display = 'block';
    bookingForm.reset();

    setTimeout(() => {
      formSuccess.style.display = 'none';
      submitBtn.style.display = '';
      submitBtn.disabled = false;
      submitBtn.querySelector('.submit-text').style.display = '';
      submitBtn.querySelector('.submit-loading').style.display = 'none';
    }, 5000);
  });
}

// 📸 PUBLIC GALLERY LOADER
function loadAdminGallery() {
  const adminItems = JSON.parse(localStorage.getItem('cc_gallery') || '[]');
  const grid = $('#galleryGrid');
  if (!grid || adminItems.length === 0) return;

  // Clear placeholders if cloud data exists
  grid.innerHTML = '';

  adminItems.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'gallery-item reveal-up active';
    div.style.setProperty('--delay', `${(index * 0.1).toFixed(1)}s`);

    if (item.type === 'video') {
      div.innerHTML = `
        <video src="${item.src}" muted loop autoplay playsinline style="width:100%;height:100%;object-fit:cover;"></video>
        <div class="gallery-overlay"><span class="gallery-tag">${item.caption || 'Video'}</span></div>
      `;
    } else {
      div.innerHTML = `
        <img src="${item.src}" alt="${item.caption || 'Gallery Image'}" loading="lazy" />
        <div class="gallery-overlay"><span class="gallery-tag">${item.caption || 'Live Moment'}</span></div>
      `;
    }
    grid.appendChild(div);
  });
}

// 📅 CALENDAR RENDERER
let currentCalDate = new Date();
function renderCalendar() {
  const bookedDates = JSON.parse(localStorage.getItem('cc_booked_dates') || '[]');
  const year = currentCalDate.getFullYear();
  const month = currentCalDate.getMonth();
  const today = new Date(); today.setHours(0,0,0,0);

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const label = $('#calMonthLabel');
  if (label) label.textContent = `${monthNames[month]} ${year}`;

  const container = $('#calDays');
  if (!container) return;
  container.innerHTML = '';

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day empty';
    container.appendChild(el);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const thisDate = new Date(year, month, d);
    const el = document.createElement('div');
    el.className = 'cal-day';
    el.textContent = d;

    if (thisDate < today) {
      el.classList.add('past');
    } else if (thisDate.toDateString() === today.toDateString()) {
      el.classList.add('today');
      if (bookedDates.includes(dateStr)) el.classList.add('booked');
    } else if (bookedDates.includes(dateStr)) {
      el.classList.add('booked');
    }

    container.appendChild(el);
  }
}

$('#calPrev')?.addEventListener('click', () => { currentCalDate.setMonth(currentCalDate.getMonth()-1); renderCalendar(); });
$('#calNext')?.addEventListener('click', () => { currentCalDate.setMonth(currentCalDate.getMonth()+1); renderCalendar(); });

// 📞 CONTACT INFO LOADER
function loadContactInfo() {
  const info = JSON.parse(localStorage.getItem('cc_contact') || '{}');
  
  const setAttr = (id, attr, val) => { const el = $(id); if (el) el.setAttribute(attr, val); };
  const setText = (id, val) => { const el = $(id); if (el) el.textContent = val; };

  if (info.phone) {
    setAttr('#contactPhone', 'href', `tel:${info.phone}`);
    setText('#contactPhone p', info.phone);
  }
  if (info.whatsapp) {
    const waUrl = `https://wa.me/${info.whatsapp.replace(/\D/g,'')}?text=Hi! I am interested in booking Cripsy Corner.`;
    setAttr('#contactWhatsapp', 'href', waUrl);
    setAttr('#whatsappFab', 'href', waUrl);
    setText('#contactWhatsapp p', info.whatsapp);
  }
  if (info.instagram) {
    setAttr('#contactInstagram', 'href', `https://instagram.com/${info.instagram.replace('@','')}`);
    setText('#contactInstagram p', info.instagram.startsWith('@') ? info.instagram : `@${info.instagram}`);
  }
  if (info.email) {
    setAttr('#contactEmail', 'href', `mailto:${info.email}`);
    setText('#contactEmail p', info.email);
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Delay initial loads slightly to allow Supabase to finish sync
  setTimeout(() => {
    loadContactInfo();
    renderCalendar();
    loadAdminGallery();
  }, 100);

  // Hide Loader
  const loader = $('#loader');
  if (loader) {
    setTimeout(() => {
      loader.classList.add('fade-out');
      setTimeout(() => loader.style.display = 'none', 600);
    }, 1500);
  }
});
