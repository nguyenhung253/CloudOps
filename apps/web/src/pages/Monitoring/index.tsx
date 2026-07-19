import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Progress, Table, Tag, List, Badge, Switch, Space, message } from 'antd';
import { 
  DashboardOutlined, 
  NodeIndexOutlined, 
  DesktopOutlined, 
  SwapOutlined,
  SyncOutlined,
  CompassOutlined
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';

interface Process {
  pid: number;
  name: string;
  cpu: number;
  mem: number;
  status: 'running' | 'sleeping';
}

interface Container {
  id: string;
  name: string;
  image: string;
  status: string;
  ports: string;
}

const Monitoring: React.FC = () => {
  const [cpuVal, setCpuVal] = useState(42);
  const [memVal, setMemVal] = useState(64);
  const [diskVal, setDiskVal] = useState(52);
  const [netIn, setNetIn] = useState(12.4);
  const [netOut, setNetOut] = useState(8.7);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Background processes data
  const [processes, setProcesses] = useState<Process[]>([
    { pid: 3821, name: 'pm2-workers-pool', cpu: 12.4, mem: 8.5, status: 'running' },
    { pid: 3844, name: 'bullmq-redis-listener', cpu: 6.2, mem: 4.1, status: 'running' },
    { pid: 4102, name: 'cloudops-rule-evaluator', cpu: 15.5, mem: 10.3, status: 'running' },
    { pid: 4892, name: 'aws-sns-event-adapter', cpu: 2.8, mem: 1.1, status: 'sleeping' },
    { pid: 5121, name: 'nginx-api-gateway', cpu: 0.8, mem: 1.2, status: 'running' },
  ]);

  // Containers
  const containers: Container[] = [
    { id: 'c3f29b4e182a', name: 'cloudops-bullmq-worker', image: 'node:18-alpine', status: 'Up 4 hours', ports: '8080/tcp' },
    { id: 'f92b4928fa8d', name: 'cloudops-redis-queue', image: 'redis:7.0-alpine', status: 'Up 12 hours', ports: '6379/tcp' },
    { id: 'a88f19da218b', name: 'cloudops-node-backend', image: 'node:18-alpine', status: 'Up 12 hours', ports: '8000/tcp' },
  ];

  // Auto Telemetry Simulation
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      // Simulate CPU and RAM fluctuation
      setCpuVal(prev => {
        const delta = Math.floor(Math.random() * 15) - 7;
        const next = prev + delta;
        return next > 95 ? 95 : next < 15 ? 15 : next;
      });

      setMemVal(prev => {
        const delta = Math.floor(Math.random() * 5) - 2;
        const next = prev + delta;
        return next > 90 ? 90 : next < 55 ? 55 : next;
      });

      // Network fluctuation
      setNetIn(parseFloat((Math.random() * 20 + 5).toFixed(1)));
      setNetOut(parseFloat((Math.random() * 15 + 3).toFixed(1)));

      // Process stats updates
      setProcesses(prev => 
        prev.map(p => {
          if (p.status === 'running') {
            const cpuDelta = parseFloat((Math.random() * 4 - 2).toFixed(1));
            return {
              ...p,
              cpu: Math.max(0.5, parseFloat((p.cpu + cpuDelta).toFixed(1)))
            };
          }
          return p;
        })
      );
    }, 3000);

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const processColumns = [
    {
      title: 'PID',
      dataIndex: 'pid',
      key: 'pid',
      render: (t: number) => <code style={{ color: '#ff7a45' }}>{t}</code>,
    },
    {
      title: 'Command / Service',
      dataIndex: 'name',
      key: 'name',
      render: (t: string) => <strong style={{ color: '#fff' }}>{t}</strong>,
    },
    {
      title: 'CPU Usage',
      dataIndex: 'cpu',
      key: 'cpu',
      render: (t: number) => <span>{t}%</span>,
    },
    {
      title: 'Memory Usage',
      dataIndex: 'mem',
      key: 'mem',
      render: (t: number) => <span>{t}%</span>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Badge status={status === 'running' ? 'success' : 'default'} text={<span style={{ color: '#8c8c8c' }}>{status}</span>} />
      ),
    },
  ];

  return (
    <PageContainer
      title={<span style={{ color: '#fff', fontSize: '24px', fontWeight: 600 }}>Telemetry & Metrics</span>}
      subTitle={<span style={{ color: '#8c8c8c' }}>Redis Queue states, background workers, and CPU/RAM telemetry</span>}
      extra={[
        <Space key="refresh">
          <span style={{ color: '#8c8c8c' }}>Auto Refresh (3s)</span>
          <Switch checked={autoRefresh} onChange={setAutoRefresh} />
        </Space>
      ]}
    >
      {/* Real-time dials */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card title="CPU Core Load" bordered={false} style={{ textAlign: 'center' }}>
            <Progress 
              type="dashboard" 
              percent={cpuVal} 
              strokeColor={{ '0%': '#ff85c0', '50%': '#ff7a45', '100%': '#ff4d4f' }}
              trailColor="#222"
            />
            <div style={{ marginTop: 8, color: '#8c8c8c' }}>
              8 Core Intel Xeon Processor
            </div>
          </Card>
        </Col>

        <Col xs={24} md={8}>
          <Card title="RAM Allocation" bordered={false} style={{ textAlign: 'center' }}>
            <Progress 
              type="dashboard" 
              percent={memVal} 
              strokeColor={{ '0%': '#b37feb', '100%': '#722ed1' }}
              trailColor="#222"
            />
            <div style={{ marginTop: 8, color: '#8c8c8c' }}>
              32 GB AWS EC2 Instance RAM
            </div>
          </Card>
        </Col>

        <Col xs={24} md={8}>
          <Card title="Redis Memory store" bordered={false} style={{ textAlign: 'center' }}>
            <Progress 
              type="dashboard" 
              percent={diskVal} 
              strokeColor={{ '0%': '#36cfc9', '100%': '#13c2c2' }}
              trailColor="#222"
            />
            <div style={{ marginTop: 8, color: '#8c8c8c' }}>
              BullMQ Max Memory Limit (512MB)
            </div>
          </Card>
        </Col>
      </Row>

      {/* Network and Queues */}
      <Row gutter={[16, 16]} style={{ marginTop: '20px' }}>
        <Col xs={24} md={12}>
          <Card title="Network & Redis Queue Metrics" bordered={false}>
            <List itemLayout="horizontal">
              <List.Item style={{ borderBottom: '1px solid #2d2d2d' }}>
                <List.Item.Meta
                  avatar={<SwapOutlined style={{ color: '#1890ff', fontSize: '20px' }} />}
                  title={<span style={{ color: '#fff' }}>Network Interface (eth0)</span>}
                  description={
                    <span style={{ color: '#8c8c8c' }}>
                      Inbound: <strong style={{ color: '#fff' }}>{netIn} MB/s</strong> | Outbound: <strong style={{ color: '#fff' }}>{netOut} MB/s</strong>
                    </span>
                  }
                />
              </List.Item>

              <List.Item style={{ borderBottom: '1px solid #2d2d2d' }}>
                <List.Item.Meta
                  avatar={<NodeIndexOutlined style={{ color: '#faad14', fontSize: '20px' }} />}
                  title={<span style={{ color: '#fff' }}>Redis BullMQ Queue State</span>}
                  description={
                    <span style={{ color: '#8c8c8c' }}>
                      Queued Events: <strong style={{ color: '#faad14' }}>5 waiting</strong> | Active Workers: <strong style={{ color: '#52c41a' }}>4 online</strong>
                    </span>
                  }
                />
              </List.Item>

              <List.Item style={{ borderBottom: '1px solid #2d2d2d' }}>
                <List.Item.Meta
                  avatar={<CompassOutlined style={{ color: '#52c41a', fontSize: '20px' }} />}
                  title={<span style={{ color: '#fff' }}>Active Cache Database Connections</span>}
                  description={
                    <span style={{ color: '#8c8c8c' }}>
                      Redis Clients Pool Size: <strong style={{ color: '#fff' }}>32</strong> | Active Clients: <strong style={{ color: '#52c41a' }}>8 / 32</strong>
                    </span>
                  }
                />
              </List.Item>
            </List>
          </Card>
        </Col>

        {/* Docker containers */}
        <Col xs={24} md={12}>
          <Card title="PM2 / Docker Container Nodes" bordered={false}>
            <List
              dataSource={containers}
              renderItem={(c) => (
                <List.Item
                  actions={[
                    <Badge status="success" text={<span style={{ color: '#8c8c8c' }}>Running</span>} />
                  ]}
                  style={{ borderBottom: '1px solid #2d2d2d' }}
                >
                  <List.Item.Meta
                    title={<span style={{ color: '#fff', fontWeight: 600 }}>{c.name}</span>}
                    description={
                      <div style={{ color: '#8c8c8c', fontSize: '12px' }}>
                        Image: <code style={{ color: '#ff7a45' }}>{c.image}</code> | Ports: {c.ports}
                      </div>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>

      {/* Linux Processes */}
      <Row gutter={[16, 16]} style={{ marginTop: '20px' }}>
        <Col span={24}>
          <Card title="Active Background Processes & PM2 Status" bordered={false}>
            <Table 
              columns={processColumns} 
              dataSource={processes} 
              rowKey="pid"
              pagination={false}
              style={{ backgroundColor: '#1c1c1c' }}
            />
          </Card>
        </Col>
      </Row>
    </PageContainer>
  );
};

export default Monitoring;
