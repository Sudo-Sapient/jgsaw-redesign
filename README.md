# jgsaw-redesign

The JgSaw marketing website: a static site (`index.html`, `styles.css`, `main.js`) with particle visuals, plus a small Python API that reads a company's website for the vision board.

## Run locally

```bash
python3 serve.py          # http://localhost:4000
python3 serve.py 3000     # or pick a port
# open the URL   (add ?vision=1 to show the popup again)
```

## Structure

| Path | What it is |
|---|---|
| `index.html`, `styles.css`, `main.js` | The site |
| `jgsaw-logo.svg`, `favicon.svg` | Logo and browser-tab icon |
| `api/_gtm.py` | Website reading, GTM scoring, logo finding (shared) |
| `api/index.py` | Vercel serverless function for `/api/analyze`, `/api/logo`, `/api/deal` |
| `serve.py` | Local dev server on port 4000, same API |
| `vercel.json` | Routes `/api/*` to the function |

## Deals ("Send us a deal")

- Locally, deals are appended to `deals.jsonl` (git-ignored: it holds people's emails).
- On Vercel there is no lasting disk, so each deal is written to the function logs (search `JGSAW_DEAL`).
  To get them somewhere useful, set `JGSAW_DEALS_WEBHOOK` to a Slack, Zapier, Make or CRM webhook URL.

## Optional environment variables

| Name | Purpose |
|---|---|
| `JGSAW_DEALS_WEBHOOK` | Where to POST each new deal |
| `JGSAW_LLM_BASE_URL`, `JGSAW_LLM_API_KEY`, `JGSAW_LLM_MODEL` | Optional AI enrichment of the vision board (any OpenAI-compatible API) |
