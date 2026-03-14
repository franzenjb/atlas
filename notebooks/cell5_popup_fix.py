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
