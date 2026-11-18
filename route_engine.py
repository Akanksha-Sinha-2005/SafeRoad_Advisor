"""Core routing, geocoding, congestion heuristic, and 2023 accident-risk scoring engine for RoadSafe."""

from __future__ import annotations

import csv
import math
import sqlite3
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import requests

# Configurable scoring weights (must sum to 1.0)
WEIGHT_TRAVEL_TIME: float = 0.4
WEIGHT_CONGESTION: float = 0.3
WEIGHT_ACCIDENT_RISK: float = 0.3

# Constants for routing, geocoding, and spatial sampling
OSRM_BASE_URL: str = "https://router.project-osrm.org/route/v1/driving"
NOMINATIM_URL: str = "https://nominatim.openstreetmap.org/search"
USER_AGENT: str = "RoadSafe-UrbanTrafficApp/1.0 (contact@roadsafe.local)"
HTTP_TIMEOUT_SECONDS: float = 6.0
STATION_SEARCH_RADIUS_KM: float = 1.0
HIGH_RISK_THRESHOLD: float = 0.60
POLYLINE_SAMPLE_STEP_KM: float = 0.5
FREE_FLOW_SPEED_KMH: float = 50.0
FALLBACK_SPEED_KMH: float = 35.0

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "roadsafe.db"
STATION_COORDS_CSV = BASE_DIR / "station_coordinates.csv"
ACCIDENTS_2023_CSV = BASE_DIR / "roadsafe_station_accidents_2023.csv"
HIST_RANKING_CSV = BASE_DIR / "roadsafe_historical_risk_ranking.csv"

SUMMARY_ROW_NAMES: Set[str] = {
    "total",
    "east total",
    "west total",
    "north total",
    "south total",
    "grand total",
}

# Verified WGS84 coordinates for the 48 stations in roadsafe_station_accidents_2023.csv
# Used when a station exists in the 2023 accident CSV but has not yet been geocoded in roadsafe.db
VERIFIED_2023_STATION_COORDS: Dict[str, Tuple[float, float]] = {
    "halasooru": (12.9779, 77.6245),
    "indiranagar": (12.9719, 77.6412),
    "pulikeshinagar": (12.9982, 77.6083),
    "banasawadi": (13.0142, 77.6518),
    "shivajinagar": (12.9857, 77.6057),
    "k g halli": (13.0294, 77.6192),
    "k r puram": (13.0012, 77.6714),
    "airport": (12.9606, 77.6649),
    "whitefield": (12.9698, 77.7499),
    "mahadevapura": (12.9915, 77.6958),
    "cubbon park": (12.9774, 77.5952),
    "h.grounds": (12.9896, 77.5825),
    "s.s.nagar": (12.9998, 77.5712),
    "u.gate": (12.9675, 77.5861),
    "ashokanagar": (12.9670, 77.6080),
    "w.garden": (12.9507, 77.5968),
    "upparpet": (12.9767, 77.5753),
    "chickpet": (12.9699, 77.5762),
    "city market": (12.9634, 77.5769),
    "bytarayanapura": (12.9538, 77.5419),
    "kengeri": (12.9081, 77.4856),
    "vijayanagar": (12.9716, 77.5322),
    "magadi road": (12.9756, 77.5553),
    "kamakshipalya": (12.9845, 77.5236),
    "r t nagar": (13.0213, 77.5949),
    "hebbala": (13.0358, 77.5970),
    "yalahanka": (13.1007, 77.5963),
    "chikkajala": (13.1592, 77.6353),
    "int. aiport": (13.1986, 77.7066),
    "hennuru": (13.0359, 77.6431),
    "malleshwaram": (13.0031, 77.5643),
    "rajajinagar": (12.9901, 77.5525),
    "yashawanthapura": (13.0238, 77.5529),
    "peenya": (13.0329, 77.5273),
    "jalahalli": (13.0467, 77.5479),
    "adugodi": (12.9428, 77.6104),
    "madivala": (12.9212, 77.6213),
    "micolayout": (12.9165, 77.6101),
    "hulimavu": (12.8773, 77.6022),
    "chamarajpet": (12.9571, 77.5633),
    "basavanagudi": (12.9417, 77.5736),
    "jayanagar": (12.9250, 77.5838),
    "banashankari": (12.9255, 77.5468),
    "k s layout": (12.9054, 77.5632),
    "thalagattapura": (12.8712, 77.5390),
    "hsr layout": (12.9121, 77.6446),
    "electronic city": (12.8452, 77.6602),
    "bellanduru": (12.9258, 77.6762),
}

_LAST_NOMINATIM_CALL: float = 0.0

try:
    import predict_risk as _predict_risk_mod  # type: ignore
except Exception:
    _predict_risk_mod = None

try:
    import historical_risk as _historical_risk_mod  # type: ignore
except Exception:
    _historical_risk_mod = None


