// Ada Steady engine. Holds the active dataset (sample or imported) and computes
// the pay engine, 13-week forecast, lender score and exports from it.

export const START = -12, END = 51, NW = END - START + 1, OFF = -START, H = 13, RUNS = 2000;
const DAY = 864e5;

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- active dataset (live ES-module bindings) ----------
export let CLIENTS = [];   // {name, kind, late}  late = usual days late after due
export let INVOICES = [];  // {id, c, amt, issue(week), terms(days), jit(days vs client usual), open(bool)}
export let TODAY = new Date(2026, 10, 12);
export let DATASET = { name: '', note: '' };
let POOLS = [];

export function setDataset(ds) {
  CLIENTS = ds.clients; INVOICES = ds.invoices; TODAY = ds.today; DATASET = { name: ds.name, note: ds.note || '' };
  POOLS = CLIENTS.map((c, k) => {
    const mine = INVOICES.filter((v) => v.c === k);
    const paid = mine.filter((v) => !v.open);
    const terms = mine.map((v) => v.terms).sort((a, b) => a - b);
    return {
      jits: paid.length ? paid.map((v) => v.jit) : [0],
      amts: mine.length ? mine.map((v) => v.amt) : [0],
      rate: mine.length / NW,
      terms: terms.length ? terms[terms.length >> 1] : 14,
    };
  });
}
export const defaults = () => ({ tax: 25, cost: 30, win: 8, extra: CLIENTS.map(() => 0), added: [], fund: { on: false, fee: 2, max: 6000 } });

// When a sample/imported invoice gets paid (week index). Open invoices are never paid inside the history.
export const lateDays = (inv, extra) => Math.max(0, CLIENTS[inv.c].late + extra + inv.jit);
export const payWeekOf = (inv, s) => {
  if (inv.open) return Infinity;
  const ex = inv.issue >= 0 ? s.extra[inv.c] || 0 : 0;
  return inv.issue + Math.ceil((inv.terms + lateDays(inv, ex)) / 7);
};
const simPayWeek = (issue, c, terms, jit, extra) => issue + Math.ceil((terms + Math.max(0, CLIENTS[c].late + extra + jit)) / 7);

// ---------- built-in datasets ----------
function sampleMaya() {
  const clients = [
    { name: 'Northwind Coffee', kind: 'Retainer', late: 2 },
    { name: 'Lumen Health', kind: 'Projects', late: 18 },
    { name: 'Fernway Hotels', kind: 'Projects', late: 8 },
    { name: 'Kite & Co', kind: 'Projects', late: 0 },
    { name: 'Orbit Studio', kind: 'Projects', late: 30 },
  ];
  const rnd = mulberry32(52), invoices = [];
  for (let w = START; w <= END; w++) {
    if ((w - START) % 4 === 0) invoices.push({ c: 0, amt: 3200, issue: w, terms: 14, jit: Math.round(rnd() * 4) });
    if (rnd() < 0.36) {
      const r = rnd(), c = r < 0.28 ? 1 : r < 0.52 ? 2 : r < 0.8 ? 3 : 4;
      invoices.push({ c, amt: Math.round((1400 + rnd() * rnd() * 9500) / 50) * 50, issue: w, terms: 14, jit: Math.round((rnd() - 0.35) * 12) });
    }
  }
  invoices.forEach((v, k) => (v.id = 'INV-' + String(1001 + k)));
  return { name: 'Maya Okafor Studio', note: 'Brand design · sample data', clients, invoices, today: new Date(2026, 10, 12) };
}

// ---------- dataset <-> spreadsheet rows ----------
const fmtISO = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
export const weekToDate = (w, today = TODAY) => new Date(today.getTime() - (51 - w) * 7 * DAY);

// Rows a user could re-import: one per invoice.
export function datasetToRows(ds) {
  const rows = [];
  for (const v of ds.invoices) {
    const issued = weekToDate(v.issue, ds.today), due = new Date(issued.getTime() + v.terms * DAY);
    const late = Math.max(0, ds.clients[v.c].late + v.jit);
    const paid = new Date(due.getTime() + late * DAY);
    rows.push({ 'Invoice ID': v.id, Client: ds.clients[v.c].name, 'Invoice date': fmtISO(issued), 'Due date': fmtISO(due), Amount: v.amt, 'Paid date': v.open || paid > ds.today ? '' : fmtISO(paid) });
  }
  return rows;
}

