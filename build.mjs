import * as esbuild from 'esbuild';
import fs from 'fs';
const r = await esbuild.build({ entryPoints:['src/main.jsx'], bundle:true, minify:true, write:false, outdir:'out',
  loader:{'.woff2':'dataurl','.woff':'empty','.jsx':'jsx'}, define:{'process.env.NODE_ENV':'"production"'}, jsx:'automatic', logLevel:'warning' });
let js='',css='';
for (const f of r.outputFiles){ if(f.path.endsWith('.js')) js=f.text; if(f.path.endsWith('.css')) css=f.text; }
// keep only latin subset fonts to stay small
css = css.replace(/@font-face\{[^}]*\}/g, m => /U\+0000-00FF/.test(m) ? m : '');
const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ada Steady · Live Demo</title><style>${css}</style></head>
<body><div id="root"></div><script>${js.replace(/<\/script/g,'<\\/script')}</script></body></html>`;
fs.mkdirSync('docs',{recursive:true}); fs.writeFileSync('docs/index.html', html); fs.writeFileSync('docs/.nojekyll','');
console.log('bytes', html.length);
