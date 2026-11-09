/* =========================================================
   日笺 · 纯本地日记本
   ========================================================= */

/* ---------------- 基础工具 ---------------- */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function cnYear(y) {
  return String(y).split('').map(d => CN_NUM[+d]).join('');
}
function cnMonth(m) {
  if (m === 10) return '十月';
  if (m === 11) return '十一月';
  if (m === 12) return '十二月';
  return CN_NUM[m] + '月';
}
function cnDay(d) {
  if (d <= 10) return d === 10 ? '十' : CN_NUM[d];
  if (d < 20) return '十' + CN_NUM[d - 10];
  if (d === 20) return '二十';
  if (d < 30) return '二十' + CN_NUM[d - 20];
  if (d === 30) return '三十';
  return '三十一';
}

function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

/* 清洗富文本：只允许写日记会用到的标签和属性，挡掉导入数据里的脚本 */
const BLOCK_TAGS = 'script,style,iframe,object,embed,link,meta,svg,math,form,input,button,textarea,select,base,noscript';
const SAFE_ATTRS = ['src', 'alt', 'data-img'];
const SAFE_SRC = /^(data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,|data:image\/svg\+xml,|https?:\/\/)/i;

function sanitizeHtml(html) {
  const box = document.createElement('div');
  box.innerHTML = html || '';
  box.querySelectorAll(BLOCK_TAGS).forEach(el => el.remove());

  box.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(a => {
      const name = a.name.toLowerCase();
      if (!SAFE_ATTRS.includes(name)) { el.removeAttribute(a.name); }
    });
    if (el.tagName === 'IMG') {
      const src = el.getAttribute('src') || '';
      if (!SAFE_SRC.test(src.trim())) el.remove();
    }
  });
  return box.innerHTML;
}

function hashPin(pin) {
  const s = 'rijian::' + pin + '::v1';
  let h1 = 0x811c9dc5, h2 = 0x1000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = ((h1 ^ c) * 16777619) >>> 0;
    h2 = (((h2 << 5) + h2) + c) >>> 0;
  }
  return h1.toString(36) + '-' + h2.toString(36);
}

function showToast(msg, ms = 2000) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove('show'), ms);
}

function showSheet({ title, items }) {
  const host = $('#sheetHost');
  host.innerHTML = '';
  const mask = document.createElement('div');
  mask.className = 'sheet-mask';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';

  if (title) {
    const t = document.createElement('div');
    t.className = 'sheet-title';
    t.textContent = title;
    sheet.appendChild(t);
  }
  items.forEach(it => {
    const b = document.createElement('button');
    b.className = 'sheet-btn' + (it.danger ? ' danger' : '') + (it.cancel ? ' cancel' : '');
    b.textContent = it.label;
    b.onclick = () => { close(); it.onClick && it.onClick(); };
    sheet.appendChild(b);
  });

  mask.appendChild(sheet);
  host.appendChild(mask);
  function close() { host.innerHTML = ''; }
  mask.addEventListener('click', e => { if (e.target === mask) close(); });
  return close;
}

/* ---------------- 数据层 ---------------- */

const DB_NAME = 'rijian-db';
let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('entries')) {
        const s = d.createObjectStore('entries', { keyPath: 'id' });
        s.createIndex('date', 'date');
        s.createIndex('updatedAt', 'updatedAt');
      }
      if (!d.objectStoreNames.contains('meta')) {
        d.createObjectStore('meta', { keyPath: 'k' });
      }
    };
    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror = e => reject(e.target.error);
  });
}

