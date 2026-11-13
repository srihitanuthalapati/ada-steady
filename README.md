# Ada Steady

Ada Steady turns a freelancer's lumpy client payments into a steady weekly paycheck. It holds back tax and costs from every payment and pays the owner from a buffer.

**Live demo:** open `docs/index.html` in Chrome. It is a single self-contained file and works offline. With GitHub Pages enabled on the `docs/` folder, it is also served at https://srihitanuthalapati.github.io/ada-steady/.

## What the demo does

1. **Pay**: 52 weeks of income against the steady paycheck, with the buffer underneath. Hover or click any week to see its breakdown.
2. **Clients**: add payment delays to any client and the whole year reruns.
3. **Bridge**: short advances against unpaid invoices when the buffer runs low.
4. **Forecast**: 2,000 simulated futures, resampled from each client's payment history, give a 13-week pay floor at a chosen confidence level.
5. **Lender report**: a funding score built from five factors, plain-English reasons, and an illustrative invoice advance. No gender or protected attribute is used.

The demo also has these features:

- **Import invoices**: load an .xlsx or .csv file with one row per invoice. The columns are Client, Invoice date, Due date, Amount, Paid date (blank if unpaid), and an optional Invoice ID. The file is processed only in the browser.
- **Export insights**: downloads a 6-sheet .xlsx with the summary, weekly ledger, clients, score, forecast, and open invoices.
- **Present**: a 4-step guided walkthrough. Use the arrow keys to move between steps.

All built-in data is synthetic.

## Test data

`test-data/` contains spreadsheets to try with **Import invoices**:

| File | Expected result |
|---|---|
| `1_maya_okafor_studio.xlsx` | Score 67 (same as the built-in demo) |
| `2_steady_retainer_consultant.xlsx` | Score 90 |
| `3_late_paying_agency.xlsx` | Score 48 |
| `4_messy_quickbooks_export.csv` | Different headers, $ amounts and a bad row. Imports with 1 row skipped. |
| `5_wrong_columns_should_fail.xlsx` | Rejected with a missing-columns message |
| `0_blank_template.xlsx` | Column layout to fill in |

## Develop

```bash
npm install
npm run build   # writes docs/index.html (React, fonts and SheetJS inlined)
npm test        # engine and importer checks against test-data/
```

The source is in `src/`. `engine.js` contains the pay engine, forecast, score and importer. `App.jsx` is the UI, `exporter.js` builds the .xlsx export, and `samples.js` holds the test datasets.
