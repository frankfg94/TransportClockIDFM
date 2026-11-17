import csv
import datetime
import importlib.util
import io
import unittest
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "ter_cross_feed", Path(__file__).parents[1] / "scripts/gtfs/audit-ter-cross-feed.py"
)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
compiler_spec = importlib.util.spec_from_file_location(
    "ter_map_compiler", Path(__file__).parents[1] / "scripts/gtfs/compile-ter-map.py"
)
compiler = importlib.util.module_from_spec(compiler_spec)
compiler_spec.loader.exec_module(compiler)


def archive(files):
    data = io.BytesIO()
    with zipfile.ZipFile(data, "w") as z:
        for name, table in files.items():
            buf = io.StringIO(newline="")
            writer = csv.writer(buf)
            writer.writerows(table)
            z.writestr(name, buf.getvalue())
    data.seek(0)
    return zipfile.ZipFile(data)


def call(seq, name, arrival):
    return {"sequence": seq, "name": name, "arrival": arrival, "departure": arrival}


class CrossFeedAuditTest(unittest.TestCase):
    def test_compiler_preserves_distinct_routes_and_ignores_non_train_and_generic_names(self):
        def item(line, route, code):
            return {"idfm": {"routeId": line, "routeName": "TER Normandie", "tripId": route},
                    "sncf": {"routeId": route, "publicCode": code, "routeName": "Paris - Granville",
                             "color": "BF005F", "textColor": "FFFFFF"},
                    "matchingStops": [{}, {}]}
        observations = {"serviceDate": "20261116", "idfmSha256": "a" * 64, "sncfSha256": "b" * 64,
                        "matches": [item("IDFM:1", "r1", "K3"), item("IDFM:1", "r2", "K3+"),
                                    item("IDFM:1", "r3", "TER"), item("IDFM:2", "r4", "K4")]}
        manifest = {"dataVersion": "v1"}
        bootstrap = {"dataVersion": "v1", "lines": [["line:IDFM:1", "", "", "TRAIN"],
                                                       ["line:IDFM:2", "", "", "TRANSILIEN"]]}
        document = compiler.compile_document(observations, manifest, bootstrap)
        self.assertEqual([r["code"] for r in document["entries"][0]["routes"]], ["K3", "K3+"])
        self.assertEqual(len(document["entries"]), 1)
        with self.assertRaises(ValueError):
            compiler.compile_document(observations, {"dataVersion": "other"}, bootstrap)

    def test_matching_stops_need_order_and_time(self):
        left = [call(1, "Dreux", "07:20:00"), call(2, "Versailles Chantiers", "08:03:30")]
        self.assertEqual(len(audit.matching_calls(left, [
            call(1, "Dreux", "07:20:00"), call(2, "Versailles-Chantiers", "08:03:00"),
        ])), 2)
        self.assertEqual(len(audit.matching_calls(left, [
            call(1, "Versailles Chantiers", "08:03:00"), call(2, "Dreux", "07:20:00"),
        ])), 1)
        self.assertEqual(len(audit.matching_calls(left, [
            call(1, "Dreux", "07:21:01"), call(2, "Versailles Chantiers", "08:03:00"),
        ])), 1)

    def test_one_idfm_line_can_have_multiple_codes_and_ambiguous_numbers_are_ignored(self):
        stops = [["stop_id", "stop_name"], ["a", "Dreux"], ["b", "Versailles Chantiers"]]
        dates = [["service_id", "date", "exception_type"], ["s", "20261116", "1"]]
        calls = [["trip_id", "stop_id", "stop_sequence", "arrival_time", "departure_time"]]
        def stop_rows(ids):
            return calls + [row for ident in ids for row in (
                [ident, "a", "1", "07:20:00", "07:20:00"],
                [ident, "b", "2", "08:03:00", "08:03:00"],
            )]

        idfm = archive({
            "routes.txt": [["route_id", "route_type", "route_short_name", "route_long_name"],
                           ["idfm", "2", "TER", "TER Normandie"]],
            "calendar_dates.txt": dates, "stops.txt": stops,
            "trips.txt": [["trip_id", "route_id", "service_id", "trip_short_name"],
                          ["i1", "idfm", "s", "3402"], ["i2", "idfm", "s", "3403"],
                          ["i3", "idfm", "s", "3404"]],
            "stop_times.txt": stop_rows(["i1", "i2", "i3"]),
        })
        sncf = archive({
            "routes.txt": [["route_id", "route_type", "route_short_name", "route_long_name", "route_color", "route_text_color"],
                           ["r1", "2", "K3+", "Paris - Deauville", "123456", "FFFFFF"],
                           ["r2", "2", "K4", "Paris - Granville", "ABCDEF", "FFFFFF"]],
            "calendar_dates.txt": dates, "stops.txt": stops,
            "trips.txt": [["trip_id", "route_id", "service_id", "trip_headsign"],
                          ["s1", "r1", "s", "3402"], ["s2", "r2", "s", "3403"],
                          ["s3", "r1", "s", "3404"], ["s4", "r2", "s", "3404"]],
            "stop_times.txt": stop_rows(["s1", "s2", "s3", "s4"]),
        })
        with idfm, sncf:
            found = audit.observations(idfm, sncf, datetime.date(2026, 11, 16))
        self.assertEqual({x["sncf"]["publicCode"] for x in found}, {"K3+", "K4"})
        self.assertEqual({x["trainNumber"] for x in found}, {"3402", "3403"})
        self.assertTrue(all(x["idfm"]["routeId"] == "idfm" for x in found))


if __name__ == "__main__":
    unittest.main()
