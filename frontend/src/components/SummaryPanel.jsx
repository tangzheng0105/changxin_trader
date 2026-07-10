import { CheckCircleOutlined, CloudServerOutlined } from "@ant-design/icons";
import { Alert, Card, List, Skeleton, Space, Typography } from "antd";

const { Text, Title } = Typography;

export default function SummaryPanel({ data, loading, error }) {
  if (loading) {
    return (
      <Card className="summary-card">
        <Skeleton active paragraph={{ rows: 4 }} />
      </Card>
    );
  }

  if (error) {
    return (
      <Alert
        message="后端连接失败"
        description="请确认 FastAPI 服务已在 127.0.0.1:8000 启动。"
        type="error"
        showIcon
      />
    );
  }

  return (
    <Card className="summary-card">
      <Space direction="vertical" size={20} className="full-width">
        <Space align="center">
          <CloudServerOutlined className="summary-icon" />
          <div>
            <Title level={3}>{data.project}</Title>
            <Text type="secondary">
              {data.backend} backend connected to {data.frontend}
            </Text>
          </div>
        </Space>

        <List
          dataSource={data.features}
          renderItem={(item) => (
            <List.Item>
              <Space>
                <CheckCircleOutlined className="check-icon" />
                <Text>{item}</Text>
              </Space>
            </List.Item>
          )}
        />
      </Space>
    </Card>
  );
}
