/* winClock — digital clock widget */
'use strict';

const IS_TAURI = !!window.__TAURI__;
if (!IS_TAURI) document.body.classList.add('no-tauri');
const invoke = IS_TAURI ? window.__TAURI__.core.invoke : null;

/* second window rendering only the settings page (?settings=1) */
const IS_SETTINGS_WIN = new URLSearchParams(location.search).has('settings');
if (IS_SETTINGS_WIN) document.body.classList.add('settings-mode');

/* ---------- config ---------- */

const FONTS = {
  dseg7:    { label: '7-Segment LCD',   family: "'DSEG7', monospace",             lcd: true,  ghost: '8' },
  dseg14:   { label: '14-Segment LCD',  family: "'DSEG14', monospace",            lcd: true,  ghost: '8' },
  orbitron: { label: 'Orbitron',        family: "'Orbitron', sans-serif",         lcd: false },
  sharetech:{ label: 'Share Tech Mono', family: "'Share Tech Mono', monospace",   lcd: false },
  bebas:    { label: 'Bebas Neue',      family: "'Bebas Neue', sans-serif",       lcd: false },
  rajdhani: { label: 'Rajdhani',        family: "'Rajdhani', sans-serif",         lcd: false },
  majormono:{ label: 'Major Mono',      family: "'Major Mono Display', monospace",lcd: false },
  system:   { label: 'Segoe UI',        family: "'Segoe UI', sans-serif",         lcd: false },
};

/* resolve a font key — built-in key or "sys:<family name>" */
function fontInfo(key) {
  if (key && key.startsWith('sys:')) {
    const name = key.slice(4);
    return { label: name, family: `"${name}", sans-serif`, lcd: false };
  }
  return FONTS[key] || FONTS.dseg7;
}

const THEMES = {
  green:  { fg: '#39ff14', glow: 'rgba(57,255,20,.45)' },
  amber:  { fg: '#ffb000', glow: 'rgba(255,176,0,.45)' },
  cyan:   { fg: '#00e5ff', glow: 'rgba(0,229,255,.45)' },
  white:  { fg: '#f2f2f2', glow: 'rgba(255,255,255,.35)' },
  red:    { fg: '#ff453a', glow: 'rgba(255,69,58,.45)' },
  purple: { fg: '#b388ff', glow: 'rgba(179,136,255,.45)' },
  pink:   { fg: '#ff6ec7', glow: 'rgba(255,110,199,.45)' },
};

/* secondary palette for D-Day & calendar rows */
const SUB_COLORS = {
  gray:   '#aeb6bd',
  green:  '#39ff14',
  amber:  '#ffb000',
  cyan:   '#00e5ff',
  white:  '#f2f2f2',
  red:    '#ff453a',
  purple: '#b388ff',
  pink:   '#ff6ec7',
};

const ANIMS = {
  none:  '없음',
  fade:  '페이드',
  slide: '슬라이드',
  flip:  '플립',
};

const KO_DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const EN_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DATE_FORMATS = {
  ko:       (n) => `${n.getFullYear()}년 ${n.getMonth() + 1}월 ${n.getDate()}일 ${KO_DAYS[n.getDay()]}요일`,
  koShort:  (n) => `${n.getMonth() + 1}월 ${n.getDate()}일 (${KO_DAYS[n.getDay()]})`,
  iso:      (n) => `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())} (${KO_DAYS[n.getDay()]})`,
  isoPlain: (n) => `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`,
  dotted:   (n) => `${n.getFullYear()}. ${n.getMonth() + 1}. ${n.getDate()} (${KO_DAYS[n.getDay()]})`,
  mmdd:     (n) => `${pad(n.getMonth() + 1)}-${pad(n.getDate())}`,
  slash:    (n) => `${n.getMonth() + 1}/${n.getDate()} ${KO_DAYS[n.getDay()]}`,
  en:       (n) => n.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
  enShort:  (n) => `${n.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${EN_DAYS[n.getDay()]}`,
  none:     () => '',
};

const DEFAULTS = {
  font: 'dseg7',
  dateFont: 'rajdhani',
  ddayFont: 'rajdhani',
  eventsFont: 'rajdhani',
  theme: 'green',
  theme2: 'gray',
  bgOpacity: 88,
  h24: true,
  seconds: true,
  blink: false,
  anim: 'slide',
  scale: 100,
  dateFormat: 'ko',
  alwaysOnTop: false,
  showDday: true,
  showEvents: true,
  ddays: [],
  calUrls: [],
  calCount: 2,
};

let state = loadState();