const Store = {
  all() {
    return new Promise((resolve, reject) => {
      const t = db.transaction('entries', 'readonly');
      const req = t.objectStore('entries').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },
  get(id) {
    return new Promise((resolve, reject) => {
      const t = db.transaction('entries', 'readonly');
      const req = t.objectStore('entries').get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  put(obj) {
    return new Promise((resolve, reject) => {
      const t = db.transaction('entries', 'readwrite');
      t.objectStore('entries').put(obj);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },
  del(id) {
    return new Promise((resolve, reject) => {
      const t = db.transaction('entries', 'readwrite');
      t.objectStore('entries').delete(id);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },
  clearAll() {
    return new Promise((resolve, reject) => {
      const t = db.transaction('entries', 'readwrite');
      t.objectStore('entries').clear();
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },  metaGet(k) {
    return new Promise((resolve, reject) => {
      const t = db.transaction('meta', 'readonly');
      const req = t.objectStore('meta').get(k);
      req.onsuccess = () => resolve(req.result ? req.result.v : undefined);
      req.onerror = () => reject(req.error);
    });
  },
  metaSet(k, v) {
    return new Promise((resolve, reject) => {
      const t = db.transaction('meta', 'readwrite');
      t.objectStore('meta').put({ k, v });
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  }
};

/* ---------------- 全局状态 ---------------- */

const APP_VERSION = '1.2';

const state = {
  entries: [],
  currentView: 'home',
  editingId: null,
  draft: null,
  editorReturn: 'home',
  calYear: 0,
  calMonth: 0,
  calSel: '',
  pin: null,
  lockMode: 'unlock',
  lockInput: '',
  lockTmp: '',
  failCount: 0,
  lockUntil: 0,
  lastActive: 0
};

/* =========================================================
   锁屏
   ========================================================= */

const lockEl = {
  screen: $('#lockScreen'),
  title: $('#lockTitle'),
  sub: $('#lockSub'),
  dots: $('#lockDots'),
  err: $('#lockErr'),
  cancel: $('#lockCancel')
};

function renderDots() {
  const spans = lockEl.dots.children;
  for (let i = 0; i < 4; i++) {
    spans[i].classList.toggle('on', i < state.lockInput.length);
  }
}

function setLockMode(mode, titleText, subText) {
  state.lockMode = mode;
  state.lockInput = '';
  lockEl.title.textContent = titleText;
  lockEl.sub.textContent = subText || '';
  lockEl.err.textContent = '';
  renderDots();
}

function openLock(mode, titleText, subText, onDone) {
  state.lockTmp = '';
  setLockMode(mode, titleText, subText);
  state.lockCallback = onDone;
  lockEl.cancel.classList.toggle('hidden', mode === 'unlock');
  lockEl.screen.classList.remove('hidden');
}

function closeLock() {
  lockEl.screen.classList.add('hidden');
  state.lockCallback = null;
  state.lockInput = '';
  state.lockTmp = '';
}

async function submitPin(pin) {
  const mode = state.lockMode;

  if (mode === 'unlock') {
    if (Date.now() < state.lockUntil) {
      lockEl.err.textContent = '尝试次数过多，请稍后再试';
      return;
    }
    if (hashPin(pin) === state.pin) {
      state.lastActive = Date.now();
      state.failCount = 0;
      closeLock();
      bootAfterUnlock();
    } else {
      state.failCount++;
      lockEl.err.textContent = '密码不正确';
      lockEl.dots.classList.add('shake');
      setTimeout(() => lockEl.dots.classList.remove('shake'), 420);
      if (state.failCount >= 5) {
        state.lockUntil = Date.now() + 30000;
        state.failCount = 0;
        lockEl.err.textContent = '错误次数过多，30 秒后再试';
      }
    }
    return;
  }

  if (mode === 'verify-old' || mode === 'verify-off') {
    if (hashPin(pin) === state.pin) {
      const cb = state.lockCallback;
      closeLock();
      cb && cb();
    } else {
      lockEl.err.textContent = '密码不正确';
      lockEl.dots.classList.add('shake');
      setTimeout(() => lockEl.dots.classList.remove('shake'), 420);
    }
    return;
  }

  if (mode === 'set-new') {
    state.lockTmp = pin;
    setLockMode('set-confirm', '再次输入', '确认刚才的密码');
    return;
  }

  if (mode === 'set-confirm') {
    if (pin === state.lockTmp) {
      const h = hashPin(pin);
      await Store.metaSet('pin', h);
      state.pin = h;
      const cb = state.lockCallback;
      closeLock();
      showToast('密码已设置');
      cb && cb();
    } else {
      lockEl.err.textContent = '两次输入不一致，请重来';
      lockEl.dots.classList.add('shake');
      setTimeout(() => {
        lockEl.dots.classList.remove('shake');
        state.lockTmp = '';
        setLockMode('set-new', '设置密码', '请输入 4 位数字密码');
      }, 500);
    }
  }
}

$('#keypad').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn || btn.classList.contains('blank')) return;
  const k = btn.dataset.k;
  if (!k) return;

  if (k === 'del') {
    state.lockInput = state.lockInput.slice(0, -1);
    renderDots();
    return;
  }
  if (state.lockInput.length >= 4) return;
  state.lockInput += k;
  renderDots();
  if (state.lockInput.length === 4) {
    const pin = state.lockInput;
    setTimeout(async () => {
      await submitPin(pin);
      state.lockInput = '';
      renderDots();
    }, 120);
  }
});

lockEl.cancel.addEventListener('click', () => closeLock());

/* =========================================================
   视图切换
   ========================================================= */

const views = ['home', 'calendar', 'search', 'trash', 'settings', 'editor'];

function showView(name) {
  views.forEach(v => {
    const el = $('#view-' + v);
    if (el) el.classList.toggle('hidden', v !== name);
  });
  state.currentView = name;
  $$('.drawer-item').forEach(i => i.classList.toggle('current', i.dataset.target === name));
  window.scrollTo(0, 0);
  if (name === 'home') renderHome();
  if (name === 'calendar') { if (!state.calYear) openCalendar(); renderCalendar(); }
  if (name === 'trash') renderTrash();
  if (name === 'settings') renderSettings();
  if (name === 'search') setTimeout(() => $('#searchInput').focus(), 120);
}

function openDrawer() {
  $('#drawer').classList.add('open');
  $('#drawerMask').classList.add('open');
}
function closeDrawer() {
  $('#drawer').classList.remove('open');
  $('#drawerMask').classList.remove('open');
}

$('#menuBtn').onclick = openDrawer;
$('#drawerMask').onclick = closeDrawer;
$('#drawerNew').onclick = () => { closeDrawer(); openEditor(null); };
$$('.drawer-item').forEach(item => {
  item.onclick = () => { closeDrawer(); showView(item.dataset.target); };
});
$$('[data-back]').forEach(b => b.onclick = () => showView('home'));
$('#newBtn').onclick = () => openEditor(null);

/* =========================================================
   首页
   ========================================================= */

function monthLabel(dateStr) {
  const d = parseYmd(dateStr);
  return cnYear(d.getFullYear()) + '年 ' + cnMonth(d.getMonth() + 1);
}

const _parser = new DOMParser();

function stripHtml(html) {
  if (!html) return '';
  try {
    return _parser.parseFromString(html, 'text/html').body.textContent || '';
  } catch (e) {
    return '';
  }
}

function firstImage(html) {
  if (!html) return null;
  const m = html.match(/<img[^>]+src="([^"]+)"/i);
  return m ? m[1] : null;
}

function renderHome() {
  const now = new Date();
  $('#todayBig').textContent = now.getDate();
  $('#todaySub').textContent = cnMonth(now.getMonth() + 1) + ' ｜ ' + WEEK_CN[now.getDay()];
  $('#homeMonthLabel').textContent = '';

  renderBackupBar();

  const list = state.entries
    .filter(e => !e.deleted)
    .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : b.updatedAt - a.updatedAt));

  const tl = $('#timeline');
  if (!list.length) {
    tl.innerHTML = '<div class="empty">还没有日记<br>点右上角的笔开始写</div>';
    return;
  }

  let html = '';
  let lastGroup = '';
  list.forEach(e => {
    const d = parseYmd(e.date);
    if (isNaN(d.getTime())) return;
    const g = e.date.slice(0, 7);
    if (g !== lastGroup) {
      html += '<div class="month-divider">' + monthLabel(e.date) + '</div>';
      lastGroup = g;
    }
    const img = firstImage(e.html);
    const text = stripHtml(e.html).replace(/\s+/g, ' ').trim();
    const excerptText = text.length > 90 ? text.slice(0, 90) + '…' : text;
    const time = new Date(e.createdAt || Date.now());
    html += `
      <div class="entry" data-id="${e.id}">
        <div class="date-col">
          <span class="d">${d.getDate()}</span>
          <span class="w">${WEEK_CN[d.getDay()]}</span>
          <span class="t">${pad2(time.getHours())}:${pad2(time.getMinutes())}</span>
        </div>
        <div class="body-col">
          ${e.title ? `<div class="e-title">${esc(e.title)}</div>` : ''}
          <div class="excerpt">${esc(excerptText) || '<span style="color:var(--ink-4)">（无内容）</span>'}</div>
        </div>
        ${img ? `<img class="thumb" src="${esc(img)}" alt="">` : ''}
      </div>`;
  });
  tl.innerHTML = html;

  $$('.entry', tl).forEach(el => {
    el.onclick = () => openEditor(el.dataset.id, 'home');
  });
}

function renderBackupBar() {
  const host = $('#backupBar');
  const hasEntries = state.entries.some(e => !e.deleted);
  if (!hasEntries) { host.innerHTML = ''; return; }

  const last = state.lastBackup || 0;
  const days = last ? Math.floor((Date.now() - last) / 86400000) : 999;
  if (days < 7) { host.innerHTML = ''; return; }

  host.innerHTML = `
    <div class="backup-bar">
      <span>${last ? `已经 ${days} 天没有备份了` : '还没有备份过日记'}</span>
      <button id="quickBackup">立即备份</button>
    </div>`;
  $('#quickBackup').onclick = () => exportMarkdown();
}

/* =========================================================
   编辑器
   ========================================================= */

let editorDirty = false;
let editorAutoTimer = null;

async function openEditor(id, from, dateStr) {
  if (state.currentView !== 'editor') state.editorReturn = from || state.currentView || 'home';

  state.editingId = id;
  editorDirty = false;
  clearTimeout(editorAutoTimer);
  editorAutoTimer = null;

  let entry;
  if (id) {
    entry = await Store.get(id);
    if (!entry) { showToast('日记不存在'); return; }
    entry.html = sanitizeHtml(entry.html);
  } else {
    state.draft = {
      id: uid(),
      date: dateStr || ymd(new Date()),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: '',
      html: '',
      plain: '',
      deleted: 0
    };
    entry = state.draft;
  }

  const d = parseYmd(entry.date);
  const t = new Date(entry.createdAt);

  $('#edDay').textContent = d.getDate();
  $('#edMonth').textContent = cnMonth(d.getMonth() + 1);
  $('#edYear').textContent = cnYear(d.getFullYear()) + '年';
  $('#edTime').textContent = pad2(t.getHours()) + ':' + pad2(t.getMinutes());
  $('#edWeek').textContent = WEEK_CN[d.getDay()];
  $('#edTitle').value = entry.title || '';
  $('#edBody').innerHTML = entry.html || '';
  $('#edDelete').classList.toggle('hidden', !id);

  $('#view-editor').classList.remove('hidden');
  $('#view-editor').scrollTop = 0;
  state.currentView = 'editor';

  if (!id) setTimeout(() => $('#edBody').focus(), 260);
}

function closeEditor() {
  clearTimeout(editorAutoTimer);
  editorAutoTimer = null;
  editorDirty = false;
  state.editingId = null;
  state.draft = null;
  $('#view-editor').classList.add('hidden');
  $('#edBody').blur();
  const back = state.editorReturn || 'home';
  showView(back === 'editor' ? 'home' : back);
}

/* 保存。返回值：saved / empty / empty-existing / empty-new / error */
async function saveEditor(silent) {
  const bodyEl = $('#edBody');
  const title = $('#edTitle').value.trim();
  const html = bodyEl.innerHTML.trim();
  const plain = stripHtml(html).replace(/\s+/g, ' ').trim();

  const isEmptyDoc = !title && !plain && !/<img/i.test(html);

  if (isEmptyDoc) {
    if (state.editingId) return silent ? 'empty' : 'empty-existing';
    return silent ? 'empty' : 'empty-new';
  }

  let entry;
  if (state.editingId) {
    entry = await Store.get(state.editingId);
    if (!entry) return 'error';
  } else if (state.draft) {
    entry = state.draft;
  } else {
    entry = { id: uid(), date: ymd(new Date()), createdAt: Date.now(), plain: '', deleted: 0 };
  }

  entry.title = title;
  entry.html = html;
  entry.plain = plain;
  entry.updatedAt = Date.now();

  await Store.put(entry);
  state.editingId = entry.id;
  state.draft = null;
  $('#edDelete').classList.remove('hidden');
  await refreshEntries();
  editorDirty = false;
  return 'saved';
}

async function saveAndClose() {
  const r = await saveEditor(false);
  if (r === 'saved' || r === 'empty' || r === 'empty-new') {
    closeEditor();
    if (r === 'saved') showToast('已保存');
    return;
  }
  if (r === 'empty-existing') {
    showSheet({
      title: '标题和正文都是空的，这篇日记要删掉吗？',
      items: [
        {
          label: '删掉这篇', danger: true, onClick: async () => {
            await softDelete(state.editingId);
            closeEditor();
            showToast('已移入垃圾箱');
          }
        },
        { label: '回去继续写', cancel: true, onClick: () => {} }
      ]
    });
    return;
  }
  showToast('保存失败，请重试');
}

function markDirty() {
  editorDirty = true;
  clearTimeout(editorAutoTimer);
  editorAutoTimer = setTimeout(() => {
    editorAutoTimer = null;
    if (editorDirty) saveEditor(true);
  }, 2000);
}

$('#edTitle').addEventListener('input', markDirty);
$('#edBody').addEventListener('input', markDirty);
$('#edBody').addEventListener('blur', () => {
  const el = $('#edBody');
  if (!el.textContent.trim() && !/<img/i.test(el.innerHTML)) el.innerHTML = '';
});

$('#edSave').onclick = saveAndClose;

$('#edDelete').onclick = () => {
  if (!state.editingId) return;
  showSheet({
    title: '删除后可以在垃圾箱里找回',
    items: [
      {
        label: '删除这篇日记', danger: true, onClick: async () => {
          await softDelete(state.editingId);
          closeEditor();
          showToast('已移入垃圾箱');
        }
      },
      { label: '取消', cancel: true, onClick: () => {} }
    ]
  });
};

$('#edBack').onclick = () => {
  clearTimeout(editorAutoTimer);
  editorAutoTimer = null;

  if (editorDirty) {
    showSheet({
      title: '这篇日记还没保存',
      items: [
        { label: '保存并退出', onClick: saveAndClose },
        { label: '不保存，退出', danger: true, onClick: closeEditor },
        { label: '继续写', cancel: true, onClick: () => {} }
      ]
    });
  } else {
    closeEditor();
  }
};

/* ---------------- 工具栏 ---------------- */

function focusBody() {
  const el = $('#edBody');
  el.focus();
  const sel = window.getSelection();
  if (sel && sel.rangeCount === 0) {
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
  }
}

$('#tbBold').onclick = () => { focusBody(); document.execCommand('bold'); markDirty(); };
$('#tbItalic').onclick = () => { focusBody(); document.execCommand('italic'); markDirty(); };
$('#tbList').onclick = () => { focusBody(); document.execCommand('insertUnorderedList'); markDirty(); };

$('#edBody').addEventListener('paste', e => {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text/plain');
  document.execCommand('insertText', false, text);
  markDirty();
});

/* ---------------- 图片 ---------------- */

let savedRange = null;

$('#edBody').addEventListener('keyup', saveRange);
$('#edBody').addEventListener('mouseup', saveRange);
$('#edBody').addEventListener('touchend', saveRange);

function saveRange() {
  const sel = window.getSelection();
  if (sel && sel.rangeCount && $('#edBody').contains(sel.anchorNode)) {
    savedRange = sel.getRangeAt(0).cloneRange();
  }
}

$('#tbImage').onclick = () => {
  saveRange();
  $('#imagePicker').value = '';
  $('#imagePicker').click();
};

$('#imagePicker').addEventListener('change', async e => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const dataUrl = await compressImage(file);
    insertImage(dataUrl);
  } catch (err) {
    showToast('图片处理失败');
  }
});

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth * img.naturalHeight > 50e6) {
          reject(new Error('图片分辨率过大'));
          return;
        }
        const MAX = 1400;
        let { width: w, height: h } = img;
        if (w > MAX || h > MAX) {
          const r = Math.min(MAX / w, MAX / h);
          w = Math.round(w * r);
          h = Math.round(h * r);
        }
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d');
        // JPEG 不支持透明，先铺白底，否则透明区域会变黑
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL('image/jpeg', 0.78));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function insertImage(dataUrl) {
  const body = $('#edBody');
  body.focus();

  const img = document.createElement('img');
  img.src = dataUrl;

  const sel = window.getSelection();
  if (savedRange && body.contains(savedRange.startContainer)) {
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }

  if (sel && sel.rangeCount && body.contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(img);
    const nl = document.createElement('div');
    nl.innerHTML = '<br>';
    if (img.nextSibling) {
      img.parentNode.insertBefore(nl, img.nextSibling);
    } else {
      img.parentNode.appendChild(nl);
    }
    const r2 = document.createRange();
    r2.setStartAfter(nl);
    r2.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r2);
  } else {
    body.appendChild(img);
    body.appendChild(document.createElement('br'));
  }
  markDirty();
}

/* ---------------- 删除日记 ---------------- */

async function softDelete(id) {
  const e = await Store.get(id);
  if (!e) return;
  e.deleted = 1;
  e.deletedAt = Date.now();
  await Store.put(e);
  await refreshEntries();
}

/* =========================================================
   日历
   ========================================================= */

function openCalendar() {
  const now = new Date();
  state.calYear = now.getFullYear();
  state.calMonth = now.getMonth();
  state.calSel = ymd(now);
}

$('#calPrev').onclick = () => {
  state.calMonth--;
  if (state.calMonth < 0) { state.calMonth = 11; state.calYear--; }
  renderCalendar();
};
$('#calNext').onclick = () => {
  state.calMonth++;
  if (state.calMonth > 11) { state.calMonth = 0; state.calYear++; }
  renderCalendar();
};

function renderCalendar() {
  if (!state.calYear) openCalendar();

  const y = state.calYear, m = state.calMonth;
  $('#calTitle').textContent = cnYear(y) + '年 ' + cnMonth(m + 1);

  const first = new Date(y, m, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const prevDays = new Date(y, m, 0).getDate();

  const hasSet = new Set(state.entries.filter(e => !e.deleted).map(e => e.date));
  const todayStr = ymd(new Date());

  let cells = [];
  for (let i = startPad - 1; i >= 0; i--) {
    const d = prevDays - i;
    cells.push({ d, out: true, date: ymd(new Date(y, m - 1, d)) });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ d, out: false, date: ymd(new Date(y, m, d)) });
  }
  while (cells.length % 7 !== 0) {
    const d = cells.length - startPad - daysInMonth + 1;
    cells.push({ d, out: true, date: ymd(new Date(y, m + 1, d)) });
  }

  $('#calGrid').innerHTML = cells.map(c => {
    const cls = ['cal-cell'];
    if (c.out) cls.push('out');
    if (hasSet.has(c.date)) cls.push('has');
    if (c.date === todayStr) cls.push('today');
    if (c.date === state.calSel) cls.push('sel');
    return `<div class="${cls.join(' ')}" data-date="${c.date}">${c.d}</div>`;
  }).join('');

  $$('#calGrid .cal-cell').forEach(cell => {
    cell.onclick = () => {
      state.calSel = cell.dataset.date;
      const d = parseYmd(state.calSel);
      if (d.getMonth() !== state.calMonth) {
        state.calYear = d.getFullYear();
        state.calMonth = d.getMonth();
      }
      renderCalendar();
    };
  });

  renderCalDay();
}

function renderCalDay() {
  if (!state.calSel) return;
  const d = parseYmd(state.calSel);
  $('#calDayTitle').textContent = cnMonth(d.getMonth() + 1) + cnDay(d.getDate()) + '日 · ' + WEEK_CN[d.getDay()];

  const list = state.entries
    .filter(e => !e.deleted && e.date === state.calSel)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const host = $('#calDayList');
  if (!list.length) {
    host.innerHTML = `<div class="empty" style="padding:34px 20px 26px">
      这天还没有日记<br>
      <button id="calNewBtn" style="margin-top:16px;border:1px solid var(--line-2);padding:8px 20px;border-radius:3px;font-size:13px;color:var(--ink-2);letter-spacing:1px">写一篇</button>
    </div>`;
    $('#calNewBtn').onclick = () => openEditor(null, 'calendar', state.calSel);
    return;
  }
  host.innerHTML = list.map(e => entryRow(e)).join('');
  host.querySelectorAll('.entry').forEach(el => {
    el.onclick = () => openEditor(el.dataset.id, 'calendar');
  });
}

function entryRow(e) {
  const img = firstImage(e.html);
  const text = stripHtml(e.html).replace(/\s+/g, ' ').trim();
  const ex = text.length > 80 ? text.slice(0, 80) + '…' : text;
  const d = parseYmd(e.date);
  const valid = !isNaN(d.getTime());
  const t = new Date(e.createdAt || Date.now());
  return `
    <div class="entry" data-id="${esc(e.id)}">
      <div class="date-col">
        <span class="d">${valid ? d.getDate() : ''}</span>
        <span class="w">${valid ? WEEK_CN[d.getDay()] : ''}</span>
        <span class="t">${pad2(t.getHours())}:${pad2(t.getMinutes())}</span>
      </div>
      <div class="body-col">
        ${e.title ? `<div class="e-title">${esc(e.title)}</div>` : ''}
        <div class="excerpt">${esc(ex) || '<span style="color:var(--ink-4)">（无内容）</span>'}</div>
      </div>
      ${img ? `<img class="thumb" src="${esc(img)}" alt="">` : ''}
    </div>`;
}

/* =========================================================
   搜索
   ========================================================= */

let searchTimer = null;
$('#searchInput').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 180);
});

