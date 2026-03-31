'use strict';

/* ---- DOM Helpers ---- */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

/* 🐘 SUPABASE LIVE SYNC ENGINE */
const CLOUD_ENABLED = (typeof supabase !== 'undefined' && supabase !== null);

if (CLOUD_ENABLED) {
    console.log("🐘 Live Home Sync Active");
    
    // 1. Initial Fetch (Catch up on any missed data)
    supabase.from('settings').select('*').then(({ data }) => {
        if (data) {
            data.forEach(row => {
                localStorage.setItem(row.key, JSON.stringify(row.value));
            });
            // Initial UI update
            if (typeof loadContactInfo === 'function') loadContactInfo();
            if (typeof renderCalendar === 'function') renderCalendar();
            if (typeof loadAdminGallery === 'function') loadAdminGallery();
        }
    });

    // 2. Real-time Subscription (Instant updates)
    supabase
        .channel('public:settings')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, payload => {
            const row = payload.new;
            if (!row) return;
            
            localStorage.setItem(row.key, JSON.stringify(row.value));
            console.log(`🔄 Remote Update: ${row.key}`);
            
            // Trigger UI refreshes
            if (row.key === 'cc_contact' && typeof loadContactInfo === 'function') loadContactInfo();
            if (row.key === 'cc_booked_dates' && typeof renderCalendar === 'function') renderCalendar();
            if (row.key === 'cc_gallery' && typeof loadAdminGallery === 'function') loadAdminGallery();
        })
        .subscribe();
}


/* ============================================================
   1. LOADER
   ============================================================ */
window.addEventListener('load', () => {
  const loader = $('#loader');
  setTimeout(() => {
    loader.classList.add('hidden');
    document.body.style.overflow = '';
    triggerHeroTextReveal();
  }, 2400);
});
document.body.style.overflow = 'hidden';

/* ============================================================
   2. FLOATING BG PARTICLES
   ============================================================ */
(function createParticles() {
  const container = $('#floatingBg');
  if (!container) return;
  const emojis = ['🌶️', '🧅', '🌽', '🥒', '✨', '🍟', '🫙', '🔥', '⭐'];
  for (let i = 0; i < 22; i++) {
    const el = document.createElement('div');
    el.className = 'float-particle';
    el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    el.style.cssText = `left:${Math.random()*100}%;top:${Math.random()*100}%;font-size:${14+Math.random()*18}px;animation-duration:${12+Math.random()*20}s;animation-delay:${-Math.random()*20}s;`;
    container.appendChild(el);
  }
})();

/* ============================================================
   3. NAVBAR
   ============================================================ */
const navbar = $('#navbar');
const navToggle = $('#navToggle');
const navLinks = $('#navLinks');
const allNavLinks = $$('.nav-link');

window.addEventListener('scroll', () => {
  if (navbar) navbar.classList.toggle('scrolled', window.scrollY > 40);
  updateActiveNavLink();
  updateScrollProgress();
}, { passive: true });

if (navToggle) {
  navToggle.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    navToggle.classList.toggle('open', open);
    navToggle.setAttribute('aria-expanded', String(open));
  });
}
allNavLinks.forEach(link => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    navToggle.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

function updateActiveNavLink() {
  const sections = $$('section[id]');
  const scrollY = window.scrollY + 100;
  sections.forEach(section => {
    const top = section.offsetTop;
    const id = section.getAttribute('id');
    const link = $(`.nav-link[href="#${id}"]`);
    if (link) link.classList.toggle('active', scrollY >= top && scrollY < top + section.offsetHeight);
  });
}

/* ============================================================
   4. SCROLL PROGRESS
   ============================================================ */
function updateScrollProgress() {
  const bar = $('#scrollProgress');
  if (!bar) return;
  const docH = document.documentElement.scrollHeight - window.innerHeight;
  bar.style.width = (docH > 0 ? (window.scrollY / docH) * 100 : 0) + '%';
}

/* ============================================================
   5. HERO TEXT REVEAL
   ============================================================ */
function triggerHeroTextReveal() {
  const els = ['.hero-badge', '.headline-line1', '.headline-line2', '.hero-sub', '.hero-buttons', '.hero-stats'];
  els.forEach((sel, i) => {
    setTimeout(() => {
      const el = $(sel);
      if (el) el.classList.add('visible');
    }, 200 + i * 150);
  });
}

/* ============================================================
   6. INTERSECTION OBSERVER — Scroll Reveal
   ============================================================ */
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
$$('.reveal-up, .reveal-left, .reveal-right').forEach(el => revealObserver.observe(el));

/* ============================================================
   7. SMOOTH SCROLL
   ============================================================ */
$$('a[href^="#"]').forEach(link => {
  link.addEventListener('click', e => {
    const id = link.getAttribute('href').slice(1);
    const target = document.getElementById(id);
    if (target) {
      e.preventDefault();
      window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 68, behavior: 'smooth' });
    }
  });
});

