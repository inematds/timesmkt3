const test = require('node:test');
const assert = require('node:assert/strict');

const { getEnv, getList } = require('../config/env');
const { validatePayload, validateAgentGraph } = require('../pipeline/orchestrator');

test('validateAgentGraph passes for the current agent graph', () => {
  assert.deepEqual(validateAgentGraph(), []);
});

test('validateAgentGraph reports unknown dependencies', () => {
  const errors = validateAgentGraph([
    { name: 'alpha', dependencies: [] },
    { name: 'beta', dependencies: ['missing_agent'] },
  ]);

  assert.equal(errors.length, 1);
  assert.match(errors[0], /missing_agent/);
});

test('validatePayload reports required fields', () => {
  const errors = validatePayload({});

  assert.ok(errors.some(err => err.includes('task_name')));
  assert.ok(errors.some(err => err.includes('task_date')));
  assert.ok(errors.some(err => err.includes('platform_targets')));
  assert.ok(errors.some(err => err.includes('project_dir')));
});

test('env helpers read process env and parse comma-separated lists', () => {
  process.env.CODEX_TEST_SINGLE = 'value-123';
  process.env.CODEX_TEST_LIST = 'one, two , ,three';

  assert.equal(getEnv('CODEX_TEST_SINGLE'), 'value-123');
  assert.deepEqual(getList('CODEX_TEST_LIST'), ['one', 'two', 'three']);

  delete process.env.CODEX_TEST_SINGLE;
  delete process.env.CODEX_TEST_LIST;
});
