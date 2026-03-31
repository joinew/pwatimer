'use strict';

// ── 시간표 데이터 ──────────────────────────────────────
const schedule = {
  boss: [
    { name: '[파우스트] 기란감옥',     time: ['10:00'], days: null },
    { name: '[드레이크] 해적섬',       time: ['14:00'], days: null },
    { name: '[마이노샤먼] 기란감옥',   time: ['17:10'], days: null },
    { name: '[이프리트] 몽환의섬',     time: ['19:10'], days: null },
    { name: '[데스나이트] 기란감옥',   time: ['20:10'], days: null },
    { name: '[제로스] 버땅',           time: ['22:10'], days: null },
    { name: '[발록] 상아탑',           time: ['23:10'], days: [1,2,3,4,5] },
    { name: '[이자벨] 신념3층',        time: ['23:10'], days: [6] },
    { name: '[벨리에] 신념2층',        time: ['23:10'], days: [0] },
    { name: '[에르자베] 개미동굴',     time: ['00:10'], days: null },
    { name: '[아리모크] 악마왕의영토', time: ['01:10'], days: null },
  ],
  hunting: [
    { name: '몬스터디펜스', time: ['20:25'],          days: null },
    { name: '배틀존',       time: ['20:45', '22:45'], days: null },
    { name: '길드워',       time: ['21:30'],          days: null },
    { name: '탐욕의홀',     time: ['18:00'],          days: null },
    { name: '지구라트',     time: ['21:00'],          days: null },
  ],
};

// 개방 시간 있는 컨텐츠
const openContents = [
  { name: '탐욕의홀', startH: 18, startM: 0, endH: 20, endM: 0 },
  { name: '지구라트', startH: 21, startM: 0, endH: 24, endM: 0 },
];

// ── 상태 ──────────────────────────────────────────────
let alarmEnabled = true;
const alarmFired = new Map();

// ── 자동사냥 상태 ─────────────────────────────────────
let autoState     = 'idle';
let autoStartTime = null;
let autoEndTime   = null;
let autoWarnMin   = 10;
let autoWarnFired = {};

// ── 버프 상태 (localStorage로 유지) ──────────────────
const BUFF_DURATION = 60 * 60 * 1000; // 1시간 ms
let buffState = {}; // { mastery: { startMs: 1234567890 } }

function loadBuffState() {
  try {
    const saved = localStorage.getItem('buffState');
    if (saved) buffState = JSON.parse(saved);
  } catch(e) {}
}

function saveBuffState() {
  try {
    localStorage.setItem('buffState', JSON.stringify(buffState));
  } catch(e) {}
}

// ── 탭 전환 ───────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// ── 알람 토글 ─────────────────────────────────────────
document.getElementById('alarm-btn').addEventListener('click', () => {
  alarmEnabled = !alarmEnabled;
  const btn = document.getElementById('alarm-btn');
  btn.textContent = alarmEnabled ? '🔔 알람 켜짐' : '🔕 알람 꺼짐';
  btn.className   = 'alarm-btn ' + (alarmEnabled ? 'on' : 'off');
});

// ── 남은 시간 계산 ────────────────────────────────────
function calcRemain(timeStr, validDays) {
  const now      = new Date();
  const todayDay = now.getDay();
  if (validDays && !validDays.includes(todayDay)) return null;

  const [h, m] = timeStr.split(':').map(Number);
  const target  = new Date();
  target.setHours(h, m, 0, 0);
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

// ── 보스명 정제 ───────────────────────────────────────
function cleanName(name) {
  const m = name.match(/\[(.+?)\]/);
  return m ? m[1] : name.replace(/[^\w가-힣\s]/g, '').trim();
}

// ── TTS ───────────────────────────────────────────────
function speak(text) {
  if (!alarmEnabled) return;
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang  = 'ko-KR';
  utter.rate  = 1.0;
  const ko = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('ko'));
  if (ko) utter.voice = ko;
  window.speechSynthesis.speak(utter);
}

// ── 화면 깜빡임 ───────────────────────────────────────
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
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.8);
  } catch(e) {}
}

// ── 보스/컨텐츠 알람 체크 ────────────────────────────
const countWords = { 5:'다섯', 4:'넷', 3:'셋', 2:'둘', 1:'하나' };
const WARN_SEC = 3 * 60;

