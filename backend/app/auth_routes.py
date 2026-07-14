from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from .auth import CurrentUser, assert_admin, create_trader, get_current_user, list_traders, login
from .schemas import ApiResult, LoginRequest, TraderCreateRequest, UserInfo


router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=ApiResult)
def login_user(request: LoginRequest) -> ApiResult:
    try:
        return ApiResult(success=True, data=login(request.account_id, request.password))
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@router.get("/me", response_model=UserInfo)
def get_me(user: CurrentUser = Depends(get_current_user)) -> UserInfo:
    return UserInfo(account_id=user.account_id, role=user.role)


@router.get("/traders", response_model=ApiResult)
def get_traders(user: CurrentUser = Depends(get_current_user)) -> ApiResult:
    assert_admin(user)
    return ApiResult(success=True, data=list_traders())


@router.post("/traders", response_model=ApiResult)
def create_trader_user(request: TraderCreateRequest, user: CurrentUser = Depends(get_current_user)) -> ApiResult:
    assert_admin(user)
    try:
        return ApiResult(success=True, data=create_trader(request.account_id, request.password))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
