# Isolated Office engine spike

Not a production preview runtime. Do not import this folder from `apps/work` renderer or Main.

```bash
cd apps/work/spikes/office-engine
npm install
npm run fixtures
npx playwright install chromium
npm run dev
```

In another terminal:

```bash
npm run capture
```

Harness: `http://127.0.0.1:4177/?engine=open-file-viewer&fixture=DOC-01`
