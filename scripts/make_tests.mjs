import XLSX from 'xlsx';
import fs from 'fs';
import * as E from '../src/engine.js';
import { steadyRows, riskyRows } from '../src/samples.js';

const cols=[{wch:12},{wch:24},{wch:13},{wch:12},{wch:10},{wch:12}];
function write(rows,file,sheet='Invoices'){const wb=XLSX.utils.book_new();const ws=XLSX.utils.json_to_sheet(rows);ws['!cols']=cols;XLSX.utils.book_append_sheet(wb,ws,sheet);XLSX.writeFile(wb,'../test-data/'+file);console.log(file,rows.length,'rows');}
write(E.datasetToRows(E.SAMPLE),'1_maya_okafor_studio.xlsx');
write(steadyRows(),'2_steady_retainer_consultant.xlsx');
write(riskyRows(),'3_late_paying_agency.xlsx');
// messy export: other header names, $ strings, US dates, a blank line, one bad row
const messy=riskyRows().slice(0,18).concat(steadyRows().slice(0,18)).map(r=>{const us=s=>s?s.slice(5,7)+'/'+s.slice(8,10)+'/'+s.slice(0,4):'';return{'Invoice #':r['Invoice ID'],'Customer':r.Client,'Date':us(r['Invoice date']),'Due':us(r['Due date']),'Total':'$'+r.Amount.toLocaleString('en-US'),'Payment Date':us(r['Paid date'])}});
messy.splice(5,0,{'Invoice #':'','Customer':'','Date':'','Due':'','Total':'','Payment Date':''});
messy.push({'Invoice #':'BAD-1','Customer':'Typo Client','Date':'not a date','Due':'','Total':'$1,000','Payment Date':''});
fs.writeFileSync('../test-data/4_messy_quickbooks_export.csv', XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(messy)));
console.log('4 csv',messy.length);
write([{ 'Invoice ID':'INV-0001', Client:'Example Client', 'Invoice date':'2026-10-01','Due date':'2026-10-15',Amount:2500,'Paid date':'2026-10-20'},{ 'Invoice ID':'INV-0002', Client:'Another Client', 'Invoice date':'2026-11-02','Due date':'2026-11-16',Amount:4000,'Paid date':''}],'0_blank_template.xlsx');
// broken file: should be rejected with a clear message
write([{Name:'Foo',Value:12},{Name:'Bar',Value:'x'}],'5_wrong_columns_should_fail.xlsx','Sheet1');
