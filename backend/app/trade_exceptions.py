from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any


DATABASE_PATH = Path(__file__).resolve().parents[1] / "data" / "trade_exceptions.db"


def _connection() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS trade_exceptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id TEXT NOT NULL,
            exception_type TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    return connection


def record_trade_exception(account_id: str, exception_type: str, payload: dict[str, Any]) -> None:
    if not account_id:
        return
    payload = {**payload, "m_strExceptionType": exception_type}
    with _connection() as connection:
        connection.execute(
            "INSERT INTO trade_exceptions (account_id, exception_type, payload_json) VALUES (?, ?, ?)",
            (account_id, exception_type, json.dumps(payload, ensure_ascii=False)),
        )


def list_trade_exceptions(account_id: str) -> list[dict[str, Any]]:
    with _connection() as connection:
        rows = connection.execute(
            "SELECT id, payload_json, created_at FROM trade_exceptions WHERE account_id = ? ORDER BY id DESC",
            (account_id,),
        ).fetchall()
    items: list[dict[str, Any]] = []
    for row in rows:
        payload = json.loads(row["payload_json"])
        payload["id"] = row["id"]
        payload["m_strExceptionTime"] = row["created_at"]
        items.append(payload)
    return items
