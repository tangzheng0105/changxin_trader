import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { Button, Card, Form, Input, Modal, Space, Table, Typography, message } from "antd";
import { useEffect, useState } from "react";
import { createTraderUser, getTraderUsers } from "../api/client";

const { Text, Title } = Typography;

export default function UserManagementPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  async function loadUsers() {
    setLoading(true);
    try {
      const result = await getTraderUsers();
      setRows(result.data ?? []);
    } catch (error) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadUsers(); }, []);

  async function submit(values) {
    setSubmitting(true);
    try {
      await createTraderUser(values);
      message.success("交易员用户已创建");
      form.resetFields();
      setOpen(false);
      await loadUsers();
    } catch (error) {
      message.error(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <section className="page-title">
        <div>
          <Title level={2}>用户管理</Title>
          <Text type="secondary">管理员可创建资金账号对应的交易员登录用户。</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadUsers} loading={loading}>刷新列表</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>创建交易员</Button>
        </Space>
      </section>
      <Card className="workspace-card" title="交易员用户">
        <Table
          rowKey="account_id"
          loading={loading}
          dataSource={rows}
          columns={[
            { title: "资金账号", dataIndex: "account_id", key: "account_id" },
            { title: "角色", dataIndex: "role", key: "role", render: () => "交易员" },
            { title: "创建时间", dataIndex: "created_at", key: "created_at" },
          ]}
          pagination={{ pageSize: 10 }}
        />
      </Card>
      <Modal title="创建交易员" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={submitting} okText="创建" cancelText="取消">
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="account_id" label="资金账号" rules={[{ required: true, message: "请输入资金账号" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="登录密码" rules={[{ required: true, min: 6, message: "密码至少 6 位" }]}>
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </section>
  );
}
