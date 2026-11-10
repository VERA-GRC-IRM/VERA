const test = require('node:test');
const assert = require('node:assert/strict');

test('S6 controlled failure blocks the quality gate', () => {
  assert.fail('Intentional CI exercise; remove this file before completing the branch');
});