def validate_coordinates(lat: float, lon: float) -> bool:
    """Return True if latitude and longitude are finite and within valid geographic bounds."""
    if not (math.isfinite(lat) and math.isfinite(lon)):
        return False
    return -90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Compute the great-circle distance in kilometers between two WGS84 points."""
    r_earth = 6371.0088
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(d_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2.0) ** 2
    )
    return 2.0 * r_earth * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))


def _parse_int(val: Any) -> int:
    """Safely parse an integer from a CSV cell that may contain commas or whitespace."""
    cleaned = str(val or "0").replace(",", "").strip()
    try:
        return int(float(cleaned))
    except ValueError:
        return 0


def load_2023_station_accidents(csv_path: Path = ACCIDENTS_2023_CSV) -> Dict[str, Dict[str, Any]]:
    """Load the 2023 station accident statistics from roadsafe_station_accidents_2023.csv.

    Filters out summary rows ('Total', 'East Total', 'West Total', 'North Total',
    'South Total', 'Grand Total') and computes a normalized 2023 severity risk score in [0, 1]
    from Fatal Cases, Killed People, Non-Fatal Cases, Injured People, and Total Cases.
    """
    records: Dict[str, Dict[str, Any]] = {}
    if not csv_path.exists():
        return records

    try:
        with csv_path.open("r", encoding="utf-8-sig") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                station_name = (row.get("Station") or row.get("station") or "").strip()
                if not station_name or station_name.lower() in SUMMARY_ROW_NAMES:
                    continue

                zone = (row.get("Zone") or "").strip()
                sub_div = (row.get("Sub-division") or "").strip()
                fatal_cases = _parse_int(row.get("2023 - Fatal Cases"))
                killed_people = _parse_int(row.get("2023 - Killed People"))
                non_fatal = _parse_int(row.get("2023 - Non-Fatal"))
                injured_people = _parse_int(row.get("2023 - Injured People"))
                total_cases = _parse_int(row.get("2023 - Total Cases"))

                # Severity index: weights fatal cases/deaths more heavily than non-fatal cases
                severity_index = (fatal_cases * 3.0) + (killed_people * 1.5) + (non_fatal * 1.0)
                records[station_name.lower()] = {
                    "name": station_name,
                    "zone": zone,
                    "sub_division": sub_div,
                    "fatal_cases_2023": fatal_cases,
                    "killed_2023": killed_people,
                    "non_fatal_2023": non_fatal,
                    "injured_2023": injured_people,
                    "total_cases_2023": total_cases,
                    "severity_index": severity_index,
                }
    except OSError:
        return {}

    if records:
        max_sev = max(r["severity_index"] for r in records.values()) or 1.0
        max_tot = max(r["total_cases_2023"] for r in records.values()) or 1
        for item in records.values():
            norm_sev = item["severity_index"] / max_sev
            norm_tot = item["total_cases_2023"] / max_tot
            item["risk_score_2023"] = round(min(1.0, 0.55 * norm_sev + 0.45 * norm_tot), 4)

    return records


def fetch_stations(db_path: Path = DB_PATH) -> List[Dict[str, Any]]:
    """Load the 48 stations from roadsafe.db / station_coordinates.csv enriched with 2023 accident metrics."""
    acc_2023 = load_2023_station_accidents(ACCIDENTS_2023_CSV)
    db_coords: Dict[str, Tuple[int, str, float, float]] = {}

    if db_path.exists():
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        try:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT id, name, latitude, longitude
                FROM stations
                WHERE latitude IS NOT NULL AND longitude IS NOT NULL
                ORDER BY name ASC
                """
            )
            for row in cur.fetchall():
                name = str(row["name"]).strip()
                if name.lower() in SUMMARY_ROW_NAMES:
                    continue
                lat, lon = float(row["latitude"]), float(row["longitude"])
                if validate_coordinates(lat, lon):
                    db_coords[name.lower()] = (int(row["id"]), name, lat, lon)
        except sqlite3.Error:
            pass
        finally:
            conn.close()

    if not db_coords and STATION_COORDS_CSV.exists():
        try:
            with STATION_COORDS_CSV.open("r", encoding="utf-8-sig") as fh:
                reader = csv.DictReader(fh)
                for idx, row in enumerate(reader, start=1):
                    name = (
                        row.get("Station")
                        or row.get("station")
                        or row.get("name")
                        or ""
                    ).strip()
                    if not name or name.lower() in SUMMARY_ROW_NAMES:
                        continue
                    try:
                        lat = float(row.get("latitude") or row.get("lat") or 0.0)
                        lon = float(row.get("longitude") or row.get("lon") or 0.0)
                    except (TypeError, ValueError):
                        continue
                    if validate_coordinates(lat, lon):
                        db_coords[name.lower()] = (idx, name, lat, lon)
        except OSError:
            pass

    stations: List[Dict[str, Any]] = []
    # Merge 2023 CSV stations with DB/CSV coordinates or verified fallback coordinates
    all_keys = list(acc_2023.keys()) if acc_2023 else list(db_coords.keys())
    if not all_keys:
        all_keys = list(VERIFIED_2023_STATION_COORDS.keys())

    for idx, key in enumerate(all_keys, start=1):
        rec_2023 = acc_2023.get(key, {})
        if key in db_coords:
            st_id, display_name, lat, lon = db_coords[key]
        elif key in VERIFIED_2023_STATION_COORDS:
            st_id = idx
            display_name = rec_2023.get("name") or key.title()
            lat, lon = VERIFIED_2023_STATION_COORDS[key]
        else:
            continue

        stations.append(
            {
                "id": st_id,
                "name": display_name,
                "zone": rec_2023.get("zone", ""),
                "sub_division": rec_2023.get("sub_division", ""),
                "lat": lat,
                "lon": lon,
                "fatal_cases_2023": rec_2023.get("fatal_cases_2023", 0),
                "killed_2023": rec_2023.get("killed_2023", 0),
                "non_fatal_2023": rec_2023.get("non_fatal_2023", 0),
                "injured_2023": rec_2023.get("injured_2023", 0),
                "total_cases_2023": rec_2023.get("total_cases_2023", 0),
                "risk_score_2023": rec_2023.get("risk_score_2023", 0.35),
            }
        )

    return stations