function runSearch() {
  const q = $('#searchInput').value.trim();
  const host = $('#searchResults');
  if (!q) { host.innerHTML = ''; return; }

  const kw = q.toLowerCase();
  const res = state.entries
    .filter(e => !e.deleted)
    .map(e => ({
      e,
      title: e.title || '',
      text: e.plain !== undefined ? e.plain : stripHtml(e.html).replace(/\s+/g, ' ').trim()
    }))
    .filter(x => x.title.toLowerCase().includes(kw) || x.text.toLowerCase().includes(kw))
    .sort((a, b) => b.e.date.localeCompare(a.e.date));

  if (!res.length) {
    host.innerHTML = '<div class="empty">没有找到相关内容</div>';
    return;
  }

  const kwEsc = esc(q);
  const re = new RegExp(escapeReg(kwEsc), 'gi');

  host.innerHTML = res.map(({ e, title, text }) => {
    const idx = text.toLowerCase().indexOf(kw);
    let snippet = text;
    if (idx >= 0) {
      const s = Math.max(0, idx - 24);
      snippet = (s > 0 ? '…' : '') + text.slice(s, s + 80);
    } else {
      snippet = text.slice(0, 80);
    }
    const hlTitle = title ? esc(title).replace(re, m => `<span class="hl">${m}</span>`) : '';
    const hlSnip = esc(snippet).replace(re, m => `<span class="hl">${m}</span>`);
    return `
      <div class="entry" data-id="${esc(e.id)}">
        <div class="body-col" style="margin-left:4px">
          <div class="e-title" style="color:var(--ink-3);font-size:12px;margin-bottom:6px;font-family:var(--sans);letter-spacing:1px">${esc(e.date)} · ${hlTitle || '无标题'}</div>
          <div class="excerpt" style="-webkit-line-clamp:2">${hlSnip}</div>
        </div>
      </div>`;
  }).join('');

  host.querySelectorAll('.entry').forEach(el => {
    el.onclick = () => openEditor(el.dataset.id, 'search');
  });
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* =========================================================
   垃圾箱
   ========================================================= */

function renderTrash() {
  const list = state.entries.filter(e => e.deleted).sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
  const host = $('#trashList');

  if (!list.length) {
    host.innerHTML = '<div class="empty">垃圾箱是空的</div>';
    $('#emptyTrashBtn').style.opacity = '0.3';
    return;
  }
  $('#emptyTrashBtn').style.opacity = '1';

  host.innerHTML = list.map(e => {
    const d = parseYmd(e.date);
    const text = stripHtml(e.html).replace(/\s+/g, ' ').trim();
    return `
      <div class="entry" style="align-items:center">
        <div class="date-col">
          <span class="d">${d.getDate()}</span>
          <span class="w">${WEEK_CN[d.getDay()]}</span>
        </div>
        <div class="body-col">
          <div class="excerpt" style="-webkit-line-clamp:2">${esc(e.title || text.slice(0, 50))}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;flex-shrink:0">
          <button class="action" data-act="restore" data-id="${e.id}"
            style="font-size:12px;border:1px solid var(--line-2);padding:5px 12px;border-radius:3px;color:var(--ink-2)">恢复</button>
          <button class="action" data-act="purge" data-id="${e.id}"
            style="font-size:12px;border:1px solid rgba(138,59,40,.3);padding:5px 12px;border-radius:3px;color:var(--danger)">删除</button>
        </div>
      </div>`;
  }).join('');

  host.querySelectorAll('.action').forEach(btn => {
    btn.onclick = async e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (btn.dataset.act === 'restore') {
        const entry = await Store.get(id);
        entry.deleted = 0;
        entry.deletedAt = null;
        await Store.put(entry);
        await refreshEntries();
        renderTrash();
        showToast('已恢复');
      } else {
        showSheet({
          title: '彻底删除后无法找回',
          items: [
            { label: '彻底删除', danger: true, onClick: async () => { await Store.del(id); await refreshEntries(); renderTrash(); showToast('已删除'); } },
            { label: '取消', cancel: true, onClick: () => {} }
          ]
        });
      }
    };
  });
}

