from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .schemas import ApiResult, CancelCommandRequest, CancelOrderRequest, OrderRequest, TraderStatus
from .xt_gateway import XtTraderGatewayError, gateway

router = APIRouter(prefix="/api/trader", tags=["trader"])


def _run(action):
    try:
        return ApiResult(success=True, data=action())
    except XtTraderGatewayError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/status", response_model=TraderStatus)
def get_status() -> TraderStatus:
    return gateway.status()


@router.post("/connect", response_model=ApiResult)
def connect() -> ApiResult:
    return _run(gateway.connect)


@router.get("/account", response_model=ApiResult)
def account_detail() -> ApiResult:
    return _run(gateway.account_detail)


@router.get("/account-keys", response_model=ApiResult)
def account_keys() -> ApiResult:
    return _run(gateway.account_keys)


@router.get("/orders", response_model=ApiResult)
def orders() -> ApiResult:
    return _run(gateway.orders)


@router.get("/deals", response_model=ApiResult)
def deals() -> ApiResult:
    return _run(gateway.deals)


@router.get("/positions", response_model=ApiResult)
def positions() -> ApiResult:
    return _run(gateway.positions)


@router.get("/position-statics", response_model=ApiResult)
def position_statics() -> ApiResult:
    return _run(gateway.position_statics)


@router.post("/orders", response_model=ApiResult)
def order(request: OrderRequest) -> ApiResult:
    return _run(lambda: gateway.order(request))


@router.post("/cancel-command", response_model=ApiResult)
def cancel_command(request: CancelCommandRequest) -> ApiResult:
    return _run(lambda: gateway.cancel_command(request.order_id))


@router.post("/cancel-order", response_model=ApiResult)
def cancel_order(request: CancelOrderRequest) -> ApiResult:
    return _run(lambda: gateway.cancel_order(request.order_sys_id, request.market, request.instrument))
