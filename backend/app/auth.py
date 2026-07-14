from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import Header, HTTPException


DATABASE_PATH = Path(__file__).resolve().parents[1] / "data" / "users.db"
SESSION_LIFETIME = timedelta(hours=12)


@dataclass(frozen=True)
class CurrentUser:
    account_id: str
    role: str


def _connection() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            account_id TEXT PRIMARY KEY,
            password_hash TEXT NOT NULL,
            password_salt TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin', 'trader')),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            account_id TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(account_id) REFERENCES users(account_id)
        );
        """
    )
    return connection


def _hash_password(password: str, salt: bytes) -> str:
    return hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1).hex()


def _create_user(connection: sqlite3.Connection, account_id: str, password: str, role: str) -> None:
    salt = os.urandom(16)
    connection.execute(
        "INSERT INTO users (account_id, password_hash, password_salt, role) VALUES (?, ?, ?, ?)",
        (account_id, _hash_password(password, salt), salt.hex(), role),
    )


def ensure_admin() -> None:
    with _connection() as connection:
        existing = connection.execute("SELECT 1 FROM users WHERE account_id = 'admin'").fetchone()
        if existing is None:
            _create_user(connection, "admin", "123456", "admin")


def login(account_id: str, password: str) -> dict[str, str]:
    ensure_admin()
    with _connection() as connection:
        row = connection.execute(
            "SELECT account_id, password_hash, password_salt, role FROM users WHERE account_id = ?",
            (account_id,),
        ).fetchone()
        if row is None:
            raise ValueError("资金账号或密码错误")
        expected_hash = _hash_password(password, bytes.fromhex(row["password_salt"]))
        if not hmac.compare_digest(expected_hash, row["password_hash"]):
            raise ValueError("资金账号或密码错误")

        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(UTC) + SESSION_LIFETIME
        connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (datetime.now(UTC).isoformat(),))
        connection.execute(
            "INSERT INTO sessions (token, account_id, expires_at) VALUES (?, ?, ?)",
            (token, row["account_id"], expires_at.isoformat()),
        )
    return {"token": token, "account_id": row["account_id"], "role": row["role"]}


def create_trader(account_id: str, password: str) -> dict[str, str]:
    ensure_admin()
    with _connection() as connection:
        try:
            _create_user(connection, account_id, password, "trader")
        except sqlite3.IntegrityError as exc:
            raise ValueError("该资金账号已存在") from exc
    return {"account_id": account_id, "role": "trader"}


def list_traders() -> list[dict[str, str]]:
    ensure_admin()
    with _connection() as connection:
        rows = connection.execute(
            "SELECT account_id, role, created_at FROM users WHERE role = 'trader' ORDER BY created_at DESC"
        ).fetchall()
    return [dict(row) for row in rows]


def get_current_user(authorization: str | None = Header(default=None)) -> CurrentUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="请先登录")

    token = authorization.removeprefix("Bearer ").strip()
    with _connection() as connection:
        row = connection.execute(
            """
            SELECT users.account_id, users.role, sessions.expires_at
            FROM sessions JOIN users ON users.account_id = sessions.account_id
            WHERE sessions.token = ?
            """,
            (token,),
        ).fetchone()
    if row is None or datetime.fromisoformat(row["expires_at"]) <= datetime.now(UTC):
        raise HTTPException(status_code=401, detail="登录已过期，请重新登录")
    return CurrentUser(account_id=row["account_id"], role=row["role"])


def assert_admin(user: CurrentUser) -> CurrentUser:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可执行此操作")
    return user


def assert_trader(user: CurrentUser) -> CurrentUser:
    if user.role != "trader":
        raise HTTPException(status_code=403, detail="请使用交易员账户登录")
    return user