function toDate(x) {
  if (x == null || x === '') return null;
  if (x instanceof Date) return isNaN(x) ? null : new Date(x.getFullYear(), x.getMonth(), x.getDate());
  if (typeof x === 'number') { const d = new Date(Math.round((x - 25569) * DAY)); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); } // Excel serial
  const s = String(x).trim(); if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
  return isNaN(d) ? null : d;
}
function toNum(x) { if (typeof x === 'number') return x; const n = parseFloat(String(x ?? '').replace(/[$,£€\s]/g, '')); return isNaN(n) ? null : n; }
const pick = (row, names) => { for (const k of Object.keys(row)) { const n = k.toLowerCase().replace(/[^a-z]/g, ''); if (names.includes(n)) return row[k]; } return undefined; };

// Turn spreadsheet rows into a dataset. Returns {ds} or {error}.
export function rowsToDataset(rows, name) {
  const errors = [], recs = [];
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const has = (names) => keys.some((k) => names.includes(k.toLowerCase().replace(/[^a-z]/g, '')));
  const missing = [['Client', ['client', 'customer', 'clientname', 'customername']], ['Amount', ['amount', 'total', 'invoiceamount', 'amountdue', 'value']], ['Invoice date', ['invoicedate', 'issued', 'issuedate', 'date', 'dateissued', 'invoiced']]].filter(([, n]) => !has(n)).map(([l]) => l);
  if (rows.length && missing.length) return { error: `Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Found: ${keys.slice(0, 6).join(', ') || 'none'}. Use the template for the expected layout.` };
  rows.forEach((r, k) => {
    const client = String(pick(r, ['client', 'customer', 'clientname', 'customername']) ?? '').trim();
    const amount = toNum(pick(r, ['amount', 'total', 'invoiceamount', 'amountdue', 'value']));
    const issued = toDate(pick(r, ['invoicedate', 'issued', 'issuedate', 'date', 'dateissued', 'invoiced']));
    let due = toDate(pick(r, ['duedate', 'due', 'datedue']));
    const paid = toDate(pick(r, ['paiddate', 'paid', 'paymentdate', 'datepaid', 'paidon']));
    const id = String(pick(r, ['invoiceid', 'invoice', 'id', 'invoicenumber', 'number']) ?? 'Row ' + (k + 2));
    if (!client && amount == null && !issued) return; // blank line
    if (!client) { errors.push(`Row ${k + 2}: missing client`); return; }
    if (amount == null || amount <= 0) { errors.push(`Row ${k + 2}: amount must be a positive number`); return; }
    if (!issued) { errors.push(`Row ${k + 2}: invoice date is missing or not a date`); return; }
    if (!due) due = new Date(issued.getTime() + 14 * DAY);
    recs.push({ id, client, amount, issued, due, paid });
  });
  if (!recs.length) return { error: errors[0] || 'No invoices found. Expected columns: Client, Invoice date, Due date, Amount, Paid date.' };
  if (errors.length > Math.max(3, recs.length * 0.2)) return { error: `${errors.length} rows could not be read. First problem: ${errors[0]}` };
  const today = new Date(Math.max(...recs.map((r) => Math.max(r.issued, r.paid || 0))));
  const names = [...new Set(recs.map((r) => r.client))];
  // usual lateness per client = median of its paid invoices' days late
  const clients = names.map((n) => {
    const ls = recs.filter((r) => r.client === n && r.paid).map((r) => Math.max(0, Math.round((r.paid - r.due) / DAY))).sort((a, b) => a - b);
    const count = recs.filter((r) => r.client === n).length;
    return { name: n, kind: count >= 10 ? 'Regular' : 'Projects', late: ls.length ? ls[ls.length >> 1] : 0 };
  });
  const invoices = [];
  let dropped = 0;
  for (const r of recs) {
    const issue = 51 - Math.floor((today - r.issued) / (7 * DAY));
    if (issue < START) { dropped++; continue; }
    const c = names.indexOf(r.client), terms = Math.max(0, Math.round((r.due - r.issued) / DAY));
    const actual = r.paid ? Math.max(0, Math.round((r.paid - r.due) / DAY)) : null;
    invoices.push({ id: r.id, c, amt: r.amount, issue, terms, jit: actual == null ? 0 : actual - clients[c].late, open: !r.paid });
  }
  const paidInWindow = invoices.filter((v) => !v.open && v.issue >= START);
  if (paidInWindow.length < 5) return { error: 'Need at least 5 paid invoices in the last 64 weeks to run the engine.' };
  const note = `${invoices.length} invoices · ${names.length} clients` + (dropped ? ` · ${dropped} older than 64 weeks left out` : '') + (errors.length ? ` · ${errors.length} row${errors.length > 1 ? 's' : ''} skipped` : '');
  return { ds: { name: name || 'Imported data', note, clients, invoices, today }, warnings: errors };
}

