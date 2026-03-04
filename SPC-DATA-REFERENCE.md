# SPC Severe Weather Data — Complete Reference

> **Purpose:** Reference for all tools consuming SPC data (ATLAS, AGOL Web Maps, Python Notebooks, EB Apps).
> The data is richer than most implementations account for. This doc maps the full landscape.
>
> **Key lesson (March 4 2026):** Python notebook → hosted feature layers is BETTER than NWS MapServer for AGOL.
> Hosted layers give full control over popups, symbology, update frequency, and custom fields.
> MapServer is read-only — you get their default symbology and can't customize popups.
> ATLAS proves the architecture: separate layers per hazard type, each with rich styled popups.

---

## The Overlap Problem

SPC publishes **three tiers** of data for each outlook day. Most tools dump them all on one map layer, creating visual noise from overlapping semi-transparent polygons.

**Correct approach:** Separate layers with independent toggles. Group by day, then allow drill-down by type.

```
SPC Day 1 Outlook
├── Categorical (risk levels: TSTM → HIGH)        ← most useful, show by default
├── Tornado Probability (2%, 5%, 10%, 15%...)      ← drill-down
├── Wind Probability (5%, 15%, 30%, 45%...)        ← drill-down
├── Hail Probability (5%, 15%, 30%, 45%...)        ← drill-down
├── Significant Tornado (10%+ hatched)             ← specialist
├── Significant Wind (10%+ hatched)                ← specialist
├── Significant Hail (10%+ hatched)                ← specialist
├── CIG Tornado (conditional intensity 1-3)        ← new March 2026
├── CIG Wind (conditional intensity 1-3)           ← new March 2026
└── CIG Hail (conditional intensity 1-3)           ← new March 2026
```

This same structure repeats for **Day 2**. Day 3+ simplifies to categorical + combined probabilistic.

---

## Categorical Risk Levels

| DN | LABEL | LABEL2 | Fill Color | Meaning |
|----|-------|--------|------------|---------|
| 2  | TSTM  | General Thunderstorms Risk | `#C1E9C1` | 10%+ thunderstorm chance |
| 3  | MRGL  | Marginal Risk | `#66A366` | Isolated severe possible |
| 4  | SLGT  | Slight Risk | `#FFE066` | Scattered severe expected |
| 5  | ENH   | Enhanced Risk | `#FFA500` | Numerous severe storms |
| 6  | MDT   | Moderate Risk | `#E60000` | Widespread severe likely |
| 8  | HIGH  | High Risk | `#FF00FF` | Rare — regional severe outbreak |

> DN=0 is "No Thunder" (background polygon). Filter with `DN > 0` or `DN > 1` to skip TSTM.

---

## Three Data Access Methods

### 1. Direct GeoJSON from SPC (what ATLAS uses)

Live files at `https://www.spc.noaa.gov/products/outlook/`. Always current. No API key needed.

**Day 1 Convective:**
| Feed | URL | Notes |
|------|-----|-------|
| Categorical | `day1otlk_cat.nolyr.geojson` | Risk levels TSTM→HIGH |
| Tornado % | `day1otlk_torn.nolyr.geojson` | Probability contours |
| Tornado CIG | `day1otlk_cigtorn.nolyr.geojson` | Conditional intensity (new Mar 2026) |
| Sig Tornado | `day1otlk_sigtorn.nolyr.geojson` | 10%+ significant hatched |
| Wind % | `day1otlk_wind.nolyr.geojson` | Probability contours |
| Wind CIG | `day1otlk_cigwind.nolyr.geojson` | Conditional intensity |
| Sig Wind | `day1otlk_sigwind.nolyr.geojson` | 10%+ significant hatched |
| Hail % | `day1otlk_hail.nolyr.geojson` | Probability contours |
| Hail CIG | `day1otlk_cighail.nolyr.geojson` | Conditional intensity |
| Sig Hail | `day1otlk_sighail.nolyr.geojson` | 10%+ significant hatched |

**Day 2 Convective:** Same pattern — replace `day1` with `day2`.

**Day 3 Convective:**
| Feed | URL |
|------|-----|
| Categorical | `day3otlk_cat.nolyr.geojson` |
| Probabilistic (combined) | `day3otlk_prob.nolyr.geojson` |
| CIG Probabilistic | `day3otlk_cigprob.nolyr.geojson` |

**Day 4-8 Convective:** (at `/products/exper/day4-8/`)
| Feed | URL |
|------|-----|
| Day 4 | `day4prob.nolyr.geojson` |
| Day 5 | `day5prob.nolyr.geojson` |
| Day 6-8 | `day6prob`, `day7prob`, `day8prob` |

**Fire Weather Day 1-2:** (at `/products/fire_wx/`)
| Feed | URL |
|------|-----|
| Day 1 Dry Thunderstorm | `day1fw_dryt.nolyr.geojson` |
| Day 1 Wind/RH | `day1fw_windrh.nolyr.geojson` |
| Day 2 Dry Thunderstorm | `day2fw_dryt.nolyr.geojson` |
| Day 2 Wind/RH | `day2fw_windrh.nolyr.geojson` |