function loadState() {
  let s;
  try {
    s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('winclock') || '{}') };
  } catch {
    s = { ...DEFAULTS };
  }
  // migrate old single-URL setting
  if (s.calUrl) {
    if (!Array.isArray(s.calUrls)) s.calUrls = [];
    if (!s.calUrls.some((c) => c.url === s.calUrl)) {
      s.calUrls.push({ id: 1, name: '', url: s.calUrl });
    }
    delete s.calUrl;
  }
  return s;
}
function saveState() {
  localStorage.setItem('winclock', JSON.stringify(state));
  if (IS_SETTINGS_WIN && IS_TAURI) {
    window.__TAURI__.event.emit('winclock-settings-changed');
  }
}

/* ---------- elements ---------- */

const $ = (id) => document.getElementById(id);
const app = $('app'), clock = $('clock'), stack = $('stack');
const elDate = $('date'), elTime = $('time'), elGhost = $('time-ghost'), elAmpm = $('ampm');
const elDday = $('dday-row'), elEvents = $('events-row');

function pad(n) { return String(n).padStart(2, '0'); }

/* ---------- time rendering (per-char cells + animation) ---------- */

let cells = [];   // [{cell, cur, ch}]

function cellClass(ch) {
  return 'cell' + (/\d/.test(ch) ? ' digit' : ch === ':' ? ' colon' : '');
}

function buildCells(text) {
  elTime.innerHTML = '';
  cells = [];
  for (const ch of text) {
    const cell = document.createElement('span');
    cell.className = cellClass(ch);
    const cur = document.createElement('span');
    cur.className = 'cur';
    cur.textContent = ch;
    cell.appendChild(cur);
    elTime.appendChild(cell);
    cells.push({ cell, cur, ch });
  }
  buildGhost(text);
}

function buildGhost(text) {
  const font = fontInfo(state.font);
  elGhost.innerHTML = '';
  if (!font.lcd) return;
  for (const ch of text) {
    const cell = document.createElement('span');
    cell.className = cellClass(ch);
    cell.textContent = /\d/.test(ch) ? font.ghost : ch;
    elGhost.appendChild(cell);
  }
}

function updateCell(i, ch) {
  const c = cells[i];
  if (state.anim === 'none') {
    c.cur.textContent = ch;
  } else {
    const old = c.cur;
    old.classList.remove('in');
    old.classList.add('out');
    setTimeout(() => old.remove(), 500);
    const nw = document.createElement('span');
    nw.className = 'cur in';
    nw.textContent = ch;
    c.cell.appendChild(nw);
    c.cur = nw;
  }
  c.ch = ch;
}

function timeParts(now) {
  let h = now.getHours();
  let ampm = '';
  if (!state.h24) {
    ampm = h < 12 ? 'AM' : 'PM';
    h = h % 12 || 12;
  }
  let text = `${pad(h)}:${pad(now.getMinutes())}`;
  if (state.seconds) text += `:${pad(now.getSeconds())}`;
  return { text, ampm };
}

function renderTime(now, forceRebuild) {
  const { text, ampm } = timeParts(now);
  if (forceRebuild || cells.length !== text.length) {
    buildCells(text);
  } else {
    for (let i = 0; i < text.length; i++) {
      if (cells[i].ch !== text[i]) updateCell(i, text[i]);
    }
  }
  const colonOff = state.blink && now.getSeconds() % 2 === 1;
  for (const c of cells) {
    if (c.ch === ':') c.cell.classList.toggle('off', colonOff);
  }
  elAmpm.textContent = ampm;
  elAmpm.style.display = ampm ? '' : 'none';
}

/* ---------- date & d-day ---------- */

function renderDate(now) {
  const fmt = DATE_FORMATS[state.dateFormat] || DATE_FORMATS.ko;
  const s = fmt(now);
  elDate.textContent = s;
  elDate.style.display = s ? '' : 'none';
}

