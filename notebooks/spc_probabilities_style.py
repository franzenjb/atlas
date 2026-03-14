"""
SPC Day 1 Probabilistic Outlooks — Symbology & Popup Setup
============================================================
One-time run to configure color symbology and HTML popups
on the 3 sublayers (Tornado, Wind, Hail).

Colors are read from the actual SPC data (fill field), so they
match SPC's official palette exactly.

Run this AFTER spc_probabilities_sync.py has populated the layers.
"""

# %% Cell 1 — Authentication
from arcgis.gis import GIS
gis = GIS("home")
print(f"Connected as: {gis.users.me.username}")

# %% Cell 2 — Configuration
import requests

ITEM_ID = "d30ce31d2fb844d2b6b741e0bef77354"

FEEDS = [
    (0, "https://www.spc.noaa.gov/products/outlook/day1otlk_torn.nolyr.geojson", "Tornado"),
    (1, "https://www.spc.noaa.gov/products/outlook/day1otlk_wind.nolyr.geojson", "Wind"),
    (2, "https://www.spc.noaa.gov/products/outlook/day1otlk_hail.nolyr.geojson", "Hail"),
]

def hex_to_rgba(hex_color, alpha=140):
    """Convert '#RRGGBB' to [R, G, B, A] for AGOL renderer."""
    h = hex_color.lstrip("#")
    return [int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), alpha]

def hex_to_rgba_solid(hex_color):
    """Convert '#RRGGBB' to [R, G, B, 255] for outlines."""
    return hex_to_rgba(hex_color, 255)

# %% Cell 3 — Build renderer from live SPC data
def build_renderer(url, label):
    """Fetch SPC GeoJSON and build unique-value renderer from actual data."""
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    geojson = resp.json()

    # Extract unique LABEL → fill/stroke combos
    seen = {}
    for feat in geojson.get("features", []):
        props = feat.get("properties", {})
        lbl = props.get("LABEL", "")
        if not lbl or props.get("DN", 0) == 0:
            continue
        if lbl not in seen:
            seen[lbl] = {
                "fill": props.get("fill", "#808080"),
                "stroke": props.get("stroke", "#666666"),
                "label2": props.get("LABEL2", lbl),
            }

    # Sort by LABEL (probability values sort correctly as strings for SPC)
    unique_values = []
    for lbl in sorted(seen.keys()):
        info = seen[lbl]
        unique_values.append({
            "value": lbl,
            "label": f"{info['label2']}",
            "symbol": {
                "type": "esriSFS",
                "style": "esriSFSSolid",
                "color": hex_to_rgba(info["fill"], 140),
                "outline": {
                    "type": "esriSLS",
                    "style": "esriSLSSolid",
                    "color": hex_to_rgba_solid(info["stroke"]),
                    "width": 1.5
                }
            }
        })

    renderer = {
        "type": "uniqueValue",
        "field1": "LABEL",
        "defaultSymbol": {
            "type": "esriSFS",
            "style": "esriSFSSolid",
            "color": [128, 128, 128, 100],
            "outline": {"type": "esriSLS", "style": "esriSLSSolid", "color": [100, 100, 100, 255], "width": 1}
        },
        "defaultLabel": "Other",
        "uniqueValueInfos": unique_values
    }

    print(f"  {label}: {len(unique_values)} probability levels")
    for uv in unique_values:
        print(f"    {uv['value']} → {uv['label']} ({seen[uv['value']]['fill']})")

    return renderer