$('#emptyTrashBtn').onclick = () => {
  const list = state.entries.filter(e => e.deleted);
  if (!list.length) { showToast('垃圾箱是空的'); return; }
  showSheet({
    title: `将彻底删除 ${list.length} 篇日记，无法找回`,
    items: [{
      label: '全部删除', danger: true, onClick: async () => {
        for (const e of list) await Store.del(e.id);
        await refreshEntries();
        renderTrash();
        showToast('已清空');
      }
    }, { label: '取消', cancel: true, onClick: () => {} }]
  });
};

/* =========================================================
   设置
   ========================================================= */

async function renderSettings() {
  $('#appVersion').textContent = APP_VERSION;
  $('#lockState').textContent = state.pin ? '已开启' : '未开启';
  $('#lockState').className = 'val' + (state.pin ? ' ok' : '');

  const last = state.lastBackup || 0;
  if (!last) {
    $('#backupState').textContent = '从未';
    $('#backupState').className = 'val warn';
  } else {
    const days = Math.floor((Date.now() - last) / 86400000);
    $('#backupState').textContent = days === 0 ? '今天' : days + ' 天前';
    $('#backupState').className = 'val' + (days >= 7 ? ' warn' : ' ok');
  }

  const alive = state.entries.filter(e => !e.deleted);
  $('#statCount').textContent = alive.length + ' 篇';
  const bytes = alive.reduce((s, e) => s + (e.html || '').length + (e.title || '').length, 0);
  $('#statSize').textContent = bytes > 1024 * 1024
    ? (bytes / 1024 / 1024).toFixed(1) + ' MB'
    : Math.max(1, Math.round(bytes / 1024)) + ' KB';

  updatePersistState();
}

