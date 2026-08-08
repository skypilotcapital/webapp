// Verifies ReportMarkdown against the REAL published reports ([08-WKLY]).
//
//   ssh droplet "sudo -u postgres psql -d skypilot -A -t -c \
//     \"SELECT json_agg(json_build_object('report_type',report_type,'period_key',period_key, \
//       'rendered_md',rendered_md)) FROM trading.reports;\"" > /tmp/reports.json
//   cd frontend && node scripts/check-report-render.mjs /tmp/reports.json
//
// RUN THIS AFTER ANY EDIT TO ReportMarkdown.tsx. The renderer is hand-written against the closed
// vocabulary `trading/reports/fmt.py` emits, and its governing rule is that nothing published is
// ever silently dropped — exactly the property no screenshot can establish and no type checker
// can see. A screenshot proves one report looks right; this proves that every piece of text in
// every stored report survives into the output, and that tables render AS tables rather than
// collapsing into prose.
//
// Run from `frontend/`: it resolves typescript/react-dom out of the local node_modules, and ESM
// resolves from the script's own directory rather than from the cwd.

import fs from 'node:fs';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';

const SRC = new URL('../components/portfolio/ReportMarkdown.tsx', import.meta.url);

const js = ts.transpileModule(fs.readFileSync(SRC, 'utf8'), {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020,
  },
}).outputText;

// Transpiled beside the script so its `react` import resolves out of frontend/node_modules, then
// removed — a stray .mjs here would be picked up by nothing and confuse everyone.
const tmp = new URL('./_rm.generated.mjs', import.meta.url);
fs.writeFileSync(tmp, js);
let ReportMarkdown;
try {
  ({ ReportMarkdown } = await import(tmp.href));
} finally {
  fs.rmSync(tmp, { force: true });
}

const reports = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

// Text a reader should end up seeing, derived from the source markdown: heading/list/quote
// markers and table pipes are syntax, the words between them are content.
function expectedTokens(md) {
  const out = [];
  for (const raw of md.split('\n')) {
    const t = raw.trim();
    if (!t) continue;
    if (/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(t)) continue;  // table delimiter
    let body = t;
    if (t.startsWith('|')) {
      body = t.replace(/^\|/, '').replace(/\|$/, '').split('|').join(' ');
    } else {
      body = t.replace(/^#{1,6}\s+/, '').replace(/^>\s?/, '').replace(/^[-*]\s+/, '');
    }
    body = body.replace(/\*\*/g, '').replace(/`/g, '').replace(/(^|\s)\*(\S)/g, '$1$2')
               .replace(/(\S)\*(\s|$)/g, '$1$2');
    const norm = body.replace(/\s+/g, ' ').trim();
    if (norm) out.push(norm);
  }
  return out;
}

const strip = (html) => html
  .replace(/<[^>]+>/g, ' ')
  .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

// COMPARED WITHOUT WHITESPACE, deliberately. Tag boundaries are word boundaries in the DOM but
// not in the text: `` `bullish` `` followed by a comma renders as <code>bullish</code>, which
// reads as "bullish," on screen and strips to "bullish ,". Comparing spacing would fail on
// correct output — and the question here is whether the CHARACTERS survived, not how they were
// spaced. Everything this script exists to catch (a dropped line, a swallowed cell, a table
// flattened into prose) still fails loudly.
const squash = (s) => s.replace(/\s+/g, '');

let failed = 0, checked = 0;
for (const r of reports) {
  const html = renderToStaticMarkup(ReportMarkdown({ md: r.rendered_md }));
  const text = squash(strip(html));
  const missing = [];
  for (const tok of expectedTokens(r.rendered_md)) {
    checked += 1;
    if (!text.includes(squash(tok))) missing.push(tok);
  }
  const ok = missing.length === 0;
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${r.report_type} ${r.period_key}  `
    + `(${r.rendered_md.length} chars -> ${text.length} rendered)`);
  missing.slice(0, 6).forEach((m) => console.log(`        MISSING: ${m}`));

  // The bullet glyph is decorative; tables must actually be tables, not flattened prose.
  if (r.rendered_md.includes('|---') && !html.includes('<table')) {
    console.log('        FAIL: source has a table, output has no <table>');
    failed += 1;
  }
}

console.log(`\n${checked} content lines checked across ${reports.length} reports`);
if (failed) { console.log(`${failed} FAILED`); process.exit(1); }
console.log('no published line was dropped');
