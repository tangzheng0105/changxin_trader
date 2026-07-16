from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from .auth import CurrentUser, assert_trader, get_current_user
from .rebalancer import build_plan, execute_plan, schedule_plan
from .schemas import ApiResult, RebalanceScheduleRequest
from .xt_gateway import XtTraderGatewayError


router = APIRouter(prefix="/api/rebalance", tags=["rebalance"])


def _run(action):
    try:
        return ApiResult(success=True, data=action())
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except XtTraderGatewayError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/preview", response_model=ApiResult)
def preview(user: CurrentUser = Depends(get_current_user)) -> ApiResult:
    assert_trader(user)
    return _run(lambda: build_plan(user.account_id))


@router.post("/{plan_id}/execute", response_model=ApiResult)
def execute(plan_id: int, user: CurrentUser = Depends(get_current_user)) -> ApiResult:
    assert_trader(user)
    return _run(lambda: execute_plan(user.account_id, plan_id))


@router.post("/{plan_id}/schedule", response_model=ApiResult)
def schedule(plan_id: int, request: RebalanceScheduleRequest, user: CurrentUser = Depends(get_current_user)) -> ApiResult:
    assert_trader(user)
    return _run(lambda: schedule_plan(user.account_id, plan_id, request.scheduled_at))