async function updatePersistState() {
  const el = $('#persistState');
  if (!navigator.storage || !navigator.storage.persisted) {
    el.textContent = '不支持';
    el.className = 'val';
    return;
  }
  const p = await navigator.storage.persisted();
  if (p) {
    el.textContent = '已保护';
    el.className = 'val ok';
    return;
  }
  if (navigator.storage.persist) {
    const ok = await navigator.storage.persist();
    el.textContent = ok ? '已保护' : '尽力而为';
    el.className = 'val' + (ok ? ' ok' : ' warn');
  } else {
    el.textContent = '尽力而为';
    el.className = 'val warn';
  }
}

$('#setLock').onclick = () => {
  if (!state.pin) {
    openLock('set-new', '设置密码', '请输入 4 位数字密码', () => renderSettings());
  } else {
    showSheet({
      title: '密码锁已开启',
      items: [
        { label: '修改密码', onClick: () => openLock('verify-old', '验证旧密码', '请输入当前密码', () => {
            setTimeout(() => openLock('set-new', '设置新密码', '请输入 4 位数字密码', () => renderSettings()), 260);
          })
        },
        { label: '关闭密码锁', danger: true, onClick: () => openLock('verify-off', '验证密码', '关闭前请确认是本人', async () => {
            await Store.metaSet('pin', null);
            state.pin = null;
            renderSettings();
            showToast('密码锁已关闭');
          })
        },
        { label: '取消', cancel: true, onClick: () => {} }
      ]
    });
  }
};