function checkAlarm(items) {
  items.forEach(item => {
    const key  = item.name + '_' + item.timeStr;
    const sec  = item.remain.totalSec;
    const name = cleanName(item.name);
    if (!alarmFired.has(key)) alarmFired.set(key, new Set());
    const fired = alarmFired.get(key);
    if (sec > WARN_SEC) { alarmFired.delete(key); return; }
    if (!fired.has('warn'))  { fired.add('warn');  triggerFlash(); speak(name + ' 3분 전입니다'); }
    if (sec <= 60  && !fired.has('1min'))  { fired.add('1min');  triggerFlash(); speak(name + ' 1분 전입니다'); }
    if (sec <= 30  && !fired.has('30sec')) { fired.add('30sec'); speak(name + ' 30초 전입니다'); }
    if (sec <= 10  && !fired.has('10sec')) { fired.add('10sec'); triggerFlash(); speak(name + ' 10초 전'); }
    if (sec >= 1 && sec <= 5) {
      const ck = String(sec);
      if (!fired.has(ck)) { fired.add(ck); playBeep(); speak(countWords[sec]); }
    }
    if (sec === 0 && !fired.has('spawn')) { fired.add('spawn'); triggerFlash(); speak(name + ' 등장!'); }
  });
}

// ── 카드 HTML ─────────────────────────────────────────
function buildCard(item, index) {
  const sec = item.remain.totalSec;
  let warnCls = '';
  if      (sec > 0 && sec <= 10)     warnCls = 'warn-3';
  else if (sec > 0 && sec <= 60)     warnCls = 'warn-2';
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

// ── 개방 중 게이지 렌더 ───────────────────────────────
function renderOpenGauges() {
  const now = new Date();
  const el  = document.getElementById('open-gauges');
  let html  = '';

  openContents.forEach(c => {
    const start = new Date(now); start.setHours(c.startH, c.startM, 0, 0);
    const end   = new Date(now); end.setHours(c.endH, c.endM, 0, 0);

    const nowMs     = now.getTime();
    const isOpen    = nowMs >= start && nowMs < end;
    if (!isOpen) return;

    const totalMs   = end - start;
    const elapsedMs = nowMs - start;
    const pct       = Math.min(100, Math.round((elapsedMs / totalMs) * 100));

    const remainSec = Math.max(0, Math.floor((end - nowMs) / 1000));
    const rh = Math.floor(remainSec / 3600);
    const rm = Math.floor((remainSec % 3600) / 60);
    const rs = remainSec % 60;
    let remainText = '';
    if (rh > 0) remainText += rh + '시간 ';
    remainText += rm + '분 ' + String(rs).padStart(2,'0') + '초 남음';

    const endHH = String(end.getHours()).padStart(2,'0');
    const endMM = String(end.getMinutes()).padStart(2,'0');
    const barColor = pct >= 80 ? '#ff4757' : pct >= 50 ? '#ffa502' : '#4cd137';

    html += `<div class="open-gauge-card">
      <div class="open-gauge-header">
        <span class="open-gauge-name">🕐 ${c.name} 개방 중</span>
        <span class="open-gauge-end">${endHH}:${endMM} 종료</span>
      </div>
      <div class="open-gauge-bar-bg">
        <div class="open-gauge-bar-fill" style="width:${pct}%;background:${barColor}"></div>
      </div>
      <div class="open-gauge-remain">${remainText}</div>
    </div>`;
  });

  el.innerHTML = html;
}

// ── 자동사냥 타이머 ───────────────────────────────────
function formatHHMM(date) {
  return String(date.getHours()).padStart(2,'0') + ':' + String(date.getMinutes()).padStart(2,'0');
}
function formatHHMMSS(date) {
  return formatHHMM(date) + ':' + String(date.getSeconds()).padStart(2,'0');
}

document.getElementById('btn-start').addEventListener('click', () => {
  const endH   = parseInt(document.getElementById('input-end-hour').value) || 0;
  const endM   = parseInt(document.getElementById('input-end-min').value)  || 0;
  const warn   = parseInt(document.getElementById('input-warn').value)     || 10;

  const now    = new Date();
  const end    = new Date();
  end.setHours(endH, endM, 0, 0);

  // 이미 지난 시각이면 내일로
  if (end <= now) end.setDate(end.getDate() + 1);

  autoStartTime = now;
  autoEndTime   = end;
  autoWarnMin   = warn;
  autoWarnFired = {};
  autoState     = 'running';

  // localStorage 저장 (새로고침 복구용)
  localStorage.setItem('autoHunt', JSON.stringify({
    startMs: now.getTime(),
    endMs:   end.getTime(),
    warnMin: warn,
  }));

  document.getElementById('disp-start').textContent = formatHHMMSS(now);
  document.getElementById('disp-end').textContent   = formatHHMM(end);
  document.getElementById('auto-warn-banner').style.display = 'none';

  showAutoPanel('running');
  speak('자동사냥을 시작합니다');
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

function showAutoPanel(state) {
  document.getElementById('auto-idle').style.display    = state === 'idle'    ? 'block' : 'none';
  document.getElementById('auto-running').style.display = state === 'running' ? 'block' : 'none';
  document.getElementById('auto-done').style.display    = state === 'done'    ? 'block' : 'none';
}

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
  if (!manual) { triggerFlash(); speak('자동사냥 시간이 종료되었습니다'); }
}

function updateAutoTimer() {
  if (autoState !== 'running') return;
  const now       = new Date();
  const remainMs  = autoEndTime - now;
  const remainSec = Math.floor(remainMs / 1000);

  if (remainSec <= 0) {
    if (!autoWarnFired['done']) { autoWarnFired['done'] = true; finishAuto(false); }
    return;
  }

  // 진행 게이지
  const totalMs  = autoEndTime - autoStartTime;
  const elapsed  = now - autoStartTime;
  const pct      = Math.min(100, Math.round((elapsed / totalMs) * 100));
  const gaugeFill = document.getElementById('auto-gauge-fill');
  const gaugePct  = document.getElementById('disp-gauge-pct');
  const gaugeRemain = document.getElementById('disp-gauge-remain');
  if (gaugeFill) {
    const barColor = pct >= 80 ? '#ff4757' : pct >= 50 ? '#ffa502' : '#4cd137';
    gaugeFill.style.width      = pct + '%';
    gaugeFill.style.background = barColor;
  }
  if (gaugePct)    gaugePct.textContent = pct + '%';

  // 카운트다운
  const rh = Math.floor(remainSec / 3600);
  const rm = Math.floor((remainSec % 3600) / 60);
  const rs = remainSec % 60;
  const countdownEl = document.getElementById('disp-remain');
  if (countdownEl) {
    countdownEl.textContent = String(rh).padStart(2,'0') + ':' + String(rm).padStart(2,'0') + ':' + String(rs).padStart(2,'0');
    countdownEl.className = 'auto-countdown' + (remainSec <= 60 ? ' danger' : remainSec <= autoWarnMin * 60 ? ' warn' : '');
  }
  if (gaugeRemain) {
    let rt = '';
    if (rh > 0) rt += rh + '시간 ';
    rt += rm + '분 ' + String(rs).padStart(2,'0') + '초 남음';
    gaugeRemain.textContent = rt;
  }

  // 경고 배너
  const warnSec   = autoWarnMin * 60;
  const bannerEl  = document.getElementById('auto-warn-banner');
  const warnText  = document.getElementById('auto-warn-text');
  if (bannerEl) {
    if (remainSec <= warnSec) {
      bannerEl.style.display = 'block';
      if (warnText) warnText.textContent = '종료 ' + rm + '분 ' + String(rs).padStart(2,'0') + '초 전!';
    } else {
      bannerEl.style.display = 'none';
    }
  }

  // TTS 알람
  const wf = autoWarnFired;
  if (!wf.warn   && remainSec <= warnSec)    { wf.warn   = true; triggerFlash(); speak('자동사냥 종료 ' + autoWarnMin + '분 전입니다'); }
  if (!wf['1min'] && remainSec <= 60)         { wf['1min'] = true; triggerFlash(); speak('자동사냥 종료 1분 전입니다'); }
  if (!wf['10sec'] && remainSec <= 10)        { wf['10sec'] = true; triggerFlash(); speak('자동사냥 종료 10초 전'); }
  if (remainSec >= 1 && remainSec <= 5) {
    const ck = 'count_' + remainSec;
    if (!wf[ck]) { wf[ck] = true; playBeep(); speak(countWords[remainSec]); }
  }
}

// ── 버프 타이머 ───────────────────────────────────────
document.getElementById('btn-mastery').addEventListener('click', () => {
  buffState.mastery = { startMs: Date.now() };
  saveBuffState();
  speak('숙련도 물약을 사용했습니다');
  updateBuffs();
});

document.getElementById('btn-mastery-cancel').addEventListener('click', () => {
  if (!confirm('숙련도 물약 타이머를 취소하시겠습니까?')) return;
  delete buffState.mastery;
  saveBuffState();
  updateBuffs();
});

function updateBuffs() {
  const now = Date.now();

  // 숙련도 물약
  const m = buffState.mastery;
  const masteryActive = document.getElementById('mastery-active');
  const buffCard      = document.getElementById('buff-mastery');
  const startBtn      = document.getElementById('btn-mastery');

  if (m) {
    const elapsed   = now - m.startMs;
    const remainMs  = BUFF_DURATION - elapsed;

    if (remainMs <= 0) {
      // 만료
      delete buffState.mastery;
      saveBuffState();
      speak('숙련도 물약이 만료되었습니다');
      masteryActive.style.display = 'none';
      startBtn.style.display      = 'inline-block';
      buffCard.classList.remove('active-buff');
      return;
    }

    const pct       = Math.min(100, Math.round((elapsed / BUFF_DURATION) * 100));
    const remainSec = Math.floor(remainMs / 1000);
    const rm = Math.floor(remainSec / 60);
    const rs = remainSec % 60;

    const gaugeEl  = document.getElementById('mastery-gauge');
    const remainEl = document.getElementById('mastery-remain');
    const pctEl    = document.getElementById('mastery-pct');

    if (gaugeEl) {
      const barColor = pct >= 80 ? '#ff4757' : pct >= 50 ? '#ffa502' : '#a6e3a1';
      gaugeEl.style.width      = pct + '%';
      gaugeEl.style.background = barColor;
    }
    if (remainEl) remainEl.textContent = rm + '분 ' + String(rs).padStart(2,'0') + '초 남음';
    if (pctEl)    pctEl.textContent    = pct + '%';

    masteryActive.style.display = 'block';
    startBtn.style.display      = 'none';
    buffCard.classList.add('active-buff');

    // 만료 10분 전 알람
    if (!buffState.mastery.warned10 && remainSec <= 600) {
      buffState.mastery.warned10 = true;
      saveBuffState();
      triggerFlash();
      speak('숙련도 물약 10분 전입니다');
    }
    // 만료 1분 전
    if (!buffState.mastery.warned1 && remainSec <= 60) {
      buffState.mastery.warned1 = true;
      saveBuffState();
      triggerFlash();
      speak('숙련도 물약 1분 전입니다');
    }
  } else {
    masteryActive.style.display = 'none';
    startBtn.style.display      = 'inline-block';
    buffCard.classList.remove('active-buff');
  }
}

// ── 새로고침 복구 (자동사냥) ──────────────────────────
function restoreAutoHunt() {
  try {
    const saved = localStorage.getItem('autoHunt');
    if (!saved) return;
    const data = JSON.parse(saved);
    const now  = Date.now();
    if (data.endMs <= now) {
      localStorage.removeItem('autoHunt');
      return;
    }
    autoStartTime = new Date(data.startMs);
    autoEndTime   = new Date(data.endMs);
    autoWarnMin   = data.warnMin || 10;
    autoWarnFired = {};
    autoState     = 'running';
    document.getElementById('disp-start').textContent = formatHHMMSS(autoStartTime);
    document.getElementById('disp-end').textContent   = formatHHMM(autoEndTime);
    showAutoPanel('running');
  } catch(e) {}
}

// ── 메인 업데이트 ─────────────────────────────────────
function update() {
  const now   = new Date();
  const days  = ['일','월','화','수','목','금','토'];
  document.getElementById('current-time-display').textContent =
    (now.getMonth()+1) + '월 ' + now.getDate() + '일 (' + days[now.getDay()] + ') ' +
    String(now.getHours()).padStart(2,'0') + ':' +
    String(now.getMinutes()).padStart(2,'0') + ':' +
    String(now.getSeconds()).padStart(2,'0');

  // 보스
  const bosses = [];
  schedule.boss.forEach(b => {
    b.time.forEach(t => {
      const r = calcRemain(t, b.days);
      if (r) bosses.push({ name: b.name, timeStr: t, remain: r });
    });
  });
  bosses.sort((a, b) => a.remain.totalSec - b.remain.totalSec);
  checkAlarm(bosses);
  const bossEl = document.getElementById('boss-list');
  bossEl.innerHTML = bosses.length === 0
    ? '<div class="empty-msg">오늘 남은 보스가 없습니다 😴</div>'
    : bosses.map((item, i) => buildCard(item, i)).join('');

  // 개방 게이지
  renderOpenGauges();

  // 컨텐츠
  const huntings = [];
  schedule.hunting.forEach(h => {
    h.time.forEach(t => {
      const r = calcRemain(t, h.days);
      if (r) huntings.push({ name: h.name, timeStr: t, remain: r });
    });
  });
  huntings.sort((a, b) => a.remain.totalSec - b.remain.totalSec);
  checkAlarm(huntings);
  const huntEl = document.getElementById('hunting-list');
  huntEl.innerHTML = huntings.length === 0
    ? '<div class="empty-msg">오늘 남은 컨텐츠가 없습니다 😴</div>'
    : huntings.map((item, i) => buildCard(item, i)).join('');

  // 자동사냥
  updateAutoTimer();

  // 버프
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