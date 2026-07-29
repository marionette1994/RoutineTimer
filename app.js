/* 律帖 — ルーチンタイマー */
const {
  useState,
  useEffect,
  useRef
} = React;
const RKEY = 'ritcho-routines-v1',
  LKEY = 'ritcho-logs-v1',
  SKEY = 'ritcho-settings-v1',
  AKEY = 'ritcho-active-v1';
const load = (k, d) => {
  try {
    const v = localStorage.getItem(k);
    return v == null ? d : JSON.parse(v);
  } catch (e) {
    return d;
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch (e) {}
};
const drop = k => {
  try {
    localStorage.removeItem(k);
  } catch (e) {}
};
const COLORS = [{
  n: '朱',
  c: '#c4402f'
}, {
  n: '藍',
  c: '#2e4b6b'
}, {
  n: '苔',
  c: '#5f7346'
}, {
  n: '山吹',
  c: '#d6a22b'
}, {
  n: '鳶',
  c: '#7a4b3a'
}, {
  n: '藤',
  c: '#7a6ba6'
}, {
  n: '鼠',
  c: '#706c64'
}, {
  n: '松',
  c: '#3d5c4a'
}];
const uid = () => Math.random().toString(36).slice(2, 9);
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const seed = [{
  id: uid(),
  name: '朝のルーチン',
  targetEnd: null,
  steps: [{
    id: uid(),
    name: '白湯を飲む',
    seconds: 60,
    color: '#d6a22b'
  }, {
    id: uid(),
    name: 'ストレッチ',
    seconds: 180,
    color: '#5f7346'
  }, {
    id: uid(),
    name: '瞑想',
    seconds: 300,
    color: '#2e4b6b'
  }, {
    id: uid(),
    name: '今日の三つを書く',
    seconds: 120,
    color: '#c4402f'
  }]
}, {
  id: uid(),
  name: '集中：ポモドーロ',
  targetEnd: null,
  steps: [{
    id: uid(),
    name: '集中',
    seconds: 1500,
    color: '#c4402f'
  }, {
    id: uid(),
    name: '休憩',
    seconds: 300,
    color: '#5f7346'
  }]
}];
let SETTINGS = {
  sound: true,
  speech: true,
  speakStart: true,
  vibrate: true,
  wake: true,
  background: true,
  notify: true,
  lastBackupAt: null
};

/* ---------- background keep-alive ----------
   Chrome throttles timers in hidden tabs but exempts pages that are playing
   audio, so an essentially inaudible loop keeps the clock running. */
function makeQuietWav() {
  const sr = 8000,
    len = sr * 2,
    bytes = 44 + len,
    b = new ArrayBuffer(bytes),
    v = new DataView(b);
  const put = (o, s) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  put(0, 'RIFF');
  v.setUint32(4, bytes - 8, true);
  put(8, 'WAVE');
  put(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  put(36, 'data');
  v.setUint32(40, len, true);
  for (let i = 0; i < len; i++) v.setUint8(44 + i, 128 + i % 2);
  let s = '';
  const u = new Uint8Array(b);
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return 'data:audio/wav;base64,' + btoa(s);
}
let keepEl = null;
const bg = {
  start() {
    if (!SETTINGS.background) return;
    try {
      if (!keepEl) {
        keepEl = document.createElement('audio');
        keepEl.src = makeQuietWav();
        keepEl.loop = true;
        keepEl.volume = .02;
        keepEl.setAttribute('playsinline', '');
        document.body.appendChild(keepEl);
      }
      keepEl.play().catch(() => {});
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    } catch (e) {}
  },
  stop() {
    try {
      keepEl && keepEl.pause();
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    } catch (e) {}
  }
};
let actx = null,
  wl = null;
function chime(kind) {
  if (SETTINGS.sound) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t0 = actx.currentTime;
      const spec = {
        step: {
          n: [[880, 0], [1319, .11]],
          v: .22
        },
        done: {
          n: [[784, 0], [988, .13], [1319, .26]],
          v: .22
        },
        warn: {
          n: [[620, 0]],
          v: .13
        }
      }[kind] || {
        n: [[880, 0]],
        v: .2
      };
      spec.n.forEach(p => {
        const o = actx.createOscillator(),
          g = actx.createGain();
        o.type = 'sine';
        o.frequency.value = p[0];
        o.connect(g);
        g.connect(actx.destination);
        g.gain.setValueAtTime(.0001, t0 + p[1]);
        g.gain.exponentialRampToValueAtTime(spec.v, t0 + p[1] + .02);
        g.gain.exponentialRampToValueAtTime(.0001, t0 + p[1] + .32);
        o.start(t0 + p[1]);
        o.stop(t0 + p[1] + .34);
      });
    } catch (e) {}
  }
  if (SETTINGS.vibrate) {
    try {
      const p = {
        step: [70],
        done: [110, 55, 110, 55, 220],
        warn: [40]
      }[kind] || [60];
      navigator.vibrate && navigator.vibrate(p);
    } catch (e) {}
  }
}
function speak(text) {
  if (!SETTINGS.speech && !SETTINGS.speakStart) return;
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    u.rate = 1;
    u.volume = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch (e) {}
}
const ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23c4402f'/%3E%3Ctext x='50' y='70' font-size='62' text-anchor='middle' fill='%23fff' font-family='serif'%3E律%3C/text%3E%3C/svg%3E";
let curNotif = null;
function notify(title, body, alert) {
  if (!SETTINGS.notify) return;
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (curNotif) {
      try {
        curNotif.close();
      } catch (e) {}
    }
    const n = new Notification(title, {
      body,
      tag: 'ritcho-step',
      renotify: !!alert,
      silent: !alert,
      icon: ICON
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    curNotif = n;
  } catch (e) {}
}
function clearNotif() {
  try {
    curNotif && curNotif.close();
  } catch (e) {}
  curNotif = null;
}
function setMedia(title, body) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title,
      artist: body,
      album: '律帖'
    });
  } catch (e) {}
}
function setMediaActions(h) {
  if (!('mediaSession' in navigator)) return;
  const set = (k, fn) => {
    try {
      navigator.mediaSession.setActionHandler(k, fn || null);
    } catch (e) {}
  };
  set('nexttrack', h.next);
  set('previoustrack', h.prev);
  set('play', h.play);
  set('pause', h.pause);
  set('stop', h.stop);
}
async function askNotify() {
  try {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    return await Notification.requestPermission();
  } catch (e) {
    return 'denied';
  }
}
async function keepAwake() {
  try {
    if (SETTINGS.wake && 'wakeLock' in navigator && !wl) {
      wl = await navigator.wakeLock.request('screen');
      wl.addEventListener('release', () => {
        wl = null;
      });
    }
  } catch (e) {}
}
function releaseAwake() {
  try {
    wl && wl.release();
    wl = null;
  } catch (e) {}
}

