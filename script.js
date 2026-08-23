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
const PAGES = ['welcome','intake','layer1','layer2','layer3','checkin','nutrition','gym','reflection','myprog'];
const COACH_EMAIL = 'shadeybahali@gmail.com';
const ACCESS_CODE = 'ROOTED40';

let isUnlocked = false;
let clientCode = null;

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
      'm3-strongest','m3-hardest','m3-proud','m3-different',
      'r40-changed','r40-proud','r40-anchor','r40-carry','r40-next'
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

    if (!hasMsgs && !hasProg) { container.classList.remove('visible'); return; }

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
    container.classList.add('visible');
  } catch(e) { console.warn('Coach content load error:', e); }
}

function escHtmlClient(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

function showLanding() {
  document.getElementById('view-landing').style.display = '';
  document.getElementById('view-portal').style.display = 'none';
  document.getElementById('hamburger-btn').style.display = 'none';
}

function enterPortal(code) {
  clientCode = code;
  isUnlocked = true;
  document.getElementById('view-landing').style.display = 'none';
  document.getElementById('view-portal').style.display = '';
  document.getElementById('hamburger-btn').style.display = '';

  if (!localStorage.getItem('rwm-start-date')) {
    localStorage.setItem('rwm-start-date', toDateStr(new Date()));
  }

  registerClient(code);
  loadFromFirebase(code).then(() => updateProgress());
  loadCoachContent(code);
  renderMyProgramme(code);
  updateSidebarStats();
  renderAnchorCheckin();
  renderProgressDashboard();

  // Chronological: show intake first if not yet submitted, else workouts
  const firstPage = localStorage.getItem('rwm-intake-submitted') ? 'myprog' : 'intake';
  showPage(firstPage);
}

function signOut() {
  try {
    localStorage.removeItem('rwm-unlocked');
    localStorage.removeItem('rwm-client-code');
  } catch(e) {}
  isUnlocked = false;
  clientCode = null;
  showLanding();
}

async function tryUnlock() {
  const input   = document.getElementById('unlock-input');
  const errorEl = document.getElementById('unlock-error');
  const unlockBtn = document.querySelector('.unlock-row button');
  if (!input || !errorEl) return;

  const val = input.value.trim().toUpperCase().replace(/\s+/g, '');
  if (!val) return;

  let valid = (val === ACCESS_CODE);

  if (!valid && db) {
    try {
      if (unlockBtn) { unlockBtn.textContent = 'Checking…'; unlockBtn.disabled = true; }
      const snap = await db.ref('coach/codes/'+val).once('value');
      const codeData = snap.val();
      if (codeData && codeData.active) valid = true;
    } catch(e) {}
    if (unlockBtn) { unlockBtn.textContent = 'Enter portal →'; unlockBtn.disabled = false; }
  }

  if (valid) {
    try {
      localStorage.setItem('rwm-unlocked', '1');
      localStorage.setItem('rwm-client-code', val);
    } catch(e) {}
    input.classList.remove('error');
    errorEl.classList.remove('visible');
    enterPortal(val);
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

  if (isUnlocked && clientCode && clientCode !== ACCESS_CODE && db) {
    try {
      const snap = await db.ref('coach/codes/'+clientCode).once('value');
      const data = snap.val();
      if (!data || !data.active) {
        isUnlocked = false;
        clientCode = null;
        try { localStorage.removeItem('rwm-unlocked'); localStorage.removeItem('rwm-client-code'); } catch(e) {}
      }
    } catch(e) {}
  }

  if (isUnlocked && clientCode) {
    enterPortal(clientCode);
  } else {
    showLanding();
  }
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
  // Reflection page requires day 40
  if (id === 'reflection' && getDayNumber() < 40) {
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

  // Always store in Firebase so Shadey can see it in admin
  if (db) {
    try { await db.ref('waitlist').push({ name, whatsapp: wa, submittedAt: Date.now() }); } catch(e) {}
  }

  // Also email via EmailJS if keys are configured on this device
  const { pk, sid, tid, ready } = checkEJSReady();
  if (ready) {
    try {
      emailjs.init({ publicKey: pk });
      await emailjs.send(sid, tid, {
        to_email:    COACH_EMAIL,
        to_name:     'Shadey Figaroa',
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

// ─── SALES FUNNEL (landing page scroll experience) ─────────────────────────────
function scrollToStep(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function initFunnel() {
  const hero = document.getElementById('step-hero');
  if (!hero) return; // not on the landing page (e.g. admin/coach pages)

  // Hero lines fade in on load, staggered by their own transition-delay
  requestAnimationFrame(() => {
    hero.querySelectorAll('.reveal-line').forEach(el => el.classList.add('is-visible'));
  });

  // Stagger entrance delay for grouped items based on position in their parent
  document.querySelectorAll('.fit-checklist').forEach(list => {
    Array.from(list.children).forEach((el, i) => { el.style.transitionDelay = (i * 120) + 'ms'; });
  });
  document.querySelectorAll('.includes-grid').forEach(grid => {
    Array.from(grid.children).forEach((el, i) => { el.style.transitionDelay = (i * 90) + 'ms'; });
  });
  document.querySelectorAll('.rhythm-grid').forEach(grid => {
    Array.from(grid.children).forEach((el, i) => { el.style.transitionDelay = (i * 90) + 'ms'; });
  });

  // Generic scroll-triggered reveal
  const revealEls = document.querySelectorAll('.reveal, .fit-item, .include-card, .rhythm-day');
  if (revealEls.length && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(el => observer.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('is-visible'));
  }

  // Reveal the "Yes, this is me" CTA once all 5 checklist items have appeared
  const fitItems = document.querySelectorAll('.fit-item');
  const fitCta = document.getElementById('fit-cta');
  if (fitItems.length && fitCta && 'IntersectionObserver' in window) {
    let revealed = 0;
    const fitObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          revealed++;
          fitObserver.unobserve(entry.target);
          if (revealed >= fitItems.length) {
            setTimeout(() => fitCta.classList.add('is-visible'), 500);
          }
        }
      });
    }, { threshold: 0.3 });
    fitItems.forEach(el => fitObserver.observe(el));
  } else if (fitCta) {
    fitCta.classList.add('is-visible');
  }

  // Include cards flip on tap/click (and on hover for mouse users, via CSS)
  document.querySelectorAll('.include-card').forEach(card => {
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.addEventListener('click', () => card.classList.toggle('is-flipped'));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.classList.toggle('is-flipped'); }
    });
  });

  // Floating scroll-to-top button
  const topBtn = document.getElementById('scroll-top-btn');
  if (topBtn) {
    window.addEventListener('scroll', () => {
      topBtn.classList.toggle('is-visible', window.scrollY > window.innerHeight * 0.8);
    }, { passive: true });
  }
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
  if (db && clientCode) {
    try { await db.ref('reviews/' + clientCode).set({ rating, recommend, changed, proud, submittedAt: Date.now() }); } catch(e) {}
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
    'nav-gym':             'Gym Guide',
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
    'nav-gym':             'Guia di Gimnasio',
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

// Keyboard navigation for div-based nav items
document.querySelectorAll('.nav-item[role="button"]').forEach(el => {
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
  });
});

// ─── CONSENT BANNER ───────────────────────────────────────────────────────────
function showConsent() {
  const banner = document.getElementById('consent-banner');
  if (!banner) return;
  if (localStorage.getItem('rwm-consent') === '1') return;
  banner.style.display = 'flex';
}

function acceptConsent() {
  try { localStorage.setItem('rwm-consent', '1'); } catch(e) {}
  const banner = document.getElementById('consent-banner');
  if (banner) banner.style.display = 'none';
}

// ── My Programme (client-facing) ──────────────────────────────────────────────
const PROG_DAY_KEYS   = ['mon','tue','wed','thu','fri','sat','sun'];
const PROG_DAY_LABELS = { mon:'Monday', tue:'Tuesday', wed:'Wednesday', thu:'Thursday', fri:'Friday', sat:'Saturday', sun:'Sunday' };

function ytVideoId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function ytEmbed(url) {
  const id = ytVideoId(url);
  return id ? `https://www.youtube.com/embed/${id}` : null;
}

let myProgData = null;
let myProgLogs = {};
let myProgCurrentWeek = 1;
let myProgAssigned = null; // { templateId, templateName, difficulty, notes, durationWeeks, startDate, assignedAt }

async function renderMyProgramme(code) {
  if (!code || !db) return;
  const body   = document.getElementById('myprog-body');
  const tabs   = document.getElementById('myprog-week-tabs');
  const banner = document.getElementById('myprog-banner');
  if (!body || !tabs) return;

  tabs.innerHTML = '';
  if (banner) banner.innerHTML = '';
  body.innerHTML = '<p class="myprog-loading">Loading your programme…</p>';

  let profile = {};
  try {
    const [progSnap, logSnap, profileSnap] = await Promise.all([
      db.ref('programmes/' + code).once('value'),
      db.ref('programme-logs/' + code).once('value'),
      db.ref('clients/' + code + '/profile').once('value'),
    ]);
    myProgData = progSnap.val() || {};
    myProgLogs = logSnap.val() || {};
    profile    = profileSnap.val() || {};
  } catch(e) {
    myProgData = {};
    myProgLogs = {};
  }

  myProgAssigned = profile.assignedProgramme || null;

  // Build week tabs (only weeks that have data — templates can run up to 8 weeks)
  const weeks = [1,2,3,4,5,6,7,8].filter(w => myProgData['week'+w]);

  if (!myProgAssigned || weeks.length === 0) {
    body.innerHTML = `<div class="myprog-empty">
      <div class="myprog-empty-icon">🌸</div>
      <h3>Your coach will assign your programme soon</h3>
      <p>Once Shadey builds your weekly plan, it will appear here automatically.</p>
      <a class="myprog-empty-wa" href="https://wa.me/2977300112" target="_blank" rel="noopener">📱 Message Shadey on WhatsApp</a>
    </div>`;
    return;
  }

  if (banner) {
    banner.innerHTML = `<div class="myprog-banner">
      ${myProgAssigned.difficulty ? `<span class="myprog-banner-diff">${escHtmlClient(myProgAssigned.difficulty)}</span>` : ''}
      ${myProgAssigned.notes ? `<p>${escHtmlClient(myProgAssigned.notes)}</p>` : ''}
    </div>`;
  }

  // Auto-calculate current week from days since unlock
  const dayNum = getDayNumber();
  myProgCurrentWeek = Math.min(Math.ceil(dayNum / 7), weeks.length);
  if (!weeks.includes(myProgCurrentWeek)) myProgCurrentWeek = weeks[0];

  tabs.innerHTML = weeks.map(w =>
    `<button class="myprog-week-tab${w === myProgCurrentWeek ? ' active' : ''}" onclick="showProgWeek(${w})" aria-label="Week ${w}">Week ${w}${w === myProgCurrentWeek ? ' <span class="myprog-current-badge">current</span>' : ''}</button>`
  ).join('');

  showProgWeek(myProgCurrentWeek);
}

function showProgWeek(w) {
  myProgCurrentWeek = w;
  // Update tab active state
  document.querySelectorAll('.myprog-week-tab').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.startsWith('Week ' + w));
  });
  const body = document.getElementById('myprog-body');
  if (!body) return;

  const weekData = (myProgData || {})['week' + w] || {};
  const weekLogs = (myProgLogs || {})['week' + w] || {};

  body.innerHTML = PROG_DAY_KEYS.map(day => {
    const d = weekData[day] || {};
    const log = weekLogs[day] || {};
    const isRest = !d.type || d.type === 'Rest';
    const exercises = Array.isArray(d.exercises) ? d.exercises : [];
    const checked = log.completed ? 'checked' : '';
    const logNote = escHtmlClient(log.note || '');

    const exercisesHtml = exercises.map((ex, i) => {
      const embed = ex.videoUrl ? ytEmbed(ex.videoUrl) : null;
      const videoLink = !embed && ex.videoUrl ? `<a class="myprog-video-link" href="${escHtmlClient(ex.videoUrl)}" target="_blank" rel="noopener">▶ Watch video</a>` : '';
      return `<div class="myprog-exercise">
        <div class="myprog-ex-header">
          <span class="myprog-ex-num">${i + 1}</span>
          <span class="myprog-ex-name">${escHtmlClient(ex.name || '')}</span>
          ${ex.sets && ex.reps ? `<span class="myprog-ex-setsreps">${escHtmlClient(ex.sets)}×${escHtmlClient(ex.reps)}</span>` : ''}
          ${ex.restTime ? `<span class="myprog-ex-rest">Rest ${escHtmlClient(ex.restTime)}</span>` : ''}
        </div>
        ${ex.notes ? `<div class="myprog-notes-text">${escHtmlClient(ex.notes)}</div>` : ''}
        ${embed ? `<div class="prog-video-wrap"><iframe src="${embed}" title="${escHtmlClient(ex.name||'Exercise video')}" frameborder="0" allowfullscreen loading="lazy"></iframe></div>` : videoLink}
      </div>`;
    }).join('');

    const sessionPillClass = d.sessionType ? d.sessionType.replace(/\s+/g,'') : '';

    return `<div class="myprog-day-card${log.completed ? ' myprog-done' : ''}">
      <div class="myprog-day-name">${PROG_DAY_LABELS[day]}</div>
      ${isRest
        ? `<div class="myprog-rest-badge">Rest Day</div>`
        : `${d.sessionType ? `<span class="myprog-session-pill myprog-session-pill--${sessionPillClass}">${escHtmlClient(d.sessionType)}</span>` : ''}
           ${d.title ? `<div class="myprog-workout-title">${escHtmlClient(d.title)}</div>` : ''}
           ${d.dayNotes ? `<div class="myprog-daynotes">${escHtmlClient(d.dayNotes)}</div>` : ''}
           ${exercisesHtml}
           <div class="myprog-log">
             <label class="myprog-check-label">
               <input type="checkbox" class="myprog-check" id="chk-${day}" ${checked} onchange="saveProgLog('${day}',${w})">
               <span class="myprog-check-text">Completed</span>
             </label>
             <textarea class="myprog-log-note" id="lognote-${day}" placeholder="How did it go? Any notes…" rows="2">${logNote}</textarea>
             <button class="myprog-log-btn" onclick="saveProgLog('${day}',${w})" id="logbtn-${day}">Save</button>
             ${log.savedAt ? `<span class="myprog-log-saved">Last saved ${new Date(log.savedAt).toLocaleDateString()}</span>` : ''}
           </div>`
      }
    </div>`;
  }).join('');
}

async function saveProgLog(day, week) {
  if (!clientCode || !db) return;
  const btn  = document.getElementById('logbtn-' + day);
  const chk  = document.getElementById('chk-' + day);
  const note = document.getElementById('lognote-' + day);
  if (!btn || !chk || !note) return;
  btn.textContent = 'Saving…'; btn.disabled = true;
  const logData = { completed: chk.checked, note: note.value.trim(), savedAt: Date.now() };
  try {
    await db.ref('programme-logs/' + clientCode + '/week' + week + '/' + day).set(logData);
    if (!myProgLogs['week' + week]) myProgLogs['week' + week] = {};
    myProgLogs['week' + week][day] = logData;
    btn.textContent = 'Saved ✓'; btn.disabled = false;
    // Toggle done styling on card
    const card = chk.closest('.myprog-day-card');
    if (card) card.classList.toggle('myprog-done', chk.checked);
    setTimeout(() => { btn.textContent = 'Save'; }, 2000);
  } catch(e) {
    btn.textContent = 'Error'; btn.disabled = false;
  }
}

async function init() {
  await checkUnlock();
  loadAll();
  showConsent();
  renderTestimonials();
  initFunnel();
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
