FROM python:3.11-slim-bullseye

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgcc1 libstdc++6 libnsl2 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
# 安装依赖
RUN pip install --upgrade pip -i https://pypi.tuna.tsinghua.edu.cn/simple
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt

COPY backend/app ./app
COPY backend/config ./config
COPY refer/lib/linux ./vendor/xttrader

ENV PYTHONUNBUFFERED=1 \
    XT_TRADER_CONFIG_DIR=/app/config \
    XT_TRADER_VENDOR_DIR=/app/vendor/xttrader \
    LD_LIBRARY_PATH=/app/vendor/xttrader

RUN python -c "import sys; sys.path.insert(0, '/app/vendor/xttrader'); import XtTraderPyApi; print('XtTraderPyApi Linux runtime loaded')"

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
