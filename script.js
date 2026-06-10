// ─── APP STATE ────────────────────────────────────────────────────────────────
const PAGES = ['welcome','programme','intake','layer1','layer2','layer3','checkin','nutrition','reflection'];
const FREE_PAGES   = ['welcome','programme'];
const LOCKED_PAGES = ['intake','layer1','layer2','layer3','checkin','nutrition','reflection'];
const COACH_EMAIL = 'shadeybahali@gmail.com';
const ACCESS_CODE = 'ROOTED40';

let isUnlocked  = false;
let pendingPage = null;
let clientCode  = null;  // Supabase user UUID
let currentUser = null;  // Supabase Auth user object

// ─── SUPABASE AUTH ────────────────────────────────────────────────────────────
function switchAuthTab(tab) {
  document.getElementById('auth-signin-form').style.display = tab === 'signin' ? '' : 'none';
  document.getElementById('auth-signup-form').style.display = tab === 'signup' ? '' : 'none';
  document.getElementById('tab-signin').classList.toggle('active', tab === 'signin');
  document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
  document.querySelectorAll('.auth-error').forEach(el => { el.textContent = ''; el.style.display = 'none'; });
}

async function supabaseSignIn() {
  const email = document.getElementById('signin-email').value.trim();
  const pass  = document.getElementById('signin-password').value;
  const errEl = document.getElementById('signin-error');
  const btn   = document.getElementById('signin-btn');
  if (!email || !pass) { showAuthError(errEl, 'Please enter your email and password.'); return; }
  if (!sb) { offlineUnlock(); return; }
  btn.disabled = true; btn.textContent = 'Signing in…';
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  btn.disabled = false; btn.textContent = 'Sign in';
  if (error) { showAuthError(errEl, error.message); return; }
  await handleAuthSuccess(data.user);
}

async function supabaseSignUp() {
  const email  = document.getElementById('signup-email').value.trim();
  const code   = document.getElementById('signup-code').value.trim().toUpperCase();
  const pass   = document.getElementById('signup-password').value;
  const errEl  = document.getElementById('signup-error');
  const btn    = document.getElementById('signup-btn');
  if (!email || !code || !pass)  { showAuthError(errEl, 'Please fill in all fields.'); return; }
  if (code !== ACCESS_CODE)       { showAuthError(errEl, 'Invalid invite code. Please check with your coach.'); return; }
  if (pass.length < 6)           { showAuthError(errEl, 'Password must be at least 6 characters.'); return; }
  if (!sb) { offlineUnlock(); return; }
  btn.disabled = true; btn.textContent = 'Creating account…';
  const { data, error } = await sb.auth.signUp({ email, password: pass });
  btn.disabled = false; btn.textContent = 'Create account';
  if (error) { showAuthError(errEl, error.message); return; }
  if (!data.session) {
    document.getElementById('auth-signin-form').style.display = 'none';
    document.getElementById('auth-signup-form').style.display = 'none';
    document.getElementById('auth-confirm-msg').style.display = '';
    return;
  }
  await handleAuthSuccess(data.user);
}

async function supabaseSignOut() {
  if (sb) { try { await sb.auth.signOut(); } catch(e) {} }
  currentUser = null; clientCode = null; isUnlocked = false;
  LOCKED_PAGES.forEach(p => {
    const nav = document.getElementById('nav-'+p);
    if (nav) nav.classList.add('gated');
  });
  showPage('welcome');
}

function showAuthError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.style.display = '';
}

async function handleAuthSuccess(user) {
  currentUser = user;
  clientCode  = user.id;
  isUnlocked  = true;
  document.getElementById('paywall').style.display = 'none';
  LOCKED_PAGES.forEach(p => {
    const nav = document.getElementById('nav-'+p);
    if (nav) nav.classList.remove('gated');
  });
  if (sb) {
    const { data: profile } = await sb.from('profiles').select('day_started, photo_url').eq('id', user.id).single();
    if (profile?.day_started) {
      localStorage.setItem('rwm-start-date', profile.day_started);
    } else if (!localStorage.getItem('rwm-start-date')) {
      const start = toDateStr(new Date());
      localStorage.setItem('rwm-start-date', start);
      try { await sb.from('profiles').upsert({ id: user.id, day_started: start }); } catch(e) {}
    }
    if (profile?.photo_url) {
      const preview = document.getElementById('photo-preview');
      if (preview) { preview.src = profile.photo_url; preview.style.display = 'block'; }
      const uploadText = document.getElementById('photo-upload-text');
      if (uploadText) uploadText.textContent = 'Change photo';
    }
    await loadFromSupabase();
  } else if (!localStorage.getItem('rwm-start-date')) {
    localStorage.setItem('rwm-start-date', toDateStr(new Date()));
  }
  updateProgress();
  updateSidebarStats();
  renderAnchorCheckin();
  renderProgressDashboard();
  const dest = pendingPage || 'welcome';
  pendingPage = null;
  showPage(dest);
}

async function checkSupabaseSession() {
  if (!sb) {
    isUnlocked = localStorage.getItem('rwm-offline-unlocked') === '1';
    if (!isUnlocked) {
      LOCKED_PAGES.forEach(p => {
        const nav = document.getElementById('nav-'+p);
        if (nav) nav.classList.add('gated');
      });
    }
    return;
  }
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    await handleAuthSuccess(session.user);
  } else {
    isUnlocked = false;
    LOCKED_PAGES.forEach(p => {
      const nav = document.getElementById('nav-'+p);
      if (nav) nav.classList.add('gated');
    });
  }
}

// ─── OFFLINE FALLBACK ─────────────────────────────────────────────────────────
function offlineUnlock() {
  const code = prompt('Enter invite code for offline access:');
  if (!code || code.trim().toUpperCase() !== ACCESS_CODE) { alert('Invalid invite code.'); return; }
  localStorage.setItem('rwm-offline-unlocked', '1');
  isUnlocked = true;
  if (!localStorage.getItem('rwm-start-date')) localStorage.setItem('rwm-start-date', toDateStr(new Date()));
  document.getElementById('paywall').style.display = 'none';
  LOCKED_PAGES.forEach(p => {
    const nav = document.getElementById('nav-'+p);
    if (nav) nav.classList.remove('gated');
  });
  updateSidebarStats();
  renderAnchorCheckin();
  renderProgressDashboard();
  showPage('welcome');
}

