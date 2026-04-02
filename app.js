'use strict';

// ── 시간표 데이터 ──────────────────────────────────────
const schedule = {
  boss: [
    { name: '[파우스트] 기란감옥',     time: ['10:00'], days: null,      sound: '파우스트' },
    { name: '[드레이크] 해적섬',       time: ['14:00'], days: null,      sound: '드레이크' },
    { name: '[마이노샤먼] 기란감옥',   time: ['17:10'], days: null,      sound: '마이노샤먼' },
    { name: '[이프리트] 몽환의섬',     time: ['19:10'], days: null,      sound: '이프리트' },
    { name: '[데스나이트] 기란감옥',   time: ['20:10'], days: null,      sound: '데스나이트' },
    { name: '[제로스] 버땅',           time: ['22:10'], days: null,      sound: '제로스' },
    { name: '[발록] 상아탑',           time: ['23:10'], days: [1,2,3,4,5], sound: '발록' },
    { name: '[이자벨] 신념3층',        time: ['23:10'], days: [6],       sound: '이자벨' },
    { name: '[벨리에] 신념2층',        time: ['23:10'], days: [0],       sound: '벨리에' },
    { name: '[에르자베] 개미동굴',     time: ['00:10'], days: null,      sound: '에르자베' },
    { name: '[아리모크] 악마왕의영토', time: ['01:10'], days: null,      sound: '아리오크' },
  ],
  hunting: [
    { name: '몬스터디펜스', time: ['20:25'],          days: null, sound: '몬스터디펜스' },
    { name: '배틀존',       time: ['20:45', '22:45'], days: null, sound: '배틀존' },
    { name: '길드워',       time: ['21:30'],          days: null, sound: '길드워' },
    { name: '탐욕의홀',     time: ['18:00'],          days: null, sound: '탐욕의홀' },
    { name: '지구라트',     time: ['21:00'],          days: null, sound: '지구라트' },
  ],
};

const openContents = [
  { name: '탐욕의홀', startH: 18, startM: 0, endH: 20, endM: 0 },
  { name: '지구라트', startH: 21, startM: 0, endH: 24, endM: 0 },
];

// ── 상태 ──────────────────────────────────────────────
let alarmEnabled = true;
const alarmFired = new Map();

let autoState     = 'idle';
let autoStartTime = null;
let autoEndTime   = null;
let autoWarnMin   = 10;
let autoWarnFired = {};

const BUFF_DURATION = 60 * 60 * 1000;
let buffState = {};

// ── MP3 재생 ──────────────────────────────────────────
function playMP3(filename) {
  if (!alarmEnabled) return;
  try {
    const audio = new Audio('alarm/' + filename + '.mp3');
    audio.play().catch(() => {});
  } catch(e) {}
}

// 초읽기 (5,4,3,2,1) — 해당 초에 해당 파일 재생
function playCount(sec) {
  if (sec >= 1 && sec <= 5) playMP3(String(sec));
}

// ── localStorage ──────────────────────────────────────
function loadBuffState() {
  try {
    const s = localStorage.getItem('buffState');
    if (s) buffState = JSON.parse(s);
  } catch(e) {}
}
function saveBuffState() {
  try { localStorage.setItem('buffState', JSON.stringify(buffState)); } catch(e) {}
}
function restoreAutoHunt() {
  try {
    const s = localStorage.getItem('autoHunt');
    if (!s) return;
    const d = JSON.parse(s);
    if (d.endMs <= Date.now()) { localStorage.removeItem('autoHunt'); return; }
    autoStartTime = new Date(d.startMs);
    autoEndTime   = new Date(d.endMs);
    autoWarnMin   = d.warnMin || 10;
    autoWarnFired = {};
    autoState     = 'running';
    document.getElementById('disp-start').textContent = formatHHMMSS(autoStartTime);
    document.getElementById('disp-end').textContent   = formatHHMM(autoEndTime);
    showAutoPanel('running');
  } catch(e) {}
}

