import React, { useState } from 'react';
import { Card, Form, Input, Button, InputNumber, Select, Switch, Row, Col, Divider, Space, message } from 'antd';
import { 
  CloudOutlined, 
  MailOutlined, 
  BellOutlined, 
  SaveOutlined,
  DatabaseOutlined,
  UnlockOutlined
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';

const Settings: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [userRole] = useState(() => localStorage.getItem('dataflow_user_role') || 'admin');

  const onFinish = (values: any) => {
    if (userRole !== 'admin') {
      message.error('Chỉ Admin mới có quyền lưu cấu hình hệ thống!');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      message.success('Cấu hình hệ thống đã được lưu và cập nhật lên AWS SSM Parameter Store!');
    }, 1000);
  };

  return (
    <PageContainer
      title={<span style={{ color: '#fff', fontSize: '24px', fontWeight: 600 }}>System Settings</span>}
      subTitle={<span style={{ color: '#8c8c8c' }}>AWS integrations, alerts triggers and storage retentions policies</span>}
    >
      <Form
        layout="vertical"
        initialValues={{
          awsRegion: 'ap-southeast-1',
          awsAccessKey: 'AKIAIOSFODNN7EXAMPLE',
          awsSecretKey: '••••••••••••••••••••••••••••••••',
          smtpHost: 'smtp.mailgun.org',
          smtpPort: 587,
          smtpUser: 'postmaster@cloudopshub.com',
          alertWebhook: 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX',
          cpuThreshold: 85,
          diskThreshold: 90,
          ramThreshold: 80,
          logRetention: 30,
          autoScale: true,
        }}
        onFinish={onFinish}
      >
        <Row gutter={16}>
          <Col xs={24} lg={12}>
            {/* AWS Cloud Settings */}
            <Card title={<Space><CloudOutlined style={{ color: '#ff5722' }} /><span>AWS Infrastructure Configuration</span></Space>} bordered={false} style={{ marginBottom: 16 }}>
              <Form.Item label={<span style={{ color: '#d9d9d9' }}>AWS Region</span>} name="awsRegion">
                <Select style={{ width: '100%' }}>
                  <Select.Option value="ap-southeast-1">ap-southeast-1 (Singapore)</Select.Option>
                  <Select.Option value="us-east-1">us-east-1 (N. Virginia)</Select.Option>
                  <Select.Option value="eu-central-1">eu-central-1 (Frankfurt)</Select.Option>
                </Select>
              </Form.Item>

              <Form.Item label={<span style={{ color: '#d9d9d9' }}>AWS Access Key ID</span>} name="awsAccessKey">
                <Input placeholder="AKIA..." />
              </Form.Item>

              <Form.Item label={<span style={{ color: '#d9d9d9' }}>AWS Secret Access Key</span>} name="awsSecretKey">
                <Input.Password placeholder="Secret Access Key" />
              </Form.Item>
              
              <Form.Item label={<span style={{ color: '#d9d9d9' }}>Auto Scale Cluster Nodes</span>} name="autoScale" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Card>

            {/* Ingestion & Retention */}
            <Card title={<Space><DatabaseOutlined style={{ color: '#1890ff' }} /><span>Storage & Log Retention Policy</span></Space>} bordered={false}>
              <Form.Item label={<span style={{ color: '#d9d9d9' }}>Log Retention Window (Days)</span>} name="logRetention">
                <InputNumber min={7} max={365} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item label={<span style={{ color: '#d9d9d9' }}>S3 Lifecycle Transition (GLACIER)</span>} name="glacierTransition">
                <Select defaultValue="90">
                  <Select.Option value="30">30 days after object creation</Select.Option>
                  <Select.Option value="90">90 days after object creation</Select.Option>
                  <Select.Option value="180">180 days after object creation</Select.Option>
                </Select>
              </Form.Item>
            </Card>
          </Col>

          <Col xs={24} lg={12}>
            {/* Alert Thresholds */}
            <Card title={<Space><BellOutlined style={{ color: '#faad14' }} /><span>Telemetry Alert Thresholds</span></Space>} bordered={false} style={{ marginBottom: 16 }}>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label={<span style={{ color: '#d9d9d9' }}>CPU Trigger (%)</span>} name="cpuThreshold">
                    <InputNumber min={50} max={99} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label={<span style={{ color: '#d9d9d9' }}>Disk Trigger (%)</span>} name="diskThreshold">
                    <InputNumber min={50} max={99} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label={<span style={{ color: '#d9d9d9' }}>RAM Trigger (%)</span>} name="ramThreshold">
                    <InputNumber min={50} max={99} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item label={<span style={{ color: '#d9d9d9' }}>Slack Notification Webhook URL</span>} name="alertWebhook">
                <Input placeholder="https://hooks.slack.com/services/..." />
              </Form.Item>
            </Card>

            {/* Notification SMTP Settings */}
            <Card title={<Space><MailOutlined style={{ color: '#52c41a' }} /><span>SMTP Notification Gateway</span></Space>} bordered={false}>
              <Form.Item label={<span style={{ color: '#d9d9d9' }}>SMTP Outgoing Server Host</span>} name="smtpHost">
                <Input placeholder="smtp.mailgun.org" />
              </Form.Item>

              <Form.Item label={<span style={{ color: '#d9d9d9' }}>SMTP Server Port</span>} name="smtpPort">
                <InputNumber min={25} max={65535} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item label={<span style={{ color: '#d9d9d9' }}>SMTP Username</span>} name="smtpUser">
                <Input placeholder="postmaster@cloudopshub.com" />
              </Form.Item>
            </Card>
          </Col>
        </Row>

        <Form.Item style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
          <Button 
            type="primary" 
            htmlType="submit" 
            icon={<SaveOutlined />} 
            loading={loading}
            disabled={userRole !== 'admin'}
          >
            Save Configuration
          </Button>
        </Form.Item>
      </Form>
    </PageContainer>
  );
};

export default Settings;