// ─── SUPABASE DATA SYNC ───────────────────────────────────────────────────────
const TEXT_IDS = [
  'i-name','i-dob','i-occ','i-wa','i-referral',
  'a-body','a-week','a-sleep','a-challenge',
  'b-history','b-injury','b-medical',
  'c-goal','c-why','c-blocker','c-success','c-feel',
  'd-prog-detail','e-supps','f-commit','f-story','f-friend','f-support','g-extra',
  'l1-selfimage','l1-story','l1-evidence-for','l1-evidence-against','l1-free',
  'l1-vision','l1-words','l1-stopped','l1-consistent','l1-declaration','l1-declaration-time',
  'l2-body-move','l2-body-fuel','l2-body-rest',
  'l2-mind-stillness','l2-mind-intention','l2-mind-learning',
  'l2-soul-practice','l2-soul-meaning','l2-soul-community',
  'anc-1','anc-2','anc-3','anc-4','anc-5',
  'l3-slide-trigger','l3-anchor-slipped','l3-told-myself','l3-need','l3-bestfriend',
  'l3-first-anchor','l3-ritual','l3-accountability',
  'cov-name','cov-anchor','cov-signed','cov-date',
  'm1-strongest','m1-hardest','m1-proud','m1-different',
  'm2-strongest','m2-hardest','m2-proud','m2-different',
  'm3-strongest','m3-hardest','m3-proud','m3-different',
  'r40-changed','r40-proud','r40-anchor','r40-carry','r40-next'
];

let _sbSyncTimer = null;
function scheduleSupabaseSync() {
  if (!sb || !clientCode) return;
  clearTimeout(_sbSyncTimer);
  _sbSyncTimer = setTimeout(syncToSupabase, 2000);
}

async function syncToSupabase() {
  if (!sb || !clientCode) return;
  const now  = new Date().toISOString();
  const rows = TEXT_IDS
    .map(id => ({ user_id: clientCode, field_id: id, value: localStorage.getItem('rwm-'+id) || '', updated_at: now }))
    .filter(r => r.value.trim());
  if (rows.length) { try { await sb.from('form_answers').upsert(rows); } catch(e) { console.warn('[Supabase] sync error', e); } }
  const name = localStorage.getItem('rwm-i-name');
  const wa   = localStorage.getItem('rwm-i-wa');
  if (name || wa) {
    const upd = { id: clientCode, updated_at: now };
    if (name) upd.name = name;
    if (wa)   upd.whatsapp = wa;
    try { await sb.from('profiles').upsert(upd); } catch(e) {}
  }
}

async function syncCheckinToSupabase(dateStr, anchorData) {
  if (!sb || !clientCode) return;
  try {
    await sb.from('daily_checkins').upsert({
      user_id: clientCode, date: dateStr,
      anchor_data: anchorData, updated_at: new Date().toISOString()
    });
  } catch(e) { console.warn('[Supabase] checkin sync error', e); }
}

async function loadFromSupabase() {
  if (!sb || !clientCode) return;
  try {
    const [answersRes, checkinsRes] = await Promise.all([
      sb.from('form_answers').select('field_id, value').eq('user_id', clientCode),
      sb.from('daily_checkins').select('date, anchor_data').eq('user_id', clientCode)
    ]);
    if (answersRes.data) {
      answersRes.data.forEach(({ field_id, value }) => {
        if (value) {
          localStorage.setItem('rwm-'+field_id, value);
          const el = document.getElementById(field_id);
          if (el) el.value = value;
        }
      });
    }
    if (checkinsRes.data) {
      checkinsRes.data.forEach(({ date, anchor_data }) => {
        try { localStorage.setItem('rwm-daily-'+date, JSON.stringify(anchor_data)); } catch(e) {}
      });
    }
  } catch(e) { console.warn('[Supabase] load error', e); }
}

// ─── PHOTO UPLOAD ─────────────────────────────────────────────────────────────
async function handlePhotoUpload(input) {
  const file      = input.files[0];
  if (!file) return;
  const statusEl  = document.getElementById('photo-status');
  const previewEl = document.getElementById('photo-preview');
  const textEl    = document.getElementById('photo-upload-text');
  if (statusEl) { statusEl.textContent = 'Uploading…'; statusEl.className = 'photo-upload-status'; }
  const localUrl = URL.createObjectURL(file);
  if (previewEl) { previewEl.src = localUrl; previewEl.style.display = 'block'; }
  if (!sb || !clientCode) {
    if (statusEl) { statusEl.textContent = '(Offline — photo not saved to server)'; statusEl.className = 'photo-upload-status warn'; }
    return;
  }
  const ext  = file.name.split('.').pop().toLowerCase();
  const path = `${clientCode}/start.${ext}`;
  const { error } = await sb.storage.from('client-photos').upload(path, file, { upsert: true });
  if (error) {
    if (statusEl) { statusEl.textContent = 'Upload failed: ' + error.message; statusEl.className = 'photo-upload-status error'; }
    return;
  }
  try { await sb.from('profiles').upsert({ id: clientCode, photo_url: path, updated_at: new Date().toISOString() }); } catch(e) {}
  if (statusEl) { statusEl.textContent = 'Photo saved ✓'; statusEl.className = 'photo-upload-status ok'; }
  if (textEl) textEl.textContent = 'Change photo';
}

