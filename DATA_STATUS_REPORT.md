# Data Status Report — Mango Stamford Dataset

## What this is
Real, hardcoded Stamford data for the `opportunities` seed table defined in the PRD. No live scraping — static, researched entries, per the PRD's own non-goals.

## Status at a glance
49 real entries, above the PRD's 30-record minimum.

| Category | Entries | Target |
|---|---|---|
| CT — City + public | 3 | 3 |
| PR — Parks + Rec | 5 | 5 |
| UC — UConn Stamford | 6 | 6 |
| VO — Volunteer | 8 | 8 |
| EV — Culture + events | 8 | 8 |
| LP — Local places | 19 | 15+ |
| **Total** | **49** | **30 min** |

## What's done
- All 49 entries researched with real names, addresses, and a source link each
- Data lives in `data/Mango_Stamford_Dataset.xlsx`, converts to `packages/seed-data/opportunities.json` via `scripts/convert_to_json.py`
- Photos dropped from scope — no reliable way to source hotlinkable images safely. Using `source_url` as a "learn more" click-through instead (already present on every row, no extra work needed)

## Verified vs needs-check
40 of 49 rows fully verified (address/hours/price confirmed via source). 9 rows are a real place but have one detail (exact address, hours, or price) still needing a quick direct check before demo day — flagged in each row's `researcher_notes`.

By category: VO 5/8 verified, EV 7/8 verified, LP 14/19 verified. CT, PR, UC fully verified.

## Known gaps
Two of the PRD's 5 required hero records are missing a confirmed real-world detail:
- **Downtown Trivia Night** — no specific real venue/date found
- **Harbor Point Outdoor Yoga** — source is ambiguous (may actually be a different downtown park, not Harbor Point)

Both need local knowledge or a direct check, not more searching.

## Explicitly out of scope
- City event calendar — separate, live-updating, not seeded here
- People/social-matching personas — separate PRD requirement, team agreed to skip for now
- Live scraping/APIs — PRD non-goal, all data is static
