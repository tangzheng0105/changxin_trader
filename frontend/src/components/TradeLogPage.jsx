import { ReloadOutlined } from "@ant-design/icons";
import { Button, Card, Table, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { getTradeLogs } from "../api/client";

const { Text, Title } = Typography;

const actionLabels = {
  ordinary_order: "普通委托",
  intelligent_algorithm_order: "智能算法委托",
  cancel_command: "撤指令",
  cancel_order: "撤委托",
};

function jsonText(value) {
  return value ? JSON.stringify(value) : "-";
}

export default function TradeLogPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadLogs() {
    setLoading(true);
    try {
      const result = await getTradeLogs();
      setLogs(result.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
  }, []);

  return (
    <>
      <section className="page-title">
        <div>
          <Title level={2}>交易日志</Title>
          <Text type="secondary">记录通过 XtTraderPyApi 提交的交易请求及返回结果。</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={loadLogs} loading={loading}>刷新日志</Button>
      </section>
      <Card className="workspace-card">
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={logs}
          scroll={{ x: true }}
          pagination={{ pageSize: 10, showSizeChanger: true, showQuickJumper: true }}
          columns={[
            { title: "时间", dataIndex: "created_at", width: 170 },
            { title: "类型", dataIndex: "action", width: 140, render: (action) => actionLabels[action] ?? action },
            { title: "状态", key: "status", width: 100, render: (_, row) => <Tag color={row.error ? "error" : "success"}>{row.error ? "失败" : "成功"}</Tag> },
            { title: "请求参数", dataIndex: "request", width: 300, ellipsis: true, render: jsonText },
            { title: "返回值", dataIndex: "response", width: 220, ellipsis: true, render: jsonText },
            { title: "错误信息", dataIndex: "error", width: 260, ellipsis: true, render: (value) => value || "-" },
          ]}
        />
      </Card>
    </>
  );
}
