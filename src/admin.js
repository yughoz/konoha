import './style.css';
import { emptyState, queue, history, activeComment } from './queue.js';
import { pb, snapshot, syncComments, sendReply, errorMessage } from './api.js';

const $ = selector => document.querySelector(selector);
let state = emptyState();
let admin = false;
let connected = false;
let connectionError = '';
let syncBusy = false;
let replyBusy = false;
let queuePage = 1;
let historyPage = 1;
let draftTarget = null;
let refreshInFlight = null;
let refreshAgain = false;
let simulation = new URLSearchParams(location.search).get('simulasi') === '1';
let simulationComments = [];
let simulationIndex = 0;
let simulationTimer = null;
const samples = [['Budi Santoso', 'Pak Kades, boleh bikin taman bunga di sini?'], ['Siti Aminah', 'Usul warung kopi supaya warga bisa ngobrol sore.'], ['Agus Pratama', 'Lapangan bola kecil seru juga, Pak!']];

function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('is-visible'); clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#toast').classList.remove('is-visible'), 4200); }

function renderList() {
  const waiting = state.queueItems || [];
  const answered = state.answered || [];
  $('#queue-list').replaceChildren(...waiting.map((comment, index) => {
    const row = document.createElement('button');
    row.type = 'button'; row.className = `admin-row${index === 0 ? ' is-head' : ''}`;
    row.innerHTML = `<strong>${escapeHtml(comment.name || 'Warga')}</strong><span>${escapeHtml(comment.text || '')}</span>`;
    row.addEventListener('click', () => selectComment(comment));
    return row;
  }));
  $('#activity-list').replaceChildren(...answered.map(comment => {
    const item = document.createElement('article'); item.className = 'history-row';
    item.innerHTML = `<strong>${escapeHtml(comment.name || 'Warga')}</strong><p>${escapeHtml(comment.text || '')}</p><blockquote>${escapeHtml(comment.reply || (comment.status === 'ignored' ? 'Dilewati di sumber' : 'Sudah selesai di sumber'))}</blockquote>`;
    return item;
  }));
  $('#empty-queue').hidden = waiting.length > 0;
  $('#empty-history').hidden = answered.length > 0;
}

function escapeHtml(value) { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }
function selectComment(comment) {
  if (!admin) { $('#login-dialog').showModal(); return; }
  if (comment.id !== queue(state)[0]?.id) { toast('Balasan dikirim untuk warga terdepan.'); return; }
  draftTarget = comment.id;
  $('#reply-target').textContent = comment.name || 'Warga berikutnya';
  $('#reply-input').value = comment.reply || '';
  $('#reply-error').textContent = '';
  $('#reply-area').hidden = false;
  $('#reply-input').focus();
}

function render() {
  const head = queue(state)[0];
  $('#queue-count').textContent = state.pendingTotal;
  $('#answered-count').textContent = state.answeredTotal;
  $('#connection-label').textContent = connected ? 'Desa tersambung' : 'Menghubungkan…';
  $('#reply-area').hidden = !admin || !head;
  $('#logout').hidden = !admin;
  if (head && draftTarget !== head.id) { draftTarget = head.id; $('#reply-target').textContent = head.name || 'Warga berikutnya'; $('#reply-input').value = head.reply || ''; }
  const blocked = !admin || !connected || replyBusy || !head || head.status !== 'pending';
  $('#reply-submit').disabled = blocked;
  $('#reply-input').disabled = replyBusy;
  $('#reply-state').textContent = head?.status === 'sending' ? 'Balasan sedang dikirim ke Instagram…' : head?.status === 'uncertain' ? 'Status belum pasti. Sinkronkan untuk memeriksa.' : '';
  $('#reply-count').textContent = `${$('#reply-input').value.length}/500`;
  $('#sync-button').disabled = !admin || syncBusy || !connected;
  $('#sync-label').textContent = syncBusy ? 'Menyinkronkan…' : 'Sinkronkan sekarang';
  renderList();
  for (const type of ['queue', 'history']) {
    const page = state[`${type}Page`] || 1; const pages = state[`${type}Pages`] || 1;
    $(`#${type}-pagination`).hidden = pages <= 1; $(`#${type}-page`).textContent = `${page} / ${pages}`;
    $(`#${type}-prev`).disabled = page <= 1; $(`#${type}-next`).disabled = page >= pages;
  }
}

async function refresh() {
  if (simulation) { renderSimulation(); return; }
  if (refreshInFlight) { refreshAgain = true; return refreshInFlight; }
  refreshInFlight = (async () => {
    do {
      refreshAgain = false;
      const requestedQueue = queuePage; const requestedHistory = historyPage;
      try {
        const next = await snapshot(requestedQueue, requestedHistory, queue(state).slice(0, 8));
        if (queuePage !== requestedQueue || historyPage !== requestedHistory) { refreshAgain = true; continue; }
        state = next; connected = true; connectionError = ''; render();
      } catch (error) { connected = false; connectionError = errorMessage(error); $('#storage-note').hidden = false; $('#storage-note').textContent = connectionError; render(); }
    } while (refreshAgain);
  })();
  try { await refreshInFlight; } finally { refreshInFlight = null; }
}