function escHtmlClient(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

function closePaywall() {
  const paywall = document.getElementById('paywall');
  if (paywall) paywall.style.display = 'none';
  pendingPage = null;
  const active = PAGES.find(p => document.getElementById('page-'+p)?.classList.contains('active'));
  if (!active || LOCKED_PAGES.includes(active)) showPage('welcome');
}


function saveEJSConfig() {
  localStorage.setItem('rwm-ejs-pk',  document.getElementById('ejs-public-key').value.trim());
  localStorage.setItem('rwm-ejs-sid', document.getElementById('ejs-service-id').value.trim());
  localStorage.setItem('rwm-ejs-tid', document.getElementById('ejs-template-id').value.trim());
  checkEJSReady();
}

function checkEJSReady() {
  const pk  = localStorage.getItem('rwm-ejs-pk')  || '';
  const sid = localStorage.getItem('rwm-ejs-sid') || '';
  const tid = localStorage.getItem('rwm-ejs-tid') || '';
  const ready = pk && sid && tid;
  const banner = document.getElementById('setup-banner');
  if(banner) banner.style.opacity = ready ? '0.5' : '1';
  return {pk, sid, tid, ready};
}

function buildIntakeText() {
  const get = id => (localStorage.getItem('rwm-'+id) || '').trim();
  const radio = name => (localStorage.getItem('rwm-radio-'+name) || '--');
  const cb = id => localStorage.getItem('rwm-cb-'+id) === '1';

  const movements = ['hip thrust/glute bridge','squat','Romanian deadlift','leg press','lat pulldown','shoulder press','machine row']
    .filter((_,i) => cb(['mv-hip','mv-squat','mv-rdl','mv-legpress','mv-lat','mv-shoulder','mv-row'][i])).join(', ') || 'None ticked';

  const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
    .filter((_,i) => cb(['d-mon','d-tue','d-wed','d-thu','d-fri','d-sat','d-sun'][i])).join(', ') || 'None selected';

  return `
NEW CLIENT INTAKE -- THE ROOTED WOMAN METHOD
============================================
Submitted: ${new Date().toLocaleString('en-GB')}

PERSONAL DETAILS
Name:         ${get('i-name')}
Date of birth:${get('i-dob')}
Occupation:   ${get('i-occ')}
WhatsApp:     ${get('i-wa')}
How heard:    ${get('i-referral')}

A -- STARTING POINT
Relationship with body:
${get('a-body')}

Typical week:
${get('a-week')}

Sleep: ${get('a-sleep')}
Energy level (1-5): ${localStorage.getItem('rwm-r-energy') || '--'}
Biggest challenge:
${get('a-challenge')}

B -- TRAINING HISTORY
Gym experience: ${radio('gym-history')}
Training history: ${get('b-history')}
Movements done: ${movements}
Injury/pain: ${radio('injury')}
Injury detail: ${get('b-injury')}
Medical condition: ${radio('medical')}
Medical detail: ${get('b-medical')}

C -- GOALS
Goals for 40 days:
${get('c-goal')}

Why now:
${get('c-why')}

What stopped before:
${get('c-blocker')}

Success at Day 40: ${get('c-success')}
How body will feel: ${get('c-feel')}

D -- TRAINING SCHEDULE
Available days: ${days}
Session length: ${radio('session-time')} min
Programme preference: ${radio('prog-pref')}
Programme detail: ${get('d-prog-detail')}

E -- LIFESTYLE
Eating habits: ${radio('eating')}
Water intake: ${radio('water')}
Stress level (1-5): ${localStorage.getItem('rwm-r-stress') || '--'}
Self-care consistency (1-5): ${localStorage.getItem('rwm-r-selfcare') || '--'}
Supplements: ${radio('supps')} -- ${get('e-supps')}

F -- MINDSET & READINESS
Commitment sentence: ${get('f-commit')}
Consistency story: ${get('f-story')}
Advice to friend: ${get('f-friend')}
Readiness (1-5): ${localStorage.getItem('rwm-r-ready') || '--'}
What would help: ${get('f-support')}

G -- ANYTHING ELSE
${get('g-extra')}
`.trim();
}

function openModal(type, title, body, btns) {
  const overlay = document.getElementById('modal-overlay');
  const icon    = document.getElementById('modal-icon');
  const t       = document.getElementById('modal-title');
  const b       = document.getElementById('modal-body');
  const btnRow  = document.getElementById('modal-btns');

  icon.className  = 'modal-icon ' + type;
  icon.textContent = type === 'success' ? '✓' : type === 'error' ? '✕' : '⏳';
  t.textContent    = title;
  b.innerHTML      = body;
  btnRow.innerHTML = '';

  (btns || []).forEach(({label, cls, fn}) => {
    const btn = document.createElement('button');
    btn.className   = cls || 'btn-ghost';
    btn.textContent = label;
    btn.onclick     = fn;
    btnRow.appendChild(btn);
  });

  overlay.classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

async function submitIntakeEmail() {
  autosave();
  const name = localStorage.getItem('rwm-i-name') || 'New client';
  const {pk, sid, tid, ready} = checkEJSReady();

  if(!ready) {
    openModal('error', 'Setup not complete',
      'Please fill in your EmailJS Public Key, Service ID, and Template ID in the setup section above before sending. <a href="#" onclick="showEmailJSGuide(); return false;" style="color:var(--sage)">See the guide -></a>',
      [{label:'OK, got it', cls:'btn-save', fn: closeModal}]);
    return;
  }

  const submitBtn = document.getElementById('btn-submit-email');
  submitBtn.disabled = true;
  openModal('loading', 'Sending your intake...', 'Please wait a moment while your answers are sent to your coach.', []);

  try {
    emailjs.init({publicKey: pk});
    const intakeText = buildIntakeText();

    await emailjs.send(sid, tid, {
      to_email:    COACH_EMAIL,
      to_name:     'Coach',
      from_name:   name,
      client_name: name,
      client_wa:   localStorage.getItem('rwm-i-wa') || '--',
      intake_text: intakeText,
      reply_to:    localStorage.getItem('rwm-i-wa') || '',
    });

    localStorage.setItem('rwm-intake-submitted', new Date().toISOString());

    openModal('success', 'Sent successfully!',
      `Your intake has been sent to your coach at <strong>${COACH_EMAIL}</strong>.<br><br>You can now continue filling in the workbook. Your coach will be in touch before your first session.`,
      [
        {label:'Continue to Layer 1', cls:'btn-save', fn: () => { closeModal(); showPage('layer1'); }},
        {label:'Close', cls:'btn-ghost', fn: closeModal}
      ]);
  } catch(err) {
    console.error('EmailJS error:', err);
    openModal('error', 'Something went wrong',
      `The email couldn't be sent. Error: <code>${err.text || err.message || 'unknown'}</code><br><br>Double-check your EmailJS keys and that your template is set up correctly.`,
      [{label:'Try again', cls:'btn-save', fn: () => { closeModal(); submitBtn.disabled = false; }},
       {label:'Close', cls:'btn-ghost', fn: () => { closeModal(); submitBtn.disabled = false; }}]);
  }
}

function showEmailJSGuide() {
  openModal('loading', 'EmailJS setup guide',
    `<strong>Step 1</strong> -- Go to <a href="https://www.emailjs.com" target="_blank" style="color:var(--sage)">emailjs.com</a> and create a free account.<br><br>
    <strong>Step 2</strong> -- Add a Gmail service. Click <em>Email Services -> Add New Service -> Gmail</em>. Note your <code>Service ID</code>.<br><br>
    <strong>Step 3</strong> -- Create a template. Click <em>Email Templates -> Create New Template</em>. In the template body use: <code>{{intake_text}}</code>. Set <em>To Email</em> to <code>${COACH_EMAIL}</code>. Note your <code>Template ID</code>.<br><br>
    <strong>Step 4</strong> -- Copy your <code>Public Key</code> from <em>Account -> General</em>.<br><br>
    Paste all three into the setup fields on the intake page. That's it -- no server needed.`,
    [{label:'Got it', cls:'btn-save', fn: closeModal}]);
}

// ─── HAMBURGER / SIDEBAR MOBILE ────────────────────────────────────────────────
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const btn = document.getElementById('hamburger-btn');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.toggle('open');
  btn.classList.toggle('open');
  overlay.classList.toggle('open');
}

function closeSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const btn = document.getElementById('hamburger-btn');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.remove('open');
  btn.classList.remove('open');
  overlay.classList.remove('open');
}

