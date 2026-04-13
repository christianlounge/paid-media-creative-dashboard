# Apartments.com.au Paid media dashboard

A fully static, GitHub Pages-hosted dashboard for the paid media team. Data is fetched live from Google Sheets via a Google Apps Script JSONP endpoint — no redeployment needed when data changes.

---

## What the dashboard does

- Fetches ad performance data on page load and auto-refreshes every 5 minutes
- Filters by date range, project, platform, and ad type (filters persist in the URL)
- Shows KPI cards: total spend, impressions, reach, clicks, CTR, live projects, new ads, active ads
- Visualises Static / Reel / Video ad format split (deduplicated by ad name)
- Lists all projects with active ads, their formats, and total spend
- Provides a sortable, paginated main data table (50 rows per page)
- Falls back to CSV upload if the JSONP endpoint is unavailable

---

## Deploy to GitHub Pages

1. Push this repository to GitHub (any repo name, e.g. `acom-paid-media-dashboard`)
2. Go to **Settings → Pages**
3. Under **Source**, select:
   - Branch: `main`
   - Folder: `/ (root)`
4. Click **Save**
5. Your dashboard will be live at:
   ```
   https://<your-github-username>.github.io/<repo-name>/
   ```
6. Every push to `main` auto-deploys — no CI/CD configuration needed

---

## Update the Apps Script URL

The endpoint URL is a single constant at the top of `js/dashboard.js`:

```js
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/.../exec';
```

If the Apps Script is redeployed and the URL changes:
1. Open `js/dashboard.js`
2. Replace the `APPS_SCRIPT_URL` value with the new deployment URL
3. Commit and push — the change is live instantly

---

## Fix Code.gs (Apps Script)

If `Code.gs` in the Apps Script project gets corrupted:

1. Open the Apps Script project at [script.google.com](https://script.google.com)
2. Open or create the `Code.gs` file
3. Copy the entire contents of `/apps-script/Code.gs` from this repository
4. Paste it into the Apps Script editor, replacing all existing content
5. Press **Ctrl+S** / **Cmd+S** to save
6. Click **Deploy → Manage deployments → New deployment** (or redeploy the existing one)
7. Copy the new web app URL and update `APPS_SCRIPT_URL` in `js/dashboard.js` if it changed

The function `importAndMergeLeadsWithProjects_AppendNewOnly` can be triggered manually or set up with a time-driven trigger (e.g. hourly) in Apps Script under **Triggers**.

---

## How data refresh works

| Event | What happens |
|---|---|
| Page load | JSONP request sent immediately to the Apps Script endpoint |
| Success | Data stored in memory, dashboard renders, timestamp updated |
| Every 5 minutes | Silent background re-fetch, current filters preserved |
| Manual refresh | Click the **Refresh** button in the header |
| JSONP fails / times out | Error banner shown with a **Retry** button and CSV upload fallback |

The Apps Script `doGet` function (in `Dashboard.gs`) handles the JSONP call and serves data from the Google Sheet in real time — no caching, always current.

---

## Share the dashboard

Share the base URL with the team:
```
https://<your-github-username>.github.io/<repo-name>/
```

Filters persist in the URL as query parameters, so you can share a pre-filtered view:
```
https://.../?from=2026-01-01&to=2026-03-31&platform=instagram
```

Supported parameters:

| Parameter | Example | Description |
|---|---|---|
| `from` | `2026-01-01` | Date range start (YYYY-MM-DD) |
| `to` | `2026-03-31` | Date range end (YYYY-MM-DD) |
| `projectId` | `P001` | Filter by project ID (partial match) |
| `projectName` | `Skyline%20Residences` | Filter by exact project name |
| `platform` | `instagram` | Filter by platform |
| `adType` | `Reel` | Filter by ad type (Static, Reel, Video) |
