"""
SPC Conditional Intensity Guidance (CIG) — Hourly Sync
======================================================
Fetches tornado, wind, and hail CIG GeoJSON from spc.noaa.gov
and syncs to a hosted feature layer in AGOL.

SETUP (run once):
  1. Run Cell 1 (Auth)
  2. Run Cell 2 (Create Layer) — note the item ID printed
  3. Paste the item ID into CIG_ITEM_ID in Cell 3
  4. Run Cell 3 + Cell 4 to test the sync

SCHEDULE:
  After setup, schedule this notebook to run hourly in AGOL.
  Cell 2 is skipped on subsequent runs (checks if layer exists).
"""

# %% Cell 1 — Authentication
from arcgis.gis import GIS
gis = GIS("home")
print(f"Connected as: {gis.users.me.username}")

# %% Cell 2 — Create Hosted Feature Layer (runs once, skips if exists)
import json
from arcgis.features import FeatureLayerCollection

SERVICE_NAME = "NWS_SPC_CIG"

# Check if layer already exists
existing = gis.content.search(
    f'title:"{SERVICE_NAME}" owner:{gis.users.me.username} type:"Feature Service"'
)

if existing:
    cig_item = existing[0]
    print(f"Layer already exists: {cig_item.id}")
else:
    # Create the feature service
    cig_item = gis.content.create_service(
        name=SERVICE_NAME,
        create_params={
            "name": SERVICE_NAME,
            "serviceDescription": "NWS SPC Conditional Intensity Guidance (CIG)",
            "hasStaticData": False
        },
        service_type="featureService"
    )

    # Define schema
    layer_def = {
        "type": "Feature Layer",
        "name": "CIG_Outlook",
        "geometryType": "esriGeometryPolygon",
        "objectIdField": "OBJECTID",
        "fields": [
            {"name": "OBJECTID", "type": "esriFieldTypeOID"},
            {"name": "DN", "type": "esriFieldTypeInteger", "alias": "DN"},
            {"name": "VALID", "type": "esriFieldTypeString", "alias": "Valid Time", "length": 50},
            {"name": "EXPIRE", "type": "esriFieldTypeString", "alias": "Expire Time", "length": 50},
            {"name": "ISSUE", "type": "esriFieldTypeString", "alias": "Issue Time", "length": 50},
            {"name": "FORECASTER", "type": "esriFieldTypeString", "alias": "Forecaster", "length": 100},
            {"name": "LABEL", "type": "esriFieldTypeString", "alias": "Label", "length": 50},
            {"name": "LABEL2", "type": "esriFieldTypeString", "alias": "Label 2", "length": 100},
            {"name": "stroke", "type": "esriFieldTypeString", "alias": "Stroke Color", "length": 20},
            {"name": "fill", "type": "esriFieldTypeString", "alias": "Fill Color", "length": 20},
            {"name": "hazard_type", "type": "esriFieldTypeString", "alias": "Hazard Type", "length": 20}
        ],
        "spatialReference": {"wkid": 4326},
        "capabilities": "Query,Editing,Create,Update,Delete",
        "drawingInfo": {
            "renderer": {
                "type": "uniqueValue",
                "field1": "hazard_type",
                "uniqueValueInfos": [
                    {
                        "value": "tornado",
                        "label": "Tornado",
                        "symbol": {
                            "type": "esriSFS", "style": "esriSFSSolid",
                            "color": [255, 165, 0, 130],
                            "outline": {"type": "esriSLS", "style": "esriSLSSolid", "color": [255, 140, 0, 255], "width": 1.5}
                        }
                    },
                    {
                        "value": "wind",
                        "label": "Wind",
                        "symbol": {
                            "type": "esriSFS", "style": "esriSFSSolid",
                            "color": [0, 120, 255, 130],
                            "outline": {"type": "esriSLS", "style": "esriSLSSolid", "color": [0, 100, 220, 255], "width": 1.5}
                        }
                    },
                    {
                        "value": "hail",
                        "label": "Hail",
                        "symbol": {
                            "type": "esriSFS", "style": "esriSFSSolid",
                            "color": [0, 200, 100, 130],
                            "outline": {"type": "esriSLS", "style": "esriSLSSolid", "color": [0, 170, 80, 255], "width": 1.5}
                        }
                    }
                ]
            }
        }
    }

    flc = FeatureLayerCollection.fromitem(cig_item)
    flc.manager.add_to_definition({"layers": [layer_def]})

    # Update item metadata
    cig_item.update(item_properties={
        "title": "NWS SPC Conditional Intensity Guidance (CIG)",
        "tags": "SPC,NWS,NOAA,CIG,conditional intensity,severe,tornado,wind,hail,2026",
        "snippet": "NWS Storm Prediction Center Conditional Intensity Guidance (CIG) — shows how intense severe weather could be if it occurs, covering tornado, wind, and hail hazards across the CONUS. Launched March 3, 2026. Synced hourly.",
        "description": (
            "Conditional Intensity Guidance (CIG) from the NOAA/NWS Storm Prediction Center (spc.noaa.gov). "
            "CIG adds a severity dimension to existing SPC outlooks — while probability outlooks show how likely "
            "severe weather is, CIG shows how intense it could be if it occurs. Covers tornado, wind, and hail hazards."
            "<br><br>"
            "Resources and Overview Videos (Released March 3, 2026):<br>"
            "<a href='https://www.spc.noaa.gov/exper/conditional-intensity-information/'>SPC CIG Information</a><br>"
            "<a href='https://www.weather.gov/news/262402-spc'>NWS Announcement</a>"
            "<br><br>"
            "Sources:<br>"
            "Tornado: https://www.spc.noaa.gov/products/outlook/day1otlk_cigtorn.nolyr.geojson<br>"
            "Wind: https://www.spc.noaa.gov/products/outlook/day1otlk_cigwind.nolyr.geojson<br>"
            "Hail: https://www.spc.noaa.gov/products/outlook/day1otlk_cighail.nolyr.geojson<br>"
            "<br>Synced hourly via ArcGIS Notebook."
        ),
        "accessInformation": "NOAA/NWS Storm Prediction Center",
        "licenseInfo": "Public domain — U.S. Government work"
    })

    print(f"Created layer: {cig_item.id}")
    print(f"URL: {cig_item.url}")