function showPage(id) {
  closeSidebar();
  // Gate locked pages for non-unlocked users
  if (!isUnlocked && LOCKED_PAGES.includes(id)) {
    pendingPage = id;
    const paywall = document.getElementById('paywall');
    if (paywall) paywall.style.display = 'flex';
    window.scrollTo({top:0, behavior:'smooth'});
    return;
  }
  // Reflection page requires day 40
  if (id === 'reflection' && isUnlocked && getDayNumber() < 40) {
    const day = getDayNumber();
    openModal('loading', 'Almost there',
      `The Day 40 Reflection unlocks on your final day. You are on <strong>Day ${day} of 40</strong> — keep going.`,
      [{label:'Keep going', cls:'btn-save', fn: closeModal}]);
    return;
  }
  PAGES.forEach(p => {
    document.getElementById('page-'+p).classList.remove('active');
    const nav = document.getElementById('nav-'+p);
    if(nav) nav.classList.remove('active');
  });
  document.getElementById('page-'+id).classList.add('active');
  const nav = document.getElementById('nav-'+id);
  if(nav) nav.classList.add('active');
  window.scrollTo({top:0, behavior:'smooth'});
}

function buildRating(containerId, storageKey, max) {
  const el = document.getElementById(containerId);
  if(!el) return;
  el.innerHTML = '';
  for(let i=1;i<=max;i++){
    const btn = document.createElement('button');
    btn.className = 'rating-btn';
    btn.textContent = i;
    btn.type = 'button';
    const k = storageKey;
    const v = i;
    btn.onclick = function(){
      el.querySelectorAll('.rating-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      localStorage.setItem(k, v);
      updateProgress();
    };
    const saved = localStorage.getItem(storageKey);
    if(saved && parseInt(saved)===i) btn.classList.add('active');
    el.appendChild(btn);
  }
}

function loadAll() {
  const textIds = [
    'i-name','i-dob','i-occ','i-wa','i-referral',
    'a-body','a-week','a-sleep','a-challenge',
    'b-history','b-injury','b-medical',
    'c-goal','c-why','c-blocker','c-success','c-feel',
    'd-prog-detail',
    'e-supps','f-commit','f-story','f-friend','f-support','g-extra',
    'l1-selfimage','l1-story','l1-evidence-for','l1-evidence-against','l1-free',
    'l1-vision','l1-words','l1-stopped','l1-consistent','l1-declaration','l1-declaration-time',
    'l2-body-move','l2-body-fuel','l2-body-rest',
    'l2-mind-stillness','l2-mind-intention','l2-mind-learning',
    'l2-soul-practice','l2-soul-meaning','l2-soul-community',
    'anc-1','anc-2','anc-3','anc-4','anc-5',
    'l3-slide-trigger','l3-anchor-slipped','l3-told-myself','l3-need','l3-bestfriend',
    'l3-first-anchor','l3-ritual','l3-accountability',
    'cov-name','cov-anchor','cov-signed','cov-date',
    'm1-strongest','m1-hardest','m1-proud','m1-different',
    'm2-strongest','m2-hardest','m2-proud','m2-different',
    'm3-strongest','m3-hardest','m3-proud','m3-different',
    'r40-changed','r40-proud','r40-anchor','r40-carry','r40-next',
    'rev-changed','rev-proud'
  ];

  textIds.forEach(id => {
    const el = document.getElementById(id);
    if(el) {
      const saved = localStorage.getItem('rwm-'+id);
      if(saved) el.value = saved;
    }
  });

  const radioNames = ['gym-history','injury','medical','session-time','prog-pref','eating','water','supps'];
  radioNames.forEach(name => {
    const saved = localStorage.getItem('rwm-radio-'+name);
    if(saved) {
      const radios = document.querySelectorAll('input[name="'+name+'"]');
      radios.forEach(r => { if(r.value === saved) r.checked = true; });
    }
  });

  const checkboxIds = ['mv-hip','mv-squat','mv-rdl','mv-legpress','mv-lat','mv-shoulder','mv-row','mv-none',
    'd-mon','d-tue','d-wed','d-thu','d-fri','d-sat','d-sun'];
  checkboxIds.forEach(id => {
    const el = document.getElementById(id);
    if(el) el.checked = localStorage.getItem('rwm-cb-'+id) === '1';
  });

  buildRating('r-energy', 'rwm-r-energy', 5);
  buildRating('r-stress', 'rwm-r-stress', 5);
  buildRating('r-selfcare', 'rwm-r-selfcare', 5);
  buildRating('r-ready', 'rwm-r-ready', 5);

  const ejsPK  = document.getElementById('ejs-public-key');
  const ejsSID = document.getElementById('ejs-service-id');
  const ejsTID = document.getElementById('ejs-template-id');
  if(ejsPK)  ejsPK.value  = localStorage.getItem('rwm-ejs-pk')  || '';
  if(ejsSID) ejsSID.value = localStorage.getItem('rwm-ejs-sid') || '';
  if(ejsTID) ejsTID.value = localStorage.getItem('rwm-ejs-tid') || '';
  checkEJSReady();

  updateProgress();
  if (isUnlocked) {
    updateSidebarStats();
    renderAnchorCheckin();
    renderProgressDashboard();
  }
}

function autosave() {
  const textIds = [
    'i-name','i-dob','i-occ','i-wa','i-referral',
    'a-body','a-week','a-sleep','a-challenge',
    'b-history','b-injury','b-medical',
    'c-goal','c-why','c-blocker','c-success','c-feel',
    'd-prog-detail','e-supps','f-commit','f-story','f-friend','f-support','g-extra',
    'l1-selfimage','l1-story','l1-evidence-for','l1-evidence-against','l1-free',
    'l1-vision','l1-words','l1-stopped','l1-consistent','l1-declaration','l1-declaration-time',
    'l2-body-move','l2-body-fuel','l2-body-rest',
    'l2-mind-stillness','l2-mind-intention','l2-mind-learning',
    'l2-soul-practice','l2-soul-meaning','l2-soul-community',
    'anc-1','anc-2','anc-3','anc-4','anc-5',
    'l3-slide-trigger','l3-anchor-slipped','l3-told-myself','l3-need','l3-bestfriend',
    'l3-first-anchor','l3-ritual','l3-accountability',
    'cov-name','cov-anchor','cov-signed','cov-date',
    'm1-strongest','m1-hardest','m1-proud','m1-different',
    'm2-strongest','m2-hardest','m2-proud','m2-different',
    'm3-strongest','m3-hardest','m3-proud','m3-different',
    'r40-changed','r40-proud','r40-anchor','r40-carry','r40-next',
    'rev-changed','rev-proud'
  ];

  textIds.forEach(id => {
    const el = document.getElementById(id);
    if(el) localStorage.setItem('rwm-'+id, el.value);
  });

  const radioNames = ['gym-history','injury','medical','session-time','prog-pref','eating','water','supps'];
  radioNames.forEach(name => {
    const checked = document.querySelector('input[name="'+name+'"]:checked');
    if(checked) localStorage.setItem('rwm-radio-'+name, checked.value);
  });

  const checkboxIds = ['mv-hip','mv-squat','mv-rdl','mv-legpress','mv-lat','mv-shoulder','mv-row','mv-none',
    'd-mon','d-tue','d-wed','d-thu','d-fri','d-sat','d-sun'];
  checkboxIds.forEach(id => {
    const el = document.getElementById(id);
    if(el) localStorage.setItem('rwm-cb-'+id, el.checked ? '1' : '0');
  });

  updateProgress();
  scheduleSupabaseSync();
}

function saveSection(section) {
  autosave();
  const status = document.getElementById('status-'+section);
  if(status) {
    status.classList.add('visible');
    setTimeout(() => status.classList.remove('visible'), 2500);
  }
}

function updateProgress() {
  const fields = [
    'i-name','a-body','a-week','c-goal','c-why',
    'l1-selfimage','l1-story','l1-vision','l1-declaration',
    'l2-body-move','l2-mind-stillness','l2-soul-practice',
    'l3-slide-trigger','l3-ritual','cov-name'
  ];
  let filled = 0;
  fields.forEach(id => {
    const el = document.getElementById(id);
    if(el && el.value && el.value.trim().length > 2) filled++;
  });
  const pct = Math.round((filled / fields.length) * 100);
  document.getElementById('progress-pct').textContent = pct + '%';
  document.getElementById('progress-fill').style.width = pct + '%';
}

function exportData() {
  const name = localStorage.getItem('rwm-i-name') || 'Client';
  const date = new Date().toLocaleDateString('en-GB');
  let out = `THE ROOTED WOMAN METHOD\nCompleted by: ${name}\nDate: ${date}\n\n`;

  const sections = [
    {title:'CLIENT INTAKE', fields:[
      ['Full name','rwm-i-name'],['Date of birth','rwm-i-dob'],['Occupation','rwm-i-occ'],
      ['WhatsApp','rwm-i-wa'],['How heard','rwm-i-referral'],
      ['Relationship with body','rwm-a-body'],['Typical week','rwm-a-week'],
      ['Sleep hours','rwm-a-sleep'],['Biggest challenge','rwm-a-challenge'],
      ['Training history','rwm-b-history'],['Injuries','rwm-b-injury'],['Medical conditions','rwm-b-medical'],
      ['Goals','rwm-c-goal'],['Why now','rwm-c-why'],['What stopped before','rwm-c-blocker'],
      ['Success at Day 40','rwm-c-success'],['How body will feel','rwm-c-feel'],
      ['Programme preference detail','rwm-d-prog-detail'],
      ['Supplements','rwm-e-supps'],
      ['Commitment sentence','rwm-f-commit'],['Consistency story','rwm-f-story'],
      ['Advice to friend','rwm-f-friend'],['What would help','rwm-f-support'],
      ['Anything else','rwm-g-extra']
    ]},
    {title:'LAYER 1 -- IDENTITY', fields:[
      ['Self-image sentence','rwm-l1-selfimage'],['Consistency story','rwm-l1-story'],
      ['Evidence for story','rwm-l1-evidence-for'],['Evidence against story','rwm-l1-evidence-against'],
      ['Who I could become','rwm-l1-free'],
      ['Vision of rooted self','rwm-l1-vision'],['Three words','rwm-l1-words'],
      ['What she stopped tolerating','rwm-l1-stopped'],['What she does consistently','rwm-l1-consistent'],
      ['Daily declaration','rwm-l1-declaration'],['Declaration time','rwm-l1-declaration-time']
    ]},
    {title:'LAYER 2 -- RHYTHM', fields:[
      ['Body anchor: movement','rwm-l2-body-move'],['Body anchor: fuel','rwm-l2-body-fuel'],
      ['Body anchor: rest','rwm-l2-body-rest'],
      ['Mind anchor: stillness','rwm-l2-mind-stillness'],['Mind anchor: intention','rwm-l2-mind-intention'],
      ['Mind anchor: learning','rwm-l2-mind-learning'],
      ['Soul anchor: practice','rwm-l2-soul-practice'],['Soul anchor: meaning','rwm-l2-soul-meaning'],
      ['Soul anchor: community','rwm-l2-soul-community'],
      ['Anchor 1','rwm-anc-1'],['Anchor 2','rwm-anc-2'],['Anchor 3','rwm-anc-3'],
      ['Anchor 4','rwm-anc-4'],['Anchor 5','rwm-anc-5']
    ]},
    {title:'LAYER 3 -- RECOVERY', fields:[
      ['Slide trigger','rwm-l3-slide-trigger'],['Anchor that slipped','rwm-l3-anchor-slipped'],
      ['Story told self','rwm-l3-told-myself'],['Need behind behaviour','rwm-l3-need'],
      ['What I would tell my friend','rwm-l3-bestfriend'],
      ['First anchor to return to','rwm-l3-first-anchor'],['Return ritual','rwm-l3-ritual'],
      ['Accountability person','rwm-l3-accountability'],
      ['Covenant name','rwm-cov-name'],['Covenant anchor','rwm-cov-anchor'],
      ['Signed','rwm-cov-signed'],['Date','rwm-cov-date']
    ]},
    {title:'90-DAY CHECK-INS', fields:[
      ['Month 1 -- strongest anchor','rwm-m1-strongest'],['Month 1 -- hardest anchor','rwm-m1-hardest'],
      ['Month 1 -- proud of','rwm-m1-proud'],['Month 1 -- do differently','rwm-m1-different'],
      ['Month 2 -- strongest anchor','rwm-m2-strongest'],['Month 2 -- hardest anchor','rwm-m2-hardest'],
      ['Month 2 -- proud of','rwm-m2-proud'],['Month 2 -- do differently','rwm-m2-different'],
      ['Month 3 -- strongest anchor','rwm-m3-strongest'],['Month 3 -- hardest anchor','rwm-m3-hardest'],
      ['Month 3 -- proud of','rwm-m3-proud'],['Month 3 -- do differently','rwm-m3-different']
    ]}
  ];

  sections.forEach(s => {
    out += '\n' + '='.repeat(50) + '\n' + s.title + '\n' + '='.repeat(50) + '\n\n';
    s.fields.forEach(([label, key]) => {
      const val = localStorage.getItem(key) || '';
      if(val.trim()) out += label + ':\n' + val + '\n\n';
    });
  });

  const blob = new Blob([out], {type:'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rooted-woman-method-' + (localStorage.getItem('rwm-i-name') || 'answers').toLowerCase().replace(/\s+/g,'-') + '.txt';
  a.click();
  URL.revokeObjectURL(url);
}

// ─── TESTIMONIALS ─────────────────────────────────────────────────────────────
// To add more: copy any object and push it into this array.
const TESTIMONIALS = [
  {
    name: 'M.B.',
    result: 'Lost 6 kg in 40 days — and kept it off',
    quote: 'I have tried everything. Diets, gym challenges, apps. Nothing stuck until Rooted in 40. For the first time I understood why I kept stopping — and how to come back without beating myself up.'
  },
  {
    name: 'K.T.',
    result: 'From 0 to 4 gym sessions a week',
    quote: 'The anchors changed my life. I used to be all or nothing. Now when I miss a day I know exactly what to do — go back to my first anchor and start again. No shame. Just practice.'
  },
  {
    name: 'S.R.',
    result: 'More energy, better sleep, clearer mind',
    quote: 'This is not a fitness programme. It is a self-understanding programme that happens to involve fitness. Shadey sees things in you that you cannot see yourself yet.'
  }
];

function renderTestimonials() {
  const el = document.getElementById('testimonials-container');
  if (!el) return;
  el.innerHTML = TESTIMONIALS.map(t => `
    <div class="testimonial-card">
      <div class="testimonial-quote">&ldquo;${escHtmlClient(t.quote)}&rdquo;</div>
      <div class="testimonial-footer">
        <div class="testimonial-name">${escHtmlClient(t.name)}</div>
        <div class="testimonial-result">${escHtmlClient(t.result)}</div>
      </div>
    </div>`).join('');
}

// ─── WAITLIST ─────────────────────────────────────────────────────────────────
async function submitWaitlist() {
  const nameEl = document.getElementById('wl-name');
  const waEl   = document.getElementById('wl-wa');
  const btn    = document.getElementById('wl-btn');
  const errEl  = document.getElementById('wl-error');
  const name   = (nameEl ? nameEl.value : '').trim();
  const wa     = (waEl   ? waEl.value   : '').trim();

  errEl.style.display = (!name || !wa) ? 'block' : 'none';
  if (!name || !wa) return;

  btn.disabled = true;
  btn.textContent = 'Sending…';

  // Store in Supabase so Shadey can see it in admin
  if (sb) {
    try { await sb.from('waitlist').insert({ name, whatsapp: wa }); } catch(e) {}
  }

  // Also email via EmailJS if keys are configured on this device
  const { pk, sid, tid, ready } = checkEJSReady();
  if (ready) {
    try {
      emailjs.init({ publicKey: pk });
      await emailjs.send(sid, tid, {
        to_email:    COACH_EMAIL,
        to_name:     'Shadey',
        from_name:   name,
        client_name: name,
        client_wa:   wa,
        intake_text: `NEW WAITLIST SIGNUP — ROOTED IN 40\n\nName: ${name}\nWhatsApp: ${wa}\nDate: ${new Date().toLocaleString('en-GB')}`,
      });
    } catch(e) { console.warn('Waitlist email error:', e); }
  }

  document.getElementById('waitlist-form').style.display = 'none';
  document.getElementById('wl-thanks').style.display = '';
}

// ─── DAY 40 REVIEW ────────────────────────────────────────────────────────────
function selectReviewRating(val) {
  localStorage.setItem('rwm-rev-rating', String(val));
  document.querySelectorAll('.star-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i < val);
  });
}

function selectRecommend(val) {
  localStorage.setItem('rwm-rev-recommend', val);
  ['yes','maybe','no'].forEach(v => {
    document.getElementById('rec-' + v).classList.toggle('active', v === val);
  });
}

async function submitReview() {
  const rating    = localStorage.getItem('rwm-rev-rating') || '';
  const recommend = localStorage.getItem('rwm-rev-recommend') || '';
  const changed   = (document.getElementById('rev-changed')?.value || '').trim();
  const proud     = (document.getElementById('rev-proud')?.value   || '').trim();

  if (!rating) {
    openModal('error', 'Rating required',
      'Please tap a star to give an overall rating before submitting.',
      [{ label: 'OK', cls: 'btn-save', fn: closeModal }]);
    return;
  }

  const btn  = document.getElementById('btn-submit-review');
  if (btn) btn.disabled = true;

  const name = localStorage.getItem('rwm-i-name') || 'Client';
  const body = `DAY 40 PROGRAMME REVIEW — ROOTED IN 40
=========================================
Submitted: ${new Date().toLocaleString('en-GB')}
Client: ${name}
Overall rating: ${rating}/5
Would recommend: ${recommend || '(not answered)'}

One thing that changed:
${changed || '(left blank)'}

One thing they are proud of:
${proud || '(left blank)'}`.trim();

  // Save locally
  localStorage.setItem('rwm-review-submitted', new Date().toISOString());
  if (sb && clientCode) {
    try {
      await sb.from('reviews').upsert({
        user_id: clientCode, rating, recommend,
        changed_text: changed, proud_text: proud, submitted_at: new Date().toISOString()
      });
    } catch(e) {}
  }

  // Email if keys available
  const { pk, sid, tid, ready } = checkEJSReady();
  if (ready) {
    try {
      emailjs.init({ publicKey: pk });
      await emailjs.send(sid, tid, {
        to_email: COACH_EMAIL, to_name: 'Coach',
        from_name: name, client_name: name,
        client_wa: localStorage.getItem('rwm-i-wa') || '--',
        intake_text: body,
      });
    } catch(e) { console.warn('Review email error:', e); }
  }

  document.getElementById('review-form').style.display = 'none';
  document.getElementById('review-thanks').style.display = '';
}

// ─── LANGUAGE TOGGLE (EN / PAP) ───────────────────────────────────────────────
const TRANSLATIONS = {
  en: {
    'nav-programme-label': 'Programme',
    'nav-welcome':         'Overview',
    'nav-programme':       'About Rooted in 40',
    'nav-part1-label':     'Part 1',
    'nav-intake':          'Client Intake',
    'nav-part2-label':     'Part 2 — The Method',
    'nav-layer1':          'Layer 1 · Identity',
    'nav-layer2':          'Layer 2 · Rhythm',
    'nav-layer3':          'Layer 3 · Recovery',
    'nav-part3-label':     'Part 3',
    'nav-checkin':         '90-Day Check-ins',
    'nav-resources-label': 'Resources',
    'nav-nutrition':       'Nutrition Guide',
    'nav-milestone-label': 'Milestone',
    'nav-reflection':      'Day 40 Reflection',
    'sidebar-progress':    'Progress',
    'day-of-40':           'of 40',
    'btn-waitlist':        'Join the waitlist',
  },
  pap: {
    'nav-programme-label': 'Programa',
    'nav-welcome':         'Panorama',
    'nav-programme':       'Riba Rooted in 40',
    'nav-part1-label':     'Parti 1',
    'nav-intake':          'Formulario Inicial',
    'nav-part2-label':     'Parti 2 — E Metodo',
    'nav-layer1':          'Capa 1 · Identidad',
    'nav-layer2':          'Capa 2 · Ritmo',
    'nav-layer3':          'Capa 3 · Rekuperacion',
    'nav-part3-label':     'Parti 3',
    'nav-checkin':         'Check-in di 90 Dia',
    'nav-resources-label': 'Recursonan',
    'nav-nutrition':       'Guia di Nutricion',
    'nav-milestone-label': 'Hito',
    'nav-reflection':      'Reflexion Dia 40',
    'sidebar-progress':    'Progreso',
    'day-of-40':           'di 40',
    'btn-waitlist':        'Inscribi riba lista',
  }
};

let currentLang = 'en';

function applyLang(lang) {
  currentLang = lang;
  try { localStorage.setItem('rwm-lang', lang); } catch(e) {}
  const t = TRANSLATIONS[lang] || TRANSLATIONS.en;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (t[key] !== undefined) el.textContent = t[key];
  });
  const toggle = document.getElementById('lang-toggle');
  if (toggle) toggle.textContent = lang === 'en' ? 'PAP' : 'EN';
  document.documentElement.lang = lang === 'pap' ? 'pap' : 'en';
}

