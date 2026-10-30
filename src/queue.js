export const emptyState = () => ({ waiting: [], queueItems: [], answered: [], pendingTotal: 0, answeredTotal: 0, queuePage: 1, historyPage: 1, queuePages: 1, historyPages: 1 });
export const queue = state => state.waiting;
export const history = state => state.answered;
export const activeComment = comment => ['pending', 'sending', 'uncertain'].includes(comment.status);

export function departedComments(previous, next, completed, alreadyLeaving = []) {
  const present = new Set([...next, ...alreadyLeaving].map(comment => comment.id));
  return previous.filter(comment => !present.has(comment.id))
    .map(comment => completed.find(item => item.id === comment.id))
    .filter(comment => comment?.status === 'answered');
}

export function sourceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['instagram.com', 'www.instagram.com'].includes(url.hostname) ? url.href : null;
  } catch { return null; }
}