/* ---------- helpers ---------- */
const isManual = s => s.mode === 'manual';
const activeFor = (steps, dow) => steps.filter(s => !s.days || !s.days.length || s.days.indexOf(dow) >= 0);
const plannedTotal = steps => steps.reduce((a, s) => a + s.seconds, 0);
function fmtLong(sec) {
  sec = Math.round(sec);
  const m = Math.floor(sec / 60),
    s = sec % 60;
  if (m && s) return m + '分' + s + '秒';
  if (m) return m + '分';
  return s + '秒';
}
function mmss(ms) {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(t / 60),
    s = t % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
function localDate(iso) {
  const d = new Date(iso);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function hhmm(iso) {
  const d = new Date(iso);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function fmtClock(ms) {
  const d = new Date(ms);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function fmtDelta(ms) {
  const sec = Math.round(Math.abs(ms) / 1000);
  if (sec < 60) return 'ほぼ予定通り';
  return (ms > 0 ? '+' : '−') + fmtLong(sec);
}
function pct(arr, q) {
  if (!arr.length) return 0;
  const a = arr.slice().sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.max(0, Math.ceil(q * a.length) - 1))];
}
function median(arr) {
  if (!arr.length) return 0;
  const a = arr.slice().sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}
const todayStr = () => localDate(new Date().toISOString());
function shiftDay(str, n) {
  const d = new Date(str + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return localDate(d.toISOString());
}
function daysSince(ts) {
  if (!ts) return null;
  return Math.floor((Date.now() - ts) / 864e5);
}
function download(name, text, mime) {
  try {
    const blob = new Blob([text], {
      type: mime || 'text/plain;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch (e) {
    alert('書き出しに失敗しました');
  }
}
function stepBadges(s) {
  const b = [];
  if (isManual(s)) b.push('完了ボタン');
  if (s.days && s.days.length && s.days.length < 7) b.push(s.days.slice().sort().map(d => WD[d]).join(''));
  if (s.checks && s.checks.length) b.push('☑' + s.checks.length);
  return b;
}

/* ================= LIST ================= */
function ListView(p) {
  const dow = new Date().getDay();
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "topbar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "brand"
  }, /*#__PURE__*/React.createElement("h1", null, "律帖"), /*#__PURE__*/React.createElement("span", {
    className: "seal"
  }, "律")), /*#__PURE__*/React.createElement("div", {
    className: "toolbtns"
  }, /*#__PURE__*/React.createElement("button", {
    className: "tool-chip",
    onClick: p.onOpenLog
  }, "記録"), /*#__PURE__*/React.createElement("button", {
    className: "tool-chip",
    onClick: p.onOpenSettings
  }, "設定"))), p.pending && /*#__PURE__*/React.createElement("div", {
    className: "resume-bar"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "rb-t"
  }, "中断された実行"), /*#__PURE__*/React.createElement("div", {
    className: "rb-s"
  }, p.pending.name), /*#__PURE__*/React.createElement("div", {
    className: "rb-m"
  }, p.pending.stepName, " · ", hhmm(p.pending.savedAt), " 時点")), /*#__PURE__*/React.createElement("div", {
    className: "rb-btns"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: p.onDiscard
  }, "破棄"), /*#__PURE__*/React.createElement("button", {
    className: "rb-go",
    onClick: p.onResume
  }, "再開"))), p.hasUpdate && /*#__PURE__*/React.createElement("div", {
    className: "update-bar"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "ub-t"
  }, "新しい版があります"), /*#__PURE__*/React.createElement("div", {
    className: "ub-s"
  }, "実行中でないいま、更新するのが安全です。")), /*#__PURE__*/React.createElement("button", {
    onClick: p.onUpdate
  }, "更新")), p.backupWarn && /*#__PURE__*/React.createElement("div", {
    className: "warn-bar",
    onClick: p.onOpenSettings
  }, /*#__PURE__*/React.createElement("span", {
    className: "wb-i"
  }, "!"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "wb-t"
  }, p.backupWarn), /*#__PURE__*/React.createElement("div", {
    className: "wb-s"
  }, "端末の保存領域は消えることがあります。書き出しをおすすめします。"))), p.routines.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "empty"
  }, /*#__PURE__*/React.createElement("div", {
    className: "big"
  }, "空"), /*#__PURE__*/React.createElement("p", null, "まだルーチンがありません。", /*#__PURE__*/React.createElement("br", null), "下から最初の一つを作りましょう。")) : /*#__PURE__*/React.createElement("div", {
    className: "list"
  }, p.routines.map(r => {
    const act = activeFor(r.steps, dow);
    const hidden = r.steps.length - act.length;
    return /*#__PURE__*/React.createElement("div", {
      className: "card",
      key: r.id,
      style: {
        '--accent': r.steps[0] ? r.steps[0].color : '#c4402f'
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "card-main",
      onClick: () => p.onEdit(r.id)
    }, /*#__PURE__*/React.createElement("p", {
      className: "card-name"
    }, r.name || '（名称未設定）'), /*#__PURE__*/React.createElement("div", {
      className: "card-meta"
    }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("b", null, act.length), " ステップ", hidden > 0 ? /*#__PURE__*/React.createElement("span", {
      className: "dim"
    }, " （今日は", hidden, "件休み）") : null), /*#__PURE__*/React.createElement("span", null, "計 ", /*#__PURE__*/React.createElement("b", null, fmtLong(plannedTotal(act)))), r.targetEnd && /*#__PURE__*/React.createElement("span", null, "目標 ", /*#__PURE__*/React.createElement("b", null, r.targetEnd)))), /*#__PURE__*/React.createElement("div", {
      className: "card-foot"
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => p.onDelete(r.id)
    }, "削除"), /*#__PURE__*/React.createElement("button", {
      onClick: () => p.onEdit(r.id)
    }, "編集"), /*#__PURE__*/React.createElement("button", {
      className: "start",
      disabled: act.length === 0,
      onClick: () => p.onRun(r.id)
    }, "始める ▶")));
  })), /*#__PURE__*/React.createElement("button", {
    className: "add-full",
    onClick: p.onNew
  }, "＋ ルーチンを作る"));
}