function toggleLang() {
  applyLang(currentLang === 'en' ? 'pap' : 'en');
}

// ─── DAY TRACKER & STREAK ─────────────────────────────────────────────────────
function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

function getStartDate() {
  let d = localStorage.getItem('rwm-start-date');
  if (!d) {
    d = toDateStr(new Date());
    try { localStorage.setItem('rwm-start-date', d); } catch(e) {}
  }
  return d;
}

function getDayNumber() {
  const start = new Date(getStartDate() + 'T00:00:00');
  const today = new Date(toDateStr(new Date()) + 'T00:00:00');
  const diff = Math.floor((today - start) / 86400000) + 1;
  return Math.min(Math.max(diff, 1), 40);
}

function getDailyRecord(dateStr) {
  try { return JSON.parse(localStorage.getItem('rwm-daily-' + dateStr) || '{}'); }
  catch(e) { return {}; }
}

function dayHasAnchor(dateStr) {
  const rec = getDailyRecord(dateStr);
  return Object.values(rec).some(v => v === '1');
}

function getStreak() {
  const d = new Date();
  // If today has no anchors yet, start from yesterday so streak isn't broken mid-day
  if (!dayHasAnchor(toDateStr(d))) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (streak < 40) {
    if (!dayHasAnchor(toDateStr(d))) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function getDaysActive() {
  const start = new Date(getStartDate() + 'T00:00:00');
  const today = new Date(toDateStr(new Date()) + 'T00:00:00');
  const total = Math.min(Math.floor((today - start) / 86400000) + 1, 40);
  let active = 0;
  for (let i = 0; i < total; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    if (dayHasAnchor(toDateStr(d))) active++;
  }
  return active;
}

function getWeeklyStats() {
  const start = new Date(getStartDate() + 'T00:00:00');
  const today = new Date(toDateStr(new Date()) + 'T00:00:00');
  const total = Math.min(Math.floor((today - start) / 86400000) + 1, 40);
  const weeks = [];
  for (let w = 0; w < Math.ceil(total / 7); w++) {
    let ticks = 0, possible = 0;
    for (let d = 0; d < 7; d++) {
      const offset = w * 7 + d;
      if (offset >= total) break;
      const date = new Date(start);
      date.setDate(date.getDate() + offset);
      const rec = getDailyRecord(toDateStr(date));
      ticks += Object.values(rec).filter(v => v === '1').length;
      possible += 5;
    }
    weeks.push({ week: w + 1, rate: possible > 0 ? ticks / possible : 0 });
  }
  return weeks;
}

// ─── SIDEBAR STATS ────────────────────────────────────────────────────────────
function updateSidebarStats() {
  const statsEl = document.getElementById('sidebar-stats');
  if (!statsEl || !isUnlocked) return;
  statsEl.style.display = '';

  const dayNum = getDayNumber();
  const streak = getStreak();

  const numEl = document.getElementById('day-number');
  if (numEl) numEl.textContent = dayNum;

  const ringFill = document.getElementById('ring-fill');
  if (ringFill) {
    const circ = 2 * Math.PI * 28;
    ringFill.style.strokeDasharray = circ;
    ringFill.style.strokeDashoffset = circ * (1 - dayNum / 40);
  }

  const streakBadge = document.getElementById('streak-badge');
  const streakCount = document.getElementById('streak-count');
  if (streakCount) streakCount.textContent = streak;
  if (streakBadge) streakBadge.style.display = streak > 0 ? '' : 'none';

  // Show reflection nav item when client reaches day 35+ as a teaser, fully at 40
  const refNav = document.getElementById('nav-reflection');
  const refLabel = document.getElementById('nav-label-reflection');
  if (refNav && refLabel) {
    if (dayNum >= 35) {
      refNav.style.display = '';
      refLabel.style.display = '';
      if (dayNum < 40) refNav.classList.add('gated');
      else refNav.classList.remove('gated');
    }
  }
}

// ─── DAILY ANCHOR CHECK-IN ───────────────────────────────────────────────────
function renderAnchorCheckin() {
  const widget = document.getElementById('anchor-checkin');
  const list   = document.getElementById('anchor-checkin-list');
  if (!widget || !list || !isUnlocked) return;
  widget.style.display = '';

  const todayStr = toDateStr(new Date());
  const rec = getDailyRecord(todayStr);

  list.innerHTML = [1,2,3,4,5].map(n => {
    const label = (localStorage.getItem('rwm-anc-' + n) || '').trim() || 'Anchor ' + n;
    const done  = rec[n] === '1';
    return `<label class="anchor-check-item${done ? ' done' : ''}">
      <input type="checkbox" ${done ? 'checked' : ''} onchange="saveTodayAnchor(${n}, this.checked)">
      <span class="anchor-check-box"></span>
      <span class="anchor-check-label">${escHtmlClient(label)}</span>
    </label>`;
  }).join('');
}

function saveTodayAnchor(num, checked) {
  const todayStr = toDateStr(new Date());
  const rec = getDailyRecord(todayStr);
  rec[num] = checked ? '1' : '0';
  try { localStorage.setItem('rwm-daily-' + todayStr, JSON.stringify(rec)); } catch(e) {}
  syncCheckinToSupabase(todayStr, rec);
  // Refresh check-in UI inline (avoid full re-render so checkbox state is preserved)
  document.querySelectorAll('.anchor-check-item').forEach((el, i) => {
    const inp = el.querySelector('input');
    if (inp && inp.checked) el.classList.add('done');
    else el.classList.remove('done');
  });
  updateSidebarStats();
  renderProgressDashboard();
}

// ─── PROGRESS DASHBOARD ───────────────────────────────────────────────────────
function renderProgressDashboard() {
  const dash = document.getElementById('prog-dashboard');
  if (!dash || !isUnlocked) return;
  dash.style.display = '';

  const streak    = getStreak();
  const daysActive = getDaysActive();
  const weeks     = getWeeklyStats();
  const totalRate = weeks.length > 0
    ? weeks.reduce((s, w) => s + w.rate, 0) / weeks.length : 0;

  const el = id => document.getElementById(id);
  if (el('dash-days'))   el('dash-days').textContent   = daysActive;
  if (el('dash-streak')) el('dash-streak').textContent = streak;
  if (el('dash-rate'))   el('dash-rate').textContent   = Math.round(totalRate * 100) + '%';

  const chart = el('weekly-chart');
  if (chart) {
    chart.innerHTML = weeks.length === 0
      ? '<p class="chart-empty">Start checking in your anchors each day to see weekly progress here.</p>'
      : `<div class="chart-label">Weekly anchor completion</div>
         <div class="bar-chart">
           ${weeks.map(w => `<div class="bar-col">
             <div class="bar-wrap"><div class="bar-fill" style="height:${Math.round(w.rate*100)}%"></div></div>
             <div class="bar-label">Wk ${w.week}</div>
           </div>`).join('')}
         </div>`;
  }

  const sectComp = el('section-completion');
  if (sectComp) {
    const sections = [
      { label:'Client Intake',      keys:['rwm-i-name','rwm-a-body','rwm-c-goal','rwm-c-why'] },
      { label:'Layer 1 · Identity', keys:['rwm-l1-selfimage','rwm-l1-vision','rwm-l1-declaration','rwm-l1-words'] },
      { label:'Layer 2 · Rhythm',   keys:['rwm-l2-body-move','rwm-l2-mind-stillness','rwm-anc-1','rwm-anc-2','rwm-anc-3'] },
      { label:'Layer 3 · Recovery', keys:['rwm-l3-slide-trigger','rwm-l3-ritual','rwm-cov-name'] },
      { label:'90-Day Check-ins',   keys:['rwm-m1-strongest','rwm-m1-proud'] },
    ];
    sectComp.innerHTML = `<div class="chart-label" style="margin-top:24px">Workbook sections</div>
      <div class="section-list">
        ${sections.map(s => {
          const filled = s.keys.filter(k => (localStorage.getItem(k)||'').trim().length > 2).length;
          const done    = filled === s.keys.length;
          const partial = filled > 0 && !done;
          const cls     = done ? 'done' : partial ? 'partial' : '';
          const status  = done ? 'Complete' : partial ? `${filled}/${s.keys.length}` : 'Not started';
          return `<div class="section-row ${cls}">
            <span class="section-dot"></span>
            <span class="section-row-label">${s.label}</span>
            <span class="section-row-status">${status}</span>
          </div>`;
        }).join('')}
      </div>`;
  }
}

// ─── DAY 40 REFLECTION EMAIL ──────────────────────────────────────────────────
function buildReflectionText() {
  const get  = id => (localStorage.getItem('rwm-' + id) || '').trim();
  const name = get('i-name') || 'Client';
  return `
DAY 40 REFLECTION -- THE ROOTED WOMAN METHOD
============================================
Submitted: ${new Date().toLocaleString('en-GB')}
Client: ${name}

1. What has changed most for you in the last 40 days?
${get('r40-changed')}

2. What are you most proud of?
${get('r40-proud')}

3. Which anchor became your strongest?
${get('r40-anchor')}

4. What do you want to carry forward?
${get('r40-carry')}

5. What does the next chapter look like?
${get('r40-next')}
`.trim();
}

async function submitReflectionEmail() {
  autosave();
  const name = localStorage.getItem('rwm-i-name') || 'Client';
  const {pk, sid, tid, ready} = checkEJSReady();

  if (!ready) {
    openModal('error', 'Setup not complete',
      'Please fill in your EmailJS keys in the Client Intake page before sending.',
      [{label:'OK', cls:'btn-save', fn: closeModal}]);
    return;
  }

  const btn = document.getElementById('btn-submit-reflection');
  if (btn) btn.disabled = true;
  openModal('loading', 'Sending your reflection...', 'Please wait a moment.', []);

  try {
    emailjs.init({publicKey: pk});
    await emailjs.send(sid, tid, {
      to_email:    COACH_EMAIL,
      to_name:     'Coach',
      from_name:   name,
      client_name: name,
      client_wa:   localStorage.getItem('rwm-i-wa') || '--',
      intake_text: buildReflectionText(),
    });
    localStorage.setItem('rwm-reflection-submitted', new Date().toISOString());
    openModal('success', 'Reflection sent!',
      `Your Day 40 reflection has been sent to your coach at <strong>${COACH_EMAIL}</strong>.<br><br>Congratulations on completing the 40-day programme. This is only the beginning.`,
      [{label:'Close', cls:'btn-save', fn: closeModal}]);
  } catch(err) {
    openModal('error', 'Something went wrong',
      `Could not send: <code>${err.text || err.message || 'unknown'}</code>`,
      [{label:'Try again', cls:'btn-save', fn: () => { closeModal(); if (btn) btn.disabled = false; }},
       {label:'Close',     cls:'btn-ghost', fn: () => { closeModal(); if (btn) btn.disabled = false; }}]);
  }
}

// ─── STARTUP ──────────────────────────────────────────────────────────────────
document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
  cb.addEventListener('change', autosave);
});
document.querySelectorAll('input[type="radio"]').forEach(r => {
  r.addEventListener('change', autosave);
});

async function init() {
  await checkSupabaseSession();
  loadAll();
  renderTestimonials();
  // Restore language preference
  const savedLang = localStorage.getItem('rwm-lang') || 'en';
  applyLang(savedLang);
  // Restore review state if already submitted
  if (localStorage.getItem('rwm-review-submitted')) {
    const rf = document.getElementById('review-form');
    const rt = document.getElementById('review-thanks');
    if (rf) rf.style.display = 'none';
    if (rt) rt.style.display = '';
  }
  // Restore review rating and recommend selections
  const savedRating = localStorage.getItem('rwm-rev-rating');
  if (savedRating) selectReviewRating(parseInt(savedRating));
  const savedRec = localStorage.getItem('rwm-rev-recommend');
  if (savedRec) selectRecommend(savedRec);
}
init();