def resolve_location(query: str, db_path: Path = DB_PATH) -> Dict[str, Any]:
    """Resolve a 2023 RoadSafe station name, 'lat,lon' string, or free-text place to coordinates."""
    global _LAST_NOMINATIM_CALL

    cleaned = (query or "").strip()
    if not cleaned:
        raise ValueError("Location query must be a non-empty string.")

    stations = fetch_stations(db_path)

    # 1. Exact station match
    for st in stations:
        if st["name"].lower() == cleaned.lower():
            return {
                "label": st["name"],
                "lat": st["lat"],
                "lon": st["lon"],
                "source_type": "station",
            }

    # 2. Direct "lat,lon" coordinates
    if "," in cleaned:
        parts = [p.strip() for p in cleaned.split(",")]
        if len(parts) == 2:
            try:
                lat_val, lon_val = float(parts[0]), float(parts[1])
                if validate_coordinates(lat_val, lon_val):
                    return {
                        "label": f"{lat_val:.5f}, {lon_val:.5f}",
                        "lat": lat_val,
                        "lon": lon_val,
                        "source_type": "coordinates",
                    }
            except ValueError:
                pass

    # 3. Substring station match
    for st in stations:
        if cleaned.lower() in st["name"].lower():
            return {
                "label": st["name"],
                "lat": st["lat"],
                "lon": st["lon"],
                "source_type": "station_partial",
            }

    # 4. Nominatim geocoding with 1 req/sec rate limit and User-Agent
    elapsed = time.monotonic() - _LAST_NOMINATIM_CALL
    if elapsed < 1.0:
        time.sleep(1.0 - elapsed)

    headers = {"User-Agent": USER_AGENT, "Accept-Language": "en"}
    params = {"q": cleaned, "format": "json", "limit": 1}

    try:
        _LAST_NOMINATIM_CALL = time.monotonic()
        resp = requests.get(
            NOMINATIM_URL, params=params, headers=headers, timeout=HTTP_TIMEOUT_SECONDS
        )
        if resp.status_code == 429:
            time.sleep(1.5)
            _LAST_NOMINATIM_CALL = time.monotonic()
            resp = requests.get(
                NOMINATIM_URL, params=params, headers=headers, timeout=HTTP_TIMEOUT_SECONDS
            )
        resp.raise_for_status()
        results = resp.json()
        if isinstance(results, list) and results:
            lat = float(results[0]["lat"])
            lon = float(results[0]["lon"])
            if validate_coordinates(lat, lon):
                return {
                    "label": results[0].get("display_name", cleaned),
                    "lat": lat,
                    "lon": lon,
                    "source_type": "nominatim",
                }
    except requests.RequestException as exc:
        raise LookupError(f"Geocoding service unavailable for '{cleaned}': {exc}") from exc

    raise LookupError(f"Could not geocode location: '{cleaned}'.")


def _build_fallback_routes(
    src_lat: float, src_lon: float, dst_lat: float, dst_lon: float
) -> List[Dict[str, Any]]:
    """Generate 3 synthetic geometric route corridors when OSRM is unreachable or returns <3 routes."""
    direct_km = max(0.25, haversine_km(src_lat, src_lon, dst_lat, dst_lon))
    mid_lat = (src_lat + dst_lat) / 2.0
    mid_lon = (src_lon + dst_lon) / 2.0
    d_lat = dst_lat - src_lat
    d_lon = dst_lon - src_lon

    perp_lat = -d_lon
    perp_lon = d_lat
    norm = math.hypot(perp_lat, perp_lon) or 1.0
    perp_lat /= norm
    perp_lon /= norm

    deg_span = math.hypot(d_lat, d_lon) or 0.02
    offsets = [
        (0.0, 1.18),
        (0.14 * deg_span, 1.29),
        (-0.18 * deg_span, 1.37),
    ]

    routes: List[Dict[str, Any]] = []
    for idx, (offset, road_factor) in enumerate(offsets):
        wp_lat = mid_lat + perp_lat * offset
        wp_lon = mid_lon + perp_lon * offset
        coords: List[List[float]] = []
        steps = 24
        for i in range(steps + 1):
            t = i / steps
            lon_t = (1 - t) ** 2 * src_lon + 2 * (1 - t) * t * wp_lon + t ** 2 * dst_lon
            lat_t = (1 - t) ** 2 * src_lat + 2 * (1 - t) * t * wp_lat + t ** 2 * dst_lat
            coords.append([round(lon_t, 6), round(lat_t, 6)])

        dist_m = direct_km * road_factor * 1000.0
        speed_kmh = FALLBACK_SPEED_KMH * (1.0 if idx == 0 else (0.94 if idx == 1 else 0.90))
        duration_s = (dist_m / 1000.0) / speed_kmh * 3600.0
        routes.append(
            {
                "distance_m": dist_m,
                "duration_s": duration_s,
                "geometry": {"type": "LineString", "coordinates": coords},
                "is_fallback": True,
            }
        )
    return routes


