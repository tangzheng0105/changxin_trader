import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Card, Form, Input, Typography, message } from "antd";
import { useState } from "react";
import { loginUser, setAuthToken } from "../api/client";

const { Title, Text } = Typography;

export default function LoginPage({ onLogin }) {
  const [loading, setLoading] = useState(false);

  async function submit(values) {
    setLoading(true);
    try {
      const result = await loginUser(values);
      setAuthToken(result.data.token);
      onLogin({ account_id: result.data.account_id, role: result.data.role });
    } catch (error) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <Card className="login-card">
        <Title level={2}>Changxin Trader</Title>
        <Text type="secondary">使用资金账号登录交易系统</Text>
        <Form layout="vertical" onFinish={submit} className="login-form">
          <Form.Item name="account_id" label="资金账号" rules={[{ required: true, message: "请输入资金账号" }]}>
            <Input prefix={<UserOutlined />} autoFocus />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password prefix={<LockOutlined />} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>登录</Button>
        </Form>
      </Card>
    </main>
  );
}
