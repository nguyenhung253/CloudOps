import React, { useState } from 'react';
import { Card, Table, Switch, Tag, Button, Space, Modal, Form, Input, Select, message } from 'antd';
import { 
  FieldTimeOutlined, 
  PauseCircleOutlined, 
  PlayCircleOutlined, 
  PlusOutlined, 
  ReloadOutlined 
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';

interface CronTask {
  id: string;
  name: string;
  expression: string;
  action: string;
  nextRun: string;
  status: 'ACTIVE' | 'PAUSED';
  lastRunStatus: 'SUCCESS' | 'FAILED' | 'PENDING';
}

const Scheduler: React.FC = () => {
  const [tasks, setTasks] = useState<CronTask[]>([
    { id: '1', name: 'S3 Log Rotation & Archive', expression: '0 0 * * *', action: 'Log Rotation', nextRun: '2026-07-08 00:00:00', status: 'ACTIVE', lastRunStatus: 'SUCCESS' },
    { id: '2', name: 'Redis BullMQ Queue Health Check', expression: '*/5 * * * *', action: 'Queue Health Check', nextRun: '2026-07-07 23:05:00', status: 'ACTIVE', lastRunStatus: 'SUCCESS' },
    { id: '3', name: 'Clean Completed Redis Jobs Indexes', expression: '0 * * * *', action: 'Redis DB Cleanup', nextRun: '2026-07-08 00:00:00', status: 'PAUSED', lastRunStatus: 'FAILED' },
    { id: '4', name: 'Provider Sync Heartbeat', expression: '*/1 * * * *', action: 'CloudProvider Heartbeat', nextRun: '2026-07-07 23:01:00', status: 'ACTIVE', lastRunStatus: 'SUCCESS' },
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [userRole] = useState(() => localStorage.getItem('dataflow_user_role') || 'admin');

  const toggleStatus = (id: string, currentStatus: 'ACTIVE' | 'PAUSED') => {
    if (userRole === 'viewer') {
      message.error('Bạn không có quyền thay đổi trạng thái Scheduler!');
      return;
    }
    const nextStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    setTasks(prev => 
      prev.map(t => t.id === id ? { ...t, status: nextStatus } : t)
    );
    message.success(`Đã ${nextStatus === 'ACTIVE' ? 'kích hoạt lại' : 'tạm dừng'} lịch chạy.`);
  };

  const triggerTask = (name: string) => {
    if (userRole === 'viewer') {
      message.error('Bạn không có quyền kích hoạt Scheduler!');
      return;
    }
    message.success(`Đã trigger thành công tác vụ cron: ${name}`);
  };

  const handleCreate = (values: any) => {
    const newTask: CronTask = {
      id: String(tasks.length + 1),
      name: values.name,
      expression: values.expression,
      action: values.action,
      nextRun: '2026-07-08 02:00:00',
      status: 'ACTIVE',
      lastRunStatus: 'PENDING',
    };
    setTasks([...tasks, newTask]);
    setIsModalOpen(false);
    form.resetFields();
    message.success('Tạo cron task thành công!');
  };

  const columns = [
    {
      title: 'Task Name',
      dataIndex: 'name',
      key: 'name',
      render: (t: string) => <strong style={{ color: '#fff' }}>{t}</strong>,
    },
    {
      title: 'Cron Expression',
      dataIndex: 'expression',
      key: 'expression',
      render: (t: string) => <code style={{ color: '#ff5722' }}>{t}</code>,
    },
    {
      title: 'Target Action',
      dataIndex: 'action',
      key: 'action',
      render: (t: string) => <span style={{ color: '#9254de' }}>{t}</span>,
    },
    {
      title: 'Next Run Date',
      dataIndex: 'nextRun',
      key: 'nextRun',
      render: (t: string, record: CronTask) => (
        <span style={{ color: record.status === 'PAUSED' ? '#555' : '#8c8c8c' }}>{t}</span>
      ),
    },
    {
      title: 'Last Execution Status',
      dataIndex: 'lastRunStatus',
      key: 'lastRunStatus',
      render: (status: string) => {
        let color = 'default';
        if (status === 'SUCCESS') color = 'green';
        else if (status === 'FAILED') color = 'red';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Cron Active',
      key: 'status',
      render: (_: any, record: CronTask) => (
        <Switch 
          checked={record.status === 'ACTIVE'} 
          onChange={() => toggleStatus(record.id, record.status)} 
          disabled={userRole === 'viewer'}
        />
      ),
    },
    {
      title: 'Actions',
      key: 'action',
      render: (_: any, record: CronTask) => (
        <Space>
          <Button 
            size="small" 
            type="dashed" 
            icon={<PlayCircleOutlined />} 
            onClick={() => triggerTask(record.name)}
            disabled={userRole === 'viewer'}
          >
            Trigger
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      title={<span style={{ color: '#fff', fontSize: '24px', fontWeight: 600 }}>Cron Orchestration Scheduler</span>}
      subTitle={<span style={{ color: '#8c8c8c' }}>Schedule cloud events validation, log rotation, and queue heartbeat sync</span>}
      extra={[
        <Button 
          key="add" 
          type="primary" 
          icon={<PlusOutlined />} 
          onClick={() => {
            if (userRole === 'viewer') {
              message.error('Bạn không có quyền thêm mới Scheduler!');
              return;
            }
            setIsModalOpen(true);
          }}
          disabled={userRole === 'viewer'}
        >
          Add Cron Schedule
        </Button>
      ]}
    >
      <Card bordered={false}>
        <Table 
          columns={columns} 
          dataSource={tasks} 
          rowKey="id"
          pagination={false}
          style={{ backgroundColor: '#1c1c1c' }}
        />
      </Card>

      <Modal
        title={<span style={{ color: '#fff' }}>Add New Cron Task Schedule</span>}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        className="glass-panel"
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <Form.Item
            label={<span style={{ color: '#d9d9d9' }}>Task Description Name</span>}
            name="name"
            rules={[{ required: true, message: 'Nhập tên tác vụ!' }]}
          >
            <Input placeholder="E.g., Daily S3 Log Compression" />
          </Form.Item>

          <Form.Item
            label={<span style={{ color: '#d9d9d9' }}>Cron Expression</span>}
            name="expression"
            rules={[{ required: true, message: 'Nhập Cron Expression!' }]}
          >
            <Input placeholder="0 * * * * (Every Hour)" />
          </Form.Item>

          <Form.Item
            label={<span style={{ color: '#d9d9d9' }}>Target Task Action</span>}
            name="action"
            rules={[{ required: true, message: 'Chọn hành động đích!' }]}
          >
            <Select placeholder="Chọn Task Action">
              <Select.Option value="Log Rotation">Log Rotation</Select.Option>
              <Select.Option value="Queue Health Check">Queue Health Check</Select.Option>
              <Select.Option value="Redis DB Cleanup">Redis DB Cleanup</Select.Option>
              <Select.Option value="CloudProvider Heartbeat">CloudProvider Heartbeat</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 0, marginTop: 24 }}>
            <Space>
              <Button onClick={() => setIsModalOpen(false)} style={{ backgroundColor: 'transparent', color: '#8c8c8c', border: '1px solid #333' }}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit">
                Register Cron
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default Scheduler;
