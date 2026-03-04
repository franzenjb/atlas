"""
SPC Severe Weather Web Map Builder
====================================
Creates a web map with three SPC layers, each serving a different purpose:

1. SPC Convective Outlooks (NWS MapServer — LIVE)
   Full suite of Day 1-8 outlooks direct from NWS. Always current, no sync needed.

2. SPC Day 1 Categorical Outlook (Hosted — HOURLY SYNC)
   Risk levels: TSTM → MRGL → SLGT → ENH → MDT → HIGH
   Hosted copy for querying, EB widgets, and analysis.

3. SPC Conditional Intensity Guidance / CIG (Hosted — HOURLY SYNC)
   NEW product (March 2026). Tornado, wind, and hail probability areas.
   Breaks down WHERE specific hazard types are most likely.

Run once to create the map. Sync notebooks update layers 2 and 3 hourly.
"""

# %% Cell 1 — Authentication
from arcgis.gis import GIS
gis = GIS("home")
print(f"Connected as: {gis.users.me.username}")

# %% Cell 2 — Apply categorical renderer + Build Web Map
import json

# Hosted feature layers (synced hourly by notebooks)
cat_item = gis.content.get("c0df94b392474f888f4420f79cb46aa1")
cat_layer = cat_item.layers[0]
cat_url = cat_layer.url
print(f"Categorical layer: {cat_url}")

cig_item = gis.content.get("d0d9f82fa32541efb758952fa80fe435")
cig_url = cig_item.layers[0].url
print(f"CIG layer: {cig_url}")

# SPC categorical renderer — unique values on LABEL field
spc_renderer = {
    "type": "uniqueValue",
    "field1": "LABEL",
    "fieldDelimiter": ",",
    "defaultSymbol": {
        "type": "esriSFS",
        "style": "esriSFSSolid",
        "color": [200, 200, 200, 80],
        "outline": {"type": "esriSLS", "style": "esriSLSSolid", "color": [150, 150, 150, 200], "width": 1}
    },
    "defaultLabel": "Other",
    "uniqueValueInfos": [
        {"value": "TSTM", "label": "Thunderstorm", "symbol": {"type": "esriSFS", "style": "esriSFSSolid", "color": [193, 233, 193, 130], "outline": {"type": "esriSLS", "style": "esriSLSSolid", "color": [140, 200, 140, 200], "width": 1}}},
        {"value": "MRGL", "label": "Marginal",     "symbol": {"type": "esriSFS", "style": "esriSFSSolid", "color": [102, 163, 102, 130], "outline": {"type": "esriSLS", "style": "esriSLSSolid", "color": [70, 130, 70, 200],   "width": 1}}},
        {"value": "SLGT", "label": "Slight",        "symbol": {"type": "esriSFS", "style": "esriSFSSolid", "color": [255, 224, 102, 130], "outline": {"type": "esriSLS", "style": "esriSLSSolid", "color": [220, 190, 70, 200],  "width": 1}}},
        {"value": "ENH",  "label": "Enhanced",      "symbol": {"type": "esriSFS", "style": "esriSFSSolid", "color": [255, 165, 0,   130], "outline": {"type": "esriSLS", "style": "esriSLSSolid", "color": [220, 140, 0, 200],   "width": 1}}},
        {"value": "MDT",  "label": "Moderate",      "symbol": {"type": "esriSFS", "style": "esriSFSSolid", "color": [255, 0,   0,   130], "outline": {"type": "esriSLS", "style": "esriSLSSolid", "color": [200, 0, 0, 200],     "width": 1}}},
        {"value": "HIGH", "label": "High",          "symbol": {"type": "esriSFS", "style": "esriSFSSolid", "color": [255, 0,   255, 130], "outline": {"type": "esriSLS", "style": "esriSLSSolid", "color": [200, 0, 200, 200],   "width": 1}}}
    ]
}

cat_layer.manager.update_definition({"drawingInfo": {"renderer": spc_renderer}})
print("Renderer applied to categorical layer")

# Layer order: array[0] = bottom of TOC (draws first), array[last] = top (draws last)
webmap_data = {
    "operationalLayers": [
        {
            "title": "SPC Convective Outlooks (NWS MapServer — Live)",
            "layerType": "ArcGISMapServiceLayer",
            "url": "https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer",
            "visibility": True,
            "opacity": 0.7
        },
        {
            "title": "SPC Day 1 Categorical Outlook (Hosted — Hourly Sync)",
            "layerType": "ArcGISFeatureLayer",
            "url": cat_url,
            "visibility": True,
            "opacity": 0.8
        },
        {
            "title": "SPC Conditional Intensity Guidance / CIG (Hosted — Hourly Sync)",
            "layerType": "ArcGISFeatureLayer",
            "url": cig_url,
            "visibility": True,
            "opacity": 0.8
        }
    ],
    "baseMap": {
        "title": "Dark Gray Canvas",
        "baseMapLayers": [
            {
                "url": "https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer",
                "layerType": "ArcGISTiledMapServiceLayer",
                "visibility": True
            },
            {
                "url": "https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Reference/MapServer",
                "layerType": "ArcGISTiledMapServiceLayer",
                "visibility": True,
                "isReference": True
            }
        ]
    },
    "initialState": {
        "viewpoint": {
            "targetGeometry": {
                "xmin": -130,
                "ymin": 20,
                "xmax": -65,
                "ymax": 55,
                "spatialReference": {"wkid": 4326}
            }
        }
    },
    "version": "2.29"
}

print("Web map JSON ready — 3 layers")

# %% Cell 3 — Save Web Map
snippet = (
    "Three SPC severe weather layers: "
    "(1) Convective Outlooks — live from NWS, always current. "
    "(2) Day 1 Categorical — risk levels TSTM through HIGH, hourly sync. "
    "(3) Conditional Intensity Guidance (CIG) — tornado/wind/hail probabilities, hourly sync."
)

new_map = gis.content.add(
    item_properties={
        "title": "SPC Severe Weather Outlooks — 3 Layers (Live + Hourly Sync)",
        "type": "Web Map",
        "tags": "SPC,NWS,NOAA,CIG,convective outlook,categorical,severe weather,tornado,wind,hail,2026",
        "snippet": snippet,
        "text": json.dumps(webmap_data)
    }
)

print(f"Web map created: {new_map.title}")
print(f"URL: https://arc-nhq-gis.maps.arcgis.com/home/item.html?id={new_map.id}")