// ---------- formatting ----------
export const money = (x) => (x < -0.5 ? '−$' : '$') + Math.round(Math.abs(x)).toLocaleString('en-US');
export const pct = (x) => (isFinite(x) ? Math.round(x * 100) : 0) + '%';
export const kfmt = (v) => (Math.abs(v) >= 1000 ? '$' + (v / 1000).toFixed(Math.abs(v) % 1000 ? 1 : 0) + 'k' : '$' + Math.round(v));
export function niceMax(v) {
  if (!isFinite(v) || v <= 0) return 1000;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
export const dateOf = (w) => weekToDate(w).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
export const fullDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// ---------- pay engine ----------
const cvOf = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; if (!(m > 0)) return 0; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length) / m; };
export function run(s) {
  const gross = Array(NW).fill(0), recv = Array(NW).fill(0), paidList = Array.from({ length: NW }, () => []);
  for (const inv of INVOICES) {
    const pw = payWeekOf(inv, s);
    if (pw <= END) { gross[pw + OFF] += inv.amt; paidList[pw + OFF].push(CLIENTS[inv.c].name); }
    for (let w = Math.max(inv.issue, START); w < Math.min(pw, END + 1); w++) recv[w + OFF] += inv.amt;
  }
  for (const p of s.added) { gross[p.w + OFF] += p.amt; paidList[p.w + OFF].push('Recorded payment'); }
  const t = s.tax / 100, c = s.cost / 100;
  const o = { gross, recv, paidList, avg: [], tax: [], cost: [], owner: [], target: [], pay: [], before: [], buf: [], trim: [], adv: [], fee: [], repay: [], advBal: [] };
  let buf = 3000, advBal = 0, prevPay = null;
  const hist = [];
  for (let i = 0; i < NW; i++) {
    const g = gross[i], tx = g * t, cs = g * c, own = g - tx - cs;
    hist.push(own);
    const win = hist.slice(-s.win), avg = win.reduce((a, b) => a + b, 0) / win.length;
    const target = prevPay == null ? avg : Math.max(avg, prevPay * 0.92); // pay steps down at most 8%/wk
    const repay = Math.min(advBal, own); advBal -= repay;
    const before = buf;
    let avail = buf + own - repay, adv = 0, fee = 0, pay, trim = false;
    const cushion = 0.5 * target;
    if (avail - target >= cushion) pay = target;
    else {
      if (s.fund.on && recv[i] > 0) {
        adv = Math.max(0, Math.min(target + cushion - avail, s.fund.max - advBal, 0.8 * recv[i] - advBal));
        fee = (adv * s.fund.fee) / 100; advBal += adv + fee; avail += adv;
      }
      if (avail - target >= cushion - 1e-6) pay = target;
      else { pay = Math.min(target * 0.8, Math.max(0, avail)); trim = pay < target - 0.5; }
    }
    buf = avail - pay; prevPay = pay;
    o.avg.push(avg); o.tax.push(tx); o.cost.push(cs); o.owner.push(own); o.target.push(target); o.pay.push(pay);
    o.before.push(before); o.buf.push(buf); o.trim.push(trim); o.adv.push(adv); o.fee.push(fee); o.repay.push(repay); o.advBal.push(advBal);
  }
  const sl = (a) => a.slice(OFF), sum = (a) => a.reduce((x, y) => x + y, 0);
  const cvOwner = cvOf(sl(o.owner)), cvPay = cvOf(sl(o.pay));
  o.st = {
    cvOwner, cvPay, swing: cvOwner > 0 ? Math.max(0, 1 - cvPay / cvOwner) : 0, taxTotal: sum(sl(o.tax)),
    trimmed: sl(o.trim).filter(Boolean).length, minBuf: Math.min(...sl(o.buf)),
    advTotal: sum(sl(o.adv)), advCount: sl(o.adv).filter((x) => x > 0).length, feeTotal: sum(sl(o.fee)),
    payTotal: sum(sl(o.pay)), grossTotal: sum(sl(gross)), unpaid: recv[NW - 1],
  };
  return o;
}

