import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import * as E from './engine.js';
import { money, pct, kfmt, niceMax, dateOf, fullDate, NW, OFF, H, RUNS } from './engine.js';
import { steadyRows, riskyRows } from './samples.js';
import { buildInsightsWorkbook, downloadWorkbook, templateWorkbook, readSpreadsheet } from './exporter.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const AX = { fontSize: 12, fill: '#8a919c', fontFamily: '"IBM Plex Mono", ui-monospace, monospace' };
const W = 760, L = 50, R = 8;
const ACC = '#c9a227', POS = '#8a6a12', NEG = '#b42318', INK = '#0e1116', BAR = '#cfd4dc';

// ---------- datasets ----------
const BUILTIN = [
  { id: 'maya', label: 'Maya Okafor Studio', desc: 'Brand designer · lumpy project work', make: () => E.SAMPLE },
  { id: 'steady', label: 'Harbor Advisory', desc: 'Consultant · monthly retainers, pays on time', make: () => withNote(E.rowsToDataset(steadyRows(), 'Harbor Advisory').ds, 'Consultant · test data') },
  { id: 'risky', label: 'Northgate Creative', desc: 'Agency · one big client that pays late', make: () => withNote(E.rowsToDataset(riskyRows(), 'Northgate Creative').ds, 'Agency · test data') },
];
function withNote(ds, note) { ds.note = note; return ds; }
const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'AD';

// ---------- icons ----------
const I = {
  play: <path d="M3 1.5l9 5.5-9 5.5z" fill="currentColor" stroke="none" />,
  pause: <><rect x="3" y="2" width="3" height="10" fill="currentColor" stroke="none" /><rect x="8" y="2" width="3" height="10" fill="currentColor" stroke="none" /></>,
  present: <><rect x="1.5" y="2.5" width="13" height="9" rx="1" /><path d="M8 11.5v2.5M5 14h6" /></>,
  up: <path d="M8 11V2.5M4.5 6L8 2.5 11.5 6M2.5 13.5h11" />,
  down: <path d="M8 2.5V11M4.5 7.5L8 11l3.5-3.5M2.5 13.5h11" />,
  send: <path d="M14.5 1.5L7 9M14.5 1.5L10 14.5 7 9 1.5 6z" />,
  chev: <path d="M4 6l4 4 4-4" />,
  x: <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />,
};
const Icon = ({ n, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{I[n]}</svg>
);

const TABS = [
  { id: 'pay', label: 'Pay' }, { id: 'late', label: 'Clients' }, { id: 'funding', label: 'Bridge' },
  { id: 'forecast', label: 'Forecast' }, { id: 'lender', label: 'Lender report' },
];

// ---------- charts ----------
function IncomeChart({ o, cursor, hover, onPick, onHover }) {
  const Hh = 250, T = 10, B = 26, xw = (W - L - R) / 52, X = (i) => L + i * xw;
  const own = o.owner.slice(OFF), pay = o.pay.slice(OFF), trim = o.trim.slice(OFF);
  const ymax = niceMax(Math.max(...own, ...pay) * 1.05), Y = (v) => T + (Hh - T - B) * (1 - v / ymax);
  let d = '';
  for (let i = 0; i <= cursor; i++) d += (i ? 'L' : 'M') + (X(i) + xw / 2).toFixed(1) + ',' + Y(pay[i]).toFixed(1);
  const sel = hover ?? cursor, cx = X(sel) + xw / 2, cy = Y(pay[sel]);
  const right = cx > W - 170, txt = `${dateOf(sel)} · ${money(pay[sel])}`, bw = txt.length * 7.3 + 16;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${Hh}`} role="img" aria-label="Owner income versus paycheck" onMouseLeave={() => onHover(null)}>
      {[0, 1, 2, 3, 4].map((k) => { const v = (ymax * k) / 4; return <g key={k}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke={k ? '#eceef2' : '#cfd4dc'} /><text {...AX} x={L - 10} y={Y(v) + 4} textAnchor="end">{kfmt(v)}</text></g>; })}
      {own.map((v, i) => (
        <g key={i} onClick={() => onPick(i)} onMouseEnter={() => onHover(i)} style={{ cursor: 'pointer' }}>
          <rect x={X(i)} y={T} width={xw} height={Hh - T - B} fill={i === hover ? '#f3f4f6' : 'transparent'} />
          <rect x={X(i) + 1.5} y={Y(v)} width={Math.max(1, xw - 3)} height={Math.max(0, Y(0) - Y(v))} fill={i === sel ? INK : i > cursor ? '#e9ebef' : BAR} />
        </g>
      ))}
      <path d={d} fill="none" stroke={ACC} strokeWidth="2.5" strokeLinejoin="round" pointerEvents="none" />
      {trim.map((t, i) => (t && i <= cursor ? <circle key={i} cx={X(i) + xw / 2} cy={Y(pay[i])} r="4" fill={NEG} stroke="#fff" strokeWidth="1.5" pointerEvents="none" /> : null))}
      <g pointerEvents="none">
        <line x1={cx} x2={cx} y1={T} y2={Hh - B} stroke={INK} strokeDasharray="2 3" />
        <circle cx={cx} cy={cy} r="5" fill="#fff" stroke={ACC} strokeWidth="2.5" />
        <rect x={right ? cx - 12 - bw : cx + 12} y={Math.max(0, cy - 30)} width={bw} height="22" rx="3" fill={INK} />
        <text x={right ? cx - 12 - bw / 2 : cx + 12 + bw / 2} y={Math.max(0, cy - 30) + 15} textAnchor="middle" fontSize="12" fill="#fff" fontFamily='"IBM Plex Mono", monospace'>{txt}</text>
      </g>
      {[[0, '−52w'], [13, '−39w'], [26, '−26w'], [39, '−13w'], [51, 'now']].map(([i, t]) => <text key={i} {...AX} x={X(i) + xw / 2} y={Hh - 6} textAnchor="middle">{t}</text>)}
    </svg>
  );
}

function BufferChart({ o, cursor, sel }) {
  const Hh = 120, T = 8, B = 8, xw = (W - L - R) / 52, X = (i) => L + i * xw;
  const buf = o.buf.slice(OFF), adv = o.adv.slice(OFF), trim = o.trim.slice(OFF);
  const ymax = niceMax(Math.max(...buf, 1) * 1.1), Y = (v) => T + (Hh - T - B) * (1 - Math.max(0, v) / ymax);
  let line = '';
  for (let i = 0; i <= cursor; i++) line += (i ? 'L' : 'M') + (X(i) + xw / 2).toFixed(1) + ',' + Y(buf[i]).toFixed(1);
  const area = line + `L${X(cursor) + xw / 2},${Y(0)}L${X(0) + xw / 2},${Y(0)}Z`;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${Hh}`} role="img" aria-label="Buffer balance">
      {[0, ymax / 2, ymax].map((v, k) => <g key={k}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke={k ? '#eceef2' : '#cfd4dc'} /><text {...AX} x={L - 10} y={Y(v) + 4} textAnchor="end">{kfmt(v)}</text></g>)}
      <path d={area} fill={INK} fillOpacity=".07" />
      <path d={line} fill="none" stroke={INK} strokeWidth="1.75" />
      {buf.map((v, i) => (i <= cursor && adv[i] > 0 ? <rect key={'a' + i} x={X(i) + 2} y={Y(0) - 5} width={Math.max(1, xw - 4)} height="5" fill={POS} /> : null))}
      {buf.map((v, i) => (i <= cursor && trim[i] ? <circle key={'t' + i} cx={X(i) + xw / 2} cy={Y(v)} r="3.5" fill={NEG} stroke="#fff" strokeWidth="1.2" /> : null))}
      <line x1={X(sel) + xw / 2} x2={X(sel) + xw / 2} y1={T} y2={Hh - B} stroke={INK} strokeDasharray="2 3" />
      <circle cx={X(sel) + xw / 2} cy={Y(buf[sel])} r="4" fill="#fff" stroke={INK} strokeWidth="2" />
    </svg>
  );
}