function ddayCount(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

function ddayLabel(n) {
  if (n === 0) return 'D-DAY';
  return n > 0 ? `D-${n}` : `D+${-n}`;
}

function renderDdays() {
  elDday.innerHTML = '';
  const items = [...state.ddays]
    .sort((a, b) => Math.abs(ddayCount(a.date)) - Math.abs(ddayCount(b.date)))
    .slice(0, 3);
  for (const d of items) {
    const span = document.createElement('span');
    const name = document.createElement('span');
    name.className = 'dday-name';
    name.textContent = d.name;
    const count = document.createElement('span');
    count.className = 'dday-count';
    count.textContent = ddayLabel(ddayCount(d.date));
    span.append(name, count);
    elDday.appendChild(span);
  }
  elDday.style.display = items.length && state.showDday ? '' : 'none';
}

/* ---------- google calendar (ICS) ---------- */

const CAL_CACHE_KEY = 'winclock-cal';
const CAL_REFRESH_MS = 30 * 60 * 1000;
const CAL_COLORS = ['#4d90fe', '#ff9f43', '#2ecc71', '#e74c3c', '#9b59b6', '#1abc9c'];
let calEvents = [];   // expanded occurrences, each with calIdx

function icsUnfold(text) {
  return text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
}

function icsParseDate(val, params) {
  if (params.includes('VALUE=DATE') || /^\d{8}$/.test(val)) {
    return { d: new Date(+val.slice(0, 4), +val.slice(4, 6) - 1, +val.slice(6, 8)), allDay: true };
  }
  const m = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const [, y, mo, dd, h, mi, s, z] = m;
  const d = z
    ? new Date(Date.UTC(+y, +mo - 1, +dd, +h, +mi, +s))
    : new Date(+y, +mo - 1, +dd, +h, +mi, +s);   // TZID: treat as local
  return { d, allDay: false };
}

function icsParseRrule(val) {
  const r = {};
  for (const part of val.split(';')) {
    const [k, v] = part.split('=');
    r[k] = v;
  }
  return r;
}

// expand events into occurrences within [windowStart, windowEnd]
function parseICS(text) {
  const lines = icsUnfold(text);
  const out = [];
  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const windowEnd = new Date(windowStart.getTime() + 8 * 86400000);
  const BYDAY = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  let ev = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { ev = {}; continue; }
    if (line === 'END:VEVENT') {
      if (ev && ev.start && ev.summary) {
        const { d: start, allDay } = ev.start;
        if (!ev.rrule) {
          if (start >= windowStart && start < windowEnd) {
            out.push({ start, allDay, summary: ev.summary });
          }
        } else {
          const r = ev.rrule;
          const until = r.UNTIL ? (icsParseDate(r.UNTIL, '') || {}).d : null;
          const interval = +(r.INTERVAL || 1);
          const byday = r.BYDAY ? r.BYDAY.split(',').map((x) => BYDAY[x.slice(-2)]) : null;
          // walk each day of the window and test membership
          for (let t = windowStart.getTime(); t < windowEnd.getTime(); t += 86400000) {
            const day = new Date(t);
            const occ = new Date(day.getFullYear(), day.getMonth(), day.getDate(),
              start.getHours(), start.getMinutes(), start.getSeconds());
            if (occ < start) continue;
            if (until && occ > until) continue;
            const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
            const dayDiff = Math.round((day - startDay) / 86400000);
            let match = false;
            switch (r.FREQ) {
              case 'DAILY':
                match = dayDiff % interval === 0;
                break;
              case 'WEEKLY': {
                const wd = day.getDay();
                const inDays = byday ? byday.includes(wd) : wd === start.getDay();
                match = inDays && Math.floor(dayDiff / 7) % interval === 0;
                break;
              }
              case 'MONTHLY':
                match = day.getDate() === start.getDate();
                break;
              case 'YEARLY':
                match = day.getDate() === start.getDate() && day.getMonth() === start.getMonth();
                break;
            }
            if (match) {
              out.push({
                start: new Date(day.getFullYear(), day.getMonth(), day.getDate(),
                  start.getHours(), start.getMinutes(), start.getSeconds()),
                allDay, summary: ev.summary,
              });
            }
          }
        }
      }
      ev = null;
      continue;
    }
    if (!ev) continue;
    const ci = line.indexOf(':');
    if (ci < 0) continue;
    const keyPart = line.slice(0, ci);
    const val = line.slice(ci + 1);
    const key = keyPart.split(';')[0];
    if (key === 'DTSTART') ev.start = icsParseDate(val, keyPart);
    else if (key === 'SUMMARY') ev.summary = val.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, ' ').trim();
    else if (key === 'RRULE') ev.rrule = icsParseRrule(val);
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

function eventLabel(e) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eDay = new Date(e.start.getFullYear(), e.start.getMonth(), e.start.getDate());
  const diff = Math.round((eDay - today) / 86400000);
  let day;
  if (diff === 0) day = '오늘';
  else if (diff === 1) day = '내일';
  else day = `${e.start.getMonth() + 1}/${e.start.getDate()}(${KO_DAYS[e.start.getDay()]})`;
  const time = e.allDay ? '' : ` ${pad(e.start.getHours())}:${pad(e.start.getMinutes())}`;
  return `${day}${time}`;
}