/* ================= EDITOR ================= */
function EditView({
  routine,
  onSave,
  onCancel
}) {
  const [name, setName] = useState(routine.name);
  const [targetEnd, setTargetEnd] = useState(routine.targetEnd || '');
  const [steps, setSteps] = useState(routine.steps.length ? routine.steps : [{
    id: uid(),
    name: '',
    seconds: 60,
    color: '#c4402f'
  }]);
  const [palFor, setPalFor] = useState(null);
  const [openFor, setOpenFor] = useState(null);
  const upd = (id, patch) => setSteps(s => s.map(x => x.id === id ? Object.assign({}, x, patch) : x));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const a = steps.slice();
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
    setSteps(a);
  };
  const del = id => setSteps(s => s.filter(x => x.id !== id));
  const add = () => setSteps(s => s.concat([{
    id: uid(),
    name: '',
    seconds: 60,
    color: COLORS[s.length % COLORS.length].c
  }]));
  const total = plannedTotal(steps);
  const setTime = (id, part, val) => {
    val = Math.max(0, Math.min(part === 'm' ? 599 : 59, parseInt(val || '0', 10) || 0));
    const cur = steps.find(s => s.id === id);
    const m = part === 'm' ? val : Math.floor(cur.seconds / 60);
    const sec = part === 's' ? val : cur.seconds % 60;
    upd(id, {
      seconds: Math.max(1, m * 60 + sec)
    });
  };
  const toggleDay = (s, d) => {
    const cur = !s.days || !s.days.length ? [0, 1, 2, 3, 4, 5, 6] : s.days.slice();
    const i = cur.indexOf(d);
    if (i >= 0) cur.splice(i, 1);else cur.push(d);
    upd(s.id, {
      days: cur.length === 0 || cur.length === 7 ? null : cur.sort()
    });
  };
  const addCheck = id => upd(id, {
    checks: (steps.find(s => s.id === id).checks || []).concat([{
      id: uid(),
      text: ''
    }])
  });
  const updCheck = (id, cid, text) => upd(id, {
    checks: (steps.find(s => s.id === id).checks || []).map(c => c.id === cid ? {
      id: cid,
      text: text
    } : c)
  });
  const delCheck = (id, cid) => upd(id, {
    checks: (steps.find(s => s.id === id).checks || []).filter(c => c.id !== cid)
  });
  const doSave = () => {
    const clean = steps.map(s => Object.assign({}, s, {
      name: s.name.trim(),
      seconds: Math.max(1, s.seconds),
      checks: (s.checks || []).filter(c => c.text.trim()).map(c => ({
        id: c.id,
        text: c.text.trim()
      }))
    }));
    onSave(Object.assign({}, routine, {
      name: name.trim() || '名称未設定',
      targetEnd: targetEnd || null,
      steps: clean
    }));
  };
  return /*#__PURE__*/React.createElement("div", {
    onClick: () => setPalFor(null)
  }, /*#__PURE__*/React.createElement("div", {
    className: "sub-head"
  }, /*#__PURE__*/React.createElement("button", {
    className: "icon-btn",
    onClick: onCancel
  }, "←"), /*#__PURE__*/React.createElement("h2", null, "ルーチンを編集")), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "ルーチン名"), /*#__PURE__*/React.createElement("input", {
    className: "name-input",
    value: name,
    onChange: e => setName(e.target.value),
    placeholder: "例：朝のルーチン"
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "目標終了時刻（任意）"), /*#__PURE__*/React.createElement("div", {
    className: "tgt-row"
  }, /*#__PURE__*/React.createElement("input", {
    type: "time",
    value: targetEnd,
    onChange: e => setTargetEnd(e.target.value)
  }), targetEnd ? /*#__PURE__*/React.createElement("button", {
    className: "icon-btn",
    onClick: () => setTargetEnd('')
  }, "×") : null, /*#__PURE__*/React.createElement("span", {
    className: "dim sm"
  }, targetEnd ? '間に合うかを実行中に表示します' : '未設定なら開始時刻からの予定と比較します'))), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "ステップ"), /*#__PURE__*/React.createElement("div", {
    className: "steps"
  }, steps.map((s, i) => {
    const badges = stepBadges(s);
    return /*#__PURE__*/React.createElement("div", {
      className: "step-box",
      key: s.id
    }, /*#__PURE__*/React.createElement("div", {
      className: "step-row"
    }, /*#__PURE__*/React.createElement("span", {
      className: "step-idx"
    }, i + 1), /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'relative'
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "dot",
      style: {
        background: s.color
      },
      onClick: e => {
        e.stopPropagation();
        setPalFor(palFor === s.id ? null : s.id);
      }
    }), palFor === s.id && /*#__PURE__*/React.createElement("div", {
      className: "palette",
      onClick: e => e.stopPropagation()
    }, COLORS.map(c => /*#__PURE__*/React.createElement("span", {
      key: c.c,
      className: "dot",
      title: c.n,
      style: {
        background: c.c
      },
      onClick: () => {
        upd(s.id, {
          color: c.c
        });
        setPalFor(null);
      }
    })))), /*#__PURE__*/React.createElement("input", {
      className: "step-name-in",
      value: s.name,
      onChange: e => upd(s.id, {
        name: e.target.value
      }),
      placeholder: 'ステップ ' + (i + 1)
    }), /*#__PURE__*/React.createElement("div", {
      className: "time-in"
    }, /*#__PURE__*/React.createElement("input", {
      type: "number",
      inputMode: "numeric",
      value: Math.floor(s.seconds / 60),
      onChange: e => setTime(s.id, 'm', e.target.value)
    }), /*#__PURE__*/React.createElement("span", null, "分"), /*#__PURE__*/React.createElement("input", {
      type: "number",
      inputMode: "numeric",
      value: s.seconds % 60,
      onChange: e => setTime(s.id, 's', e.target.value)
    }), /*#__PURE__*/React.createElement("span", null, "秒")), /*#__PURE__*/React.createElement("div", {
      className: "row-tools"
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => move(i, -1),
      disabled: i === 0
    }, "▲"), /*#__PURE__*/React.createElement("button", {
      onClick: () => move(i, 1),
      disabled: i === steps.length - 1
    }, "▼")), /*#__PURE__*/React.createElement("button", {
      className: "icon-btn del-btn",
      onClick: () => del(s.id),
      disabled: steps.length === 1
    }, "×")), /*#__PURE__*/React.createElement("div", {
      className: "step-sub"
    }, /*#__PURE__*/React.createElement("button", {
      className: 'det-toggle' + (openFor === s.id ? ' on' : ''),
      onClick: () => setOpenFor(openFor === s.id ? null : s.id)
    }, openFor === s.id ? '詳細を閉じる' : '詳細'), badges.map(b => /*#__PURE__*/React.createElement("span", {
      className: "badge",
      key: b
    }, b))), openFor === s.id && /*#__PURE__*/React.createElement("div", {
      className: "step-det"
    }, /*#__PURE__*/React.createElement("div", {
      className: "det-row"
    }, /*#__PURE__*/React.createElement("span", {
      className: "det-l"
    }, "進行"), /*#__PURE__*/React.createElement("div", {
      className: "seg-btns"
    }, /*#__PURE__*/React.createElement("button", {
      className: !isManual(s) ? 'on' : '',
      onClick: () => upd(s.id, {
        mode: 'timer'
      })
    }, "時間で自動"), /*#__PURE__*/React.createElement("button", {
      className: isManual(s) ? 'on' : '',
      onClick: () => upd(s.id, {
        mode: 'manual'
      })
    }, "完了ボタン"))), /*#__PURE__*/React.createElement("p", {
      className: "det-hint"
    }, isManual(s) ? '時間は目安として数え、押すまで次に進みません。' : '設定した時間で自動的に次へ進みます。'), /*#__PURE__*/React.createElement("div", {
      className: "det-row"
    }, /*#__PURE__*/React.createElement("span", {
      className: "det-l"
    }, "曜日"), /*#__PURE__*/React.createElement("div", {
      className: "dow"
    }, WD.map((w, di) => {
      const on = !s.days || !s.days.length || s.days.indexOf(di) >= 0;
      return /*#__PURE__*/React.createElement("button", {
        key: di,
        className: on ? 'on' : '',
        onClick: () => toggleDay(s, di)
      }, w);
    }))), /*#__PURE__*/React.createElement("div", {
      className: "det-col"
    }, /*#__PURE__*/React.createElement("span", {
      className: "det-l"
    }, "チェックリスト"), (s.checks || []).map(c => /*#__PURE__*/React.createElement("div", {
      className: "chk-row",
      key: c.id
    }, /*#__PURE__*/React.createElement("input", {
      value: c.text,
      onChange: e => updCheck(s.id, c.id, e.target.value),
      placeholder: "例：ビタミンC"
    }), /*#__PURE__*/React.createElement("button", {
      className: "icon-btn del-btn",
      onClick: () => delCheck(s.id, c.id)
    }, "×"))), /*#__PURE__*/React.createElement("button", {
      className: "chk-add",
      onClick: () => addCheck(s.id)
    }, "＋ 項目を追加"))));
  })), /*#__PURE__*/React.createElement("button", {
    className: "add-full",
    style: {
      marginTop: 12
    },
    onClick: add
  }, "＋ ステップを追加")), /*#__PURE__*/React.createElement("div", {
    className: "total-line"
  }, "合計 ", /*#__PURE__*/React.createElement("b", null, fmtLong(total)), "\u3000/\u3000", steps.length, " ステップ"), /*#__PURE__*/React.createElement("div", {
    className: "ed-foot"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onCancel
  }, "キャンセル"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-shu",
    onClick: doSave
  }, "保存")));
}

/* ================= RUN =================
   Timing is per-step and wall-clock based: elapsed = now - stepStart. A step
   that waits on a button simply never reaches its planned duration, so manual
   and timed steps share one model. A frozen tab is caught up by cascading
   through any timed steps whose time passed while we were away. */
