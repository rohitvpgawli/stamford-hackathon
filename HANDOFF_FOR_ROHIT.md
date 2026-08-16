# Handoff for Rohit — Dataset

See `DATA_STATUS_REPORT.md` for full detail. This is the short version: what's ready, what to do with it.

## Ready to use now
`opportunities.json` — 49 real Stamford entries. The Mango seed loader normalizes this source into the runtime `opportunities` table while preserving source URLs and provenance.

## If the data changes
Edit `Mango_Stamford_Dataset.xlsx`, then run:
```
python3 convert_to_json.py Mango_Stamford_Dataset.xlsx opportunities.json
```

Restarting Mango (or constructing `MangoDb` for a local sync) upserts the 49 catalog rows into SQLite. The local database keeps the deterministic hero records as well, for 83 opportunities total.

## Photos — decision made
Not doing photos. Couldn't reliably source safe, hotlinkable image URLs in time. Instead: every entry's `source_url` field is meant as a "learn more" click-through — tap a card, open the real source page. No image loading, no broken links, no risk of a fake photo on a real place.

## Still open
- 9 of 49 rows are flagged `researcher_notes` as needing a quick manual check (address/hours/price) — see the status report for which ones
- 2 of your 5 required hero records (Downtown Trivia Night, Harbor Point Yoga) don't have a confirmed real source — may need your local knowledge rather than more searching
- Worth a quick confirm from you: does `opportunities.json`'s shape actually match what you built, or does anything need adjusting?