const quant = (arr, q) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(q * (arr.length - 1))))];
function FanChart({ o, fc, P }) {
  const Hh = 250, T = 14, B = 26, n = 26, xw = (W - L - R) / n, X = (i) => L + i * xw + xw / 2;
  const hist = o.buf.slice(NW - 13);
  const bands = useMemo(() => {
    const out = [];
    for (let i = 0; i < H; i++) {
      const vals = new Float64Array(RUNS);
      for (let r = 0; r < RUNS; r++) vals[r] = fc.B0 + fc.cums[r][i] - (i + 1) * P;
      vals.sort();
      out.push([0.05, 0.25, 0.5, 0.75, 0.95].map((q) => quant(vals, q)));
    }
    return out;
  }, [fc, P]);
  const lo = Math.min(0, ...bands.map((b) => b[0])), hi = Math.max(...hist, ...bands.map((b) => b[4]), 1);
  const top = niceMax(hi * 1.05), bot = lo < 0 ? -niceMax(-lo * 1.05) : 0, Y = (v) => T + (Hh - T - B) * (1 - (v - bot) / (top - bot));
  const ticks = [0, top / 2, top];
  if (bot < 0 && Y(bot) - Y(0) > 18) ticks.unshift(bot);
  const area = (a, b) => { let d = `M${X(12)},${Y(hist[12])}`; for (let i = 0; i < H; i++) d += `L${X(13 + i)},${Y(bands[i][a])}`; for (let i = H - 1; i >= 0; i--) d += `L${X(13 + i)},${Y(bands[i][b])}`; return d + 'Z'; };
  let hd = ''; hist.forEach((v, i) => (hd += (i ? 'L' : 'M') + X(i) + ',' + Y(v)));
  let md = `M${X(12)},${Y(hist[12])}`; bands.forEach((b, i) => (md += `L${X(13 + i)},${Y(b[2])}`));
  const today = X(12), last = bands[H - 1], hitZero = bands.some((b) => b[0] < -fc.credit);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${Hh}`} role="img" aria-label="Buffer forecast">
      {ticks.map((v, k) => <g key={k}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? '#9aa1ad' : '#eceef2'} /><text {...AX} x={L - 10} y={Y(v) + 4} textAnchor="end">{(v < 0 ? '−' : '') + kfmt(Math.abs(v))}</text></g>)}
      {bot < 0 && <rect x={L} y={Y(0)} width={W - L - R} height={Y(bot) - Y(0)} fill={NEG} fillOpacity=".05" />}
      <line x1={today} x2={today} y1={T} y2={Hh - B} stroke={INK} />
      <text {...AX} x={today + 8} y={T + 10} fill={INK}>today</text>
      <path d={area(0, 4)} fill={ACC} fillOpacity=".13" />
      <path d={area(1, 3)} fill={ACC} fillOpacity=".28" />
      <path d={hd} fill="none" stroke={INK} strokeWidth="2" />
      <path d={md} fill="none" stroke={ACC} strokeWidth="2.5" />
      <text x={W - R} y={Y(last[2]) - 10} textAnchor="end" fontSize="12" fill={ACC} fontFamily='"IBM Plex Mono", monospace'>median {money(last[2])}</text>
      {hitZero && <text x={W - R} y={Hh - B - 8} textAnchor="end" fontSize="12" fill={NEG}>worst 5% of futures dip below {fc.credit ? 'the credit limit' : '$0'}</text>}
      {[[0, '−13w'], [12, 'now'], [25, '+13w']].map(([i, t]) => <text key={i} {...AX} x={X(i)} y={Hh - 6} textAnchor="middle">{t}</text>)}
    </svg>
  );
}

function CurveChart({ o, fc, P, safe, conf, onPick }) {
  const ref = useRef(null);
  const Hh = 180, T = 12, B = 26, xmax = niceMax(Math.max(quant(fc.sorted, 0.9) * 1.15, P * 1.1, o.pay[NW - 1] * 1.1, 500));
  const X = (v) => L + ((W - L - R) * Math.min(v, xmax)) / xmax, Y = (p) => T + (Hh - T - B) * (1 - p);
  let d = '';
  for (let k = 0; k <= 160; k++) { const v = (xmax * k) / 160; d += (k ? 'L' : 'M') + X(v).toFixed(1) + ',' + Y(fc.coverage(v)).toFixed(1); }
  const cp = fc.coverage(P), cur = o.pay[NW - 1], right = X(P) > W - 190;
  const pick = (e) => {
    const svg = ref.current; if (!svg) return;
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    onPick(Math.max(0, Math.round((((p.x - L) / (W - L - R)) * xmax) / 10) * 10));
  };
  const drag = useRef(false);
  return (
    <svg ref={ref} className="chart" viewBox={`0 0 ${W} ${Hh}`} role="img" aria-label="Coverage by weekly pay">
      {[0, 0.5, 1].map((p) => <g key={p}><line x1={L} x2={W - R} y1={Y(p)} y2={Y(p)} stroke={p ? '#eceef2' : '#cfd4dc'} /><text {...AX} x={L - 10} y={Y(p) + 4} textAnchor="end">{pct(p)}</text></g>)}
      {[0, 1, 2, 3, 4, 5].map((k) => <text key={k} {...AX} x={X((xmax * k) / 5)} y={Hh - 6} textAnchor="middle">{kfmt((xmax * k) / 5)}</text>)}
      <path d={d + `L${X(xmax)},${Y(0)}L${X(0)},${Y(0)}Z`} fill={INK} fillOpacity=".05" />
      <path d={d} fill="none" stroke={INK} strokeWidth="2" />
      <line x1={L} x2={X(safe)} y1={Y(conf)} y2={Y(conf)} stroke={POS} strokeDasharray="3 3" />
      <line x1={X(safe)} x2={X(safe)} y1={Y(conf)} y2={Y(0)} stroke={POS} strokeDasharray="3 3" />
      <circle cx={X(safe)} cy={Y(conf)} r="4.5" fill={POS} />
      <line x1={X(cur)} x2={X(cur)} y1={T} y2={Y(0)} stroke="#9aa1ad" />
      <text {...AX} x={X(cur) + 6} y={Y(0) - 8}>current pay</text>
      <circle cx={X(P)} cy={Y(cp)} r="6" fill={ACC} stroke="#fff" strokeWidth="2" />
      <text x={X(P) + (right ? -12 : 12)} y={Math.max(T + 12, Y(cp) - 10)} textAnchor={right ? 'end' : 'start'} fontSize="12.5" fill={INK} fontFamily='"IBM Plex Mono", monospace'>{money(P)}/wk → {pct(cp)} covered</text>
      <rect x={L} y={T} width={W - L - R} height={Hh - T - B} fill="transparent" style={{ cursor: 'ew-resize' }}
        onPointerDown={(e) => { drag.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); pick(e); }}
        onPointerMove={(e) => drag.current && pick(e)} onPointerUp={() => (drag.current = false)} onPointerCancel={() => (drag.current = false)} />
    </svg>
  );
}

function MonthlyBars({ monthly }) {
  const Hh = 170, T = 10, B = 26, bw = (W - L - R) / 13, ymax = niceMax(Math.max(...monthly, 1) * 1.08), Y = (v) => T + (Hh - T - B) * (1 - v / ymax);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${Hh}`} role="img" aria-label="Monthly income">
      {[0, ymax / 2, ymax].map((v, k) => <g key={k}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke={k ? '#eceef2' : '#cfd4dc'} /><text {...AX} x={L - 10} y={Y(v) + 4} textAnchor="end">{kfmt(v)}</text></g>)}
      {monthly.map((v, m) => (
        <g key={m}>
          <rect x={L + m * bw + 7} y={Y(v)} width={bw - 14} height={Y(0) - Y(v)} fill={m === 12 ? ACC : INK} fillOpacity={m === 12 ? 1 : 0.85} />
          <text {...AX} x={L + m * bw + bw / 2} y={Hh - 6} textAnchor="middle">{dateOf(m * 4 + 3)}</text>
        </g>
      ))}
    </svg>
  );
}

