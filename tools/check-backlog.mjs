import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const backlog = await readFile(new URL('tasks.md', root), 'utf8');
const tasks = [...backlog.matchAll(/^### \[[ x]\] (\d{2}-\d{2}) — (.+)$/gm)];
assert(tasks.length > 0, 'No task definitions found.');
const ids = new Set(tasks.map((task) => task[1]));
assert.equal(ids.size, tasks.length, 'Duplicate task IDs in backlog.');
const records = [
  ...backlog.matchAll(
    /^\| (\d{2}-\d{2}) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm,
  ),
];
assert.equal(
  records.length,
  tasks.length,
  'Every task needs one registry row.',
);
assert.equal(
  new Set(records.map((record) => record[1])).size,
  records.length,
  'Duplicate registry IDs.',
);
const states = new Set(['todo', 'in progress', 'blocked', 'review', 'done']);
for (const [, id, status, dependencies] of records) {
  assert(ids.has(id), `Unknown task ${id}.`);
  assert(states.has(status.trim()), `Invalid status for ${id}.`);
  for (const dependency of dependencies.match(/\d{2}-\d{2}/g) ?? []) {
    assert(ids.has(dependency), `Unknown dependency ${dependency} for ${id}.`);
    assert.notEqual(id, dependency, `${id} cannot depend on itself.`);
  }
}
const docs = [
  'docs/product/scope.md',
  'docs/product/journeys.md',
  'docs/algorithm/metrics.md',
  'docs/adr/0001-architecture.md',
  'CONTRIBUTING.md',
];
for (const path of docs) {
  const content = await readFile(new URL(path, root), 'utf8');
  assert(content.startsWith('# '), `${path} is missing its title.`);
  assert(content.length > 250, `${path} appears incomplete.`);
}
console.log(
  `Backlog check passed: ${tasks.length} unique tasks, complete status registry, ${docs.length} required documents.`,
);
