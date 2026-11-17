// S6: falla controlada y temporal. Se agrega en un commit aparte y luego se revierte.
const test = require('node:test');
const assert = require('node:assert');

test('S6 controlled failure: este test debe fallar para bloquear el pipeline', () => {
  assert.strictEqual(1 + 1, 3);
});
