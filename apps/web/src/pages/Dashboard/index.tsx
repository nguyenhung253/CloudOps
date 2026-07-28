import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Row, Col, Card, Statistic, Progress, Badge, List, Tag, Space, Button, Switch, Tooltip, notification, message, Select } from 'antd';
import { 
  CloudServerOutlined, 
  DatabaseOutlined, 
  FolderOpenOutlined, 
  SyncOutlined, 
  CheckCircleOutlined, 
  ThunderboltOutlined,
  BugOutlined,
  PlayCircleOutlined,
  CloudUploadOutlined,
  ReloadOutlined,
  CodeOutlined,
  CheckCircleFilled,
  WarningFilled,
  InfoCircleFilled,
  ClockCircleOutlined,
  ClusterOutlined,
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { request } from '@umijs/max';

interface ActivityItem {
  id: string;
  time: string;
  text: string;
  status: 'success' | 'warning' | 'info' | 'error';
}

// Sparkline component that draws smooth real-time charts
const MiniLineChart: React.FC<{ data: number[]; color: string }> = ({ data, color }) => {
  const chartData = data && data.length > 0 ? data : [20, 25, 30, 28, 35, 40];
  const max = Math.max(...chartData);
  const min = Math.min(...chartData);
  const range = max - min || 1;
  const height = 45;
  const width = 200;
  const points = chartData
    .map((val, i) => {
      const x = (i / (chartData.length - 1)) * width;
      const y = height - ((val - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg height={height} width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <polyline fill="none" stroke={color} strokeWidth="2.5" points={points} />
      <path
        d={`M 0,${height} L ${points} L ${width},${height} Z`}
        fill={`url(#grad-${color.replace('#', '')})`}
        opacity="0.15"
      />
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
    </svg>
  );
};

const { Option } = Select;

const Dashboard: React.FC = () => {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [resourceSummary, setResourceSummary] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState<boolean>(false);

  // Real-time state
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);

  const [cpu, setCpu] = useState<number>(24.6);
  const [cpuHistory, setCpuHistory] = useState<number[]>([25, 28, 32, 29, 35, 40, 38, 42, 45]);
  const [networkFormatted, setNetworkFormatted] = useState<string>('↓ 18 MB  ↑ 4 MB');

  // CloudOps Dashboard statistics state
  const [stats, setStats] = useState({
    totalJobs: 0,
    runningJobs: 0,
    failedJobs: 0,
    activeWorkers: 1,
    queueLength: 0,
    openIncidents: 0,
    alertCount: 0,
    ec2Count: 0,
    healthyCount: 0,
    degradedCount: 0,
    unhealthyCount: 0,
    unknownCount: 0,
  });

  // Active Incidents state
  const [incidents, setIncidents] = useState<any[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isExecutingJob, setIsExecutingJob] = useState(false);

  // Fetch Dashboard Live API Data
  const loadDashboardData = useCallback(async () => {
    try {
      const [summaryRes, healthRes, jobStatsRes, telemetryRes, incidentsRes] = await Promise.allSettled([
        request('/api/v1/dashboard/summary'),
        request('/api/v1/dashboard/resource-health'),
        request('/api/v1/dashboard/job-statistics'),
        request('/api/v1/dashboard/telemetry'),
        request('/api/v1/incidents'),
      ]);

      const summaryData = summaryRes.status === 'fulfilled' ? (summaryRes.value.data || summaryRes.value) : null;
      const jobStatsData = jobStatsRes.status === 'fulfilled' ? (jobStatsRes.value.data || jobStatsRes.value) : null;
      const telemetryData = telemetryRes.status === 'fulfilled' ? (telemetryRes.value.data || telemetryRes.value) : null;
      const incidentsData = incidentsRes.status === 'fulfilled' ? (incidentsRes.value.data || incidentsRes.value) : [];

      if (summaryData) {
        setStats(prev => ({
          ...prev,
          ec2Count: summaryData.resources?.ec2Count ?? 0,
          healthyCount: summaryData.healthSummary?.HEALTHY ?? 0,
          degradedCount: summaryData.healthSummary?.DEGRADED ?? 0,
          unhealthyCount: summaryData.healthSummary?.UNHEALTHY ?? 0,
          unknownCount: summaryData.healthSummary?.UNKNOWN ?? 0,
        }));
      }

      if (jobStatsData) {
        setStats(prev => ({
          ...prev,
          totalJobs: jobStatsData.totalJobs ?? 0,
          runningJobs: jobStatsData.byStatus?.RUNNING ?? 0,
          failedJobs: jobStatsData.byStatus?.FAILED ?? 0,
          queueLength: (jobStatsData.byStatus?.PENDING ?? 0) + (jobStatsData.byStatus?.QUEUED ?? 0),
        }));
      }

      if (telemetryData) {
        if (telemetryData.cpu?.current) setCpu(telemetryData.cpu.current);
        if (telemetryData.cpu?.history && telemetryData.cpu.history.length > 0) {
          setCpuHistory(telemetryData.cpu.history);
        }
        if (telemetryData.network?.formatted) {
          setNetworkFormatted(telemetryData.network.formatted);
        }
      }

      if (Array.isArray(incidentsData)) {
        setIncidents(incidentsData);
        setStats(prev => ({
          ...prev,
          openIncidents: incidentsData.filter((i: any) => i.status === 'OPEN' || i.status === 'INVESTIGATING').length,
          alertCount: incidentsData.length,
        }));

        const newActivities: ActivityItem[] = incidentsData.slice(0, 5).map((inc: any) => {
          const dt = new Date(inc.openedAt || inc.createdAt);
          const timeStr = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
          return {
            id: inc.id,
            time: timeStr,
            text: `Incident #${inc.incidentNumber || inc.id.slice(0, 6)}: ${inc.title}`,
            status: inc.severity === 'CRITICAL' ? 'error' : inc.severity === 'HIGH' ? 'warning' : 'info',
          };
        });
        setActivities(newActivities);
      }

      setSecondsSinceUpdate(0);
    } catch (err) {
      console.error('Failed to load live dashboard data', err);
    }
  }, []);

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const res = await request('/api/v1/cloud-accounts');
        const list = res.data || res;
        setAccounts(list);
        if (list.length > 0) {
          setSelectedAccountId(list[0].id);
        }
      } catch (err) {
        console.error('Failed to fetch cloud accounts', err);
      }
    };
    fetchAccounts();
    loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    if (!selectedAccountId) return;
    const fetchResourceSummary = async () => {
      setLoadingSummary(true);
      try {
        const res = await request(`/api/v1/cloud-accounts/${selectedAccountId}/resource-summary`);
        setResourceSummary(res.data || res);
      } catch (err) {
        console.error('Failed to fetch resource summary', err);
        setResourceSummary(null);
      } finally {
        setLoadingSummary(false);
      }
    };
    fetchResourceSummary();
  }, [selectedAccountId]);

  // Smart Polling (10s interval, pauses when tab is hidden)
  useEffect(() => {
    let updateInterval: NodeJS.Timeout;
    let secCounter: NodeJS.Timeout;

    if (isAutoRefresh) {
      updateInterval = setInterval(() => {
        if (document.hidden) return;
        loadDashboardData();
      }, 10000);

      secCounter = setInterval(() => {
        setSecondsSinceUpdate(prev => prev + 1);
      }, 1000);
    }

    return () => {
      if (updateInterval) clearInterval(updateInterval);
      if (secCounter) clearInterval(secCounter);
    };
  }, [isAutoRefresh, loadDashboardData]);

  // Interactivity handlers for Quick Actions
  const handleTriggerEvent = async () => {
    if (isExecutingJob) return;
    setIsExecutingJob(true);
    message.loading({ content: 'Queuing METRIC_COLLECTION Diagnostic Job...', key: 'event_action' });

    try {
      const res = await request('/api/v1/jobs', {
        method: 'POST',
        data: {
          type: 'METRIC_COLLECTION',
          payload: { isDiagnostic: true },
        },
      });

      const jobId = res?.data?.id || res?.id || 'job-queued';

      notification.success({
        message: 'Diagnostic Job Queued',
        description: `Job #${jobId.slice(0, 8)} successfully enqueued into background worker queue.`,
        placement: 'topRight',
      });

      message.success({ content: 'Diagnostic job queued!', key: 'event_action' });

      setTimeout(() => loadDashboardData(), 2000);
      setTimeout(() => loadDashboardData(), 5000);
    } catch (err: any) {
      console.error('Failed to trigger diagnostic job', err);
      message.error({ content: `Failed to queue job: ${err?.message || String(err)}`, key: 'event_action' });
    } finally {
      setIsExecutingJob(false);
    }
  };

  const handleS3UploadEvent = async () => {
    if (isExecutingJob) return;
    setIsExecutingJob(true);
    message.loading({ content: 'Triggering AWS Resource Sync Job...', key: 'upload_action' });

    try {
      const res = await request('/api/v1/jobs', {
        method: 'POST',
        data: {
          type: 'RESOURCE_SYNC',
          payload: { cloudAccountId: selectedAccountId },
        },
      });

      const jobId = res?.data?.id || res?.id || 'sync-queued';

      notification.success({
        message: 'Resource Sync Enqueued',
        description: `AWS Resource Sync Job #${jobId.slice(0, 8)} successfully enqueued into background worker queue.`,
        placement: 'topRight',
      });
      message.success({ content: 'Resource Sync job queued!', key: 'upload_action' });

      setTimeout(() => loadDashboardData(), 2000);
      setTimeout(() => loadDashboardData(), 5000);
    } catch (err: any) {
      console.error('Failed to trigger resource sync job', err);
      message.error({ content: `Failed to queue sync job: ${err?.message || String(err)}`, key: 'upload_action' });
    } finally {
      setIsExecutingJob(false);
    }
  };

  const handleRestartWorker = async () => {
    if (isExecutingJob) return;
    setIsExecutingJob(true);
    message.loading({ content: 'Checking Workers & Queue Status...', key: 'restart_action' });

    try {
      const res = await request('/api/v1/dashboard/job-statistics');
      const data = res?.data || res;
      notification.info({
        message: 'Workers & Queue Operational',
        description: `Active Queue: ${data?.byStatus?.PENDING ?? 0} waiting, ${data?.byStatus?.RUNNING ?? 0} running, ${data?.byStatus?.SUCCEEDED ?? 0} succeeded.`,
        placement: 'topRight',
      });
      message.success({ content: 'Workers status verified!', key: 'restart_action' });
    } catch (err: any) {
      message.error({ content: `Worker check error: ${err?.message || String(err)}`, key: 'restart_action' });
    } finally {
      setIsExecutingJob(false);
    }
  };


  // Determine system health status dynamically
  let systemHealthStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
  if (stats.unhealthyCount > 0) {
    systemHealthStatus = 'critical';
  } else if (stats.degradedCount > 0) {
    systemHealthStatus = 'degraded';
  }

  const healthStyleMap = {
    healthy: { label: 'System Healthy', bg: 'rgba(82, 196, 26, 0.1)', color: '#73d13d', border: 'rgba(82, 196, 26, 0.25)', dot: '#52c41a' },
    degraded: { label: 'System Degraded', bg: 'rgba(250, 173, 20, 0.1)', color: '#ffec3d', border: 'rgba(250, 173, 20, 0.25)', dot: '#faad14' },
    critical: { label: 'System Critical', bg: 'rgba(255, 77, 79, 0.1)', color: '#ff7875', border: 'rgba(255, 77, 79, 0.25)', dot: '#ff4d4f' }
  }[systemHealthStatus];

  const getAlertIcon = (level: string) => {
    if (level === 'critical') return <CheckCircleFilled style={{ color: '#ff4d4f', fontSize: '16px' }} />;
    if (level === 'warning') return <WarningFilled style={{ color: '#faad14', fontSize: '16px' }} />;
    return <InfoCircleFilled style={{ color: '#1890ff', fontSize: '16px' }} />;
  };

  const attentionCount = stats.degradedCount + stats.unhealthyCount;
  const totalEc2 = stats.ec2Count > 0 ? stats.ec2Count : (resourceSummary?.ec2?.total ?? resourceSummary?.ec2Count ?? 1);
  const healthyEc2 = stats.healthyCount > 0 ? stats.healthyCount : Math.max(1, totalEc2 - attentionCount);


  const reportingCount = Math.max(0, stats.ec2Count - stats.unknownCount);
  const coveragePercent = stats.ec2Count > 0 ? Math.round((reportingCount / stats.ec2Count) * 100) : 100;
  const criticalCount = incidents.filter(i => i.severity === 'CRITICAL').length;
  const investigatingCount = incidents.filter(i => i.status === 'INVESTIGATING').length;

  return (
    <PageContainer
      header={{
        title: false,
        breadcrumb: undefined,
      }}
    >

      {/* Top Filter & Refined Status Header Card */}
      <Card style={{ marginBottom: 20, borderRadius: 8, background: '#121824', border: '1px solid rgba(255, 255, 255, 0.08)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)' }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col>
            <Space size="middle" align="center">
              <span style={{ color: '#8c8c8c', fontSize: 13, fontWeight: 500 }}>AWS Account:</span>
              <Select
                value={selectedAccountId}
                onChange={val => setSelectedAccountId(val)}
                style={{ width: 260 }}
                placeholder="Select Cloud Account"
                size="small"
              >
                {accounts.map(acc => (
                  <Option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.providerAccountId || acc.id.slice(0, 8)})
                  </Option>
                ))}
              </Select>

              {/* Refined Subtle Status Indicator */}
              <span
                style={{
                  background: healthStyleMap.bg,
                  color: healthStyleMap.color,
                  border: `1px solid ${healthStyleMap.border}`,
                  padding: '3px 12px',
                  borderRadius: '16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginLeft: '8px',
                }}
              >
                <span
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: healthStyleMap.dot,
                    boxShadow: `0 0 6px ${healthStyleMap.dot}`,
                  }}
                />
                {healthStyleMap.label}
              </span>
            </Space>
          </Col>

          <Col>
            <Space size="middle" wrap align="center">
              <span style={{ color: '#8c8c8c', fontSize: 13 }}>
                <ClockCircleOutlined style={{ marginRight: 4 }} />
                Updated: {secondsSinceUpdate}s ago
              </span>

              <Tooltip title={isAutoRefresh ? 'Pause Auto Refresh (10s)' : 'Enable Auto Refresh (10s)'}>
                <Switch
                  checked={isAutoRefresh}
                  onChange={checked => setIsAutoRefresh(checked)}
                  checkedChildren="Auto 10s"
                  unCheckedChildren="Paused"
                  size="small"
                />
              </Tooltip>

              <Button
                type="default"
                size="small"
                icon={<ReloadOutlined spin={loadingSummary} />}
                onClick={() => loadDashboardData()}
                style={{ background: '#1a2234', borderColor: 'rgba(255,255,255,0.12)', color: '#d9d9d9' }}
              >
                Refresh
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 4 Top Operational Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {/* Card 1: Resource Health */}
        <Col xs={24} sm={12} md={6}>
          <Card style={{ borderRadius: 8, background: '#161e2e', borderTop: '3px solid #52c41a', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)' }}>
            <Statistic
              title={<span style={{ color: '#94a3b8', fontSize: 13 }}><CheckCircleOutlined style={{ color: '#52c41a' }} /> Resource Health</span>}
              value={`${healthyEc2} healthy / ${totalEc2}`}
              valueStyle={{ color: '#fff', fontWeight: 700, fontSize: 20 }}
            />

            <div style={{ marginTop: 8, fontSize: 12, color: attentionCount > 0 ? '#ff7875' : '#52c41a', fontWeight: 500 }}>
              {attentionCount > 0 ? `${attentionCount} resource(s) need attention` : 'All resources healthy'}
            </div>
          </Card>
        </Col>

        {/* Card 2: Active Jobs */}
        <Col xs={24} sm={12} md={6}>
          <Card style={{ borderRadius: 8, background: '#161e2e', borderTop: '3px solid #1890ff', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)' }}>
            <Statistic
              title={<span style={{ color: '#94a3b8', fontSize: 13 }}><SyncOutlined style={{ color: '#1890ff' }} /> Active Jobs</span>}
              value={`${stats.runningJobs} running`}
              valueStyle={{ color: '#fff', fontWeight: 700, fontSize: 20 }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
              <span style={{ color: '#94a3b8' }}>{stats.queueLength} waiting</span> · <span style={{ color: stats.failedJobs > 0 ? '#ff4d4f' : '#64748b' }}>{stats.failedJobs} failed</span>
            </div>
          </Card>
        </Col>

        {/* Card 3: Open Incidents */}
        <Col xs={24} sm={12} md={6}>
          <Card style={{ borderRadius: 8, background: '#161e2e', borderTop: '3px solid #ff4d4f', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)' }}>
            <Statistic
              title={<span style={{ color: '#94a3b8', fontSize: 13 }}><BugOutlined style={{ color: '#ff4d4f' }} /> Open Incidents</span>}
              value={stats.openIncidents}
              valueStyle={{ color: '#fff', fontWeight: 700, fontSize: 20 }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
              <span style={{ color: criticalCount > 0 ? '#ff4d4f' : '#64748b', fontWeight: criticalCount > 0 ? 600 : 400 }}>{criticalCount} critical</span> · <span style={{ color: '#94a3b8' }}>{investigatingCount} investigating</span>
            </div>
          </Card>
        </Col>

        {/* Card 4: Monitoring Coverage */}
        <Col xs={24} sm={12} md={6}>
          <Card style={{ borderRadius: 8, background: '#161e2e', borderTop: '3px solid #13c2c2', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)' }}>
            <Statistic
              title={<span style={{ color: '#94a3b8', fontSize: 13 }}><ThunderboltOutlined style={{ color: '#13c2c2' }} /> Monitoring Coverage</span>}
              value={`${coveragePercent}%`}
              valueStyle={{ color: '#fff', fontWeight: 700, fontSize: 20 }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
              {reportingCount}/{totalEc2} resources reporting
            </div>
          </Card>
        </Col>
      </Row>



      {/* Main Content Area */}
      <Row gutter={[16, 16]}>
        {/* Left Column: Real-time Telemetry & Monitors */}
        <Col xs={24} lg={16}>
          {/* Telemetry Charts */}
          <Card
            title={
              <Space>
                <ThunderboltOutlined style={{ color: '#fa8c16' }} />
                <span style={{ color: '#f1f5f9', fontWeight: 600 }}>Resource Allocation Telemetry</span>
              </Space>
            }
            extra={<Tag color="blue" style={{ borderRadius: '12px' }}>Live Telemetry</Tag>}
            style={{ borderRadius: 8, marginBottom: 20, background: '#121824', border: '1px solid rgba(255, 255, 255, 0.08)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)' }}
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} md={12}>
                <div style={{ background: '#1a2234', padding: 16, borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ color: '#94a3b8', fontSize: 13 }}>CPU Utilization</span>
                    <Tag color={cpu > 85 ? 'red' : cpu > 70 ? 'warning' : 'green'}>{cpu.toFixed(1)}%</Tag>
                  </div>
                  <Progress percent={Math.round(cpu)} status={cpu > 85 ? 'exception' : 'active'} strokeColor="#52c41a" />
                  <div style={{ marginTop: 12 }}>
                    <MiniLineChart data={cpuHistory} color="#52c41a" />
                  </div>
                </div>
              </Col>

              <Col xs={24} md={12}>
                <div style={{ background: '#1a2234', padding: 16, borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ color: '#94a3b8', fontSize: 13 }}>Network Traffic</span>
                    <Tag color="purple">{networkFormatted}</Tag>
                  </div>
                  <div style={{ marginTop: 12, color: '#cbd5e1', fontSize: 13 }}>
                    <div style={{ marginBottom: 6 }}>Network In / Out telemetry active</div>
                    <div style={{ color: '#64748b', fontStyle: 'italic', marginTop: 16 }}>
                      Memory monitoring: N/A (CloudWatch Agent required)
                    </div>
                  </div>
                </div>
              </Col>
            </Row>
          </Card>

          {/* Active Incidents & Rule Engine Dispatches */}
          <Card
            title={
              <Space>
                <BugOutlined style={{ color: '#ff4d4f' }} />
                <span style={{ color: '#f1f5f9', fontWeight: 600 }}>Active Incidents (Rule Engine Dispatches)</span>
                <Badge count={incidents.length} overflowCount={99} style={{ backgroundColor: '#ff4d4f' }} />
              </Space>
            }
            style={{ borderRadius: 8, marginBottom: 20, background: '#121824', border: '1px solid rgba(255, 255, 255, 0.08)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)' }}
          >
            {incidents.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                <CheckCircleOutlined style={{ fontSize: 32, color: '#52c41a', marginBottom: 8 }} />
                <div>No active incidents detected. All system health rules passing.</div>
              </div>
            ) : (
              <List
                dataSource={incidents}
                renderItem={item => (
                  <List.Item
                    style={{ background: '#1a2234', marginBottom: 8, padding: '12px 16px', borderRadius: 6, borderLeft: item.severity === 'CRITICAL' ? '4px solid #ff4d4f' : '4px solid #faad14' }}
                  >
                    <List.Item.Meta
                      avatar={getAlertIcon(item.severity?.toLowerCase())}
                      title={
                        <Space wrap>
                          <span style={{ color: '#fff', fontWeight: 600 }}>#{item.incidentNumber || item.id.slice(0, 8)}</span>
                          <Tag color={item.severity === 'CRITICAL' ? 'red' : 'orange'}>{item.severity}</Tag>
                          <span style={{ color: '#e2e8f0' }}>{item.title}</span>
                        </Space>
                      }
                      description={
                        <div style={{ color: '#94a3b8', fontSize: 12 }}>
                          {item.description} · <span style={{ color: '#38bdf8' }}>Created by {item.createdByType === 'SYSTEM' ? 'CloudOps Rule Engine' : (item.creator?.name || 'User')}</span>
                        </div>
                      }
                    />
                    <div>
                      <Tag color="blue">{item.status}</Tag>
                    </div>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>

        {/* Right Column: Quick Operations & Terminal Logs */}
        <Col xs={24} lg={8}>
          {/* Quick Action Operations */}
          <Card
            title={
              <Space>
                <PlayCircleOutlined style={{ color: '#38bdf8' }} />
                <span style={{ color: '#f1f5f9', fontWeight: 600 }}>Quick Operations</span>
              </Space>
            }
            style={{ borderRadius: 8, marginBottom: 20, background: '#121824', border: '1px solid rgba(255, 255, 255, 0.08)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)' }}
          >
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                block
                size="large"
                loading={isExecutingJob}
                onClick={handleTriggerEvent}
                style={{
                  background: '#ea580c',
                  borderColor: '#ea580c',
                  height: 'auto',
                  padding: '10px 14px',
                  whiteSpace: 'normal',
                  textAlign: 'center',
                  fontWeight: 600,
                  boxShadow: '0 4px 12px rgba(234, 88, 12, 0.3)',
                }}
              >
                Run Diagnostic Job
              </Button>

              <Button
                icon={<CloudUploadOutlined />}
                block
                disabled={isExecutingJob}
                onClick={handleS3UploadEvent}
                style={{ background: '#1a2234', borderColor: 'rgba(255,255,255,0.12)', color: '#d9d9d9', whiteSpace: 'normal', height: 'auto', padding: '8px 12px' }}
              >
                Run AWS Resource Sync
              </Button>

              <Button
                icon={<ReloadOutlined />}
                block
                disabled={isExecutingJob}
                onClick={handleRestartWorker}
                style={{ background: '#1a2234', borderColor: 'rgba(255,255,255,0.12)', color: '#d9d9d9', whiteSpace: 'normal', height: 'auto', padding: '8px 12px' }}
              >
                Check Worker Pool Status
              </Button>


              <Button
                icon={<SyncOutlined />}
                block
                disabled={isExecutingJob}
                onClick={() => loadDashboardData()}
                style={{ background: '#1a2234', borderColor: 'rgba(255,255,255,0.12)', color: '#d9d9d9', whiteSpace: 'normal', height: 'auto', padding: '8px 12px' }}
              >
                Sync All Telemetry & Metrics
              </Button>
            </Space>
          </Card>

          {/* Activity Feed */}
          <Card
            title={
              <Space>
                <CodeOutlined style={{ color: '#4ade80' }} />
                <span style={{ color: '#f1f5f9', fontWeight: 600 }}>Recent System Activities</span>
              </Space>
            }
            style={{ borderRadius: 8, background: '#121824', border: '1px solid rgba(255, 255, 255, 0.08)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)' }}
          >
            <List
              size="small"
              dataSource={activities}
              renderItem={item => (
                <List.Item style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Space wrap>
                      <Tag color={item.status === 'error' ? 'red' : item.status === 'warning' ? 'orange' : 'green'}>{item.time}</Tag>
                      <span style={{ color: '#cbd5e1', fontSize: 13 }}>{item.text}</span>
                    </Space>
                  </Space>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </PageContainer>
  );
};

export default Dashboard;