// ── 알람 토글 ─────────────────────────────────────────
document.getElementById('alarm-btn').addEventListener('click', () => {
  alarmEnabled = !alarmEnabled;
  const btn = document.getElementById('alarm-btn');
  btn.textContent = alarmEnabled ? '🔔 알람 켜짐' : '🔕 알람 꺼짐';
  btn.className   = 'alarm-btn ' + (alarmEnabled ? 'on' : 'off');
});

// ── 남은 시간 계산 ────────────────────────────────────
function calcRemain(timeStr, validDays) {
  const now = new Date();
  if (validDays && !validDays.includes(now.getDay())) return null;
  const [h, m] = timeStr.split(':').map(Number);
  const target = new Date(); target.setHours(h, m, 0, 0);
  if (target <= now) {
    target.setDate(target.getDate() + 1);
    if (validDays && !validDays.includes(target.getDay())) return null;
  }
  const diffSec = Math.floor((target - now) / 1000);
  const hh = Math.floor(diffSec / 3600);
  const mm = Math.floor((diffSec % 3600) / 60);
  const ss = diffSec % 60;
  let text = '';
  if (hh > 0) text += hh + '시간 ';
  text += mm + '분 ' + String(ss).padStart(2,'0') + '초';
  return { totalSec: diffSec, text };
}

// ── 깜빡임 ────────────────────────────────────────────
let flashTimer = null, flashCount = 0;
function triggerFlash() {
  if (!alarmEnabled || flashTimer) return;
  const el = document.getElementById('flash-overlay');
  flashCount = 0;
  flashTimer = setInterval(() => {
    el.classList.toggle('active');
    if (++flashCount >= 8) {
      clearInterval(flashTimer); flashTimer = null;
      el.classList.remove('active');
    }
  }, 200);
}

// ── 비프음 ────────────────────────────────────────────
function playBeep() {
  if (!alarmEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    [0, 0.25, 0.5].forEach(o => {
      osc.frequency.setValueAtTime(1046, ctx.currentTime + o);
      gain.gain.setValueAtTime(0.4, ctx.currentTime + o);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + o + 0.2);
    });
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.8);
  } catch(e) {}
}

// ── 보스/컨텐츠 알람 체크 ────────────────────────────
const WARN_SEC = 3 * 60;

function checkAlarm(items, type) {
  // type: 'boss' | 'hunting'
  items.forEach(item => {
    const key = item.name + '_' + item.timeStr;
    const sec = item.remain.totalSec;
    const snd = item.sound; // MP3 파일명 prefix

    if (!alarmFired.has(key)) alarmFired.set(key, new Set());
    const fired = alarmFired.get(key);

    if (sec > WARN_SEC) { alarmFired.delete(key); return; }

    // 3분 전
    if (!fired.has('warn')) {
      fired.add('warn');
      triggerFlash();
      playMP3(snd + '_3분전');
    }

    // 1분 전
    if (sec <= 60 && !fired.has('1min')) {
      fired.add('1min');
      triggerFlash();
      playMP3(snd + '_1분전');
    }

    // 5초 초읽기 (비프음 + MP3)
    if (sec >= 1 && sec <= 5) {
      const ck = 'count_' + sec;
      if (!fired.has(ck)) {
        fired.add(ck);
        playBeep();
        playCount(sec);
      }
    }

    // 0초: 등장/시작
    if (sec === 0 && !fired.has('spawn')) {
      fired.add('spawn');
      triggerFlash();
      if (type === 'boss') {
        playMP3(snd + '_등장');
      } else {
        playMP3(snd + '_시작');
      }
    }
  });
}

// ── 카드 HTML ─────────────────────────────────────────
function buildCard(item, index) {
  const sec = item.remain.totalSec;
  let warnCls = '';
  if      (sec > 0 && sec <= 10)       warnCls = 'warn-3';
  else if (sec > 0 && sec <= 60)       warnCls = 'warn-2';
  else if (sec > 0 && sec <= WARN_SEC) warnCls = 'warn-1';
  const hlCls = (index === 0 && !warnCls) ? 'highlight' : '';
  return `<div class="item-card ${hlCls} ${warnCls}">
    <div class="item-left">
      <div class="item-time-label">${item.timeStr}</div>
      <div class="item-name">${item.name}</div>
    </div>
    <div class="item-right">
      <div class="remain">${item.remain.text}</div>
      <div class="remain-label">남은 시간</div>
    </div>
  </div>`;
}

