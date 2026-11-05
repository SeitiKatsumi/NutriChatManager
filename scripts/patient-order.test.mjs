import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { outputFiles } = await build({ entryPoints: ['client/src/lib/patient-order.ts'], bundle: true, write: false, format: 'esm' });
const { sortPatients, formatLastInteraction } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const patients = [
  { id: 1, fullName: 'Zélia', lastInteractionAt: null, createdAt: '2026-01-01' },
  { id: 2, fullName: 'Álvaro', lastInteractionAt: '2026-11-05T15:00:00Z', createdAt: '2026-03-01' },
  { id: 3, fullName: 'Beatriz', lastInteractionAt: '2026-10-01T15:00:00Z', createdAt: '2026-02-01' },
];
const ids = order => sortPatients(patients, order).map(p => p.id);
assert.deepEqual(ids('name-asc'), [2, 3, 1]);
assert.deepEqual(ids('name-desc'), [1, 3, 2]);
assert.deepEqual(ids('interaction-desc'), [2, 3, 1]);
assert.deepEqual(ids('interaction-asc'), [3, 2, 1]);
assert.deepEqual(ids('created-desc'), [2, 3, 1]);
assert.deepEqual(ids('created-asc'), [1, 3, 2]);
assert.deepEqual(patients.map(p => p.id), [1, 2, 3]);
assert.equal(formatLastInteraction(null), 'Sem interação');
assert.equal(formatLastInteraction('invalid'), 'Sem interação');
assert.match(formatLastInteraction('2026-11-05T15:00:00Z'), /05\/11\/2026.*12:00/);
assert.deepEqual(sortPatients([{ id: 2, fullName: 'Daniel' }, { id: 1, fullName: 'Daniel' }], 'interaction-desc').map(p => p.id), [1, 2]);
console.log('Patient ordering: six sort modes, accents, missing dates last, stable ties, no mutation and Brasilia time passed.');