**Fire Weather Day 3-8:** (at `/products/exper/fire_wx/`)
Each day has 4 feeds: `drytcat`, `drytprob`, `windrhcat`, `windrhprob`.

> **`.nolyr` vs `.lyr`:** The `.nolyr` files contain flat polygons (easier to render). The `.lyr` files include styling metadata. Use `.nolyr` for custom rendering.

### 2. NWS MapServer (what AGOL Web Maps can use directly)

**Convective Outlooks:**
`https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer`

| Layer ID | Name |
|----------|------|
| **0** | **Day 1 Convective Outlook (group)** |
| 1 | Day 1 Categorical |
| 2 | Day 1 Significant Tornado |
| 3 | Day 1 Probabilistic Tornado |
| 4 | Day 1 Significant Hail |
| 5 | Day 1 Probabilistic Hail |
| 6 | Day 1 Significant Wind |
| 7 | Day 1 Probabilistic Wind |
| **8** | **Day 2 Convective Outlook (group)** |
| 9 | Day 2 Categorical |
| 10-15 | Day 2 Sig/Prob Tornado/Hail/Wind |
| **16** | **Day 3 Convective Outlook (group)** |
| 17 | Day 3 Categorical |
| 18 | Day 3 Significant Severe |
| 19 | Day 3 Probabilistic |
| **20** | **Day 4-8 Convective Outlook (group)** |
| 21-25 | Day 4-8 Probabilistic |

**Fire Weather:**
`https://mapservices.weather.noaa.gov/vector/rest/services/fire_weather/SPC_firewx/MapServer`

**Local Storm Reports:**
`https://mapservices.weather.noaa.gov/vector/rest/services/obs/nws_local_storm_reports/MapServer`

> MapServer is best for AGOL Web Maps — add as a layer, use sublayer IDs to show/hide. Always live. No sync needed.

### 3. AGOL Hosted Feature Layers (Python Notebook sync)

Jeff's current AGOL web map has 3 hosted layers synced hourly by a Python notebook:
1. **SPC Day 1 Categorical** — risk levels TSTM→HIGH
2. **SPC Conditional Intensity Guidance (CIG)** — tornado/wind/hail intensity
3. **SPC Convective Outlooks (NWS MapServer — Live)** — direct from NWS, Days 1-8

**Gap:** The AGOL map is missing separate tornado/wind/hail probability layers. The notebook syncs categorical and CIG but not the individual probabilistic feeds.

---

## GeoJSON Feature Properties

All SPC GeoJSON feeds share these properties:

```json
{
  "DN": 4,                              // Risk tier (int) — used for filtering/ordering
  "LABEL": "SLGT",                      // Short code
  "LABEL2": "Slight Risk",              // Human-readable
  "VALID": "202603041300",              // Valid start (UTC, YYYYMMDDHHNN)
  "EXPIRE": "202603051200",             // Valid end (UTC)
  "ISSUE": "202603041300",              // Issuance time (UTC)
  "VALID_ISO": "2026-03-04T13:00:00+00:00",  // ISO 8601 versions
  "EXPIRE_ISO": "2026-03-05T12:00:00+00:00",
  "ISSUE_ISO": "2026-03-04T13:00:00+00:00",
  "FORECASTER": "Gleason/Bentley",
  "fill": "#FFE066",                    // Polygon fill color (hex)
  "stroke": "#DDAA00"                   // Polygon outline color (hex)
}
```

> **Timestamp format:** `YYYYMMDDHHNN` in UTC. Convert to ET for display: parse as UTC Date, then `toLocaleString('en-US', { timeZone: 'America/New_York' })`.

---

## Recommended Layer Organization for Any Tool

### Minimal (3 layers — disaster response)
1. **SPC Outlook** — Day 1 Categorical (`day1otlk_cat`)
2. **SPC Probabilities** — combine tornado+wind+hail into one (accept overlap)
3. **Fire Weather** — Day 1 combined

### Standard (6 layers — what ATLAS uses)
1. **SPC Outlook** — Day 1 Categorical
2. **Tornado %** — Day 1 Tornado Probability
3. **Wind %** — Day 1 Wind Probability
4. **Hail %** — Day 1 Hail Probability
5. **SPC CIG** — Conditional Intensity (optional toggle)
6. **Fire Weather** — Day 1

### Full (for a dedicated severe weather app)
- Day 1-3 Categorical (3 layers)
- Day 1-2 Tornado/Wind/Hail Probabilities (6 layers)
- Day 1-2 Significant Tornado/Wind/Hail (6 layers)
- Day 1-2 CIG Tornado/Wind/Hail (6 layers)
- Day 3 Probabilistic + Significant (2 layers)
- Day 4-8 Probabilistic (5 layers)
- Fire Weather Day 1-8 (16 layers)

---

## CIG (Conditional Intensity Guidance) — New March 2026

Launched March 3, 2026 by SPC. Answers "IF severe weather occurs, how intense?"

- **Level 1:** Below average intensity
- **Level 2:** Average intensity
- **Level 3:** Above average intensity (damaging gusts, large hail, strong tornadoes)