def fetch_osrm_routes(
    src_lat: float, src_lon: float, dst_lat: float, dst_lon: float
) -> List[Dict[str, Any]]:
    """Query public OSRM HTTP API for up to 3 routes; pad or fallback to geometric estimate on failure.

    Note: [uncertain] Public OSRM (`router.project-osrm.org`) accepts `alternatives=3`,
    but may return fewer than 3 routes if distinct topological alternatives do not exist.
    When fewer than 3 routes are returned, synthetic alternative corridors are appended.
    """
    url = f"{OSRM_BASE_URL}/{src_lon:.6f},{src_lat:.6f};{dst_lon:.6f},{dst_lat:.6f}"
    params = {
        "alternatives": "3",
        "overview": "full",
        "geometries": "geojson",
    }
    headers = {"User-Agent": USER_AGENT}

    parsed_routes: List[Dict[str, Any]] = []
    try:
        resp = requests.get(url, params=params, headers=headers, timeout=HTTP_TIMEOUT_SECONDS)
        resp.raise_for_status()
        payload = resp.json()
        if payload.get("code") == "Ok" and isinstance(payload.get("routes"), list):
            for r in payload["routes"][:3]:
                geom = r.get("geometry") or {}
                coords = geom.get("coordinates") or []
                if len(coords) >= 2:
                    parsed_routes.append(
                        {
                            "distance_m": float(r.get("distance", 0.0)),
                            "duration_s": float(r.get("duration", 0.0)),
                            "geometry": {"type": "LineString", "coordinates": coords},
                            "is_fallback": False,
                        }
                    )
    except requests.RequestException:
        parsed_routes = []

    fallback_pool = _build_fallback_routes(src_lat, src_lon, dst_lat, dst_lon)
    while len(parsed_routes) < 3:
        parsed_routes.append(fallback_pool[len(parsed_routes)])

    return parsed_routes[:3]


def sample_polyline(
    coordinates: List[List[float]], step_km: float = POLYLINE_SAMPLE_STEP_KM
) -> List[Tuple[float, float]]:
    """Sample (lat, lon) points along a GeoJSON LineString at approximately step_km intervals."""
    if not coordinates:
        return []

    sampled: List[Tuple[float, float]] = [(float(coordinates[0][1]), float(coordinates[0][0]))]
    accum_km = 0.0

    for i in range(1, len(coordinates)):
        prev_lon, prev_lat = float(coordinates[i - 1][0]), float(coordinates[i - 1][1])
        cur_lon, cur_lat = float(coordinates[i][0]), float(coordinates[i][1])
        seg_km = haversine_km(prev_lat, prev_lon, cur_lat, cur_lon)
        if seg_km <= 0.0:
            continue
        while accum_km + seg_km >= step_km:
            remain = step_km - accum_km
            ratio = remain / seg_km
            interp_lat = prev_lat + ratio * (cur_lat - prev_lat)
            interp_lon = prev_lon + ratio * (cur_lon - prev_lon)
            sampled.append((interp_lat, interp_lon))
            prev_lat, prev_lon = interp_lat, interp_lon
            seg_km = haversine_km(prev_lat, prev_lon, cur_lat, cur_lon)
            accum_km = 0.0
        accum_km += seg_km

    last_lat, last_lon = float(coordinates[-1][1]), float(coordinates[-1][0])
    if sampled[-1] != (last_lat, last_lon):
        sampled.append((last_lat, last_lon))
    return sampled


# Weather impact multipliers and regression encodings for Predictive Traffic Forecasting
WEATHER_PROFILES: Dict[str, Dict[str, Any]] = {
    "clear": {"code": 0.0, "cong_boost": 0.00, "speed_factor": 1.00, "label": "Clear Sky"},
    "light_rain": {"code": 0.35, "cong_boost": 0.12, "speed_factor": 1.14, "label": "Light Rain"},
    "heavy_rain": {"code": 0.85, "cong_boost": 0.26, "speed_factor": 1.32, "label": "Heavy Rain"},
    "fog": {"code": 0.60, "cong_boost": 0.18, "speed_factor": 1.22, "label": "Fog / Low Visibility"},
}

_TRAFFIC_FORECAST_MODEL: Any = None


def _get_or_train_traffic_forecast_model() -> Any:
    """Train or return a cached scikit-learn GradientBoostingRegressor for Predictive Traffic Forecasting.

    Uses Fourier time-series harmonics (sin/cos of hour and half-day), day-of-week cyclical features,
    weather severity encoding, and corridor baseline delay ratio. Falls back gracefully if scikit-learn
    is unavailable.
    """
    global _TRAFFIC_FORECAST_MODEL
    if _TRAFFIC_FORECAST_MODEL is not None:
        return _TRAFFIC_FORECAST_MODEL

    try:
        import numpy as np  # type: ignore
        from sklearn.ensemble import GradientBoostingRegressor  # type: ignore

        xs: List[List[float]] = []
        ys: List[float] = []
        for day in range(7):
            is_wknd = 1.0 if day >= 5 else 0.0
            for hour in range(24):
                sin_h = math.sin(2.0 * math.pi * hour / 24.0)
                cos_h = math.cos(2.0 * math.pi * hour / 24.0)
                sin_12 = math.sin(4.0 * math.pi * hour / 24.0)
                cos_12 = math.cos(4.0 * math.pi * hour / 24.0)

                if not is_wknd:
                    if 8 <= hour <= 10:
                        temporal_base = 0.62
                    elif 17 <= hour <= 20:
                        temporal_base = 0.72
                    elif 11 <= hour <= 16:
                        temporal_base = 0.38
                    else:
                        temporal_base = 0.14
                else:
                    if 11 <= hour <= 20:
                        temporal_base = 0.36
                    else:
                        temporal_base = 0.12

                for w_code, w_boost in ((0.0, 0.0), (0.35, 0.12), (0.60, 0.18), (0.85, 0.26)):
                    for base_delay in (0.15, 0.35, 0.60):
                        target = min(
                            0.98,
                            max(
                                0.04,
                                0.55 * temporal_base
                                + 0.30 * base_delay
                                + w_boost
                                + (0.04 if day == 4 and 16 <= hour <= 21 else 0.0),
                            ),
                        )
                        xs.append([hour / 23.0, sin_h, cos_h, sin_12, cos_12, day / 6.0, is_wknd, w_code, base_delay])
                        ys.append(target)

        model = GradientBoostingRegressor(
            n_estimators=80, max_depth=4, learning_rate=0.08, random_state=42
        )
        model.fit(np.array(xs, dtype=float), np.array(ys, dtype=float))
        _TRAFFIC_FORECAST_MODEL = model
    except Exception:
        _TRAFFIC_FORECAST_MODEL = False

    return _TRAFFIC_FORECAST_MODEL


