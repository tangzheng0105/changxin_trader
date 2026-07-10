import { GithubOutlined, ReloadOutlined } from "@ant-design/icons";
import { Button, Layout, Space, Typography } from "antd";
import { useEffect, useState } from "react";
import { getSummary } from "./api/client";
import SummaryPanel from "./components/SummaryPanel";

const { Content, Header } = Layout;
const { Paragraph, Title } = Typography;

export default function App() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function loadSummary() {
    setLoading(true);
    setError(null);

    try {
      const data = await getSummary();
      setSummary(data);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();
  }, []);

  return (
    <Layout className="app-shell">
      <Header className="app-header">
        <Space>
          <GithubOutlined className="brand-icon" />
          <span className="brand-name">Changxin Trader</span>
        </Space>
      </Header>

      <Content className="app-content">
        <section className="intro-section">
          <div>
            <Title>前后端分离项目模板</Title>
            <Paragraph>
              后端使用 FastAPI 提供接口，前端使用 React、Vite 和 Ant Design
              构建管理端界面。
            </Paragraph>
          </div>
          <Button icon={<ReloadOutlined />} type="primary" onClick={loadSummary}>
            刷新接口数据
          </Button>
        </section>

        <SummaryPanel data={summary} loading={loading} error={error} />
      </Content>
    </Layout>
  );
}
