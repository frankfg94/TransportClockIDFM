"""Compile dated cross-feed observations into an optional global-map sidecar."""
import argparse
import collections
import hashlib
import json
import re
from pathlib import Path


def compile_document(observations, manifest, bootstrap):
    if bootstrap["dataVersion"] != manifest["dataVersion"]:
        raise ValueError("Map bootstrap and manifest versions do not match")
    allowed = {row[0] for row in bootstrap["lines"] if row[3] == "TRAIN"}
    groups = {}
    for item in observations["matches"]:
        line_id = "line:" + item["idfm"]["routeId"]
        route = item["sncf"]
        code = route["publicCode"].strip()
        if (line_id not in allowed or len(item["matchingStops"]) < 2 or not code
                or code.upper() in {"TER", "TGV", "TRAIN", "CAR"}):
            continue
        route_id = route["routeId"]
        key = (line_id, route_id)
        details = (code, route["routeName"], route["color"], route["textColor"])
        if key in groups and groups[key]["details"] != details:
            raise ValueError(f"Conflicting SNCF route metadata: {route_id}")
        group = groups.setdefault(key, {"details": details, "trips": set(),
                                       "networkLabel": item["idfm"]["routeName"]})
        if group["networkLabel"] != item["idfm"]["routeName"]:
            raise ValueError(f"Conflicting IDFM labels: {line_id}")
        group["trips"].add(item["idfm"]["tripId"])
    entries = collections.defaultdict(list)
    labels = {}
    for (line_id, route_id), group in sorted(groups.items()):
        code, name, color, text_color = group["details"]
        if not re.fullmatch(r"[0-9a-fA-F]{6}", color or ""):
            color = ""
        if not re.fullmatch(r"[0-9a-fA-F]{6}", text_color or ""):
            text_color = ""
        labels[line_id] = group["networkLabel"]
        entries[line_id].append({"code": code, "name": name, "color": color,
                                 "textColor": text_color, "sourceRouteId": route_id,
                                 "observedTrips": len(group["trips"])})
    return {"schemaVersion": 1, "dataVersion": manifest["dataVersion"],
            "serviceDate": observations["serviceDate"], "idfmSha256": observations["idfmSha256"],
            "sncfSha256": observations["sncfSha256"],
            "entries": [{"lineId": line_id, "networkLabel": labels[line_id], "routes": routes}
                        for line_id, routes in sorted(entries.items())]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--observations", type=Path, required=True)
    parser.add_argument("--map-dir", type=Path, required=True)
    args = parser.parse_args()
    manifest_path = args.map_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    bootstrap = json.loads((args.map_dir / manifest["files"]["bootstrap"]["asset"]).read_text(encoding="utf-8"))
    observations = json.loads(args.observations.read_text(encoding="utf-8"))
    document = compile_document(observations, manifest, bootstrap)
    raw = (json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    digest = hashlib.sha256(raw).hexdigest()
    asset = f"commercial-lines-{digest[:16]}.json"
    (args.map_dir / asset).write_bytes(raw)
    manifest["files"]["commercialLines"] = {"asset": asset, "bytes": len(raw), "checksum": digest}
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Compiled {len(document['entries'])} IDFM lines into {asset}")


if __name__ == "__main__":
    main()
