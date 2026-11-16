/* ============================================================
   수학 탐구 월드 · 활동 페이지용 기능
   학생 기록을 모으는 활동 파일에만 넣습니다.

   ■ 활동 파일에 넣는 줄 (apps 폴더 안의 파일 기준)
     <script src="../js/config.js"></script>
     <script src="../js/data.js"></script>
     <script src="../js/common.js"></script>
     <script src="../js/activity.js" data-activity="1-1-1"></script>
                                       ↑ data.js에 적은 활동 id

   ■ 기록을 보낼 때
     EMWActivity.submit({ '1번 답': '2 × 3 × 3', '점수': 80 });

   ■ 게임에서 최고 기록만 보낼 때
     EMWActivity.submitBest('점수', 1200, { unit: '점' });
   ============================================================ */

const EMWActivity = (() => {
  const script = document.currentScript;
  const activityId = (script && script.dataset.activity) || '';
  const base = script && script.src ? script.src : location.href;
  const loginUrl = new URL('../index.html', base).href;

  let busy = false;

  /* data.js에서 이 활동의 이름 찾기 */
  function findApp() {
    if (typeof WORLD_DATA === 'undefined') return null;
    for (const g of Object.keys(WORLD_DATA)) {
      for (const unit of WORLD_DATA[g] || []) {
        for (const app of unit.apps || []) {
          if (app && app.id === activityId) return app;
        }
      }
    }
    return null;
  }

  /* 화면 아래 알림 (활동 파일의 스타일과 섞이지 않도록 따로 떼어 그려요) */
  const NOTE_CSS = [
    ':host{all:initial}',
    '.note{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483000;box-sizing:border-box;',
    'display:flex;align-items:center;gap:12px;width:max-content;max-width:calc(100vw - 24px);margin:0;padding:10px 10px 10px 16px;',
    'border-radius:10px;border:1px solid rgba(27,55,46,.2);background:#F2F0E6;color:#1B372E;',
    'font:500 15px/1.5 "IBM Plex Sans KR","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;word-break:keep-all;text-align:left}',
    '.note.warn{background:#F1D27A;color:#2A2A1C}',
    '.note.err{background:#F4A794;color:#2A1712}',
    'a{color:inherit;font-weight:700;text-decoration:underline;text-underline-offset:3px}',
    'button{all:unset;flex:none;box-sizing:border-box;width:36px;height:36px;display:grid;place-items:center;',
    'border-radius:8px;background:rgba(0,0,0,.08);font-size:20px;line-height:1;cursor:pointer}',
    'button:focus-visible{outline:2px solid currentColor;outline-offset:2px}',
  ].join('');

  let host = null;
  let noteTimer = 0;
  function removeNote() { if (host) { host.remove(); host = null; } }

  function note(text, kind, opts) {
    removeNote();
    clearTimeout(noteTimer);
    host = document.createElement('emw-note');
    const root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    const style = document.createElement('style');
    style.textContent = NOTE_CSS;
    root.appendChild(style);

    const box = document.createElement('div');
    box.className = 'note' + (kind ? ' ' + kind : '');
    box.setAttribute('role', 'status');
    const msg = document.createElement('span');
    msg.textContent = text;
    if (opts && opts.link) {
      const a = document.createElement('a');
      a.href = opts.link.href;
      a.textContent = opts.link.text;
      msg.appendChild(document.createTextNode(' '));
      msg.appendChild(a);
    }
    box.appendChild(msg);
    const close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', '닫기');
    close.textContent = '×';
    close.addEventListener('click', removeNote);
    box.appendChild(close);
    root.appendChild(box);
    document.body.appendChild(host);

    if (!opts || !opts.sticky) noteTimer = setTimeout(removeNote, 5000);
  }

  /* 여러 형태의 내용을 [항목, 값] 목록으로 정리 */
  function normalize(content) {
    let pairs;
    if (content == null) pairs = [];
    else if (Array.isArray(content)) pairs = content.map((p) => (Array.isArray(p) ? [p[0], p[1]] : ['내용', p]));
    else if (typeof content === 'object') pairs = Object.keys(content).map((k) => [k, content[k]]);
    else pairs = [['내용', content]];
    return pairs
      .map(([k, v]) => [
        String(k == null ? '' : k).trim(),
        v != null && typeof v === 'object' ? JSON.stringify(v) : String(v == null ? '' : v).trim(),
      ])
      .filter(([k, v]) => k || v);
  }

  /** 로그인한 학생 정보 (없으면 null) */
  function student() {
    const s = EMW.getSession();
    if (!s || s.role !== 'student') return null;
    return EMW.parseStudentId(s.id);
  }

  /**
   * 선생님께 기록 보내기
   * content: { '항목': '값' } 또는 [['항목', '값'], ...] 또는 글자
   * options.successMessage: 제출 뒤 보여 줄 문구
   * 돌려주는 값: { ok: true } 또는 { ok: false, error: '…' }
   */
  async function submit(content, options) {
    const opts = options || {};
    const session = EMW.getSession();
    if (!session) {
      note(EMW.message('NO_LOGIN'), 'err', { link: { href: loginUrl, text: '로그인하러 가기' }, sticky: true });
      return { ok: false, error: 'NO_LOGIN' };
    }
    if (session.role === 'teacher') {
      note('선생님 계정이라 제출 내용을 저장하지 않았어요. (미리보기)', 'warn');
      return { ok: false, error: 'TEACHER' };
    }
    if (!activityId) {
      note(EMW.message('BAD_ACTIVITY'), 'err');
      return { ok: false, error: 'BAD_ACTIVITY' };
    }
    const data = normalize(content);
    if (!data.length) {
      note(EMW.message('EMPTY_RECORD'), 'err');
      return { ok: false, error: 'EMPTY_RECORD' };
    }
    if (busy) return { ok: false, error: 'BUSY' };

    busy = true;
    note('선생님께 보내는 중…');
    const app = findApp();
    const res = await EMW.api('submitRecord', {
      id: session.id,
      token: session.token,
      appId: activityId,
      title: app ? app.title : '',
      data,
    });
    busy = false;

    if (res.ok) {
      note(opts.successMessage || '선생님께 제출했어요.', 'ok');
    } else if (res.error === 'AUTH') {
      note(EMW.message('AUTH'), 'err', { link: { href: loginUrl, text: '다시 로그인하기' }, sticky: true });
    } else {
      note(EMW.message(res.error), 'err', { sticky: true });
    }
    return res;
  }

  /**
   * 게임용: 최고 기록만 보내기
   *   EMWActivity.submitBest('점수', 1200, { unit: '점' });
   * 이 학생이 이 기기에서 낸 기록 중 가장 높을 때만 선생님께 보내요.
   * (다른 기기에서 낸 기록과 비교해 가장 높은 값은 선생님 화면에서 골라 보여 줘요)
   */
  async function submitBest(label, value, options) {
    const opts = options || {};
    const num = Number(value);
    if (!isFinite(num) || num <= 0) return { ok: false, error: 'NOT_BEST' };

    const session = EMW.getSession();
    if (!session || session.role !== 'student') return submit({ [label]: num });   // 안내만 보여 줘요

    const key = 'emw.best.' + session.id + '.' + activityId;
    let prev = 0;
    try { prev = Number(localStorage.getItem(key)) || 0; } catch (e) { /* 무시 */ }
    if (num <= prev) return { ok: false, error: 'NOT_BEST', best: prev };

    const unit = opts.unit || '';
    const res = await submit({ [label]: num }, { successMessage: `새 최고 기록 ${num}${unit}! 선생님께 보냈어요.` });
    if (res.ok) {
      try { localStorage.setItem(key, String(num)); } catch (e) { /* 무시 */ }
    }
    return res;
  }

  /* 로그인하지 않고 열었을 때 미리 알려 주기 */
  function warnIfLoggedOut() {
    if (EMW.getSession()) return;
    note('로그인하지 않은 상태라 기록이 제출되지 않아요.', 'warn', {
      link: { href: loginUrl, text: '로그인하러 가기' },
      sticky: true,
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', warnIfLoggedOut);
  else warnIfLoggedOut();

  return { submit, submitBest, student, activityId };
})();
