'use strict';

/* ---- DOM Helpers ---- */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

/* ============================================================
   SUPABASE LIVE SYNC
   ============================================================ */
const CLOUD_ENABLED = (typeof window.sb !== 'undefined' && window.sb !== null);

if (CLOUD_ENABLED) {
  console.log('🐘 Live Home Sync Active');

  // Initial fetch from settings table (last-write-wins guard per key)
  window.sb.from('settings').select('*').then(({ data }) => {
    if (data) {
      data.forEach(row => {
        const tsKey = 'cc_cloud_ts:' + row.key;
        const remoteTs = row.updated_at || '';
        const localTs  = localStorage.getItem(tsKey) || '';
        if (!localTs || remoteTs >= localTs) {
          localStorage.setItem(row.key, JSON.stringify(row.value));
          if (remoteTs) localStorage.setItem(tsKey, remoteTs);
        }
      });
      if (typeof loadContactInfo === 'function') loadContactInfo();
      if (typeof renderCalendar === 'function') renderCalendar();
    }
  });

  // Real-time changes (last-write-wins guard per key)
  window.sb
    .channel('home:settings')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, payload => {
      const row = payload.new;
      if (!row) return;
      const tsKey = 'cc_cloud_ts:' + row.key;
      const remoteTs = row.updated_at || '';
      const localTs  = localStorage.getItem(tsKey) || '';
      if (!localTs || remoteTs >= localTs) {
        localStorage.setItem(row.key, JSON.stringify(row.value));
        if (remoteTs) localStorage.setItem(tsKey, remoteTs);
        if (row.key === 'cc_contact' && typeof loadContactInfo === 'function') loadContactInfo();
        if (row.key === 'cc_booked_dates' && typeof renderCalendar === 'function') renderCalendar();
        if (row.key === 'cc_gallery' && typeof loadAdminGallery === 'function') loadAdminGallery();
      }
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
    initHeroCanvas();
  }, 800);
});
document.body.style.overflow = 'hidden';

/* ============================================================
   2. HERO 3D CANVAS ANIMATION
   ============================================================ */
