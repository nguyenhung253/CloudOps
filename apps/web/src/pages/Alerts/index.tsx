import React, { useState } from 'react';
import { Card, Table, Tag, Button, Space, Modal, Typography, message, Badge } from 'antd';
import { 
  AlertOutlined, 
  CheckCircleOutlined, 
  InfoCircleOutlined, 
  CloseCircleOutlined, 
  WarningOutlined,
  PlayCircleOutlined
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';

interface Alert {
  id: string;
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'WARNING';
  time: string;
  status: 'PENDING' | 'ACKNOWLEDGED' | 'RESOLVED';
  cause: string;
  mitigation: string;
}

const Alerts: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>([
    { 
      id: '1', 
      title: 'Database connection failed', 
      severity: 'CRITICAL', 
      time: '2026-07-07 15:43:00', 
      status: 'PENDING', 
      cause: 'Aurora MySQL primary node went offline due to transient memory spike.', 
      mitigation: 'Verify connection string, trigger AWS RDS manual failover if replication is stale, or restart the target reader.' 
    },
    { 
      id: '2', 
      title: 'BullMQ Event Processing Failure (E-AWS-CW-9128)', 
      severity: 'HIGH', 
      time: '2026-07-07 15:41:10', 
      status: 'ACKNOWLEDGED', 
      cause: 'BullMQ background worker #02 timed out while evaluating rules on the event.', 
      mitigation: 'Check Redis memory usage, rule condition regex patterns, and restart background PM2 workers if necessary.' 
    },
    { 
      id: '3', 
      title: 'AWS EBS Disk Space Low', 
      severity: 'WARNING', 
      time: '2026-07-07 14:10:00', 
      status: 'RESOLVED', 
      cause: 'Temporary adapter payload cache logs exceeded local volume allocation.', 
      mitigation: 'Executed automated cron shell script cleanup to purge system logs older than 3 days.' 
    },
    { 
      id: '4', 
      title: 'EC2 Cluster Node Instance Terminated', 
      severity: 'CRITICAL', 
      time: '2026-07-07 13:02:44', 
      status: 'PENDING', 
      cause: 'AWS Spot Instance termination notice was not captured before node eviction.', 
      mitigation: 'ASG (Auto Scaling Group) automatically launched a replacement node; verify data consistency.' 
    },
  ]);

  const [activeAlert, setActiveAlert] = useState<Alert | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [userRole] = useState(() => localStorage.getItem('dataflow_user_role') || 'admin');

  const acknowledgeAlert = (id: string) => {
    if (userRole === 'viewer') {
      message.error('Bạn không có quyền thực hiện hành động này!');
      return;
    }
    setAlerts(prev => 
      prev.map(a => a.id === id ? { ...a, status: 'ACKNOWLEDGED' } : a)
    );
    message.success('Đã xác nhận sự cố. Cảnh báo chuyển sang trạng thái xử lý.');
  };

  const resolveAlert = (id: string) => {
    if (userRole === 'viewer') {
      message.error('Bạn không có quyền thực hiện hành động này!');
      return;
    }
    setAlerts(prev => 
      prev.map(a => a.id === id ? { ...a, status: 'RESOLVED' } : a)
    );
    message.success('Sự cố đã được đánh dấu là ĐÃ GIẢI QUYẾT.');
  };

  const viewDetails = (alert: Alert) => {
    setActiveAlert(alert);
    setIsModalOpen(true);
  };

  const columns = [
    {
      title: 'Severity',
      dataIndex: 'severity',
      key: 'severity',
      width: '120px',
      render: (level: string) => {
        let color = 'orange';
        let icon = <WarningOutlined />;
        if (level === 'CRITICAL') {
          color = 'red';
          icon = <CloseCircleOutlined />;
        } else if (level === 'HIGH') {
          color = 'volcano';
          icon = <AlertOutlined />;
        }
        return (
          <Tag color={color} icon={icon}>
            {level}
          </Tag>
        );
      },
    },
    {
      title: 'Incident Title',
      dataIndex: 'title',
      key: 'title',
      render: (t: string) => <span style={{ color: '#fff', fontWeight: 600 }}>{t}</span>,
    },
    {
      title: 'Detected At',
      dataIndex: 'time',
      key: 'time',
      render: (t: string) => <span style={{ color: '#8c8c8c' }}>{t}</span>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        let color: 'success' | 'processing' | 'default' = 'default';
        if (status === 'RESOLVED') color = 'success';
        else if (status === 'ACKNOWLEDGED') color = 'processing';
        return <Badge status={color} text={<span style={{ color: '#8c8c8c' }}>{status}</span>} />;
      },
    },
    {
      title: 'Actions',
      key: 'action',
      render: (_: any, record: Alert) => (
        <Space size="small">
          <Button type="link" onClick={() => viewDetails(record)}>
            Details & Fixes
          </Button>
          {record.status === 'PENDING' && (
            <Button 
              size="small" 
              type="dashed" 
              onClick={() => acknowledgeAlert(record.id)}
              disabled={userRole === 'viewer'}
            >
              Ack
            </Button>
          )}
          {record.status !== 'RESOLVED' && (
            <Button 
              size="small" 
              type="text" 
              style={{ color: '#52c41a' }} 
              onClick={() => resolveAlert(record.id)}
              disabled={userRole === 'viewer'}
            >
              Resolve
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      title={<span style={{ color: '#fff', fontSize: '24px', fontWeight: 600 }}>Incidents Console</span>}
      subTitle={<span style={{ color: '#8c8c8c' }}>System outage events, metric violations and mitigations</span>}
    >
      <Card bordered={false}>
        <Table 
          columns={columns} 
          dataSource={alerts} 
          rowKey="id"
          pagination={false}
          style={{ backgroundColor: '#1c1c1c' }}
        />
      </Card>

      <Modal
        title={
          <span style={{ color: '#fff', fontSize: '18px' }}>
            <AlertOutlined style={{ marginRight: 8, color: '#ff4d4f' }} />
            Outage Details: {activeAlert?.title}
          </span>
        }
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={[
          <Button key="close" type="primary" onClick={() => setIsModalOpen(false)}>
            Close Panel
          </Button>
        ]}
        className="glass-panel"
        width={600}
      >
        {activeAlert && (
          <div style={{ color: '#e0e0e0', marginTop: 16 }}>
            <div style={{ marginBottom: 12 }}>
              <span style={{ color: '#8c8c8c' }}>Severity Level: </span>
              <Tag color={activeAlert.severity === 'CRITICAL' ? 'red' : 'volcano'}>{activeAlert.severity}</Tag>
              <span style={{ color: '#8c8c8c', marginLeft: 24 }}>Incident Status: </span>
              <Tag color={activeAlert.status === 'RESOLVED' ? 'green' : 'blue'}>{activeAlert.status}</Tag>
            </div>

            <div style={{ marginBottom: 16 }}>
              <span style={{ color: '#8c8c8c' }}>Trigger Time: </span>
              <strong style={{ color: '#fff' }}>{activeAlert.time}</strong>
            </div>

            <div style={{ marginBottom: 20 }}>
              <Typography.Title level={5} style={{ color: '#fff', marginTop: 0 }}>Root Cause Analysis (RCA)</Typography.Title>
              <div style={{ padding: '12px', backgroundColor: '#121212', border: '1px solid #333', borderRadius: '6px', fontSize: '13px' }}>
                {activeAlert.cause}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <Typography.Title level={5} style={{ color: '#fff', marginTop: 0 }}>Recommended Action Plan</Typography.Title>
              <div style={{ padding: '12px', backgroundColor: '#121212', border: '1px dashed #ff5722', borderRadius: '6px', fontSize: '13px', color: '#ff7a45' }}>
                {activeAlert.mitigation}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </PageContainer>
  );
};

export default Alerts;
