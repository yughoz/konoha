import './style.css';
import { emptyState, queue, history, departedComments, sourceUrl } from './queue.js';
import { pb, snapshot, syncComments, sendReply, errorMessage } from './api.js';
import { scene3d } from './scene3d.js';

const $ = selector => document.querySelector(selector);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const simulation = new URLSearchParams(location.search).get('simulasi') === '1';
const simulationSamples = [
  ['Budi Santoso', 'Pak Kades, boleh bikin taman bunga di sini?'],
  ['Siti Aminah', 'Usul warung kopi supaya warga bisa ngobrol sore.'],
  ['Agus Pratama', 'Lapangan bola kecil seru juga, Pak!'],
  ['Dewi Lestari', 'Pengen ada kebun sayur di sebelah rumah.'],
  ['Rizky Ramadhan', 'Jalan desanya kasih lampu ya, Pak Kades.'],
  ['Nina Kartika', 'Mau buka toko roti di desa ini.'],
];
let simulationComments = [];
let simulationIndex = 0;
let simulationTimer = null;
let state = emptyState();
let admin = false;
let connected = false;
let connectionError = '';
let syncBusy = false;
let replyBusy = false;
let exiting = null;
const departures = [];
let exitTimer;
let draftTarget = null;
let toastTimer;
let queuePage = 1;
let historyPage = 1;
let refreshing;
let refreshAgain = false;
const mobileLayout = matchMedia('(max-width: 780px)');
const panel = $('.conversation-panel');
let drawerReturnFocus;
let sceneReady = false;
let previousSceneWaiting = [];
let sceneError = '';

function initScene3d() {
  const world = $('#world');
  try {
    const result = scene3d.init(world);
    sceneReady = result !== false;
  } catch (error) {
    sceneReady = false;
    console.warn('3D scene unavailable', error);
  }
  if (sceneReady) {
    window.addEventListener('resize', () => scene3d.resize(), { passive: true });
    return;
  }
  sceneError = 'Browser ini membutuhkan WebGL untuk menjalankan Desa Komen.';
  const message = document.createElement('p');
  message.className = 'webgl-required';
  message.textContent = sceneError;
  world.replaceChildren(message);
}

function setDrawer(open, restoreFocus = true) {
  const modal = mobileLayout.matches && open;
  if (modal && !panel.classList.contains('is-open')) drawerReturnFocus = document.activeElement;
  panel.classList.toggle('is-open', modal);
  $('#mobile-panel-open').setAttribute('aria-expanded', String(modal));
  $('#drawer-backdrop').classList.toggle('is-visible', modal);
  panel.inert = mobileLayout.matches && !open;
  document.body.style.overflow = modal ? 'hidden' : '';
  if (mobileLayout.matches) {
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-hidden', String(!open));
  } else {
    panel.removeAttribute('role');
    panel.removeAttribute('aria-modal');
    panel.removeAttribute('aria-hidden');
  }
  for (const section of document.querySelectorAll('.site-header, .intro, .village-card, .simulation-card, .site-footer')) section.inert = modal;
  if (modal) {
    $('#panel-close').focus({ preventScroll: true });
  } else if (restoreFocus && mobileLayout.matches) {
    (drawerReturnFocus?.isConnected && !panel.contains(drawerReturnFocus) ? drawerReturnFocus : $('#mobile-panel-open')).focus({ preventScroll: true });
  }
}

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('is-visible'), 4500);
}

