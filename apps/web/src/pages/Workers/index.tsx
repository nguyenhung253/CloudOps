import React, { useEffect, useState, useCallback } from 'react';
import { Card, Table, Tag, Badge, Space, Typography } from 'antd';
import {
  ThunderboltOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { request } from '@umijs/max';

interface WorkerInfo {
  workerId: string;
  queueName: string;
  hostname: string | null;
  processId: number | null;
  status: string;
  activeJobs: number;
  lastHeartbeatAt: string;
  startedAt: string;
  isAlive: boolean;
}

const Workers: React.FC = () => {
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchWorkers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request<{ data: WorkerInfo[] }>('/api/v1/workers');
      const list = (res as any)?.data?.data ?? (res as any)?.data ?? [];
      setWorkers(Array.isArray(list) ? list : []);
    } catch {
      // API might not be ready yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkers();
    const timer = setInterval(fetchWorkers, 15000); // auto-refresh every 15s
    return () => clearInterval(timer);
  }, [fetchWorkers]);

  const aliveCount = workers.filter((w) => w.isAlive).length;
  const totalJobs = workers.reduce((sum, w) => sum + w.activeJobs, 0);

  const columns = [
    {
      title: 'Worker ID',
      dataIndex: 'workerId',
      key: 'workerId',
      render: (id: string) => (
        <Space>
          <ThunderboltOutlined style={{ color: '#ff5722' }} />
          <Typography.Text code style={{ color: '#d9d9d9' }}>{id}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Queue',
      dataIndex: 'queueName',
      key: 'queueName',
      render: (q: string) => <Tag color="blue">{q}</Tag>,
    },
    {
      title: 'Hostname',
      dataIndex: 'hostname',
      key: 'hostname',
      render: (h: string | null) => <span style={{ color: '#8c8c8c' }}>{h ?? '—'}</span>,
    },
    {
      title: 'PID',
      dataIndex: 'processId',
      key: 'processId',
      render: (pid: number | null) =>
        pid !== null ? <code style={{ color: '#ff7a45' }}>{pid}</code> : <span style={{ color: '#8c8c8c' }}>—</span>,
    },
    {
      title: 'Status',
      dataIndex: 'isAlive',
      key: 'status',
      render: (alive: boolean, record: WorkerInfo) => {
        if (record.status === 'STOPPED') {
          return <Tag icon={<PauseCircleOutlined />} color="default">STOPPED</Tag>;
        }
        return alive ? (
          <Tag icon={<CheckCircleOutlined />} color="success">ACTIVE</Tag>
        ) : (
          <Tag icon={<CloseCircleOutlined />} color="error">INACTIVE</Tag>
        );
      },
    },
    {
      title: 'Active Jobs',
      dataIndex: 'activeJobs',
      key: 'activeJobs',
      render: (count: number) => (
        <Badge count={count} showZero={false} overflowCount={99} style={{ backgroundColor: '#ff5722' }}>
          <span style={{ color: '#d9d9d9', marginLeft: 8 }}>{count}</span>
        </Badge>
      ),
    },
    {
      title: 'Last Heartbeat',
      dataIndex: 'lastHeartbeatAt',
      key: 'lastHeartbeatAt',
      render: (t: string) => {
        const date = new Date(t);
        const secondsAgo = Math.round((Date.now() - date.getTime()) / 1000);
        return (
          <Space>
            <span style={{ color: '#8c8c8c' }}>{date.toLocaleTimeString()}</span>
            <span style={{ color: '#595959', fontSize: 12 }}>({secondsAgo}s ago)</span>
          </Space>
        );
      },
    },
    {
      title: 'Started At',
      dataIndex: 'startedAt',
      key: 'startedAt',
      render: (t: string) => (
        <span style={{ color: '#8c8c8c' }}>{new Date(t).toLocaleString()}</span>
      ),
    },
  ];

  return (
    <PageContainer
      title={<span style={{ color: '#fff', fontSize: '24px', fontWeight: 600 }}>Worker Pool</span>}
      subTitle={<span style={{ color: '#8c8c8c' }}>Active BullMQ worker processes, queue concurrency, and heartbeat status</span>}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Space size="large">
          <Card size="small" bordered={false}>
            <Space>
              <ThunderboltOutlined style={{ color: '#ff5722', fontSize: 18 }} />
              <span style={{ color: '#8c8c8c' }}>Workers</span>
              <strong style={{ color: '#fff', fontSize: 18 }}>{aliveCount}/{workers.length}</strong>
            </Space>
          </Card>
          <Card size="small" bordered={false}>
            <Space>
              <Badge status="processing" />
              <span style={{ color: '#8c8c8c' }}>Active Jobs</span>
              <strong style={{ color: '#fff', fontSize: 18 }}>{totalJobs}</strong>
            </Space>
          </Card>
        </Space>

        <Card
          bordered={false}
          extra={
            <ReloadOutlined
              onClick={fetchWorkers}
              spin={loading}
              style={{ color: '#8c8c8c', cursor: 'pointer', fontSize: 16 }}
            />
          }
        >
          <Table
            columns={columns}
            dataSource={workers}
            rowKey="workerId"
            loading={loading}
            pagination={false}
            locale={{ emptyText: 'No workers connected — start a BullMQ worker process' }}
          />
        </Card>
      </Space>
    </PageContainer>
  );
};

export default Workers;