function RunView({
  routine,
  resume,
  onLog,
  onExit
}) {
  const init = resume && resume.routineId === routine.id && Array.isArray(resume.actualsMs) ? resume : null;
  const [steps] = useState(() => {
    const dow = init && typeof init.dow === 'number' ? init.dow : new Date().getDay();
    const f = activeFor(routine.steps, dow);
    return f.length ? f : routine.steps;
  });
  const dowRef = useRef(init && typeof init.dow === 'number' ? init.dow : new Date().getDay());
  const total = plannedTotal(steps);
  const initIdx = init ? Math.max(0, Math.min(init.idx || 0, steps.length - 1)) : 0;
  const initEl = init ? Math.max(0, init.elapsedMs || 0) : 0;
  const t0 = Date.now();
  const [idx, setIdx] = useState(initIdx);
  const [elapsed, setElapsed] = useState(initEl);
  const [running, setRunning] = useState(!init);
  const [finished, setFinished] = useState(false);
  const [bgOn, setBgOn] = useState(false);
  const [checks, setChecks] = useState(() => init && init.checks ? init.checks : {});
  const stepStartRef = useRef(t0 - initEl);
  const pausedAtRef = useRef(init ? t0 : 0);
  const idxRef = useRef(initIdx);
  const runStartRef = useRef(init && init.runStartISO ? new Date(init.runStartISO).getTime() : t0);
  const actualsRef = useRef(init ? steps.map((_, i) => init.actualsMs[i] || 0) : steps.map(() => 0));
  const skipsRef = useRef(init && init.skips ? Object.assign({}, init.skips) : {});
  const autoRef = useRef(init && init.autos ? Object.assign({}, init.autos) : {});
  const checksRef = useRef(init && init.checks ? init.checks : {});
  const loggedRef = useRef(false);
  const warnRef = useRef(-1),
    spokeRef = useRef(-1),
    saidRef = useRef(-1);
  const annTimer = useRef(null),
    lastSaveRef = useRef(0);
  const nowBase = () => running ? Date.now() : pausedAtRef.current || Date.now();
  const persist = force => {
    const now = Date.now();
    if (!force && now - lastSaveRef.current < 1000) return;
    lastSaveRef.current = now;
    save(AKEY, {
      routineId: routine.id,
      dow: dowRef.current,
      idx: idxRef.current,
      elapsedMs: Math.max(0, nowBase() - stepStartRef.current),
      actualsMs: actualsRef.current.slice(0, steps.length),
      skips: skipsRef.current,
      autos: autoRef.current,
      checks: checksRef.current,
      runStartISO: new Date(runStartRef.current).toISOString(),
      savedAt: now
    });
  };
  const enterStep = (i, delay) => {
    saidRef.current = i;
    warnRef.current = -1;
    spokeRef.current = -1;
    if (annTimer.current) {
      clearTimeout(annTimer.current);
      annTimer.current = null;
    }
    try {
      window.speechSynthesis && window.speechSynthesis.cancel();
    } catch (e) {}
    const st = steps[i];
    const nm = st.name || 'ステップ ' + (i + 1);
    const sub = (isManual(st) ? '目安 ' + fmtLong(st.seconds) : fmtLong(st.seconds)) + '　（' + (i + 1) + '/' + steps.length + '）';
    setMedia(nm, sub);
    notify('▶ ' + nm, sub, document.hidden);
    if (SETTINGS.speakStart) annTimer.current = setTimeout(() => speak(nm + '、' + (isManual(st) ? '完了したら押してください' : fmtLong(st.seconds))), delay || 120);
  };
  const buildEntry = completed => {
    const a = actualsRef.current.slice(0, steps.length);
    const skips = steps.reduce((n, _, i) => n + (skipsRef.current[i] ? 1 : 0), 0);
    return {
      id: uid(),
      routineId: routine.id,
      routineName: routine.name,
      dow: dowRef.current,
      startISO: new Date(runStartRef.current).toISOString(),
      endISO: new Date().toISOString(),
      plannedSec: total,
      actualSec: Math.round(a.reduce((x, y) => x + y, 0) / 1000),
      completed: completed,
      skipped: skips,
      stepsDone: a.filter((v, i) => v > 0 && !skipsRef.current[i]).length,
      stepsTotal: steps.length,
      steps: steps.map((s, i) => {
        const cs = s.checks || [];
        const st = checksRef.current[i] || {};
        return {
          id: s.id,
          name: s.name,
          mode: s.mode || 'timer',
          plannedSec: s.seconds,
          actualSec: Math.round((a[i] || 0) / 1000),
          actualMs: a[i] || 0,
          skipped: !!skipsRef.current[i],
          auto: !!autoRef.current[i],
          checkTotal: cs.length,
          checkDone: cs.filter(c => st[c.id]).length
        };
      })
    };
  };
  const finish = () => {
    if (!loggedRef.current) {
      loggedRef.current = true;
      onLog(buildEntry(true));
    }
    setFinished(true);
    setRunning(false);
    releaseAwake();
    bg.stop();
    clearNotif();
    drop(AKEY);
  };
  useEffect(() => {
    if (!running || finished) return;
    const tick = () => {
      const now = Date.now();
      let i = idxRef.current;
      let el = now - stepStartRef.current;
      let advanced = false;
      while (i < steps.length && !isManual(steps[i]) && el >= steps[i].seconds * 1000) {
        actualsRef.current[i] = steps[i].seconds * 1000;
        autoRef.current[i] = true;
        stepStartRef.current += steps[i].seconds * 1000;
        el = now - stepStartRef.current;
        i++;
        advanced = true;
      }
      if (i >= steps.length) {
        idxRef.current = steps.length - 1;
        chime('done');
        if (document.hidden) notify('律帖 — 完了', routine.name + ' を終えました', true);
        finish();
        return;
      }
      if (advanced) {
        idxRef.current = i;
        setIdx(i);
        chime('step');
        enterStep(i, 450);
      } else if (saidRef.current !== i) {
        enterStep(i, 120);
      }
      const cur = steps[i];
      if (!isManual(cur)) {
        const left = cur.seconds * 1000 - el;
        if (cur.seconds >= 60 && spokeRef.current !== i && left <= 30000) {
          spokeRef.current = i;
          speak('残り30秒です');
        }
        if (cur.seconds > 11 && warnRef.current !== i && left <= 10000) {
          warnRef.current = i;
          chime('warn');
        }
      }
      setElapsed(el);
      persist(false);
    };
    tick();
    const t = setInterval(tick, 200);
    return () => clearInterval(t);
  }, [running, finished]);
  useEffect(() => {
    if (running && !finished) {
      keepAwake();
      bg.start();
      setBgOn(SETTINGS.background);
    } else {
      releaseAwake();
      bg.stop();
      setBgOn(false);
    }
  }, [running, finished]);
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) return;
      if (running && !finished) {
        keepAwake();
        bg.start();
        try {
          if (actx && actx.state === 'suspended') actx.resume();
        } catch (e) {}
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [running, finished]);
  useEffect(() => () => {
    releaseAwake();
    bg.stop();
    clearNotif();
    if (annTimer.current) clearTimeout(annTimer.current);
    try {
      window.speechSynthesis && window.speechSynthesis.cancel();
    } catch (e) {}
  }, []);
  const goTo = (n, record) => {
    const el = Math.max(0, nowBase() - stepStartRef.current);
    if (record) {
      actualsRef.current[idxRef.current] = Math.max(actualsRef.current[idxRef.current] || 0, el);
      autoRef.current[idxRef.current] = false;
    }
    stepStartRef.current = nowBase();
    idxRef.current = n;
    setIdx(n);
    setElapsed(0);
    enterStep(n, 120);
    persist(true);
  };
  const next = () => {
    if (idx < steps.length - 1) goTo(idx + 1, true);else {
      actualsRef.current[idx] = Math.max(0, nowBase() - stepStartRef.current);
      autoRef.current[idx] = false;
      chime('done');
      finish();
    }
  };
  const skip = () => {
    const c = idxRef.current;
    skipsRef.current[c] = true;
    actualsRef.current[c] = 0;
    if (c < steps.length - 1) goTo(c + 1, false);else {
      chime('done');
      finish();
    }
  };
  const prev = () => {
    const el = nowBase() - stepStartRef.current;
    if (el > 1200) goTo(idx, false);else if (idx > 0) goTo(idx - 1, false);
  };
  const toggle = () => {
    if (running) {
      pausedAtRef.current = Date.now();
      setRunning(false);
    } else {
      stepStartRef.current += Date.now() - pausedAtRef.current;
      setRunning(true);
    }
    try {
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = running ? 'paused' : 'playing';
    } catch (e) {}
    setTimeout(() => persist(true), 0);
  };
  const exit = () => {
    if (!loggedRef.current) {
      const el = Math.max(0, nowBase() - stepStartRef.current);
      actualsRef.current[idxRef.current] = Math.max(actualsRef.current[idxRef.current] || 0, el);
      const e = buildEntry(false);
      if (e.actualSec >= 1) {
        loggedRef.current = true;
        onLog(e);
      }
    }
    releaseAwake();
    bg.stop();
    clearNotif();
    drop(AKEY);
    onExit();
  };
  const restart = () => {
    runStartRef.current = Date.now();
    stepStartRef.current = Date.now();
    actualsRef.current = steps.map(() => 0);
    skipsRef.current = {};
    autoRef.current = {};
    checksRef.current = {};
    setChecks({});
    loggedRef.current = false;
    warnRef.current = -1;
    spokeRef.current = -1;
    saidRef.current = -1;
    idxRef.current = 0;
    lastSaveRef.current = 0;
    setIdx(0);
    setElapsed(0);
    setFinished(false);
    setRunning(true);
  };
  const toggleCheck = cid => {
    const m = Object.assign({}, checksRef.current);
    const cur = Object.assign({}, m[idx] || {});
    cur[cid] = !cur[cid];
    m[idx] = cur;
    checksRef.current = m;
    setChecks(m);
    persist(true);
  };
  useEffect(() => {
    if (finished) {
      setMediaActions({});
      return;
    }
    setMediaActions({
      next: () => next(),
      prev: () => prev(),
      play: () => {
        if (!running) toggle();
      },
      pause: () => {
        if (running) toggle();
      },
      stop: () => exit()
    });
    return () => setMediaActions({});
  }, [idx, running, finished]);
  if (finished) {
    return /*#__PURE__*/React.createElement("div", {
      className: "run"
    }, /*#__PURE__*/React.createElement("div", {
      className: "done-screen"
    }, /*#__PURE__*/React.createElement("div", {
      className: "done-seal"
    }, "了"), /*#__PURE__*/React.createElement("h2", null, "完了"), /*#__PURE__*/React.createElement("p", null, routine.name), /*#__PURE__*/React.createElement("p", null, steps.length, " ステップ\u3000/\u3000計 ", fmtLong(total)), /*#__PURE__*/React.createElement("div", {
      className: "done-foot"
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost",
      onClick: onExit
    }, "一覧へ"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-shu",
      onClick: restart
    }, "もう一度"))));
  }
  const step = steps[idx];
  const man = isManual(step);
  const plannedMs = step.seconds * 1000;
  const remaining = plannedMs - elapsed;
  const over = man && remaining < 0;
  const frac = man ? Math.max(0, Math.min(1, elapsed / plannedMs)) : Math.max(0, Math.min(1, remaining / plannedMs));
  const R = 140,
    C = 2 * Math.PI * R;
  const ringColor = over ? '#c4402f' : step.color;
  const futureMs = steps.slice(idx + 1).reduce((a, x) => a + x.seconds * 1000, 0);
  const projEnd = Date.now() + Math.max(0, remaining) + futureMs;
  const planEnd = runStartRef.current + total * 1000;
  let targetMs = null;
  if (routine.targetEnd && /^\d{1,2}:\d{2}$/.test(routine.targetEnd)) {
    const pr = routine.targetEnd.split(':');
    const d = new Date(runStartRef.current);
    d.setHours(parseInt(pr[0], 10), parseInt(pr[1], 10), 0, 0);
    targetMs = d.getTime();
    if (targetMs < runStartRef.current - 6 * 3600000) targetMs += 864e5;
  }
  const delta = projEnd - (targetMs || planEnd);
  const dCls = delta > 60000 ? 'late' : delta < -60000 ? 'early' : '';
  const curChecks = step.checks || [];
  const checkState = checks[idx] || {};
  return /*#__PURE__*/React.createElement("div", {
    className: "run"
  }, /*#__PURE__*/React.createElement("div", {
    className: "run-top"
  }, /*#__PURE__*/React.createElement("button", {
    className: "icon-btn",
    onClick: exit
  }, "✕"), /*#__PURE__*/React.createElement("span", {
    className: "run-count"
  }, idx + 1, " / ", steps.length, "\u3000", routine.name), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 36
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "segbar"
  }, steps.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: s.id,
    className: 'seg ' + (i < idx ? 'done' : i === idx ? 'cur' : ''),
    style: {
      flex: s.seconds,
      background: s.color
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "eta"
  }, "終了予定 ", /*#__PURE__*/React.createElement("b", null, fmtClock(projEnd)), /*#__PURE__*/React.createElement("span", {
    className: 'd ' + dCls
  }, targetMs ? '目標 ' + routine.targetEnd : '予定', " · ", fmtDelta(delta))), /*#__PURE__*/React.createElement("div", {
    className: "ring-wrap"
  }, !running && /*#__PURE__*/React.createElement("div", {
    className: "paused-tag"
  }, "一時停止中"), /*#__PURE__*/React.createElement("div", {
    className: "ring"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 300 300"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "150",
    cy: "150",
    r: R,
    fill: "none",
    stroke: "rgba(34,31,27,.09)",
    strokeWidth: "10"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "150",
    cy: "150",
    r: R,
    fill: "none",
    stroke: ringColor,
    strokeWidth: "12",
    strokeLinecap: "round",
    strokeDasharray: C,
    strokeDashoffset: C * (1 - frac),
    style: {
      transition: 'stroke-dashoffset .2s linear'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "ring-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cur-name"
  }, step.name || 'ステップ ' + (idx + 1)), /*#__PURE__*/React.createElement("div", {
    className: "cur-time",
    style: {
      color: ringColor
    }
  }, man ? mmss(elapsed) : mmss(remaining)), man ? /*#__PURE__*/React.createElement("div", {
    className: "next-line"
  }, over ? /*#__PURE__*/React.createElement("b", {
    className: "ov"
  }, "目安 ", fmtLong(step.seconds), " を ", fmtLong(-remaining / 1000), " 超過") : /*#__PURE__*/React.createElement(React.Fragment, null, "目安 ", /*#__PURE__*/React.createElement("b", null, fmtLong(step.seconds)))) : /*#__PURE__*/React.createElement("div", {
    className: "next-line"
  }, idx < steps.length - 1 ? /*#__PURE__*/React.createElement(React.Fragment, null, "次 · ", /*#__PURE__*/React.createElement("b", null, steps[idx + 1].name || 'ステップ ' + (idx + 2))) : '最後のステップ'))), bgOn && /*#__PURE__*/React.createElement("div", {
    className: "bg-tag"
  }, /*#__PURE__*/React.createElement("b", null, "●"), " 裏でも進行中 — 他のアプリに移って大丈夫です")), curChecks.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "chk-list"
  }, curChecks.map(c => {
    const on = !!checkState[c.id];
    return /*#__PURE__*/React.createElement("button", {
      key: c.id,
      className: 'chk-item' + (on ? ' on' : ''),
      onClick: () => toggleCheck(c.id)
    }, /*#__PURE__*/React.createElement("span", {
      className: "box"
    }, on ? '✓' : ''), c.text);
  })), man && /*#__PURE__*/React.createElement("button", {
    className: "done-step",
    onClick: next
  }, "✓ 完了して次へ"), /*#__PURE__*/React.createElement("div", {
    className: "controls"
  }, /*#__PURE__*/React.createElement("button", {
    className: "cbtn",
    onClick: prev
  }, "⏮"), /*#__PURE__*/React.createElement("button", {
    className: "cbtn main",
    onClick: toggle
  }, running ? '❙❙' : '▶'), /*#__PURE__*/React.createElement("button", {
    className: "cbtn",
    onClick: next
  }, "⏭")), /*#__PURE__*/React.createElement("div", {
    className: "skip-wrap"
  }, /*#__PURE__*/React.createElement("button", {
    className: "skip-btn",
    onClick: skip
  }, "⤼ このステップをスキップ")));
}