def predict_future_congestion(
    distance_m: float,
    duration_s: float,
    depart_dt: datetime,
    weather_condition: str = "clear",
    corridor_offset: float = 0.0,
) -> Dict[str, Any]:
    """Predict traffic congestion score in [0, 1] and ETA using time-series/regression features (weather, time, day of week)."""
    w_key = (weather_condition or "clear").strip().lower()
    if w_key not in WEATHER_PROFILES:
        w_key = "clear"
    w_prof = WEATHER_PROFILES[w_key]

    dist_km = max(0.1, distance_m / 1000.0)
    free_flow_s = (dist_km / FREE_FLOW_SPEED_KMH) * 3600.0

    day = depart_dt.weekday()
    is_weekend = day >= 5
    decimal_hour = depart_dt.hour + depart_dt.minute / 60.0

    # Fourier time-series harmonics for smooth intra-day peak modeling
    morning_wave = math.exp(-0.5 * ((decimal_hour - 9.0) / 1.45) ** 2)
    evening_wave = math.exp(-0.5 * ((decimal_hour - 18.5) / 1.65) ** 2)
    midday_wave = math.exp(-0.5 * ((decimal_hour - 13.5) / 2.6) ** 2)

    if not is_weekend:
        temporal_component = 0.12 + 0.46 * morning_wave + 0.56 * evening_wave + 0.20 * midday_wave
        day_effect = 0.05 if day == 4 and decimal_hour >= 15.0 else (0.03 if day == 0 and decimal_hour <= 11.0 else 0.0)
    else:
        weekend_wave = math.exp(-0.5 * ((decimal_hour - 16.5) / 3.4) ** 2)
        temporal_component = 0.10 + 0.30 * weekend_wave
        day_effect = -0.06

    base_delay = min(1.0, max(0.05, (duration_s - free_flow_s) / max(1.0, free_flow_s)))
    weather_component = float(w_prof["cong_boost"])

    reg_model = _get_or_train_traffic_forecast_model()
    if reg_model:
        try:
            import numpy as np  # type: ignore

            sin_h = math.sin(2.0 * math.pi * decimal_hour / 24.0)
            cos_h = math.cos(2.0 * math.pi * decimal_hour / 24.0)
            sin_12 = math.sin(4.0 * math.pi * decimal_hour / 24.0)
            cos_12 = math.cos(4.0 * math.pi * decimal_hour / 24.0)
            feat = np.array(
                [[
                    decimal_hour / 23.0,
                    sin_h,
                    cos_h,
                    sin_12,
                    cos_12,
                    day / 6.0,
                    1.0 if is_weekend else 0.0,
                    float(w_prof["code"]),
                    base_delay,
                ]],
                dtype=float,
            )
            ml_pred = float(reg_model.predict(feat)[0])
            raw_score = 0.65 * ml_pred + 0.35 * (0.55 * temporal_component + 0.30 * base_delay + weather_component + day_effect)
        except Exception:
            raw_score = 0.55 * temporal_component + 0.30 * base_delay + weather_component + day_effect
    else:
        raw_score = 0.55 * temporal_component + 0.30 * base_delay + weather_component + day_effect

    final_score = min(0.98, max(0.05, raw_score + corridor_offset))
    multiplier = (0.85 + 0.72 * final_score) * float(w_prof["speed_factor"])
    adjusted_duration_s = max(free_flow_s * 0.85, duration_s * multiplier)

    return {
        "congestion_score": round(final_score, 4),
        "adjusted_duration_s": round(adjusted_duration_s, 1),
        "eta_minutes": max(1, round(adjusted_duration_s / 60.0)),
        "weather_condition": w_key,
        "weather_label": w_prof["label"],
        "factors": {
            "temporal_harmonics": round(min(1.0, temporal_component), 3),
            "day_of_week_effect": round(day_effect, 3),
            "weather_impact": round(weather_component, 3),
            "corridor_baseline": round(max(0.05, base_delay + corridor_offset), 3),
        },
    }