function renderEvents() {
  elEvents.innerHTML = '';
  const now = Date.now();
  const items = calEvents
    .filter((e) => e.start.getTime() > now - 30 * 60 * 1000)
    .slice(0, state.calCount);
  const multi = state.calUrls.length > 1;
  for (const e of items) {
    const span = document.createElement('span');
    if (multi) {
      const dot = document.createElement('span');
      dot.className = 'ev-dot';
      dot.style.background = CAL_COLORS[e.calIdx % CAL_COLORS.length];
      span.appendChild(dot);
    }
    const when = document.createElement('span');
    when.className = 'ev-when';
    when.textContent = eventLabel(e);
    const title = document.createElement('span');
    title.className = 'ev-title';
    title.textContent = e.summary.length > 60 ? e.summary.slice(0, 60) + '…' : e.summary;
    title.title = e.summary;
    span.append(when, title);
    elEvents.appendChild(span);
  }
  elEvents.style.display = items.length && state.showEvents ? '' : 'none';
}

function setCalStatus(msg, ok) {
  const el = $('cal-status');
  el.textContent = msg;
  el.className = ok ? 'ok' : 'err';
}

async function fetchIcsText(url) {
  if (invoke) return invoke('fetch_ics', { url });
  const res = await fetch(url);          // browser preview: works only if CORS allows
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

async function refreshCalendar(force) {
  if (!state.calUrls.length || state.calCount === 0) {
    calEvents = [];
    renderEvents();
    fit();
    return;
  }
  let cacheMap = {};
  try { cacheMap = JSON.parse(localStorage.getItem(CAL_CACHE_KEY) || '{}') || {}; } catch {}
  if (cacheMap.url) cacheMap = {};   // discard old single-URL cache shape

  setCalStatus('불러오는 중…', true);
  const results = await Promise.all(state.calUrls.map(async (c, idx) => {
    const cached = cacheMap[c.url];
    if (!force && cached && Date.now() - cached.at < CAL_REFRESH_MS) {
      return { idx, ics: cached.ics };
    }
    try {
      const ics = parseAbleGuard(await fetchIcsText(c.url));
      cacheMap[c.url] = { at: Date.now(), ics };
      return { idx, ics };
    } catch (e) {
      if (cached) return { idx, ics: cached.ics, err: e };
      return { idx, err: e };
    }
  }));

  // keep cache only for registered urls
  const urlSet = new Set(state.calUrls.map((c) => c.url));
  for (const k of Object.keys(cacheMap)) if (!urlSet.has(k)) delete cacheMap[k];
  localStorage.setItem(CAL_CACHE_KEY, JSON.stringify(cacheMap));

  calEvents = results
    .filter((r) => r.ics)
    .flatMap((r) => parseICS(r.ics).map((e) => ({ ...e, calIdx: r.idx })))
    .sort((a, b) => a.start - b.start);
  renderEvents();
  fit();

  const failed = results.filter((r) => r.err);
  if (failed.length) {
    const names = failed.map((r) => state.calUrls[r.idx].name || `캘린더 ${r.idx + 1}`).join(', ');
    setCalStatus(`일정 ${calEvents.length}건 · 실패: ${names} (${failed[0].err.message || failed[0].err})`, false);
  } else {
    setCalStatus(`캘린더 ${results.length}개에서 일정 ${calEvents.length}건 (${new Date().toLocaleTimeString('ko-KR')})`, true);
  }
}

function parseAbleGuard(text) {
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error('iCal 형식이 아닙니다');
  return text;
}

setInterval(() => refreshCalendar(false), CAL_REFRESH_MS);

/* ---------- auto-fit ---------- */

function fit() {
  const availW = app.clientWidth * 0.92;
  const availH = app.clientHeight * 0.88;

  clock.style.fontSize = '100px';
  const w = Math.max(1, stack.offsetWidth);
  const h = Math.max(1, stack.offsetHeight);
  const size = 100 * Math.min(availW / w, availH / h) * (state.scale / 100);
  clock.style.fontSize = size + 'px';
}

/* ---------- tick ---------- */

let lastDay = -1;
let lastMinute = -1;

function tick() {
  const now = new Date();
  renderTime(now);
  if (now.getMinutes() !== lastMinute) {
    lastMinute = now.getMinutes();
    renderEvents();
  }
  if (now.getDate() !== lastDay) {
    lastDay = now.getDate();
    renderDate(now);
    renderDdays();
    fit();
  }
  setTimeout(tick, 1000 - now.getMilliseconds() + 10);
}

/* ---------- apply settings ---------- */

function applySettings() {
  const font = fontInfo(state.font);
  const theme = THEMES[state.theme] || THEMES.green;
  const root = document.documentElement.style;
  root.setProperty('--time-font', font.family);
  root.setProperty('--date-font', fontInfo(state.dateFont).family);
  root.setProperty('--dday-font', fontInfo(state.ddayFont).family);
  root.setProperty('--events-font', fontInfo(state.eventsFont).family);
  root.setProperty('--fg', theme.fg);
  root.setProperty('--glow', theme.glow);
  root.setProperty('--fg2', SUB_COLORS[state.theme2] || SUB_COLORS.gray);
  root.setProperty('--bg-opacity', state.bgOpacity / 100);
  app.classList.toggle('lcd', !!font.lcd);
  app.className = app.className.replace(/\banim-\w+/g, '').trim();
  if (state.anim !== 'none') app.classList.add('anim-' + state.anim);

  renderTime(new Date(), true);
  renderDate(new Date());
  renderDdays();
  renderEvents();
  fit();
  saveState();
}

/* ---------- settings UI ---------- */

const panel = $('settings');

function fillSelect(id, entries, current, onChange) {
  const sel = $(id);
  sel.innerHTML = '';
  for (const [key, label] of entries) {
    const o = document.createElement('option');
    o.value = key;
    o.textContent = label;
    sel.appendChild(o);
  }
  sel.value = current;
  sel.onchange = () => onChange(sel.value);
  return sel;
}

/* common Windows fonts to probe when running outside Tauri */
const FALLBACK_SYS_FONTS = [
  'Malgun Gothic', '맑은 고딕', 'Gulim', 'Batang', 'Gungsuh',
  'Segoe UI Variable Display', 'Consolas', 'Cascadia Code', 'Cascadia Mono',
  'Courier New', 'Arial', 'Arial Black', 'Impact', 'Georgia',
  'Times New Roman', 'Verdana', 'Tahoma', 'Trebuchet MS',
  'Comic Sans MS', 'Ink Free', 'Segoe Script', 'Segoe Print',
];

async function getSystemFonts() {
  if (invoke) {
    try { return await invoke('list_system_fonts'); } catch {}
  }
  return FALLBACK_SYS_FONTS.filter((f) => document.fonts.check(`12px "${f}"`));
}

/* ---------- searchable font pickers ---------- */

let allFontEntries = [];   // [{key, label, group}]
const pickerClosers = [];

async function loadFontEntries() {
  const sys = await getSystemFonts();
  allFontEntries = [
    ...Object.entries(FONTS).map(([k, f]) => ({ key: k, label: f.label, group: '내장 폰트' })),
    ...sys.map((n) => ({ key: 'sys:' + n, label: n, group: `시스템 폰트 (${sys.length})` })),
  ];
}

function closeAllPickers() {
  pickerClosers.forEach((c) => c());
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.font-picker')) closeAllPickers();
});

