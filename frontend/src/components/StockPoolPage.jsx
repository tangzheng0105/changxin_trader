import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, UploadOutlined } from "@ant-design/icons";
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Col,
  Space,
  Table,
  Tooltip,
  Typography,
  Upload,
  message,
} from "antd";
import { useEffect, useMemo, useState } from "react";
import { addStockPool, deleteStockPool, deleteStockPoolBatch, getStockPool, updateStockPool } from "../api/client";

const { Text, Title } = Typography;

function liveMarketValue(position) {
  const marketValue = Number(position.m_dMarketValue ?? position.m_dInstrumentValue);
  if (Number.isFinite(marketValue) && marketValue > 0) return marketValue;

  const lastPrice = Number(position.m_dLastPrice);
  const volume = Number(position.m_nVolume);
  return Number.isFinite(lastPrice) && Number.isFinite(volume) ? lastPrice * volume : 0;
}

export default function StockPoolPage({
  accountBalance,
  positions = [],
  onRebalancePreview,
  rebalanceLoading = false,
  positionPercentage = 0,
  onOpenPositionSetting,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tablePagination, setTablePagination] = useState({ current: 1, pageSize: 10 });
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const [addForm] = Form.useForm();

  async function loadPool() {
    setLoading(true);
    try {
      const result = await getStockPool();
      setRows(result.data ?? []);
      setSelectedRowKeys([]);
    } catch (error) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPool();
  }, []);

  async function addCodes({ entries }) {
    const parsedEntries = entries.split(/[\s,;，；]+/).filter(Boolean);
    if (!parsedEntries.length) {
      message.warning("请输入股票代码或名称");
      return;
    }
    setSubmitting(true);
    try {
      const result = await addStockPool(parsedEntries);
      const createdCount = result.data?.created?.length ?? 0;
      const skippedCount = result.data?.skipped?.length ?? 0;
      message.success(`已添加 ${createdCount} 只${skippedCount ? `，跳过 ${skippedCount} 只已存在代码` : ""}`);
      addForm.resetFields();
      setAddModalOpen(false);
      await loadPool();
    } catch (error) {
      message.error(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(row) {
    setEditing(row);
    form.setFieldsValue({
      name: row.name,
      current_price: row.current_price,
      cost_price: row.cost_price,
      quantity: row.quantity,
    });
  }

  async function saveEdit(values) {
    if (!editing) return;
    try {
      await updateStockPool(editing.id, values);
      message.success("持仓已更新");
      setEditing(null);
      await loadPool();
    } catch (error) {
      message.error(error.message);
    }
  }

  async function removeStock(row) {
    try {
      await deleteStockPool(row.id);
      message.success("已从股票池删除");
      await loadPool();
    } catch (error) {
      message.error(error.message);
    }
  }

  async function removeSelectedStocks() {
    try {
      const result = await deleteStockPoolBatch(selectedRowKeys);
      message.success(`已删除 ${result.data?.deleted ?? 0} 只股票`);
      await loadPool();
    } catch (error) {
      message.error(error.message);
    }
  }

  async function importTextFile(file) {
    if (!file.name.toLowerCase().endsWith(".txt")) {
      message.error("仅支持 TXT 文件");
      return Upload.LIST_IGNORE;
    }
    try {
      addForm.setFieldValue("entries", await file.text());
      setAddModalOpen(true);
      message.success("已读取文件内容");
    } catch {
      message.error("文件读取失败");
    }
    return Upload.LIST_IGNORE;
  }

  const totalAssets = Number(accountBalance) || 0;
  const marketValuesByCode = useMemo(() => {
    const values = new Map();
    positions.forEach((position) => {
      const code = String(position.m_strInstrumentID || "").trim();
      if (!code) return;
      values.set(code, (values.get(code) || 0) + liveMarketValue(position));
    });
    return values;
  }, [positions]);

  const tableRows = useMemo(
    () =>
      rows.map((row) => {
        const marketValue = marketValuesByCode.get(row.code) || 0;
        return {
          ...row,
          position_ratio: totalAssets > 0 ? (marketValue / totalAssets) * 100 : 0,
        };
      }),
    [rows, marketValuesByCode, totalAssets],
  );

  const columns = [
    {
      title: "序号",
      key: "index",
      width: 72,
      align: "center",
      render: (_, __, index) => (tablePagination.current - 1) * tablePagination.pageSize + index + 1,
    },
    {
      title: "股票名称",
      key: "instrument",
      width: 220,
      render: (_, row) => (
        <div className="instrument-cell">
          <Text strong className="instrument-name">{row.name}</Text>
          <Text type="secondary">{row.code}</Text>
        </div>
      ),
    },
    {
      title: "持仓占比",
      dataIndex: "position_ratio",
      key: "position_ratio",
      align: "right",
      sorter: (left, right) => left.position_ratio - right.position_ratio,
      render: (value) => `${Number(value).toFixed(2)}%`,
    },
    {
      title: "操作",
      key: "actions",
      width: 108,
      align: "center",
      render: (_, row) => (
        <Space size={4}>
          <Tooltip title="编辑持仓">
            <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(row)} />
          </Tooltip>
          <Popconfirm title="删除这只股票？" okText="删除" cancelText="取消" onConfirm={() => removeStock(row)}>
            <Tooltip title="删除">
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <section>
      <section className="page-title stock-pool-title">
        <div>
          <Title level={2}>股票池管理</Title>
          <Text type="secondary">维护自选股票及持仓信息，数据保存在本地 SQLite 数据库。</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadPool} loading={loading}>刷新列表</Button>
          <Upload accept=".txt,text/plain" maxCount={1} showUploadList={false} beforeUpload={importTextFile}>
            <Button icon={<UploadOutlined />}>导入 TXT</Button>
          </Upload>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModalOpen(true)}>添加股票</Button>
        </Space>
      </section>

      <Card className="workspace-card rebalance-settings-card" title="调仓设置">
        <Row gutter={0} align="middle">
          <Col xs={24} lg={12} className="rebalance-setting-section rebalance-position-section">
            <Text type="secondary">目标仓位</Text>
            <Space align="baseline" size={12} className="rebalance-position-action">
              <Text className="rebalance-position-value">{Number(positionPercentage).toFixed(2)}%</Text>
              <Button onClick={onOpenPositionSetting}>设置仓位</Button>
            </Space>
          </Col>
          <Col xs={24} lg={12} className="rebalance-setting-section rebalance-action-section">
            <Button type="primary" loading={rebalanceLoading} onClick={onRebalancePreview}>生成调仓方案</Button>
          </Col>
        </Row>
      </Card>

      <Card
        className="workspace-card stock-pool-table"
        title="股票持仓列表"
        extra={
          <Space>
            <Text type="secondary">实时总资产：{totalAssets.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
            <Popconfirm
              title={`删除已选的 ${selectedRowKeys.length} 只股票？`}
              okText="删除"
              cancelText="取消"
              disabled={!selectedRowKeys.length}
              onConfirm={removeSelectedStocks}
            >
              <Button danger icon={<DeleteOutlined />} disabled={!selectedRowKeys.length}>删除已选</Button>
            </Popconfirm>
          </Space>
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={tableRows}
          loading={loading}
          rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
          pagination={{
            ...tablePagination,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            onChange: (current, pageSize) =>
              setTablePagination((previous) => ({
                current: pageSize === previous.pageSize ? current : 1,
                pageSize,
              })),
          }}
        />
      </Card>

      <Modal
        title="添加股票"
        open={addModalOpen}
        onCancel={() => setAddModalOpen(false)}
        onOk={() => addForm.submit()}
        confirmLoading={submitting}
        okText="加入股票池"
        cancelText="取消"
      >
        <Form form={addForm} layout="vertical" onFinish={addCodes}>
          <Form.Item name="entries" label="股票代码或名称" rules={[{ required: true, message: "请输入股票代码或名称" }]}>
            <Input.TextArea
              placeholder="多个可用逗号、空格或换行分隔；7 位代码自动取后 6 位"
              autoSize={{ minRows: 6, maxRows: 10 }}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editing ? `编辑持仓 - ${editing.code}` : "编辑持仓"}
        open={Boolean(editing)}
        onCancel={() => setEditing(null)}
        onOk={() => form.submit()}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" onFinish={saveEdit}>
          <Form.Item name="name" label="股票名称" rules={[{ required: true, message: "请输入股票名称" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="current_price" label="当前价格" rules={[{ required: true }]}>
            <InputNumber min={0} precision={3} className="full-width" />
          </Form.Item>
          <Form.Item name="cost_price" label="成本价" rules={[{ required: true }]}>
            <InputNumber min={0} precision={3} className="full-width" />
          </Form.Item>
          <Form.Item name="quantity" label="持仓数量" rules={[{ required: true }]}>
            <InputNumber min={0} precision={0} className="full-width" />
          </Form.Item>
        </Form>
      </Modal>
    </section>
  );
}
