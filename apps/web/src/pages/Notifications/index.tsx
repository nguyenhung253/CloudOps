import { useState, useEffect, useCallback } from 'react';
import { request } from '@umijs/max';
import { List, Tag, Typography, Empty, Spin, Button, Select, Space, Badge } from 'antd';
import { BellOutlined, WarningOutlined, InfoCircleOutlined, SyncOutlined, CloudOutlined, BugOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

interface Notification {
  id: string;
  type: string;
  source: string;
  severity: string;
  title: string;
  message: string;
  readStatus: string;
  resource?: { id: string; name: string; resourceType: string };
  incident?: { id: string; incidentNumber: string; title: string; status: string };
  createdAt: string;
}

const sourceIcon: Record<string, React.ReactNode> = {
  INCIDENT: <BugOutlined />,
  MONITORING: <WarningOutlined />,
  JOB: <SyncOutlined />,
  CLOUD_ACCOUNT: <CloudOutlined />,
  SYSTEM: <InfoCircleOutlined />,
};

const severityColor: Record<string, string> = {
  CRITICAL: 'red',
  WARNING: 'orange',
  INFO: 'blue',
};

const typeLabel: Record<string, string> = {
  INCIDENT_CREATED: 'Incident Created',
  INCIDENT_RESOLVED: 'Incident Resolved',
  JOB_FAILED: 'Job Failed',
  JOB_RETRY: 'Job Retry',
};

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [sourceFilter, setSourceFilter] = useState<string | undefined>();
  const [page, setPage] = useState(1);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (sourceFilter) params.set('source', sourceFilter);

      const res = await request(`/api/v1/notifications?${params}`, { method: 'GET' });
      const data = res.data || [];
      const meta = res.meta || {};
      setItems(data);
      setUnreadCount(meta.unreadCount || 0);
    } finally {
      setLoading(false);
    }
  }, [page, sourceFilter]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAllRead = async () => {
    await request('/api/v1/notifications/read-all', { method: 'POST' });
    fetchNotifications();
  };

  const markRead = async (id: string) => {
    await request(`/api/v1/notifications/${id}/read`, { method: 'POST' });
    fetchNotifications();
  };

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <span>
          <BellOutlined style={{ fontSize: 20, marginRight: 10 }} />
          <Text strong style={{ fontSize: 18 }}>Notifications</Text>
          {unreadCount > 0 && (
            <Badge count={unreadCount} style={{ marginLeft: 10 }} />
          )}
        </span>
        <Space>
          <Select
            allowClear
            placeholder="All sources"
            style={{ width: 160 }}
            value={sourceFilter}
            onChange={(v) => { setSourceFilter(v); setPage(1); }}
            options={[
              { label: 'Incidents', value: 'INCIDENT' },
              { label: 'Monitoring', value: 'MONITORING' },
              { label: 'Jobs', value: 'JOB' },
              { label: 'Cloud Account', value: 'CLOUD_ACCOUNT' },
              { label: 'System', value: 'SYSTEM' },
            ]}
          />
          <Button onClick={markAllRead} disabled={unreadCount === 0}>
            Mark All Read
          </Button>
        </Space>
      </div>

      <Spin spinning={loading}>
        {items.length === 0 ? (
          <Empty description="No notifications" />
        ) : (
          <List
            dataSource={items}
            renderItem={(item) => (
              <List.Item
                onClick={() => markRead(item.id)}
                style={{
                  padding: '14px 16px',
                  borderRadius: 8,
                  marginBottom: 8,
                  background: item.readStatus === 'UNREAD' ? 'rgba(194, 57, 16, 0.06)' : 'transparent',
                  border: '1px solid rgba(255,255,255,0.06)',
                  cursor: item.readStatus === 'UNREAD' ? 'pointer' : 'default',
                  opacity: item.readStatus === 'READ' ? 0.7 : 1,
                }}
              >
                <List.Item.Meta
                  avatar={
                    <span style={{ fontSize: 20 }}>
                      {sourceIcon[item.source] || <BellOutlined />}
                    </span>
                  }
                  title={
                    <span>
                      <Tag color={severityColor[item.severity] || 'default'}>
                        {item.severity}
                      </Tag>
                      {typeLabel[item.type] || item.title}
                      {item.readStatus === 'UNREAD' && (
                        <Badge status="processing" style={{ marginLeft: 8 }} />
                      )}
                    </span>
                  }
                  description={
                    <div>
                      {item.resource && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {item.resource.resourceType}: {item.resource.name} &middot;{' '}
                        </Text>
                      )}
                      {item.incident && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          #{item.incident.incidentNumber} &middot;{' '}
                        </Text>
                      )}
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {new Date(item.createdAt).toLocaleString()}
                      </Text>
                      <Paragraph
                        type="secondary"
                        style={{ fontSize: 13, marginTop: 4, marginBottom: 0 }}
                        ellipsis={{ rows: 1 }}
                      >
                        {item.message}
                      </Paragraph>
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Spin>
    </div>
  );
}
