const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeProjectFolder } = require('../telegram/bot-rerun');

test('normalizeProjectFolder resolves project-relative folder shortcuts', () => {
  assert.equal(normalizeProjectFolder('prj/inema', 'imgs/novo_album'), 'prj/inema/imgs/novo_album');
  assert.equal(normalizeProjectFolder('prj/inema', 'assets/fotos'), 'prj/inema/assets/fotos');
  assert.equal(normalizeProjectFolder('prj/inema', 'novo_album'), 'prj/inema/imgs/novo_album');
  assert.equal(normalizeProjectFolder('prj/inema', 'prj/outro/imgs/base'), 'prj/outro/imgs/base');
});
