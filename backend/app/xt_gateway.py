from __future__ import annotations

import os
import sys
import threading
from pathlib import Path
from typing import Any, Callable

from .config import XtTraderSettings, get_xt_settings
from .schemas import OrderRequest, TraderStatus


class XtTraderGatewayError(RuntimeError):
    pass


def _error_success(error: Any) -> bool:
    is_success = getattr(error, "isSuccess", None)
    if callable(is_success):
        return bool(is_success())
    return bool(is_success)


def _error_message(error: Any) -> str:
    message = getattr(error, "errorMsg", None)
    if callable(message):
        return str(message())
    return str(message or "")


def _value_to_json(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (list, tuple)):
        return [_value_to_json(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _value_to_json(item) for key, item in value.items()}
    return str(value)


def _model_to_dict(model: Any) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for name in dir(model):
        if not name.startswith("m_"):
            continue
        try:
            result[name] = _value_to_json(getattr(model, name))
        except Exception:
            result[name] = None
    return result


def _list_to_dicts(items: Any) -> list[dict[str, Any]]:
    if not items:
        return []
    return [_model_to_dict(item) for item in items]


class XtTraderGateway:
    def __init__(self) -> None:
        self._settings = get_xt_settings()
        self._lock = threading.RLock()
        self._module: Any = None
        self._api: Any = None
        self._callback: Any = None
        self._connected = threading.Event()
        self._login_event = threading.Event()
        self._login_error: str | None = None
        self._logged_in = False
        self._account_key: str | None = self._settings.account_key
        self._account_keys: dict[str, str] = {}
        self._dll_dirs: list[Any] = []
        self._request_id = 1

    def status(self) -> TraderStatus:
        settings = self._settings
        return TraderStatus(
            configured=all([settings.address, settings.username, settings.password, settings.account_id]),
            api_loaded=self._module is not None,
            connected=self._connected.is_set(),
            logged_in=self._logged_in,
            account_id=settings.account_id,
            account_key=self._account_key,
            address=settings.address,
        )

    def connect(self) -> dict[str, Any]:
        with self._lock:
            self._ensure_api()
            self._ensure_connected()
            self._ensure_logged_in()
            return self.status().model_dump()

    def account_detail(self) -> dict[str, Any]:
        return _model_to_dict(self._call_account_method("reqAccountDetailSync"))

    def orders(self) -> list[dict[str, Any]]:
        return _list_to_dicts(self._call_account_method("reqOrderDetailSync"))

    def deals(self) -> list[dict[str, Any]]:
        return _list_to_dicts(self._call_account_method("reqDealDetailSync"))

    def positions(self) -> list[dict[str, Any]]:
        return _list_to_dicts(self._call_account_method("reqPositionDetailSync"))

    def position_statics(self) -> list[dict[str, Any]]:
        return _list_to_dicts(self._call_account_method("reqPositionStaticsSync"))

    def account_keys(self) -> list[dict[str, Any]]:
        self._ensure_ready()
        error = self._module.XtError(0, "")
        keys = self._api.reqAccountKeysSync(error)
        self._check_error(error, "查询 accountKey 失败")
        return _list_to_dicts(keys)

    def order(self, request: OrderRequest) -> dict[str, Any]:
        self._ensure_ready()
        order_info = self._module.COrdinaryOrder()
        order_info.m_strAccountID = self._settings.account_id
        order_info.m_strMarket = request.market.upper()
        order_info.m_strInstrument = request.instrument
        order_info.m_dPrice = request.price
        order_info.m_nVolume = request.volume
        order_info.m_dSuperPriceRate = 0
        order_info.m_strRemark = request.remark
        order_info.m_eOperationType = self._enum_value(
            "EOperationType",
            {"BUY": "OPT_BUY", "SELL": "OPT_SELL"}[request.operation],
        )
        order_info.m_ePriceType = self._enum_value(
            "EPriceType",
            {"FIX": "PRTP_FIX", "MARKET": "PRTP_MARKET", "LATEST": "PRTP_LATEST"}[request.price_type],
        )

        error = self._module.XtError(0, "")
        order_id = self._api.orderSync(order_info, error, self._require_account_key())
        self._check_error(error, "同步下单失败")
        return {"order_id": order_id}

    def cancel_command(self, order_id: int) -> dict[str, Any]:
        self._ensure_ready()
        error = self._module.XtError(0, "")
        self._api.cancelSync(order_id, error, self._require_account_key())
        self._check_error(error, "同步撤指令失败")
        return {"order_id": order_id}

    def cancel_order(self, order_sys_id: str, market: str = "", instrument: str = "") -> dict[str, Any]:
        self._ensure_ready()
        error = self._module.XtError(0, "")
        self._api.cancelOrderSync(
            self._settings.account_id,
            order_sys_id,
            market,
            instrument,
            error,
            self._require_account_key(),
        )
        self._check_error(error, "同步撤委托失败")
        return {"order_sys_id": order_sys_id}

    def _call_account_method(self, method_name: str) -> Any:
        self._ensure_ready()
        error = self._module.XtError(0, "")
        method: Callable[..., Any] = getattr(self._api, method_name)
        result = method(self._settings.account_id, error, self._require_account_key())
        self._check_error(error, f"{method_name} failed")
        return result

    def _ensure_ready(self) -> None:
        with self._lock:
            self._ensure_api()
            self._ensure_connected()
            self._ensure_logged_in()
            self._require_account_key()

    def _ensure_api(self) -> None:
        self._settings = get_xt_settings()
        if not self.status().configured:
            raise XtTraderGatewayError("XT_TRADER_* 配置不完整，请检查 backend/.env。")

        if self._module is None:
            self._load_xt_module(self._settings.vendor_dir)

        if self._api is None:
            self._api = self._module.XtTraderApi.createXtTraderApi(self._settings.address)
            if self._api is None:
                raise XtTraderGatewayError("创建 XtTraderApi 客户端失败。")
            self._callback = self._create_callback()
            self._api.setCallback(self._callback)
            init_result = self._api.init(str(self._settings.config_dir))
            if isinstance(init_result, bool) and not init_result:
                raise XtTraderGatewayError("初始化 XtTraderApi 失败：False")
            if isinstance(init_result, tuple) and init_result and init_result[0] not in (None, 0, True):
                raise XtTraderGatewayError(f"初始化 XtTraderApi 失败：{init_result}")
            if type(init_result) is int and init_result != 0:
                raise XtTraderGatewayError(f"初始化 XtTraderApi 失败：{init_result}")
            self._api.join_async()

    def _load_xt_module(self, vendor_dir: Path) -> None:
        if not vendor_dir.exists():
            raise XtTraderGatewayError(f"XtTraderPyApi 目录不存在：{vendor_dir}")
        sys.path.insert(0, str(vendor_dir))
        if hasattr(os, "add_dll_directory"):
            self._dll_dirs.append(os.add_dll_directory(str(vendor_dir)))
        try:
            import XtTraderPyApi  # type: ignore
        except Exception as exc:
            raise XtTraderGatewayError(f"导入 XtTraderPyApi 失败：{exc}") from exc
        self._module = XtTraderPyApi

    def _create_callback(self) -> Any:
        gateway = self
        base_class = self._module.XtTraderApiCallback

        class Callback(base_class):  # type: ignore[misc, valid-type]
            def onConnected(self, success: bool, error_msg: str) -> None:
                if success:
                    gateway._connected.set()
                else:
                    gateway._connected.clear()

            def onUserLogin(self, username: str, password: str, request_id: int, error: Any) -> None:
                gateway._logged_in = _error_success(error)
                gateway._login_error = None if gateway._logged_in else _error_message(error)
                gateway._login_event.set()

            def onRtnLoginStatusWithActKey(
                self,
                account_id: str,
                status: Any,
                account_type: Any,
                account_key: str,
                error_msg: str,
            ) -> None:
                if account_id and account_key:
                    gateway._account_keys[account_id] = account_key
                    if account_id == gateway._settings.account_id:
                        gateway._account_key = account_key

        return Callback()

    def _ensure_connected(self) -> None:
        if self._connected.wait(self._settings.connect_timeout_seconds):
            return
        raise XtTraderGatewayError(f"连接交易服务器超时：{self._settings.address}")

    def _ensure_logged_in(self) -> None:
        if self._logged_in:
            return
        error = self._api.userLoginSync(
            self._settings.username,
            self._settings.password,
            self._settings.machine_info,
            self._settings.app_id,
            self._settings.auth_code,
        )
        if _error_success(error):
            self._logged_in = True
        else:
            self._login_async_after_sync_error(_error_message(error))
        self._account_key = self._settings.account_key or self._account_keys.get(self._settings.account_id)
        if not self._account_key:
            self._refresh_account_key()

    def _login_async_after_sync_error(self, sync_error: str) -> None:
        self._login_event.clear()
        self._login_error = None
        self._request_id += 1
        self._api.userLogin(
            self._settings.username,
            self._settings.password,
            self._request_id,
            self._settings.machine_info,
            self._settings.app_id,
            self._settings.auth_code,
        )
        if not self._login_event.wait(self._settings.login_timeout_seconds):
            raise XtTraderGatewayError(f"用户登录失败: {sync_error}; 异步登录等待超时")
        if not self._logged_in:
            raise XtTraderGatewayError(f"用户登录失败: {self._login_error or sync_error}")

    def _refresh_account_key(self) -> None:
        error = self._module.XtError(0, "")
        keys = self._api.reqAccountKeysSync(error)
        self._check_error(error, "查询 accountKey 失败")
        for item in keys or []:
            account_id = getattr(item, "m_strAccountID", "")
            account_key = getattr(item, "m_strAccountKey", "")
            if account_id:
                self._account_keys[account_id] = account_key
            if account_id == self._settings.account_id or (not account_id and account_key):
                self._account_key = account_key
                break

    def _require_account_key(self) -> str:
        if not self._account_key:
            self._refresh_account_key()
        if not self._account_key:
            raise XtTraderGatewayError("未获取到当前资金账号的 accountKey，请确认账号登录状态。")
        return self._account_key

    def _check_error(self, error: Any, prefix: str) -> None:
        if _error_success(error):
            return
        message = _error_message(error)
        raise XtTraderGatewayError(f"{prefix}: {message}")

    def _enum_value(self, enum_name: str, member_name: str) -> Any:
        enum_type = getattr(self._module, enum_name)
        return getattr(enum_type, member_name)


gateway = XtTraderGateway()
