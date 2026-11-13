import * as XLSX from 'xlsx';
import { CLIENTS, NW, OFF, DATASET, TODAY, weekToDate, datasetToRows, fullDate } from './engine.js';

const r2 = (x) => Math.round(x * 100) / 100;
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

function sheet(rows, widths) {
  const ws = XLSX.utils.json_to_sheet(rows);
  if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }));
  return ws;
}

// Build the insights workbook from the live engine outputs.
export function buildInsightsWorkbook({ S, o, fc, ls, conf }) {
  const wb = XLSX.utils.book_new();
  const safe = fc.safe(conf);
  const summary = [
    ['Ada Steady insights', ''],
    ['Business', DATASET.name],
    ['Data', DATASET.note],
    ['Period ending', fullDate(TODAY)],
    ['Generated', fullDate(new Date())],
    ['', ''],
    ['Metric', 'Value'],
    ['Paid this week', r2(o.pay[NW - 1])],
    ['Buffer balance', r2(o.buf[NW - 1])],
    ['Weeks of pay in buffer', r2(o.buf[NW - 1] / Math.max(1, o.pay[NW - 1]))],
    ['Total received, 52 weeks', r2(o.st.grossTotal)],
    ['Total paid to owner, 52 weeks', r2(o.st.payTotal)],
    ['Tax reserve, 52 weeks', r2(o.st.taxTotal)],
    ['Income swing removed', r2(o.st.swing)],
    ['Weeks pay was trimmed', o.st.trimmed],
    ['Lowest buffer', r2(o.st.minBuf)],
    [`13-week pay floor (${Math.round(conf * 100)}% confidence)`, r2(safe)],
    ['Funding score (0-100)', ls.score],
    ['Suggested invoice advance (illustrative)', r2(ls.advance)],
    ['Advance fee at 2.5%', r2(ls.fee)],
    ['', ''],
    ['Settings', ''],
    ['Tax reserve %', S.tax], ['Business costs %', S.cost], ['Pay averaged over (weeks)', S.win],
    ['Bridge enabled', S.fund.on ? 'Yes' : 'No'], ['Bridge credit limit', S.fund.max], ['Bridge fee %', S.fund.fee],
    ['', ''],
    ['Synthetic or user-supplied data. Results show how the logic behaves, not financial advice.', ''],
  ];
  const ws0 = XLSX.utils.aoa_to_sheet(summary);
  ws0['!cols'] = [{ wch: 44 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, ws0, 'Summary');

  const weekly = [];
  for (let w = 0; w < 52; w++) {
    const i = w + OFF;
    weekly.push({
      'Week of': iso(weekToDate(w)), Received: r2(o.gross[i]), 'Tax reserve': r2(o.tax[i]), 'Business costs': r2(o.cost[i]),
      'Owner income': r2(o.owner[i]), 'Paid to owner': r2(o.pay[i]), 'Buffer after': r2(o.buf[i]),
      'Pay trimmed': o.trim[i] ? 'Yes' : '', 'Bridge advance': r2(o.adv[i]), 'Unpaid invoices': r2(o.recv[i]),
      'Paid by': [...new Set(o.paidList[i])].join(', '),
    });
  }
  XLSX.utils.book_append_sheet(wb, sheet(weekly, [12, 11, 11, 13, 13, 13, 12, 11, 13, 14, 40]), 'Weekly');

  XLSX.utils.book_append_sheet(wb, sheet(ls.clients.map((c) => ({
    Client: c.name, 'Invoices paid': c.n, 'Total received': r2(c.total), 'Share of income': r2(c.share),
    'Avg days late': r2(c.avgLate), 'Usual days late': CLIENTS.find((x) => x.name === c.name)?.late ?? '',
  })), [24, 13, 14, 15, 13, 14]), 'Clients');

  XLSX.utils.book_append_sheet(wb, sheet([
    ...ls.parts.map((p) => ({ Factor: p.name, Points: r2(p.pts), 'Out of': 20, Why: p.why })),
    { Factor: 'Total', Points: ls.score, 'Out of': 100, Why: 'No gender or protected attribute is used.' },
  ], [20, 8, 7, 90]), 'Funding score');

  XLSX.utils.book_append_sheet(wb, sheet([0.8, 0.9, 0.95, 0.99].map((c) => ({ Confidence: c, 'Weekly pay floor': r2(fc.safe(c)) })), [12, 18]), 'Forecast');

  XLSX.utils.book_append_sheet(wb, sheet(fc.open.length ? fc.open.map((v, j) => ({
    Invoice: v.id, Client: CLIENTS[v.c].name, 'Invoice date': iso(weekToDate(v.issue)), Amount: r2(v.amt),
    'Likely paid in (weeks)': fc.openStats[j].median, 'Chance paid within 4 weeks': r2(fc.openStats[j].p4),
  })) : [{ Invoice: 'None outstanding' }], [12, 22, 13, 11, 20, 24]), 'Open invoices');
  return wb;
}

export function downloadWorkbook(wb, filename) {
  const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function templateWorkbook(ds) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(datasetToRows(ds));
  ws['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 13 }, { wch: 12 }, { wch: 10 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
  return wb;
}

export async function readSpreadsheet(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
}
