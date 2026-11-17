"""Audit observed TER links in two GTFS archives; this does not modify a map pack.

Example: python scripts/gtfs/audit-ter-cross-feed.py --idfm idfm.zip
         --sncf sncf.zip --date 20261116 --output observations.json

The IDFM trip_short_name and SNCF trip_headsign are train numbers in the
examined feeds, not public line codes. A pair must be unique on the chosen
service date and must also have two ordered, distinct matching stops within
one minute. The result is evidence for observed trips, not a complete mapping.
"""

import argparse
import collections
import csv
import datetime
import hashlib
import io
import json
import re
import unicodedata
import zipfile
from pathlib import Path


def read_rows(archive, name):
    with archive.open(name) as raw:
        with io.TextIOWrapper(raw, encoding="utf-8-sig", newline="") as stream:
            yield from csv.DictReader(stream)


def active_services(archive, date):
    day = date.strftime("%Y%m%d")
    weekday = date.strftime("%A").lower()
    active = set()
    if "calendar.txt" in archive.namelist():
        for row in read_rows(archive, "calendar.txt"):
            if row["start_date"] <= day <= row["end_date"] and row[weekday] == "1":
                active.add(row["service_id"])
    if "calendar_dates.txt" in archive.namelist():
        for row in read_rows(archive, "calendar_dates.txt"):
            if row["date"] == day:
                if row["exception_type"] == "1":
                    active.add(row["service_id"])
                elif row["exception_type"] == "2":
                    active.discard(row["service_id"])
    return active


def station_key(name):
    text = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", text)


def seconds(value):
    try:
        h, m, s = map(int, value.split(":"))
        return h * 3600 + m * 60 + s if h >= 0 and 0 <= m < 60 and 0 <= s < 60 else None
    except (AttributeError, TypeError, ValueError):
        return None


def matching_calls(left, right):
    """Find ordered distinct names with independently matching arrival/departure times."""
    right = sorted(right, key=lambda call: call["sequence"])
    result, used_names, right_offset = [], set(), 0
    for a in sorted(left, key=lambda call: call["sequence"]):
        key = station_key(a["name"])
        if len(key) < 4 or key in used_names:
            continue
        for index in range(right_offset, len(right)):
            b = right[index]
            if station_key(b["name"]) != key:
                continue
            matches_time = any(
                x is not None and y is not None and abs(x - y) <= 60
                for x, y in ((seconds(a["arrival"]), seconds(b["arrival"])),
                             (seconds(a["departure"]), seconds(b["departure"])))
            )
            if matches_time:
                result.append({"idfm": a, "sncf": b})
                used_names.add(key)
                right_offset = index + 1
                break
    return result


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_calls(archive, trip_ids):
    stops = {row["stop_id"]: row["stop_name"] for row in read_rows(archive, "stops.txt")}
    result = collections.defaultdict(list)
    for row in read_rows(archive, "stop_times.txt"):
        if row["trip_id"] not in trip_ids:
            continue
        try:
            sequence = int(row["stop_sequence"])
        except ValueError:
            continue
        result[row["trip_id"]].append({
            "sequence": sequence, "stopId": row["stop_id"],
            "name": stops.get(row["stop_id"], ""),
            "arrival": row["arrival_time"], "departure": row["departure_time"],
        })
    return {key: sorted(value, key=lambda call: call["sequence"]) for key, value in result.items()}


def observations(idfm, sncf, date):
    idfm_services, sncf_services = active_services(idfm, date), active_services(sncf, date)
    idfm_routes = {r["route_id"]: r for r in read_rows(idfm, "routes.txt") if r["route_type"] == "2"}
    sncf_routes = {r["route_id"]: r for r in read_rows(sncf, "routes.txt") if r["route_type"] == "2"}
    idfm_trips = [r for r in read_rows(idfm, "trips.txt")
                  if r["route_id"] in idfm_routes and r["service_id"] in idfm_services
                  and r["trip_short_name"].isdigit()]
    sncf_trips = [r for r in read_rows(sncf, "trips.txt")
                  if r["route_id"] in sncf_routes and r["service_id"] in sncf_services
                  and r["trip_headsign"].isdigit()]
    idfm_count = collections.Counter(r["trip_short_name"] for r in idfm_trips)
    sncf_count = collections.Counter(r["trip_headsign"] for r in sncf_trips)
    sncf_by_number = {r["trip_headsign"]: r for r in sncf_trips if sncf_count[r["trip_headsign"]] == 1}
    pairs = []
    for trip in idfm_trips:
        number = trip["trip_short_name"]
        route = idfm_routes[trip["route_id"]]
        if route["route_short_name"] != "TER" or idfm_count[number] != 1 or number not in sncf_by_number:
            continue
        other = sncf_by_number[number]
        if not sncf_routes[other["route_id"]]["route_short_name"].strip():
            continue
        pairs.append((trip, other))
    idfm_calls = load_calls(idfm, {a["trip_id"] for a, _ in pairs})
    sncf_calls = load_calls(sncf, {b["trip_id"] for _, b in pairs})
    found = []
    for a, b in pairs:
        witnesses = matching_calls(idfm_calls.get(a["trip_id"], []), sncf_calls.get(b["trip_id"], []))
        if len(witnesses) < 2:
            continue
        ir, sr = idfm_routes[a["route_id"]], sncf_routes[b["route_id"]]
        found.append({
            "trainNumber": a["trip_short_name"],
            "idfm": {"routeId": a["route_id"], "routeName": ir["route_long_name"],
                     "tripId": a["trip_id"], "serviceId": a["service_id"]},
            "sncf": {"routeId": b["route_id"], "publicCode": sr["route_short_name"],
                     "routeName": sr["route_long_name"], "color": sr["route_color"],
                     "textColor": sr["route_text_color"], "tripId": b["trip_id"],
                     "serviceId": b["service_id"]},
            "matchingStops": witnesses,
        })
    return found


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--idfm", type=Path, required=True)
    parser.add_argument("--sncf", type=Path, required=True)
    parser.add_argument("--date", required=True, help="service date, YYYYMMDD")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    date = datetime.datetime.strptime(args.date, "%Y%m%d").date()
    with zipfile.ZipFile(args.idfm) as idfm, zipfile.ZipFile(args.sncf) as sncf:
        matches = observations(idfm, sncf, date)
    result = {"serviceDate": args.date, "idfmSha256": sha256(args.idfm),
              "sncfSha256": sha256(args.sncf), "matches": matches}
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(matches)} observed trips written to {args.output}")


if __name__ == "__main__":
    main()
