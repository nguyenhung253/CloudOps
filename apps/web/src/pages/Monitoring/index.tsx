import React, { useEffect, useState, useCallback } from 'react';
import { Card, Row, Col, Progress, Table, List, Badge, Space, Tag, Typography } from 'antd';
import {
  DashboardOutlined,
  NodeIndexOutlined,
  SwapOutlined,
  CompassOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { request } from '@umijs/max';

interface TelemetryData {
  cpu: { available: boolean; current: number | null; history: number[] };
  network: { available: boolean; inBytes: number | null; outBytes: number | null; formatted: string };
  memory: { available: boolean; reason: string; formatted: string };
}

interface QueueSummary {
  database: {
    PENDING: number;
    QUEUED: number;
    RUNNING: number;
    SUCCEEDED: number;
    FAILED: number;
    total: number;
  };
  queue: {
    name: string;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
}

interface WorkerInfo {
  workerId: string;
  status: string;
  activeJobs: number;
  isAlive: boolean;
}

const Monitoring: React.FC = () => {
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [queue, setQueue] = useState<QueueSummary | null>(null);
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [tRes, qRes, wRes] = await Promise.all([
        request('/api/v1/dashboard/telemetry'),
        request('/api/v1/queues/summary'),
        request('/api/v1/workers'),
      ]);

      const tel = (tRes as any)?.data ?? (tRes as any);
      setTelemetry(tel);

      const q = (qRes as any)?.data ?? (qRes as any);
      setQueue(q);

      const wList = (wRes as any)?.data?.data ?? (wRes as any)?.data ?? [];
      setWorkers(Array.isArray(wList) ? wList : []);
    } catch {
      // keep previous data on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const timer = setInterval(fetchAll, 15_000);
    return () => clearInterval(timer);
  }, [fetchAll]);

  const cpuVal = telemetry?.cpu?.current ?? null;
  const cpuHistory = telemetry?.cpu?.history ?? [];
  const network = telemetry?.network;
  const memory = telemetry?.memory;

  const aliveWorkers = workers.filter((w) => w.isAlive).length;
  const queueWaiting = queue?.queue?.waiting ?? 0;
  const queueActive = queue?.queue?.active ?? 0;
  const dbTotalJobs = queue?.database?.total ?? 0;
  const dbSucceeded = queue?.database?.SUCCEEDED ?? 0;
  const dbFailed = queue?.database?.FAILED ?? 0;

  const workerColumns = [
    { title: 'Worker ID', dataIndex: 'workerId', key: 'workerId', width: 180, render: (t: string) => <code style={{ color: '#ff7a45', fontSize: 12 }}>{t.replace('worker-', '').slice(0, 16)}</code> },
    { title: 'Status', dataIndex: 'isAlive', key: 'status', render: (alive: boolean) => (
      <Badge status={alive ? 'success' : 'error'} text={<span style={{ color: '#8c8c8c' }}>{alive ? 'ALIVE' : 'INACTIVE'}</span>} />
    )},
    { title: 'Active Jobs', dataIndex: 'activeJobs', key: 'activeJobs', render: (n: number) => <span style={{ color: '#fff' }}>{n}</span> },
  ];

  const cpuHistoryColumn = cpuHistory.slice(-10);

  return (
    <PageContainer
      title={<span style={{ color: '#fff', fontSize: '24px', fontWeight: 600 }}>Telemetry & Metrics</span>}
      subTitle={<span style={{ color: '#8c8c8c' }}>Real-time CPU, network, queue, and worker pool status</span>}
      loading={loading}
    >
      {/* Real-time dials */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card title="CPU Load" bordered={false} style={{ textAlign: 'center' }}>
            <Progress
              type="dashboard"
              percent={cpuVal ?? 0}
              strokeColor={{ '0%': '#ff85c0', '50%': '#ff7a45', '100%': '#ff4d4f' }}
              trailColor="#222"
              format={() => <span style={{ color: '#fff', fontSize: 24 }}>{cpuVal !== null ? `${cpuVal}%` : 'N/A'}</span>}
            />
            <div style={{ marginTop: 8, color: '#8c8c8c' }}>
              {telemetry?.cpu?.available ? 'AWS EC2 CloudWatch CPUUtilization' : 'No CPU data collected yet'}
            </div>
          </Card>
        </Col>

        <Col xs={24} md={8}>
          <Card title="Memory (RAM)" bordered={false} style={{ textAlign: 'center' }}>
            <Progress
              type="dashboard"
              percent={memory?.available ? 0 : 0}
              strokeColor={{ '0%': '#b37feb', '100%': '#722ed1' }}
              trailColor="#222"
              format={() => <span style={{ color: '#8c8c8c', fontSize: 14 }}>{memory?.formatted ?? 'Loading…'}</span>}
            />
            <div style={{ marginTop: 8, color: '#8c8c8c' }}>
              {memory?.available ? 'EC2 Memory (CloudWatch Agent)' : 'Requires CloudWatch Agent on instance'}
            </div>
          </Card>
        </Col>

        <Col xs={24} md={8}>
          <Card title="Job Queue" bordered={false} style={{ textAlign: 'center' }}>
            <Progress
              type="dashboard"
              percent={dbTotalJobs > 0 ? Math.round((dbSucceeded / dbTotalJobs) * 100) : 0}
              strokeColor={{ '0%': '#36cfc9', '100%': '#13c2c2' }}
              trailColor="#222"
              format={() => (
                <div>
                  <div style={{ color: '#52c41a', fontSize: 18 }}>{dbSucceeded}</div>
                  <div style={{ color: '#8c8c8c', fontSize: 11 }}>succeeded / {dbTotalJobs} total</div>
                </div>
              )}
            />
            <div style={{ marginTop: 8, color: '#8c8c8c' }}>
              {dbFailed > 0 ? `${dbFailed} failed` : 'No failures'}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Detail cards */}
      <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
        <Col xs={24} md={12}>
          <Card title="Network & Queue State" bordered={false}>
            <List itemLayout="horizontal">
              <List.Item style={{ borderBottom: '1px solid #2d2d2d' }}>
                <List.Item.Meta
                  avatar={<SwapOutlined style={{ color: '#1890ff', fontSize: 20 }} />}
                  title={<span style={{ color: '#fff' }}>Network I/O</span>}
                  description={
                    <span style={{ color: '#8c8c8c' }}>
                      {network?.available
                        ? network.formatted
                        : 'No network data collected yet'}
                    </span>
                  }
                />
              </List.Item>

              <List.Item style={{ borderBottom: '1px solid #2d2d2d' }}>
                <List.Item.Meta
                  avatar={<NodeIndexOutlined style={{ color: '#faad14', fontSize: 20 }} />}
                  title={<span style={{ color: '#fff' }}>BullMQ Redis Queue</span>}
                  description={
                    <span style={{ color: '#8c8c8c' }}>
                      Waiting: <strong style={{ color: '#faad14' }}>{queueWaiting}</strong>
                      {' | '}Active: <strong style={{ color: '#52c41a' }}>{queueActive}</strong>
                    </span>
                  }
                />
              </List.Item>

              <List.Item style={{ borderBottom: '1px solid #2d2d2d' }}>
                <List.Item.Meta
                  avatar={<CompassOutlined style={{ color: '#52c41a', fontSize: 20 }} />}
                  title={<span style={{ color: '#fff' }}>Database Job Summary</span>}
                  description={
                    <span style={{ color: '#8c8c8c' }}>
                      Total: <strong style={{ color: '#fff' }}>{dbTotalJobs}</strong>
                      {' | '}Succeeded: <strong style={{ color: '#52c41a' }}>{dbSucceeded}</strong>
                      {' | '}Failed: <strong style={{ color: '#ff4d4f' }}>{dbFailed}</strong>
                    </span>
                  }
                />
              </List.Item>
            </List>
          </Card>
        </Col>

        {/* CPU History mini chart */}
        <Col xs={24} md={12}>
          <Card title="CPU History (last 10 points)" bordered={false}>
            {cpuHistoryColumn.length === 0 ? (
              <div style={{ color: '#8c8c8c', padding: 24, textAlign: 'center' }}>
                No CPU data collected yet.
                <br />
                Run a METRIC_COLLECTION job to populate metrics.
              </div>
            ) : (
              <Space direction="vertical" style={{ width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 }}>
                  {cpuHistoryColumn.map((val, i) => {
                    const h = Math.max(4, (val / 100) * 120);
                    const color = val > 85 ? '#ff4d4f' : val > 60 ? '#ff7a45' : '#36cfc9';
                    return (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span style={{ color: '#8c8c8c', fontSize: 10 }}>{val}%</span>
                        <div style={{ width: '100%', height: h, backgroundColor: color, borderRadius: '3px 3px 0 0', minHeight: 2 }} />
                      </div>
                    );
                  })}
                </div>
                <Typography.Text style={{ color: '#595959', fontSize: 11, textAlign: 'center', display: 'block' }}>
                  CPUUtilization % (5-min intervals from CloudWatch)
                </Typography.Text>
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      {/* Worker Pool */}
      <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
        <Col span={24}>
          <Card
            title={
              <Space>
                <ThunderboltOutlined style={{ color: '#ff5722' }} />
                <span style={{ color: '#fff' }}>Active BullMQ Workers</span>
                <Tag color="green">{aliveWorkers}/{workers.length} alive</Tag>
              </Space>
            }
            bordered={false}
          >
            {workers.length === 0 ? (
              <div style={{ color: '#8c8c8c', padding: 24, textAlign: 'center' }}>
                No workers connected. Start a worker process to see data here.
              </div>
            ) : (
              <Table
                columns={workerColumns}
                dataSource={workers}
                rowKey="workerId"
                pagination={false}
                style={{ backgroundColor: '#1c1c1c' }}
              />
            )}
          </Card>
        </Col>
      </Row>
    </PageContainer>
  );
};

export default Monitoring;