CIG_ITEM_ID = cig_item.id

# %% Cell 3 — Fetch CIG GeoJSON
import requests
from arcgis.features import Feature
from arcgis.geometry import Polygon

CIG_FEEDS = {
    "tornado": "https://www.spc.noaa.gov/products/outlook/day1otlk_cigtorn.nolyr.geojson",
    "wind": "https://www.spc.noaa.gov/products/outlook/day1otlk_cigwind.nolyr.geojson",
    "hail": "https://www.spc.noaa.gov/products/outlook/day1otlk_cighail.nolyr.geojson"
}

def fetch_cig_features():
    """Fetch all 3 CIG feeds, return Features with valid polygons only."""
    all_features = []

    for hazard_type, url in CIG_FEEDS.items():
        try:
            resp = requests.get(url, timeout=30)
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
                    "fill": props.get("fill", ""),
                    "hazard_type": hazard_type
                }

                all_features.append(Feature(geometry=polygon, attributes=attributes))

        except Exception as e:
            print(f"Error fetching {hazard_type}: {e}")

    return all_features

features = fetch_cig_features()
print(f"Fetched {len(features)} CIG features with active geometry")

# %% Cell 4 — Sync to Hosted Feature Layer
item = gis.content.get(CIG_ITEM_ID)
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
    print("No active CIG data — no severe weather in current forecast")

# Summary
count = fl.query(return_count_only=True)
print(f"\nSync complete — {count} features in layer")
print(f"Item: https://arc-nhq-gis.maps.arcgis.com/home/item.html?id={CIG_ITEM_ID}")
