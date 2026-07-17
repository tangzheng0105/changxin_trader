# Docker 部署指南

## 部署说明

本项目使用 Docker Compose 部署前端和后端。后端镜像基于 Linux，并在构建时从 `refer/lib/linux` 复制 XtTraderPyApi、`libXtTraderApi.so` 及其依赖库。

当前镜像固定使用 Python 3.11，对应依赖文件：

```text
refer/lib/linux/XtTraderPyApi.cpython-311-x86_64-linux-gnu.so
```

请使用 Linux 容器模式运行 Docker Desktop，或在 Linux x86_64 服务器上部署。

## 前置条件

- Docker Engine 24+ 和 Docker Compose v2+
- Linux x86_64 容器环境
- 部署主机能够连接迅投交易服务器

检查 Docker 容器模式：

```bash
docker info --format '{{.OSType}}'
```

输出应为 `linux`。

## 配置交易凭证

在项目根目录执行：

```bash
cp backend/.env.example backend/.env
```

编辑 `backend/.env`，至少填写：

```dotenv
XT_TRADER_ADDRESS=交易服务器地址:端口
XT_TRADER_USERNAME=迅投登录用户名
XT_TRADER_PASSWORD=迅投登录密码
```

`backend/.env` 不会被复制进镜像，也不应提交到版本库。

## 启动服务

首次构建并启动：

```bash
docker compose up -d --build
```

查看容器状态：

```bash
docker compose ps
```

查看实时日志：

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

访问地址：

- 前端：`http://部署主机IP:5173/`
- 后端健康检查：`http://部署主机IP:8000/api/health`
- 后端 API 文档：`http://部署主机IP:8000/docs`

前端 Nginx 会将 `/api` 自动代理至后端容器，浏览器无须额外配置后端地址。

## 数据持久化与备份

Compose 将以下目录挂载到主机：

- `backend/data/`：用户、股票池、仓位设置、调仓任务、异常信息、交易日志等 SQLite 数据
- `backend/userdata/`：XtTrader 运行时数据

升级或迁移前，先停止服务并备份这两个目录：

```bash
docker compose down
cp -a backend/data /backup/changxin-trader/data
cp -a backend/userdata /backup/changxin-trader/userdata
```

## 日常运维

更新代码后重新构建：

```bash
docker compose up -d --build
```

停止服务：

```bash
docker compose down
```

仅重启后端：

```bash
docker compose restart backend
```

## 故障排查

### XtTraderPyApi 导入失败

确认 Docker 使用 Linux x86_64 容器，且构建日志中没有忽略 `refer/lib/linux`。后端镜像已设置：

```text
XT_TRADER_VENDOR_DIR=/app/vendor/xttrader
LD_LIBRARY_PATH=/app/vendor/xttrader
```

进入容器核对文件：

```bash
docker compose exec backend sh
ls -al /app/vendor/xttrader
```

### 交易接口无法连接

检查 `backend/.env` 中交易服务器地址、用户名和密码，并确认部署主机网络与防火墙允许访问交易服务器。容器运行后仍需在交易员登录页面点击“连接交易接口”。

### 前端无法请求后端

检查两项服务都在运行：

```bash
docker compose ps
docker compose logs backend
```

不要在浏览器中直接配置 `backend:8000`；该地址仅在 Docker 容器网络内可用。

## 安全建议

- 限制 `5173` 与 `8000` 的防火墙访问范围。
- 妥善保管 `backend/.env`、SQLite 数据目录和日志备份。
- 生产环境建议在 Nginx、反向代理或 VPN 后提供访问，并配置 HTTPS。
