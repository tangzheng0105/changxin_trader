from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from .auth import CurrentUser, assert_trader, get_current_user
from .schemas import ApiResult, CancelCommandRequest, CancelOrderRequest, OrderRequest, TraderStatus
from .trade_logs import list_trade_logs
from .xt_gateway import XtTraderGatewayError, gateway

router = APIRouter(prefix="/api/trader", tags=["trader"])


def _run(action):
    try:
        return ApiResult(success=True, data=action())
    except XtTraderGatewayError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/status", response_model=TraderStatus)
def get_status(user: CurrentUser = Depends(get_current_user)) -> TraderStatus:
    assert_trader(user)
    return gateway.status(user.account_id)


@router.post("/connect", response_model=ApiResult)
def connect(user: CurrentUser = Depends(get_current_user)) -> ApiResult:
    assert_trader(user)
    return _run(lambda: gateway.connect(user.account_id))


@router.get("/account", response_model=ApiResult)
def account_detail(user: CurrentUser = Depends(get_current_user)) -> ApiResult:
    assert_trader(user)
    return _run(lambda: gateway.account_detail(user.account_id))


@router.get("/account-keys", response_model=ApiResult)
def account_keys(user: CurrentUser = Depends(get_current_user)) -> ApiResult:
    assert_trader(user)
    return _run(lambda: gateway.account_keys(user.account_id))


@router.get("/orders", response_model=ApiResult)
def orders(user: CurrentUser = Depends(get_current_user)) -> ApiResult:
    assert_trader(user)
    return _run(lambda: gateway.orders(user.account_id))


@router.get("/deals", response_model=ApiResult)
def deals(user: CurrentUser = Depends(get_current_user)) -> ApiResult:
    assert_trader(user)
    return _run(lambda: gateway.deals(user.account_id))


@router.get("/exceptions", response_model=ApiResult)
def exceptions(user: CurrentUser = Depends(get_current_user)) -> ApiResult:
    assert_trader(user)
    return _run(lambda: gateway.exceptions(user.account_id))


@router.get("/logs", response_model=ApiResult)
def trade_logs(user: CurrentUser = Depends(get_current_user)) -> ApiResult:
    assert_trader(user)
    return ApiResult(success=True, data=list_trade_logs(user.account_id))


@router.get("/positions", response_model=ApiResult)
def positions(user: CurrentUser = Depends(get_current_user)) -> ApiResult:
    assert_trader(user)
    return _run(lambda: gateway.positions(user.account_id))


@router.get("/position-statics", response_model=ApiResult)
def position_statics(user: CurrentUser = Depends(get_current_user)) -> ApiResult:
    assert_trader(user)
    return _run(lambda: gateway.position_statics(user.account_id))


@router.post("/orders", response_model=ApiResult)
def order(request: OrderRequest, user: CurrentUser = Depends(get_current_user)) -> ApiResult:
    assert_trader(user)
    return _run(lambda: gateway.order(user.account_id, request))


@router.post("/cancel-command", response_model=ApiResult)
def cancel_command(request: CancelCommandRequest, user: CurrentUser = Depends(get_current_user)) -> ApiResult:
    assert_trader(user)
    return _run(lambda: gateway.cancel_command(user.account_id, request.order_id))


@router.post("/cancel-order", response_model=ApiResult)
def cancel_order(request: CancelOrderRequest, user: CurrentUser = Depends(get_current_user)) -> ApiResult:
    assert_trader(user)
    return _run(lambda: gateway.cancel_order(user.account_id, request.order_sys_id, request.market, request.instrument))
