const test = require('node:test');
const assert = require('node:assert/strict');

test('S6 - Controlled Failure: Deployment Quality Gate', () => {
  assert.equal(1, 2, 'Intentional failure for CI quality gate validation');
});
