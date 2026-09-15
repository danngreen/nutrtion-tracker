# Nutrition Tracker

A private nutrition tracker that installs to your phone's home screen. Enter each
food once from its label, tick off what you ate each day, and look at the trend.

Out of the box it tracks **total fat**, **saturated fat** and **cholesterol**, and
you can add more categories at any time from Settings — no code changes.

- **Day** — pick a date (today by default), add the foods you ate, see running
  totals against optional daily goals.
- **Foods** — your library of foods with the numbers off the label.
- **Summary** — pick a category and a period, get average / min / max and a
  day-by-day graph.
- **Settings** — nutrient categories, theme, backup and restore.

It is a plain static web app: no build step, no framework, no server, no account.
Everything lives in your browser's storage on the device you use it on.

## Running it on your phone

### Option A — GitHub Pages (recommended)

Push this repo to GitHub, then in the repo go to **Settings → Pages** and set
*Source* to **Deploy from a branch**, branch `main`, folder `/ (root)`. After a
minute the app is at `https://<you>.github.io/<repo>/`.

Make the repo **private** if you'd rather not have the code public — Pages on a
private repo needs a paid plan, so on the free plan either keep the repo public
(there is nothing personal in it; your data never leaves your phone) or use
option B.

Then, on your phone:

- **iPhone** — open the URL in **Safari** (it must be Safari), tap the Share
  button, then **Add to Home Screen**.
- **Android** — open in Chrome, tap the ⋮ menu, then **Install app** /
  **Add to Home screen**.

You now have an icon that opens fullscreen with no browser chrome, and it works
with no signal — the service worker caches the whole app.

### Option B — straight off your computer

Any static file server works; the app uses ES modules, so opening `index.html`
as a `file://` URL will *not* work.

```sh
python3 -m http.server 8000
# then visit http://<your-computer's-LAN-ip>:8000 on your phone
```

Note that "Add to Home Screen" only gives you a true offline app over `https://`
or `localhost` — over a plain LAN address iOS will not register the service
worker, so keep the tab open or use option A.

## Your data

Everything is stored in `localStorage` under the key `nutrition-tracker`, on the
device, in the browser you installed it from. It is never uploaded anywhere.

That also means it is only as durable as that browser's storage:

- **Export a backup** from Settings before clearing browser data, switching
  browsers, or moving to a new phone. You get a dated `.json` file.
- **Import** takes that file back, either **merged** into what is already there
  (foods are matched by name, so re-importing the same file changes nothing) or
  as a full **replace**.
- Installing to the home screen makes iOS treat the storage as persistent, so
  it survives normally. A browser tab you never open for weeks is more at risk.

## Adding a nutrient category later

**Settings → Add a category.** Give it a name, a unit (`g`, `mg`, `kcal`, …),
how many decimal places to show, and optionally a daily goal — a goal draws a
progress bar on the Day tab and a reference line on the graph.

The new category shows up immediately everywhere: on the food form, on the day
totals, and as a chip on the Summary tab. Existing foods have no value recorded
for it until you edit them, and count as 0 in the meantime. Categories can be
reordered (the first one is what the Day tab shows beside each entry), hidden
without losing their numbers, or deleted outright.

## How it fits together

| File | What it does |
| --- | --- |
| `index.html` | App shell: header, view container, tab bar |
| `styles.css` | All styling, including the light/dark token sets |
| `js/app.js` | Hash router and render loop |
| `js/store.js` | The whole data layer: schema, migrations, queries, backup |
| `js/ui.js` | DOM helper, date helpers, number formatting, sheets, toasts |
| `js/foodform.js` | The add/edit-food sheet, shared by the Foods and Day tabs |
| `js/day.js` | Day tab: date navigation, totals, entries, food picker |
| `js/foods.js` | Foods tab: library, search, food detail |
| `js/summary.js` | Summary tab: period and category filters, stats |
| `js/chart.js` | The bar chart, drawn as inline SVG |
| `js/settings.js` | Settings tab: categories, theme, import/export |
| `sw.js` | Service worker — offline cache of the app shell |
| `tools/make-icons.py` | Regenerates the icon set (stdlib only, no Pillow) |

Views are functions that build and return a DOM node; a change to the store
throws the current node away and builds a fresh one. At this data size that is
instant, and it means there is no state synchronisation to get wrong.

Data model, in one glance:

```js
nutrients: [{ id, name, unit, decimals, goal, enabled }]
foods:     [{ id, name, serving, note, values: { [nutrientId]: number }, archived }]
entries:   [{ id, date: 'YYYY-MM-DD', foodId, qty }]
```

Entries reference foods live, so correcting a food's numbers fixes the history
that used it. `qty` is a serving multiplier — two burritos is one entry with
`qty: 2`.

### Two things to remember when editing

1. **Bump `CACHE` in `sw.js`** after changing any file, or phones will keep
   serving the old copy from cache.
2. **Add a migration in `store.js`** if you change the shape of stored data;
   `migrate()` runs on every load and on every import, so old backups keep
   working.

Icons are generated, not hand-drawn — rerun `python3 tools/make-icons.py` after
changing the colour or glyph in that script.
