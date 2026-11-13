// Extra test datasets, produced as spreadsheet rows so they go through the same importer as user files.
import { mulberry32 } from './engine.js';

const DAY = 864e5, TODAY = new Date(2026, 10, 12);
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const add = (d, n) => new Date(d.getTime() + n * DAY);

function make(seed, clients, weeks = 60) {
  const R = mulberry32(seed), rows = [];
  let n = 1;
  const start = add(TODAY, -weeks * 7);
  for (let w = 0; w <= weeks; w++) {
    const day = add(start, w * 7);
    for (const c of clients) {
      const due = c.every ? w % c.every === c.phase : R() < c.p;
      if (!due) continue;
      const amt = c.fixed ?? Math.round((c.min + R() * (c.max - c.min)) / 50) * 50;
      const dueDate = add(day, c.terms);
      const late = Math.max(0, Math.round(c.late + (R() - 0.5) * c.spread));
      const paid = add(dueDate, late);
      rows.push({ 'Invoice ID': c.prefix + '-' + String(n++).padStart(4, '0'), Client: c.name, 'Invoice date': iso(day), 'Due date': iso(dueDate), Amount: amt, 'Paid date': paid <= TODAY ? iso(paid) : '' });
    }
  }
  return rows;
}

// Consultant with monthly retainers that pay on time: high score, steady income.
export const steadyRows = () => make(7, [
  { name: 'Harbor Credit Union', prefix: 'HCU', every: 4, phase: 0, fixed: 4500, terms: 15, late: 1, spread: 2 },
  { name: 'Pinecrest Schools', prefix: 'PCS', every: 4, phase: 2, fixed: 3800, terms: 30, late: 3, spread: 4 },
  { name: 'Alder Logistics', prefix: 'ALD', every: 4, phase: 1, fixed: 2600, terms: 15, late: 0, spread: 2 },
  { name: 'Quill Legal', prefix: 'QL', p: 0.12, min: 1200, max: 3000, terms: 15, late: 2, spread: 4 },
]);

// Agency dependent on one slow client: concentrated, late, lumpy.
export const riskyRows = () => make(11, [
  { name: 'Vantage Media Group', prefix: 'VMG', p: 0.32, min: 5000, max: 16000, terms: 30, late: 42, spread: 30 },
  { name: 'Brightline Retail', prefix: 'BLR', p: 0.12, min: 1500, max: 4000, terms: 14, late: 12, spread: 14 },
  { name: 'Solo Coffee Co', prefix: 'SCC', p: 0.08, min: 800, max: 1600, terms: 14, late: 0, spread: 4 },
]);