/* ============================================================
   8. PARALLAX — Hero BG
   ============================================================ */
const heroBg = $('.hero-bg-gradient');
window.addEventListener('scroll', () => {
  if (heroBg) heroBg.style.transform = `translateY(${window.scrollY * 0.3}px)`;
}, { passive: true });

/* ============================================================
   9. BOOKING FORM
   ============================================================ */
const bookingForm = $('#bookingForm');
const submitBtn = $('#submitBtn');
const formSuccess = $('#formSuccess');

const dateInput = $('#eventDate');
if (dateInput) dateInput.setAttribute('min', new Date().toISOString().split('T')[0]);

if (bookingForm) {
  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fields = $$('[required]', bookingForm);
    let valid = true;
    fields.forEach(f => { f.style.borderColor = ''; if (!f.value.trim()) { f.style.borderColor = '#e91e1e'; valid = false; } });
    if (!valid) { submitBtn.style.animation = 'none'; submitBtn.offsetWidth; submitBtn.style.animation = 'shakeMix 0.5s ease'; return; }

    const submitText = $('.submit-text', submitBtn);
    const submitLoading = $('.submit-loading', submitBtn);
    submitBtn.disabled = true;
    submitText.style.display = 'none';
    submitLoading.style.display = 'inline';

    // Save to localStorage for admin panel
    const submission = {
      id: Date.now(),
      name: $('#fullName').value,
      phone: $('#phoneNumber').value,
      email: $('#emailAddress').value,
      eventType: $('#eventType').value,
      eventDate: $('#eventDate').value,
      location: $('#eventLocation').value,
      people: $('#expectedPeople').value,
      stallFee: $('#stallFee').value,
      message: $('#message').value,
      status: 'pending',
      submittedAt: new Date().toISOString()
    };
    const bookings = JSON.parse(localStorage.getItem('cc_bookings') || '[]');
    bookings.unshift(submission);
    localStorage.setItem('cc_bookings', JSON.stringify(bookings));

    await new Promise(r => setTimeout(r, 1400));
    submitBtn.style.display = 'none';
    formSuccess.style.display = 'block';
    bookingForm.reset();

    setTimeout(() => {
      formSuccess.style.display = 'none';
      submitBtn.style.display = '';
      submitBtn.disabled = false;
      submitText.style.display = '';
      submitLoading.style.display = 'none';
    }, 5000);
  });
}

/* ============================================================
   10. BUTTON RIPPLE
   ============================================================ */
$$('.btn').forEach(btn => {
  btn.addEventListener('click', function (e) {
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.style.cssText = `position:absolute;border-radius:50%;background:rgba(255,255,255,0.25);width:10px;height:10px;left:${e.clientX - rect.left - 5}px;top:${e.clientY - rect.top - 5}px;transform:scale(0);animation:rippleEffect 0.6s ease-out forwards;pointer-events:none;`;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  });
});
const rippleStyle = document.createElement('style');
rippleStyle.textContent = `@keyframes rippleEffect{to{transform:scale(30);opacity:0}} @keyframes shakeMix{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}`;
document.head.appendChild(rippleStyle);

/* ============================================================
   11. GALLERY LIGHTBOX
   ============================================================ */
