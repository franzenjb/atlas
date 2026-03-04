"""
SPC Day 1 Categorical Outlook — Hourly Sync
=============================================
Fetches the Day 1 Categorical Convective Outlook GeoJSON from spc.noaa.gov
and syncs to a hosted feature layer in AGOL.

Risk levels: TSTM → MRGL → SLGT → ENH → MDT → HIGH

SCHEDULE:
  Schedule this notebook to run hourly in AGOL.
  Uses existing hosted feature layer (c0df94b392474f888f4420f79cb46aa1).
"""

# %% Cell 1 — Authentication
from arcgis.gis import GIS
gis = GIS("home")
print(f"Connected as: {gis.users.me.username}")

# %% Cell 2 — Fetch Categorical GeoJSON
import requests
from arcgis.features import Feature
from arcgis.geometry import Polygon

CAT_FEED = "https://www.spc.noaa.gov/products/outlook/day1otlk_cat.nolyr.geojson"
CAT_ITEM_ID = "c0df94b392474f888f4420f79cb46aa1"

def fetch_categorical_features():
    """Fetch Day 1 Categorical outlook, return Features with valid polygons only."""
    all_features = []

    try:
        resp = requests.get(CAT_FEED, timeout=30)
        resp.raise_for_status()
        geojson = resp.json()

        for feat in geojson.get("features", []):
            geom = feat.get("geometry", {})
            props = feat.get("properties", {})

            # Skip placeholder features (no active forecast)
            if props.get("DN", 0) == 0:
                continue

            # Extract polygon rings from GeoJSON geometry
            rings = []
            if geom["type"] == "Polygon":
                rings = geom["coordinates"]
            elif geom["type"] == "MultiPolygon":
                for poly in geom["coordinates"]:
                    rings.extend(poly)
            elif geom["type"] == "GeometryCollection":
                for g in geom.get("geometries", []):
                    if g["type"] == "Polygon":
                        rings.extend(g["coordinates"])
                    elif g["type"] == "MultiPolygon":
                        for poly in g["coordinates"]:
                            rings.extend(poly)

            if not rings:
                continue

            polygon = Polygon({
                "rings": rings,
                "spatialReference": {"wkid": 4326}
            })

            attributes = {
                "DN": props.get("DN"),
                "VALID": props.get("VALID", ""),
                "EXPIRE": props.get("EXPIRE", ""),
                "ISSUE": props.get("ISSUE", ""),
                "FORECASTER": props.get("FORECASTER", ""),
                "LABEL": props.get("LABEL", ""),
                "LABEL2": props.get("LABEL2", ""),
                "stroke": props.get("stroke", ""),
                "fill": props.get("fill", "")
            }

            all_features.append(Feature(geometry=polygon, attributes=attributes))

    except Exception as e:
        print(f"Error fetching categorical outlook: {e}")

    return all_features

features = fetch_categorical_features()
print(f"Fetched {len(features)} categorical features with active geometry")

# %% Cell 3 — Sync to Hosted Feature Layer
item = gis.content.get(CAT_ITEM_ID)
fl = item.layers[0]

# Truncate existing data
try:
    fl.manager.truncate()
    print("Truncated existing features")
except Exception:
    oids = fl.query(return_ids_only=True).get("objectIds", [])
    if oids:
        fl.edit_features(deletes=",".join(map(str, oids)))
        print(f"Deleted {len(oids)} existing features")

# Add new features if any exist
if features:
    chunk_size = 200
    for i in range(0, len(features), chunk_size):
        chunk = features[i:i + chunk_size]
        result = fl.edit_features(adds=chunk)
        success = sum(1 for r in result.get("addResults", []) if r.get("success"))
        print(f"Added {success}/{len(chunk)} features")
else:
    print("No active categorical data — no severe weather in current forecast")

# Summary
count = fl.query(return_count_only=True)
print(f"\nSync complete — {count} features in layer")
print(f"Item: https://arc-nhq-gis.maps.arcgis.com/home/item.html?id={CAT_ITEM_ID}")
