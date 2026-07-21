from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


DATABASE_PATH = Path(__file__).resolve().parents[1] / "data" / "trade_logs.db"
BEIJING_TIMEZONE = ZoneInfo("Asia/Shanghai")


def _beijing_timestamp(value: str) -> str:
    timestamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if timestamp.tzinfo is None:
        # SQLite CURRENT_TIMESTAMP is UTC; preserve historical log times correctly.
        timestamp = timestamp.replace(tzinfo=UTC)
    return timestamp.astimezone(BEIJING_TIMEZONE).strftime("%Y-%m-%d %H:%M:%S")


def _connection() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS trade_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id TEXT NOT NULL,
            action TEXT NOT NULL,
            request_json TEXT NOT NULL,
            response_json TEXT,
            error_message TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    return connection


def record_trade_log(
    account_id: str,
    action: str,
    request_payload: dict[str, Any],
    response_payload: dict[str, Any] | None = None,
    error_message: str | None = None,
) -> None:
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO trade_logs (account_id, action, request_json, response_json, error_message, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                account_id,
                action,
                json.dumps(request_payload, ensure_ascii=False, default=str),
                json.dumps(response_payload, ensure_ascii=False, default=str) if response_payload is not None else None,
                error_message,
                datetime.now(BEIJING_TIMEZONE).isoformat(),
            ),
        )


def list_trade_logs(account_id: str) -> list[dict[str, Any]]:
    with _connection() as connection:
        rows = connection.execute(
            """
            SELECT id, action, request_json, response_json, error_message, created_at
            FROM trade_logs WHERE account_id = ? ORDER BY id DESC
            """,
            (account_id,),
        ).fetchall()
    return [
        {
            "id": row["id"],
            "action": row["action"],
            "request": json.loads(row["request_json"]),
            "response": json.loads(row["response_json"]) if row["response_json"] else None,
            "error": row["error_message"],
            "created_at": _beijing_timestamp(row["created_at"]),
        }
        for row in rows
    ]