function makeFontPicker(mountId, stateKey) {
  const mount = $(mountId);
  mount.className = 'font-picker';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'fp-btn';
  const drop = document.createElement('div');
  drop.className = 'fp-drop hidden';
  const search = document.createElement('input');
  search.type = 'text';
  search.placeholder = '폰트 검색…';
  search.className = 'fp-search';
  const list = document.createElement('div');
  list.className = 'fp-list';
  drop.append(search, list);
  mount.append(btn, drop);

  const refreshBtn = () => {
    const f = fontInfo(state[stateKey]);
    btn.textContent = f.label;
    btn.style.fontFamily = f.family;
  };
  refreshBtn();

  function renderList(filter) {
    list.innerHTML = '';
    const q = (filter || '').toLowerCase();
    let lastGroup = '';
    for (const e of allFontEntries) {
      if (q && !e.label.toLowerCase().includes(q)) continue;
      if (e.group !== lastGroup) {
        lastGroup = e.group;
        const g = document.createElement('div');
        g.className = 'fp-group';
        g.textContent = e.group;
        list.appendChild(g);
      }
      const it = document.createElement('div');
      it.className = 'fp-item' + (state[stateKey] === e.key ? ' active' : '');
      it.textContent = e.label;
      it.style.fontFamily = fontInfo(e.key).family;
      it.onclick = () => {
        state[stateKey] = e.key;
        refreshBtn();
        close();
        applySettings();
      };
      list.appendChild(it);
    }
  }
  function open() {
    closeAllPickers();
    drop.classList.remove('hidden');
    search.value = '';
    renderList('');
    search.focus();
  }
  function close() { drop.classList.add('hidden'); }
  pickerClosers.push(close);
  btn.onclick = () => (drop.classList.contains('hidden') ? open() : close());
  search.oninput = () => renderList(search.value);
  search.onkeydown = (e) => {
    if (e.key === 'Enter') {
      const first = list.querySelector('.fp-item');
      if (first) first.click();
    }
    if (e.key === 'Escape') close();
  };
}