/* ================= SETTINGS ================= */
function SettingsView({
  settings,
  setSettings,
  routines,
  logs,
  onImport,
  onBack
}) {
  const fileRef = useRef(null);
  const [perm, setPerm] = useState('Notification' in window ? Notification.permission : 'unsupported');
  const toggle = k => setSettings(s => Object.assign({}, s, {
    [k]: !s[k]
  }));
  const rows = [['background', 'バックグラウンド進行', '他アプリに切り替えてもタイマーを動かし続けます'], ['notify', '通知', '裏にいる間、ステップ切替を通知でお知らせします'], ['sound', '効果音', 'ステップ切替・完了・残り10秒の予告音'], ['speakStart', '開始時の読み上げ', '各ステップの開始時に、名前と所要時間を読み上げ'], ['speech', '残り30秒の読み上げ', '1分以上のステップで「残り30秒です」を読み上げ'], ['vibrate', 'バイブレーション', '切替・完了時に振動'], ['wake', '画面スリープ防止', '表示中は画面を消灯させない']];
  const req = async () => {
    const r = await askNotify();
    setPerm(r);
    if (r !== 'granted') alert('通知が許可されませんでした。端末の設定からこのサイトの通知を有効にしてください。');
  };
  const exportAll = () => {
    download('ritcho-backup-' + todayStr() + '.json', JSON.stringify({
      app: '律帖',
      type: 'backup',
      version: 2,
      exportedAt: new Date().toISOString(),
      routines: routines,
      logs: logs,
      settings: settings
    }, null, 2), 'application/json');
    setSettings(s => Object.assign({}, s, {
      lastBackupAt: Date.now()
    }));
  };
  const onFile = e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const data = JSON.parse(rd.result);
        const arr = Array.isArray(data) ? data : data.routines || [];
        const hasLogs = data && Array.isArray(data.logs) && data.logs.length;
        const mode = confirm('既存のルーチンを置き換えますか？\n\n［OK］置き換え　／　［キャンセル］追加読み込み') ? 'replace' : 'append';
        const clean = arr.filter(r => r && Array.isArray(r.steps)).map(r => ({
          id: uid(),
          name: String(r.name || '読み込み').slice(0, 60),
          targetEnd: r.targetEnd || null,
          steps: r.steps.map(s => ({
            id: uid(),
            name: String(s.name || '').slice(0, 60),
            seconds: Math.max(1, parseInt(s.seconds, 10) || 60),
            color: s.color || '#c4402f',
            mode: s.mode === 'manual' ? 'manual' : 'timer',
            days: Array.isArray(s.days) && s.days.length && s.days.length < 7 ? s.days : null,
            checks: Array.isArray(s.checks) ? s.checks.filter(c => c && c.text).map(c => ({
              id: uid(),
              text: String(c.text).slice(0, 60)
            })) : []
          }))
        })).filter(r => r.steps.length);
        if (!clean.length) {
          alert('読み込めるルーチンが見つかりませんでした。');
          return;
        }
        let logsIn = null;
        if (hasLogs && confirm('このファイルには実施ログ ' + data.logs.length + ' 件が含まれています。ログも復元しますか？')) logsIn = data.logs;
        onImport(clean, mode, logsIn);
        alert(clean.length + '件のルーチンを' + (mode === 'replace' ? '置き換え' : '追加') + 'ました。');
      } catch (err) {
        alert('読み込めませんでした（JSON形式を確認してください）。');
      }
      e.target.value = '';
    };
    rd.readAsText(f);
  };
  const d = daysSince(settings.lastBackupAt);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "sub-head"
  }, /*#__PURE__*/React.createElement("button", {
    className: "icon-btn",
    onClick: onBack
  }, "←"), /*#__PURE__*/React.createElement("h2", null, "設定")), /*#__PURE__*/React.createElement("div", {
    className: "set-title"
  }, "バックグラウンド"), /*#__PURE__*/React.createElement("div", {
    className: "set-section"
  }, rows.slice(0, 2).map(r => /*#__PURE__*/React.createElement("div", {
    className: "toggle-row",
    key: r[0]
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "t-name"
  }, r[1]), /*#__PURE__*/React.createElement("div", {
    className: "t-desc"
  }, r[2])), /*#__PURE__*/React.createElement("label", {
    className: "sw"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: !!settings[r[0]],
    onChange: () => toggle(r[0])
  }), /*#__PURE__*/React.createElement("span", {
    className: "track"
  }), /*#__PURE__*/React.createElement("span", {
    className: "knob"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "perm-row"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "t-name"
  }, "通知の許可"), /*#__PURE__*/React.createElement("div", {
    className: "t-desc"
  }, "初回は許可が必要です")), perm === 'granted' ? /*#__PURE__*/React.createElement("span", {
    className: "perm-state ok"
  }, "許可済み") : /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: req
  }, "許可する"))), /*#__PURE__*/React.createElement("p", {
    className: "hint"
  }, "通知が届かない場合は、端末の設定でこのサイトの通知と「電池 → 制限なし」を確認してください。"), /*#__PURE__*/React.createElement("div", {
    className: "set-title"
  }, "通知音・読み上げ"), /*#__PURE__*/React.createElement("div", {
    className: "set-section"
  }, rows.slice(2).map(r => /*#__PURE__*/React.createElement("div", {
    className: "toggle-row",
    key: r[0]
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "t-name"
  }, r[1]), /*#__PURE__*/React.createElement("div", {
    className: "t-desc"
  }, r[2])), /*#__PURE__*/React.createElement("label", {
    className: "sw"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: !!settings[r[0]],
    onChange: () => toggle(r[0])
  }), /*#__PURE__*/React.createElement("span", {
    className: "track"
  }), /*#__PURE__*/React.createElement("span", {
    className: "knob"
  }))))), /*#__PURE__*/React.createElement("div", {
    className: "set-title"
  }, "バックアップ（JSON）"), /*#__PURE__*/React.createElement("div", {
    className: "set-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "backup-row"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: exportAll
  }, "書き出す"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => fileRef.current && fileRef.current.click()
  }, "読み込む")), /*#__PURE__*/React.createElement("div", {
    className: "toggle-row",
    style: {
      borderTop: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "t-name"
  }, "最終バックアップ"), /*#__PURE__*/React.createElement("div", {
    className: "t-desc"
  }, d === null ? 'まだ書き出していません' : d === 0 ? '今日' : d + '日前')), d === null || d >= 30 ? /*#__PURE__*/React.createElement("span", {
    className: "perm-state warn"
  }, "要書き出し") : /*#__PURE__*/React.createElement("span", {
    className: "perm-state ok"
  }, "最新"))), /*#__PURE__*/React.createElement("p", {
    className: "hint"
  }, "ルーチン・実施ログ・設定をまとめて1つのファイルに保存します。端末の保存領域はブラウザの整理や機種変更で消えることがあるため、月に一度の書き出しをおすすめします。"), /*#__PURE__*/React.createElement("input", {
    ref: fileRef,
    type: "file",
    accept: "application/json,.json",
    style: {
      display: 'none'
    },
    onChange: onFile
  }));
}

