from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[1]


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        os.environ[key.strip()] = value.strip().strip('"').strip("'")


_load_dotenv(BASE_DIR / ".env")


@dataclass(frozen=True)
class XtTraderSettings:
    address: str
    username: str
    password: str
    account_id: str
    account_key: str | None
    app_id: str
    auth_code: str
    machine_info: str
    config_dir: Path
    vendor_dir: Path
    connect_timeout_seconds: float
    login_timeout_seconds: float


def get_xt_settings() -> XtTraderSettings:
    return XtTraderSettings(
        address=os.getenv("XT_TRADER_ADDRESS", ""),
        username=os.getenv("XT_TRADER_USERNAME", ""),
        password=os.getenv("XT_TRADER_PASSWORD", ""),
        account_id=os.getenv("XT_TRADER_ACCOUNT_ID", ""),
        account_key=os.getenv("XT_TRADER_ACCOUNT_KEY") or None,
        app_id=os.getenv("XT_TRADER_APP_ID", "xt_api_2.0"),
        auth_code=os.getenv("XT_TRADER_AUTH_CODE", "7f3c92e678f9ec77"),
        machine_info=os.getenv("XT_TRADER_MACHINE_INFO", ""),
        config_dir=Path(os.getenv("XT_TRADER_CONFIG_DIR", BASE_DIR / "config")).resolve(),
        vendor_dir=Path(os.getenv("XT_TRADER_VENDOR_DIR", BASE_DIR / "vendor" / "xttrader")).resolve(),
        connect_timeout_seconds=float(os.getenv("XT_TRADER_CONNECT_TIMEOUT", "20")),
        login_timeout_seconds=float(os.getenv("XT_TRADER_LOGIN_TIMEOUT", "20")),
    )
