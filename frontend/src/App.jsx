import {
  ApiOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  PoweroffOutlined,
  ProfileOutlined,
  ReloadOutlined,
  SendOutlined,
  TeamOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Layout,
  Row,
  Select,
  Space,
  Statistic,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import { useEffect, useMemo, useState } from "react";
import {
  cancelCommand,
  cancelOrder,
  connectTrader,
  getAccountDetail,
  getDeals,
  getOrders,
  getPositions,
  getTraderStatus,
  getAuthToken,
  getCurrentUser,
  placeOrder,
  setAuthToken,
} from "./api/client";
import DataGrid from "./components/DataGrid";
import LoginPage from "./components/LoginPage";
import StockPoolPage from "./components/StockPoolPage";
import UserManagementPage from "./components/UserManagementPage";

const { Content, Header } = Layout;
const { Text, Title } = Typography;

const emptyData = {
  account: null,
  orders: [],
  deals: [],
  positions: [],
};

function pick(data, keys, fallback = "-") {
  for (const key of keys) {
    const value = data?.[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return fallback;
}

function money(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return "-";
  }
  return numberValue.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function numberText(value, digits = 2) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return "-";
  }
  return numberValue.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function positionCostPrice(row) {
  const totalCost = Number(row.m_dPositionCost ?? row.m_dOpenCost);
  const volume = Number(row.m_nVolume);
  if (Number.isFinite(totalCost) && Number.isFinite(volume) && volume > 0) {
    return totalCost / volume;
  }
  return row.m_dCostPrice ?? row.m_dOpenPrice;
}

function profitClassName(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue === 0) {
    return "";
  }
  return numberValue > 0 ? "profit-positive" : "profit-negative";
}

const positionColumns = [
  {
    title: "证券",
    key: "instrument",
    width: 220,
    fixed: "left",
    render: (_, row) => (
      <div className="instrument-cell">
        <Text strong className="instrument-name">{row.m_strInstrumentName || "-"}</Text>
        <Text type="secondary">
          {row.m_strInstrumentID || "-"} / {row.m_strExchangeID || row.m_strMarket || "-"}
        </Text>
      </div>
    ),
  },
  {
    title: "持仓数量",
    dataIndex: "m_nVolume",
    key: "m_nVolume",
    width: 120,
    align: "right",
    render: (value) => numberText(value, 0),
  },
  {
    title: "成本价",
    dataIndex: "m_dPositionCost",
    key: "m_dPositionCost",
    width: 140,
    align: "right",
    render: (_, row) => numberText(positionCostPrice(row)),
  },
  {
    title: "最新价",
    dataIndex: "m_dLastPrice",
    key: "m_dLastPrice",
    width: 120,
    align: "right",
    render: (value) => numberText(value),
  },
  {
    title: "持仓盈亏",
    dataIndex: "m_dPositionProfit",
    key: "m_dPositionProfit",
    width: 140,
    align: "right",
    render: (value) => <span className={profitClassName(value)}>{numberText(value)}</span>,
  },
  {
    title: "市值",
    dataIndex: "m_dMarketValue",
    key: "m_dMarketValue",
    width: 140,
    align: "right",
    render: (value, row) => numberText(value ?? row.m_dInstrumentValue),
  },
];

export default function App() {
  const [status, setStatus] = useState(null);
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [activeTab, setActiveTab] = useState("account");
  const [currentPage, setCurrentPage] = useState("trading");
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [orderForm] = Form.useForm();
  const [cancelCommandForm] = Form.useForm();
  const [cancelOrderForm] = Form.useForm();

  const accountOverview = useMemo(() => {
    const account = data.account ?? {};
    return {
      balance: pick(account, ["m_dBalance", "m_dAssetBalance", "m_dTotalAsset", "m_dTotalAssets"], 0),
      available: pick(account, ["m_dAvailable", "m_dEnableBalance"], 0),
      stockValue: pick(account, ["m_dInstrumentValue", "m_dStockValue", "m_dMarketValue"], 0),
      positionProfit: pick(account, ["m_dPositionProfit", "m_dFloatProfit"], 0),
      daysProfit: pick(account, ["m_dDaysProfit", "m_dTodayProfit"], 0),
      accountName: pick(account, ["m_strAccountName", "m_strName"], "长心股票test2"),
      brokerId: pick(account, ["m_strBrokerID", "m_strBrokerId"], "11194"),
      brokerName: pick(account, ["m_strBrokerName"], "迅投柜台股票仿真"),
    };
  }, [data.account]);

  async function loadStatus() {
    const traderStatus = await getTraderStatus();
    setStatus(traderStatus);
    return traderStatus;
  }

  async function loadTradingData() {
    const [account, orders, deals, positions] = await Promise.all([
      getAccountDetail(),
      getOrders(),
      getDeals(),
      getPositions(),
    ]);
    setData({
      account: account.data,
      orders: orders.data ?? [],
      deals: deals.data ?? [],
      positions: positions.data ?? [],
    });
  }

  async function connect() {
    setConnecting(true);
    try {
      const result = await connectTrader();
      setStatus(result.data);
      message.success("交易接口已连接");
      await loadTradingData();
    } catch (error) {
      message.error(error.message);
    } finally {
      setConnecting(false);
    }
  }

  async function refreshData() {
    setLoading(true);

    try {
      const traderStatus = await loadStatus();
      if (traderStatus.connected && traderStatus.logged_in) {
        await loadTradingData();
      }
    } catch (error) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitOrder(values) {
    try {
      const result = await placeOrder(values);
      message.success(`下单成功，指令号：${result.data.order_id}`);
      orderForm.resetFields();
      await refreshData();
    } catch (error) {
      message.error(error.message);
    }
  }

  async function submitCancelCommand(values) {
    try {
      await cancelCommand(values);
      message.success("撤指令请求已提交");
      cancelCommandForm.resetFields();
      await refreshData();
    } catch (error) {
      message.error(error.message);
    }
  }

  async function submitCancelOrder(values) {
    try {
      await cancelOrder(values);
      message.success("撤委托请求已提交");
      cancelOrderForm.resetFields();
      await refreshData();
    } catch (error) {
      message.error(error.message);
    }
  }

  useEffect(() => {
    if (!getAuthToken()) {
      setAuthLoading(false);
      return;
    }
    getCurrentUser()
      .then(setUser)
      .catch(() => setAuthToken(null))
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    if (!user || user.role !== "trader") {
      setLoading(false);
      return;
    }
    setLoading(true);
    loadStatus()
      .then((traderStatus) => {
        if (traderStatus.connected && traderStatus.logged_in) {
          return loadTradingData();
        }
        return null;
      })
      .catch((error) => message.error(error.message))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    if (user) setCurrentPage(user.role === "admin" ? "users" : "trading");
  }, [user]);

  function logout() {
    setAuthToken(null);
    setUser(null);
    setStatus(null);
    setData(emptyData);
  }

  if (authLoading) {
    return <main className="login-page" />;
  }

  if (!user) {
    return <LoginPage onLogin={setUser} />;
  }

  const connected = Boolean(status?.connected && status?.logged_in);

  return (
    <Layout className="app-shell">
      <Header className="app-header">
        <Space size={12}>
          <ApiOutlined className="brand-icon" />
          <span className="brand-name">Changxin Trader</span>
        </Space>
        <nav className="header-nav" aria-label="主导航">
          {user.role === "trader" && (
            <>
              <Button type="text" className={`header-nav-item ${currentPage === "trading" ? "active" : ""}`} onClick={() => setCurrentPage("trading")}>交易界面</Button>
              <Button type="text" icon={<DatabaseOutlined />} className={`header-nav-item ${currentPage === "pool" ? "active" : ""}`} onClick={() => setCurrentPage("pool")}>股票池管理</Button>
              <Button type="text" icon={<ProfileOutlined />} className={`header-nav-item ${currentPage === "details" ? "active" : ""}`} onClick={() => setCurrentPage("details")}>账户明细</Button>
            </>
          )}
          {user.role === "admin" && (
            <Button type="text" icon={<TeamOutlined />} className={`header-nav-item ${currentPage === "users" ? "active" : ""}`} onClick={() => setCurrentPage("users")}>用户管理</Button>
          )}
        </nav>
        <Space>
          <Tag color={user.role === "admin" ? "gold" : "blue"}>{user.role === "admin" ? "管理员" : user.account_id}</Tag>
          {user.role === "trader" && <Tag icon={connected ? <CheckCircleOutlined /> : <CloseCircleOutlined />} color={connected ? "success" : "error"}>{connected ? "已连接" : "未连接"}</Tag>}
          {user.role === "trader" && <Button icon={<PoweroffOutlined />} loading={connecting} type="primary" onClick={connect}>连接交易接口</Button>}
          <Button icon={<LogoutOutlined />} onClick={logout}>退出</Button>
        </Space>
      </Header>

      <Content className="app-content">
        {currentPage === "users" ? (
          <UserManagementPage />
        ) : currentPage === "pool" ? (
          <StockPoolPage accountBalance={accountOverview.balance} positions={data.positions} />
        ) : (
          <>
        <section className="page-title">
          <div>
            <Title level={2}>{currentPage === "details" ? "账户明细" : "XtTraderPyApi 交易界面"}</Title>
            <Text type="secondary" className="account-meta">
              账号 {status?.account_id || "-"}，服务器 {status?.address || "-"}，账号名称：
              {accountOverview.accountName}，经纪公司编号：{accountOverview.brokerId}，经纪公司名称：
              {accountOverview.brokerName}
            </Text>
          </div>
          <Button icon={<ReloadOutlined />} onClick={refreshData} loading={loading}>
            刷新数据
          </Button>
        </section>

        {!connected && (
          <Alert
            className="status-alert"
            type="warning"
            showIcon
            message="交易接口尚未连接"
            description="点击右上角连接交易接口后，可查询资金、委托、成交、持仓并发起同步普通委托。"
          />
        )}

        <Card className="account-overview" title="账户概览">
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} lg={8} xl={4}>
              <Statistic title="总资产" value={money(accountOverview.balance)} />
            </Col>
            <Col xs={24} sm={12} lg={8} xl={4}>
              <Statistic title="可用资金" value={money(accountOverview.available)} />
            </Col>
            <Col xs={24} sm={12} lg={8} xl={4}>
              <Statistic title="股票总市值" value={money(accountOverview.stockValue)} />
            </Col>
            <Col xs={24} sm={12} lg={8} xl={4}>
              <Statistic title="持仓盈亏" value={money(accountOverview.positionProfit)} />
            </Col>
            <Col xs={24} sm={12} lg={8} xl={4}>
              <Statistic title="当日盈亏" value={money(accountOverview.daysProfit)} />
            </Col>
          </Row>
        </Card>

        <Row gutter={[16, 16]}>
          {currentPage === "details" && (
          <Col xs={24} xl={24}>
            <Card className="workspace-card">
              <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={[
                  {
                    key: "account",
                    label: "资金",
                    children: <DataGrid rows={data.account} loading={loading && activeTab === "account"} />,
                  },
                  {
                    key: "orders",
                    label: "委托",
                    children: <DataGrid rows={data.orders} loading={loading && activeTab === "orders"} />,
                  },
                  {
                    key: "deals",
                    label: "成交",
                    children: <DataGrid rows={data.deals} loading={loading && activeTab === "deals"} />,
                  },
                  {
                    key: "positions",
                    label: "持仓",
                    children: (
                      <DataGrid
                        rows={data.positions}
                        loading={loading && activeTab === "positions"}
                        columns={positionColumns}
                      />
                    ),
                  },
                ]}
              />
            </Card>
          </Col>
          )}

          {currentPage === "trading" && (
          <Col xs={24} xl={8}>
            <Space direction="vertical" size={16} className="full-width">
              <Card title="同步普通委托" className="workspace-card">
                <Form
                  form={orderForm}
                  layout="vertical"
                  initialValues={{
                    market: "SH",
                    operation: "BUY",
                    price_type: "FIX",
                    volume: 100,
                    remark: "web order",
                  }}
                  onFinish={submitOrder}
                >
                  <Row gutter={12}>
                    <Col span={10}>
                      <Form.Item name="market" label="市场" rules={[{ required: true }]}>
                        <Select
                          options={[
                            { value: "SH", label: "SH" },
                            { value: "SZ", label: "SZ" },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={14}>
                      <Form.Item name="instrument" label="证券代码" rules={[{ required: true }]}>
                        <Input placeholder="600000" />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item name="operation" label="方向" rules={[{ required: true }]}>
                        <Select
                          options={[
                            { value: "BUY", label: "买入" },
                            { value: "SELL", label: "卖出" },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="price_type" label="价格类型" rules={[{ required: true }]}>
                        <Select
                          options={[
                            { value: "FIX", label: "限价" },
                            { value: "MARKET", label: "市价" },
                            { value: "LATEST", label: "最新价" },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item name="price" label="价格" rules={[{ required: true }]}>
                        <InputNumber min={0.01} precision={3} className="full-width" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="volume" label="数量" rules={[{ required: true }]}>
                        <InputNumber min={1} step={100} className="full-width" />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item name="remark" label="备注">
                    <Input />
                  </Form.Item>
                  <Button icon={<SendOutlined />} type="primary" htmlType="submit" block>
                    同步下单
                  </Button>
                </Form>
              </Card>

              <Card title="撤单" className="workspace-card">
                <Form form={cancelCommandForm} layout="vertical" onFinish={submitCancelCommand}>
                  <Form.Item name="order_id" label="指令号" rules={[{ required: true }]}>
                    <InputNumber min={1} precision={0} className="full-width" />
                  </Form.Item>
                  <Button icon={<DeleteOutlined />} htmlType="submit" block>
                    按指令号撤单
                  </Button>
                </Form>
                <div className="form-divider" />
                <Form form={cancelOrderForm} layout="vertical" onFinish={submitCancelOrder}>
                  <Form.Item name="order_sys_id" label="合同编号" rules={[{ required: true }]}>
                    <Input />
                  </Form.Item>
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item name="market" label="市场">
                        <Input placeholder="SH" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="instrument" label="证券代码">
                        <Input />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Button icon={<DeleteOutlined />} htmlType="submit" block>
                    按合同编号撤单
                  </Button>
                </Form>
              </Card>
            </Space>
          </Col>
          )}
        </Row>
          </>
        )}
      </Content>
    </Layout>
  );
}
