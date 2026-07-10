import {
  ApiOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  PoweroffOutlined,
  ReloadOutlined,
  SendOutlined,
  WalletOutlined,
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
import { useEffect, useState } from "react";
import {
  cancelCommand,
  cancelOrder,
  connectTrader,
  getAccountDetail,
  getDeals,
  getOrders,
  getPositions,
  getTraderStatus,
  placeOrder,
} from "./api/client";
import DataGrid from "./components/DataGrid";

const { Content, Header } = Layout;
const { Text, Title } = Typography;

const emptyData = {
  account: null,
  orders: [],
  deals: [],
  positions: [],
};

export default function App() {
  const [status, setStatus] = useState(null);
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [activeTab, setActiveTab] = useState("account");
  const [orderForm] = Form.useForm();
  const [cancelCommandForm] = Form.useForm();
  const [cancelOrderForm] = Form.useForm();

  async function loadStatus() {
    const traderStatus = await getTraderStatus();
    setStatus(traderStatus);
    return traderStatus;
  }

  async function connect() {
    setConnecting(true);
    try {
      const result = await connectTrader();
      setStatus(result.data);
      message.success("交易接口已连接");
      await refreshData();
    } catch (error) {
      message.error(error.message);
    } finally {
      setConnecting(false);
    }
  }

  async function refreshData() {
    setLoading(true);

    try {
      await loadStatus();
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
    loadStatus()
      .catch((error) => message.error(error.message))
      .finally(() => setLoading(false));
  }, []);

  const connected = Boolean(status?.connected && status?.logged_in);

  return (
    <Layout className="app-shell">
      <Header className="app-header">
        <Space size={12}>
          <ApiOutlined className="brand-icon" />
          <span className="brand-name">Changxin Trader</span>
        </Space>
        <Space>
          <Tag icon={connected ? <CheckCircleOutlined /> : <CloseCircleOutlined />} color={connected ? "success" : "error"}>
            {connected ? "已连接" : "未连接"}
          </Tag>
          <Button
            icon={<PoweroffOutlined />}
            loading={connecting}
            type="primary"
            onClick={connect}
          >
            连接交易接口
          </Button>
        </Space>
      </Header>

      <Content className="app-content">
        <section className="page-title">
          <div>
            <Title level={2}>XtTraderPyApi 交易界面</Title>
            <Text type="secondary">
              账号 {status?.account_id || "-"}，服务器 {status?.address || "-"}
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

        <Row gutter={[16, 16]} className="stat-row">
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title="接口加载" value={status?.api_loaded ? "已加载" : "未加载"} prefix={<ApiOutlined />} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title="服务器连接" value={status?.connected ? "已连接" : "未连接"} prefix={<PoweroffOutlined />} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title="用户登录" value={status?.logged_in ? "已登录" : "未登录"} prefix={<CheckCircleOutlined />} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title="AccountKey" value={status?.account_key ? "已获取" : "未获取"} prefix={<WalletOutlined />} />
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} xl={16}>
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
                    children: <DataGrid rows={data.positions} loading={loading && activeTab === "positions"} />,
                  },
                ]}
              />
            </Card>
          </Col>

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
        </Row>
      </Content>
    </Layout>
  );
}
