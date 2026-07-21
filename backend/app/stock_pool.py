from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import urlopen


DATABASE_PATH = Path(__file__).resolve().parents[1] / "data" / "stock_pool.db"
CODE_PATTERN = re.compile(r"^\d{6}$")
TENCENT_SUGGEST_URL = "https://smartbox.gtimg.cn/s3/"
TENCENT_QUOTE_URL = "https://qt.gtimg.cn/q="
TENCENT_KLINE_URL = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get"
EASTMONEY_KLINE_URL = "https://push2his.eastmoney.com/api/qt/stock/kline/get"


def _connection() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS stock_pool (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL DEFAULT '未命名',
            code TEXT NOT NULL UNIQUE,
            current_price REAL NOT NULL DEFAULT 0,
            cost_price REAL NOT NULL DEFAULT 0,
            quantity INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    return connection


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    item = dict(row)
    current_price = float(item["current_price"])
    cost_price = float(item["cost_price"])
    quantity = int(item["quantity"])
    item["market_value"] = round(current_price * quantity, 2)
    item["profit"] = round((current_price - cost_price) * quantity, 2)
    return item


def list_stock_pool() -> list[dict[str, Any]]:
    with _connection() as connection:
        rows = connection.execute("SELECT * FROM stock_pool ORDER BY updated_at DESC, id DESC").fetchall()
    return [_row_to_dict(row) for row in rows]


def quote_prices(codes: list[str]) -> dict[str, float]:
    unique_codes = list(dict.fromkeys(code for code in codes if CODE_PATTERN.fullmatch(code)))
    if not unique_codes:
        return {}

    symbols = [f"{'sh' if code.startswith(('6', '9')) else 'sz'}{code}" for code in unique_codes]
    try:
        with urlopen(f"{TENCENT_QUOTE_URL}{','.join(symbols)}", timeout=5) as response:  # nosec B310
            payload = response.read().decode("gbk", errors="ignore")
    except Exception:
        return {}

    prices: dict[str, float] = {}
    for line in payload.split(";"):
        match = re.search(r'v_\w+(\d{6})="([^"]*)"', line)
        if not match:
            continue
        fields = match.group(2).split("~")
        try:
            price = float(fields[3])
        except (IndexError, ValueError):
            continue
        if price > 0:
            prices[match.group(1)] = price
    return prices


def get_daily_kline(code: str, days: int = 180) -> list[dict[str, float | str]]:
    if not CODE_PATTERN.fullmatch(code):
        raise ValueError("证券代码必须为 6 位数字")

    symbol = f"{'sh' if code.startswith(('6', '9')) else 'sz'}{code}"
    request_url = f"{TENCENT_KLINE_URL}?{urlencode({'param': f'{symbol},day,,,{days},qfq'})}"
    try:
        with urlopen(request_url, timeout=8) as response:  # nosec B310 - public market data endpoint
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise RuntimeError("行情服务暂时不可用") from exc

    quote_data = payload.get("data", {}).get(symbol, {})
    raw_bars = quote_data.get("qfqday") or quote_data.get("day") or []
    bars: list[dict[str, float | str]] = []
    for bar in raw_bars:
        try:
            date, open_price, close_price, high_price, low_price = bar[:5]
            values = {
                "time": str(date),
                "open": float(open_price),
                "high": float(high_price),
                "low": float(low_price),
                "close": float(close_price),
            }
        except (TypeError, ValueError, IndexError):
            continue
        if all(float(values[key]) > 0 for key in ("open", "high", "low", "close")):
            bars.append(values)

    if not bars:
        raise RuntimeError("未获取到该证券的日 K 数据")
    return bars


def get_hourly_kline(code: str, bars_count: int = 180) -> list[dict[str, float | str]]:
    if not CODE_PATTERN.fullmatch(code):
        raise ValueError("证券代码必须为 6 位数字")

    market = "1" if code.startswith(("6", "9")) else "0"
    request_url = f"{EASTMONEY_KLINE_URL}?{urlencode({
        'secid': f'{market}.{code}',
        'klt': '60',
        'fqt': '1',
        'lmt': str(bars_count),
        'end': '20500101',
        'fields1': 'f1,f2,f3,f4,f5,f6',
        'fields2': 'f51,f52,f53,f54,f55,f56,f57,f58',
    })}"
    try:
        with urlopen(request_url, timeout=8) as response:  # nosec B310 - public market data endpoint
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise RuntimeError("行情服务暂时不可用") from exc

    raw_bars = payload.get("data", {}).get("klines", [])
    bars: list[dict[str, float | str]] = []
    for raw_bar in raw_bars:
        fields = raw_bar.split(",")
        try:
            time, open_price, close_price, high_price, low_price = fields[:5]
            values = {
                "time": time,
                "open": float(open_price),
                "high": float(high_price),
                "low": float(low_price),
                "close": float(close_price),
            }
        except (AttributeError, TypeError, ValueError, IndexError):
            continue
        if all(float(values[key]) > 0 for key in ("open", "high", "low", "close")):
            bars.append(values)

    if not bars:
        raise RuntimeError("未获取到该证券的小时 K 数据")
    return bars