async function refresh() {
  if (simulation) { renderSimulation(); return; }
  if (refreshing) { refreshAgain = true; return refreshing; }
  refreshing = (async () => {
    do {
      refreshAgain = false;
      const requestedQueue = queuePage;
      const requestedHistory = historyPage;
      try {
        const next = await snapshot(requestedQueue, requestedHistory, queue(state).slice(0, 8));
        if (queuePage !== requestedQueue || historyPage !== requestedHistory) { refreshAgain = true; continue; }
        queuePage = next.queuePage;
        historyPage = next.historyPage;
        connected = true;
        connectionError = '';
        applyState(next);
      } catch (error) {
        connected = false;
        connectionError = errorMessage(error);
        render();
      }
    } while (refreshAgain);
  })();
  try { await refreshing; } finally { refreshing = null; }
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function variant(comment) {
  return 1 + [...comment.name].reduce((sum, letter) => sum + letter.codePointAt(0), 0) % 4;
}

function portrait(comment, className) {
  const wrapper = node('span', className);
  wrapper.dataset.variant = variant(comment);
  const image = node('img');
  image.src = `/assets/villager-${variant(comment)}.png`;
  image.alt = '';
  image.addEventListener('error', () => {
    image.hidden = true;
    wrapper.classList.add('asset-pending');
    if (!wrapper.querySelector('.portrait-initial')) wrapper.append(node('span', 'portrait-initial', comment.name[0]));
  }, { once: true });
  wrapper.append(image);
  return wrapper;
}

function openComment(comment) {
  $('#comment-name').textContent = comment.name;
  $('#comment-text').textContent = comment.text;
  const url = sourceUrl(comment.sourceUrl);
  $('#comment-source').hidden = !url;
  if (url) $('#comment-source').href = url;
  else $('#comment-source').removeAttribute('href');
  $('#comment-dialog').showModal();
}

function renderList(waiting, answered) {
  const focusId = document.activeElement?.closest('[data-comment-id]')?.dataset.commentId;
  const rows = waiting.map((comment, index) => {
    const isHead = comment.id === queue(state)[0]?.id;
    const position = (state.queuePage - 1) * 50 + index + 1;
    const row = node('button', `queue-item${isHead ? ' is-head' : ''}`);
    row.type = 'button';
    row.dataset.commentId = comment.id;
    row.setAttribute('aria-label', `${position}. ${comment.name}: ${comment.text}`);
    const copy = node('span', 'queue-copy');
    const title = node('span', 'queue-name', comment.name);
    if (isHead) title.append(node('span', 'head-tag', 'Terdepan'));
    copy.append(title, node('span', 'queue-text', comment.text));
    row.append(portrait(comment, 'queue-avatar'), copy, node('span', 'queue-number', `${position}`.padStart(2, '0')));
    row.addEventListener('click', () => openComment(comment));
    return row;
  });
  $('#queue-list').replaceChildren(...rows);
  if (focusId) [...$('#queue-list').children].find(row => row.dataset.commentId === focusId)?.focus({ preventScroll: true });
  $('#empty-queue').hidden = waiting.length > 0;
  const items = answered.map(comment => {
    const item = node('article', 'history-item');
    item.append(node('strong', 'history-name', comment.name));
    item.append(node('p', 'history-comment', comment.text));
    const reply = node('div', 'history-reply');
    if (comment.reply) reply.append(node('span', 'history-reply-label', 'Pak Kades'), node('p', '', comment.reply));
    else reply.append(node('p', '', comment.status === 'ignored' ? 'Dilewati di sumber' : 'Sudah selesai di sumber'));
    item.append(reply);
    if (comment.repliedAt) item.append(node('span', 'history-time', new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }).format(comment.repliedAt)));
    const url = sourceUrl(comment.sourceUrl);
    if (url) {
      const link = node('a', 'source-link', 'Lihat di Instagram ↗');
      link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      item.append(link);
    }
    return item;
  });
  if (!items.length) items.push(node('p', 'history-empty', 'Belum ada cerita yang terjawab. Semua obrolan yang selesai akan tersimpan di sini.'));
  $('#activity-list').replaceChildren(...items);
}