// ---------- 13-week forecast (bootstrap Monte Carlo) ----------
// For one simulated future, the highest fixed weekly pay P that keeps the buffer >= -credit every week is
// min_k (B0 + credit + cumIncome_k) / k, so no search is needed.
export function forecast(s, o) {
  const B0 = o.buf[NW - 1] - o.advBal[NW - 1], credit = s.fund.on ? s.fund.max : 0, k1 = 1 - (s.tax + s.cost) / 100;
  const open = INVOICES.filter((inv) => payWeekOf(inv, s) > END);
  const openArr = open.map(() => new Int16Array(RUNS));
  const maxP = new Float64Array(RUNS), cums = new Array(RUNS);
  for (let r = 0; r < RUNS; r++) {
    const R = mulberry32(9000 + r), inc = new Float64Array(H);
    open.forEach((inv, j) => {
      const pool = POOLS[inv.c].jits, ex = s.extra[inv.c] || 0;
      let wk = null;
      for (let k = 0; k < 40; k++) { const pw = simPayWeek(inv.issue, inv.c, inv.terms, pool[(R() * pool.length) | 0], ex); if (pw > END) { wk = pw; break; } }
      if (wk == null) wk = END + 1 + ((R() * 4) | 0);
      const off = wk - END - 1; openArr[j][r] = Math.min(off, 999); if (off < H) inc[off] += inv.amt;
    });
    for (let w = END + 1; w <= END + H; w++) {
      for (let k = 0; k < CLIENTS.length; k++) {
        const pl = POOLS[k];
        if (!(R() < pl.rate)) continue;
        const amt = pl.amts[(R() * pl.amts.length) | 0];
        const pw = simPayWeek(w, k, pl.terms, pl.jits[(R() * pl.jits.length) | 0], s.extra[k] || 0);
        if (pw <= END + H) inc[pw - END - 1] += amt;
      }
    }
    const cum = new Float64Array(H);
    let c = 0, m = Infinity;
    for (let i = 0; i < H; i++) { c += inc[i] * k1; cum[i] = c; m = Math.min(m, (B0 + credit + c) / (i + 1)); }
    maxP[r] = Math.max(0, m); cums[r] = cum;
  }
  const sorted = Float64Array.from(maxP).sort();
  const openStats = openArr.map((a) => { const s2 = Int16Array.from(a).sort(); return { median: s2[RUNS >> 1] + 1, p4: a.filter((x) => x < 4).length / RUNS }; });
  return {
    B0, credit, open, openStats, sorted, cums,
    safe: (conf) => sorted[Math.floor((1 - conf) * (RUNS - 1))],
    coverage: (P) => { let lo = 0, hi = RUNS; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < P) lo = m + 1; else hi = m; } return (RUNS - lo) / RUNS; },
  };
}