/* ---------------- 检查更新 ---------------- */

function compareVersion(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

async function fetchRemoteVersion() {
  // 加时间戳参数，绕过 Service Worker 和 HTTP 缓存
  const res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  return String(j.version || '').trim();
}

async function checkUpdate() {
  const el = $('#updateState');

  if (!navigator.onLine) {
    el.textContent = '需要联网';
    el.className = 'val warn';
    showToast('现在没联网，连上再检查');
    return;
  }

  el.textContent = '检查中…';
  el.className = 'val';

  let remote = '';
  try {
    remote = await fetchRemoteVersion();
  } catch (e) {
    el.textContent = '检查失败';
    el.className = 'val warn';
    showToast('检查失败，稍后再试');
    return;
  }

  if (!remote) {
    el.textContent = '检查失败';
    el.className = 'val warn';
    return;
  }

  if (compareVersion(remote, APP_VERSION) > 0) {
    el.textContent = '有新版 ' + remote;
    el.className = 'val warn';
    showSheet({
      title: `发现新版本 ${remote}，当前是 ${APP_VERSION}。更新会重新加载页面，日记数据不受影响。`,
      items: [
        { label: '立即更新', onClick: applyUpdate },
        { label: '以后再说', cancel: true, onClick: () => {} }
      ]
    });
  } else {
    el.textContent = '已是最新';
    el.className = 'val ok';
    showToast('已是最新版本 ' + APP_VERSION);
  }
}

async function applyUpdate() {
  if (!navigator.onLine) {
    showToast('需要联网才能更新');
    return;
  }
  showToast('正在更新，稍等…', 4000);
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) { try { await r.unregister(); } catch (e) {} }
    }
    if (window.caches && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k).catch(() => {})));
    }
  } catch (e) {}
  setTimeout(() => location.reload(), 450);
}