def get_stock_kline(code: str, interval: str = "day") -> list[dict[str, float | str]]:
    if interval == "day":
        return get_daily_kline(code)
    if interval == "hour":
        return get_hourly_kline(code)
    raise ValueError("不支持的 K 线周期")


def _remote_search(query: str) -> list[dict[str, str]]:
    request_url = f"{TENCENT_SUGGEST_URL}?{urlencode({'t': 'all', 'q': query})}"
    try:
        with urlopen(request_url, timeout=4) as response:  # nosec B310 - public lookup endpoint
            payload = response.read().decode("utf-8")
    except Exception:
        return []

    match = re.search(r'v_hint="(.*)"', payload)
    if not match or not match.group(1):
        return []

    hint = json.loads(f'"{match.group(1)}"')

    results: list[dict[str, str]] = []
    for item in hint.split("^"):
        fields = item.split("~")
        if len(fields) < 5 or not CODE_PATTERN.fullmatch(fields[1]) or not fields[4].startswith("GP"):
            continue
        results.append(
            {
                "code": fields[1],
                "name": fields[2],
                "market": {"sh": "SH", "sz": "SZ", "bj": "BJ"}.get(fields[0].lower(), fields[0].upper()),
            }
        )
    return results


def search_securities(query: str) -> list[dict[str, str]]:
    normalized = query.strip()
    if not normalized:
        return []

    with _connection() as connection:
        local_rows = connection.execute(
            "SELECT code, name FROM stock_pool WHERE code LIKE ? OR name LIKE ? ORDER BY updated_at DESC LIMIT 10",
            (f"{normalized}%", f"%{normalized}%"),
        ).fetchall()

    results = [{"code": row["code"], "name": row["name"], "market": ""} for row in local_rows]
    seen_codes = {item["code"] for item in results}
    for item in _remote_search(normalized):
        if item["code"] not in seen_codes:
            results.append(item)
            seen_codes.add(item["code"])
    return results[:10]


def _resolve_stock_inputs(inputs: list[str]) -> list[dict[str, str]]:
    resolved: list[dict[str, str]] = []
    seen_codes: set[str] = set()
    for raw_input in inputs:
        query = str(raw_input).strip()
        if re.fullmatch(r"\d{7}", query):
            query = query[-6:]
        if not query:
            continue
        candidates = search_securities(query)
        exact = next((item for item in candidates if item["code"] == query), None)
        exact = exact or next((item for item in candidates if item["name"] == query), None)
        if exact is None:
            raise ValueError(f"未找到股票：{query}")
        if exact["code"] not in seen_codes:
            resolved.append(exact)
            seen_codes.add(exact["code"])

    if not resolved:
        raise ValueError("请至少输入一个股票代码或名称")
    return resolved


def add_stock_codes(codes: list[str]) -> dict[str, Any]:
    stocks = _resolve_stock_inputs(codes)
    normalized_codes = [item["code"] for item in stocks]

    with _connection() as connection:
        existing_codes = {
            row["code"]
            for row in connection.execute(
                f"SELECT code FROM stock_pool WHERE code IN ({','.join('?' for _ in normalized_codes)})",
                normalized_codes,
            ).fetchall()
        }
        connection.executemany(
            """
            INSERT INTO stock_pool (name, code) VALUES (?, ?)
            ON CONFLICT(code) DO UPDATE SET
                name = CASE WHEN stock_pool.name = '未命名' THEN excluded.name ELSE stock_pool.name END,
                updated_at = CURRENT_TIMESTAMP
            """,
            [(item["name"], item["code"]) for item in stocks],
        )

    return {
        "created": [code for code in normalized_codes if code not in existing_codes],
        "skipped": [code for code in normalized_codes if code in existing_codes],
    }


def update_stock_pool(
    stock_id: int,
    *,
    name: str,
    current_price: float,
    cost_price: float,
    quantity: int,
) -> dict[str, Any]:
    with _connection() as connection:
        cursor = connection.execute(
            """
            UPDATE stock_pool
            SET name = ?, current_price = ?, cost_price = ?, quantity = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (name.strip(), current_price, cost_price, quantity, stock_id),
        )
        if cursor.rowcount == 0:
            raise KeyError(stock_id)
        row = connection.execute("SELECT * FROM stock_pool WHERE id = ?", (stock_id,)).fetchone()
    return _row_to_dict(row)


def delete_stock_pool(stock_id: int) -> None:
    with _connection() as connection:
        cursor = connection.execute("DELETE FROM stock_pool WHERE id = ?", (stock_id,))
        if cursor.rowcount == 0:
            raise KeyError(stock_id)


def delete_stock_pool_many(stock_ids: list[int]) -> int:
    unique_ids = sorted(set(stock_ids))
    with _connection() as connection:
        cursor = connection.execute(
            f"DELETE FROM stock_pool WHERE id IN ({','.join('?' for _ in unique_ids)})",
            unique_ids,
        )
    return cursor.rowcount
