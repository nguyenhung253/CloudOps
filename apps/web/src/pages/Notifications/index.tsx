import { useState, useEffect, useCallback } from 'react';
import { request, history } from '@umijs/max';
import {
  List,
  Tag,
  Typography,
  Empty,
  Spin,
  Button,
  Select,
  Space,
  Badge,
  Pagination,
  Card,
  Row,
  Col,
} from 'antd';
import {
  BellOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  SyncOutlined,
  CloudOutlined,
  BugOutlined,
  CheckOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/en';

dayjs.extend(relativeTime);
dayjs.locale('en');

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
  INCIDENT: <BugOutlined style={{ color: '#e26f54' }} />,
  MONITORING: <WarningOutlined style={{ color: '#faad14' }} />,
  JOB: <SyncOutlined style={{ color: '#1890ff' }} />,
  CLOUD_ACCOUNT: <CloudOutlined style={{ color: '#13c2c2' }} />,
  SYSTEM: <InfoCircleOutlined style={{ color: '#722ed1' }} />,
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
  const [totalItems, setTotalItems] = useState(0);

  // Filters
  const [sourceFilter, setSourceFilter] = useState<string | undefined>();
  const [severityFilter, setSeverityFilter] = useState<string | undefined>();
  const [readStatusFilter, setReadStatusFilter] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (sourceFilter) params.set('source', sourceFilter);
      if (severityFilter) params.set('severity', severityFilter);
      if (readStatusFilter) params.set('readStatus', readStatusFilter);

      const res = await request(`/api/v1/notifications?${params}`, { method: 'GET' });
      const data = res.data || [];
      const meta = res.meta || {};
      setItems(data);
      setUnreadCount(meta.unreadCount || 0);
      setTotalItems(meta.total || 0);
    } finally {
      setLoading(false);
    }
  }, [page, sourceFilter, severityFilter, readStatusFilter]);

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

  const handleResetFilters = () => {
    setSourceFilter(undefined);
    setSeverityFilter(undefined);
    setReadStatusFilter(undefined);
    setPage(1);
  };

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <span>
          <BellOutlined style={{ fontSize: 22, marginRight: 10, color: '#e26f54' }} />
          <Text strong style={{ fontSize: 20, color: '#fff' }}>
            Notification Center
          </Text>
          {unreadCount > 0 && (
            <Badge count={unreadCount} style={{ marginLeft: 12, backgroundColor: '#ff4d4f' }} />
          )}
        </span>
        <Button
          type="primary"
          icon={<CheckOutlined />}
          onClick={markAllRead}
          disabled={unreadCount === 0}
        >
          Mark All Read
        </Button>
      </div>

      {/* Filter Bar */}
      <Card
        bordered={false}
        style={{
          backgroundColor: '#1c1c1c',
          border: '1px solid #262626',
          borderRadius: 8,
          marginBottom: 16,
          padding: '12px 16px',
        }}
        bodyStyle={{ padding: 0 }}
      >
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={6}>
            <Space size={6} style={{ color: '#8c8c8c', fontSize: 13 }}>
              <FilterOutlined />
              <span>Filters:</span>
            </Space>
          </Col>
          <Col xs={24} sm={18}>
            <Space wrap size={10} style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Select
                allowClear
                placeholder="All Sources"
                style={{ width: 150 }}
                value={sourceFilter}
                onChange={(v) => {
                  setSourceFilter(v);
                  setPage(1);
                }}
                options={[
                  { label: 'Incidents', value: 'INCIDENT' },
                  { label: 'Monitoring', value: 'MONITORING' },
                  { label: 'Jobs', value: 'JOB' },
                  { label: 'Cloud Account', value: 'CLOUD_ACCOUNT' },
                  { label: 'System', value: 'SYSTEM' },
                ]}
              />

              <Select
                allowClear
                placeholder="All Severities"
                style={{ width: 140 }}
                value={severityFilter}
                onChange={(v) => {
                  setSeverityFilter(v);
                  setPage(1);
                }}
                options={[
                  { label: 'CRITICAL', value: 'CRITICAL' },
                  { label: 'WARNING', value: 'WARNING' },
                  { label: 'INFO', value: 'INFO' },
                ]}
              />

              <Select
                allowClear
                placeholder="All Read Status"
                style={{ width: 140 }}
                value={readStatusFilter}
                onChange={(v) => {
                  setReadStatusFilter(v);
                  setPage(1);
                }}
                options={[
                  { label: 'Unread Only', value: 'UNREAD' },
                  { label: 'Read Only', value: 'READ' },
                ]}
              />

              {(sourceFilter || severityFilter || readStatusFilter) && (
                <Button size="small" type="link" onClick={handleResetFilters} style={{ color: '#e26f54' }}>
                  Reset
                </Button>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Notifications List */}
      <Spin spinning={loading}>
        {items.length === 0 ? (
          <Card bordered={false} style={{ backgroundColor: '#1c1c1c', border: '1px solid #262626', borderRadius: 8, padding: 40, textAlign: 'center' }}>
            <Empty description={<span style={{ color: '#8c8c8c' }}>No notifications found matching your filters</span>} />
          </Card>
        ) : (
          <>
            <List
              dataSource={items}
              renderItem={(item) => {
                const isUnread = item.readStatus === 'UNREAD';
                return (
                  <List.Item
                    onClick={() => markRead(item.id)}
                    style={{
                      padding: '16px 20px',
                      borderRadius: 8,
                      marginBottom: 10,
                      background: isUnread ? 'rgba(226, 111, 84, 0.08)' : '#1c1c1c',
                      border: isUnread ? '1px solid rgba(226, 111, 84, 0.3)' : '1px solid #262626',
                      cursor: isUnread ? 'pointer' : 'default',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <List.Item.Meta
                      avatar={
                        <div style={{ fontSize: 22, marginTop: 4 }}>
                          {sourceIcon[item.source] || <BellOutlined style={{ color: '#8c8c8c' }} />}
                        </div>
                      }
                      title={
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Space size={8}>
                            <Tag color={severityColor[item.severity] || 'default'} style={{ fontWeight: 600 }}>
                              {item.severity}
                            </Tag>
                            <Text strong style={{ color: isUnread ? '#fff' : '#d4d4d4', fontSize: 15 }}>
                              {item.title || typeLabel[item.type] || item.type || 'System Notification'}
                            </Text>
                            {isUnread && (
                              <Badge status="processing" color="#e26f54" text={<span style={{ color: '#e26f54', fontSize: 11, fontWeight: 600 }}>NEW</span>} />
                            )}
                          </Space>
                          <Text style={{ color: '#7a7a7a', fontSize: 12 }}>
                            {dayjs(item.createdAt).fromNow()} ({new Date(item.createdAt).toLocaleTimeString()})
                          </Text>
                        </div>
                      }
                      description={
                        <div style={{ marginTop: 6 }}>
                          {item.resource && (
                            <Tag color="cyan" style={{ fontSize: 11, marginBottom: 4 }}>
                              Resource: {item.resource.resourceType} / {item.resource.name}
                            </Tag>
                          )}
                          {item.incident && (
                            <Tag color="magenta" style={{ fontSize: 11, marginBottom: 4 }}>
                              Incident #{item.incident.incidentNumber}
                            </Tag>
                          )}
                          <Paragraph
                            style={{
                              color: '#a0a0a0',
                              fontSize: 13,
                              marginTop: 4,
                              marginBottom: 0,
                              lineHeight: '1.5',
                            }}
                          >
                            {item.message}
                          </Paragraph>
                        </div>
                      }
                    />
                  </List.Item>
                );
              }}
            />

            {/* Pagination UI */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <Pagination
                current={page}
                pageSize={pageSize}
                total={totalItems}
                onChange={(p) => setPage(p)}
                showSizeChanger={false}
                showTotal={(total) => <span style={{ color: '#8c8c8c', fontSize: 13 }}>Total {total} notifications</span>}
              />
            </div>
          </>
        )}
      </Spin>
    </div>
  );
}