# %% Cell 4 — Popup template
def build_popup(hazard_name):
    """Build HTML popup template for a probabilistic outlook layer."""
    popup = {
        "title": f"SPC {hazard_name} Probability",
        "expressionInfos": [
            {
                "name": "valid-et",
                "title": "Valid (ET)",
                "expression": """
                    var raw = $feature.VALID;
                    if (IsEmpty(raw) || Count(raw) < 12) return raw;
                    var y = Number(Mid(raw,0,4));
                    var mo = Number(Mid(raw,4,2));
                    var d = Number(Mid(raw,6,2));
                    var h = Number(Mid(raw,8,2));
                    var mn = Number(Mid(raw,10,2));
                    var dt = Date(y, mo-1, d, h, mn);
                    var et = DateAdd(dt, -5, 'hours');
                    return Text(et, 'MMM D, Y h:mm A') + ' ET';
                """,
                "returnType": "string"
            },
            {
                "name": "expire-et",
                "title": "Expires (ET)",
                "expression": """
                    var raw = $feature.EXPIRE;
                    if (IsEmpty(raw) || Count(raw) < 12) return raw;
                    var y = Number(Mid(raw,0,4));
                    var mo = Number(Mid(raw,4,2));
                    var d = Number(Mid(raw,6,2));
                    var h = Number(Mid(raw,8,2));
                    var mn = Number(Mid(raw,10,2));
                    var dt = Date(y, mo-1, d, h, mn);
                    var et = DateAdd(dt, -5, 'hours');
                    return Text(et, 'MMM D, Y h:mm A') + ' ET';
                """,
                "returnType": "string"
            }
        ],
        "fieldInfos": [],
        "popupElements": [
            {
                "type": "text",
                "text": f"""
                <div style="font-family: -apple-system, sans-serif;">
                    <div style="background: {{{{fill}}}}; color: #fff; padding: 8px 12px; border-radius: 4px 4px 0 0; font-weight: 700; font-size: 14px;">
                        SPC {hazard_name} Probability
                    </div>
                    <div style="padding: 10px 12px; background: #1e1e1e; border-radius: 0 0 4px 4px;">
                        <div style="font-size: 28px; font-weight: 700; color: {{{{fill}}}}; margin-bottom: 6px;">
                            {{{{LABEL2}}}}
                        </div>
                        <table style="width:100%; font-size: 13px; color: #ccc; border-collapse: collapse;">
                            <tr style="border-bottom: 1px solid #333;">
                                <td style="padding: 5px 0; color: #888;">Valid</td>
                                <td style="padding: 5px 0; text-align: right;">{{{{expression/valid-et}}}}</td>
                            </tr>
                            <tr style="border-bottom: 1px solid #333;">
                                <td style="padding: 5px 0; color: #888;">Expires</td>
                                <td style="padding: 5px 0; text-align: right;">{{{{expression/expire-et}}}}</td>
                            </tr>
                            <tr style="border-bottom: 1px solid #333;">
                                <td style="padding: 5px 0; color: #888;">Forecaster</td>
                                <td style="padding: 5px 0; text-align: right;">{{{{FORECASTER}}}}</td>
                            </tr>
                            <tr>
                                <td style="padding: 5px 0; color: #888;">Risk Code</td>
                                <td style="padding: 5px 0; text-align: right; font-family: monospace;">{{{{LABEL}}}} (DN {{{{DN}}}})</td>
                            </tr>
                        </table>
                    </div>
                </div>
                """
            }
        ]
    }
    return popup

# %% Cell 5 — Apply renderer + popup to all 3 sublayers
import json

item = gis.content.get(ITEM_ID)
print(f"Item: {item.title}\n")

# Apply renderer via service definition (this works)
for idx, url, label in FEEDS:
    print(f"--- {label} (sublayer {idx}) ---")

    renderer = build_renderer(url, label)
    fl = item.layers[idx]

    fl.manager.update_definition({
        "drawingInfo": {
            "renderer": renderer,
            "transparency": 25
        }
    })
    print(f"  Applied renderer")

# Apply popups via item data (popupInfo lives here, not on service def)
item_data = item.get_data() or {}
item_data.setdefault("layers", [])

for idx, url, label in FEEDS:
    popup = build_popup(label)

    # Find existing layer entry or create one
    layer_entry = None
    for l in item_data["layers"]:
        if l.get("id") == idx:
            layer_entry = l
            break
    if not layer_entry:
        layer_entry = {"id": idx}
        item_data["layers"].append(layer_entry)

    layer_entry["popupInfo"] = popup
    print(f"  Set popup for {label} (sublayer {idx})")

item.update(data=json.dumps(item_data))
print(f"\n  Saved popup config to item data")

print(f"\n{'='*50}")
print("Styling complete — all 3 sublayers configured")
print(f"Item: https://arc-nhq-gis.maps.arcgis.com/home/item.html?id={ITEM_ID}")