// ── 개방 게이지 ───────────────────────────────────────
function renderOpenGauges() {
  const now     = new Date();
  const section = document.getElementById('open-section');
  const el      = document.getElementById('open-gauges');
  let html = '', hasOpen = false;

  openContents.forEach(c => {
    const start = new Date(now); start.setHours(c.startH, c.startM, 0, 0);
    const end   = new Date(now); end.setHours(c.endH, c.endM, 0, 0);
    const nowMs = now.getTime();
    if (nowMs < start || nowMs >= end) return;
    hasOpen = true;

    const pct       = Math.min(100, Math.round(((nowMs - start) / (end - start)) * 100));
    const remainSec = Math.max(0, Math.floor((end - nowMs) / 1000));
    const rm        = Math.floor(remainSec / 60);
    const rs        = remainSec % 60;
    const endHH     = String(end.getHours()).padStart(2,'0');
    const endMM     = String(end.getMinutes()).padStart(2,'0');
    const barColor  = pct >= 80 ? '#ff4757' : pct >= 50 ? '#ffa502' : '#4cd137';

    html += `<div class="open-gauge-card">
      <div class="open-gauge-header">
        <span class="open-gauge-name">${c.name}</span>
        <span class="open-gauge-end">${endHH}:${endMM} 종료</span>
      </div>
      <div class="gauge-bg">
        <div class="gauge-fill" style="width:${pct}%;background:${barColor};transition:width 1s linear"></div>
      </div>
      <div class="open-gauge-remain">${rm}분 ${String(rs).padStart(2,'0')}초 남음</div>
    </div>`;
  });

  el.innerHTML = html;
  section.style.display = hasOpen ? 'block' : 'none';
}

