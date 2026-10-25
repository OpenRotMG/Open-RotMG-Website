import test from 'node:test';
import assert from 'node:assert/strict';
import {events} from '../public/bots/app.js';
test('bot stream parser keeps partial messages and skips keep-alive comments', () => {
  const [first, rest] = events('data: {"a":1}\n\n:\n\ndata: {"b"');
  assert.deepEqual(first, [{a: 1}]);
  assert.deepEqual(events(rest + ':2}\n\n'), [[{b: 2}], '']);
});
