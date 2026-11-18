"""Idempotent SQLite migration to create the route_history table in roadsafe.db."""

import sqlite3
from pathlib import Path
from typing import Union

DB_PATH = Path(__file__).resolve().parent / "roadsafe.db"


def migrate_route_history(db_path: Union[str, Path] = DB_PATH) -> None:
    """Create the route_history table and index if they do not exist.

    Args:
        db_path: Path to the SQLite database file (defaults to roadsafe.db).
    """
    conn = sqlite3.connect(str(db_path))
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS route_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                source TEXT NOT NULL,
                destination TEXT NOT NULL,
                chosen_route TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
            """
        )
        cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_route_history_user_time
            ON route_history (user_id, timestamp DESC);
            """
        )
        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    migrate_route_history()
    print(f"Migration complete: route_history verified in {DB_PATH}")