$('#checkUpdate').onclick = checkUpdate;

/* =========================================================
   导出 / 导入
   ========================================================= */

function downloadBlob(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function htmlToMarkdown(node, omitImg) {
  let out = '';
  node.childNodes.forEach(n => {
    if (n.nodeType === 3) { out += n.textContent; return; }
    if (n.nodeType !== 1) return;
    const tag = n.tagName.toLowerCase();
    const inner = htmlToMarkdown(n, omitImg);
    switch (tag) {
      case 'br': out += '\n'; break;
      case 'b': case 'strong': out += '**' + inner + '**'; break;
      case 'i': case 'em': out += '*' + inner + '*'; break;
      case 'img': {
        if (omitImg) { out += '\n\n〔图片〕\n\n'; break; }
        const src = n.getAttribute('src') || '';
        if (!src) { out += '\n\n〔图片〕\n\n'; break; }
        out += '\n\n![](' + src + ')\n\n';
        break;
      }
      case 'li': out += '- ' + inner.trim() + '\n'; break;
      case 'ul': case 'ol': out += '\n' + inner + '\n'; break;
      case 'p': case 'div': out += '\n' + inner + '\n'; break;
      case 'span': out += inner; break;
      default: out += inner;
    }
  });
  return out;
}

function buildMarkdown(list, withImages) {
  let md = '# 日笺 · 日记备份\n\n导出时间：' + new Date().toLocaleString('zh-CN') + '\n\n';
  md += '共 ' + list.length + ' 篇\n\n---\n\n';

  list.forEach(e => {
    const d = parseYmd(e.date);
    const t = new Date(e.createdAt);
    md += `## ${e.date} ${WEEK_CN[d.getDay()]} ${pad2(t.getHours())}:${pad2(t.getMinutes())}\n\n`;
    if (e.title) md += `### ${e.title}\n\n`;
    const holder = document.createElement('div');
    holder.innerHTML = e.html || '';
    let body = htmlToMarkdown(holder, !withImages);
    body = body.replace(/\n{3,}/g, '\n\n').trim();
    md += body + '\n\n---\n\n';
  });
  return md;
}

async function exportMarkdown() {
  const list = state.entries.filter(e => !e.deleted).sort((a, b) => a.date.localeCompare(b.date));
  if (!list.length) { showToast('还没有日记可以导出'); return; }

  let md = buildMarkdown(list, true);
  let note = '';

  // 带图片的备份可能非常大，手机上生成或下载会失败，超过阈值就降级
  if (md.length > 18 * 1024 * 1024) {
    md = buildMarkdown(list, false);
    note = '，图片已省略';
  }

  const name = '日笺备份-' + ymd(new Date()) + '.md';
  downloadBlob(name, md, 'text/markdown;charset=utf-8');

  state.lastBackup = Date.now();
  await Store.metaSet('lastBackup', state.lastBackup);
  renderBackupBar();
  if (state.currentView === 'settings') renderSettings();
  showToast('已导出' + note + '，请到「文件」App 查看', 3000);
}

async function exportAll() {
  const list = state.entries;
  if (!list.length) { showToast('还没有日记可以导出'); return; }
  const payload = {
    app: '日笺',
    version: 1,
    exportedAt: Date.now(),
    entries: list
  };
  const name = '日笺完整备份-' + ymd(new Date()) + '.json';
  downloadBlob(name, JSON.stringify(payload), 'application/json');

  state.lastBackup = Date.now();
  await Store.metaSet('lastBackup', state.lastBackup);
  renderBackupBar();
  if (state.currentView === 'settings') renderSettings();
  showToast('已导出完整备份');
}

$('#exportMd').onclick = exportMarkdown;
$('#exportAll').onclick = exportAll;

$('#importAll').onclick = () => {
  $('#importPicker').value = '';
  $('#importPicker').click();
};

$('#importPicker').addEventListener('change', e => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try {
      data = JSON.parse(reader.result);
    } catch (err) {
      showToast('文件格式不对');
      return;
    }
    const raw = (data && Array.isArray(data.entries)) ? data.entries : [];
    const entries = raw.filter(e =>
      e && typeof e === 'object' &&
      typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date)
    );

    if (!entries.length) { showToast('备份里没有可用的日记'); return; }

    showSheet({
      title: `备份里有 ${entries.length} 篇日记，内容相同的会被覆盖`,
      items: [{
        label: '开始恢复', onClick: async () => {
          let n = 0;
          for (const it of entries) {
            const e = {
              id: (typeof it.id === 'string' && it.id) ? it.id : uid(),
              date: it.date,
              createdAt: Number(it.createdAt) || parseYmd(it.date).getTime(),
              updatedAt: Number(it.updatedAt) || Date.now(),
              title: String(it.title || '').slice(0, 200),
              html: sanitizeHtml(String(it.html || '')),
              deleted: it.deleted ? 1 : 0,
              deletedAt: it.deletedAt || null
            };
            e.plain = stripHtml(e.html).replace(/\s+/g, ' ').trim();
            await Store.put(e);
            n++;
          }
          await refreshEntries();
          renderSettings();
          showToast(`已恢复 ${n} 篇`);
        }
      }, { label: '取消', cancel: true, onClick: () => {} }]
    });
  };
  reader.readAsText(file);
});

