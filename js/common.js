/* ============================================================
   수학 탐구 월드 · 공통 기능
   서버 통신, 로그인 상태 저장, 체험 모드, 칠판 배경 기호
   (보통은 고칠 필요가 없는 파일입니다)
   ============================================================ */

const EMW = (() => {
  const KEY = {
    session: 'emw.session',
    fresh: 'emw.fresh',
    teacherGrade: 'emw.teacherGrade',
    pending: 'emw.pending.',
    demoUsers: 'emw.demo.users',
    demoNotices: 'emw.demo.notices',
    demoRecords: 'emw.demo.records',
  };

  const RAW_URL = typeof API_URL === 'string' ? API_URL.trim() : '';
  const DEMO = !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec/.test(RAW_URL);

  const MAX_CLASS = 20;   // 반은 01~20반까지
  const MAX_NUMBER = 45;  // 번호는 01~45번까지

  /* ---------- 브라우저 저장소 ---------- */
  function store(kind) {
    try { return kind === 'session' ? window.sessionStorage : window.localStorage; }
    catch (e) { return null; }
  }
  function read(kind, key, fallback) {
    try {
      const v = store(kind).getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  }
  function write(kind, key, value) {
    try { store(kind).setItem(key, JSON.stringify(value)); } catch (e) { /* 저장 실패는 무시 */ }
  }
  function remove(kind, key) {
    try { store(kind).removeItem(key); } catch (e) { /* 무시 */ }
  }

  /* ---------- 로그인 상태 ---------- */
  const getSession = () => {
    const s = read('local', KEY.session, null);
    return s && s.id && s.token ? s : null;
  };
  const setSession = (s) => write('local', KEY.session, s);
  const clearSession = () => remove('local', KEY.session);

  const markFresh = () => write('session', KEY.fresh, 1);
  const takeFresh = () => {
    const v = read('session', KEY.fresh, 0);
    remove('session', KEY.fresh);
    return v === 1;
  };

  const getTeacherGrade = () => {
    const g = Number(read('local', KEY.teacherGrade, 1));
    return g >= 1 && g <= 3 ? g : 1;
  };
  const setTeacherGrade = (g) => write('local', KEY.teacherGrade, g);

  /* 아직 서버에 저장하지 못한 활동 기록 */
  const getPending = (id) => read('local', KEY.pending + id, []);
  const addPending = (id, appId) => {
    const list = getPending(id);
    if (list.indexOf(appId) === -1) list.push(appId);
    write('local', KEY.pending + id, list);
  };
  const clearPending = (id, done) => {
    const rest = getPending(id).filter((x) => done.indexOf(x) === -1);
    if (rest.length) write('local', KEY.pending + id, rest);
    else remove('local', KEY.pending + id);
  };

  /* ---------- 학번 ---------- */
  function parseStudentId(raw) {
    const id = String(raw || '').trim();
    const m = /^([1-3])(\d{2})(\d{2})$/.exec(id);
    if (!m) return null;
    const grade = Number(m[1]);
    const cls = Number(m[2]);
    const num = Number(m[3]);
    if (cls < 1 || cls > MAX_CLASS || num < 1 || num > MAX_NUMBER) return null;
    return { id, grade, cls, num };
  }

  /* ---------- 안내 문구 ---------- */
  const MESSAGES = {
    NETWORK: '서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요. 계속 안 되면 학교 네트워크에서 차단된 것일 수 있어요.',
    BAD_ID: '학번 5자리를 정확히 입력해 주세요. 예) 1학년 1반 1번은 10101',
    BAD_PASSWORD: '비밀번호는 4자 이상 20자 이하로 정해 주세요.',
    PASSWORD_MISMATCH: '비밀번호 확인이 위의 비밀번호와 달라요.',
    EXISTS: '이미 가입된 학번이에요. 로그인 탭에서 들어가세요. 가입한 적이 없다면 선생님께 알려 주세요.',
    NOT_FOUND: '가입되지 않은 학번이에요. 회원가입 탭에서 먼저 가입해 주세요.',
    RESET: '비밀번호가 초기화됐어요. 같은 학번으로 새 비밀번호를 정해 주세요. 진행도와 기록은 그대로 남아 있어요.',
    WRONG_PASSWORD: '비밀번호가 맞지 않아요. 잊어버렸다면 선생님께 말씀해 주세요.',
    TEACHER_PASSWORD_NOT_SET: 'Apps Script 코드의 TEACHER_PASSWORD를 먼저 바꾼 뒤 새 버전으로 배포해 주세요.',
    AUTH: '로그인 정보가 바뀌었어요. 다시 로그인해 주세요.',
    FORBIDDEN: '선생님 계정으로만 할 수 있어요.',
    EMPTY_TITLE: '공지 제목을 입력해 주세요.',
    NO_LOGIN: '로그인하지 않아 제출하지 못했어요. 수학 탐구 월드에 로그인한 뒤 활동을 다시 열어 주세요.',
    EMPTY_RECORD: '제출할 내용이 없어요.',
    BAD_ACTIVITY: '활동 정보를 확인하지 못해 제출하지 못했어요. 선생님께 알려 주세요.',
    BUSY: '지금 접속한 사람이 많아요. 몇 초 뒤에 다시 시도해 주세요.',
    SERVER: '서버에서 처리하지 못했어요. 잠시 뒤에 다시 시도해 주세요.',
    BAD_REQUEST: '요청을 처리하지 못했어요. 페이지를 새로 고친 뒤 다시 시도해 주세요.',
  };
  const message = (code) => MESSAGES[code] || MESSAGES.SERVER;

  /* ---------- 서버 통신 ---------- */
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function api(action, data) {
    const payload = Object.assign({ action }, data || {});
    if (DEMO) return demoApi(action, payload);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        // Content-Type을 지정하지 않아야 Apps Script가 막히지 않고 응답합니다.
        const res = await fetch(RAW_URL, { method: 'POST', body: JSON.stringify(payload) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json = await res.json();
        if (json && json.error === 'BUSY' && attempt === 0) { await wait(1500); continue; }
        return json;
      } catch (e) {
        if (attempt === 0) { await wait(1000); continue; }
      }
    }
    return { ok: false, error: 'NETWORK' };
  }

  /* ---------- 체험 모드 (서버 주소가 없을 때) ---------- */
  function today() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  async function demoApi(action, d) {
    await wait(250);
    const users = read('local', KEY.demoUsers, {});
    let notices = read('local', KEY.demoNotices, []);
    const records = read('local', KEY.demoRecords, []);
    const isTeacher = d.id === 'teacher';
    const sid = parseStudentId(d.id);
    const forGrade = (g) => notices.filter((n) => !n.target || n.target === g);
    const saveUsers = () => write('local', KEY.demoUsers, users);
    const stamp = () => today() + ' ' + new Date().toTimeString().slice(0, 5);

    switch (action) {
      case 'signup': {
        if (!sid) return { ok: false, error: 'BAD_ID' };
        const old = users[d.id];
        if (old && old.password) return { ok: false, error: 'EXISTS' };
        users[d.id] = old
          ? Object.assign(old, { password: d.password, lastSeen: stamp() })
          : { password: d.password, used: [], joined: stamp(), lastSeen: stamp() };
        saveUsers();
        return { ok: true, id: d.id, role: 'student', grade: sid.grade, token: 'demo', used: users[d.id].used, notices: forGrade(sid.grade) };
      }
      case 'login': {
        if (d.id === 'teacher') {
          return d.password === 'teacher'
            ? { ok: true, id: 'teacher', role: 'teacher', grade: 1, token: 'demo', used: [], notices }
            : { ok: false, error: 'WRONG_PASSWORD' };
        }
        if (!sid) return { ok: false, error: 'BAD_ID' };
        const u = users[d.id];
        if (!u) return { ok: false, error: 'NOT_FOUND' };
        if (!u.password) return { ok: false, error: 'RESET' };
        if (u.password !== d.password) return { ok: false, error: 'WRONG_PASSWORD' };
        u.lastSeen = stamp();
        saveUsers();
        return { ok: true, id: d.id, role: 'student', grade: sid.grade, token: 'demo', used: u.used, notices: forGrade(sid.grade) };
      }
      case 'bootstrap': {
        if (isTeacher) return { ok: true, used: [], notices };
        const u = users[d.id];
        return u && u.password ? { ok: true, used: u.used, notices: forGrade(sid.grade) } : { ok: false, error: 'AUTH' };
      }
      case 'markUsed': {
        const u = users[d.id];
        if (!u || !u.password) return { ok: false, error: 'AUTH' };
        (d.appIds || []).forEach((a) => { if (u.used.indexOf(a) === -1) u.used.push(a); });
        saveUsers();
        return { ok: true, used: u.used };
      }
      case 'submitRecord': {
        const u = users[d.id];
        if (!u || !u.password) return { ok: false, error: 'AUTH' };
        if (!d.appId) return { ok: false, error: 'BAD_ACTIVITY' };
        if (!Array.isArray(d.data) || !d.data.length) return { ok: false, error: 'EMPTY_RECORD' };
        records.push({ time: stamp(), studentId: d.id, appId: d.appId, title: d.title || '', data: d.data });
        write('local', KEY.demoRecords, records);
        return { ok: true };
      }
      case 'getStudent': {
        if (!isTeacher) return { ok: false, error: 'FORBIDDEN' };
        const u = users[d.studentId];
        if (!u) return { ok: false, error: 'NOT_FOUND' };
        return {
          ok: true,
          student: { id: d.studentId, reset: !u.password, used: u.used, joined: u.joined || '', lastSeen: u.lastSeen || '' },
          records: records.filter((r) => r.studentId === d.studentId).reverse(),
        };
      }
      case 'resetPassword': {
        if (!isTeacher) return { ok: false, error: 'FORBIDDEN' };
        const u = users[d.studentId];
        if (!u) return { ok: false, error: 'NOT_FOUND' };
        u.password = '';
        saveUsers();
        return { ok: true };
      }
      case 'addNotice': {
        if (!isTeacher) return { ok: false, error: 'FORBIDDEN' };
        if (!d.title) return { ok: false, error: 'EMPTY_TITLE' };
        notices.unshift({ id: String(Date.now()), date: today(), target: Number(d.target) || 0, title: d.title, content: d.content || '' });
        write('local', KEY.demoNotices, notices);
        return { ok: true, notices };
      }
      case 'deleteNotice': {
        if (!isTeacher) return { ok: false, error: 'FORBIDDEN' };
        notices = notices.filter((n) => n.id !== String(d.noticeId));
        write('local', KEY.demoNotices, notices);
        return { ok: true, notices };
      }
      default:
        return { ok: false, error: 'BAD_REQUEST' };
    }
  }

  function showDemoBanner(el) {
    if (!el || !DEMO) return;
    el.textContent = '체험 모드예요. 가입 정보가 이 기기에만 저장돼요. config.js에 서버 주소를 넣으면 실제로 운영돼요. (선생님 체험: teacher / teacher)';
    el.hidden = false;
  }

  /* ---------- 칠판 위를 떠다니는 기호 ---------- */
  const SYMBOLS = [
    'f(x)', 'Σ', 'π', '√2', '∫', '∞', 'x²', 'y = ax + b', 'θ', 'Δ', '≠', '≤',
    '÷', '×', '∠A', '△ABC', '(a + b)²', 'sin x', 'a² + b² = c²', '½', 'y = x²',
    '%', 'n!', '−3', '|x|', '3.14', '∴', 'x + 2 = 5', '2ⁿ', 'y = a/x',
  ];
  const rand = (a, b) => a + Math.random() * (b - a);

  function drawChalk(layer) {
    if (!layer) return;
    const pool = SYMBOLS.slice().sort(() => Math.random() - 0.5);
    const cols = 6;
    const rows = 5;
    const frag = document.createDocumentFragment();
    let k = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.random() < 0.18) continue;
        const sym = pool[k++ % pool.length];
        const isLong = sym.length > 5;
        const isCentral = c >= 1 && c <= 4 && r >= 1 && r <= 3;
        const s = document.createElement('span');
        s.className = 'chalk-sym';
        s.textContent = sym;
        s.style.left = (((c + rand(0.2, 0.8)) / cols) * 100).toFixed(2) + '%';
        s.style.top = (((r + rand(0.2, 0.8)) / rows) * 100).toFixed(2) + '%';
        s.style.fontSize = Math.round(isLong ? rand(20, 30) : rand(28, 58)) + 'px';
        s.style.setProperty('--o', (isCentral ? rand(0.07, 0.13) : rand(0.2, 0.36)).toFixed(2));
        s.style.setProperty('--r', rand(-14, 14).toFixed(1) + 'deg');
        s.style.setProperty('--dx', Math.round(rand(-36, 36)) + 'px');
        s.style.setProperty('--dy', Math.round(rand(-30, 30)) + 'px');
        s.style.setProperty('--dur', rand(14, 26).toFixed(1) + 's');
        s.style.animationDelay = (-rand(0, 20)).toFixed(1) + 's';
        frag.appendChild(s);
      }
    }
    layer.appendChild(frag);
  }

  return {
    DEMO, api, message, parseStudentId,
    getSession, setSession, clearSession, markFresh, takeFresh,
    getTeacherGrade, setTeacherGrade, getPending, addPending, clearPending,
    drawChalk, showDemoBanner,
  };
})();