$$('.gallery-item').forEach(item => {
  item.addEventListener('click', () => {
    const img = $('img', item);
    if (!img) return;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,0.95);display:flex;align-items:center;justify-content:center;cursor:zoom-out;animation:lbFadeIn 0.3s ease;';
    const image = document.createElement('img');
    image.src = img.src; image.alt = img.alt;
    image.style.cssText = 'max-width:92vw;max-height:90vh;border-radius:16px;box-shadow:0 20px 80px rgba(0,0,0,0.8);animation:lbScaleIn 0.35s cubic-bezier(0.34,1.56,0.64,1);';
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = 'position:absolute;top:24px;right:24px;background:rgba(255,255,255,0.1);border:none;color:#fff;font-size:24px;width:44px;height:44px;border-radius:50%;cursor:pointer;';
    overlay.appendChild(image); overlay.appendChild(closeBtn);
    document.body.appendChild(overlay); document.body.style.overflow = 'hidden';
    const close = () => { overlay.remove(); document.body.style.overflow = ''; };
    overlay.addEventListener('click', e => { if (e.target === overlay || e.target === closeBtn) close(); });
    document.addEventListener('keydown', function h(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', h); } });
    if (!document.getElementById('lbStyles')) {
      const s = document.createElement('style'); s.id = 'lbStyles';
      s.textContent = '@keyframes lbFadeIn{from{opacity:0}to{opacity:1}} @keyframes lbScaleIn{from{transform:scale(0.85);opacity:0}to{transform:scale(1);opacity:1}}';
      document.head.appendChild(s);
    }
  });
});

/* ============================================================
   12. DYNAMIC GALLERY from Admin localStorage
   ============================================================ */
function loadAdminGallery() {
  const adminItems = JSON.parse(localStorage.getItem('cc_gallery') || '[]');
  const grid = $('#galleryGrid');
  if (!grid || adminItems.length === 0) return;

  // Remove "Add More" placeholder if exists
  adminItems.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'gallery-item reveal-up';
    div.style.setProperty('--delay', (i * 0.1) + 's');
    if (item.type === 'video') {
      div.innerHTML = `<video src="${item.src}" style="width:100%;height:100%;object-fit:cover;" muted loop autoplay playsinline></video><div class="gallery-overlay"><span class="gallery-tag">${item.caption || 'Video 🎬'}</span></div>`;
    } else {
      div.innerHTML = `<img src="${item.src}" alt="${item.caption || 'Gallery'}" loading="lazy" /><div class="gallery-overlay"><span class="gallery-tag">${item.caption || 'Photo 📸'}</span></div>`;
    }
    grid.appendChild(div);
    revealObserver.observe(div);
    // Add click for lightbox on images
    if (item.type !== 'video') {
      const img = $('img', div);
      div.addEventListener('click', () => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,0.95);display:flex;align-items:center;justify-content:center;cursor:zoom-out;';
        const image = document.createElement('img');
        image.src = item.src; image.style.cssText = 'max-width:92vw;max-height:90vh;border-radius:16px;';
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕'; closeBtn.style.cssText = 'position:absolute;top:24px;right:24px;background:rgba(255,255,255,0.1);border:none;color:#fff;font-size:24px;width:44px;height:44px;border-radius:50%;cursor:pointer;';
        overlay.appendChild(image); overlay.appendChild(closeBtn); document.body.appendChild(overlay);
        const close = () => { overlay.remove(); document.body.style.overflow = ''; };
        overlay.addEventListener('click', e => { if (e.target === overlay || e.target === closeBtn) close(); });
      });
    }
  });
}
loadAdminGallery();

/* ============================================================
   13. AVAILABILITY CALENDAR
   ============================================================ */
let calCurrentDate = new Date();
calCurrentDate.setDate(1);

function renderCalendar() {
  const bookedDates = JSON.parse(localStorage.getItem('cc_booked_dates') || '[]');
  const year = calCurrentDate.getFullYear();
  const month = calCurrentDate.getMonth();
  const today = new Date();
  today.setHours(0,0,0,0);

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const label = $('#calMonthLabel');
  if (label) label.textContent = `${monthNames[month]} ${year}`;

  const daysContainer = $('#calDays');
  if (!daysContainer) return;
  daysContainer.innerHTML = '';

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Empty cells for start padding
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day empty';
    daysContainer.appendChild(empty);
  }

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const thisDate = new Date(year, month, d);
    const cell = document.createElement('div');
    cell.className = 'cal-day';
    cell.textContent = d;

    if (thisDate < today) {
      cell.classList.add('past');
    } else if (thisDate.toDateString() === today.toDateString()) {
      cell.classList.add('today');
    } else if (bookedDates.includes(dateStr)) {
      cell.classList.add('booked');
    } else {
      cell.classList.add('available');
    }
    daysContainer.appendChild(cell);
  }
}

const calPrev = $('#calPrev');
const calNext = $('#calNext');
if (calPrev) calPrev.addEventListener('click', () => { calCurrentDate.setMonth(calCurrentDate.getMonth() - 1); renderCalendar(); });
if (calNext) calNext.addEventListener('click', () => { calCurrentDate.setMonth(calCurrentDate.getMonth() + 1); renderCalendar(); });
renderCalendar();