def forecast_congestion_horizon(
    distance_m: float,
    duration_s: float,
    depart_dt: datetime,
    weather_condition: str = "clear",
    corridor_offset: float = 0.0,
    horizon_hours: int = 6,
) -> List[Dict[str, Any]]:
    """Generate an hourly time-series congestion & ETA forecast from +0h through +horizon_hours."""
    from datetime import timedelta

    series: List[Dict[str, Any]] = []
    steps = max(1, min(12, int(horizon_hours)))
    for h in range(steps + 1):
        step_dt = depart_dt + timedelta(hours=h)
        pred = predict_future_congestion(
            distance_m=distance_m,
            duration_s=duration_s,
            depart_dt=step_dt,
            weather_condition=weather_condition,
            corridor_offset=corridor_offset,
        )
        series.append(
            {
                "offset_hours": h,
                "timestamp": step_dt.strftime("%Y-%m-%dT%H:%M"),
                "time_label": "Now" if h == 0 else f"+{h}h ({step_dt.strftime('%H:%M')})",
                "hour_str": step_dt.strftime("%H:%M"),
                "congestion_score": pred["congestion_score"],
                "eta_minutes": pred["eta_minutes"],
            }
        )
    return series


def compute_congestion_score(
    distance_m: float,
    duration_s: float,
    depart_dt: datetime,
    weather_condition: str = "clear",
    corridor_offset: float = 0.0,
) -> Tuple[float, float]:
    """Compute a congestion score in [0, 1] and adjusted ETA seconds using ML time-series/regression and peak multipliers."""
    pred = predict_future_congestion(
        distance_m=distance_m,
        duration_s=duration_s,
        depart_dt=depart_dt,
        weather_condition=weather_condition,
        corridor_offset=corridor_offset,
    )
    return pred["congestion_score"], pred["adjusted_duration_s"]



