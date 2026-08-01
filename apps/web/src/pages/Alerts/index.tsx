import React, { useEffect, useState, useCallback } from 'react';
import { Card, Table, Tag, Button, Space, Modal, Typography, message, Badge, Select } from 'antd';
import {
  AlertOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { request } from '@umijs/max';

interface ApiAlert {
  id: string;
  alertRuleId: string;
  resourceId: string | null;
  status: string;
  severity: string;
  fingerprint: string;
  title: string;
  message: string;
  observedValue: number | null;
  thresholdValue: number | null;
  firstTriggeredAt: string;
  lastTriggeredAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  alertRule?: { id: string; name: string; severity: string };
  resource?: { id: string; name: string; resourceType: string; providerResourceId: string };
  acknowledger?: { id: string; fullName: string; email: string } | null;
  resolver?: { id: string; fullName: string; email: string } | null;
}

const Alerts: React.FC = () => {
  const [alerts, setAlerts] = useState<ApiAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [activeAlert, setActiveAlert] = useState<ApiAlert | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [userRole] = useState(() => localStorage.getItem('dataflow_user_role') || 'admin');

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      const res = await request<{ data: ApiAlert[] }>('/api/v1/alerts', { params });
      const list = (res as any)?.data?.data ?? (res as any)?.data ?? [];
      setAlerts(Array.isArray(list) ? list : []);
    } catch {
      // keep current list on error
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const acknowledgeAlert = async (id: string) => {
    if (userRole === 'viewer') {
      message.error('Bạn không có quyền thực hiện hành động này!');
      return;
    }
    try {
      await request(`/api/v1/alerts/${id}/acknowledge`, { method: 'POST' });
      message.success('Đã xác nhận sự cố.');
      fetchAlerts();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Lỗi khi acknowledge';
      message.error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
  };

  const resolveAlert = async (id: string) => {
    if (userRole === 'viewer') {
      message.error('Bạn không có quyền thực hiện hành động này!');
      return;
    }
    try {
      await request(`/api/v1/alerts/${id}/resolve`, { method: 'POST' });
      message.success('Sự cố đã được đánh dấu là đã giải quyết.');
      fetchAlerts();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Lỗi khi resolve';
      message.error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
  };

  const viewDetails = (alert: ApiAlert) => {
    setActiveAlert(alert);
    setIsModalOpen(true);
  };

  const severityConfig: Record<string, { color: string; icon: React.ReactNode }> = {
    CRITICAL: { color: 'red', icon: <CloseCircleOutlined /> },
    WARNING: { color: 'orange', icon: <WarningOutlined /> },
    INFO: { color: 'blue', icon: <AlertOutlined /> },
  };

  const columns = [
    {
      title: 'Severity',
      dataIndex: 'severity',
      key: 'severity',
      width: 110,
      render: (level: string) => {
        const cfg = severityConfig[level] ?? { color: 'default', icon: null };
        return (
          <Tag color={cfg.color} icon={cfg.icon}>
            {level}
          </Tag>
        );
      },
    },
    {
      title: 'Alert Title',
      dataIndex: 'title',
      key: 'title',
      render: (t: string) => <span style={{ color: '#fff', fontWeight: 600 }}>{t}</span>,
    },
    {
      title: 'Resource',
      key: 'resource',
      render: (_: any, record: ApiAlert) => {
        const r = record.resource;
        if (!r) return <span style={{ color: '#595959' }}>—</span>;
        return (
          <div>
            <div style={{ color: '#d9d9d9', fontSize: 13 }}>{r.name ?? r.providerResourceId}</div>
            <div style={{ color: '#595959', fontSize: 11 }}>{r.resourceType}</div>
          </div>
        );
      },
    },
    {
      title: 'Triggered At',
      dataIndex: 'firstTriggeredAt',
      key: 'firstTriggeredAt',
      render: (t: string) => <span style={{ color: '#8c8c8c' }}>{t ? new Date(t).toLocaleString() : '—'}</span>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string) => {
        let color: 'success' | 'processing' | 'default' = 'default';
        let label = status;
        if (status === 'RESOLVED') { color = 'success'; label = 'RESOLVED'; }
        else if (status === 'ACKNOWLEDGED') { color = 'processing'; label = 'ACKED'; }
        else if (status === 'OPEN') { color = 'error'; label = 'OPEN'; }
        return <Badge status={color} text={<span style={{ color: '#8c8c8c' }}>{label}</span>} />;
      },
    },
    {
      title: 'Actions',
      key: 'action',
      width: 220,
      render: (_: any, record: ApiAlert) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => viewDetails(record)}>
            Detail
          </Button>
          {record.status === 'OPEN' && (
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

  const openCount = alerts.filter((a) => a.status === 'OPEN').length;
  const ackedCount = alerts.filter((a) => a.status === 'ACKNOWLEDGED').length;
  const resolvedCount = alerts.filter((a) => a.status === 'RESOLVED').length;

  return (
    <PageContainer
      title={<span style={{ color: '#fff', fontSize: '24px', fontWeight: 600 }}>Alerts Console</span>}
      subTitle={<span style={{ color: '#8c8c8c' }}>System alerts triggered by metric thresholds and status checks</span>}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {/* Quick stat cards */}
        <Space size="large">
          <Card size="small" bordered={false}>
            <Space>
              <Badge status="error" />
              <span style={{ color: '#8c8c8c' }}>Open</span>
              <strong style={{ color: '#fff', fontSize: 18 }}>{openCount}</strong>
            </Space>
          </Card>
          <Card size="small" bordered={false}>
            <Space>
              <Badge status="processing" />
              <span style={{ color: '#8c8c8c' }}>Acknowledged</span>
              <strong style={{ color: '#fff', fontSize: 18 }}>{ackedCount}</strong>
            </Space>
          </Card>
          <Card size="small" bordered={false}>
            <Space>
              <Badge status="success" />
              <span style={{ color: '#8c8c8c' }}>Resolved</span>
              <strong style={{ color: '#fff', fontSize: 18 }}>{resolvedCount}</strong>
            </Space>
          </Card>
          <Card size="small" bordered={false}>
            <span style={{ color: '#8c8c8c' }}>Total</span>
            <strong style={{ color: '#fff', fontSize: 18, marginLeft: 8 }}>{alerts.length}</strong>
          </Card>
        </Space>

        {/* Filters + refresh */}
        <Card
          bordered={false}
          extra={
            <Space>
              <Select
                allowClear
                placeholder="Filter by status"
                style={{ width: 160 }}
                value={statusFilter}
                onChange={(val) => setStatusFilter(val)}
                options={[
                  { label: 'OPEN', value: 'OPEN' },
                  { label: 'ACKNOWLEDGED', value: 'ACKNOWLEDGED' },
                  { label: 'RESOLVED', value: 'RESOLVED' },
                ]}
              />
              <ReloadOutlined
                onClick={fetchAlerts}
                spin={loading}
                style={{ color: '#8c8c8c', cursor: 'pointer', fontSize: 16 }}
              />
            </Space>
          }
        >
          <Table
            columns={columns}
            dataSource={alerts}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 20 }}
            style={{ backgroundColor: '#1c1c1c' }}
            locale={{ emptyText: 'No alerts found — all clear!' }}
          />
        </Card>
      </Space>

      {/* Detail Modal */}
      <Modal
        title={
          <span style={{ color: '#fff', fontSize: 18 }}>
            <AlertOutlined style={{ marginRight: 8, color: '#ff4d4f' }} />
            {activeAlert?.title}
          </span>
        }
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={[
          <Button key="close" type="primary" onClick={() => setIsModalOpen(false)}>
            Close
          </Button>,
        ]}
        className="glass-panel"
        width={640}
      >
        {activeAlert && (
          <div style={{ color: '#e0e0e0', marginTop: 16 }}>
            <div style={{ marginBottom: 12 }}>
              <span style={{ color: '#8c8c8c' }}>Severity: </span>
              <Tag color={severityConfig[activeAlert.severity]?.color ?? 'default'}>
                {activeAlert.severity}
              </Tag>
              <span style={{ color: '#8c8c8c', marginLeft: 24 }}>Status: </span>
              <Tag color={activeAlert.status === 'RESOLVED' ? 'green' : activeAlert.status === 'ACKNOWLEDGED' ? 'blue' : 'red'}>
                {activeAlert.status}
              </Tag>
            </div>

            <div style={{ marginBottom: 8 }}>
              <span style={{ color: '#8c8c8c' }}>Rule: </span>
              <strong style={{ color: '#fff' }}>{activeAlert.alertRule?.name ?? '—'}</strong>
            </div>

            {activeAlert.resource && (
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: '#8c8c8c' }}>Resource: </span>
                <strong style={{ color: '#fff' }}>
                  {activeAlert.resource.name} ({activeAlert.resource.resourceType})
                </strong>
              </div>
            )}

            <div style={{ marginBottom: 8 }}>
              <span style={{ color: '#8c8c8c' }}>First Triggered: </span>
              <strong style={{ color: '#fff' }}>{new Date(activeAlert.firstTriggeredAt).toLocaleString()}</strong>
            </div>
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: '#8c8c8c' }}>Last Triggered: </span>
              <strong style={{ color: '#fff' }}>{new Date(activeAlert.lastTriggeredAt).toLocaleString()}</strong>
            </div>

            {activeAlert.observedValue !== null && (
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: '#8c8c8c' }}>Observed Value: </span>
                <code style={{ color: '#ff7a45' }}>{activeAlert.observedValue}</code>
                <span style={{ color: '#8c8c8c', marginLeft: 16 }}>Threshold: </span>
                <code style={{ color: '#ff7a45' }}>{activeAlert.thresholdValue ?? '—'}</code>
              </div>
            )}

            {activeAlert.acknowledger && (
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: '#8c8c8c' }}>Acknowledged by: </span>
                <strong style={{ color: '#fff' }}>{activeAlert.acknowledger.fullName}</strong>
                <span style={{ color: '#595959', marginLeft: 8 }}>
                  {activeAlert.acknowledgedAt ? new Date(activeAlert.acknowledgedAt).toLocaleString() : ''}
                </span>
              </div>
            )}
            {activeAlert.resolver && (
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: '#8c8c8c' }}>Resolved by: </span>
                <strong style={{ color: '#fff' }}>{activeAlert.resolver.fullName}</strong>
                <span style={{ color: '#595959', marginLeft: 8 }}>
                  {activeAlert.resolvedAt ? new Date(activeAlert.resolvedAt).toLocaleString() : ''}
                </span>
              </div>
            )}

            <div style={{ marginTop: 20 }}>
              <Typography.Title level={5} style={{ color: '#fff', marginTop: 0 }}>Alert Message</Typography.Title>
              <div style={{
                padding: 12, backgroundColor: '#121212', border: '1px solid #333',
                borderRadius: 6, fontSize: 13, whiteSpace: 'pre-wrap',
              }}>
                {activeAlert.message}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </PageContainer>
  );
};

export default Alerts;
