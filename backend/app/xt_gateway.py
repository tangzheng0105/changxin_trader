from __future__ import annotations

import os
import sys
import threading
import time
from pathlib import Path
from typing import Any, Callable

from .config import XtTraderSettings, get_xt_settings
from .schemas import OrderRequest, TraderStatus
from .trade_exceptions import list_trade_exceptions, record_trade_exception
from .trade_logs import record_trade_log


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
        self._account_keys: dict[str, str] = {}
        self._dll_dirs: list[Any] = []
        self._request_id = 1

    def status(self, account_id: str) -> TraderStatus:
        settings = self._settings
        return TraderStatus(
            configured=all([settings.address, settings.username, settings.password, account_id]),
            api_loaded=self._module is not None,
            connected=self._connected.is_set(),
            logged_in=self._logged_in,
            account_id=account_id,
            account_key=self._account_keys.get(account_id),
            address=settings.address,
        )

    def connect(self, account_id: str) -> dict[str, Any]:
        with self._lock:
            self._ensure_api()
            self._ensure_connected()
            self._ensure_logged_in()
            self._require_account_key(account_id)
            # A socket/login callback can be stale. Verify that this account can
            # actually execute a synchronous request before reporting success.
            self._call_account_method("reqAccountDetailSync", account_id)
            return self.status(account_id).model_dump()

    def account_detail(self, account_id: str) -> dict[str, Any]:
        return _model_to_dict(self._call_account_method("reqAccountDetailSync", account_id))

    def orders(self, account_id: str) -> list[dict[str, Any]]:
        return _list_to_dicts(self._call_account_method("reqOrderDetailSync", account_id))

    def deals(self, account_id: str) -> list[dict[str, Any]]:
        return _list_to_dicts(self._call_account_method("reqDealDetailSync", account_id))

    def positions(self, account_id: str) -> list[dict[str, Any]]:
        return _list_to_dicts(self._call_account_method("reqPositionDetailSync", account_id))

    def position_statics(self, account_id: str) -> list[dict[str, Any]]:
        return _list_to_dicts(self._call_account_method("reqPositionStaticsSync", account_id))

    def exceptions(self, account_id: str) -> list[dict[str, Any]]:
        stored = list_trade_exceptions(account_id)
        historical = []
        for order in self.orders(account_id):
            error_id = int(order.get("m_nErrorID") or order.get("m_nErrorCode") or 0)
            if error_id or order.get("m_strErrorMsg"):
                historical.append({**order, "m_strExceptionType": "委托明细"})
        return [*stored, *historical]

    def account_keys(self, account_id: str) -> list[dict[str, Any]]:
        self._ensure_ready(account_id)
        error = self._module.XtError(0, "")
        keys = self._api.reqAccountKeysSync(error)
        self._check_error(error, "查询 accountKey 失败")
        return _list_to_dicts(keys)

    def order(self, account_id: str, request: OrderRequest) -> dict[str, Any]:
        request_payload = request.model_dump()
        try:
            self._ensure_ready(account_id)
            order_info = self._module.COrdinaryOrder()
            order_info.m_strAccountID = account_id
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
            order_id = self._api.orderSync(order_info, error, self._require_account_key(account_id))
            self._check_error(error, "同步下单失败")
            response = {"order_id": order_id}
            record_trade_log(account_id, "ordinary_order", request_payload, response)
            return response
        except Exception as exc:
            record_trade_log(account_id, "ordinary_order", request_payload, error_message=str(exc))
            raise

    def intelligent_algorithm_order(
        self,
        *,
        account_id: str,
        market: str,
        instrument: str,
        operation: str,
        price: float,
        volume: int,
    ) -> dict[str, Any]:
        request_payload = {
            "market": market.upper(), "instrument": instrument, "operation": operation,
            "price": price, "volume": volume, "algorithm": "VWAP",
        }
        try:
            self._ensure_ready(account_id)
            order_info = self._module.CIntelligentAlgorithmOrder()
            order_info.m_strAccountID = account_id
            order_info.m_strMarket = market.upper()
            order_info.m_strInstrument = instrument
            order_info.m_eOperationType = self._enum_value(
            "EOperationType", {"BUY": "OPT_BUY", "SELL": "OPT_SELL"}[operation]
            )
            order_info.m_ePriceType = self._enum_value("EPriceType", "PRTP_MARKET")
            order_info.m_dPrice = price
            order_info.m_nVolume = volume
            order_info.m_strOrderType = "VWAP"
            order_info.m_nValidTimeStart = int(time.time())
            order_info.m_nValidTimeEnd = order_info.m_nValidTimeStart + 1800
            order_info.m_dMaxPartRate = 1
            order_info.m_dMinAmountPerOrder = 100
            order_info.m_strRemark = "rebalance-vwap"

            error = self._module.XtError(0, "")
            order_id = self._api.orderSync(order_info, error, self._require_account_key(account_id))
            self._check_error(error, "智能算法调仓下单失败")
            response = {"order_id": order_id}
            record_trade_log(account_id, "intelligent_algorithm_order", request_payload, response)
            return response
        except Exception as exc:
            record_trade_log(account_id, "intelligent_algorithm_order", request_payload, error_message=str(exc))
            raise

    def cancel_command(self, account_id: str, order_id: int) -> dict[str, Any]:
        request_payload = {"order_id": order_id}
        try:
            self._ensure_ready(account_id)
            error = self._module.XtError(0, "")
            self._api.cancelSync(order_id, error, self._require_account_key(account_id))
            self._check_error(error, "同步撤指令失败")
            record_trade_log(account_id, "cancel_command", request_payload, request_payload)
            return request_payload
        except Exception as exc:
            record_trade_log(account_id, "cancel_command", request_payload, error_message=str(exc))
            raise

    def cancel_order(self, account_id: str, order_sys_id: str, market: str = "", instrument: str = "") -> dict[str, Any]:
        request_payload = {"order_sys_id": order_sys_id, "market": market, "instrument": instrument}
        try:
            self._ensure_ready(account_id)
            error = self._module.XtError(0, "")
            self._api.cancelOrderSync(
                account_id,
                order_sys_id,
                market,
                instrument,
                error,
                self._require_account_key(account_id),
            )
            self._check_error(error, "同步撤委托失败")
            response = {"order_sys_id": order_sys_id}
            record_trade_log(account_id, "cancel_order", request_payload, response)
            return response
        except Exception as exc:
            record_trade_log(account_id, "cancel_order", request_payload, error_message=str(exc))
            raise

    def _call_account_method(self, method_name: str, account_id: str) -> Any:
        with self._lock:
            try:
                return self._execute_account_method(method_name, account_id)
            except XtTraderGatewayError as exc:
                if not self._is_transport_error(str(exc)):
                    raise
                self._invalidate_connection()
                return self._execute_account_method(method_name, account_id)

    def _execute_account_method(self, method_name: str, account_id: str) -> Any:
        self._ensure_ready(account_id)
        error = self._module.XtError(0, "")
        method: Callable[..., Any] = getattr(self._api, method_name)
        result = method(account_id, error, self._require_account_key(account_id))
        self._check_error(error, f"{method_name} failed")
        return result

    @staticmethod
    def _is_transport_error(message: str) -> bool:
        normalized = message.lower()
        return "no proxy client" in normalized or "end of file" in normalized

    def _invalidate_connection(self) -> None:
        self._api = None
        self._callback = None
        self._connected.clear()
        self._login_event.clear()
        self._logged_in = False
        self._account_keys.clear()

    def _ensure_ready(self, account_id: str) -> None:
        with self._lock:
            self._ensure_api()
            self._ensure_connected()
            self._ensure_logged_in()
            self._require_account_key(account_id)

    def _ensure_api(self) -> None:
        self._settings = get_xt_settings()
        if not all([self._settings.address, self._settings.username, self._settings.password]):
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

            def onRtnOrderError(self, error: Any) -> None:
                payload = _model_to_dict(error)
                record_trade_exception(str(payload.get("m_strAccountID") or ""), "委托异常", payload)

            def onRtnCancelError(self, error: Any) -> None:
                payload = _model_to_dict(error)
                record_trade_exception(str(payload.get("m_strAccountID") or ""), "撤单异常", payload)

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

    def _refresh_account_key(self, requested_account_id: str) -> None:
        error = self._module.XtError(0, "")
        keys = self._api.reqAccountKeysSync(error)
        self._check_error(error, "查询 accountKey 失败")
        for item in keys or []:
            account_id = getattr(item, "m_strAccountID", "")
            account_key = getattr(item, "m_strAccountKey", "")
            if account_id:
                self._account_keys[account_id] = account_key
            if account_id == requested_account_id or (not account_id and account_key):
                self._account_keys[requested_account_id] = account_key
                break

    def _require_account_key(self, account_id: str) -> str:
        account_key = self._account_keys.get(account_id)
        if not account_key:
            self._refresh_account_key(account_id)
            account_key = self._account_keys.get(account_id)
        if not account_key:
            raise XtTraderGatewayError("未获取到当前资金账号的 accountKey，请确认账号登录状态。")
        return account_key

    def _check_error(self, error: Any, prefix: str) -> None:
        if _error_success(error):
            return
        message = _error_message(error)
        raise XtTraderGatewayError(f"{prefix}: {message}")

    def _enum_value(self, enum_name: str, member_name: str) -> Any:
        enum_type = getattr(self._module, enum_name)
        return getattr(enum_type, member_name)


gateway = XtTraderGateway()
