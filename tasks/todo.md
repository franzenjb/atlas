# ATLAS: Supabase-Style Collapsible Sidebar

## Status: IN PROGRESS — paused for context reset

## What's Done
- Built and deployed a working Supabase-style sidebar on **calcite-sitaware** (wrong project!)
- The sidebar design is APPROVED by Jeff — monochrome calcite-icons, background pill active state, spacing-based groups
- Live reference: https://calcite-sitaware.vercel.app/map.html (click hamburger to expand)

## What Needs to Happen
Port the Supabase sidebar to `~/atlas/` — replacing the current `#layer-bar` (index.html lines 49-76).

### Files to modify in ~/atlas/:

#### 1. index.html — Replace `#layer-bar` (lines 49-76) with sidebar
The sidebar HTML structure (from calcite-sitaware/map.html):
```html
<div id="sidebar" class="sidebar collapsed">
  <button class="sidebar-toggle" id="sidebarToggle">
    <calcite-icon icon="hamburger" scale="s"></calcite-icon>
  </button>
  <div class="sidebar-group"> <!-- Nav -->
    Home (home), Zoom In (plus), Zoom Out (minus)
  </div>
  <div class="sidebar-group"> <!-- Data layers -->
    Disasters (exclamation-mark-triangle), Fires (effects), Quakes (pin-tear)
  </div>
  <div class="sidebar-group"> <!-- Overlays -->
    Radar (satellite-3), QPF (rain), Warnings (exclamation-mark-circle), SVI (users)
  </div>
  <div class="sidebar-group"> <!-- Outlooks -->
    Severe (flash), Tropical (cloudy), Flood Risk (effects)
  </div>
  <div class="sidebar-group sidebar-bottom"> <!-- Bottom -->
    Legend (legend), Settings (gear)
  </div>
</div>
```

All items use `<calcite-icon>` — monochrome, no colored SVGs.
Active state = `class="active"` → background pill highlight.
Layer items use `data-layer="disasters"` etc. matching existing toggle IDs.
Keep `id="toggle-disasters"` etc. on buttons so app.js wiring still works.

#### 2. css/app.css — Replace layer-bar styles (lines 767-906) with sidebar styles
Copy the sidebar CSS from calcite-sitaware/css/app.css — the `.sidebar`, `.sidebar-group`, `.sidebar-item`, `.sidebar-toggle`, `.sidebar-label`, `.sidebar-bottom` styles. Key properties:
- `background: #1c1c1c`, `width: 220px` expanded / `44px` collapsed
- `.sidebar-item.active { background: rgba(255,255,255,0.1); border-radius: 6px; }`
- Groups separated by `border-top: 1px solid rgba(255,255,255,0.06)`
- Position: `fixed; top: 56px; left: 0; bottom: 0;`

#### 3. js/app.js — Update layer toggle wiring (lines 103-136)
- The existing toggle IDs (`toggle-disasters`, `toggle-fires`, etc.) should be preserved as `id` attrs on sidebar buttons
- The existing click handler logic (lines 103-119) should still work since it reads `chip.classList.toggle('active', visible)`
- Replace layer-toggle/collapse wiring (lines 121-127) with sidebar expand/collapse toggle
- Add Home/Zoom In/Zoom Out action handlers
- The `soloLayer()` and `showAllDataLayers()` functions reference `toggle-*` IDs — keep working

#### 4. js/map.js — Remove ArcGIS Home/Zoom/Search widgets
Currently adds Home, Zoom, Search widgets to `view.ui`. Remove those since sidebar provides Home/Zoom. Add `zoomIn()`, `zoomOut()` to ATLAS.map module.

## Design Reference
See screenshots Jeff approved — Supabase dashboard sidebar:
- Collapsed: ~44px, centered monochrome icons
- Expanded: ~220px, icon + label, active = subtle background pill
- Groups separated by spacing + faint border, NO section labels
- Settings/gear at bottom