/* ================= LOG ================= */
function LogView({
  logs,
  routines,
  onApply,
  onDelete,
  onClear,
  onBack
}) {
  const [mode, setMode] = useState('list');
  const [sel, setSel] = useState(null);
  const [from, setFrom] = useState(shiftDay(todayStr(), -6));
  const [to, setTo] = useState(todayStr());
  const preset = n => {
    setTo(todayStr());
    setFrom(n === null ? '2000-01-01' : shiftDay(todayStr(), -(n - 1)));
  };
  const filtered = logs.filter(e => {
    const d = localDate(e.startISO);
    return d >= from && d <= to;
  }).sort((a, b) => a.startISO < b.startISO ? 1 : -1);
  const sumActual = filtered.reduce((a, e) => a + (e.actualSec || 0), 0);
  const groups = [];
  filtered.forEach(e => {
    const d = localDate(e.startISO);
    let g = groups.find(x => x.d === d);
    if (!g) {
      g = {
        d: d,
        items: []
      };
      groups.push(g);
    }
    g.items.push(e);
  });

  /* Aggregates are keyed by step id so weekday-filtered runs, which shift
     positions, still line up with the right step. */
  const rIds = [];
  filtered.forEach(e => {
    if (rIds.indexOf(e.routineId) < 0) rIds.push(e.routineId);
  });
  const selId = sel && rIds.indexOf(sel) >= 0 ? sel : rIds[0];
  const runs = filtered.filter(e => e.routineId === selId);
  const curR = routines.find(r => r.id === selId);
  const rows = [];
  if (curR) {
    curR.steps.forEach((st, i) => {
      /* A timed-out step only tells us the duration was "at least the budget" —
         it is a censored observation, not a measurement. Mixing those into the
         median drags it up towards the budget, so they are counted separately
         and never feed the recommendation. */
      const done = [];
      let auto = 0,
        skip = 0,
        over = 0,
        seen = 0;
      runs.forEach(e => {
        const rec = (e.steps || []).find((x, j) => x.id ? x.id === st.id : j === i && x.name === st.name);
        if (!rec) return;
        seen++;
        if (rec.skipped) {
          skip++;
          return;
        }
        const v = rec.actualMs ? rec.actualMs / 1000 : rec.actualSec;
        if (v <= 0) return;
        if (rec.auto) {
          auto++;
          return;
        }
        done.push(v);
        if (v > rec.plannedSec) over++;
      });
      const med = Math.round(median(done));
      /* Budgeting at the median guarantees running out half the time, so the
         suggestion is the 75th percentile of the hand-finished runs. */
      const rec = done.length >= 3 ? Math.max(5, Math.round(pct(done, .75) / 5) * 5) : null;
      rows.push({
        i: i,
        label: st.name || 'ステップ ' + (i + 1),
        planned: st.seconds,
        manual: isManual(st),
        med: med,
        n: done.length,
        auto: auto,
        skip: skip,
        seen: seen,
        over: over,
        rec: rec && rec !== st.seconds ? rec : null
      });
    });
  }
  const applicable = rows.filter(r => r.rec && curR && curR.steps[r.i]);
  const applyRec = () => {
    if (!applicable.length || !curR) return;
    if (!confirm(applicable.length + '件のステップ時間を実測の中央値に更新します。よろしいですか？')) return;
    onApply(selId, applicable.map(r => ({
      index: r.i,
      seconds: r.rec
    })));
    alert('更新しました。');
  };
  const buildMd = () => {
    let md = '# 律帖 実施ログ  ' + from + ' 〜 ' + to + '\n\n（' + filtered.length + '件 / 合計実施 ' + fmtLong(sumActual) + '）\n';
    groups.forEach(g => {
      const dt = new Date(g.d + 'T00:00:00');
      md += '\n## ' + g.d + ' (' + WD[dt.getDay()] + ')\n';
      g.items.slice().reverse().forEach(e => {
        md += '- **' + hhmm(e.startISO) + '** ' + e.routineName + ' — 計画 ' + fmtLong(e.plannedSec) + ' / 実施 ' + fmtLong(e.actualSec) + ' — ' + (e.completed ? '✅ 完了' : '⏸ 中断') + ' (' + e.stepsDone + '/' + e.stepsTotal + ')' + (e.skipped ? ' ・スキップ ' + e.skipped : '') + '\n';
        (e.steps || []).forEach(s => {
          const tag = s.auto ? ' `[時間切れ]`' : s.mode === 'manual' ? ' `[完了ボタン]`' : ' `[手押し]`';
          const val = s.skipped ? 'スキップ' : s.actualSec ? fmtLong(s.actualSec) + tag : '—';
          const ck = s.checkTotal ? '　☑' + s.checkDone + '/' + s.checkTotal : '';
          md += '    - ' + (s.name || '（無題）') + '　' + fmtLong(s.plannedSec) + ' / ' + val + ck + '\n';
        });
      });
    });
    return md;
  };
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "sub-head"
  }, /*#__PURE__*/React.createElement("button", {
    className: "icon-btn",
    onClick: onBack
  }, "←"), /*#__PURE__*/React.createElement("h2", null, "実施ログ")), /*#__PURE__*/React.createElement("div", {
    className: "range-row"
  }, /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: from,
    max: to,
    onChange: e => setFrom(e.target.value)
  }), /*#__PURE__*/React.createElement("span", null, "〜"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: to,
    min: from,
    max: todayStr(),
    onChange: e => setTo(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    className: "chips"
  }, /*#__PURE__*/React.createElement("button", {
    className: "chip",
    onClick: () => preset(1)
  }, "今日"), /*#__PURE__*/React.createElement("button", {
    className: "chip",
    onClick: () => preset(7)
  }, "7日"), /*#__PURE__*/React.createElement("button", {
    className: "chip",
    onClick: () => preset(30)
  }, "30日"), /*#__PURE__*/React.createElement("button", {
    className: "chip",
    onClick: () => preset(null)
  }, "全て")), /*#__PURE__*/React.createElement("div", {
    className: "exp-row"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    disabled: !filtered.length,
    onClick: () => download('ritcho-log-' + from + '_' + to + '.md', buildMd(), 'text/markdown;charset=utf-8')
  }, "Markdownで書き出す"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    disabled: !filtered.length,
    onClick: () => download('ritcho-log-' + from + '_' + to + '.json', JSON.stringify({
      app: '律帖',
      type: 'logs',
      version: 2,
      from: from,
      to: to,
      exportedAt: new Date().toISOString(),
      logs: filtered
    }, null, 2), 'application/json')
  }, "JSON")), /*#__PURE__*/React.createElement("div", {
    className: "mode-row"
  }, /*#__PURE__*/React.createElement("button", {
    className: mode === 'list' ? 'on' : '',
    onClick: () => setMode('list')
  }, "一覧"), /*#__PURE__*/React.createElement("button", {
    className: mode === 'stats' ? 'on' : '',
    onClick: () => setMode('stats')
  }, "集計")), /*#__PURE__*/React.createElement("div", {
    className: "log-summary"
  }, /*#__PURE__*/React.createElement("b", null, filtered.length), " 件\u3000/\u3000合計実施 ", /*#__PURE__*/React.createElement("b", null, fmtLong(sumActual))), mode === 'stats' ? !runs.length || !curR ? /*#__PURE__*/React.createElement("div", {
    className: "empty",
    style: {
      padding: '40px 20px'
    }
  }, /*#__PURE__*/React.createElement("p", null, runs.length ? 'このルーチンは削除されています。' : 'この期間の記録はありません。')) : /*#__PURE__*/React.createElement("div", null, rIds.length > 1 && /*#__PURE__*/React.createElement("div", {
    className: "stat-sel"
  }, rIds.map(id => {
    const r = routines.find(x => x.id === id);
    const nm = r ? r.name : (filtered.find(e => e.routineId === id) || {}).routineName || '（削除済み）';
    return /*#__PURE__*/React.createElement("button", {
      key: id,
      className: id === selId ? 'on' : '',
      onClick: () => setSel(id)
    }, nm);
  })), /*#__PURE__*/React.createElement("div", {
    className: "log-summary",
    style: {
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("b", null, runs.length), " 回の実施をもとに集計"), rows.map(r => {
    const d = r.n ? r.med - r.planned : 0;
    const cls = !r.n ? 'same' : d > 5 ? 'over' : d < -5 ? 'under' : 'same';
    return /*#__PURE__*/React.createElement("div", {
      className: "stat-row",
      key: r.i
    }, /*#__PURE__*/React.createElement("div", {
      className: "stat-h"
    }, /*#__PURE__*/React.createElement("span", {
      className: "nm"
    }, r.i + 1, ". ", r.label, r.manual ? /*#__PURE__*/React.createElement("span", {
      className: "dim sm"
    }, " 完了ボタン") : null), /*#__PURE__*/React.createElement("span", {
      className: "n"
    }, r.n ? '実測 ' + r.n + '回' : r.auto ? '実測なし' : 'データなし')), /*#__PURE__*/React.createElement("div", {
      className: "stat-b"
    }, /*#__PURE__*/React.createElement("span", {
      className: "pl"
    }, fmtLong(r.planned)), /*#__PURE__*/React.createElement("span", {
      className: "ar"
    }, "→"), /*#__PURE__*/React.createElement("span", {
      className: "md"
    }, r.n ? fmtLong(r.med) : '—'), r.n > 0 && /*#__PURE__*/React.createElement("span", {
      className: 'df ' + cls
    }, d > 0 ? '+' : d < 0 ? '−' : '±', fmtLong(Math.abs(d))), r.rec && /*#__PURE__*/React.createElement("span", {
      className: "rc"
    }, "推奨 ", fmtLong(r.rec))), /*#__PURE__*/React.createElement("div", {
      className: "stat-f"
    }, !r.manual && r.auto > 0 && /*#__PURE__*/React.createElement("span", {
      className: "warnmark"
    }, "時間切れ ", r.auto, "/", r.auto + r.n, " 回"), r.manual && r.n > 0 && /*#__PURE__*/React.createElement("span", null, "目安超過 ", Math.round(r.over / r.n * 100), "%"), r.skip > 0 && /*#__PURE__*/React.createElement("span", null, "スキップ ", r.skip, " 回"), !r.manual && r.n === 0 && r.auto > 0 && /*#__PURE__*/React.createElement("span", {
      className: "warnmark"
    }, "毎回時間切れ — 実際の所要時間は不明です"), r.n > 0 && r.n < 3 && /*#__PURE__*/React.createElement("span", null, "推奨には3回以上の実測が必要です")));
  }), /*#__PURE__*/React.createElement("div", {
    className: "apply-box"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-shu",
    disabled: !applicable.length,
    onClick: applyRec
  }, applicable.length ? '推奨秒数に一括更新（' + applicable.length + '件）' : '更新できる差はありません'), /*#__PURE__*/React.createElement("p", {
    className: "hint",
    style: {
      textAlign: 'center',
      paddingTop: 10
    }
  }, "時間切れで自動的に進んだ回は実測に数えません。手で終えた記録が3回以上あるステップだけ、その75パーセンタイル（5秒単位）を推奨します。中央値だと半分は時間切れになるためです。"))) : filtered.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "empty",
    style: {
      padding: '40px 20px'
    }
  }, /*#__PURE__*/React.createElement("p", null, "この期間の記録はありません。")) : groups.map(g => {
    const dt = new Date(g.d + 'T00:00:00');
    return /*#__PURE__*/React.createElement("div", {
      className: "log-group",
      key: g.d
    }, /*#__PURE__*/React.createElement("div", {
      className: "log-date"
    }, g.d, "（", WD[dt.getDay()], "）"), g.items.map(e => /*#__PURE__*/React.createElement("div", {
      className: "log-item",
      key: e.id
    }, /*#__PURE__*/React.createElement("div", {
      className: "log-time"
    }, hhmm(e.startISO)), /*#__PURE__*/React.createElement("div", {
      className: "log-body"
    }, /*#__PURE__*/React.createElement("div", {
      className: "log-rn"
    }, e.routineName), /*#__PURE__*/React.createElement("div", {
      className: "log-sub"
    }, "実施 ", fmtLong(e.actualSec), " · 計画 ", fmtLong(e.plannedSec), " · ", e.stepsDone, "/", e.stepsTotal, e.skipped ? ' · スキップ ' + e.skipped : '')), /*#__PURE__*/React.createElement("span", {
      className: 'log-badge ' + (e.completed ? 'badge-ok' : 'badge-cut')
    }, e.completed ? '完了' : '中断'), /*#__PURE__*/React.createElement("button", {
      className: "log-x",
      onClick: () => onDelete(e.id)
    }, "×"))));
  }), mode === 'list' && logs.length > 0 && /*#__PURE__*/React.createElement("button", {
    className: "clear-all",
    onClick: onClear
  }, "全ての記録を削除"));
}