def _load_historical_station_risk(db_path: Path = DB_PATH) -> Dict[str, float]:
    """Load normalized [0, 1] historical accident risk per station using the 2023 CSV, historical_risk.py, or DB."""
    # 1. Primary source: 2023 station accident dataset (roadsafe_station_accidents_2023.csv)
    acc_2023 = load_2023_station_accidents(ACCIDENTS_2023_CSV)
    ranking: Dict[str, float] = {
        k: float(v["risk_score_2023"]) for k, v in acc_2023.items()
    }

    # 2. Blend with historical_risk.py or roadsafe_historical_risk_ranking.csv if present
    hist_extra: Dict[str, float] = {}
    if _historical_risk_mod is not None:
        for fn_name in ("get_station_risk_map", "load_historical_risk", "get_historical_ranking"):
            fn = getattr(_historical_risk_mod, fn_name, None)
            if callable(fn):
                try:
                    res = fn()
                    if isinstance(res, dict) and res:
                        max_val = max(float(v) for v in res.values()) or 1.0
                        hist_extra = {
                            str(k).strip().lower(): min(1.0, float(v) / max_val)
                            for k, v in res.items()
                            if str(k).strip().lower() not in SUMMARY_ROW_NAMES
                        }
                        break
                except Exception:
                    pass

    if not hist_extra and HIST_RANKING_CSV.exists():
        try:
            with HIST_RANKING_CSV.open("r", encoding="utf-8-sig") as fh:
                reader = csv.DictReader(fh)
                raw_scores: Dict[str, float] = {}
                for row in reader:
                    st_name = (
                        row.get("Station")
                        or row.get("station")
                        or row.get("name")
                        or ""
                    ).strip().lower()
                    if not st_name or st_name in SUMMARY_ROW_NAMES:
                        continue
                    val_str = (
                        row.get("2023 - Total Cases")
                        or row.get("risk_score")
                        or row.get("accidents")
                        or row.get("total_accidents")
                        or "0"
                    )
                    raw_scores[st_name] = float(_parse_int(val_str))
                if raw_scores:
                    max_s = max(raw_scores.values()) or 1.0
                    hist_extra = {k: min(1.0, v / max_s) for k, v in raw_scores.items()}
        except OSError:
            pass

    if ranking and hist_extra:
        for k, val in hist_extra.items():
            ranking[k] = round(0.7 * ranking.get(k, val) + 0.3 * val, 4)
        return ranking
    if ranking:
        return ranking
    if hist_extra:
        return hist_extra

    # 3. Fallback: aggregate directly from accidents table in roadsafe.db
    if db_path.exists():
        conn = sqlite3.connect(str(db_path))
        try:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT s.name, COUNT(a.id) AS cnt
                FROM stations s
                LEFT JOIN accidents a ON a.station_id = s.id
                GROUP BY s.id, s.name
                """
            )
            rows = cur.fetchall()
            if rows:
                max_cnt = max(int(r[1]) for r in rows) or 1
                return {
                    str(r[0]).strip().lower(): min(1.0, int(r[1]) / max_cnt)
                    for r in rows
                    if str(r[0]).strip().lower() not in SUMMARY_ROW_NAMES
                }
        except sqlite3.Error:
            pass
        finally:
            conn.close()

    return ranking


def _predict_station_model_risk(
    station: Dict[str, Any], depart_dt: datetime, hist_score: float
) -> float:
    """Invoke predict_risk.py / risk_model.pkl for a station, falling back to 2023 severity score."""
    if _predict_risk_mod is not None:
        for fn_name in ("predict_risk", "predict_station_risk", "predict"):
            fn = getattr(_predict_risk_mod, fn_name, None)
            if callable(fn):
                for args in (
                    (station["lat"], station["lon"], depart_dt.hour, depart_dt.weekday()),
                    (
                        station.get("fatal_cases_2023", 0),
                        station.get("non_fatal_2023", 0),
                        station.get("total_cases_2023", 0),
                    ),
                    (station["lat"], station["lon"]),
                    (station["name"],),
                ):
                    try:
                        pred = fn(*args)
                        if isinstance(pred, dict):
                            val = float(pred.get("risk_score", pred.get("risk", hist_score)))
                        else:
                            val = float(pred)
                        if val > 1.0:
                            val = val / 100.0 if val > 3.0 else val / 2.0
                        return min(1.0, max(0.0, val))
                    except Exception:
                        continue
    return hist_score


def compute_route_accident_risk(
    coordinates: List[List[float]],
    stations: List[Dict[str, Any]],
    hist_map: Dict[str, float],
    depart_dt: datetime,
) -> Dict[str, Any]:
    """Find 2023 stations within 1 km of sampled polyline points and aggregate ML + 2023 historical risk."""
    sampled_pts = sample_polyline(coordinates, step_km=POLYLINE_SAMPLE_STEP_KM)
    nearby_stations: Dict[Any, Dict[str, Any]] = {}

    for st in stations:
        st_lat, st_lon = st["lat"], st["lon"]
        min_dist = min(
            (haversine_km(pt_lat, pt_lon, st_lat, st_lon) for pt_lat, pt_lon in sampled_pts),
            default=999.0,
        )
        if min_dist <= STATION_SEARCH_RADIUS_KM:
            hist_score = hist_map.get(st["name"].lower(), st.get("risk_score_2023", 0.35))
            model_score = _predict_station_model_risk(st, depart_dt, hist_score)
            combined_st_risk = round(0.6 * model_score + 0.4 * hist_score, 4)
            nearby_stations[st["id"]] = {
                "id": st["id"],
                "name": st["name"],
                "zone": st.get("zone", ""),
                "sub_division": st.get("sub_division", ""),
                "lat": st_lat,
                "lon": st_lon,
                "distance_km": round(min_dist, 3),
                "fatal_cases_2023": st.get("fatal_cases_2023", 0),
                "killed_2023": st.get("killed_2023", 0),
                "non_fatal_2023": st.get("non_fatal_2023", 0),
                "injured_2023": st.get("injured_2023", 0),
                "total_cases_2023": st.get("total_cases_2023", 0),
                "risk_score": combined_st_risk,
                "is_high_risk": combined_st_risk >= HIGH_RISK_THRESHOLD,
            }

    matched_list = list(nearby_stations.values())
    if not matched_list:
        return {
            "accident_risk": 0.12,
            "nearby_stations": [],
            "high_risk_count": 0,
            "total_2023_cases_along_route": 0,
        }

    mean_risk = sum(s["risk_score"] for s in matched_list) / len(matched_list)
    high_risk_cnt = sum(1 for s in matched_list if s["is_high_risk"])
    total_2023_cases = sum(int(s.get("total_cases_2023", 0)) for s in matched_list)
    exposure_boost = min(0.25, high_risk_cnt * 0.06)
    agg_risk = min(1.0, max(0.0, mean_risk + exposure_boost))

    return {
        "accident_risk": round(agg_risk, 4),
        "nearby_stations": matched_list,
        "high_risk_count": high_risk_cnt,
        "total_2023_cases_along_route": total_2023_cases,
    }


def _build_explanation(
    route: Dict[str, Any], fastest_route: Dict[str, Any], all_routes: List[Dict[str, Any]]
) -> str:
    """Create a concise one-line plain-English explanation referencing 2023 station risk exposure."""
    if route["route_id"] == fastest_route["route_id"]:
        max_hr = max(r["high_risk_count"] for r in all_routes)
        diff_hr = max_hr - route["high_risk_count"]
        if route["recommended"] and diff_hr > 0:
            return (
                f"Fastest ETA ({route['eta_minutes']} min) and avoids {diff_hr} "
                f"high-risk station{'s' if diff_hr != 1 else ''} ({route['total_2023_cases_along_route']} cases in 2023)."
            )
        return (
            f"Fastest arrival ({route['eta_minutes']} min) passing "
            f"{route['high_risk_count']} high-risk station{'s' if route['high_risk_count'] != 1 else ''} "
            f"({route['total_2023_cases_along_route']} cases in 2023)."
        )

    base_s = max(1.0, fastest_route["duration_s"])
    pct_slower = round(((route["duration_s"] - base_s) / base_s) * 100)
    hr_delta = fastest_route["high_risk_count"] - route["high_risk_count"]
    case_delta = fastest_route["total_2023_cases_along_route"] - route["total_2023_cases_along_route"]
    cong_delta = round((fastest_route["congestion_score"] - route["congestion_score"]) * 100)

    clauses: List[str] = [f"{max(1, pct_slower)}% slower"]
    if hr_delta > 0:
        clauses.append(
            f"passes {hr_delta} fewer high-risk station{'s' if hr_delta != 1 else ''}"
        )
    elif case_delta > 15:
        clauses.append(f"avoids {case_delta} historical 2023 accident cases along corridor")
    elif cong_delta >= 5:
        clauses.append(f"has {cong_delta}% lower congestion")
    else:
        clauses.append(
            f"offers an alternate corridor with {len(route['nearby_stations'])} monitored station{'s' if len(route['nearby_stations']) != 1 else ''}"
        )
    return " but ".join(clauses) + "."


def evaluate_routes(
    source_query: str,
    destination_query: str,
    depart_time: Optional[str] = None,
    weather_condition: str = "clear",
    horizon_hours: int = 6,
    db_path: Path = DB_PATH,
) -> Dict[str, Any]:
    """Compute, score, label, and rank 3 alternative routes with ML predictive traffic forecasting."""
    depart_dt = datetime.now()
    if depart_time:
        try:
            depart_dt = datetime.fromisoformat(depart_time.replace("Z", "+00:00"))
        except ValueError:
            raise ValueError("Invalid depart_time format. Use ISO-8601 (e.g., 2025-05-12T08:30).")

    w_key = (weather_condition or "clear").strip().lower()
    if w_key not in WEATHER_PROFILES:
        w_key = "clear"

    src_info = resolve_location(source_query, db_path=db_path)
    dst_info = resolve_location(destination_query, db_path=db_path)

    if haversine_km(src_info["lat"], src_info["lon"], dst_info["lat"], dst_info["lon"]) < 0.05:
        raise ValueError("Source and destination are too close to compute distinct routes.")

    raw_routes = fetch_osrm_routes(
        src_info["lat"], src_info["lon"], dst_info["lat"], dst_info["lon"]
    )
    stations = fetch_stations(db_path=db_path)
    hist_map = _load_historical_station_risk(db_path=db_path)

    enriched: List[Dict[str, Any]] = []
    for idx, r in enumerate(raw_routes):
        corridor_offset = 0.0 if idx == 0 else (-0.08 if idx == 1 else -0.14)
        pred_cong = predict_future_congestion(
            distance_m=r["distance_m"],
            duration_s=r["duration_s"],
            depart_dt=depart_dt,
            weather_condition=w_key,
            corridor_offset=corridor_offset,
        )
        forecast_series = forecast_congestion_horizon(
            distance_m=r["distance_m"],
            duration_s=r["duration_s"],
            depart_dt=depart_dt,
            weather_condition=w_key,
            corridor_offset=corridor_offset,
            horizon_hours=horizon_hours,
        )
        risk_info = compute_route_accident_risk(
            r["geometry"]["coordinates"], stations, hist_map, depart_dt
        )
        # Weather also slightly amplifies accident risk in wet/foggy conditions
        weather_risk_boost = float(WEATHER_PROFILES[w_key]["cong_boost"]) * 0.25
        adj_acc_risk = round(min(1.0, risk_info["accident_risk"] + weather_risk_boost), 4)

        enriched.append(
            {
                "route_id": idx + 1,
                "distance_km": round(r["distance_m"] / 1000.0, 2),
                "duration_s": pred_cong["adjusted_duration_s"],
                "eta_minutes": pred_cong["eta_minutes"],
                "congestion_score": pred_cong["congestion_score"],
                "forecast_factors": pred_cong["factors"],
                "forecast_series": forecast_series,
                "accident_risk": adj_acc_risk,
                "high_risk_count": risk_info["high_risk_count"],
                "total_2023_cases_along_route": risk_info["total_2023_cases_along_route"],
                "nearby_stations": risk_info["nearby_stations"],
                "geometry": r["geometry"],
                "is_fallback": r["is_fallback"],
            }
        )

    min_dur = min(r["duration_s"] for r in enriched)
    max_dur = max(r["duration_s"] for r in enriched)
    dur_span = max(1.0, max_dur - min_dur)

    for r in enriched:
        if max_dur == min_dur:
            rel_time = 0.5
        else:
            rel_time = 0.25 + 0.75 * ((r["duration_s"] - min_dur) / dur_span)
        abs_time_burden = min(1.0, r["duration_s"] / 2100.0)
        norm_time = min(1.0, max(rel_time, abs_time_burden))
        r["normalized_time"] = round(norm_time, 4)
        final_score = (
            WEIGHT_TRAVEL_TIME * r["normalized_time"]
            + WEIGHT_CONGESTION * r["congestion_score"]
            + WEIGHT_ACCIDENT_RISK * r["accident_risk"]
        )
        r["composite_score"] = round(final_score, 4)

    fastest = min(enriched, key=lambda x: x["duration_s"])
    remaining_after_fastest = [r for r in enriched if r["route_id"] != fastest["route_id"]]
    safest = min(remaining_after_fastest, key=lambda x: (x["accident_risk"], x["composite_score"]))
    balanced = [
        r
        for r in remaining_after_fastest
        if r["route_id"] != safest["route_id"]
    ][0]

    fastest["tag"] = "Fastest"
    safest["tag"] = "Safest"
    balanced["tag"] = "Balanced"

    best_route = min(enriched, key=lambda x: x["composite_score"])
    for r in enriched:
        r["recommended"] = r["route_id"] == best_route["route_id"]

    for r in enriched:
        r["explanation"] = _build_explanation(r, fastest, enriched)

    ranked_routes = sorted(enriched, key=lambda x: x["composite_score"])
    for rank_idx, r in enumerate(ranked_routes, start=1):
        r["rank"] = rank_idx

    rec_series = best_route["forecast_series"]
    best_slot = min(rec_series, key=lambda s: s["congestion_score"])

    return {
        "source": src_info,
        "destination": dst_info,
        "depart_time": depart_dt.isoformat(timespec="minutes"),
        "weather_condition": w_key,
        "weather_label": WEATHER_PROFILES[w_key]["label"],
        "optimal_departure_window": best_slot,
        "danger_threshold": 0.80,
        "exceeds_danger_threshold": best_route["composite_score"] > 0.80,
        "weights": {
            "travel_time": WEIGHT_TRAVEL_TIME,
            "congestion": WEIGHT_CONGESTION,
            "accident_risk": WEIGHT_ACCIDENT_RISK,
        },
        "recommended_route_id": best_route["route_id"],
        "routes": ranked_routes,
    }