CIG is ONLY meaningful where probabilistic outlooks already show a threat. It's a modifier, not standalone.

> Reference: https://www.weather.gov/news/262402-spc

---

## Update Frequencies

| Product | Update Cycle |
|---------|-------------|
| Day 1 Outlook | ~0600, ~1300, ~1630, ~2000 UTC |
| Day 2 Outlook | ~0600, ~1730 UTC |
| Day 3 Outlook | ~0730 UTC |
| Day 4-8 | ~0900 UTC daily |
| Fire Weather | Similar schedule |
| Mesoscale Discussions | As needed (watch precursors) |
| Watches | As needed |

---

## What the Python Notebook Should Produce

The current notebook syncs 3 layers. It needs to produce **10 separate hosted feature layers** to match ATLAS's architecture:

### Day 1 (priority — update hourly)
| Layer Name | GeoJSON Source | Notes |
|-----------|---------------|-------|
| SPC Day 1 Categorical | `day1otlk_cat.nolyr.geojson` | Risk levels TSTM→HIGH. **Already exists.** |
| SPC Day 1 Tornado % | `day1otlk_torn.nolyr.geojson` | **NEW — missing today** |
| SPC Day 1 Wind % | `day1otlk_wind.nolyr.geojson` | **NEW — missing today** |
| SPC Day 1 Hail % | `day1otlk_hail.nolyr.geojson` | **NEW — missing today** |
| SPC Day 1 Sig Tornado | `day1otlk_sigtorn.nolyr.geojson` | 10%+ hatched areas. **NEW** |
| SPC Day 1 Sig Wind | `day1otlk_sigwind.nolyr.geojson` | **NEW** |
| SPC Day 1 Sig Hail | `day1otlk_sighail.nolyr.geojson` | **NEW** |
| SPC Day 1 CIG | `day1otlk_cigtorn/cigwind/cighail` | **Already exists** (combine 3 feeds) |

### Day 2 (update every 6 hours)
| Layer Name | GeoJSON Source |
|-----------|---------------|
| SPC Day 2 Categorical | `day2otlk_cat.nolyr.geojson` |
| SPC Day 2 Tornado/Wind/Hail % | `day2otlk_torn/wind/hail` (combine or split) |

### Day 3-8 (update daily)
Can use NWS MapServer for these — less critical, no custom popups needed.

### AGOL Web Map Organization
```
📂 SPC Severe Weather (Group Layer)
├── 📂 Day 1 Convective
│   ├── Categorical (risk levels) ← on by default
│   ├── Tornado %
│   ├── Sig Tornado
│   ├── Wind %
│   ├── Sig Wind
│   ├── Hail %
│   ├── Sig Hail
│   └── CIG (intensity)
├── 📂 Day 2 Convective
│   ├── Categorical
│   └── Probabilities
├── 📂 Day 3-8 (MapServer — live, no sync)
└── 📂 Fire Weather (MapServer — live)
```

### Why Hosted > MapServer for Day 1-2
- **Custom popups** with formatted ET timestamps, color-coded banners, forecaster info
- **Custom symbology** matching ATLAS design system
- **Controlled update frequency** (hourly, not whenever NWS refreshes)
- **Offline resilience** — hosted layers survive NWS outages
- **Custom fields** — can add computed fields (risk score, area sq mi, etc.)

### What MapServer IS Good For
- Day 3-8 outlooks (low priority, no custom popups needed)
- Fire Weather (rarely used outside fire season)
- Fallback if notebook fails

---

## Quick Reference: Common GeoJSON URLs

```
# Day 1 (always have data)
https://www.spc.noaa.gov/products/outlook/day1otlk_cat.nolyr.geojson
https://www.spc.noaa.gov/products/outlook/day1otlk_torn.nolyr.geojson
https://www.spc.noaa.gov/products/outlook/day1otlk_wind.nolyr.geojson
https://www.spc.noaa.gov/products/outlook/day1otlk_hail.nolyr.geojson
https://www.spc.noaa.gov/products/outlook/day1otlk_cigtorn.nolyr.geojson
https://www.spc.noaa.gov/products/outlook/day1otlk_cigwind.nolyr.geojson
https://www.spc.noaa.gov/products/outlook/day1otlk_cighail.nolyr.geojson

# Day 2
https://www.spc.noaa.gov/products/outlook/day2otlk_cat.nolyr.geojson
https://www.spc.noaa.gov/products/outlook/day2otlk_torn.nolyr.geojson
https://www.spc.noaa.gov/products/outlook/day2otlk_wind.nolyr.geojson
https://www.spc.noaa.gov/products/outlook/day2otlk_hail.nolyr.geojson

# Day 3 (combined probabilistic, no per-hazard split)
https://www.spc.noaa.gov/products/outlook/day3otlk_cat.nolyr.geojson
https://www.spc.noaa.gov/products/outlook/day3otlk_prob.nolyr.geojson

# NWS MapServer (use for AGOL — always live)
https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer
https://mapservices.weather.noaa.gov/vector/rest/services/fire_weather/SPC_firewx/MapServer
```
