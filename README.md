# My English Coach — Starter (Static PWA)

This is a static, mobile-first web app that reads your English phrase data from Google Sheets without running your own server.

## Two ways to read data

1) **Apps Script Web App (recommended)** — private-ish
   - Add the following `doGet` to your existing Apps Script project (same one that handles `doPost`).
   - Deploy as **Web app**, Who has access: **Anyone** (read-only).

```javascript
const SPREADSHEET_ID = 'YOUR_SHEET_ID';
const SHEET_NAME = 'Entries';

function doGet(e) {
  const mode = (e.parameter.mode || 'health').toLowerCase();
  if (mode === 'health') {
    return ContentService.createTextOutput('up');
  }
  if (mode === 'list') {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({ ok:false, error:'Missing sheet' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const values = sheet.getDataRange().getValues(); // header + rows
    const header = values.shift();
    const idx = Object.fromEntries(header.map((h,i)=>[h,i]));
    const items = values.map((row, i) => {
      const obj = {};
      header.forEach((h, j) => { obj[h] = row[j]; });
      const id = i + 2; // row number
      // prefer raw_json if present
      let base = {};
      if (obj.raw_json) {
        try { base = JSON.parse(obj.raw_json); } catch (e) {}
      }
      const breakdownText = obj.breakdown || base.breakdown || '';
      const examplesEn = obj.examples_en || '';
      const examplesKo = obj.examples_ko || '';
      const rec = {
        id,
        timestamp: obj.timestamp || '',
        phrase: obj.phrase || base.phrase || '',
        translation_ko: obj.translation_ko || base.translation_ko || '',
        register: obj.register || base.register || '',
        category: obj.category || base.category || '',
        tags: (obj.tags || (base.tags || [])).toString().split(',').map(s=>s.trim()).filter(Boolean),
        breakdown: Array.isArray(base.breakdown) ? base.breakdown
                  : (typeof breakdownText === 'string' ? breakdownText.split('\n').filter(Boolean).map(t=>({ text:t })) : []),
        examples: Array.isArray(base.examples) ? base.examples
                 : buildExamples_(examplesEn, examplesKo),
        analysis_md: obj.analysis_md || base.analysis_md || ''
      };
      return rec;
    });
    const out = JSON.stringify({ ok:true, items });
    const cb = e.parameter.callback;
    if (cb) {
      return ContentService.createTextOutput(`${cb}(${out})`).setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify({ ok:false, error:'Unknown mode' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function buildExamples_(enStr, koStr) {
  const ens = enStr ? enStr.split('\n').map(s => s.replace(/^•\s*/, '').trim()) : [];
  const kos = koStr ? koStr.split('\n').map(s => s.replace(/^•\s*/, '').trim()) : [];
  const out = [];
  for (var i=0;i<Math.max(ens.length,kos.length);i++) {
    out.push({ en: ens[i] || '', ko: kos[i] || '' });
  }
  return out;
}
```

   - Copy the deployed `/exec` URL and set it in `app.js`:
     ```js
     APPS_SCRIPT_LIST_URL: "https://script.google.com/macros/s/AKfycb.../exec?mode=list"
     ```

2) **Google Visualization (GViz) — public**
   - File → Share → **Anyone with the link: Viewer**
   - File → Share → Publish to the web → Specific sheet: `Entries`
   - In `app.js`, set `SHEET_ID` and keep `SHEET_NAME` as `Entries`.
   - The app will try Apps Script first, then fall back to GViz if it fails.

## Run locally
Just open `index.html` in a modern browser. For PWA features, serve via a local server (e.g., VSCode Live Server).

## Deploy (no server)
- **GitHub Pages**: push this folder to a repo → Settings → Pages → Deploy from `/` (or `/docs`).
- **Netlify**: drag & drop the folder to the dashboard.
- **Cloudflare Pages**: create a project from this folder; no build step needed.

## Notes
- The app caches data in `localStorage` as `cachedItems` for offline viewing.
- Voice (TTS) uses the Web Speech API; adjust speed with the slider.
- SRS uses a simple Leitner system. All progress stays in your browser (no server).