// ---------- lender report ----------
export function lenderStats(s, o) {
  let n = 0, onTime = 0, lateSum = 0;
  const share = Array(CLIENTS.length).fill(0), lateBy = CLIENTS.map(() => [0, 0]);
  for (const v of INVOICES) {
    const pw = payWeekOf(v, s);
    if (pw < 0 || pw > END) continue;
    const dl = lateDays(v, v.issue >= 0 ? s.extra[v.c] || 0 : 0);
    n++; if (dl <= 3) onTime++; lateSum += dl; share[v.c] += v.amt; lateBy[v.c][0] += dl; lateBy[v.c][1]++;
  }
  const monthly = [];
  for (let m = 0; m < 13; m++) { let g = 0; for (let w = m * 4; w < m * 4 + 4; w++) g += o.gross[w + OFF]; monthly.push(g); }
  const mm = monthly.reduce((a, b) => a + b, 0) / 13, cvM = cvOf(monthly);
  const tot = share.reduce((a, b) => a + b, 0) || 1, top = share.indexOf(Math.max(...share)), topShare = share[top] / tot;
  const onPct = n ? onTime / n : 0, avgLate = n ? lateSum / n : 0, steady = Math.max(0, 1 - cvM);
  const pay = o.pay[NW - 1], buf = o.buf[NW - 1], weeks = buf / Math.max(1, pay);
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const parts = [
    { name: 'Payment reliability', pts: 20 * onPct, why: `${pct(onPct)} of invoices were paid within 3 days of the due date; the average was ${avgLate.toFixed(1)} days late.` },
    { name: 'Income steadiness', pts: 20 * steady, why: `Monthly income moves about ±${Math.round(cvM * 100)}% around its ${money(mm)} average.` },
    { name: 'Cash buffer', pts: 20 * clamp(weeks / 4), why: `The ${money(buf)} buffer covers ${weeks.toFixed(1)} weeks of pay${weeks < 4 ? '; 4 weeks earns full points' : ''}.` },
    { name: 'Tax reserve', pts: 20 * clamp(s.tax / 25), why: `${s.tax}% of every payment is held back for taxes${s.tax < 25 ? ', below the 25% benchmark' : ''}.` },
    { name: 'Client mix', pts: 20 * clamp((0.7 - topShare) / 0.4), why: `Largest client, ${CLIENTS[top]?.name ?? '—'}, is ${pct(topShare)} of income${topShare > 0.3 ? '; a wider client base would raise this' : ''}.` },
  ];
  const score = Math.round(parts.reduce((a, p) => a + p.pts, 0));
  const fast = CLIENTS.map((c, k) => c.late + (s.extra[k] || 0) <= 10);
  const open = INVOICES.filter((v) => payWeekOf(v, s) > END);
  const elig = open.filter((v) => fast[v.c]), eligSum = elig.reduce((a, v) => a + v.amt, 0);
  const clients = CLIENTS.map((c, k) => ({ name: c.name, total: share[k], share: share[k] / tot, n: lateBy[k][1], avgLate: lateBy[k][1] ? lateBy[k][0] / lateBy[k][1] : 0 }));
  return { n, onPct, avgLate, cvM, steady, monthly, parts, score, elig, eligSum, advance: eligSum * 0.8, fee: eligSum * 0.8 * 0.025, clients, open };
}

export function paymentsUpTo(s, cursor) {
  const list = [];
  for (const v of INVOICES) {
    const pw = payWeekOf(v, s);
    if (pw >= 0 && pw <= cursor) list.push({ w: pw, id: v.id, name: CLIENTS[v.c].name, amt: v.amt, late: lateDays(v, v.issue >= 0 ? s.extra[v.c] || 0 : 0) });
  }
  for (const p of s.added) if (p.w <= cursor) list.push({ w: p.w, id: 'Manual', name: 'Recorded payment', amt: p.amt, late: 0 });
  return list.sort((a, b) => b.w - a.w || b.amt - a.amt);
}

// Index of the client with the worst usual lateness (used by presenter mode and quick actions).
export const worstPayer = () => CLIENTS.reduce((best, c, k) => (c.late > CLIENTS[best].late ? k : best), 0);

// Built-in sample goes through the same importer as user files, so importing the
// downloadable sample spreadsheet reproduces exactly these numbers.
export const SAMPLE = (() => { const r = rowsToDataset(datasetToRows(sampleMaya()), 'Maya Okafor Studio'); r.ds.note = 'Brand design · sample data'; return r.ds; })();
setDataset(SAMPLE);
