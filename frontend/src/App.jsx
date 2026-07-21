import {
  ApiOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  PoweroffOutlined,
  ProfileOutlined,
  ReloadOutlined,
  TeamOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  InputNumber,
  Layout,
  Modal,
  Row,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import { useEffect, useMemo, useState } from "react";
import {
  connectTrader,
  getAccountDetail,
  getDeals,
  getTradeExceptions,
  getPositionSetting,
  getOrders,
  getPositions,
  getTraderStatus,
  getAuthToken,
  getCurrentUser,
  setAuthToken,
  executeRebalance,
  previewRebalance,
  scheduleRebalance,
  updatePositionSetting,
} from "./api/client";
import DataGrid from "./components/DataGrid";
import LoginPage from "./components/LoginPage";
import StockPoolPage from "./components/StockPoolPage";
import TradeLogPage from "./components/TradeLogPage";
import UserManagementPage from "./components/UserManagementPage";

const { Content, Header } = Layout;
const { Text, Title } = Typography;

const emptyData = {
  account: null,
  orders: [],
  deals: [],
  exceptions: [],
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

function tenThousandMoney(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return "-";
  }
  return (numberValue / 10000).toLocaleString("zh-CN", {
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
    sorter: (left, right) => Number(left.m_dPositionProfit ?? 0) - Number(right.m_dPositionProfit ?? 0),
    render: (value) => <span className={profitClassName(value)}>{numberText(value)}</span>,
  },
  {
    title: "市值",
    dataIndex: "m_dMarketValue",
    key: "m_dMarketValue",
    width: 140,
    align: "right",
    sorter: (left, right) => Number(left.m_dMarketValue ?? left.m_dInstrumentValue ?? 0) - Number(right.m_dMarketValue ?? right.m_dInstrumentValue ?? 0),
    render: (value, row) => numberText(value ?? row.m_dInstrumentValue),
  },
];

function transactionErrorMessage(row) {
  return row.m_strErrorMsg || row.m_strCancelInfo || "-";
}

const transactionExceptionColumns = [
  {
    title: "证券",
    key: "instrument",
    render: (_, row) => (
      <div className="instrument-cell">
        <Text strong>{row.m_strInstrumentName || "-"}</Text>
        <Text type="secondary">{row.m_strInstrumentID || "-"} / {row.m_strExchangeID || "-"}</Text>
      </div>
    ),
  },
  { title: "指令号", dataIndex: "m_nOrderID", key: "m_nOrderID", align: "right" },
  { title: "错误编号", dataIndex: "m_nErrorID", key: "m_nErrorID", align: "right" },
  { title: "异常信息", key: "error_message", render: (_, row) => <span className="profit-positive">{transactionErrorMessage(row)}</span> },
  { title: "委托日期", dataIndex: "m_strInsertDate", key: "m_strInsertDate" },
  { title: "委托时间", dataIndex: "m_strInsertTime", key: "m_strInsertTime" },
];

const orderColumnTitles = {
  m_strAccountID: "资金账号",
  m_strInstrumentID: "证券代码",
  m_strInstrument: "证券代码",
  m_strInstrumentName: "证券名称",
  m_strExchangeID: "交易市场",
  m_strMarket: "交易市场",
  m_nOrderID: "指令号",
  m_strOrderSysID: "合同编号",
  m_dLimitPrice: "委托价格",
  m_dPrice: "委托价格",
  m_dAveragePrice: "成交均价",
  m_nTotalVolume: "委托数量",
  m_nTradedVolume: "已成交数量",
  m_dTradeAmount: "成交金额",
  m_nErrorID: "错误编号",
  m_strErrorMsg: "错误信息",
  m_strInsertDate: "委托日期",
  m_strInsertTime: "委托时间",
  m_nDirection: "买卖方向",
  m_eOrderStatus: "委托状态",
  m_eStatus: "委托状态",
  m_eOrderSubmitStatus: "报单状态",
  m_nOrderPriceType: "报价类型",
  m_strRemark: "备注",
  m_strCancelInfo: "撤单信息",
};

const dealColumnTitles = {
  m_strAccountID: "资金账号",
  m_strInstrumentID: "证券代码",
  m_strInstrument: "证券代码",
  m_strInstrumentName: "证券名称",
  m_strExchangeID: "交易市场",
  m_strMarket: "交易市场",
  m_strTradeID: "成交编号",
  m_strOrderSysID: "合同编号",
  m_nOrderID: "指令号",
  m_dAveragePrice: "成交价格",
  m_nVolume: "成交数量",
  m_dAmount: "成交金额",
  m_dComssion: "佣金",
  m_dCommission: "佣金",
  m_strTradeDate: "成交日期",
  m_strTradeTime: "成交时间",
  m_nDirection: "买卖方向",
  m_nOrderPriceType: "报价类型",
  m_strRemark: "备注",
};

function enumLabel(value, labels) {
  const normalized = String(value);
  const memberName = normalized.split(".").at(-1);
  return labels[normalized] ?? labels[memberName] ?? labels[Number(value)] ?? normalized;
}

const entrustStatusLabels = {
  0: "待成交回报",
  48: "未报",
  49: "待报",
  50: "已报",
  51: "已报待撤",
  52: "部成待撤",
  53: "部撤",
  54: "已撤",
  55: "部成",
  56: "已成",
  57: "废单",
  58: "已受理",
  59: "已确认",
  86: "已确认",
  87: "预埋",
  88: "预埋已撤",
  255: "未知",
  ENTRUST_STATUS_WAIT_END: "待成交回报",
  ENTRUST_STATUS_UNREPORTED: "未报",
  ENTRUST_STATUS_WAIT_REPORTING: "待报",
  ENTRUST_STATUS_REPORTED: "已报",
  ENTRUST_STATUS_REPORTED_CANCEL: "已报待撤",
  ENTRUST_STATUS_PARTSUCC_CANCEL: "部成待撤",
  ENTRUST_STATUS_PART_CANCEL: "部撤",
  ENTRUST_STATUS_CANCELED: "已撤",
  ENTRUST_STATUS_PART_SUCC: "部成",
  ENTRUST_STATUS_SUCCEEDED: "已成",
  ENTRUST_STATUS_JUNK: "废单",
  ENTRUST_STATUS_ACCEPT: "已受理",
  ENTRUST_STATUS_CONFIRMED: "已确认",
  ENTRUST_STATUS_DETERMINED: "已确认",
  ENTRUST_STATUS_PREPARE_ORDER: "预埋",
  ENTRUST_STATUS_PREPARE_CANCELED: "预埋已撤",
  ENTRUST_STATUS_UNKNOWN: "未知",
};

const submitStatusLabels = {
  48: "已提交",
  49: "撤单已提交",
  50: "改单已提交",
  51: "已接受",
  52: "报单被拒绝",
  53: "撤单被拒绝",
  54: "改单被拒绝",
  ENTRUST_SUBMIT_STATUS_InsertSubmitted: "已提交",
  ENTRUST_SUBMIT_STATUS_CancelSubmitted: "撤单已提交",
  ENTRUST_SUBMIT_STATUS_ModifySubmitted: "改单已提交",
  ENTRUST_SUBMIT_STATUS_OSS_Accepted: "已接受",
  ENTRUST_SUBMIT_STATUS_InsertRejected: "报单被拒绝",
  ENTRUST_SUBMIT_STATUS_CancelRejected: "撤单被拒绝",
  ENTRUST_SUBMIT_STATUS_ModifyRejected: "改单被拒绝",
};

const directionLabels = {
  48: "买入",
  49: "卖出",
  50: "备兑",
  66: "质押出库",
  81: "质押入库",
  ENTRUST_BUY: "买入",
  ENTRUST_SELL: "卖出",
  ENTRUST_COVERED: "备兑",
  ENTRUST_PLEDGE_IN: "质押入库",
  ENTRUST_PLEDGE_OUT: "质押出库",
};

const priceTypeLabels = {
  5: "最新价",
  11: "限价",
  12: "市价",
  49: "市价",
  50: "限价",
  51: "最优价",
  PRTP_LATEST: "最新价",
  PRTP_FIX: "限价",
  PRTP_MARKET: "市价",
  PRTP_HANG: "跟盘价",
  PRTP_COMPETE: "对手价",
  BROKER_PRICE_ANY: "市价",
  BROKER_PRICE_LIMIT: "限价",
  BROKER_PRICE_BEST: "最优价",
  BROKER_PRICE_PROP_MARKET: "市价涨跌停价",
  BROKER_PRICE_PROP_MARKET_BEST: "市价最优价",
  BROKER_PRICE_PROP_MARKET_CANCEL: "市价即成剩撤",
  BROKER_PRICE_PROP_MARKET_CANCEL_ALL: "市价全额成交或撤",
  BROKER_PRICE_PROP_MARKET_CANCEL_1: "市价最优1档即成剩撤",
  BROKER_PRICE_PROP_MARKET_CANCEL_5: "市价最优5档即成剩撤",
};

const orderValueRenderers = {
  m_eOrderStatus: (value) => enumLabel(value, entrustStatusLabels),
  m_eStatus: (value) => enumLabel(value, entrustStatusLabels),
  m_eOrderSubmitStatus: (value) => enumLabel(value, submitStatusLabels),
  m_nDirection: (value) => enumLabel(value, directionLabels),
  m_nOrderPriceType: (value) => enumLabel(value, priceTypeLabels),
};

const dealValueRenderers = {
  m_nDirection: (value) => enumLabel(value, directionLabels),
  m_nOrderPriceType: (value) => enumLabel(value, priceTypeLabels),
};

export default function App() {
  const [status, setStatus] = useState(null);
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [activeTab, setActiveTab] = useState("positions");
  const [currentPage, setCurrentPage] = useState("pool");
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [positionPercentage, setPositionPercentage] = useState(0);
  const [positionModalOpen, setPositionModalOpen] = useState(false);
  const [savingPositionSetting, setSavingPositionSetting] = useState(false);
  const [positionSettingForm] = Form.useForm();
  const [rebalancePlan, setRebalancePlan] = useState(null);
  const [rebalanceModalOpen, setRebalanceModalOpen] = useState(false);
  const [creatingRebalancePlan, setCreatingRebalancePlan] = useState(false);
  const [executingRebalance, setExecutingRebalance] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(null);

  const rebalanceAmounts = useMemo(() => {
    return (rebalancePlan?.items ?? []).reduce(
      (totals, item) => {
        const amount = Number(item.quantity) * Number(item.price);
        if (!Number.isFinite(amount)) return totals;
        if (item.action === "BUY") totals.buy += amount;
        if (item.action === "SELL") totals.sell += amount;
        return totals;
      },
      { buy: 0, sell: 0 },
    );
  }, [rebalancePlan]);

  const accountOverview = useMemo(() => {
    const account = data.account ?? {};
    const balance = pick(account, ["m_dBalance", "m_dAssetBalance", "m_dTotalAsset", "m_dTotalAssets"], 0);
    const stockValue = pick(account, ["m_dInstrumentValue", "m_dStockValue", "m_dMarketValue"], 0);
    return {
      balance,
      available: pick(account, ["m_dAvailable", "m_dEnableBalance"], 0),
      stockValue,
      positionRatio: Number(balance) > 0 ? (Number(stockValue) / Number(balance)) * 100 : 0,
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
    try {
      const account = await getAccountDetail();
      const orders = await getOrders();
      const deals = await getDeals();
      const exceptions = await getTradeExceptions();
      const positions = await getPositions();
      setData({
        account: account.data,
        orders: orders.data ?? [],
        deals: deals.data ?? [],
        exceptions: exceptions.data ?? [],
        positions: positions.data ?? [],
      });
    } catch (error) {
      setStatus((previous) => (previous ? { ...previous, connected: false, logged_in: false } : previous));
      throw error;
    }
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

  function openPositionSetting() {
    positionSettingForm.setFieldsValue({ target_percentage: positionPercentage });
    setPositionModalOpen(true);
  }

  async function savePositionSetting(values) {
    setSavingPositionSetting(true);
    try {
      const result = await updatePositionSetting(values);
      setPositionPercentage(result.data.target_percentage);
      setPositionModalOpen(false);
      message.success("仓位设置已保存");
    } catch (error) {
      message.error(error.message);
    } finally {
      setSavingPositionSetting(false);
    }
  }

  async function openRebalancePreview() {
    setCreatingRebalancePlan(true);
    try {
      const result = await previewRebalance();
      setRebalancePlan(result.data);
      setScheduledAt(null);
      setRebalanceModalOpen(true);
    } catch (error) {
      message.error(error.message);
    } finally {
      setCreatingRebalancePlan(false);
    }
  }

  async function runRebalanceNow() {
    if (!rebalancePlan) return;
    setExecutingRebalance(true);
    try {
      const result = await executeRebalance(rebalancePlan.plan_id);
      const succeeded = result.data.results.filter((item) => item.success).length;
      message.success(`已提交 ${succeeded} 笔智能算法委托`);
      setRebalanceModalOpen(false);
      await refreshData();
    } catch (error) {
      message.error(error.message);
    } finally {
      setExecutingRebalance(false);
    }
  }

  async function scheduleRebalancePlan() {
    if (!rebalancePlan || !scheduledAt) {
      message.warning("请选择定时执行开始时间");
      return;
    }
    setExecutingRebalance(true);
    try {
      await scheduleRebalance(rebalancePlan.plan_id, scheduledAt.format("YYYY-MM-DDTHH:mm:00"));
      message.success("调仓任务已定时");
      setRebalanceModalOpen(false);
    } catch (error) {
      message.error(error.message);
    } finally {
      setExecutingRebalance(false);
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
    if (!user || user.role !== "trader") {
      return;
    }
    getPositionSetting()
      .then((result) => setPositionPercentage(result.data.target_percentage))
      .catch((error) => message.error(error.message));
  }, [user]);

  useEffect(() => {
    if (user) setCurrentPage(user.role === "admin" ? "users" : "pool");
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
              <Button type="text" icon={<DatabaseOutlined />} className={`header-nav-item ${currentPage === "pool" ? "active" : ""}`} onClick={() => setCurrentPage("pool")}>股票池管理</Button>
              <Button type="text" icon={<ProfileOutlined />} className={`header-nav-item ${currentPage === "details" ? "active" : ""}`} onClick={() => setCurrentPage("details")}>账户明细</Button>
              <Button type="text" icon={<FileTextOutlined />} className={`header-nav-item ${currentPage === "logs" ? "active" : ""}`} onClick={() => setCurrentPage("logs")}>交易日志</Button>
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
          <StockPoolPage
            accountBalance={accountOverview.balance}
            positions={data.positions}
            onRebalancePreview={openRebalancePreview}
            rebalanceLoading={creatingRebalancePlan}
            positionPercentage={positionPercentage}
            onOpenPositionSetting={openPositionSetting}
          />
        ) : currentPage === "logs" ? (
          <TradeLogPage />
        ) : (
          <>
        <section className="page-title">
          <div>
            <Title level={2}>{currentPage === "details" ? "账户明细" : "账户总览"}</Title>
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
              <Statistic title="总资产（万元）" value={tenThousandMoney(accountOverview.balance)} />
            </Col>
            <Col xs={24} sm={12} lg={8} xl={4}>
              <Statistic title="可用资金（万元）" value={tenThousandMoney(accountOverview.available)} />
            </Col>
            <Col xs={24} sm={12} lg={8} xl={4}>
              <Statistic title="股票总市值（万元）" value={tenThousandMoney(accountOverview.stockValue)} />
            </Col>
            <Col xs={24} sm={12} lg={8} xl={4}>
              <Statistic title="持仓比例" value={accountOverview.positionRatio} precision={2} suffix="%" />
            </Col>
            <Col xs={24} sm={12} lg={8} xl={4}>
              <Statistic
                title="持仓盈亏（万元）"
                value={tenThousandMoney(accountOverview.positionProfit)}
                valueStyle={{ color: Number(accountOverview.positionProfit) > 0 ? "#cf1322" : Number(accountOverview.positionProfit) < 0 ? "#389e0d" : undefined }}
              />
            </Col>
            <Col xs={24} sm={12} lg={8} xl={4}>
              <Statistic
                title="当日盈亏（万元）"
                value={tenThousandMoney(accountOverview.daysProfit)}
                valueStyle={{ color: Number(accountOverview.daysProfit) > 0 ? "#cf1322" : Number(accountOverview.daysProfit) < 0 ? "#389e0d" : undefined }}
              />
            </Col>
          </Row>
        </Card>

        <Modal
          title="设置仓位"
          open={positionModalOpen}
          onCancel={() => setPositionModalOpen(false)}
          onOk={() => positionSettingForm.submit()}
          confirmLoading={savingPositionSetting}
          okText="保存"
          cancelText="取消"
        >
          <Form form={positionSettingForm} layout="vertical" onFinish={savePositionSetting}>
            <Form.Item
              name="target_percentage"
              label="目标仓位"
              rules={[{ required: true, message: "请输入仓位百分比" }]}
            >
              <InputNumber min={0} max={100} precision={2} addonAfter="%" className="full-width" />
            </Form.Item>
          </Form>
        </Modal>

        {currentPage !== "pool" && <Modal
          title="一键调仓方案"
          open={rebalanceModalOpen}
          width={1050}
          onCancel={() => setRebalanceModalOpen(false)}
          footer={[
            <Button key="cancel" onClick={() => setRebalanceModalOpen(false)}>取消</Button>,
            <DatePicker
              key="scheduled-at"
              showTime={{ format: "HH:mm", minuteStep: 1 }}
              format="YYYY-MM-DD HH:mm"
              placeholder="定时开始时间"
              value={scheduledAt}
              onChange={setScheduledAt}
            />,
            <Button key="schedule" loading={executingRebalance} onClick={scheduleRebalancePlan}>定时执行</Button>,
            <Button key="execute" type="primary" loading={executingRebalance} onClick={runRebalanceNow}>立即执行</Button>,
          ]}
        >
          <Row gutter={[16, 8]} className="rebalance-summary">
            <Col><Text>目标仓位：{numberText(rebalancePlan?.target_percentage)}%</Text></Col>
            <Col><Text>目标资金（万元）：{tenThousandMoney(rebalancePlan?.target_total_value)}</Text></Col>
            <Col><Text>待执行：{rebalancePlan?.tradable_count ?? 0} 笔</Text></Col>
            <Col><Text style={{ color: "#cf1322" }}>预计买入（万元）：{tenThousandMoney(rebalanceAmounts.buy)}</Text></Col>
            <Col><Text style={{ color: "#1677ff" }}>预计卖出（万元）：{tenThousandMoney(rebalanceAmounts.sell)}</Text></Col>
          </Row>
          <Table
            rowKey={(item) => `${item.code}-${item.action}`}
            size="small"
            pagination={{ pageSize: 8, showSizeChanger: false }}
            dataSource={rebalancePlan?.items ?? []}
            columns={[
              { title: "序号", key: "index", width: 70, align: "center", render: (_, __, index) => index + 1 },
              { title: "证券", key: "security", render: (_, item) => <div className="instrument-cell"><Text strong>{item.name}</Text><Text type="secondary">{item.code} / {item.market}</Text></div> },
              {
                title: "操作",
                dataIndex: "action",
                render: (action) => (
                  <span style={{ color: action === "BUY" ? "#cf1322" : action === "SELL" ? "#1677ff" : undefined }}>
                    {{ BUY: "买入", SELL: "卖出", HOLD: "不调整", SKIP: "跳过" }[action] ?? action}
                  </span>
                ),
              },
              { title: "当前数量", dataIndex: "current_quantity", align: "right", render: (value) => numberText(value, 0) },
              { title: "目标数量", dataIndex: "target_quantity", align: "right", render: (value) => numberText(value, 0) },
              {
                title: "变化数量",
                dataIndex: "quantity",
                align: "right",
                render: (value, item) => (
                  <span style={{ color: item.action === "BUY" ? "#cf1322" : item.action === "SELL" ? "#1677ff" : undefined }}>
                    {numberText(value, 0)}
                  </span>
                ),
              },
              { title: "参考价", dataIndex: "price", align: "right", render: (value) => numberText(value, 3) },
              {
                title: "调整后市值（万元）",
                key: "target_market_value",
                align: "right",
                render: (_, item) => tenThousandMoney(Number(item.target_quantity) * Number(item.price)),
              },
            ]}
          />
        </Modal>}

        <Row gutter={[16, 16]}>
          {currentPage === "details" && (
          <Col xs={24} xl={24}>
            <Card className="workspace-card">
              <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={[
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
                  {
                    key: "orders",
                    label: "委托",
                    children: <DataGrid rows={data.orders} loading={loading && activeTab === "orders"} columnTitles={orderColumnTitles} valueRenderers={orderValueRenderers} onlyColumnTitles />,
                  },
                  {
                    key: "deals",
                    label: "成交",
                    children: <DataGrid rows={data.deals} loading={loading && activeTab === "deals"} columnTitles={dealColumnTitles} valueRenderers={dealValueRenderers} onlyColumnTitles />,
                  },
                  {
                    key: "exceptions",
                    label: "异常",
                    children: (
                      <DataGrid
                        rows={data.exceptions}
                        loading={loading && activeTab === "exceptions"}
                        columns={transactionExceptionColumns}
                      />
                    ),
                  },
                ]}
              />
            </Card>
          </Col>
          )}
        </Row>
          </>
        )}
        {currentPage === "pool" && <Modal
          title="设置仓位"
          open={positionModalOpen}
          onCancel={() => setPositionModalOpen(false)}
          onOk={() => positionSettingForm.submit()}
          confirmLoading={savingPositionSetting}
          okText="保存"
          cancelText="取消"
        >
          <Form form={positionSettingForm} layout="vertical" onFinish={savePositionSetting}>
            <Form.Item
              name="target_percentage"
              label="目标仓位"
              rules={[{ required: true, message: "请输入仓位百分比" }]}
            >
              <InputNumber min={0} max={100} precision={2} addonAfter="%" className="full-width" />
            </Form.Item>
          </Form>
        </Modal>}
        {currentPage === "pool" && <Modal
          title="一键调仓方案"
          open={rebalanceModalOpen}
          width={1050}
          onCancel={() => setRebalanceModalOpen(false)}
          footer={[
            <Button key="cancel" onClick={() => setRebalanceModalOpen(false)}>取消</Button>,
            <DatePicker
              key="scheduled-at"
              showTime={{ format: "HH:mm", minuteStep: 1 }}
              format="YYYY-MM-DD HH:mm"
              placeholder="定时开始时间"
              value={scheduledAt}
              onChange={setScheduledAt}
            />,
            <Button key="schedule" loading={executingRebalance} onClick={scheduleRebalancePlan}>定时执行</Button>,
            <Button key="execute" type="primary" loading={executingRebalance} onClick={runRebalanceNow}>立即执行</Button>,
          ]}
        >
          <Row gutter={[16, 8]} className="rebalance-summary">
            <Col><Text>目标仓位：{numberText(rebalancePlan?.target_percentage)}%</Text></Col>
            <Col><Text>目标资金（万元）：{tenThousandMoney(rebalancePlan?.target_total_value)}</Text></Col>
            <Col><Text>待执行：{rebalancePlan?.tradable_count ?? 0} 笔</Text></Col>
            <Col><Text style={{ color: "#cf1322" }}>预计买入（万元）：{tenThousandMoney(rebalanceAmounts.buy)}</Text></Col>
            <Col><Text style={{ color: "#1677ff" }}>预计卖出（万元）：{tenThousandMoney(rebalanceAmounts.sell)}</Text></Col>
          </Row>
          <Table
            rowKey={(item) => `${item.code}-${item.action}`}
            size="small"
            pagination={{ pageSize: 8, showSizeChanger: false }}
            dataSource={rebalancePlan?.items ?? []}
            columns={[
              { title: "序号", key: "index", width: 70, align: "center", render: (_, __, index) => index + 1 },
              { title: "证券", key: "security", render: (_, item) => <div className="instrument-cell"><Text strong>{item.name}</Text><Text type="secondary">{item.code} / {item.market}</Text></div> },
              {
                title: "操作",
                dataIndex: "action",
                render: (action) => (
                  <span style={{ color: action === "BUY" ? "#cf1322" : action === "SELL" ? "#1677ff" : undefined }}>
                    {{ BUY: "买入", SELL: "卖出", HOLD: "不调整", SKIP: "跳过" }[action] ?? action}
                  </span>
                ),
              },
              { title: "当前数量", dataIndex: "current_quantity", align: "right", render: (value) => numberText(value, 0) },
              { title: "目标数量", dataIndex: "target_quantity", align: "right", render: (value) => numberText(value, 0) },
              {
                title: "变化数量",
                dataIndex: "quantity",
                align: "right",
                render: (value, item) => (
                  <span style={{ color: item.action === "BUY" ? "#cf1322" : item.action === "SELL" ? "#1677ff" : undefined }}>
                    {numberText(value, 0)}
                  </span>
                ),
              },
              { title: "参考价", dataIndex: "price", align: "right", render: (value) => numberText(value, 3) },
              {
                title: "调整后市值（万元）",
                key: "target_market_value",
                align: "right",
                render: (_, item) => tenThousandMoney(Number(item.target_quantity) * Number(item.price)),
              },
            ]}
          />
        </Modal>}
      </Content>
    </Layout>
  );
}
