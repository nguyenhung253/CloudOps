import React, { useState, useEffect, useCallback } from 'react';
import { Button, Space, Badge, Popover, List, Tag, Typography, Spin, Empty, Divider } from 'antd';
import {
  SunOutlined,
  AppstoreOutlined,
  BellOutlined,
  BugOutlined,
  WarningOutlined,
  SyncOutlined,
  CloudOutlined,
  InfoCircleOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { history, request } from '@umijs/max';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/en';

dayjs.extend(relativeTime);
dayjs.locale('en');

const { Text, Paragraph } = Typography;

interface NotificationItem {
  id: string;
  type: string;
  source: string;
  severity: string;
  title: string;
  message: string;
  readStatus: string;
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

const HeaderActions: React.FC = () => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentNotifications, setRecentNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await request('/api/v1/notifications/unread-count');
      const count = res?.count ?? res?.data?.count ?? 0;
      setUnreadCount(count);
    } catch {
      // Non-blocking
    }
  }, []);

  const fetchRecentNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request('/api/v1/notifications?limit=20');
      const data = res?.data || [];
      setRecentNotifications(data);
      if (res?.meta?.unreadCount !== undefined) {
        setUnreadCount(res.meta.unreadCount);
      }
    } catch {
      // Non-blocking
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    // Poll unread count every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  const handleOpenChange = (newOpen: boolean) => {
    setPopoverOpen(newOpen);
    if (newOpen) {
      fetchRecentNotifications();
    }
  };

  const handleMarkAllRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await request('/api/v1/notifications/read-all', { method: 'POST' });
      setUnreadCount(0);
      setRecentNotifications((prev) =>
        prev.map((item) => ({ ...item, readStatus: 'READ' })),
      );
    } catch {
      // Non-blocking
    }
  };

  const handleNotificationClick = async (item: NotificationItem) => {
    if (item.readStatus === 'UNREAD') {
      try {
        await request(`/api/v1/notifications/${item.id}/read`, { method: 'POST' });
        setUnreadCount((c) => Math.max(0, c - 1));
        setRecentNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, readStatus: 'READ' } : n)),
        );
      } catch {
        // Non-blocking
      }
    }
    setPopoverOpen(false);
    history.push('/notifications');
  };

  const popoverContent = (
    <div style={{ width: 360 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: '#191c24',
        }}
      >
        <Space size={8}>
          <Text strong style={{ color: '#fff', fontSize: '14px' }}>
            Notifications
          </Text>
          {unreadCount > 0 && (
            <Tag color="error" style={{ borderRadius: 10, padding: '0 8px', fontSize: 11, margin: 0 }}>
              {unreadCount} new
            </Tag>
          )}
        </Space>
        {unreadCount > 0 && (
          <Button
            type="link"
            size="small"
            icon={<CheckOutlined />}
            onClick={handleMarkAllRead}
            style={{ fontSize: 12, padding: 0, color: '#ff7a45' }}
          >
            Mark all read
          </Button>
        )}
      </div>

      {/* List */}
      <div style={{ maxHeight: 380, overflowY: 'auto' }}>
        <Spin spinning={loading}>
          {recentNotifications.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<span style={{ color: '#8c8c8c' }}>No notifications</span>}
              style={{ margin: '20px 0' }}
            />
          ) : (
            <List
              dataSource={recentNotifications}
              renderItem={(item) => {
                const isUnread = item.readStatus === 'UNREAD';
                return (
                  <List.Item
                    onClick={() => handleNotificationClick(item)}
                    style={{
                      padding: '12px 16px',
                      cursor: 'pointer',
                      backgroundColor: isUnread ? 'rgba(255, 122, 69, 0.06)' : 'transparent',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      transition: 'background-color 0.2s',
                    }}
                  >
                    <List.Item.Meta
                      avatar={
                        <div style={{ marginTop: 2, fontSize: 16 }}>
                          {sourceIcon[item.source] || <BellOutlined style={{ color: '#8c8c8c' }} />}
                        </div>
                      }
                      title={
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                            <Tag color={severityColor[item.severity] || 'default'} style={{ fontSize: 10, padding: '0 4px', margin: 0, flexShrink: 0 }}>
                              {item.severity}
                            </Tag>
                            <span
                              style={{
                                color: isUnread ? '#fff' : '#a6a6a6',
                                fontWeight: isUnread ? 600 : 400,
                                fontSize: 13,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                              title={item.title}
                            >
                              {item.title}
                            </span>
                          </div>
                          <span style={{ color: '#666', fontSize: 11, flexShrink: 0, marginLeft: 8 }}>
                            {dayjs(item.createdAt).fromNow(true)}
                          </span>
                        </div>
                      }
                      description={
                        <Paragraph
                          style={{
                            color: '#8c8c8c',
                            fontSize: 12,
                            margin: '4px 0 0 0',
                            lineHeight: '1.4',
                          }}
                          ellipsis={{ rows: 2 }}
                        >
                          {item.message}
                        </Paragraph>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          )}
        </Spin>
      </div>

      <Divider style={{ margin: 0, borderColor: 'rgba(255, 255, 255, 0.08)' }} />

      {/* Footer */}
      <div
        style={{
          padding: '10px 16px',
          textAlign: 'center',
          backgroundColor: '#191c24',
        }}
      >
        <Button
          type="link"
          block
          size="small"
          onClick={() => {
            setPopoverOpen(false);
            history.push('/notifications');
          }}
          style={{ color: '#ff7a45', fontSize: 13, fontWeight: 500 }}
        >
          View All Notifications →
        </Button>
      </div>
    </div>
  );

  return (
    <Space size={12}>
      <Button
        type="text"
        icon={<SunOutlined style={{ color: '#8c8c8c', fontSize: '18px' }} />}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px' }}
      />
      <Popover
        content={popoverContent}
        trigger="click"
        open={popoverOpen}
        onOpenChange={handleOpenChange}
        placement="bottomRight"
        overlayInnerStyle={{ padding: 0, backgroundColor: '#141414', border: '1px solid #262626', borderRadius: 8 }}
      >
        <Button
          type="text"
          icon={
            <Badge count={unreadCount} overflowCount={99} size="small" offset={[4, -4]}>
              <BellOutlined style={{ color: unreadCount > 0 ? '#e26f54' : '#8c8c8c', fontSize: '18px' }} />
            </Badge>
          }
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px' }}
        />
      </Popover>
      <Button
        type="text"
        icon={<AppstoreOutlined style={{ color: '#8c8c8c', fontSize: '18px' }} />}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px' }}
      />
    </Space>
  );
};

export default HeaderActions;
