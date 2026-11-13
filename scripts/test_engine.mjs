import * as E from '../src/engine.js';
import { steadyRows, riskyRows } from '../src/samples.js';
function check(label, ds){
  E.setDataset(ds); const S=E.defaults(); const o=E.run(S); const fc=E.forecast(S,o); const ls=E.lenderStats(S,o);
  const bad=[...o.pay,...o.buf].some(x=>!isFinite(x));
  console.log(label.padEnd(10), ds.note.padEnd(40), 'pay',Math.round(o.pay[63]),'buf',Math.round(o.buf[63]),'swing',E.pct(o.st.swing),'trim',o.st.trimmed,'floor',Math.round(fc.safe(.9)),'score',ls.score,'adv',Math.round(ls.advance),'open',fc.open.length, bad?'NaN!':'ok');
  // stress: worst payer +60, bridge on
  const S2={...S,extra:S.extra.map((x,k)=>k===E.worstPayer()?60:0),fund:{on:true,fee:2,max:6000}}; const o2=E.run(S2); const f2=E.forecast(S2,o2);
  console.log('   stress  trim',o2.st.trimmed,'adv',Math.round(o2.st.advTotal),'floor',Math.round(f2.safe(.9)), [...o2.pay,...o2.buf].some(x=>!isFinite(x))?'NaN!':'ok');
}
check('sample', E.SAMPLE);
const rt=E.rowsToDataset(E.datasetToRows(E.SAMPLE),'Roundtrip'); if(rt.error) console.log('RT ERR',rt.error); else check('roundtrip', rt.ds);
for (const [n,f] of [['steady',steadyRows],['risky',riskyRows]]){const r=E.rowsToDataset(f(),n); if(r.error) console.log(n,'ERR',r.error); else check(n,r.ds);}
console.log(E.rowsToDataset([{Client:'A',Amount:'x'}]).error);
console.log(E.rowsToDataset([]).error);
