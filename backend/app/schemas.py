from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class ApiResult(BaseModel):
    success: bool
    message: str = ""
    data: Any = None


class TraderStatus(BaseModel):
    configured: bool
    api_loaded: bool
    connected: bool
    logged_in: bool
    account_id: str
    account_key: str | None = None
    address: str


class OrderRequest(BaseModel):
    market: str = Field(..., examples=["SH", "SZ"])
    instrument: str = Field(..., examples=["600000", "000001"])
    price: float = Field(..., gt=0)
    volume: int = Field(..., gt=0)
    operation: Literal["BUY", "SELL"] = "BUY"
    price_type: Literal["FIX", "MARKET", "LATEST"] = "FIX"
    remark: str = "web order"


class CancelCommandRequest(BaseModel):
    order_id: int = Field(..., gt=0)


class CancelOrderRequest(BaseModel):
    order_sys_id: str
    market: str = ""
    instrument: str = ""
