import assert from 'node:assert/strict';
import { emptyState, queue, history, activeComment, departedComments, sourceUrl } from '../src/queue.js';

const a = { id: 'a', status: 'pending' };
const b = { id: 'b', status: 'pending' };
const answeredA = { ...a, status: 'answered', reply: null };
const answeredB = { ...b, status: 'answered', reply: 'Siap!' };
assert.deepEqual(queue(emptyState()), []);
assert.deepEqual(history(emptyState()), []);
for (const status of ['pending', 'sending', 'uncertain']) assert.ok(activeComment({ status }));
for (const status of ['answered', 'ignored']) assert.ok(!activeComment({ status }));
assert.deepEqual(departedComments([a, b], [b], [answeredA]), [answeredA]);
assert.deepEqual(departedComments([a, b], [], [answeredB, answeredA]), [answeredA, answeredB], 'departures preserve the visible queue order');
assert.deepEqual(departedComments([a, b], [], [answeredA, answeredB], [answeredA]), [answeredB], 'realtime duplicates do not restart an exit');
assert.deepEqual(departedComments([a], [], [{ ...a, status: 'ignored' }]), [], 'ignored comments do not invent a reply');
assert.deepEqual(departedComments([a], [], []), [], 'pagination changes alone do not trigger departures');
assert.equal(sourceUrl('https://www.instagram.com/reel/abc/?x=1'), 'https://www.instagram.com/reel/abc/?x=1');
for (const url of ['javascript:alert(1)', 'http://instagram.com/p/x', 'https://instagram.com.evil.test', 'bad', undefined]) assert.equal(sourceUrl(url), null);
console.log('Queue checks passed: server states, ordered departures, duplicate events, and safe source links.');