/* ================= APP ================= */
function App() {
  const [routines, setRoutines] = useState(() => {
    const s = load(RKEY, null);
    if (s) return s;
    save(RKEY, seed);
    return seed;
  });
  const [logs, setLogs] = useState(() => load(LKEY, []));
  const [settings, setSettings] = useState(() => {
    const s = Object.assign({
      sound: true,
      speech: true,
      speakStart: true,
      vibrate: true,
      wake: true,
      background: true,
      notify: true,
      lastBackupAt: null
    }, load(SKEY, {}));
    Object.assign(SETTINGS, s);
    return s;
  });
  const [view, setView] = useState({
    name: 'list'
  });
  const [pending, setPending] = useState(() => load(AKEY, null));
  const [resumeState, setResumeState] = useState(null);
  const [hasUpdate, setHasUpdate] = useState(false);
  useEffect(() => {
    initSW(() => setHasUpdate(true));
  }, []);
  useEffect(() => save(RKEY, routines), [routines]);
  useEffect(() => save(LKEY, logs), [logs]);
  useEffect(() => {
    Object.assign(SETTINGS, settings);
    save(SKEY, settings);
  }, [settings]);
  const byId = id => routines.find(r => r.id === id);
  const pendRoutine = pending ? byId(pending.routineId) : null;
  const pendInfo = pendRoutine ? {
    name: pendRoutine.name,
    savedAt: new Date(pending.savedAt).toISOString(),
    stepName: (activeFor(pendRoutine.steps, pending.dow)[pending.idx || 0] || {}).name || 'ステップ ' + ((pending.idx || 0) + 1)
  } : null;
  const d = daysSince(settings.lastBackupAt);
  const backupWarn = routines.length || logs.length ? settings.lastBackupAt === null ? 'バックアップがまだありません' : d >= 30 ? '最後のバックアップから' + d + '日' : null : null;
  const doResume = async () => {
    if (SETTINGS.notify) await askNotify();
    setResumeState(pending);
    setView({
      name: 'run',
      id: pending.routineId
    });
    setPending(null);
  };
  const doDiscard = () => {
    if (confirm('中断された実行を破棄しますか？')) {
      drop(AKEY);
      setPending(null);
    }
  };
  const startRun = async id => {
    const r = byId(id);
    if (r && activeFor(r.steps, new Date().getDay()).length === 0) {
      alert('今日は実行するステップがありません。');
      return;
    }
    if (SETTINGS.notify) await askNotify();
    setResumeState(null);
    drop(AKEY);
    setPending(null);
    setView({
      name: 'run',
      id: id
    });
  };
  const newRoutine = () => setView({
    name: 'edit',
    routine: {
      id: uid(),
      name: '',
      targetEnd: null,
      steps: [{
        id: uid(),
        name: '',
        seconds: 60,
        color: '#c4402f'
      }]
    }
  });
  const saveRoutine = r => {
    setRoutines(rs => rs.some(x => x.id === r.id) ? rs.map(x => x.id === r.id ? r : x) : rs.concat([r]));
    setView({
      name: 'list'
    });
  };
  const delRoutine = id => {
    if (confirm('このルーチンを削除しますか？')) setRoutines(rs => rs.filter(r => r.id !== id));
  };
  const addLog = e => setLogs(ls => ls.concat([e]).slice(-800));
  const importData = (clean, mode, logsIn) => {
    setRoutines(rs => mode === 'replace' ? clean : rs.concat(clean));
    if (logsIn) setLogs(logsIn.slice(-800));
  };
  const applyRec = (rid, list) => setRoutines(rs => rs.map(r => r.id !== rid ? r : Object.assign({}, r, {
    steps: r.steps.map((st, i) => {
      const f = list.find(x => x.index === i);
      return f ? Object.assign({}, st, {
        seconds: f.seconds
      }) : st;
    })
  })));
  if (view.name === 'run') return /*#__PURE__*/React.createElement(RunView, {
    routine: byId(view.id),
    resume: resumeState,
    onLog: addLog,
    onExit: () => {
      setResumeState(null);
      setPending(load(AKEY, null));
      setView({
        name: 'list'
      });
    }
  });
  if (view.name === 'edit') return /*#__PURE__*/React.createElement(EditView, {
    routine: view.routine || byId(view.id),
    onSave: saveRoutine,
    onCancel: () => setView({
      name: 'list'
    })
  });
  if (view.name === 'settings') return /*#__PURE__*/React.createElement(SettingsView, {
    settings: settings,
    setSettings: setSettings,
    routines: routines,
    logs: logs,
    onImport: importData,
    onBack: () => setView({
      name: 'list'
    })
  });
  if (view.name === 'log') return /*#__PURE__*/React.createElement(LogView, {
    logs: logs,
    routines: routines,
    onApply: applyRec,
    onDelete: id => setLogs(ls => ls.filter(l => l.id !== id)),
    onClear: () => {
      if (confirm('全ての実施ログを削除しますか？')) setLogs([]);
    },
    onBack: () => setView({
      name: 'list'
    })
  });
  return /*#__PURE__*/React.createElement(ListView, {
    routines: routines,
    pending: pendInfo,
    backupWarn: backupWarn,
    hasUpdate: hasUpdate,
    onUpdate: applyUpdate,
    onResume: doResume,
    onDiscard: doDiscard,
    onRun: startRun,
    onEdit: id => setView({
      name: 'edit',
      id: id
    }),
    onNew: newRoutine,
    onDelete: delRoutine,
    onOpenLog: () => setView({
      name: 'log'
    }),
    onOpenSettings: () => setView({
      name: 'settings'
    })
  });
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));

/* The new worker is left waiting rather than taking over immediately: swapping
   assets underneath a running two-hour routine is not something to do silently.
   The list screen offers the update, and only then do we activate and reload. */
let swReg = null;
function initSW(onUpdate) {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      swReg = reg;
      if (reg.waiting && navigator.serviceWorker.controller) onUpdate();
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) onUpdate();
        });
      });
    }).catch(() => {});
  });
}
function applyUpdate() {
  if (!swReg || !swReg.waiting) {
    location.reload();
    return;
  }
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
  swReg.waiting.postMessage('SKIP_WAITING');
}