function renderScene(waiting) {
  const capacity = mobileLayout.matches ? 4 : 8;
  // The active departure owns its mesh until the walk ends; excluding it here prevents a refresh from recreating it.
  scene3d.setVillagers([...departures, ...waiting].slice(0, capacity));
  previousSceneWaiting = waiting.slice(0, capacity);
}
function render() {
  const waiting = queue(state);
  const head = waiting[0];
  $('#waiting-count').textContent = state.pendingTotal;
  $('#answered-count').textContent = state.answeredTotal;
  $('#queue-count').textContent = state.pendingTotal;
  renderList(state.queueItems, history(state));
  renderScene(waiting);
  $('#admin-summary').hidden = !admin;
  $('#locked-state').hidden = admin;
  $('#reply-area').hidden = !admin || !head;
  const blocked = !connected || replyBusy || Boolean(exiting) || departures.length > 0 || head?.status !== 'pending';
  $('#reply-submit').disabled = blocked;
  $('#reply-input').disabled = replyBusy || Boolean(exiting) || head?.status === 'sending';
  $('#reply-target').textContent = head?.name || 'Warga berikutnya';
  if (draftTarget !== head?.id) {
    $('#reply-input').value = head?.reply || '';
    $('#reply-error').textContent = '';
    draftTarget = head?.id;
  }
  $('#reply-state').textContent = head?.status === 'sending' ? 'Balasan sedang dikirim ke Instagram…'
    : head?.status === 'uncertain' ? 'Status pengiriman belum pasti. Sinkronkan untuk memeriksa; balasan tidak dikirim ulang otomatis.' : '';
  $('#reply-count').textContent = `${$('#reply-input').value.length}/500`;
  $('#admin-open').setAttribute('aria-label', admin ? 'Buka panel Pak Kades' : 'Masuk sebagai Pak Kades');
  const connection = state.connection;
  // Keep the low-poly scene's sign in sync with the provider statistic. The
  // board gracefully shows an em dash until the first successful refresh.
  const followerValue = connection?.followersCount;
  scene3d.setTotalFollowers(followerValue);
  $('#sync-button').disabled = !admin || !connected || syncBusy || Boolean(connection?.syncing) || !connection?.configured;
  $('#sync-label').textContent = syncBusy || connection?.syncing ? 'Menyinkronkan…' : 'Sinkronkan sekarang';
  const instagramReady = connected && connection?.configured && connection?.lastSync && !connection?.error;
  $('#sim-status').textContent = !connected ? 'Belum terhubung' : connection?.error ? 'Sinkronisasi tertunda' : instagramReady ? 'Instagram terhubung' : connection?.configured ? 'Memeriksa Instagram' : 'Menunggu koneksi Instagram';
  $('#sim-status').classList.toggle('is-running', Boolean(instagramReady));
  $('#connection-label').textContent = connected ? 'Desa tersambung' : 'Menghubungkan…';
  $('#sync-hint').textContent = !connected ? 'Menghubungkan desa ke server…' : !connection?.configured ? 'Koneksi Instagram belum disiapkan oleh admin.'
    : connection.lastSync ? `Semua Post/Reel @nekoding.xyz · Diperbarui ${new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(new Date(connection.lastSync))}.` : 'Semua Post/Reel @nekoding.xyz · Komentar diperiksa setiap 60 detik.';
  const note = connectionError || connection?.error || '';
  $('#storage-note').hidden = !note;
  $('#storage-note').textContent = note;
  $('#sync-login-note').hidden = admin;
  $('#sync-button').hidden = simulation;
  $('#sim-button').hidden = false;
  $('#sim-reset').hidden = !simulation;
  $('#sim-button').textContent = simulation ? simulationTimer ? 'Hentikan simulasi' : 'Mulai simulasi' : 'Coba simulasi 3D';
  if (simulation) {
    $('#sim-status').textContent = simulationTimer ? 'Simulasi berjalan' : 'Mode simulasi';
    $('#connection-label').textContent = 'Simulasi lokal';
    $('#sync-label').textContent = 'Tambah warga';
    $('#sync-title').textContent = 'Coba desa 3D tanpa koneksi.';
    $('#sync-hint').textContent = 'Warga datang tiap 3 detik saat simulasi berjalan. Balasan hanya lokal, tidak dikirim ke Instagram.';
    $('#reply-submit').firstChild.textContent = 'Balas simulasi ';
    $('#logout').firstChild.textContent = 'Keluar simulasi ';
    $('#storage-note').hidden = false;
    $('#storage-note').textContent = 'MODE SIMULASI — semua komentar dan balasan hanya di memori browser ini; tidak ada koneksi PocketBase atau Repliz.';
  }
  for (const type of ['queue', 'history']) {
    const page = state[`${type}Page`];
    const pages = state[`${type}Pages`];
    $(`#${type}-pagination`).hidden = pages <= 1;
    $(`#${type}-page`).textContent = `${page} / ${pages}`;
    $(`#${type}-prev`).disabled = page <= 1;
    $(`#${type}-next`).disabled = page >= pages;
  }
}

function animateReply(comment) {
  clearTimeout(exitTimer);
  exiting = comment;
  const duration = reducedMotion.matches ? 350 : 5400;
  if (sceneReady) scene3d.depart(comment.id, comment.reply || 'Sudah selesai di sumber');
  exitTimer = setTimeout(() => {
    exiting = null;
    if (departures.length) animateReply(departures.shift());
    render();
  }, duration);
}
function applyState(next) {
  const visibleBefore = previousSceneWaiting;
  departures.push(...departedComments(visibleBefore, next.waiting, next.completed, [...departures, ...(exiting ? [exiting] : [])]));
  state = next;
  if (!exiting && departures.length) animateReply(departures.shift());
  render();
}