function buildSettingsUI() {
  loadFontEntries().then(() => {
    makeFontPicker('fp-time', 'font');
    makeFontPicker('fp-date', 'dateFont');
    makeFontPicker('fp-dday', 'ddayFont');
    makeFontPicker('fp-events', 'eventsFont');
  });

  fillSelect('opt-anim', Object.entries(ANIMS),
    state.anim, (v) => { state.anim = v; applySettings(); });

  const today = new Date();
  fillSelect('opt-date-format',
    Object.entries(DATE_FORMATS).map(([k, f]) => [k, k === 'none' ? '표시 안 함' : f(today)]),
    state.dateFormat, (v) => { state.dateFormat = v; applySettings(); });

  // themes
  buildSwatches('opt-theme',
    Object.fromEntries(Object.entries(THEMES).map(([k, t]) => [k, t.fg])),
    () => state.theme, (k) => { state.theme = k; });
  buildSwatches('opt-theme2', SUB_COLORS,
    () => state.theme2, (k) => { state.theme2 = k; });

  bindRange('opt-bg-opacity', 'bg-opacity-val', 'bgOpacity', '%');
  bindRange('opt-scale', 'scale-val', 'scale', '%');

  bindCheck('opt-h24', 'h24');
  bindCheck('opt-seconds', 'seconds');
  bindCheck('opt-blink', 'blink');

  // always on top
  const at = $('opt-always-top');
  at.checked = state.alwaysOnTop;
  at.onchange = () => {
    if (IS_SETTINGS_WIN) {
      state.alwaysOnTop = at.checked;
      saveState();          // main window applies via event
    } else {
      setPin(at.checked);
    }
  };

  // autostart (registry-backed, Tauri only)
  if (invoke) {
    const auto = $('opt-autostart');
    invoke('get_autostart').then((v) => { auto.checked = !!v; }).catch(() => {});
    auto.onchange = async () => {
      try {
        await invoke('set_autostart', { enable: auto.checked });
      } catch (e) {
        auto.checked = !auto.checked;   // revert on failure
        alert('자동 실행 설정 실패: ' + e);
      }
    };
  }

  // d-day
  bindCheck('opt-show-dday', 'showDday');
  bindCheck('opt-show-events', 'showEvents');
  renderDdayList();
  $('dday-add-btn').onclick = addDday;
  $('dday-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') addDday(); });

  // calendar
  renderCalList();
  fillSelect('cal-count', [['0', '끄기'], ['1', '1개'], ['2', '2개'], ['3', '3개']],
    String(state.calCount), (v) => { state.calCount = +v; saveState(); refreshCalendar(false); });
  $('cal-add-btn').onclick = addCal;
  $('cal-url').addEventListener('keydown', (e) => { if (e.key === 'Enter') addCal(); });
  $('cal-save').onclick = async () => {
    await refreshCalendar(true);
    saveState();   // notify main window to re-read the refreshed cache
  };
}

function addCal() {
  const name = $('cal-name').value.trim();
  const url = $('cal-url').value.trim();
  if (!url) return;
  if (!url.startsWith('https://')) {
    setCalStatus('https:// 로 시작하는 주소를 입력하세요', false);
    return;
  }
  if (state.calUrls.some((c) => c.url === url)) {
    setCalStatus('이미 등록된 주소입니다', false);
    return;
  }
  state.calUrls.push({ id: Date.now(), name, url });
  $('cal-name').value = '';
  $('cal-url').value = '';
  saveState();
  renderCalList();
  refreshCalendar(true);
}

