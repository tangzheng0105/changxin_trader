from __future__ import annotations

import json
import math
import sqlite3
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from .auth import get_position_setting
from .stock_pool import list_stock_pool, quote_prices
from .xt_gateway import gateway


DATABASE_PATH = Path(__file__).resolve().parents[1] / "data" / "rebalance.db"


def _connection() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS rebalance_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id TEXT NOT NULL,
            items_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS rebalance_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id TEXT NOT NULL,
            plan_id INTEGER NOT NULL,
            scheduled_at TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            result_json TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            executed_at TEXT,
            FOREIGN KEY(plan_id) REFERENCES rebalance_plans(id)
        );
        """
    )
    return connection


def _number(row: dict[str, Any], *keys: str) -> float:
    for key in keys:
        try:
            value = float(row.get(key))
        except (TypeError, ValueError):
            continue
        if math.isfinite(value):
            return value
    return 0.0


def _market(code: str, value: str | None = None) -> str:
    if value in {"SH", "SZ", "BJ"}:
        return value
    return "SH" if code.startswith(("6", "9")) else "SZ"


def build_plan(account_id: str) -> dict[str, Any]:
    pool = list_stock_pool()
    if not pool:
        raise ValueError("股票池为空，无法生成调仓方案")

    account = gateway.account_detail(account_id)
    positions = gateway.positions(account_id)
    target_percentage = get_position_setting(account_id)["target_percentage"]
    total_assets = _number(account, "m_dBalance", "m_dAssetBalance", "m_dTotalAsset", "m_dTotalAssets")
    target_total_value = total_assets * target_percentage / 100
    target_each_value = target_total_value / len(pool)
    pool_by_code = {str(item["code"]): item for item in pool}

    holdings: dict[str, dict[str, Any]] = {}
    for position in positions:
        code = str(position.get("m_strInstrumentID") or position.get("m_strInstrument") or "")
        if not code:
            continue
        holdings[code] = {
            "code": code,
            "name": position.get("m_strInstrumentName") or code,
            "market": _market(code, position.get("m_strExchangeID") or position.get("m_strMarket")),
            "quantity": int(_number(position, "m_nVolume")),
            "available_quantity": int(_number(position, "m_nCanUseVolume", "m_nAvailableVolume", "m_nVolume")),
            "price": _number(position, "m_dLastPrice", "m_dCurrentPrice"),
        }

    quotes = quote_prices([code for code in pool_by_code if code not in holdings or holdings[code]["price"] <= 0])
    items: list[dict[str, Any]] = []
    for code in sorted(set(holdings) | set(pool_by_code)):
        holding = holdings.get(code, {})
        pool_item = pool_by_code.get(code)
        current_quantity = int(holding.get("quantity", 0))
        available_quantity = int(holding.get("available_quantity", current_quantity))
        price = float(holding.get("price", 0) or quotes.get(code) or (pool_item or {}).get("current_price") or 0)
        if price <= 0:
            items.append({
                "code": code,
                "name": (pool_item or holding).get("name", code),
                "market": holding.get("market") or _market(code),
                "action": "SKIP",
                "quantity": 0,
                "current_quantity": current_quantity,
                "target_quantity": current_quantity,
                "price": 0,
                "reason": "未获取到最新价格，未生成委托",
            })
            continue

        target_quantity = int(math.floor(target_each_value / price / 100) * 100) if pool_item else 0
        delta = target_quantity - current_quantity
        action = "HOLD"
        quantity = 0
        reason = "已满足目标仓位"
        if delta > 0:
            action, quantity, reason = "BUY", int(math.floor(delta / 100) * 100), "补足目标仓位"
        elif delta < 0:
            quantity = min(abs(delta), available_quantity)
            action = "SELL" if quantity else "HOLD"
            reason = "池外持仓清仓" if not pool_item else "降低至目标仓位"
            if quantity < abs(delta):
                reason += "（可用持仓不足）"
        if action == "BUY" and quantity == 0:
            action, reason = "HOLD", "不足一手，不生成委托"

        items.append({
            "code": code,
            "name": (pool_item or holding).get("name", code),
            "market": holding.get("market") or _market(code),
            "action": action,
            "quantity": quantity,
            "current_quantity": current_quantity,
            "target_quantity": target_quantity,
            "price": round(price, 3),
            "reason": reason,
        })

    tradable_items = [item for item in items if item["action"] in {"BUY", "SELL"} and item["quantity"] > 0]
    with _connection() as connection:
        cursor = connection.execute(
            "INSERT INTO rebalance_plans (account_id, items_json) VALUES (?, ?)",
            (account_id, json.dumps(items, ensure_ascii=False)),
        )
        plan_id = cursor.lastrowid
    return {
        "plan_id": plan_id,
        "target_percentage": target_percentage,
        "total_assets": round(total_assets, 2),
        "target_total_value": round(target_total_value, 2),
        "items": items,
        "tradable_count": len(tradable_items),
    }


def _load_plan(account_id: str, plan_id: int) -> list[dict[str, Any]]:
    with _connection() as connection:
        row = connection.execute(
            "SELECT items_json FROM rebalance_plans WHERE id = ? AND account_id = ?", (plan_id, account_id)
        ).fetchone()
    if row is None:
        raise KeyError(plan_id)
    return json.loads(row["items_json"])


def execute_plan(account_id: str, plan_id: int) -> dict[str, Any]:
    items = _load_plan(account_id, plan_id)
    results: list[dict[str, Any]] = []
    for item in items:
        if item["action"] not in {"BUY", "SELL"} or not item["quantity"]:
            continue
        try:
            order = gateway.intelligent_algorithm_order(
                account_id=account_id,
                market=item["market"],
                instrument=item["code"],
                operation=item["action"],
                price=float(item["price"]),
                volume=int(item["quantity"]),
            )
            results.append({**item, "success": True, "order_id": order.get("order_id")})
        except Exception as exc:
            results.append({**item, "success": False, "error": str(exc)})
    return {"plan_id": plan_id, "results": results}


def schedule_plan(account_id: str, plan_id: int, scheduled_at: datetime) -> dict[str, Any]:
    if scheduled_at <= datetime.now():
        raise ValueError("定时执行时间必须晚于当前时间")
    _load_plan(account_id, plan_id)
    with _connection() as connection:
        cursor = connection.execute(
            "INSERT INTO rebalance_jobs (account_id, plan_id, scheduled_at) VALUES (?, ?, ?)",
            (account_id, plan_id, scheduled_at.replace(second=0, microsecond=0).isoformat()),
        )
        job_id = cursor.lastrowid
    return {"job_id": job_id, "plan_id": plan_id, "scheduled_at": scheduled_at.replace(second=0, microsecond=0).isoformat()}


def run_due_jobs() -> None:
    with _connection() as connection:
        jobs = connection.execute(
            "SELECT id, account_id, plan_id FROM rebalance_jobs WHERE status = 'pending' AND scheduled_at <= ?",
            (datetime.now().isoformat(),),
        ).fetchall()
        for job in jobs:
            connection.execute("UPDATE rebalance_jobs SET status = 'running' WHERE id = ?", (job["id"],))
    for job in jobs:
        try:
            result = execute_plan(job["account_id"], job["plan_id"])
            status = "completed"
        except Exception as exc:
            result = {"error": str(exc)}
            status = "failed"
        with _connection() as connection:
            connection.execute(
                "UPDATE rebalance_jobs SET status = ?, result_json = ?, executed_at = ? WHERE id = ?",
                (status, json.dumps(result, ensure_ascii=False), datetime.now().isoformat(), job["id"]),
            )


def start_scheduler() -> None:
    def worker() -> None:
        while True:
            try:
                run_due_jobs()
            except Exception:
                pass
            time.sleep(10)

    threading.Thread(target=worker, name="rebalance-scheduler", daemon=True).start()
