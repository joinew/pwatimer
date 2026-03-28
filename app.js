'use strict';

// ── 시간표 데이터 (schedule.json 인라인) ──────────────
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

// ── 상태 ──────────────────────────────────────────────
let alarmEnabled = true;
const alarmFired = new Map();

// ── 탭 전환 ───────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

// ── 알람 토글 ─────────────────────────────────────────
document.getElementById('alarm-btn').addEventListener('click', () => {
  alarmEnabled = !alarmEnabled;
  const btn = document.getElementById('alarm-btn');
  btn.textContent = alarmEnabled ? '🔔 알람 켜짐' : '🔕 알람 꺼짐';
  btn.className   = `alarm-btn ${alarmEnabled ? 'on' : 'off'}`;
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
  if (hh >= 24) {
    const d = Math.floor(hh / 24);
    const rh = hh % 24;
    text += `${d}일 `;
    if (rh > 0) text += `${rh}시간 `;
  } else if (hh > 0) {
    text += `${hh}시간 `;
  }
  text += `${mm}분 ${String(ss).padStart(2,'0')}초`;

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
  const utter  = new SpeechSynthesisUtterance(text);
  utter.lang   = 'ko-KR';
  utter.rate   = 1.0;
  utter.volume = 1.0;
  const voices = window.speechSynthesis.getVoices();
  const ko     = voices.find(v => v.lang.startsWith('ko'));
  if (ko) utter.voice = ko;
  window.speechSynthesis.speak(utter);
}

// ── 화면 깜빡임 ───────────────────────────────────────
let flashTimer = null;
let flashCount = 0;

function triggerFlash() {
  if (!alarmEnabled) return;
  if (flashTimer) return;
  const el = document.getElementById('flash-overlay');
  flashCount = 0;
  flashTimer = setInterval(() => {
    el.classList.toggle('active');
    if (++flashCount >= 8) {
      clearInterval(flashTimer);
      flashTimer = null;
      el.classList.remove('active');
    }
  }, 200);
}

// ── 비프음 ────────────────────────────────────────────
function playBeep() {
  if (!alarmEnabled) return;
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    [0, 0.25, 0.5].forEach(o => {
      osc.frequency.setValueAtTime(1046, ctx.currentTime + o);
      gain.gain.setValueAtTime(0.4, ctx.currentTime + o);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + o + 0.2);
    });
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.8);
  } catch (e) {}
}

// ── 알람 체크 ─────────────────────────────────────────
const countWords = { 5:'다섯', 4:'넷', 3:'셋', 2:'둘', 1:'하나' };
const WARN_SEC   = 3 * 60; // 기본 3분 경고

function checkAlarm(items) {
  items.forEach(item => {
    const key   = `${item.name}_${item.timeStr}`;
    const sec   = item.remain.totalSec;
    const name  = cleanName(item.name);

    if (!alarmFired.has(key)) alarmFired.set(key, new Set());
    const fired = alarmFired.get(key);

    if (sec > WARN_SEC) { alarmFired.delete(key); return; }

    if (!fired.has('warn'))  { fired.add('warn');  triggerFlash(); speak(`${name} 3분 전입니다`); }
    if (sec <= 60  && !fired.has('1min'))  { fired.add('1min');  triggerFlash(); speak(`${name} 1분 전입니다`); }
    if (sec <= 30  && !fired.has('30sec')) { fired.add('30sec'); speak(`${name} 30초 전입니다`); }
    if (sec <= 10  && !fired.has('10sec')) { fired.add('10sec'); triggerFlash(); speak(`${name} 10초 전`); }

    if (sec >= 1 && sec <= 5) {
      const ck = String(sec);
      if (!fired.has(ck)) { fired.add(ck); playBeep(); speak(countWords[sec]); }
    }

    if (sec === 0 && !fired.has('spawn')) { fired.add('spawn'); triggerFlash(); speak(`${name} 등장!`); }
  });
}

// ── 아이템 카드 HTML 생성 ─────────────────────────────
function buildCard(item, index, warnSec) {
  const sec = item.remain.totalSec;

  let warnCls = '';
  if      (sec > 0 && sec <= 10)      warnCls = 'warn-3';
  else if (sec > 0 && sec <= 60)      warnCls = 'warn-2';
  else if (sec > 0 && sec <= warnSec) warnCls = 'warn-1';

  const hlCls = (index === 0 && !warnCls) ? 'highlight' : '';

  return `
    <div class="item-card ${hlCls} ${warnCls}">
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

// ── 메인 업데이트 ─────────────────────────────────────
function update() {
  const now   = new Date();
  const days  = ['일','월','화','수','목','금','토'];
  const month = now.getMonth() + 1;
  const date  = now.getDate();
  const day   = days[now.getDay()];
  const HH    = String(now.getHours()).padStart(2,'0');
  const MM    = String(now.getMinutes()).padStart(2,'0');
  const SS    = String(now.getSeconds()).padStart(2,'0');

  document.getElementById('current-time-display').textContent =
    `${month}월 ${date}일 (${day}) ${HH}:${MM}:${SS}`;

  // ── 보스 ──
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
  if (bosses.length === 0) {
    bossEl.innerHTML = '<div class="empty-msg">오늘 남은 보스가 없습니다 😴</div>';
  } else {
    bossEl.innerHTML = bosses.map((item, i) => buildCard(item, i, WARN_SEC)).join('');
  }

  // ── 컨텐츠 ──
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
  if (huntings.length === 0) {
    huntEl.innerHTML = '<div class="empty-msg">오늘 남은 컨텐츠가 없습니다 😴</div>';
  } else {
    huntEl.innerHTML = huntings.map((item, i) => buildCard(item, i, WARN_SEC)).join('');
  }
}

// ── Service Worker 등록 ───────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ── 시작 ──────────────────────────────────────────────
update();
setInterval(update, 1000);
