import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Switch,
  Tag,
  Button,
  Space,
  Modal,
  Form,
  Select,
  message,
  Popconfirm,
  Tooltip,
  Empty,
} from 'antd';
import {
  CalendarOutlined,
  PlusOutlined,
  PlayCircleOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
  CloudOutlined,
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { request } from '@umijs/max';
import dayjs from 'dayjs';
import 'dayjs/locale/en';

dayjs.locale('en');

/* ------------------------------------------------------------------ */
/*  Types & Constants                                                  */
/* ------------------------------------------------------------------ */

interface CloudAccountOption {
  id: string;
  name: string;
  provider: string;
  providerAccountId: string;
}

interface JobScheduleRecord {
  id: string;
  jobType: 'RESOURCE_SYNC' | 'METRIC_COLLECTION';
  cloudAccountId: string;
  intervalMs: number;
  enabled: boolean;
  schedulerKey: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  cloudAccount?: CloudAccountOption;
  creator?: { id: string; fullName: string; email: string };
}

const JOB_TYPE_OPTIONS = [
  { value: 'RESOURCE_SYNC', label: 'Resource Sync' },
  { value: 'METRIC_COLLECTION', label: 'Metric Collection' },
];

const ALLOWED_INTERVALS: Record<string, { value: number; label: string }[]> = {
  METRIC_COLLECTION: [
    { value: 300000, label: 'Every 5 minutes' },
    { value: 600000, label: 'Every 10 minutes' },
    { value: 900000, label: 'Every 15 minutes' },
    { value: 1800000, label: 'Every 30 minutes' },
  ],
  RESOURCE_SYNC: [
    { value: 900000, label: 'Every 15 minutes' },
    { value: 1800000, label: 'Every 30 minutes' },
    { value: 3600000, label: 'Every 1 hour' },
    { value: 21600000, label: 'Every 6 hours' },
  ],
};

const formatInterval = (ms: number): string => {
  if (ms < 60000) return `${ms / 1000}s`;
  if (ms < 3600000) return `${ms / 60000} minutes`;
  return `${ms / 3600000} hour${ms / 3600000 > 1 ? 's' : ''}`;
};

const formatTimestamp = (ts: string | null): React.ReactNode => {
  if (!ts) return <span style={{ color: '#555', fontSize: '12px' }}>Never</span>;
  const full = dayjs(ts).format('YYYY-MM-DD HH:mm:ss');
  const rel = dayjs(ts).locale('en').fromNow();
  return (
    <Tooltip title={rel}>
      <span style={{ color: '#8c8c8c', fontSize: '12px' }}>{full}</span>
    </Tooltip>
  );
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const Scheduler: React.FC = () => {
  const [schedules, setSchedules] = useState<JobScheduleRecord[]>([]);
  const [cloudAccounts, setCloudAccounts] = useState<CloudAccountOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<JobScheduleRecord | null>(null);
  const [selectedJobType, setSelectedJobType] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [userRole] = useState(() => localStorage.getItem('dataflow_user_role') || 'admin');

  const isWritable = userRole === 'admin' || userRole === 'operator';

  /* ---- Data fetching ---- */

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request('/api/v1/schedules');
      const items = Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res)
          ? res
          : [];
      setSchedules(items);
    } catch {
      message.error('Failed to load schedules');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCloudAccounts = useCallback(async () => {
    try {
      const res = await request('/api/v1/cloud-accounts');
      const items = Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res)
          ? res
          : [];
      setCloudAccounts(items);
    } catch {
      // Non-blocking — cloud accounts dropdown will be empty
    }
  }, []);

  useEffect(() => {
    fetchSchedules();
    fetchCloudAccounts();
  }, [fetchSchedules, fetchCloudAccounts]);

  /* ---- Actions ---- */

  const handleToggleEnabled = async (record: JobScheduleRecord) => {
    try {
      await request(`/api/v1/schedules/${record.id}`, {
        method: 'PATCH',
        data: { enabled: !record.enabled },
      });
      message.success(`Schedule ${record.enabled ? 'disabled' : 'enabled'}`);
      fetchSchedules();
    } catch {
      message.error('Failed to update schedule');
    }
  };

  const handleRunNow = async (record: JobScheduleRecord) => {
    try {
      await request(`/api/v1/schedules/${record.id}/run`, { method: 'POST' });
      message.success('Job triggered successfully');
      fetchSchedules();
    } catch {
      message.error('Failed to trigger job');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await request(`/api/v1/schedules/${id}`, { method: 'DELETE' });
      message.success('Schedule deleted');
      fetchSchedules();
    } catch {
      message.error('Failed to delete schedule');
    }
  };

  const openCreateModal = () => {
    setEditingSchedule(null);
    setSelectedJobType(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEditModal = (record: JobScheduleRecord) => {
    setEditingSchedule(record);
    setSelectedJobType(record.jobType);
    form.setFieldsValue({
      jobType: record.jobType,
      cloudAccountId: record.cloudAccountId,
      intervalMs: record.intervalMs,
      enabled: record.enabled,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (values: any) => {
    try {
      if (editingSchedule) {
        await request(`/api/v1/schedules/${editingSchedule.id}`, {
          method: 'PATCH',
          data: {
            intervalMs: values.intervalMs,
            enabled: values.enabled ?? true,
          },
        });
        message.success('Schedule updated');
      } else {
        await request('/api/v1/schedules', {
          method: 'POST',
          data: {
            jobType: values.jobType,
            cloudAccountId: values.cloudAccountId,
            intervalMs: values.intervalMs,
            enabled: values.enabled ?? true,
          },
        });
        message.success('Schedule created');
      }
      setModalOpen(false);
      form.resetFields();
      fetchSchedules();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.data?.message || 'Operation failed';
      message.error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
  };

  /* ---- Table columns ---- */

  const columns = [
    {
      title: 'Schedule',
      key: 'schedule',
      render: (_: any, record: JobScheduleRecord) => {
        const label = record.jobType === 'RESOURCE_SYNC' ? 'Resource Sync' : 'Metric Collection';
        const color = record.jobType === 'RESOURCE_SYNC' ? '#13c2c2' : '#9254de';
        return (
          <Space size={8}>
            <CalendarOutlined style={{ color, fontSize: '14px' }} />
            <span style={{ color: '#d4d4d4', fontWeight: 600, fontSize: '13px' }}>{label}</span>
          </Space>
        );
      },
    },
    {
      title: 'Account',
      key: 'account',
      render: (_: any, record: JobScheduleRecord) => {
        const acct = record.cloudAccount;
        if (!acct) return <span style={{ color: '#555', fontSize: '12px' }}>—</span>;
        const providerColor =
          acct.provider === 'AWS' ? '#FF9900' : acct.provider === 'GCP' ? '#4285F4' : '#0078D4';
        return (
          <Space size={6}>
            <CloudOutlined style={{ color: providerColor, fontSize: '13px' }} />
            <span style={{ color: '#bfbfbf', fontSize: '12px', fontWeight: 500 }}>{acct.name}</span>
            <Tag
              style={{
                fontSize: '10px',
                borderRadius: '4px',
                color: providerColor,
                border: `1px solid ${providerColor}40`,
                backgroundColor: `${providerColor}10`,
                margin: 0,
                lineHeight: '16px',
              }}
            >
              {acct.provider}
            </Tag>
          </Space>
        );
      },
    },
    {
      title: 'Interval',
      key: 'interval',
      render: (_: any, record: JobScheduleRecord) => (
        <Tag
          style={{
            borderRadius: '4px',
            border: '1px solid #303030',
            color: '#bfbfbf',
            backgroundColor: 'rgba(255,255,255,0.04)',
            fontFamily: 'monospace',
            fontSize: '12px',
            margin: 0,
          }}
        >
          <ClockCircleOutlined style={{ marginRight: 4 }} />
          {formatInterval(record.intervalMs)}
        </Tag>
      ),
    },
    {
      title: 'Status',
      key: 'enabled',
      render: (_: any, record: JobScheduleRecord) => (
        <Switch
          checked={record.enabled}
          onChange={() => handleToggleEnabled(record)}
          disabled={!isWritable}
          checkedChildren="On"
          unCheckedChildren="Off"
          size="small"
        />
      ),
    },
    {
      title: 'Last Run',
      key: 'lastRunAt',
      render: (_: any, record: JobScheduleRecord) => formatTimestamp(record.lastRunAt),
    },
    {
      title: 'Next Run',
      key: 'nextRunAt',
      render: (_: any, record: JobScheduleRecord) => {
        if (!record.enabled) return <span style={{ color: '#555', fontSize: '12px' }}>—</span>;
        return formatTimestamp(record.nextRunAt);
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: JobScheduleRecord) => (
        <Space size="small">
          <Tooltip title="Edit interval">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEditModal(record)}
              disabled={!isWritable}
            />
          </Tooltip>
          <Tooltip title="Run now">
            <Button
              size="small"
              type="primary"
              ghost
              icon={<ThunderboltOutlined />}
              onClick={() => handleRunNow(record)}
              disabled={!isWritable}
            />
          </Tooltip>
          <Popconfirm
            title="Delete this schedule?"
            description="This will also remove the BullMQ scheduler."
            onConfirm={() => handleDelete(record.id)}
            okText="Delete"
            cancelText="Cancel"
            disabled={userRole !== 'admin'}
          >
            <Tooltip title="Delete">
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={userRole !== 'admin'}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  /* ---- Interval options for selected job type ---- */

  const intervalOptions = selectedJobType ? ALLOWED_INTERVALS[selectedJobType] || [] : [];

  /* ---- Render ---- */

  return (
    <PageContainer
      title={false}
      extra={[
        <Button
          key="create"
          type="primary"
          icon={<PlusOutlined />}
          onClick={openCreateModal}
          disabled={!isWritable}
          style={{ borderRadius: '6px', fontWeight: 500 }}
        >
          New Schedule
        </Button>,
      ]}
    >
      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        {[
          {
            label: 'Total Schedules',
            value: schedules.length,
            icon: <CalendarOutlined style={{ color: '#e26f54', fontSize: '18px' }} />,
          },
          {
            label: 'Active',
            value: schedules.filter((s) => s.enabled).length,
            icon: <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '18px' }} />,
          },
          {
            label: 'Resource Sync',
            value: schedules.filter((s) => s.jobType === 'RESOURCE_SYNC').length,
            icon: <CloudOutlined style={{ color: '#13c2c2', fontSize: '18px' }} />,
          },
          {
            label: 'Metric Collection',
            value: schedules.filter((s) => s.jobType === 'METRIC_COLLECTION').length,
            icon: <ClockCircleOutlined style={{ color: '#9254de', fontSize: '18px' }} />,
          },
        ].map((card) => (
          <Card
            key={card.label}
            bordered={false}
            style={{
              flex: 1,
              backgroundColor: '#1c1c1c',
              border: '1px solid #262626',
              borderRadius: '8px',
            }}
            bodyStyle={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}
          >
            {card.icon}
            <div>
              <div style={{ color: '#8c8c8c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {card.label}
              </div>
              <div style={{ color: '#d4d4d4', fontSize: '20px', fontWeight: 700, lineHeight: 1.2 }}>
                {card.value}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card
        bordered={false}
        style={{ backgroundColor: '#1c1c1c', border: '1px solid #262626', borderRadius: '8px' }}
        bodyStyle={{ padding: 0 }}
      >
        <Table
          columns={columns}
          dataSource={schedules}
          rowKey="id"
          loading={loading}
          pagination={false}
          locale={{
            emptyText: (
              <Empty
                description={<span style={{ color: '#555' }}>No schedules configured</span>}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ),
          }}
          style={{ backgroundColor: '#1c1c1c' }}
        />
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        title={
          <span style={{ color: '#d4d4d4', fontWeight: 600 }}>
            {editingSchedule ? 'Edit Schedule' : 'New Schedule'}
          </span>
        }
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        footer={null}
        width={480}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          style={{ marginTop: 16 }}
          initialValues={{ enabled: true }}
        >
          <Form.Item
            label={<span style={{ color: '#d9d9d9' }}>Job Type</span>}
            name="jobType"
            rules={[{ required: true, message: 'Select a job type' }]}
          >
            <Select
              placeholder="Select job type"
              options={JOB_TYPE_OPTIONS}
              disabled={!!editingSchedule}
              onChange={(val) => {
                setSelectedJobType(val);
                form.setFieldValue('intervalMs', undefined);
              }}
            />
          </Form.Item>

          <Form.Item
            label={<span style={{ color: '#d9d9d9' }}>Cloud Account</span>}
            name="cloudAccountId"
            rules={[{ required: true, message: 'Select a cloud account' }]}
          >
            <Select
              placeholder="Select cloud account"
              disabled={!!editingSchedule}
              showSearch
              optionFilterProp="label"
              options={cloudAccounts.map((a) => ({
                value: a.id,
                label: `${a.name} (${a.provider})`,
              }))}
            />
          </Form.Item>

          <Form.Item
            label={<span style={{ color: '#d9d9d9' }}>Interval</span>}
            name="intervalMs"
            rules={[{ required: true, message: 'Select an interval' }]}
          >
            <Select
              placeholder={selectedJobType ? 'Select interval' : 'Select job type first'}
              disabled={!selectedJobType}
              options={intervalOptions}
            />
          </Form.Item>

          <Form.Item
            label={<span style={{ color: '#d9d9d9' }}>Enabled</span>}
            name="enabled"
            valuePropName="checked"
          >
            <Switch checkedChildren="On" unCheckedChildren="Off" />
          </Form.Item>

          <Form.Item style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 0, marginTop: 24 }}>
            <Space>
              <Button
                onClick={() => {
                  setModalOpen(false);
                  form.resetFields();
                }}
                style={{ backgroundColor: 'transparent', color: '#8c8c8c', border: '1px solid #333' }}
              >
                Cancel
              </Button>
              <Button type="primary" htmlType="submit">
                {editingSchedule ? 'Update' : 'Create Schedule'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default Scheduler;
