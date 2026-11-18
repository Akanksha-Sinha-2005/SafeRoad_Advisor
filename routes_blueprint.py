"""Flask Blueprint providing the Route Recommendation page and JSON endpoints."""

from __future__ import annotations

import sqlite3
from functools import wraps
from typing import Any, Callable, Dict, List

from flask import (
    Blueprint,
     current_app,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

from init_db_routes import DB_PATH, migrate_route_history
from route_engine import evaluate_routes, fetch_stations

routes_bp = Blueprint("routes_bp", __name__)

# Ensure route_history exists when blueprint is loaded
migrate_route_history(DB_PATH)


def login_required_json_or_page(view_func: Callable[..., Any]) -> Callable[..., Any]:
    """Enforce authentication using existing session keys ('user_id', 'username', or 'user')."""

    @wraps(view_func)
    def wrapped(*args: Any, **kwargs: Any) -> Any:
        user_ident = (
            session.get("user_id")
            or session.get("id")
            or session.get("username")
            or session.get("user")
        )
        if not user_ident:
            if request.path.startswith("/api/"):
                return jsonify({"error": "Authentication required."}), 401
            return redirect(url_for("login"))
        return view_func(*args, **kwargs)

    return wrapped


def _resolve_current_user_id() -> int:
    """Return numeric user_id from Flask session, looking up username in users table if needed."""
    raw_id = session.get("user_id") or session.get("id")
    if isinstance(raw_id, int):
        return raw_id
    if isinstance(raw_id, str) and raw_id.isdigit():
        return int(raw_id)

    username = session.get("username") or session.get("user")
    if username and DB_PATH.exists():
        conn = sqlite3.connect(str(DB_PATH))
        try:
            cur = conn.cursor()
            cur.execute("SELECT id FROM users WHERE username = ? LIMIT 1", (str(username),))
            row = cur.fetchone()
            if row:
                return int(row[0])
        except sqlite3.Error:
            pass
        finally:
            conn.close()
    return 1


def _save_route_history(
    user_id: int, source: str, destination: str, chosen_route: str
) -> None:
    """Insert a completed route search into route_history using parameterized SQL."""
    conn = sqlite3.connect(str(DB_PATH))
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO route_history (user_id, source, destination, chosen_route)
            VALUES (?, ?, ?, ?)
            """,
            (user_id, source, destination, chosen_route),
        )
        conn.commit()
    finally:
        conn.close()


def _get_recent_history(user_id: int, limit: int = 10) -> List[Dict[str, Any]]:
    """Fetch the last `limit` route searches for the given user_id."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, user_id, source, destination, chosen_route, timestamp
            FROM route_history
            WHERE user_id = ?
            ORDER BY timestamp DESC, id DESC
            LIMIT ?
            """,
            (user_id, limit),
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@routes_bp.route("/routes", methods=["GET"])
@login_required_json_or_page
def route_planner_page() -> Any:
    """Render the interactive Alternative Route Recommendation interface."""
    user_id = _resolve_current_user_id()
    history = _get_recent_history(user_id, limit=10)
    return render_template("route.html", recent_searches=history)


@routes_bp.route("/api/stations", methods=["GET"])
@login_required_json_or_page
def api_get_stations() -> Any:
    """Return station list from roadsafe.db for autocomplete."""
    stations = fetch_stations(DB_PATH)
    return jsonify({"stations": stations, "count": len(stations)}), 200


@routes_bp.route("/api/routes", methods=["POST"])
@login_required_json_or_page
def api_recommend_routes() -> Any:
    """Evaluate 3 routes between source and destination, save search history, and return JSON."""
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Request body must be valid JSON object."}), 400

    source = str(payload.get("source") or "").strip()
    destination = str(payload.get("destination") or "").strip()
    depart_time = payload.get("depart_time")
    depart_time_str = str(depart_time).strip() if depart_time else None
    weather = str(payload.get("weather") or "clear").strip().lower()

    if not source or not destination:
        return jsonify({"error": "Both 'source' and 'destination' are required non-empty strings."}), 400
    if len(source) > 200 or len(destination) > 200:
        return jsonify({"error": "Location queries must not exceed 200 characters."}), 400
    if source.lower() == destination.lower():
        return jsonify({"error": "Source and destination must be different locations."}), 400

    try:
        result = evaluate_routes(
            source_query=source,
            destination_query=destination,
            depart_time=depart_time_str,
            weather_condition=weather,
            db_path=DB_PATH,
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except LookupError as exc:
        return jsonify({"error": str(exc)}), 404
    except Exception as exc:
        current_app.logger.exception("Unexpected error in /api/routes")
        return jsonify({"error": f"Failed to compute routes: {exc}"}), 500

    user_id = _resolve_current_user_id()
    rec_route = next((r for r in result["routes"] if r["recommended"]), result["routes"][0])
    chosen_summary = (
        f"{rec_route['tag']} (Recommended) - {rec_route['distance_km']} km, "
        f"{rec_route['eta_minutes']} min, Score {rec_route['composite_score']:.2f}"
    )

    try:
        _save_route_history(
            user_id=user_id,
            source=result["source"]["label"],
            destination=result["destination"]["label"],
            chosen_route=chosen_summary,
        )
    except sqlite3.Error:
        current_app.logger.warning("Could not record search into route_history.")

    result["history"] = _get_recent_history(user_id, limit=10)
    return jsonify(result), 200
