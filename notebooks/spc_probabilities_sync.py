"""
SPC Day 1 Probabilistic Outlooks — Hourly Sync
================================================
Fetches Day 1 tornado, wind, and hail probability GeoJSON from spc.noaa.gov
and syncs to 3 sublayers in a single hosted feature layer in AGOL.

Sublayers:
  0 = SPC Day 1 Tornado Prob
  1 = SPC Day 1 Wind Prob
  2 = SPC Day 1 Hail Prob

SCHEDULE:
  Schedule this notebook to run hourly in AGOL.
  Uses hosted feature layer: d30ce31d2fb844d2b6b741e0bef77354
"""

# %% Cell 1 — Authentication
from arcgis.gis import GIS
gis = GIS("home")
print(f"Connected as: {gis.users.me.username}")

# %% Cell 2 — Configuration
import requests
from arcgis.features import Feature
from arcgis.geometry import Polygon

ITEM_ID = "d30ce31d2fb844d2b6b741e0bef77354"

# Each entry: (sublayer index, feed URL, label)
FEEDS = [
    (0, "https://www.spc.noaa.gov/products/outlook/day1otlk_torn.nolyr.geojson", "Tornado"),
    (1, "https://www.spc.noaa.gov/products/outlook/day1otlk_wind.nolyr.geojson", "Wind"),
    (2, "https://www.spc.noaa.gov/products/outlook/day1otlk_hail.nolyr.geojson", "Hail"),
]

# %% Cell 3 — Fetch GeoJSON and parse features
def fetch_features(url, label):
    """Fetch a probabilistic outlook GeoJSON, return list of Features."""
    features = []

    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        geojson = resp.json()

        for feat in geojson.get("features", []):
            geom = feat.get("geometry", {})
            props = feat.get("properties", {})

            # Skip placeholder features
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
                "LABEL": props.get("LABEL", ""),
                "LABEL2": props.get("LABEL2", ""),
                "VALID": props.get("VALID", ""),
                "EXPIRE": props.get("EXPIRE", ""),
                "ISSUE": props.get("ISSUE", ""),
                "FORECASTER": props.get("FORECASTER", ""),
                "fill": props.get("fill", ""),
                "stroke": props.get("stroke", ""),
            }

            features.append(Feature(geometry=polygon, attributes=attributes))

    except Exception as e:
        print(f"  Error fetching {label}: {e}")

    return features

# %% Cell 4 — Sync all 3 sublayers
item = gis.content.get(ITEM_ID)
print(f"Item: {item.title}")

for idx, url, label in FEEDS:
    print(f"\n--- {label} (sublayer {idx}) ---")

    # Fetch features from SPC
    features = fetch_features(url, label)
    print(f"  Fetched {len(features)} features")

    # Get the sublayer
    fl = item.layers[idx]

    # Truncate existing data
    try:
        fl.manager.truncate()
        print("  Truncated existing features")
    except Exception:
        oids = fl.query(return_ids_only=True).get("objectIds", [])
        if oids:
            fl.edit_features(deletes=",".join(map(str, oids)))
            print(f"  Deleted {len(oids)} existing features")

    # Add new features in chunks
    if features:
        chunk_size = 200
        for i in range(0, len(features), chunk_size):
            chunk = features[i:i + chunk_size]
            result = fl.edit_features(adds=chunk)
            success = sum(1 for r in result.get("addResults", []) if r.get("success"))
            print(f"  Added {success}/{len(chunk)} features")
    else:
        print(f"  No active {label.lower()} data in current forecast")

    # Verify
    count = fl.query(return_count_only=True)
    print(f"  Layer count: {count}")

# %% Cell 5 — Summary
print(f"\n{'='*50}")
print("Sync complete — all 3 probabilistic layers updated")
print(f"Item: https://arc-nhq-gis.maps.arcgis.com/home/item.html?id={ITEM_ID}")
