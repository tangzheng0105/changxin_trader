from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from .auth import CurrentUser, assert_trader, get_current_user
from .schemas import ApiResult, StockPoolBatchCreate, StockPoolBatchDelete, StockPoolUpdate
from .stock_pool import add_stock_codes, delete_stock_pool, delete_stock_pool_many, get_stock_kline, list_stock_pool, search_securities, update_stock_pool


router = APIRouter(prefix="/api/stock-pool", tags=["stock-pool"])


@router.get("", response_model=ApiResult)
def get_stock_pool(user: CurrentUser = Depends(get_current_user)) -> ApiResult:
    assert_trader(user)
    return ApiResult(success=True, data=list_stock_pool())


@router.get("/search", response_model=ApiResult)
def search_stock_pool(query: str = "", user: CurrentUser = Depends(get_current_user)) -> ApiResult:
    assert_trader(user)
    return ApiResult(success=True, data=search_securities(query))


@router.get("/{code}/kline", response_model=ApiResult)
def get_stock_kline_data(code: str, interval: str = "day", user: CurrentUser = Depends(get_current_user)) -> ApiResult:
    assert_trader(user)
    try:
        return ApiResult(success=True, data=get_stock_kline(code, interval))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("", response_model=ApiResult)
def create_stock_pool(request: StockPoolBatchCreate, user: CurrentUser = Depends(get_current_user)) -> ApiResult:
    assert_trader(user)
    try:
        return ApiResult(success=True, data=add_stock_codes(request.codes))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.put("/{stock_id}", response_model=ApiResult)
def update_stock(stock_id: int, request: StockPoolUpdate, user: CurrentUser = Depends(get_current_user)) -> ApiResult:
    assert_trader(user)
    try:
        return ApiResult(success=True, data=update_stock_pool(stock_id, **request.model_dump()))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="股票记录不存在") from exc


@router.delete("/{stock_id}", response_model=ApiResult)
def delete_stock(stock_id: int, user: CurrentUser = Depends(get_current_user)) -> ApiResult:
    assert_trader(user)
    try:
        delete_stock_pool(stock_id)
        return ApiResult(success=True, data={"id": stock_id})
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="股票记录不存在") from exc


@router.delete("", response_model=ApiResult)
def delete_stocks(request: StockPoolBatchDelete, user: CurrentUser = Depends(get_current_user)) -> ApiResult:
    assert_trader(user)
    return ApiResult(success=True, data={"deleted": delete_stock_pool_many(request.ids)})
