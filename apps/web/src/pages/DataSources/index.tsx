import React, { useState } from 'react';
import { Card, Row, Col, Upload, Button, Table, Tabs, Tag, Space, message, Typography, Divider, Badge } from 'antd';
import { 
  InboxOutlined, 
  ApiOutlined, 
  HistoryOutlined, 
  CheckCircleOutlined,
  CloudUploadOutlined,
  CloudServerOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';

const { Dragger } = Upload;
const { Title, Paragraph } = Typography;

interface CloudEvent {
  key: string;
  id: string;
  provider: string;
  service: string;
  type: string;
  status: 'valid' | 'invalid';
  receivedAt: string;
  payload: string;
}

const DataSources: React.FC = () => {
  const [activeTab, setActiveTab] = useState('1');
  const [selectedEvent, setSelectedEvent] = useState<CloudEvent | null>(null);
  
  const [events, setEvents] = useState<CloudEvent[]>([
    { key: '1', id: 'E-AWS-CW-9128', provider: 'AWS', service: 'CloudWatch', type: 'CPUUtilization_High', status: 'valid', receivedAt: '2026-07-09 22:10', payload: '{"instanceId": "i-09ab12", "metric": "CPU", "value": 92, "threshold": 90}' },
    { key: '2', id: 'E-AWS-S3-9129', provider: 'AWS', service: 'S3', type: 'ObjectCreated:Put', status: 'valid', receivedAt: '2026-07-09 22:05', payload: '{"bucket": "customer-logs-prod", "key": "logs/2026-07.json", "size": 248000}' },
    { key: '3', id: 'E-AWS-SQS-9130', provider: 'AWS', service: 'SQS', type: 'QueueSize_Alert', status: 'valid', receivedAt: '2026-07-09 21:50', payload: '{"queueName": "prod-events-queue", "messagesCount": 1050}' },
    { key: '4', id: 'E-AWS-CW-9131', provider: 'AWS', service: 'CloudWatch', type: 'DiskSpace_Low', status: 'invalid', receivedAt: '2026-07-09 21:40', payload: '{"signature": "failed_verification", "payload": {}}' }
  ]);

  const handleSimulateUpload = (info: any) => {
    const filename = info.file?.name || 'custom_event.json';
    message.success(`Đã nhận file sự kiện: ${filename}. Bắt đầu xác thực chữ ký & cấu trúc...`);

    setTimeout(() => {
      const newEvent: CloudEvent = {
        key: String(events.length + 1),
        id: `E-AWS-INGEST-${Math.floor(Math.random() * 1000) + 9000}`,
        provider: 'AWS',
        service: filename.includes('s3') ? 'S3' : filename.includes('sqs') ? 'SQS' : 'CloudWatch',
        type: 'Custom_Ingested_Event',
        status: 'valid',
        receivedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
        payload: '{"raw_payload_uploaded": true, "size_bytes": 1024}'
      };
      setEvents(prev => [newEvent, ...prev]);
      message.success(`Xác thực thành công. Unified Cloud Event được tạo và đẩy vào Redis Queue.`);
    }, 1200);
  };

  const columns = [
    {
      title: 'Event ID',
      dataIndex: 'id',
      key: 'id',
      render: (text: string) => <span style={{ color: '#fff', fontWeight: 600, fontFamily: 'monospace' }}>{text}</span>,
    },
    {
      title: 'Provider',
      dataIndex: 'provider',
      key: 'provider',
      render: (text: string) => <Tag color="orange">{text}</Tag>,
    },
    {
      title: 'Service Source',
      dataIndex: 'service',
      key: 'service',
      render: (text: string) => {
        let color = 'cyan';
        if (text === 'S3') color = 'green';
        if (text === 'SQS') color = 'purple';
        return <Tag color={color}>{text}</Tag>;
      }
    },
    {
      title: 'Event Type',
      dataIndex: 'type',
      key: 'type',
      render: (text: string) => <span style={{ color: '#ff7a45' }}>{text}</span>,
    },
    {
      title: 'Validation',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Badge 
          status={status === 'valid' ? 'success' : 'error'} 
          text={status === 'valid' ? 'PASSED' : 'REJECTED'} 
          style={{ color: status === 'valid' ? '#52c41a' : '#ff4d4f' }} 
        />
      ),
    },
    {
      title: 'Received At',
      dataIndex: 'receivedAt',
      key: 'receivedAt',
      render: (text: string) => <span style={{ color: '#8c8c8c' }}>{text}</span>,
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: any, record: CloudEvent) => (
        <Button 
          type="link" 
          onClick={() => {
            setSelectedEvent(record);
            message.info(`Đang tải payload sự kiện: ${record.id}`);
          }}
        >
          View Payload
        </Button>
      ),
    },
  ];

  return (
    <PageContainer
      title={<span style={{ color: '#fff', fontSize: '24px', fontWeight: 600 }}>Event Sources</span>}
      subTitle={<span style={{ color: '#8c8c8c' }}>Ingest events from AWS adapters, validate signatures, and create processing jobs</span>}
    >
      <Tabs activeKey={activeTab} onChange={setActiveTab} style={{ color: '#8c8c8c' }}>
        <Tabs.TabPane tab="Unified Event Logs" key="1">
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={10}>
              <Card title="Simulate Cloud Event (Upload payload)" bordered={false}>
                <Dragger 
                  customRequest={({ onSuccess }) => setTimeout(() => onSuccess?.('ok'), 800)}
                  onChange={handleSimulateUpload}
                  showUploadList={false}
                  style={{
                    backgroundColor: 'rgba(255, 87, 34, 0.02)',
                    border: '2px dashed rgba(255, 87, 34, 0.2)',
                    borderRadius: '8px',
                    padding: '24px'
                  }}
                >
                  <p className="ant-upload-drag-icon">
                    <CloudUploadOutlined style={{ color: '#ff5722', fontSize: '48px' }} />
                  </p>
                  <p className="ant-upload-text" style={{ color: '#fff' }}>
                    Click or drag JSON payload here to ingest event
                  </p>
                  <p className="ant-upload-hint" style={{ color: '#8c8c8c' }}>
                    Supports raw JSON files from CloudWatch alarms, S3 PUT hooks, or SQS queues. Signature checks are applied.
                  </p>
                </Dragger>
                <div style={{ marginTop: '20px' }}>
                  <Title level={5} style={{ color: '#fff' }}>Provider Adapter Pattern</Title>
                  <Paragraph style={{ color: '#8c8c8c', fontSize: '13px' }}>
                    CloudOps integrates using structured Cloud Provider Adapters. Adding GCP, Azure, or Kubernetes requires creating new event translators without modifying the core worker engine.
                  </Paragraph>
                  <Button type="dashed" block icon={<ApiOutlined />} style={{ color: '#ff5722', borderColor: '#ff5722' }}>
                    View Unified Event Schema Spec
                  </Button>
                </div>
              </Card>
            </Col>

            <Col xs={24} lg={14}>
              <Card title="Received Cloud Events (Buffer Feed)" bordered={false}>
                <Table 
                  columns={columns} 
                  dataSource={events} 
                  pagination={{ pageSize: 5 }}
                  scroll={{ x: 'max-content' }}
                  style={{
                    backgroundColor: '#1c1c1c',
                    borderRadius: '12px'
                  }}
                />
              </Card>
            </Col>
          </Row>

          {selectedEvent && (
            <Row gutter={[16, 16]} style={{ marginTop: '20px' }}>
              <Col span={24}>
                <Card 
                  title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#fff' }}>Unified Payload Viewer: {selectedEvent.id}</span>
                      <Button size="small" type="text" onClick={() => setSelectedEvent(null)} style={{ color: '#8c8c8c' }}>Dismiss</Button>
                    </div>
                  } 
                  bordered={false}
                >
                  <pre style={{ 
                    backgroundColor: '#121212', 
                    color: '#a78bfa', 
                    padding: '16px', 
                    borderRadius: '6px', 
                    overflowX: 'auto',
                    fontFamily: 'monospace',
                    border: '1px solid #333'
                  }}>
                    {JSON.stringify(JSON.parse(selectedEvent.payload), null, 2)}
                  </pre>
                </Card>
              </Col>
            </Row>
          )}
        </Tabs.TabPane>

        <Tabs.TabPane tab="Adapter Configurations" key="2">
          <Card title="Active Cloud Providers Adapters" bordered={false}>
            <Table
              dataSource={[
                { id: 1, provider: 'AWS CloudWatch Adapter', target: 'CloudWatch Alarms', status: 'ACTIVE', eventsCount: 4122, latency: '12ms' },
                { id: 2, provider: 'AWS S3 Adapter', target: 'S3 Event Notifications', status: 'ACTIVE', eventsCount: 894, latency: '8ms' },
                { id: 3, provider: 'AWS SQS Adapter', target: 'SQS Queue Poller', status: 'ACTIVE', eventsCount: 5291, latency: '15ms' },
                { id: 4, provider: 'Azure Adapter', target: 'Azure Event Grid', status: 'DEACTIVATED (ROADMAP)', eventsCount: 0, latency: '0ms' }
              ]}
              columns={[
                { title: 'Adapter Name', dataIndex: 'provider', render: (t) => <span style={{ color: '#fff', fontWeight: 600 }}>{t}</span> },
                { title: 'Service Target', dataIndex: 'target' },
                { title: 'Status', dataIndex: 'status', render: (t) => <Tag color={t === 'ACTIVE' ? 'green' : 'default'}>{t}</Tag> },
                { title: 'Ingested Events Count', dataIndex: 'eventsCount', render: (t) => t.toLocaleString() },
                { title: 'Adapter Processing Latency', dataIndex: 'latency', render: (t) => <code style={{ color: '#ff7a45' }}>{t}</code> }
              ]}
              rowKey="id"
              pagination={false}
              scroll={{ x: 'max-content' }}
            />
          </Card>
        </Tabs.TabPane>
      </Tabs>
    </PageContainer>
  );
};

export default DataSources;
