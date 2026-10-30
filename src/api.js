import PocketBase from 'pocketbase';
import { activeComment } from './queue.js';

export const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL || window.location.origin);
pb.autoCancellation(false);
const pendingFilter = 'status = "pending" || status = "sending" || status = "uncertain"';
const historyFilter = 'status = "answered" || status = "ignored"';
const normalize = record => ({ ...record, reply: record.reply || null, repliedAt: record.repliedAt ? Date.parse(record.repliedAt) : null });

export async function snapshot(queuePage, historyPage, previous = []) {
  const comments = pb.collection('comments');
  const [waiting, answered, connection] = await Promise.all([
    comments.getList(queuePage, 50, { filter: pendingFilter, sort: 'queueOrder' }),
    comments.getList(historyPage, 50, { filter: historyFilter, sort: '-repliedAt,-queueOrder' }),
    pb.send('/api/desa/status', { method: 'GET' }),
  ]);
  const safeQueuePage = Math.min(queuePage, Math.max(1, waiting.totalPages));
  const safeHistoryPage = Math.min(historyPage, Math.max(1, answered.totalPages));
  if (safeQueuePage !== queuePage || safeHistoryPage !== historyPage) return snapshot(safeQueuePage, safeHistoryPage, previous);
  const scene = queuePage === 1 ? waiting : await comments.getList(1, 8, { filter: pendingFilter, sort: 'queueOrder' });
  const waitingItems = scene.items.map(normalize);
  const missing = previous.filter(item => !waitingItems.some(next => next.id === item.id));
  const completed = await Promise.all(missing.map(item => comments.getOne(item.id).then(normalize).catch(error => {
    if (error.status === 404) return null;
    throw error;
  })));
  return {
    waiting: waitingItems.filter(activeComment), queueItems: waiting.items.map(normalize), answered: answered.items.map(normalize),
    pendingTotal: waiting.totalItems, answeredTotal: answered.totalItems,
    queuePage, historyPage, queuePages: Math.max(1, waiting.totalPages), historyPages: Math.max(1, answered.totalPages),
    connection, completed: completed.filter(Boolean),
  };
}

export const syncComments = () => pb.send('/api/desa/sync', { method: 'POST' });
export const sendReply = (id, text) => pb.send(`/api/desa/comments/${encodeURIComponent(id)}/reply`, { method: 'POST', body: { text } });
export const errorMessage = error => error.status === 0 ? 'Server belum terhubung. Pastikan PocketBase berjalan.' : error.response?.message || 'Permintaan gagal. Coba lagi.';
