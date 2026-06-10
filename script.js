// ─── FIREBASE ─────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAZuVfKnZcGzS7N3uJT_JGdFsk3flwZNPM",
  authDomain: "rooted-in-40.firebaseapp.com",
  databaseURL: "https://rooted-in-40-default-rtdb.firebaseio.com",
  projectId: "rooted-in-40",
  storageBucket: "rooted-in-40.firebasestorage.app",
  messagingSenderId: "898334778171",
  appId: "1:898334778171:web:08bf4e6ccd5165178ecd1e"
};
let db = null;
try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.database();
} catch(e) { console.warn('Firebase init failed, offline mode:', e); }

// ─── APP STATE ────────────────────────────────────────────────────────────────
const PAGES = ['welcome','programme','intake','layer1','layer2','layer3','checkin','nutrition'];
const FREE_PAGES   = ['welcome','programme'];
const LOCKED_PAGES = ['intake','layer1','layer2','layer3','checkin','nutrition'];
const COACH_EMAIL = 'shadeybahali@gmail.com';
const ACCESS_CODE = 'ROOTED40';

let isUnlocked  = false;
let pendingPage = null;
let clientCode  = null;

// ─── FIREBASE HELPERS ─────────────────────────────────────────────────────────
async function registerClient(code) {
  if (!db) return;
  try {
    const ref  = db.ref('clients/'+code+'/profile');
    const snap = await ref.once('value');
    const updates = { lastSeen: Date.now() };
    if (!snap.val()?.createdAt) updates.createdAt = Date.now();
    const name = localStorage.getItem('rwm-i-name');
    const wa   = localStorage.getItem('rwm-i-wa');
    if (name) updates.name = name;
    if (wa)   updates.whatsapp = wa;
    await ref.update(updates);
  } catch(e) {}
}

let syncTimer = null;
function syncToFirebase() {
  if (!db || !clientCode) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
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
      'm3-strongest','m3-hardest','m3-proud','m3-different'
    ];
    const data = {};
    textIds.forEach(id => {
      const val = localStorage.getItem('rwm-'+id);
      if (val && val.trim()) data[id] = val;
    });
    // Also update profile name/whatsapp when those fields are filled in
    const name = data['i-name'], wa = data['i-wa'];
    try {
      await db.ref('clients/'+clientCode+'/data').update(data);
      const profileUpdates = { lastSeen: Date.now() };
      if (name) profileUpdates.name = name;
      if (wa)   profileUpdates.whatsapp = wa;
      await db.ref('clients/'+clientCode+'/profile').update(profileUpdates);
    } catch(e) {}
  }, 2000);
}

async function loadFromFirebase(code) {
  if (!db) return;
  try {
    const snap = await db.ref('clients/'+code+'/data').once('value');
    const data = snap.val() || {};
    Object.entries(data).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el && val) {
        el.value = val;
        localStorage.setItem('rwm-'+id, val);
      }
    });
  } catch(e) {}
}

async function loadCoachContent(code) {
  if (!db) return;
  const container = document.getElementById('coach-content');
  if (!container) return;
  try {
    const [msgsSnap, progSnap, profileSnap] = await Promise.all([
      db.ref('messages/'+code).once('value'),
      db.ref('programmes/'+code).once('value'),
      db.ref('clients/'+code+'/profile').once('value')
    ]);
    const msgs    = msgsSnap.val()    || {};
    const prog    = progSnap.val()    || {};
    const profile = profileSnap.val() || {};

    const msgList = Object.values(msgs).sort((a,b) => b.time - a.time).slice(0,3);
    const hasMsgs = msgList.length > 0;

    // Calculate current week
    const createdAt = profile.createdAt || Date.now();
    const daysSince = Math.floor((Date.now() - createdAt) / 86400000);
    const week = Math.min(Math.max(Math.floor(daysSince/7)+1, 1), 5);
    const weekData = prog['week'+week] || {};
    const hasProg = Object.keys(weekData).length > 0;

    if (!hasMsgs && !hasProg) { container.style.display = 'none'; return; }

    const dayNames = ['mon','tue','wed','thu','fri','sat','sun'];
    const dayLabels = { mon:'Mon', tue:'Tue', wed:'Wed', thu:'Thu', fri:'Fri', sat:'Sat', sun:'Sun' };

    let html = '';

    if (hasMsgs) {
      html += `<div style="background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:24px 28px;margin-bottom:20px">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--warm);font-weight:400;margin-bottom:10px">From your coach</div>
        ${msgList.map(m => `<div style="font-size:14px;color:var(--soil);font-weight:300;line-height:1.7;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--border)">${escHtmlClient(m.text)}</div>`).join('')}
      </div>`;
    }

    if (hasProg) {
      const days = dayNames.map(day => {
        const d = weekData[day];
        if (!d || d.type === 'Rest') return `<div style="background:var(--warm-pale);border:1px solid var(--warm-light);border-radius:8px;padding:10px 12px;text-align:center"><div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--soil-muted);margin-bottom:4px">${dayLabels[day]}</div><div style="font-size:12px;color:var(--soil-hint)">Rest</div></div>`;
        return `<div style="background:#fff;border:1px solid var(--border);border-radius:8px;padding:10px 12px"><div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--soil-muted);margin-bottom:4px">${dayLabels[day]}</div><div style="font-size:12px;font-weight:500;color:var(--soil);margin-bottom:4px">${escHtmlClient(d.title||d.type)}</div>${d.notes?`<div style="font-size:11px;color:var(--soil-muted);font-weight:300;white-space:pre-line;line-height:1.5">${escHtmlClient(d.notes)}</div>`:''}`;
      }).join('');
      html += `<div style="background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:24px 28px">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--warm);font-weight:400;margin-bottom:6px">Your programme</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:500;color:var(--soil);margin-bottom:16px">Week ${week}</div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px">${days}</div>
      </div>`;
    }

    container.innerHTML = html;
    container.style.display = 'block';
  } catch(e) { console.warn('Coach content load error:', e); }
}