function calDisplayName(c, idx) {
  if (c.name) return c.name;
  const m = c.url.match(/\/ical\/([^/]+)\//);
  if (m) return decodeURIComponent(m[1]);
  return `캘린더 ${idx + 1}`;
}

function renderCalList() {
  const ul = $('cal-list');
  ul.innerHTML = '';
  if (!state.calUrls.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '등록된 캘린더가 없습니다';
    ul.appendChild(li);
    return;
  }
  state.calUrls.forEach((c, idx) => {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.className = 'cal-label';
    const dot = document.createElement('span');
    dot.className = 'ev-dot';
    dot.style.background = CAL_COLORS[idx % CAL_COLORS.length];
    const txt = document.createElement('span');
    txt.textContent = calDisplayName(c, idx);
    txt.title = c.url;
    label.append(dot, txt);
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.title = '삭제';
    del.onclick = () => {
      state.calUrls = state.calUrls.filter((x) => x.id !== c.id);
      saveState();
      renderCalList();
      refreshCalendar(false);
    };
    li.append(label, del);
    ul.appendChild(li);
  });
}

function buildSwatches(containerId, palette, getCurrent, setKey) {
  const box = $(containerId);
  box.innerHTML = '';
  for (const [key, color] of Object.entries(palette)) {
    const b = document.createElement('button');
    b.className = 'swatch' + (key === getCurrent() ? ' active' : '');
    b.style.background = color;
    b.title = key;
    b.onclick = () => {
      setKey(key);
      box.querySelectorAll('.swatch').forEach((s) => s.classList.remove('active'));
      b.classList.add('active');
      applySettings();
    };
    box.appendChild(b);
  }
}

function bindRange(id, valId, key, unit) {
  const el = $(id);
  el.value = state[key];
  $(valId).textContent = state[key] + unit;
  el.oninput = () => {
    state[key] = +el.value;
    $(valId).textContent = el.value + unit;
    applySettings();
  };
}

function bindCheck(id, key) {
  const el = $(id);
  el.checked = state[key];
  el.onchange = () => { state[key] = el.checked; applySettings(); };
}

function addDday() {
  const name = $('dday-name').value.trim();
  const date = $('dday-date').value;
  if (!name || !date) return;
  state.ddays.push({ id: Date.now(), name, date });
  $('dday-name').value = '';
  $('dday-date').value = '';
  renderDdayList();
  applySettings();
}

function renderDdayList() {
  const ul = $('dday-list');
  ul.innerHTML = '';
  if (!state.ddays.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '등록된 이벤트가 없습니다';
    ul.appendChild(li);
    return;
  }
  for (const d of state.ddays) {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `${d.name} · ${d.date} · ${ddayLabel(ddayCount(d.date))}`;
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.title = '삭제';
    del.onclick = () => {
      state.ddays = state.ddays.filter((x) => x.id !== d.id);
      renderDdayList();
      applySettings();
    };
    li.append(label, del);
    ul.appendChild(li);
  }
}

/* ---------- window controls ---------- */

const tauriWin = IS_TAURI ? window.__TAURI__.window.getCurrentWindow() : null;

/* open settings in its own window (falls back to overlay in browser) */
async function openSettings() {
  if (!IS_TAURI) {
    panel.classList.remove('hidden');
    return;
  }
  const WW = window.__TAURI__.webviewWindow.WebviewWindow;
  const existing = await WW.getByLabel('settings');
  if (existing) {
    await existing.setFocus();
    return;
  }
  new WW('settings', {
    url: 'index.html?settings=1',
    title: 'winClock 설정',
    width: 420,
    height: 660,
    minWidth: 340,
    minHeight: 400,
  });
}

$('btn-settings').onclick = openSettings;
$('btn-settings-close').onclick = () => {
  if (IS_SETTINGS_WIN && tauriWin) tauriWin.close();
  else panel.classList.add('hidden');
};
panel.addEventListener('click', (e) => {
  if (e.target === panel && !IS_SETTINGS_WIN) panel.classList.add('hidden');
});

/* main window: live-apply changes coming from the settings window */
if (IS_TAURI && !IS_SETTINGS_WIN) {
  window.__TAURI__.event.listen('winclock-settings-changed', () => {
    state = loadState();
    applySettings();
    pinBtn.classList.toggle('active', state.alwaysOnTop);
    ctxPinBtn.classList.toggle('checked', state.alwaysOnTop);
    tauriWin.setAlwaysOnTop(state.alwaysOnTop);
    refreshCalendar(false);
  });
}

$('btn-close').onclick = () => tauriWin && tauriWin.close();
$('btn-min').onclick = () => tauriWin && tauriWin.minimize();

const pinBtn = $('btn-pin');
async function setPin(on) {
  state.alwaysOnTop = on;
  pinBtn.classList.toggle('active', on);
  ctxPinBtn.classList.toggle('checked', on);
  if (tauriWin) await tauriWin.setAlwaysOnTop(on);
  saveState();
}
pinBtn.onclick = () => setPin(!state.alwaysOnTop);

/* ---------- right-click context menu ---------- */

const ctxMenu = $('ctx-menu');
const ctxBackdrop = $('ctx-backdrop');
const ctxPinBtn = ctxMenu.querySelector('[data-act="pin"]');

function hideCtxMenu() {
  ctxMenu.classList.add('hidden');
  ctxBackdrop.classList.add('hidden');
}

document.addEventListener('contextmenu', (e) => {
  // keep the native menu inside settings (paste on inputs)
  if (e.target.closest('#settings')) return;
  e.preventDefault();
  ctxBackdrop.classList.remove('hidden');
  ctxMenu.classList.remove('hidden');
  const r = ctxMenu.getBoundingClientRect();
  ctxMenu.style.left = Math.max(0, Math.min(e.clientX, window.innerWidth - r.width - 4)) + 'px';
  ctxMenu.style.top = Math.max(0, Math.min(e.clientY, window.innerHeight - r.height - 4)) + 'px';
});

/* keep the outline visible while the cursor is on or near the resize border,
   where the webview stops receiving mouse events and CSS :hover drops out */
const HOVER_MARGIN = 20;   // physical px around the window that still counts
let hoverTimer = null;

async function cursorNearWindow() {
  try {
    const [cur, pos, size] = await Promise.all([
      window.__TAURI__.window.cursorPosition(),
      tauriWin.outerPosition(),
      tauriWin.outerSize(),
    ]);
    return (
      cur.x >= pos.x - HOVER_MARGIN && cur.x <= pos.x + size.width + HOVER_MARGIN &&
      cur.y >= pos.y - HOVER_MARGIN && cur.y <= pos.y + size.height + HOVER_MARGIN
    );
  } catch {
    return false;
  }
}

function startHoverWatch() {
  if (hoverTimer || !tauriWin || IS_SETTINGS_WIN) return;
  app.classList.add('hovered');
  hoverTimer = setInterval(async () => {
    if (await cursorNearWindow()) return;
    app.classList.remove('hovered');
    clearInterval(hoverTimer);
    hoverTimer = null;
  }, 150);
}
document.addEventListener('mousemove', startHoverWatch);

/* highlight the resize grip/arrow nearest to the cursor */
const guides = {
  tl: document.querySelector('#resize-guides .tl'),
  bl: document.querySelector('#resize-guides .bl'),
  br: document.querySelector('#resize-guides .br'),
  l:  document.querySelector('#resize-guides .edge.l'),
  r:  document.querySelector('#resize-guides .edge.r'),
  b:  document.querySelector('#resize-guides .edge.b'),
};

/* dragging a guide starts an OS resize in its direction */
const RESIZE_DIRS = { tl: 'NorthWest', bl: 'SouthWest', br: 'SouthEast', l: 'West', r: 'East', b: 'South' };
for (const [key, el] of Object.entries(guides)) {
  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !tauriWin) return;
    e.preventDefault();
    e.stopPropagation();
    tauriWin.startResizeDragging(RESIZE_DIRS[key]);
  });
}