// ── 자동사냥 ──────────────────────────────────────────
function formatHHMM(d)   { return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'); }
function formatHHMMSS(d) { return formatHHMM(d) + ':' + String(d.getSeconds()).padStart(2,'0'); }

function showAutoPanel(state) {
  document.getElementById('auto-idle').style.display    = state === 'idle'    ? 'block' : 'none';
  document.getElementById('auto-running').style.display = state === 'running' ? 'block' : 'none';
  document.getElementById('auto-done').style.display    = state === 'done'    ? 'block' : 'none';
}

document.getElementById('btn-start').addEventListener('click', () => {
  const endH = parseInt(document.getElementById('input-end-hour').value) || 0;
  const endM = parseInt(document.getElementById('input-end-min').value)  || 0;
  const warn = parseInt(document.getElementById('input-warn').value)     || 10;
  const now  = new Date();
  const end  = new Date(); end.setHours(endH, endM, 0, 0);
  if (end <= now) end.setDate(end.getDate() + 1);

  autoStartTime = now; autoEndTime = end;
  autoWarnMin = warn; autoWarnFired = {}; autoState = 'running';

  localStorage.setItem('autoHunt', JSON.stringify({
    startMs: now.getTime(), endMs: end.getTime(), warnMin: warn
  }));

  document.getElementById('disp-start').textContent = formatHHMMSS(now);
  document.getElementById('disp-end').textContent   = formatHHMM(end);
  document.getElementById('auto-warn-banner').style.display = 'none';
  showAutoPanel('running');
});

document.getElementById('btn-stop').addEventListener('click', () => {
  if (!confirm('사냥을 종료하시겠습니까?')) return;
  finishAuto(true);
});

document.getElementById('btn-reset').addEventListener('click', () => {
  autoState = 'idle';
  localStorage.removeItem('autoHunt');
  showAutoPanel('idle');
});

function finishAuto(manual = false) {
  autoState = 'done';
  localStorage.removeItem('autoHunt');
  const elapsed = Math.floor((new Date() - autoStartTime) / 1000);
  const eh = Math.floor(elapsed / 3600);
  const em = Math.floor((elapsed % 3600) / 60);
  let text = '총 ';
  if (eh > 0) text += eh + '시간 ';
  text += em + '분 사냥 ' + (manual ? '(수동 종료)' : '완료');
  document.getElementById('disp-total').textContent = text;
  showAutoPanel('done');
  if (!manual) triggerFlash();
}

function updateAutoTimer() {
  if (autoState !== 'running') return;
  const now       = new Date();
  const remainMs  = autoEndTime - now;
  const remainSec = Math.floor(remainMs / 1000);

  if (remainSec <= 0) {
    if (!autoWarnFired['done']) {
      autoWarnFired['done'] = true;
      triggerFlash();
      playMP3('자동사냥_종료');
      finishAuto(false);
    }
    return;
  }

  // 게이지
  const pct = Math.min(100, Math.round(((now - autoStartTime) / (autoEndTime - autoStartTime)) * 100));
  const gf = document.getElementById('auto-gauge-fill');
  const gp = document.getElementById('disp-gauge-pct');
  const gr = document.getElementById('disp-gauge-remain');
  if (gf) { const bc = pct>=80?'#ff4757':pct>=50?'#ffa502':'#4cd137'; gf.style.width=pct+'%'; gf.style.background=bc; }
  if (gp) gp.textContent = pct + '%';

  // 카운트다운
  const rh = Math.floor(remainSec / 3600);
  const rm = Math.floor((remainSec % 3600) / 60);
  const rs = remainSec % 60;
  const cd = document.getElementById('disp-remain');
  if (cd) {
    cd.textContent = String(rh).padStart(2,'0') + ':' + String(rm).padStart(2,'0') + ':' + String(rs).padStart(2,'0');
    cd.className = 'countdown' + (remainSec <= 60 ? ' danger' : remainSec <= autoWarnMin*60 ? ' warn' : '');
  }
  if (gr) { let t=''; if(rh>0)t+=rh+'시간 '; t+=rm+'분 '+String(rs).padStart(2,'0')+'초 남음'; gr.textContent=t; }

  // 경고 배너
  const bannerEl = document.getElementById('auto-warn-banner');
  const warnText = document.getElementById('auto-warn-text');
  if (bannerEl) {
    if (remainSec <= autoWarnMin * 60) {
      bannerEl.style.display = 'block';
      if (warnText) warnText.textContent = '종료 ' + rm + '분 ' + String(rs).padStart(2,'0') + '초 전!';
    } else {
      bannerEl.style.display = 'none';
    }
  }

  // MP3 알람
  const wf = autoWarnFired;
  if (!wf.warn    && remainSec <= autoWarnMin * 60) { wf.warn    = true; triggerFlash(); playMP3('자동사냥_3분전'); }
  if (!wf['1min'] && remainSec <= 60)                { wf['1min'] = true; triggerFlash(); playMP3('자동사냥_1분전'); }

  // 5초 초읽기
  if (remainSec >= 1 && remainSec <= 5) {
    const ck = 'ac' + remainSec;
    if (!wf[ck]) { wf[ck] = true; playBeep(); playCount(remainSec); }
  }
}

// ── 숙련도 물약 ───────────────────────────────────────
document.getElementById('btn-mastery').addEventListener('click', () => {
  buffState.mastery = { startMs: Date.now() };
  saveBuffState();
  updateBuffs();
});

document.getElementById('btn-mastery-cancel').addEventListener('click', () => {
  if (!confirm('숙련도 물약 타이머를 취소하시겠습니까?')) return;
  delete buffState.mastery;
  saveBuffState();
  updateBuffs();
});

function updateBuffs() {
  const now      = Date.now();
  const m        = buffState.mastery;
  const activeEl = document.getElementById('mastery-active');
  const startBtn = document.getElementById('btn-mastery');

  if (m) {
    const elapsed   = now - m.startMs;
    const remainMs  = BUFF_DURATION - elapsed;

    // 만료
    if (remainMs <= 0) {
      delete buffState.mastery; saveBuffState();
      triggerFlash();
      playMP3('숙련도_만료');
      activeEl.style.display = 'none'; startBtn.style.display = 'inline-block';
      return;
    }

    const pct       = Math.min(100, Math.round((elapsed / BUFF_DURATION) * 100));
    const remainSec = Math.floor(remainMs / 1000);
    const rm = Math.floor(remainSec / 60);
    const rs = remainSec % 60;

    const ge = document.getElementById('mastery-gauge');
    const re = document.getElementById('mastery-remain');
    const pe = document.getElementById('mastery-pct');
    if (ge) { const bc=pct>=80?'#ff4757':pct>=50?'#ffa502':'#a6e3a1'; ge.style.width=pct+'%'; ge.style.background=bc; }
    if (re) re.textContent = rm + '분 ' + String(rs).padStart(2,'0') + '초 남음';
    if (pe) pe.textContent = pct + '%';
    activeEl.style.display = 'block'; startBtn.style.display = 'none';

    // MP3 알람
    if (!m.warned3 && remainSec <= 180) { m.warned3 = true; saveBuffState(); triggerFlash(); playMP3('숙련도_3분전'); }
    if (!m.warned1 && remainSec <= 60)  { m.warned1 = true; saveBuffState(); triggerFlash(); playMP3('숙련도_1분전'); }

    // 5초 초읽기
    if (remainSec >= 1 && remainSec <= 5) {
      const ck = 'bc' + remainSec;
      if (!m[ck]) { m[ck] = true; saveBuffState(); playBeep(); playCount(remainSec); }
    }
  } else {
    activeEl.style.display = 'none'; startBtn.style.display = 'inline-block';
  }
}

// ── 메인 업데이트 ─────────────────────────────────────
function update() {
  const now  = new Date();
  const days = ['일','월','화','수','목','금','토'];
  document.getElementById('current-time-display').textContent =
    (now.getMonth()+1) + '월 ' + now.getDate() + '일 (' + days[now.getDay()] + ') ' +
    String(now.getHours()).padStart(2,'0') + ':' +
    String(now.getMinutes()).padStart(2,'0') + ':' +
    String(now.getSeconds()).padStart(2,'0');

  // 보스 (2개)
  const bosses = [];
  schedule.boss.forEach(b => b.time.forEach(t => {
    const r = calcRemain(t, b.days);
    if (r) bosses.push({ name: b.name, timeStr: t, remain: r, sound: b.sound });
  }));
  bosses.sort((a,b) => a.remain.totalSec - b.remain.totalSec);
  checkAlarm(bosses, 'boss');
  const bossEl = document.getElementById('boss-list');
  bossEl.innerHTML = bosses.length === 0
    ? '<div class="empty-msg">오늘 남은 보스가 없습니다 😴</div>'
    : bosses.slice(0, 2).map((item,i) => buildCard(item,i)).join('');

  // 컨텐츠 (2개)
  const huntings = [];
  schedule.hunting.forEach(h => h.time.forEach(t => {
    const r = calcRemain(t, h.days);
    if (r) huntings.push({ name: h.name, timeStr: t, remain: r, sound: h.sound });
  }));
  huntings.sort((a,b) => a.remain.totalSec - b.remain.totalSec);
  checkAlarm(huntings, 'hunting');
  const huntEl = document.getElementById('hunting-list');
  huntEl.innerHTML = huntings.length === 0
    ? '<div class="empty-msg">오늘 남은 컨텐츠가 없습니다 😴</div>'
    : huntings.slice(0, 2).map((item,i) => buildCard(item,i)).join('');

  renderOpenGauges();
  updateAutoTimer();
  updateBuffs();
}

// ── Service Worker ────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ── 시작 ──────────────────────────────────────────────
loadBuffState();
restoreAutoHunt();
update();
setInterval(update, 1000);