function renderSimulation() {
  const waiting = simulationComments.filter(comment => comment.status === 'pending');
  const answered = simulationComments.filter(comment => comment.status === 'answered').slice().reverse();
  state = { ...emptyState(), waiting, queueItems: waiting, answered, pendingTotal: waiting.length, answeredTotal: answered.length, connection: { configured: true }, queuePage: 1, historyPage: 1, queuePages: 1, historyPages: 1 };
  connected = true; admin = true; render();
}
function addSimulationComment() { const [name, text] = samples[simulationIndex % samples.length]; simulationIndex += 1; simulationComments.push({ id: `simulation-${simulationIndex}`, name, text, status: 'pending', reply: null }); renderSimulation(); }
function stopSimulation() { clearInterval(simulationTimer); simulationTimer = null; }

$('#sync-button').addEventListener('click', async () => {
  if (simulation) { addSimulationComment(); return; }
  if (!admin || syncBusy) return;
  syncBusy = true; render();
  try { await syncComments(); await refresh(); toast('Komentar Instagram sudah disinkronkan.'); }
  catch (error) { if (error.status === 401) pb.authStore.clear(); toast(errorMessage(error)); }
  finally { syncBusy = false; render(); }
});
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = $('#login-form button'); button.disabled = true; $('#login-error').textContent = '';
  try { await pb.collection('admins').authWithPassword($('#username').value.trim(), $('#password').value); $('#login-dialog').close(); $('#login-form').reset(); toast('Selamat datang, Pak Kades.'); await refresh(); }
  catch (error) { $('#login-error').textContent = error.status === 400 ? 'Email atau kata sandi tidak cocok.' : errorMessage(error); }
  finally { button.disabled = false; }
});
$('#login-close').addEventListener('click', () => $('#login-dialog').close());
$('#logout').addEventListener('click', () => { pb.authStore.clear(); admin = false; render(); toast('Sudah keluar dari ruang Pak Kades.'); });
$('#reply-input').addEventListener('input', () => { $('#reply-count').textContent = `${$('#reply-input').value.length}/500`; $('#reply-error').textContent = ''; });
$('#reply-form').addEventListener('submit', async event => {
  event.preventDefault(); const text = $('#reply-input').value.trim(); const target = queue(state)[0]?.id;
  if (!target || !text || text.length > 500 || replyBusy) return;
  replyBusy = true; render();
  try {
    if (simulation) { const comment = simulationComments.find(item => item.id === target); if (!comment) throw new Error('Warga tidak ditemukan.'); comment.status = 'answered'; comment.reply = text; renderSimulation(); toast('Balasan simulasi tersimpan lokal.'); return; }
    const result = await sendReply(target, text); await refresh(); toast(result.comment?.externalReplyId ? 'Balasan terkirim ke Instagram.' : 'Komentar sudah selesai di Instagram.');
  } catch (error) { $('#reply-error').textContent = simulation ? error.message : errorMessage(error); }
  finally { replyBusy = false; render(); }
});
$('#sim-button').addEventListener('click', () => { if (!simulation) { const url = new URL(location.href); url.searchParams.set('simulasi', '1'); location.href = url.href; return; } if (simulationTimer) stopSimulation(); else { addSimulationComment(); simulationTimer = setInterval(addSimulationComment, 3000); } });
$('#sim-reset').addEventListener('click', () => { stopSimulation(); simulationComments = []; simulationIndex = 0; renderSimulation(); });
for (const type of ['queue', 'history']) for (const [direction, delta] of [['prev', -1], ['next', 1]]) $(`#${type}-${direction}`).addEventListener('click', () => { if (type === 'queue') queuePage = Math.max(1, (state.queuePage || 1) + delta); else historyPage = Math.max(1, (state.historyPage || 1) + delta); refresh(); });

pb.authStore.onChange(() => { admin = pb.authStore.isValid && pb.authStore.record?.collectionName === 'admins'; render(); if (admin) refresh(); }, true);
pb.realtime.onDisconnect = () => { connected = false; render(); };
pb.collection('comments').subscribe('*', () => refresh()).catch(() => {});
pb.realtime.subscribe('PB_CONNECT', () => refresh()).catch(() => {});
window.addEventListener('online', refresh); document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
setInterval(() => { if (!document.hidden) refresh(); }, 15000);
if (simulation) { $('#sim-reset').hidden = false; addSimulationComment(); addSimulationComment(); simulationTimer = setInterval(addSimulationComment, 3000); }
else if (!admin) $('#login-dialog').showModal();
render(); refresh();