function renderSimulation(completed = []) {
  const waiting = simulationComments.filter(comment => comment.status === 'pending');
  queuePage = Math.min(queuePage, Math.max(1, Math.ceil(waiting.length / 50)));
  const answered = simulationComments.filter(comment => comment.status === 'answered').slice().reverse();
  historyPage = Math.min(historyPage, Math.max(1, Math.ceil(answered.length / 50)));
  const next = {
    ...emptyState(),
    waiting: waiting.slice(0, 8), queueItems: waiting.slice((queuePage - 1) * 50, queuePage * 50),
    answered: answered.slice((historyPage - 1) * 50, historyPage * 50),
    pendingTotal: waiting.length, answeredTotal: answered.length,
    queuePage, historyPage, queuePages: Math.max(1, Math.ceil(waiting.length / 50)), historyPages: Math.max(1, Math.ceil(answered.length / 50)),
    connection: { configured: true, lastSync: new Date().toISOString(), syncing: false, followersCount: 1280 }, completed,
  };
  connected = true;
  admin = true;
  connectionError = '';
  applyState(next);
}

function addSimulationComment() {
  if (!simulation) return;
  const [name, text] = simulationSamples[simulationIndex % simulationSamples.length];
  simulationIndex++;
  simulationComments.push({ id: `simulation-${simulationIndex}`, name, text, status: 'pending', reply: null, repliedAt: null, queueOrder: simulationIndex, sourceUrl: '' });
  renderSimulation();
}

function stopSimulation() {
  clearInterval(simulationTimer);
  simulationTimer = null;
}

function resetSimulation() {
  stopSimulation();
  clearTimeout(exitTimer);
  departures.length = 0;
  exiting = null;
  simulationComments = [];
  simulationIndex = 0;
  queuePage = historyPage = 1;
  previousSceneWaiting = [];
  if (sceneReady) { scene3d.dispose(); sceneReady = false; initScene3d(); }
  renderSimulation();
}

$('#sync-button').addEventListener('click', async () => {
  if (simulation) { addSimulationComment(); return; }
  if (!admin || syncBusy) return;
  syncBusy = true;
  render();
  try {
    await syncComments();
    await refresh();
    toast('Komentar Instagram sudah disinkronkan.');
  } catch (error) {
    if (error.status === 401) pb.authStore.clear();
    toast(errorMessage(error));
    await refresh();
  } finally { syncBusy = false; render(); }
});

function openAdmin() {
  if (admin) {
    setDrawer(true);
    $('#reply-area').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'center' });
    if (!$('#reply-area').hidden) $('#reply-input').focus({ preventScroll: true });
    else toast('Sudah masuk sebagai Pak Kades. Menunggu komentar Instagram berikutnya.');
    return;
  }
  $('#login-error').textContent = '';
  $('#login-dialog').showModal();
}
$('#admin-open').addEventListener('click', openAdmin);
$('#panel-login').addEventListener('click', openAdmin);
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('#login-form button[type="submit"]');
  button.disabled = true;
  $('#login-error').textContent = '';
  try {
    if (simulation) { $('#login-dialog').close(); admin = true; setDrawer(true); render(); return; }
    await pb.collection('admins').authWithPassword($('#username').value.trim(), $('#password').value);
    $('#login-dialog').close();
    $('#login-form').reset();
    setDrawer(true);
    await refresh();
    toast('Selamat datang, Pak Kades.');
  } catch (error) {
    $('#login-error').textContent = error.status === 400 ? 'Email atau kata sandi tidak cocok.' : errorMessage(error);
  } finally { button.disabled = false; }
});
$('#logout').addEventListener('click', () => {
  if (simulation) { window.location.search = ''; return; }
  pb.authStore.clear();
  $('#reply-input').value = '';
  toast('Sudah keluar dari ruang Pak Kades.');
});