/* ============================================================
   14. CUSTOM CURSOR (desktop only)
   ============================================================ */
if (window.innerWidth > 768) {
  const cursor = document.createElement('div');
  cursor.style.cssText = 'position:fixed;width:28px;height:28px;border:2px solid rgba(255,122,0,0.5);border-radius:50%;pointer-events:none;z-index:10000;transform:translate(-50%,-50%);transition:transform 0.15s ease,opacity 0.3s,border-color 0.3s,width 0.2s,height 0.2s;opacity:0;';
  document.body.appendChild(cursor);
  let visible = false;
  document.addEventListener('mousemove', e => {
    cursor.style.left = e.clientX + 'px'; cursor.style.top = e.clientY + 'px';
    if (!visible) { cursor.style.opacity = '1'; visible = true; }
  });
  document.addEventListener('mouseleave', () => { cursor.style.opacity = '0'; visible = false; });
  $$('a,button,.gallery-item,.contact-card,.hiw-step,.pricing-card,.cal-day').forEach(el => {
    el.addEventListener('mouseenter', () => { cursor.style.width = '44px'; cursor.style.height = '44px'; cursor.style.borderColor = 'rgba(255,215,0,0.8)'; });
    el.addEventListener('mouseleave', () => { cursor.style.width = '28px'; cursor.style.height = '28px'; cursor.style.borderColor = 'rgba(255,122,0,0.5)'; });
  });
}

/* ============================================================
   15. AUTOMATED CONTACT INFO
   ============================================================ */
function loadContactInfo() {
  const info = JSON.parse(localStorage.getItem('cc_contact') || '{}');
  if (Object.keys(info).length === 0) return;

  const fmtPhone = (p) => p.replace(/\s+/g, '');
  const waPhone = (p) => {
    let clean = p.replace(/\D/g, '');
    if (clean.length === 10) clean = '91' + clean;
    return clean;
  };

  // Update Call Card
  const phoneCard = $('#contactPhone');
  if (phoneCard && info.phone) {
    phoneCard.href = `tel:${fmtPhone(info.phone)}`;
    $('p', phoneCard).textContent = info.phone;
  }

  // Update WhatsApp Card
  const waCard = $('#contactWhatsapp');
  if (waCard && info.whatsapp) {
    const cleanWA = waPhone(info.whatsapp);
    waCard.href = `https://wa.me/${cleanWA}?text=Hi! I am interested in booking Cripsy Corner for my event.`;
    $('p', waCard).textContent = info.whatsapp;
  }

  // Update Instagram Card
  const igCard = $('#contactInstagram');
  if (igCard && info.instagram) {
    const handle = info.instagram.startsWith('@') ? info.instagram : '@' + info.instagram;
    const cleanHandle = info.instagram.replace('@', '');
    igCard.href = `https://instagram.com/${cleanHandle}`;
    $('p', igCard).textContent = handle;
  }

  // Update Email Card
  const emailCard = $('#contactEmail');
  if (emailCard && info.email) {
    emailCard.href = `mailto:${info.email}`;
    $('p', emailCard).textContent = info.email;
  }

  // Update Floating WhatsApp Button
  const waFab = $('#whatsappFab');
  if (waFab && info.whatsapp) {
    const cleanWA = waPhone(info.whatsapp);
    waFab.href = `https://wa.me/${cleanWA}?text=Hi! I am interested in booking Cripsy Corner for my event.`;
  }

  // Update Team Members in About Section
  const teamText = $('#aboutTeamText');
  if (teamText && (info.team1 || info.team2 || info.team3)) {
    const members = [info.team1, info.team2, info.team3].filter(m => !!m);
    let memberStr = '';
    if (members.length === 1) memberStr = members[0];
    else if (members.length === 2) memberStr = `${members[0]} and ${members[1]}`;
    else if (members.length === 3) memberStr = `${members[0]}, ${members[1]}, and ${members[2]}`;
    
    if (memberStr) {
      teamText.innerHTML = `Cripsy Corner is perfect for college fests, school events, birthday parties, exhibitions, and corporate events. Started by <strong>${memberStr}</strong>, Cripsy Corner is not just food — it's an experience.`;
    }
  }
}
loadContactInfo();

console.log('%c🌶️ Cripsy Corner — From Packet to Perfect Snack!', 'color:#FF7A00;font-weight:bold;font-size:16px;');
