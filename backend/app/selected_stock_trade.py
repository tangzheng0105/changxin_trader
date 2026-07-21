from __future__ import annotations

from typing import Any

from .stock_pool import list_stock_pool_by_ids, quote_prices
from .xt_gateway import gateway


def _market(code: str) -> str:
    return "SH" if code.startswith(("6", "9")) else "SZ"


def build_selected_buy_preview(account_id: str, stock_ids: list[int], amount_wan: float = 0) -> dict[str, Any]:
    stocks = list_stock_pool_by_ids(stock_ids)
    if not stocks:
        raise ValueError("请至少选择一只股票")
    if len(stocks) != len(set(stock_ids)):
        raise ValueError("部分已选股票不存在，请刷新列表后重试")

    holdings = {
        str(position.get("m_strInstrumentID") or ""): int(position.get("m_nVolume") or 0)
        for position in gateway.positions(account_id)
    }
    prices = quote_prices([stock["code"] for stock in stocks])
    allocation = max(float(amount_wan), 0) * 10000 / len(stocks)
    items: list[dict[str, Any]] = []
    for stock in stocks:
        price = float(prices.get(stock["code"]) or stock["current_price"] or 0)
        if price <= 0:
            raise ValueError(f"未获取到 {stock['code']} 的有效行情价格")
        volume = int(allocation // price // 100) * 100
        items.append(
            {
                "id": stock["id"],
                "name": stock["name"],
                "code": stock["code"],
                "market": _market(stock["code"]),
                "position": holdings.get(stock["code"], 0),
                "price": round(price, 3),
                "buy_volume": volume,
                "estimated_amount": round(volume * price, 2),
            }
        )
    return {
        "amount_wan": float(amount_wan),
        "total_amount": round(float(amount_wan) * 10000, 2),
        "allocation_per_stock": round(allocation, 2),
        "items": items,
    }


def execute_selected_buy(account_id: str, stock_ids: list[int], amount_wan: float) -> dict[str, Any]:
    if amount_wan <= 0:
        raise ValueError("请输入大于 0 的交易金额")
    preview = build_selected_buy_preview(account_id, stock_ids, amount_wan)
    results: list[dict[str, Any]] = []
    for item in preview["items"]:
        if not item["buy_volume"]:
            results.append({**item, "success": False, "error": "分配金额不足 100 股"})
            continue
        try:
            order = gateway.intelligent_algorithm_order(
                account_id=account_id,
                market=item["market"],
                instrument=item["code"],
                operation="BUY",
                price=float(item["price"]),
                volume=int(item["buy_volume"]),
            )
            results.append({**item, "success": True, "order_id": order.get("order_id")})
        except Exception as exc:
            results.append({**item, "success": False, "error": str(exc)})
    return {**preview, "results": results}


def build_single_trade_preview(
    account_id: str,
    stock_id: int,
    amount_wan: float = 0,
    operation: str = "BUY",
) -> dict[str, Any]:
    if operation not in {"BUY", "SELL"}:
        raise ValueError("不支持的交易方向")
    preview = build_selected_buy_preview(account_id, [stock_id], amount_wan)
    item = preview["items"][0]
    if operation == "SELL" and item["buy_volume"] > item["position"]:
        raise ValueError("卖出金额超过当前可卖持仓市值")
    return {**preview, "operation": operation, "item": item}


def execute_single_trade(account_id: str, stock_id: int, amount_wan: float, operation: str) -> dict[str, Any]:
    if amount_wan <= 0:
        raise ValueError("请输入大于 0 的交易金额")
    preview = build_single_trade_preview(account_id, stock_id, amount_wan, operation)
    item = preview["item"]
    if not item["buy_volume"]:
        raise ValueError("交易金额不足 100 股")
    order = gateway.intelligent_algorithm_order(
        account_id=account_id,
        market=item["market"],
        instrument=item["code"],
        operation=operation,
        price=float(item["price"]),
        volume=int(item["buy_volume"]),
    )
    return {**preview, "order_id": order.get("order_id")}