$('#reply-input').addEventListener('input', () => {
  $('#reply-count').textContent = `${$('#reply-input').value.length}/500`;
  $('#reply-error').textContent = '';
});
$('#reply-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!admin || exiting || replyBusy || queue(state)[0]?.status !== 'pending') return;
  const target = draftTarget;
  const text = $('#reply-input').value;
  replyBusy = true;
  render();
  try {
    if (simulation) {
      const comment = simulationComments.find(item => item.id === target);
      if (!comment || comment.status !== 'pending' || !text.trim() || text.trim().length > 500) throw new Error('Isi balasan wajib diisi, maksimal 500 karakter.');
      comment.status = 'answered'; comment.reply = text.trim(); comment.repliedAt = Date.now();
      renderSimulation([{ ...comment }]);
      toast('Balasan simulasi tersimpan lokal. Tidak dikirim ke Instagram.');
      return;
    }
    const result = await sendReply(target, text);
    await refresh();
    toast(result.comment?.externalReplyId ? 'Balasan terkirim ke Instagram.' : 'Komentar sudah selesai di Instagram.');
  } catch (error) {
    if (!simulation && error.status === 401) pb.authStore.clear();
    $('#reply-error').textContent = simulation ? error.message : errorMessage(error);
    await refresh();
  } finally { replyBusy = false; render(); }
});

for (const tab of $('#panel-tabs').querySelectorAll('[data-tab]')) {
  tab.addEventListener('click', () => {
    for (const button of $('#panel-tabs').querySelectorAll('[data-tab]')) {
      const selected = button === tab;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    $('#queue-tab').hidden = tab.dataset.tab !== 'queue';
    $('#history-tab').hidden = tab.dataset.tab !== 'history';
  });
}
$('#panel-tabs').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const tabs = [...$('#panel-tabs').querySelectorAll('[data-tab]')];
  const index = tabs.indexOf(document.activeElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next].click();
  tabs[next].focus();
});
$('#mobile-panel-open').addEventListener('click', () => setDrawer(true));
$('#panel-close').addEventListener('click', () => setDrawer(false));
$('#drawer-backdrop').addEventListener('click', () => setDrawer(false));
$('#sim-button').addEventListener('click', () => {
  if (!simulation) { const url = new URL(location.href); url.searchParams.set('simulasi', '1'); location.href = url.href; return; }
  if (simulationTimer) stopSimulation();
  else { addSimulationComment(); simulationTimer = setInterval(addSimulationComment, 3000); }
  render();
});
$('#sim-reset').addEventListener('click', resetSimulation);
window.addEventListener('pagehide', stopSimulation);
panel.addEventListener('keydown', event => {
  if (!mobileLayout.matches || !panel.classList.contains('is-open')) return;
  if (event.key === 'Escape') { event.preventDefault(); setDrawer(false); }
  if (event.key !== 'Tab') return;
  const focusable = [...panel.querySelectorAll('button:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')].filter(element => element.offsetParent !== null && element.tabIndex >= 0);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
});
mobileLayout.addEventListener('change', () => { setDrawer(false, false); render(); });
$('#guide-open').addEventListener('click', () => $('#guide-dialog').showModal());
for (const [id, button] of [['login', 'close'], ['guide', 'close'], ['comment', 'close']]) {
  $(`#${id}-${button}`).addEventListener('click', () => $(`#${id}-dialog`).close());
}
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
}
for (const type of ['queue', 'history']) {
  for (const [direction, delta] of [['prev', -1], ['next', 1]]) {
    $(`#${type}-${direction}`).addEventListener('click', () => {
      if (type === 'queue') queuePage = Math.max(1, state.queuePage + delta);
      else historyPage = Math.max(1, state.historyPage + delta);
      refresh();
    });
  }
}

if (!simulation) {
  pb.authStore.onChange(() => {
    admin = pb.authStore.isValid && pb.authStore.record?.collectionName === 'admins';
    render();
  }, true);
  pb.realtime.onDisconnect = () => { connected = false; render(); };
  pb.collection('comments').subscribe('*', () => refresh()).catch(() => {});
  pb.realtime.subscribe('PB_CONNECT', () => refresh()).catch(() => {});
  window.addEventListener('online', () => refresh());
  window.addEventListener('pageshow', () => refresh());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  // ponytail: snapshot tiap 15 detik memulihkan event SSE yang terlewat; ganti cursor saat trafik desa membesar.
  setInterval(() => { if (!document.hidden) refresh(); }, 15000);
  if (pb.authStore.isValid) pb.collection('admins').authRefresh().catch(error => { if ([400, 401, 403].includes(error.status)) pb.authStore.clear(); });
}
$('#panel-tabs [data-tab="history"]').tabIndex = -1;
setDrawer(false, false);
initScene3d();
if (simulation) {
  for (let index = 0; index < 3; index++) addSimulationComment();
  simulationTimer = setInterval(addSimulationComment, 3000);
  render();
} else {
  render();
  refresh();
}