// ---------- small pieces ----------
const Card = ({ n, title, sub, right, children, flush }) => (
  <section className="card">
    {title && <div className="ch"><div><h2>{n && <span className="n">{n}</span>}{title}</h2>{sub && <p>{sub}</p>}</div>{right}</div>}
    {flush ? children : <div className="cb">{children}</div>}
  </section>
);
const Slider = ({ label, value, display, ...p }) => (
  <div className="field"><div className="fr"><span>{label}</span><b>{display ?? value}</b></div><input type="range" value={value} aria-label={label} {...p} /></div>
);
const Delta = ({ cur, base, fmt = money, invert }) => {
  const d = cur - base;
  if (!isFinite(d) || Math.abs(d) < 0.5) return <div className="d flat">no change</div>;
  const good = invert ? d < 0 : d > 0;
  return <div className={'d ' + (good ? 'up' : 'down')}>{d > 0 ? '▲' : '▼'} {fmt(Math.abs(d))} vs. base</div>;
};

// ---------- app ----------
export default function App() {
  const [dsId, setDsId] = useState('maya');
  const [ver, setVer] = useState(0);            // bumps whenever the active dataset changes
  const [S, setS] = useState(() => E.defaults());
  const [F, setF] = useState({ conf: 0.9, P: null });
  const [cursor, setCursor] = useState(51);
  const [hover, setHover] = useState(null);
  const [tab, setTab] = useState(() => (TABS.some((t) => t.id === location.hash.slice(1)) ? location.hash.slice(1) : 'pay'));
  const [playing, setPlaying] = useState(false);
  const [weeksOff, setWeeksOff] = useState(2);
  const [addAmt, setAddAmt] = useState(2500);
  const [sent, setSent] = useState(false);
  const [step, setStep] = useState(null);
  const [modal, setModal] = useState(false);
  const [importErr, setImportErr] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState(null);
  const fileRef = useRef(null);

  const o = useMemo(() => E.run(S), [S, ver]);
  const base = useMemo(() => E.run(E.defaults()), [ver]);
  const fc = useMemo(() => E.forecast(S, o), [S, o]);
  const ls = useMemo(() => E.lenderStats(S, o), [S, o]);
  const nf = useMemo(() => (S.fund.on ? E.run({ ...S, fund: { ...S.fund, on: false } }) : o), [S, o]);
  const safe = fc.safe(F.conf), P = F.P ?? Math.round(safe / 10) * 10;
  const sel = hover ?? cursor, i = sel + OFF;
  const upd = (fn) => setS((s) => { const n = clone(s); fn(n); return n; });
  const say = (msg, kind = '') => setToast({ msg, kind, t: Date.now() });
  const go = (t) => { setTab(t); setPlaying(false); setHover(null); try { history.replaceState(null, '', '#' + t); } catch (e) { /* sandboxed */ } };
  const resetAll = () => { setS(E.defaults()); setF({ conf: 0.9, P: null }); setCursor(51); setSent(false); };

  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 4200); return () => clearTimeout(id); }, [toast]);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setCursor((c) => (c >= 51 ? 51 : c + 1)), 110);
    return () => clearInterval(id);
  }, [playing]);
  useEffect(() => { if (playing && cursor >= 51) setPlaying(false); }, [cursor, playing]);
  useEffect(() => { const h = () => { const t = location.hash.slice(1); if (TABS.some((x) => x.id === t)) setTab(t); }; window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);

  const loadDataset = (ds, id) => {
    E.setDataset(ds); setDsId(id); setVer((v) => v + 1);
    setS(E.defaults()); setF({ conf: 0.9, P: null }); setCursor(51); setHover(null); setSent(false); setImportErr('');
  };

  // presenter: steps adapt to whichever dataset is loaded
  const STEPS = useMemo(() => {
    const w = E.worstPayer(), name = E.CLIENTS[w]?.name || 'A client';
    const late = (s) => { s.extra = s.extra.map((x, k) => (k === w ? 60 : 0)); return s; };
    return [
      { tab: 'pay', cap: 'Clients pay in lumps. Ada sets aside tax and costs from every payment and pays the owner one steady weekly wage from a buffer.', apply: () => E.defaults() },
      { tab: 'late', cap: `${name} goes quiet for 60 days. The buffer absorbs it; the paycheck barely moves.`, apply: () => late(E.defaults()) },
      { tab: 'forecast', cap: 'Ada simulates 2,000 futures from each client’s real payment history and finds a pay floor the owner can plan rent around.', apply: () => { const s = late(E.defaults()); s.fund.on = true; return s; } },
      { tab: 'lender', cap: 'One click turns the ledger into a verified report a lender can underwrite. No protected attributes. Synthetic data.', apply: () => E.defaults() },
    ];
  }, [ver]);
  const gotoStep = useCallback((k) => {
    if (k < 0 || k >= STEPS.length) return;
    setStep(k); setS(STEPS[k].apply()); setF({ conf: 0.9, P: null }); setCursor(51); setHover(null); setSent(false); go(STEPS[k].tab);
  }, [STEPS]);

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (modal) { if (e.key === 'Escape') setModal(false); return; }
      if (step != null) {
        if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); gotoStep(Math.min(step + 1, STEPS.length - 1)); }
        else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); gotoStep(Math.max(step - 1, 0)); }
        else if (e.key === 'Escape') setStep(null);
        return;
      }
      if (/^[1-5]$/.test(e.key)) go(TABS[+e.key - 1].id);
      else if (e.key === 'ArrowLeft') { setPlaying(false); setHover(null); setCursor((c) => Math.max(0, c - 1)); }
      else if (e.key === 'ArrowRight') { setPlaying(false); setHover(null); setCursor((c) => Math.min(51, c + 1)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, gotoStep, modal, STEPS]);

  // ---------- import / export ----------
  const onFile = async (file) => {
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { setImportErr('Please choose an .xlsx, .xls or .csv file.'); return; }
    try {
      const rows = await readSpreadsheet(file);
      const r = E.rowsToDataset(rows, file.name.replace(/\.(xlsx|xls|csv)$/i, '').replace(/^\d+_/, '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()));
      if (r.error) { setImportErr(r.error); return; }
      loadDataset(r.ds, 'file'); setModal(false);
      say(`Imported ${file.name}: ${r.ds.note}.`);
    } catch (err) { setImportErr('Could not read that file. Is it a valid spreadsheet?'); }
  };
  const safeDownload = (wb, name) => {
    try { downloadWorkbook(wb, name); say(`Downloaded ${name}. If nothing appeared, this preview blocks downloads; open the offline file.`); }
    catch (e) { say('This preview blocks downloads. Open the offline HTML file to export.', 'warn'); }
  };
  const exportInsights = () => {
    const stamp = [E.TODAY.getFullYear(), String(E.TODAY.getMonth() + 1).padStart(2, '0'), String(E.TODAY.getDate()).padStart(2, '0')].join('-'), slug = E.DATASET.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    safeDownload(buildInsightsWorkbook({ S, o, fc, ls, conf: F.conf }), `ada-insights-${slug}-${stamp}.xlsx`);
  };

  // ---------- derived ----------
  const histTab = tab === 'pay' || tab === 'late' || tab === 'funding';
  const payments = useMemo(() => (histTab ? E.paymentsUpTo(S, cursor) : []), [histTab, S, cursor, ver]);
  const own = 100 - S.tax - S.cost;
  const isSample = dsId !== 'file';
  const who = dsId === 'maya' ? 'Maya' : 'The owner';
  const weeksBuf = o.buf[i] / Math.max(1, o.pay[i]);
  const anyLate = S.extra.some((x) => x > 0);
  const band = ls.score >= 80 ? 'Strong' : ls.score >= 60 ? 'Good' : ls.score >= 40 ? 'Fair' : 'Building';

  const hero = {
    pay: { k: sel === 51 ? 'PAID THIS WEEK' : 'PAID · WEEK OF ' + dateOf(sel).toUpperCase(), big: money(o.pay[i]), small: '/wk', say: <>{o.gross[i] > 0 ? <>Clients paid <b>{money(o.gross[i])}</b>{sel === 51 ? ' this week' : ' that week'}. </> : <>No client paid {sel === 51 ? 'this week' : 'that week'}. </>}{who} still got a steady wage; the buffer now covers <b>{weeksBuf.toFixed(1)} weeks</b> of pay.</> },
    late: { k: 'WEEKS PAY WAS TRIMMED', big: o.st.trimmed, small: ' of 52', say: anyLate ? <>With the delays you set, the lowest buffer was <b>{money(o.st.minBuf)}</b> and {money(o.st.unpaid)} is still owed. Without them: {base.st.trimmed} trimmed weeks.</> : <>Every client on their usual schedule. Drag a delay below to see how much lateness the buffer can absorb.</> },
    funding: { k: 'ADVANCED BY THE BRIDGE', big: money(o.st.advTotal), small: '', say: S.fund.on ? <>{o.st.advCount} advances, <b>{money(o.st.feeTotal)}</b> in fees. Trimmed weeks went from {nf.st.trimmed} to <b>{o.st.trimmed}</b>.</> : <>The bridge is off. Turn it on to let Ada advance part of what clients owe when the buffer runs low.</> },
    forecast: { k: '13-WEEK PAY FLOOR', big: money(safe), small: '/wk', say: <>Covered in <b>{pct(F.conf)}</b> of 2,000 simulated futures built from each client’s own payment history{S.fund.on ? ', with the bridge on' : ''}.</> },
    lender: { k: 'FUNDING SCORE', big: ls.score, small: '/100', say: <><b>{band}.</b> Built from {ls.n} paid invoices over 12 months. Suggested invoice advance: <b>{money(ls.advance)}</b> (illustrative).</> },
  }[tab];

  // ---------- panels ----------
  const historyCard = (
    <Card flush n="01" title="Income vs. paycheck" sub="Owner income after taxes and costs. Hover to inspect, click to pin a week."
      right={<div className="legend"><span><i style={{ background: BAR }} />Income</span><span><i style={{ background: ACC, height: 3, verticalAlign: 3 }} />Paycheck</span><span><i style={{ background: NEG, borderRadius: '50%' }} />Trimmed</span></div>}>
      <div className="cb"><IncomeChart o={o} cursor={cursor} hover={hover} onHover={setHover} onPick={(k) => { setPlaying(false); setCursor(k); setHover(null); }} /></div>
      <div className="sep" />
      <div className="ch"><div><h2><span className="n">02</span>Buffer balance</h2></div>{S.fund.on && <div className="legend"><span><i style={{ background: POS }} />Bridge advance</span></div>}</div>
      <div className="cb"><BufferChart o={o} cursor={cursor} sel={Math.min(sel, cursor)} /></div>
      <div className="transport">
        <button className="iconbtn" onClick={() => { if (!playing && cursor >= 51) setCursor(0); setHover(null); setPlaying(!playing); }} aria-label={playing ? 'Pause' : 'Replay the year'}><Icon n={playing ? 'pause' : 'play'} size={12} /></button>
        <input type="range" min="0" max="51" value={cursor} onChange={(e) => { setPlaying(false); setHover(null); setCursor(+e.target.value); }} aria-label="Week" />
        <span className="w">{cursor === 51 ? 'this week' : dateOf(cursor)}</span>
      </div>
      <div className="sep" />
      <div className="ch" style={{ paddingBottom: 14 }}><div><h2><span className="n">03</span>Payments received</h2></div><span className="count">{payments.length} payments to {dateOf(cursor)}</span></div>
      <table className="table">
        <thead><tr><th>Date</th><th>Invoice</th><th>Client</th><th className="r">Received</th><th className="r">To owner</th><th>Status</th></tr></thead>
        <tbody>{payments.length ? payments.slice(0, 7).map((p, k) => (
          <tr key={k} onMouseEnter={() => setHover(p.w)} onMouseLeave={() => setHover(null)}>
            <td className="m num">{dateOf(p.w)}</td><td className="m num">{p.id}</td><td>{p.name}</td><td className="r num">{money(p.amt)}</td><td className="r num">{money((p.amt * own) / 100)}</td>
            <td><span className={'tag ' + (p.late > 14 ? 'vlate' : p.late > 3 ? 'late' : '')}><i />{p.late > 3 ? p.late + ' days late' : 'On time'}</span></td></tr>
        )) : <tr><td colSpan="6" className="m">No payments yet.</td></tr>}</tbody>
      </table>
    </Card>
  );

  const inspector = (
    <Card title={sel === 51 ? 'This week' : 'Week of ' + dateOf(sel)} sub={[...new Set(o.paidList[i])].join(', ') || 'No client payments'}
      right={hover != null ? <span className="count">hover</span> : sel !== 51 ? <button className="linkbtn" onClick={() => setCursor(51)}>Back to now</button> : null}>
      <table className="ledger"><tbody>
        <tr><td>Received</td><td>{money(o.gross[i])}</td></tr>
        <tr className="sub ind"><td>Tax reserve {S.tax}%</td><td>{o.tax[i] ? '−' + money(o.tax[i]) : '$0'}</td></tr>
        <tr className="sub ind"><td>Business costs {S.cost}%</td><td>{o.cost[i] ? '−' + money(o.cost[i]) : '$0'}</td></tr>
        <tr><td>Owner income</td><td>{money(o.owner[i])}</td></tr>
        <tr className="sub"><td>{S.win}-week average</td><td>{money(o.avg[i])}</td></tr>
        {o.target[i] > o.avg[i] + 1 && <tr className="sub"><td>Step-down floor (−8%/wk)</td><td>{money(o.target[i])}</td></tr>}
        {o.repay[i] > 0 && <tr className="sub"><td>Bridge repayment</td><td>−{money(o.repay[i])}</td></tr>}
        {o.adv[i] > 0 && <tr className="sub"><td>Bridge advance</td><td>+{money(o.adv[i])}</td></tr>}
        <tr className="total"><td>Paid to owner</td><td>{money(o.pay[i])}</td></tr>
      </tbody></table>
      <div className={'callout ' + (o.trim[i] ? 'neg' : o.adv[i] > 0 ? 'pos' : '')}>
        Buffer {money(o.before[i])} → <b>{money(o.buf[i])}</b>
        {o.trim[i] ? '. Pay trimmed to 80% to keep half a week in reserve.' : o.adv[i] > 0 ? `. Bridge advanced against ${money(o.recv[i])} owed.` : o.gross[i] === 0 ? '. No income; the buffer paid the wage.' : '.'}
      </div>
    </Card>
  );

  const cover = o.buf[i] / Math.max(1, o.pay[i]), left = o.buf[i] - weeksOff * o.pay[i];
  const payRules = (
    <Card title="Pay rules" sub="Every change reruns all 52 weeks.">
      <div className="alloc"><i style={{ width: S.tax + '%', background: '#59606c' }} /><i style={{ width: S.cost + '%', background: BAR }} /><i style={{ width: own + '%', background: ACC }} /></div>
      <div className="allockey"><span>tax {S.tax}¢</span><span>costs {S.cost}¢</span><span>owner {own}¢ / $1</span></div>
      <Slider label="Tax reserve" min="10" max="40" value={S.tax} display={S.tax + '%'} onChange={(e) => upd((n) => (n.tax = Math.min(+e.target.value, 95 - n.cost)))} />
      <Slider label="Business costs" min="0" max="50" value={S.cost} display={S.cost + '%'} onChange={(e) => upd((n) => (n.cost = Math.min(+e.target.value, 95 - n.tax)))} />
      <Slider label="Pay averaged over" min="2" max="12" value={S.win} display={S.win + ' wks'} onChange={(e) => upd((n) => (n.win = +e.target.value))} />
      <Slider label="Planned time off" min="0" max="8" value={weeksOff} display={weeksOff + (weeksOff === 1 ? ' wk' : ' wks')} onChange={(e) => setWeeksOff(+e.target.value)} />
      <div className={'callout ' + (weeksOff === 0 ? '' : left < 0 ? 'neg' : 'pos')}>
        Buffer covers <b>{cover.toFixed(1)} weeks</b> at full pay ({money(o.buf[i])} ÷ {money(o.pay[i])}).{' '}
        {weeksOff > 0 && (left >= 0 ? `${weeksOff} ${weeksOff === 1 ? 'week' : 'weeks'} off is covered, ${money(left)} left over.` : `${weeksOff} weeks off is ${money(-left)} short.`)}
      </div>
      <div className="field"><div className="fr"><span>Record a payment on {dateOf(cursor)}</span></div>
        <div className="row">
          <input className="inp" type="number" value={addAmt} min="0" step="100" onChange={(e) => setAddAmt(Math.max(0, +e.target.value || 0))} aria-label="Payment amount" />
          <button className="btn dark" disabled={!(addAmt > 0)} onClick={() => { upd((n) => n.added.push({ w: cursor, amt: addAmt })); say(`Recorded ${money(addAmt)} on ${dateOf(cursor)}.`); }}>Add</button>
          <button className="btn" onClick={() => { resetAll(); say('Reset to the original data.'); }}>Reset</button>
        </div></div>
    </Card>
  );

  const clientsCard = (
    <Card title="Client payment behaviour" sub="Add a delay to any client and watch the year rerun.">
      <table className="ctable"><thead><tr><th>Client</th><th>Usual</th><th className="r">Extra delay</th></tr></thead>
        <tbody>{E.CLIENTS.map((c, k) => (
          <tr key={c.name + k}><td><div className="who" title={c.name}>{c.name}</div><div className="m">{c.kind}</div></td><td className="m" style={{ whiteSpace: 'nowrap' }}>{c.late ? '+' + c.late + 'd' : 'on time'}</td>
            <td className="r"><div className="row" style={{ justifyContent: 'flex-end' }}><input type="range" min="0" max="90" value={S.extra[k] || 0} onChange={(e) => upd((n) => (n.extra[k] = +e.target.value))} aria-label={'Extra delay for ' + c.name} /><span className="m mono" style={{ width: 36, textAlign: 'right' }}>{S.extra[k] ? '+' + S.extra[k] + 'd' : '—'}</span></div></td></tr>
        ))}</tbody></table>
      <div className="chips">
        <button className="btn" onClick={() => upd((n) => (n.extra = n.extra.map((x, k) => (k === E.worstPayer() ? 60 : 0))))}>Slowest client +60d</button>
        <button className="btn" onClick={() => upd((n) => (n.extra = n.extra.map(() => 21)))}>Everyone +21d</button>
        <button className="btn" disabled={!anyLate} onClick={() => upd((n) => (n.extra = n.extra.map(() => 0)))}>Clear</button>
      </div>
      <div className={'callout ' + (o.st.trimmed > base.st.trimmed ? 'neg' : '')}>
        {anyLate ? <>Lowest buffer <b>{money(o.st.minBuf)}</b> (was {money(base.st.minBuf)}). Pay trimmed in <b>{o.st.trimmed}</b> of 52 weeks (was {base.st.trimmed}).</>
          : <>All clients on their usual schedule. Lowest buffer this year: <b>{money(o.st.minBuf)}</b>.</>}
      </div>
    </Card>
  );

  const bridgeCard = (
    <Card title="Invoice bridge" sub="Advances part of what clients owe when the buffer runs low. Repaid when they pay.">
      <label className="row" style={{ justifyContent: 'space-between', fontWeight: 500, cursor: 'pointer' }}>Enable bridge
        <span className="toggle"><input type="checkbox" checked={S.fund.on} onChange={(e) => upd((n) => (n.fund.on = e.target.checked))} /><span /></span></label>
      <Slider label="Fee per advance" min="0.5" max="5" step="0.5" value={S.fund.fee} display={S.fund.fee + '%'} disabled={!S.fund.on} onChange={(e) => upd((n) => (n.fund.fee = +e.target.value))} />
      <Slider label="Credit limit" min="1000" max="15000" step="500" value={S.fund.max} display={money(S.fund.max)} disabled={!S.fund.on} onChange={(e) => upd((n) => (n.fund.max = +e.target.value))} />
      <div className={'callout ' + (S.fund.on && o.st.advCount ? 'pos' : '')}>
        {!S.fund.on ? <>Off. Pay is trimmed in <b>{nf.st.trimmed}</b> weeks this year.{nf.st.trimmed === 0 && <> Try <button className="linkbtn" onClick={() => go('late')}>delaying a client</button> first.</>}</>
          : o.st.advCount === 0 ? 'On, but unused: the buffer covered every week.'
            : <><b>{money(o.st.advTotal)}</b> advanced over {o.st.advCount} weeks for <b>{money(o.st.feeTotal)}</b> in fees.</>}
      </div>
    </Card>
  );

  const forecastView = (
    <div className="grid">
      <Card flush n="01" title="Buffer, next 13 weeks" sub={`From ${money(fc.B0)} today, paying a fixed ${money(P)}/wk.` + (fc.credit ? ` Bridge allows the buffer down to −${money(fc.credit)}.` : '')}
        right={<div className="legend"><span><i style={{ background: ACC, opacity: 0.25 }} />90% of futures</span><span><i style={{ background: ACC, opacity: 0.5 }} />50%</span></div>}>
        <div className="cb"><FanChart o={o} fc={fc} P={P} /></div>
        <div className="sep" />
        <div className="ch"><div><h2><span className="n">02</span>How high can the floor go?</h2><p>Chance every paycheck is covered, by weekly amount. Drag along the curve.</p></div></div>
        <div className="cb"><CurveChart o={o} fc={fc} P={P} safe={safe} conf={F.conf} onPick={(v) => setF((f) => ({ ...f, P: v }))} /></div>
        <div className="sep" />
        <div className="ch" style={{ paddingBottom: 14 }}><div><h2><span className="n">03</span>Open invoices</h2></div><span className="count">odds from each client’s history</span></div>
        <table className="table"><thead><tr><th>Invoice</th><th>Client</th><th>Issued</th><th className="r">Owed</th><th>Likely paid</th><th className="r">≤ 4 weeks</th></tr></thead>
          <tbody>{fc.open.length ? fc.open.map((inv, j) => (
            <tr key={inv.id + j}><td className="m num">{inv.id}</td><td>{E.CLIENTS[inv.c].name}</td><td className="m num">{dateOf(inv.issue)}</td><td className="r num">{money(inv.amt)}</td>
              <td className="m">{fc.openStats[j].median > H ? '13+ wks' : '~' + fc.openStats[j].median + ' wk' + (fc.openStats[j].median === 1 ? '' : 's')}</td>
              <td className="r num"><span className="mini"><i style={{ width: fc.openStats[j].p4 * 100 + '%' }} /></span>{pct(fc.openStats[j].p4)}</td></tr>
          )) : <tr><td colSpan="6" className="m">Nothing outstanding.</td></tr>}</tbody></table>
      </Card>
      <div className="stack">
        <Card title="Pay floor solver" sub="Highest fixed paycheck for the next 13 weeks.">
          <div className="seg" style={{ marginBottom: 16 }}>{[0.8, 0.9, 0.95, 0.99].map((c) => <button key={c} className={F.conf === c ? 'on' : ''} onClick={() => setF({ conf: c, P: null })}>{pct(c)}</button>)}</div>
          <div className="bigv">{money(safe)}<small>/week at {pct(F.conf)}</small></div>
          <table className="ledger" style={{ marginTop: 16 }}><tbody>
            {[0.8, 0.9, 0.95, 0.99].map((c) => <tr key={c} className={c === F.conf ? '' : 'sub'}><td>Floor at {pct(c)}</td><td>{money(fc.safe(c))}</td></tr>)}
            <tr><td>Current flexible pay</td><td>{money(o.pay[NW - 1])}</td></tr>
          </tbody></table>
          <Slider label="Test a weekly amount" min="0" max={Math.max(4000, Math.ceil(P / 500) * 500)} step="10" value={P} display={`${money(P)} · ${pct(fc.coverage(P))}`} onChange={(e) => setF((f) => ({ ...f, P: +e.target.value }))} />
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}><button className="linkbtn" onClick={() => setF((f) => ({ ...f, P: null }))}>Snap to floor</button><button className="linkbtn" onClick={() => setF((f) => ({ ...f, P: Math.round(o.pay[NW - 1] / 10) * 10 }))}>Snap to current pay</button></div>
          {!S.fund.on ? <div className="callout hot">The bridge would raise this floor. <button className="linkbtn" onClick={() => upd((n) => (n.fund.on = true))}>Turn it on</button></div>
            : <div className="callout pos">Bridge on: the {money(S.fund.max)} credit line absorbs slow weeks. <button className="linkbtn" onClick={() => upd((n) => (n.fund.on = false))}>Turn off</button></div>}
        </Card>
      </div>
    </div>
  );

  const lenderView = (
    <div className="grid">
      <section className="card"><div className="report">
        <div className="rhead">
          <div><div className="eyebrow">Funding readiness report</div><h2>{E.DATASET.name}</h2><div style={{ color: 'var(--muted)', fontSize: 13 }}>{E.DATASET.note} · Period ending {fullDate(E.TODAY)}</div></div>
          <span className="verified"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5l3 3 7-7" /></svg>Verified from Ada ledger, 12 months</span>
        </div>
        <div className="rsec"><h3>Monthly income <span>4-week blocks</span></h3><MonthlyBars monthly={ls.monthly} /></div>
        <div className="rsec"><div className="stats4">
          {[[pct(ls.onPct), 'Paid on time', 'within 3 days of due'], [ls.avgLate.toFixed(1), 'Avg. days late', ls.n + ' paid invoices'], [pct(ls.steady), 'Income steadiness', 'month to month'], ['12', 'Months of history', '52 weeks in ledger']].map(([v, l, d]) =>
            <div key={l}><div className="v">{v}</div><div className="l">{l}</div><div className="d">{d}</div></div>)}
        </div></div>
        <div className="rsec"><h3>Funding score <span>{band}</span></h3>
          <div className="score"><div className="num">{ls.score}<small>/100</small></div>
            <div><div className="scale"><b style={{ background: '#ecebe6' }} /><b style={{ background: '#efe3bb' }} /><b style={{ background: '#e2c96e' }} /><b style={{ background: '#c9a227' }} /><i style={{ left: `calc(${ls.score}% - 1px)` }} /></div>
              <div className="scalek"><span>0 Building</span><span>40 Fair</span><span>60 Good</span><span>80 Strong</span></div></div></div></div>
        <div className="rsec"><h3>Why this score <span>5 factors × 20 points</span></h3>
          <table className="factors"><tbody>
            {[...ls.parts].sort((a, b) => b.pts - a.pts).map((p) => <tr key={p.name}><td className="f">{p.name}</td><td className="w">{p.why}</td><td className="p"><span className="mini"><i style={{ width: (p.pts / 20) * 100 + '%', background: p.pts >= 14 ? POS : p.pts >= 8 ? '#9aa1ad' : NEG }} /></span>{p.pts.toFixed(0)} / 20</td></tr>)}
          </tbody></table></div>
        <div className="rsec"><h3>Suggested invoice advance <span>illustrative</span></h3>
          {ls.elig.length ? <div className="adv"><div><div className="bigv" style={{ fontSize: 32 }}>{money(ls.advance)}</div><div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>80% of {money(ls.eligSum)} owed by clients who usually pay within 10 days ({[...new Set(ls.elig.map((v) => E.CLIENTS[v.c].name))].join(', ')})</div></div>
            <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><div className="mono">2.5% fee</div><div className="mono" style={{ color: 'var(--muted)', fontSize: 13 }}>{money(ls.fee)}</div></div></div>
            : <div className="callout">No open invoices from clients who usually pay within 10 days right now.</div>}
        </div>
        <div className="rsec"><div className="fair"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 1.5l5.5 2v4.2c0 3.2-2.3 5.6-5.5 6.8-3.2-1.2-5.5-3.6-5.5-6.8V3.5z" /><path d="M5.5 8l1.8 1.8L10.8 6.3" strokeLinecap="round" strokeLinejoin="round" /></svg>No gender or protected attribute is used.</div></div>
      </div></section>
      <div className="stack">
        <Card title="Share with a lender" sub="Read-only. Updates with every change.">
          <button className="btn hot" style={{ width: '100%' }} onClick={() => setSent(true)}><Icon n="send" size={15} />Send to lender (demo)</button>
          {sent && <div className="callout pos"><b>Demo only: nothing was sent.</b><br />In the product the owner picks a lender and can revoke access at any time.</div>}
          <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={exportInsights}><Icon n="down" size={15} />Download insights (.xlsx)</button>
          <div className="sublbl" style={{ marginTop: 22 }}>Simulate a change</div>
          <div className="chips" style={{ marginTop: 0 }}>
            <button className="btn" onClick={() => { upd((n) => (n.extra = n.extra.map((x, k) => (k === E.worstPayer() ? 60 : 0)))); setSent(false); }}>Slowest client +60d</button>
            <button className="btn" onClick={() => { upd((n) => n.added.push({ w: 51, amt: 2500 })); setSent(false); }}>+$2,500 payment</button>
            <button className="btn" onClick={() => { upd((n) => (n.tax = 15)); setSent(false); }}>Tax reserve 15%</button>
            <button className="btn" onClick={resetAll}>Reset</button>
          </div>
          <div className="sublbl" style={{ marginTop: 22 }}>The score uses</div>
          <ul className="used"><li>Invoice dates and when clients paid</li><li>Weekly income received</li><li>Buffer balance and paycheck</li><li>Tax reserve rate</li><li>Share of income per client</li></ul>
          <div className="sublbl" style={{ marginTop: 14 }}>It never uses</div>
          <ul className="used"><li>Gender, age, race, religion, marital status or any other protected attribute</li><li>Personal credit file</li></ul>
        </Card>
      </div>
    </div>
  );

  const hs = [
    { l: 'Buffer', v: money(o.buf[i]), d: <Delta cur={o.buf[i]} base={base.buf[i]} /> },
    { l: 'Swing removed', v: pct(o.st.swing), d: <div className="d flat">variation {o.st.cvOwner.toFixed(2)} → {o.st.cvPay.toFixed(2)}</div> },
    { l: 'Tax reserve', v: money(o.st.taxTotal), d: <div className="d flat">last 52 weeks</div> },
    { l: tab === 'forecast' ? 'Funding score' : 'Pay floor', v: tab === 'forecast' ? ls.score + '/100' : money(safe), d: <div className="d flat">{tab === 'forecast' ? band : pct(F.conf) + ' confidence'}</div> },
  ];

  return (
    <>
      <header className="mast"><div className="mast-in">
        <div className="bar">
          <div className="logo"><svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M2 20L11 2l9 18" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" /><path d="M5.5 13.5h11" stroke="#c9a227" strokeWidth="2.4" /></svg>Ada<em>steady</em></div>
          <button className="dsbtn" onClick={() => { setImportErr(''); setModal(true); }} title="Switch or import data">
            <span className="av">{initials(E.DATASET.name)}</span><span style={{ minWidth: 0 }}><b>{E.DATASET.name}</b><small>{E.DATASET.note}</small></span><Icon n="chev" size={14} />
          </button>
          <div className="sp" />
          <button className="mbtn" onClick={() => { setImportErr(''); setModal(true); }}><Icon n="up" /><span>Import invoices</span></button>
          <button className="mbtn" onClick={exportInsights}><Icon n="down" /><span>Export insights</span></button>
          <button className="mbtn hot" onClick={() => (step == null ? gotoStep(0) : setStep(null))}><Icon n="present" /><span>{step == null ? 'Present' : 'Stop presenting'}</span></button>
        </div>
        <div className="hero">
          <div><div className="k">{hero.k}</div><div className="big">{hero.big}<small>{hero.small}</small></div><div className="say">{hero.say}</div></div>
          <div className="hstats">{hs.map((s) => <div key={s.l}><div className="l">{s.l}</div><div className="v">{s.v}</div>{s.d}</div>)}</div>
        </div>
        <nav className="steps" role="tablist">
          {TABS.map((t, k) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={'stepbtn' + (tab === t.id ? ' on' : '')} onClick={() => go(t.id)}><i>0{k + 1}</i>{t.label}</button>)}
        </nav>
      </div></header>

      <main className="page">
        {histTab && <div className="grid">{historyCard}<div className="stack">{inspector}{tab === 'pay' ? payRules : tab === 'late' ? clientsCard : bridgeCard}</div></div>}
        {tab === 'forecast' && forecastView}
        {tab === 'lender' && lenderView}
        <p className="foot">
          {isSample ? 'Synthetic test data. ' : 'Data from your imported spreadsheet, processed only in this browser. '}
          Pay is a trailing average paid from a buffer, stepping down at most 8% a week and trimmed to 80% when under half a week of reserve remains. The forecast resamples each client’s payment delays and invoice sizes across 2,000 runs. Results show how the logic behaves, not financial advice.
          {' '}Shortcuts: <span className="kbd">1</span>–<span className="kbd">5</span> switch sections, <span className="kbd">←</span> <span className="kbd">→</span> move through weeks.
        </p>
      </main>

      {modal && (
        <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && setModal(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Data source">
            <div className="mh"><h2>Data source</h2><button className="iconbtn" onClick={() => setModal(false)} aria-label="Close"><Icon n="x" size={14} /></button></div>
            <div className="mb">
              <div className={'drop' + (dragOver ? ' over' : '')} onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); onFile(e.dataTransfer.files?.[0]); }}>
                <b>Drop an invoice spreadsheet here</b><span>or click to choose · .xlsx, .xls or .csv · stays in this browser</span>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
              </div>
              {importErr && <div className="err">{importErr}</div>}
              <div className="cols">One row per invoice. Columns: Client · Invoice date · Due date · Amount · Paid date (blank if unpaid) · Invoice ID (optional)</div>
              <div className="row" style={{ marginTop: 10 }}><button className="btn" onClick={() => safeDownload(templateWorkbook(E.SAMPLE), 'ada-invoice-template.xlsx')}><Icon n="down" size={15} />Download template</button></div>
              <div className="sublbl" style={{ marginTop: 22 }}>Or load a built-in test business</div>
              <div className="dslist">
                {BUILTIN.map((b) => (
                  <button key={b.id} className={'dsitem' + (dsId === b.id ? ' on' : '')} onClick={() => { loadDataset(b.make(), b.id); setModal(false); say(`Loaded ${b.label}.`); }}>
                    <span><b>{b.label}</b><small>{b.desc}</small></span><span className="count">{dsId === b.id ? 'active' : 'load'}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && step == null && <div className={'toast ' + toast.kind} role="status"><i />{toast.msg}</div>}

      {step != null && (
        <div className="presenter" role="status">
          <span className="step">{String(step + 1).padStart(2, '0')}/{String(STEPS.length).padStart(2, '0')}</span>
          <span className="cap">{STEPS[step].cap}</span>
          <button onClick={() => gotoStep(step - 1)} disabled={step === 0}>Back</button>
          {step < STEPS.length - 1 ? <button className="next" onClick={() => gotoStep(step + 1)}>Next →</button> : <button className="next" onClick={() => setStep(null)}>Done</button>}
        </div>
      )}
    </>
  );
}