document.addEventListener('mousemove', (e) => {
  const W = window.innerWidth, H = window.innerHeight;
  const x = e.clientX, y = e.clientY;
  const CORNER = Math.min(90, W / 3, H / 3);
  const EDGE = 36;
  const near = (dx, dy) => Math.hypot(dx, dy) < CORNER;
  guides.tl.classList.toggle('near', near(x, y));
  guides.bl.classList.toggle('near', near(x, H - y));
  guides.br.classList.toggle('near', near(W - x, H - y));
  guides.l.classList.toggle('near', x < EDGE && !near(x, y) && !near(x, H - y));
  guides.r.classList.toggle('near', W - x < EDGE && !near(W - x, H - y));
  guides.b.classList.toggle('near', H - y < EDGE && !near(x, H - y) && !near(W - x, H - y));
});

/* move the window with Ctrl + left-drag (replaces the always-on drag region) */
clock.addEventListener('mousedown', (e) => {
  if (e.button === 0 && e.ctrlKey && tauriWin) {
    e.preventDefault();
    tauriWin.startDragging();
  }
});

/* the backdrop sits above the drag region, so it reliably gets the click */
ctxBackdrop.addEventListener('mousedown', hideCtxMenu);
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('#ctx-menu') && e.target !== ctxBackdrop) hideCtxMenu();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideCtxMenu(); });
window.addEventListener('blur', hideCtxMenu);

ctxMenu.addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (!act) return;
  hideCtxMenu();
  if (act === 'settings') openSettings();
  else if (act === 'pin') setPin(!state.alwaysOnTop);
  else if (act === 'min') tauriWin && tauriWin.minimize();
  else if (act === 'tray') tauriWin && tauriWin.hide();
  else if (act === 'close') tauriWin && tauriWin.close();
});

/* ---------- init ---------- */

buildSettingsUI();
applySettings();
if (IS_SETTINGS_WIN) {
  panel.classList.remove('hidden');
} else {
  if (state.alwaysOnTop) setPin(true);
  refreshCalendar(false);
}
tick();

window.addEventListener('resize', fit);
document.fonts.ready.then(fit);
document.fonts.onloadingdone = fit;