/* =========================================================
   启动
   ========================================================= */

async function refreshEntries() {
  state.entries = await Store.all();
  if (state.currentView === 'home') renderHome();
  if (state.currentView === 'calendar') renderCalendar();
}

async function bootAfterUnlock() {
  await refreshEntries();
  showView('home');
}

async function boot() {
  await openDB();

  const pinHash = await Store.metaGet('pin');
  state.pin = pinHash || null;
  state.lastBackup = (await Store.metaGet('lastBackup')) || 0;

  state.entries = await Store.all();

  if (state.pin) {
    openLock('unlock', '日笺', '请输入 4 位数字密码');
  } else {
    await bootAfterUnlock();
  }

  showView('home');
  updatePersistState();

  // 回到前台时若有密码，重新上锁
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.pin && lockEl.screen.classList.contains('hidden')) {
      // 打开超过 5 分钟才重新上锁，避免切换应用太烦
      if (Date.now() - (state.lastActive || 0) > 5 * 60 * 1000) {
        openLock('unlock', '日笺', '请输入 4 位数字密码');
      }
    }
    if (document.visibilityState === 'hidden') {
      state.lastActive = Date.now();
    }
  });

  window.addEventListener('popstate', () => {
    if (state.currentView === 'editor') {
      $('#edBack').click();
    } else if (state.currentView !== 'home') {
      showView('home');
    }
  });
  history.pushState({ v: 'home' }, '');

  // 键盘弹起时把工具栏顶上去
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const adjust = () => {
      const tb = $('.ed-toolbar');
      if (!tb) return;
      const gap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      tb.style.bottom = (gap + 12) + 'px';
    };
    vv.addEventListener('resize', adjust);
    vv.addEventListener('scroll', adjust);
  }
}

// 抽屉里的日历入口要先初始化月份
const origCalendarItem = $('.drawer-item[data-target="calendar"]');
origCalendarItem.addEventListener('click', () => {
  if (!state.calYear) openCalendar();
});

// 注册 service worker（离线可用）
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

boot();