function escHtmlClient(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

async function tryUnlock() {
  const input   = document.getElementById('unlock-input');
  const errorEl = document.getElementById('unlock-error');
  const paywall = document.getElementById('paywall');
  const unlockBtn = document.querySelector('.unlock-row button');

  if (!input || !errorEl || !paywall) return;

  const val = input.value.trim().toUpperCase().replace(/\s+/g, '');
  if (!val) return;

  // Check hardcoded code first (works offline)
  let valid = (val === ACCESS_CODE);

  // Also check Firebase for dynamic per-client codes
  if (!valid && db) {
    try {
      if (unlockBtn) { unlockBtn.textContent = 'Checking...'; unlockBtn.disabled = true; }
      const snap = await db.ref('coach/codes/'+val).once('value');
      const codeData = snap.val();
      if (codeData && codeData.active) valid = true;
    } catch(e) {}
    if (unlockBtn) { unlockBtn.textContent = 'Unlock ->'; unlockBtn.disabled = false; }
  }

  if (valid) {
    clientCode = val;
    try {
      localStorage.setItem('rwm-unlocked', '1');
      localStorage.setItem('rwm-client-code', val);
    } catch(e) {}
    isUnlocked = true;
    input.classList.remove('error');
    errorEl.classList.remove('visible');
    paywall.style.display = 'none';
    LOCKED_PAGES.forEach(p => {
      const nav = document.getElementById('nav-'+p);
      if (nav) nav.classList.remove('gated');
    });
    registerClient(val);
    loadFromFirebase(val).then(() => updateProgress());
    loadCoachContent(val);
    const dest = pendingPage || 'welcome';
    pendingPage = null;
    showPage(dest);
  } else {
    input.classList.add('error');
    errorEl.classList.add('visible');
    input.select();
    input.focus();
  }
}

async function checkUnlock() {
  try {
    isUnlocked = localStorage.getItem('rwm-unlocked') === '1';
    clientCode = localStorage.getItem('rwm-client-code') || null;
  } catch(e) {}

  // If we have a stored code, verify it is still active in Firebase
  // (allows Shadey to revoke access; hardcoded ROOTED40 always passes)
  if (isUnlocked && clientCode && clientCode !== ACCESS_CODE && db) {
    try {
      const snap = await db.ref('coach/codes/'+clientCode).once('value');
      const data = snap.val();
      if (!data || !data.active) {
        // Code revoked -- lock the app
        isUnlocked = false;
        clientCode = null;
        try { localStorage.removeItem('rwm-unlocked'); localStorage.removeItem('rwm-client-code'); } catch(e) {}
      }
    } catch(e) { /* Network error -- trust localStorage for offline use */ }
  }

  if (!isUnlocked) {
    LOCKED_PAGES.forEach(p => {
      const nav = document.getElementById('nav-'+p);
      if (nav) nav.classList.add('gated');
    });
  } else if (clientCode) {
    registerClient(clientCode);
    loadCoachContent(clientCode);
  }
}

function closePaywall() {
  const paywall = document.getElementById('paywall');
  if (paywall) paywall.style.display = 'none';
  pendingPage = null;
  // Make sure a free page is active
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
    'm3-strongest','m3-hardest','m3-proud','m3-different'
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
    'm3-strongest','m3-hardest','m3-proud','m3-different'
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
  syncToFirebase();
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

document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
  cb.addEventListener('change', autosave);
});
document.querySelectorAll('input[type="radio"]').forEach(r => {
  r.addEventListener('change', autosave);
});

checkUnlock();
loadAll();
