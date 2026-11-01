import './style.css';
import { emptyState, queue, sourceUrl, departedComments } from './queue.js';
import { pb, snapshot, errorMessage } from './api.js';
import { scene3d } from './scene3d.js';

const $ = selector => document.querySelector(selector);
let state = emptyState();
let connected = false;
let connectionError = '';
let sceneReady = false;
let refreshInFlight = null;
let refreshAgain = false;
let queuePage = 1;
let historyPage = 1;
let previousSceneWaiting = [];
const departures = [];
let exiting = null;
let exitTimer = null;

function openComment(comment) {
  $('#comment-name').textContent = comment.name || 'Warga desa';
  $('#comment-text').textContent = comment.text || '';
  const url = sourceUrl(comment.sourceUrl);
  $('#comment-source').hidden = !url;
  if (url) $('#comment-source').href = url;
  else $('#comment-source').removeAttribute('href');
  $('#comment-dialog').showModal();
}

function render() {
  const waiting = queue(state);
  $('#waiting-count').textContent = state.pendingTotal;
  $('#answered-count').textContent = state.answeredTotal;
  $('#connection-label').textContent = connected ? 'Desa tersambung' : 'Menghubungkan…';
  $('#sim-status').textContent = connected ? 'Langsung diperbarui' : 'Menghubungkan…';
  scene3d.setTotalFollowers(state.connection?.followersCount);
  const note = connectionError || state.connection?.error || '';
  $('#storage-note').hidden = !note;
  $('#storage-note').textContent = note;
  scene3d.setVillagers([...departures, ...waiting].slice(0, 30));
}

function animateReply(comment) {
  exiting = comment;
  scene3d.depart(comment.id, comment.reply || 'Sudah selesai di sumber');
  clearTimeout(exitTimer);
  exitTimer = setTimeout(() => {
    exiting = null;
    if (departures.length) animateReply(departures.shift());
    render();
  }, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 350 : 5400);
}

function applyState(next) {
  departures.push(...departedComments(previousSceneWaiting, next.waiting, next.completed, [...departures, ...(exiting ? [exiting] : [])]));
  previousSceneWaiting = next.waiting.slice(0, 30);
  state = next;
  if (!exiting && departures.length) animateReply(departures.shift());
  render();
}

async function refresh() {
  if (refreshInFlight) { refreshAgain = true; return refreshInFlight; }
  refreshInFlight = (async () => {
    do {
      refreshAgain = false;
      const requestedQueue = queuePage;
      const requestedHistory = historyPage;
      try {
        const next = await snapshot(requestedQueue, requestedHistory, queue(state).slice(0, 30));
        if (queuePage !== requestedQueue || historyPage !== requestedHistory) { refreshAgain = true; continue; }
        applyState(next);
        queuePage = next.queuePage;
        historyPage = next.historyPage;
        connected = true;
        connectionError = '';
        render();
      } catch (error) {
        connected = false;
        connectionError = errorMessage(error);
        render();
      }
    } while (refreshAgain);
  })();
  try { await refreshInFlight; } finally { refreshInFlight = null; }
}

function initScene() {
  try {
    sceneReady = scene3d.init($('#world')) !== false;
    scene3d.setClickHandler(openComment);
  } catch (error) {
    sceneReady = false;
    console.warn('3D scene unavailable', error);
  }
  if (!sceneReady) {
    const message = $('#scene-error');
    message.hidden = false;
    message.textContent = 'Browser ini membutuhkan WebGL untuk menjalankan Desa Komen.';
  }
}

$('#recenter-button').addEventListener('click', () => scene3d.recenter?.());
$('#guide-open').addEventListener('click', () => $('#guide-dialog').showModal());
for (const [id, button] of [['guide', 'close'], ['comment', 'close']]) $(`#${id}-${button}`).addEventListener('click', () => $(`#${id}-dialog`).close());
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});

initScene();
render();
pb.realtime.onDisconnect = () => { connected = false; render(); };
pb.collection('comments').subscribe('*', () => refresh()).catch(() => {});
pb.realtime.subscribe('PB_CONNECT', () => refresh()).catch(() => {});
window.addEventListener('online', refresh);
window.addEventListener('pageshow', refresh);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
// ponytail: periodic snapshot covers an SSE event lost while a tab sleeps.
setInterval(() => { if (!document.hidden) refresh(); }, 15000);
refresh();