function initHeroCanvas() {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  const EMOJIS = ['🌶️', '🧅', '🌽', '🥒', '🫙', '📦', '✨', '⭐', '🔥', '🍟', '🧂', '🎉'];
  const FOV = 420;
  const NUM = 48;

  class Particle {
    constructor(initial) { this.reset(initial); }
    reset(initial) {
      this.x  = (Math.random() - 0.5) * 1400;
      this.y  = (Math.random() - 0.5) * 1000;
      this.z  = initial ? Math.random() * 900 : 900;
      this.vx = (Math.random() - 0.5) * 0.7;
      this.vy = (Math.random() - 0.5) * 0.7;
      this.vz = -(1.4 + Math.random() * 2.6);
      this.emoji   = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
      this.rot     = Math.random() * Math.PI * 2;
      this.rotSpd  = (Math.random() - 0.5) * 0.028;
      this.base    = 22 + Math.random() * 22;
    }
    update() {
      this.x += this.vx; this.y += this.vy; this.z += this.vz;
      this.rot += this.rotSpd;
      if (this.z < -FOV * 0.85) this.reset(false);
    }
    draw(cx, cy) {
      const sc = FOV / (FOV + this.z);
      if (sc <= 0.04 || sc > 3.5) return;
      const sx = cx + this.x * sc;
      const sy = cy + this.y * sc;
      const size = this.base * sc;
      let alpha = Math.min(0.92, sc * 1.25);
      if (this.z < 0) alpha *= Math.max(0, 1 + this.z / (FOV * 0.85));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `${size}px serif`;
      ctx.translate(sx, sy);
      ctx.rotate(this.rot);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.emoji, 0, 0);
      ctx.restore();
    }
  }

  /* Coloured spark/burst dots for depth effect */
  class Spark {
    constructor() { this.reset(); }
    reset() {
      this.x = (Math.random() - 0.5) * 900;
      this.y = (Math.random() - 0.5) * 700;
      this.z = 100 + Math.random() * 600;
      this.vx = (Math.random() - 0.5) * 2;
      this.vy = (Math.random() - 0.5) * 2;
      this.vz = -(0.8 + Math.random() * 1.5);
      this.r  = 2 + Math.random() * 3.5;
      this.hue = 20 + Math.random() * 40;
      this.life = 0; this.maxLife = 100 + Math.random() * 80;
    }
    update() {
      this.x += this.vx; this.y += this.vy; this.z += this.vz;
      this.life++;
      if (this.life >= this.maxLife || this.z < -FOV * 0.8) this.reset();
    }
    draw(cx, cy) {
      const sc = FOV / (FOV + this.z);
      if (sc <= 0) return;
      const sx = cx + this.x * sc, sy = cy + this.y * sc;
      const r = Math.max(0.5, this.r * sc);
      const prog = this.life / this.maxLife;
      const alpha = prog < 0.2 ? prog / 0.2 * 0.5 : prog > 0.8 ? (1 - prog) / 0.2 * 0.5 : 0.5;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${this.hue},100%,65%)`;
      ctx.fill();
      ctx.restore();
    }
  }

  const particles = Array.from({ length: NUM },  (_, i) => new Particle(i < NUM));
  const sparks    = Array.from({ length: 70 }, () => new Spark());

  function animate() {
    const cx = canvas.width / 2, cy = canvas.height / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Sort far→near by z so closer ones render on top
    [...particles].sort((a, b) => b.z - a.z).forEach(p => { p.update(); p.draw(cx, cy); });
    sparks.forEach(s => { s.update(); s.draw(cx, cy); });

    requestAnimationFrame(animate);
  }
  animate();
}

/* ============================================================
   3. NAVBAR
   ============================================================ */
const navbar    = $('#navbar');
const navToggle = $('#navToggle');
const navLinks  = $('#navLinks');

window.addEventListener('scroll', () => {
  if (navbar) navbar.classList.toggle('scrolled', window.scrollY > 40);
  updateActiveNav();
  updateScrollProgress();
}, { passive: true });

if (navToggle) {
  navToggle.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    navToggle.classList.toggle('open', open);
    navToggle.setAttribute('aria-expanded', String(open));
  });
}
$$('.nav-link').forEach(link => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    navToggle.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

function updateActiveNav() {
  const scrollY = window.scrollY + 100;
  $$('section[id]').forEach(sec => {
    const link = $(`.nav-link[href="#${sec.id}"]`);
    if (link) link.classList.toggle('active', scrollY >= sec.offsetTop && scrollY < sec.offsetTop + sec.offsetHeight);
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
   5. SCROLL REVEAL
   ============================================================ */
const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('visible'); revealObserver.unobserve(e.target); }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
$$('.reveal-up, .reveal-left, .reveal-right').forEach(el => revealObserver.observe(el));

/* ============================================================
   6. SMOOTH SCROLL
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
   7. PARALLAX — Hero bg
   ============================================================ */
window.addEventListener('scroll', () => {
  const overlay = $('.hero-overlay');
  if (overlay) overlay.style.transform = `translateY(${window.scrollY * 0.15}px)`;
}, { passive: true });

/* ============================================================
   8. BOOKING FORM — saves to Supabase event_bookings + localStorage
   ============================================================ */
const bookingForm = $('#bookingForm');
const submitBtn   = $('#submitBtn');
const formSuccess = $('#formSuccess');
const dateInput   = $('#eventDate');
if (dateInput) dateInput.setAttribute('min', new Date().toISOString().split('T')[0]);

if (bookingForm) {
  bookingForm.addEventListener('submit', async e => {
    e.preventDefault();

    // Validation
    const fields = $$('[required]', bookingForm);
    let valid = true;
    fields.forEach(f => {
      f.style.borderColor = '';
      if (!f.value.trim()) { f.style.borderColor = '#e91e1e'; valid = false; }
    });
    if (!valid) return;

    const submitText    = $('.submit-text', submitBtn);
    const submitLoading = $('.submit-loading', submitBtn);
    submitBtn.disabled = true;
    submitText.style.display = 'none';
    submitLoading.style.display = 'inline';

    const submission = {
      id:          Date.now(),
      name:        $('#fullName').value.trim(),
      phone:       $('#phoneNumber').value.trim(),
      email:       $('#emailAddress').value.trim(),
      eventType:   $('#eventType').value,
      eventDate:   $('#eventDate').value,
      location:    $('#eventLocation').value.trim(),
      people:      parseInt($('#expectedPeople').value) || 0,
      stallFee:    $('#stallFee').value || '',
      message:     $('#message').value.trim(),
      status:      'pending',
      submittedAt: new Date().toISOString()
    };

    // Always save to localStorage
    const bookings = JSON.parse(localStorage.getItem('cc_bookings') || '[]');
    bookings.unshift(submission);
    localStorage.setItem('cc_bookings', JSON.stringify(bookings));

    // Save to Supabase
    if (CLOUD_ENABLED) {
      try {
        // Insert into dedicated event_bookings table
        const { error: insErr } = await window.sb.from('event_bookings').insert({
          name:        submission.name,
          phone:       submission.phone,
          email:       submission.email,
          event_type:  submission.eventType,
          event_date:  submission.eventDate,
          location:    submission.location,
          people:      submission.people,
          stall_fee:   submission.stallFee,
          message:     submission.message,
          status:      'pending',
          submitted_at: submission.submittedAt
        });
        if (insErr) console.warn('event_bookings insert:', insErr.message);

        // Also keep settings table in sync for the admin panel (with concurrency check)
        const _expectedTs = localStorage.getItem('cc_cloud_ts:cc_bookings') || null;
        const { data: rpcData, error: rpcErr } = await window.sb.rpc('cc_settings_write', {
          p_key:                 'cc_bookings',
          p_value:               bookings,
          p_expected_updated_at: _expectedTs
        });
        if (rpcErr) {
          console.warn('cc_bookings RPC error:', rpcErr.message);
        } else {
          // cc_settings_write returns a TABLE → use rpcData[0]
          const rpcResult = Array.isArray(rpcData) ? rpcData[0] : rpcData;
          if (rpcResult && rpcResult.conflict) {
            // Another admin tab wrote more recently to cc_bookings.
            // Merge remote bookings with the new submission (keep both), then retry.
            console.warn('cc_bookings conflict — merging with remote and retrying');
            const remoteBookings = Array.isArray(rpcResult.value) ? rpcResult.value : [];
            const remoteIds = new Set(remoteBookings.map(b => b.id));
            // Keep all remote bookings, add any local-only ones (merge by id)
            const merged = [...remoteBookings, ...bookings.filter(b => !remoteIds.has(b.id))];
            localStorage.setItem('cc_bookings', JSON.stringify(merged));
            // Retry with the server-confirmed timestamp
            const retryTs = rpcResult.updated_at || null;
            const { data: retryData, error: retryErr } = await window.sb.rpc('cc_settings_write', {
              p_key:                 'cc_bookings',
              p_value:               merged,
              p_expected_updated_at: retryTs
            });
            if (!retryErr) {
              const retryResult = Array.isArray(retryData) ? retryData[0] : retryData;
              if (retryResult && retryResult.updated_at) {
                localStorage.setItem('cc_cloud_ts:cc_bookings', retryResult.updated_at);
              }
              if (retryResult && retryResult.ok) {
                console.log('✅ Booking merged and saved to Supabase');
              }
            }
          } else if (rpcResult && rpcResult.ok) {
            if (rpcResult.updated_at) {
              localStorage.setItem('cc_cloud_ts:cc_bookings', rpcResult.updated_at);
            }
            console.log('✅ Booking saved to Supabase');
          }
        }
      } catch (err) {
        console.warn('Cloud save failed, local backup used:', err);
      }
    }

    await new Promise(r => setTimeout(r, 1200));
    submitBtn.style.display = 'none';
    formSuccess.style.display = 'block';
    bookingForm.reset();

    setTimeout(() => {
      formSuccess.style.display = 'none';
      submitBtn.style.display   = '';
      submitBtn.disabled        = false;
      submitText.style.display  = '';
      submitLoading.style.display = 'none';
    }, 5000);
  });
}

/* ============================================================
   9. BUTTON RIPPLE
   ============================================================ */
$$('.btn, .hero-cta-btn').forEach(btn => {
  btn.addEventListener('click', e => {
    const rect   = btn.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.style.cssText = `position:absolute;border-radius:50%;background:rgba(255,255,255,0.25);width:10px;height:10px;
      left:${e.clientX - rect.left - 5}px;top:${e.clientY - rect.top - 5}px;
      transform:scale(0);animation:rippleEffect 0.6s ease-out forwards;pointer-events:none;`;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  });
});
const rippleStyle = document.createElement('style');
rippleStyle.textContent = `
  @keyframes rippleEffect{to{transform:scale(30);opacity:0}}
  @keyframes shakeMix{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}
`;
document.head.appendChild(rippleStyle);

/* ============================================================
   10. GALLERY LIGHTBOX (static items)
   ============================================================ */
function attachLightbox(item) {
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
}
$$('.gallery-item').forEach(attachLightbox);

/* ============================================================
   11. DYNAMIC GALLERY from Admin (Supabase/localStorage)
   ============================================================ */
function loadAdminGallery() {
  const adminItems = JSON.parse(localStorage.getItem('cc_gallery') || '[]');
  const grid = $('#galleryGrid');
  if (!grid || adminItems.length === 0) return;

  adminItems.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'gallery-item reveal-up';
    div.style.setProperty('--delay', (i * 0.1) + 's');
    if (item.type === 'video') {
      div.innerHTML = `<video src="${item.src}" style="width:100%;height:100%;object-fit:cover;" muted loop autoplay playsinline></video>
        <div class="gallery-overlay"><span class="gallery-tag">${item.caption || 'Video 🎬'}</span></div>`;
    } else {
      div.innerHTML = `<img src="${item.src}" alt="${item.caption || 'Gallery'}" loading="lazy" />
        <div class="gallery-overlay"><span class="gallery-tag">${item.caption || 'Photo 📸'}</span></div>`;
    }
    grid.appendChild(div);
    revealObserver.observe(div);
    if (item.type !== 'video') attachLightbox(div);
  });
}
loadAdminGallery();

/* ============================================================
   12. AVAILABILITY CALENDAR
   ============================================================ */
let calCurrentDate = new Date();
calCurrentDate.setDate(1);

function renderCalendar() {
  const bookedDates = JSON.parse(localStorage.getItem('cc_booked_dates') || '[]');
  const year  = calCurrentDate.getFullYear();
  const month = calCurrentDate.getMonth();
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const label = $('#calMonthLabel');
  if (label) label.textContent = `${monthNames[month]} ${year}`;

  const container = $('#calDays');
  if (!container) return;
  container.innerHTML = '';

  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement('div'); el.className = 'cal-day empty'; container.appendChild(el);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr  = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const thisDate = new Date(year, month, d);
    const cell     = document.createElement('div');
    cell.className = 'cal-day';
    cell.textContent = d;
    if (thisDate < today)                                  cell.classList.add('past');
    else if (thisDate.toDateString() === today.toDateString()) cell.classList.add('today');
    else if (bookedDates.includes(dateStr))                cell.classList.add('booked');
    else                                                   cell.classList.add('available');
    container.appendChild(cell);
  }
}

const calPrev = $('#calPrev');
const calNext = $('#calNext');
if (calPrev) calPrev.addEventListener('click', () => { calCurrentDate.setMonth(calCurrentDate.getMonth() - 1); renderCalendar(); });
if (calNext) calNext.addEventListener('click', () => { calCurrentDate.setMonth(calCurrentDate.getMonth() + 1); renderCalendar(); });
renderCalendar();

/* ============================================================
   13. CUSTOM CURSOR (desktop only)
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
  $$('a,button,.gallery-item,.contact-card,.hiw-step,.cal-day').forEach(el => {
    el.addEventListener('mouseenter', () => { cursor.style.width = '44px'; cursor.style.height = '44px'; cursor.style.borderColor = 'rgba(255,215,0,0.8)'; });
    el.addEventListener('mouseleave', () => { cursor.style.width = '28px'; cursor.style.height = '28px'; cursor.style.borderColor = 'rgba(255,122,0,0.5)'; });
  });
}

/* ============================================================
   14. CONTACT INFO from Supabase/localStorage
   ============================================================ */
function loadContactInfo() {
  const info = JSON.parse(localStorage.getItem('cc_contact') || '{}');
  if (Object.keys(info).length === 0) return;

  const waNum = p => { let c = p.replace(/\D/g,''); if (c.length === 10) c = '91' + c; return c; };

  const phoneCard = $('#contactPhone');
  if (phoneCard && info.phone) {
    phoneCard.href = `tel:${info.phone.replace(/\s+/g,'')}`;
    $('p', phoneCard).textContent = info.phone;
  }
  const waCard = $('#contactWhatsapp');
  if (waCard && info.whatsapp) {
    waCard.href = `https://wa.me/${waNum(info.whatsapp)}?text=Hi! I am interested in booking Crispy Corner for my event.`;
    $('p', waCard).textContent = info.whatsapp;
  }
  const igCard = $('#contactInstagram');
  if (igCard && info.instagram) {
    const handle = info.instagram.startsWith('@') ? info.instagram : '@' + info.instagram;
    igCard.href = `https://instagram.com/${info.instagram.replace('@','')}`;
    $('p', igCard).textContent = handle;
  }
  const emailCard = $('#contactEmail');
  if (emailCard && info.email) {
    emailCard.href = `mailto:${info.email}`;
    $('p', emailCard).textContent = info.email;
  }
  const waFab = $('#whatsappFab');
  if (waFab && info.whatsapp) {
    waFab.href = `https://wa.me/${waNum(info.whatsapp)}?text=Hi! I am interested in booking Crispy Corner for my event.`;
  }
}
loadContactInfo();

console.log('%c🌶️ Crispy Corner — From Packet to Perfect Snack!', 'color:#FF7A00;font-weight:bold;font-size:16px;');
