import React, { useState, useEffect, useRef } from 'react';
import { Row, Col, Card, Statistic, Progress, Badge, List, Tag, Space, Button, Switch, Tooltip, notification, message } from 'antd';
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
  PauseCircleOutlined,
  RightOutlined
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { history } from '@umijs/max';

interface TerminalLine {
  text: string;
  type: 'cmd' | 'info' | 'success' | 'warn' | 'cyan';
}

interface ActivityItem {
  id: string;
  time: string;
  text: string;
  status: 'success' | 'warning' | 'info' | 'error';
}

// Sparkline component that draws smooth real-time charts
const MiniLineChart: React.FC<{ data: number[]; color: string }> = ({ data, color }) => {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const height = 50;
  const width = 200;
  const points = data
    .map((val, i) => {
      const x = (i / (data.length - 1)) * width;
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

const Dashboard: React.FC = () => {
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Real-time state
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);
  
  const [cpu, setCpu] = useState(48);
  const [ram, setRam] = useState(65);
  const [throughput, setThroughput] = useState(324);
  const [throughputTrend, setThroughputTrend] = useState('+12%');
  
  const [cpuHistory, setCpuHistory] = useState([45, 48, 42, 50, 52, 47, 49, 44, 48]);
  const [ramHistory, setRamHistory] = useState([64, 65, 65, 66, 65, 64, 66, 65, 65]);

  // CloudOps Dashboard statistics state
  const [stats, setStats] = useState({
    totalJobs: 139,
    runningJobs: 2,
    failedJobs: 2,
    activeWorkers: 4,
    queueLength: 5,
    openIncidents: 1,
    alertCount: 3,
  });

  // Datadog-style Monitors State
  const [monitors, setMonitors] = useState([
    { key: 'cloudwatch', name: 'AWS CloudWatch Adapter', type: 'adapter', status: 'healthy', value: 'Receiving Events', uptime: '99.99%' },
    { key: 'redis', name: 'BullMQ Redis Server', type: 'queue', status: 'healthy', value: '1.2ms latency', uptime: '99.98%' },
    { key: 'workers', name: 'Background Workers', type: 'workers', status: 'healthy', value: '4 online / 0 busy', uptime: '100.0%' },
    { key: 'ruleengine', name: 'CloudOps Rule Engine', type: 'engine', status: 'healthy', value: 'Active (12 rules)', uptime: '99.95%' },
    { key: 's3', name: 'S3 Event Backup Storage', type: 'storage', status: 'healthy', value: '128 GB allocated', uptime: '100.0%' }
  ]);

  // Active Alerts state
  const [alerts, setAlerts] = useState<any[]>([]);

  // Terminal Console Logs State
  const [terminalLogs, setTerminalLogs] = useState<TerminalLine[]>([
    { text: '[root@cloudops-worker] cloudops_agent_init --verbose', type: 'cmd' },
    { text: 'Initializing AWS Provider Adapter connections...', type: 'info' },
    { text: 'Subscribed to SQS Queue: cloudops-events-queue-prod', type: 'info' },
    { text: 'Redis BullMQ connection initialized. Background workers waiting for events...', type: 'success' },
  ]);

  // Activities logs state
  const [activities, setActivities] = useState<ActivityItem[]>([
    { id: '1', time: '21:08', text: 'Incident #INC-992: [CPU High] resolved', status: 'success' },
    { id: '2', time: '21:06', text: 'AWS S3 object created event validated', status: 'info' },
    { id: '3', time: '21:02', text: 'BullMQ background worker #03 restarted', status: 'warning' },
    { id: '4', time: '20:59', text: 'Incident alert notification dispatched via Slack', status: 'success' }
  ]);

  const [isExecutingJob, setIsExecutingJob] = useState(false);


  // Simulation timer for realtime telemetry & background logs
  useEffect(() => {
    let updateInterval: NodeJS.Timeout;
    let secCounter: NodeJS.Timeout;
    let backgroundLogInterval: NodeJS.Timeout;

    if (isAutoRefresh) {
      updateInterval = setInterval(() => {
        setCpu(prev => {
          const change = Math.floor(Math.random() * 15) - 7;
          const next = Math.max(25, Math.min(95, prev + change));
          setCpuHistory(history => [...history.slice(1), next]);
          return next;
        });

        setRam(prev => {
          const change = Math.floor(Math.random() * 5) - 2;
          const next = Math.max(50, Math.min(85, prev + change));
          setRamHistory(history => [...history.slice(1), next]);
          return next;
        });

        // Randomly simulate a processed event increment
        setStats(prev => ({
          ...prev,
          totalJobs: prev.totalJobs + Math.floor(Math.random() * 2),
          queueLength: Math.max(0, prev.queueLength + Math.floor(Math.random() * 3) - 1),
        }));

        setThroughput(prev => {
          const change = Math.floor(Math.random() * 21) - 10;
          const next = Math.max(200, Math.min(500, prev + change));
          setThroughputTrend(change >= 0 ? `↑ +${Math.floor(Math.random() * 5) + 1}%` : `↓ -${Math.floor(Math.random() * 5) + 1}%`);
          return next;
        });

        setSecondsSinceUpdate(0);
      }, 3000);

      // Background terminal operations simulation
      backgroundLogInterval = setInterval(() => {
        if (isExecutingJob) return; // Don't interrupt manual job logs

        const backgroundCommands = [
          { cmd: 'systemctl status cloudops-agent.service', out: 'cloudops-agent.service (v1.0.2) is active (running)...', type: 'success' },
          { cmd: 'redis-cli ping', out: 'PONG (latency 1.15ms)', type: 'success' },
          { cmd: 'aws sqs get-queue-attributes --attribute-names ApproximateNumberOfMessages', out: 'SQS MessagesAvailable: 5 | SQS MessagesNotVisible: 0', type: 'info' },
          { cmd: 'pm2 status bullmq-workers', out: 'Workers Pool: [Worker_01: busy, Worker_02: idle, Worker_03: idle, Worker_04: idle]', type: 'info' }
        ];

        const selected = backgroundCommands[Math.floor(Math.random() * backgroundCommands.length)];
        
        setTerminalLogs(prev => [
          ...prev,
          { text: `[root@cloudops-worker] ${selected.cmd}`, type: 'cmd' },
        ]);

        setTimeout(() => {
          setTerminalLogs(prev => [
            ...prev,
            { text: selected.out, type: selected.type as any }
          ]);
        }, 800); // Append directly for realistic terminal streaming speed
      }, 5000);
    }

    secCounter = setInterval(() => {
      setSecondsSinceUpdate(prev => prev + 1);
    }, 1000);

    return () => {
      clearInterval(updateInterval);
      clearInterval(secCounter);
      if (backgroundLogInterval) clearInterval(backgroundLogInterval);
    };
  }, [isAutoRefresh, isExecutingJob]);

  // Interactivity handlers for Quick Actions
  const handleTriggerEvent = () => {
    if (isExecutingJob) return;
    setIsExecutingJob(true);
    message.loading({ content: 'Simulating AWS CloudWatch CPU_HIGH Event...', key: 'event_action' });

    // Stream logs to terminal
    const steps = [
      { text: '[root@cloudops-worker] curl -X POST -H "Content-Type: application/json" -d \'{"event": "CPU_HIGH", "threshold": 90}\' http://localhost:8000/api/v1/events/aws-cloudwatch', type: 'cmd' },
      { text: 'CloudWatch Adapter: Received event payload. Validating event signature...', type: 'info' },
      { text: 'Signature: OK. Schema Validation: PASSED. Generated Unified Cloud Event: E-AWS-CW-9128', type: 'success' },
      { text: 'BullMQ: Enqueued Job #1412 into Redis waiting list. [Priority: HIGH]', type: 'cyan' },
      { text: 'Rule Engine: Evaluated (CPU > 90%) -> Result: Incident Triggered (INC-992). Dispatched alert to Slack & Email.', type: 'warn' },
      { text: 'Incident Manager: Opened incident ticket INC-992. Timeline recorded.', type: 'success' }
    ];

    steps.forEach((step, index) => {
      setTimeout(() => {
        setTerminalLogs(prev => [...prev, step as TerminalLine]);
        if (index === steps.length - 1) {
          // Finalize state
          setStats(prev => ({
            ...prev,
            totalJobs: prev.totalJobs + 1,
            openIncidents: prev.openIncidents + 1,
            alertCount: prev.alertCount + 1
          }));

          // Add to activity feed
          const now = new Date();
          const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
          setActivities(prev => [
            { id: String(Date.now()), time: timeStr, text: 'Incident #INC-992: [CPU High] created', status: 'error' },
            ...prev
          ]);

          notification.error({
            message: 'Incident Alert Dispatched',
            description: 'Incident #INC-992 successfully triggered via Rule Engine and assigned to on-call engineer.',
            placement: 'topRight'
          });
          message.success({ content: 'Event simulated successfully!', key: 'event_action' });
          setIsExecutingJob(false);
        }
      }, index * 400);
    });
  };

  const handleS3UploadEvent = () => {
    if (isExecutingJob) return;
    setIsExecutingJob(true);
    message.loading({ content: 'Simulating AWS S3 ObjectCreated Event...', key: 'upload_action' });

    const steps = [
      { text: '[root@cloudops-worker] aws sns publish --topic-arn arn:aws:sns:us-east-1:123456789012:s3-events --message \'{"Records": [{"s3": {"object": {"key": "logs/2026-07.json"}}}].\'', type: 'cmd' },
      { text: 'S3 Event Adapter: Received S3:ObjectCreated:Put event metadata.', type: 'info' },
      { text: 'Validation: Unified Event created: E-AWS-S3-9129 [File: logs/2026-07.json]', type: 'success' },
      { text: 'BullMQ Worker #02 processed event. Rule Engine: No incidents triggered. Archived raw event.', type: 'success' }
    ];

    steps.forEach((step, index) => {
      setTimeout(() => {
        setTerminalLogs(prev => [...prev, step as TerminalLine]);
        if (index === steps.length - 1) {
          setStats(prev => ({
            ...prev,
            totalJobs: prev.totalJobs + 1
          }));

          const now = new Date();
          const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
          setActivities(prev => [
            { id: String(Date.now()), time: timeStr, text: 'AWS S3 object created event validated', status: 'info' },
            ...prev
          ]);

          notification.info({
            message: 'S3 Event Processed',
            description: 'S3 upload event logs/2026-07.json successfully validated and archived.',
            placement: 'topRight'
          });
          message.success({ content: 'S3 Event Ingested!', key: 'upload_action' });
          setIsExecutingJob(false);
        }
      }, index * 400);
    });
  };

  const handleRestartWorker = () => {
    if (isExecutingJob) return;
    setIsExecutingJob(true);
    message.loading({ content: 'Restarting BullMQ Worker processes...', key: 'restart_action' });
    
    // Set status warning
    setMonitors(prev => prev.map(m => m.key === 'workers' ? { ...m, status: 'warning', value: '3 online / 0 busy' } : m));

    const steps = [
      { text: '[root@cloudops-worker] pm2 restart bullmq-workers', type: 'cmd' },
      { text: 'Sending SIGINT to 4 active node process executors...', type: 'info' },
      { text: 'Workers terminated gracefully. Spawning clean Node worker containers...', type: 'cyan' },
      { text: 'BullMQ workers online. Status: 4 online / 0 busy. Listening for Redis events...', type: 'success' }
    ];

    steps.forEach((step, index) => {
      setTimeout(() => {
        setTerminalLogs(prev => [...prev, step as TerminalLine]);
        if (index === steps.length - 1) {
          setMonitors(prev => prev.map(m => m.key === 'workers' ? { ...m, status: 'healthy', value: '4 online / 0 busy' } : m));

          const now = new Date();
          const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
          setActivities(prev => [
            { id: String(Date.now()), time: timeStr, text: 'BullMQ background worker pool restarted', status: 'warning' },
            ...prev
          ]);

          notification.success({
            message: 'Worker Pool Restarted',
            description: '4 Background Workers successfully restarted and linked to Redis queue.',
            placement: 'topRight'
          });
          message.success({ content: 'Workers restarted successfully!', key: 'restart_action' });
          setIsExecutingJob(false);
        }
      }, index * 500);
    });
  };

  const handleFlushRedisQueue = () => {
    if (isExecutingJob) return;
    setIsExecutingJob(true);
    message.loading({ content: 'Flushing Redis Active Queue states...', key: 'sync_action' });

    const steps = [
      { text: '[root@cloudops-worker] redis-cli -h localhost -p 6379 -a "******" FLUSHDB', type: 'cmd' },
      { text: 'Connecting to Redis BullMQ memory store...', type: 'info' },
      { text: 'Deleting all active, delayed, failed and waiting queues...', type: 'cyan' },
      { text: 'Redis store flushed: OK. Cleared active task indexes.', type: 'success' }
    ];

    steps.forEach((step, index) => {
      setTimeout(() => {
        setTerminalLogs(prev => [...prev, step as TerminalLine]);
        if (index === steps.length - 1) {
          setStats(prev => ({
            ...prev,
            queueLength: 0
          }));

          const now = new Date();
          const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
          setActivities(prev => [
            { id: String(Date.now()), time: timeStr, text: 'Redis BullMQ database flushed', status: 'success' },
            ...prev
          ]);

          notification.success({
            message: 'Redis Store Flushed',
            description: 'Redis active database flushed. Queue length reset to 0.',
            placement: 'topRight'
          });
          message.success({ content: 'Queue flushed successfully!', key: 'sync_action' });
          setIsExecutingJob(false);
        }
      }, index * 400);
    });
  };

  const dismissAlert = (id: string) => {
    setAlerts(prev => prev.filter(alert => alert.id !== id));
    message.info('Alert dismissed.');
  };

  const getAlertIcon = (level: string) => {
    if (level === 'critical') return <CheckCircleFilled style={{ color: '#ff4d4f', fontSize: '16px' }} />;
    if (level === 'warning') return <WarningFilled style={{ color: '#faad14', fontSize: '16px' }} />;
    return <InfoCircleFilled style={{ color: '#1890ff', fontSize: '16px' }} />;
  };

  // Determine system health status dynamically
  const hasCriticalAlert = alerts.some(a => a.level === 'critical');
  const hasWarningAlert = alerts.some(a => a.level === 'warning');
  const hasWarningMonitor = monitors.some(m => m.status === 'warning');
  
  let systemHealthStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
  if (hasCriticalAlert) {
    systemHealthStatus = 'critical';
  } else if (hasWarningAlert || hasWarningMonitor) {
    systemHealthStatus = 'degraded';
  }
  
  const healthConfig = {
    healthy: { label: 'Healthy', color: '#52c41a', icon: '🟢' },
    degraded: { label: 'Degraded', color: '#faad14', icon: '🟡' },
    critical: { label: 'Critical', color: '#ff4d4f', icon: '🔴' }
  }[systemHealthStatus];

  // Determine queue status color dynamically
  let queueColor = '#52c41a'; // green
  if (stats.queueLength >= 15) {
    queueColor = '#ff4d4f'; // red
  } else if (stats.queueLength >= 5) {
    queueColor = '#faad14'; // yellow
  }

  // Count alerts dynamically
  const criticalAlerts = alerts.filter(a => a.level === 'critical').length;
  const warningAlerts = alerts.filter(a => a.level === 'warning').length;
  let alertCardColor = '#52c41a'; // green
  if (criticalAlerts > 0) {
    alertCardColor = '#ff4d4f'; // red
  } else if (warningAlerts > 0) {
    alertCardColor = '#faad14'; // yellow
  }

  return (
    <PageContainer title={false}>
      
      {/* 1. CloudOps Status Banner Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: '20px' }}>
        <Col xs={24} sm={12} md={6} lg={6} xl={6}>
          <Card bordered={false} className="stat-card" style={{ borderLeft: `4px solid ${healthConfig.color}`, backgroundColor: '#191919' }}>
            <Statistic
              title={
                <span style={{ color: '#8c8c8c', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: healthConfig.color }} /> System Health
                </span>
              }
              value={healthConfig.label}
              valueStyle={{ color: healthConfig.color, fontSize: '18px', fontWeight: 'bold' }}
            />
            <div style={{ marginTop: 4, color: '#8c8c8c', fontSize: '11px' }}>
              99.98% Uptime
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6} lg={6} xl={6}>
          <Card bordered={false} className="stat-card" style={{ borderLeft: '4px solid #faad14', backgroundColor: '#191919' }}>
            <Statistic
              title={
                <span style={{ color: '#8c8c8c', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ThunderboltOutlined style={{ color: '#faad14', fontSize: '14px' }} /> Event Throughput
                </span>
              }
              value={`${throughput} Events/min`}
              valueStyle={{ color: '#faad14', fontSize: '18px', fontWeight: 'bold' }}
            />
            <div style={{ marginTop: 4, color: '#52c41a', fontSize: '11px', fontWeight: 600 }}>
              {throughputTrend}
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6} lg={6} xl={6}>
          <Card bordered={false} className="stat-card" style={{ borderLeft: `4px solid ${queueColor}`, backgroundColor: '#191919' }}>
            <Statistic
              title={
                <span style={{ color: '#8c8c8c', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <DatabaseOutlined style={{ color: queueColor, fontSize: '14px' }} /> Queue Status
                </span>
              }
              value={`${stats.queueLength} Pending`}
              valueStyle={{ color: queueColor, fontSize: '18px', fontWeight: 'bold' }}
            />
            <div style={{ marginTop: 4, color: '#8c8c8c', fontSize: '11px' }}>
              {stats.runningJobs} Processing
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6} lg={6} xl={6}>
          <Card bordered={false} className="stat-card" style={{ borderLeft: `4px solid ${alertCardColor}`, backgroundColor: '#191919' }}>
            <Statistic
              title={
                <span style={{ color: '#8c8c8c', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <WarningFilled style={{ color: alertCardColor, fontSize: '14px' }} /> Active Alerts
                </span>
              }
              value={`${criticalAlerts} Critical`}
              valueStyle={{ color: criticalAlerts > 0 ? '#ff4d4f' : '#8c8c8c', fontSize: '18px', fontWeight: 'bold' }}
            />
            <div style={{ marginTop: 4, color: warningAlerts > 0 ? '#faad14' : '#8c8c8c', fontSize: '11px', fontWeight: warningAlerts > 0 ? 600 : 400 }}>
              {warningAlerts} Warning
            </div>
          </Card>
        </Col>
      </Row>

      {/* 2. Main Resource Telemetry & Quick Actions */}
      <Row gutter={[16, 16]}>
        {/* Real-time Telemetry */}
        <Col xs={24} lg={16}>
          <Card 
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <span style={{ color: '#fff', fontSize: '16px', fontWeight: 600 }}>Resource Allocation Telemetry</span>
                <Space size="middle">
                  <span style={{ color: '#8c8c8c', fontSize: '11px' }}>
                    {isAutoRefresh ? `Last updated: ${secondsSinceUpdate}s ago` : 'Auto Refresh Paused'}
                  </span>
                  <Tooltip title={isAutoRefresh ? 'Pause Simulation' : 'Resume Simulation'}>
                    <Switch
                      checkedChildren={<SyncOutlined spin />}
                      unCheckedChildren={<PauseCircleOutlined />}
                      checked={isAutoRefresh}
                      onChange={(checked) => setIsAutoRefresh(checked)}
                      style={{ backgroundColor: isAutoRefresh ? '#e26f54' : '#333' }}
                    />
                  </Tooltip>
                </Space>
              </div>
            } 
            bordered={false}
          >
            <Row gutter={24}>
              <Col xs={24} sm={12}>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ color: '#8c8c8c', fontSize: '13px' }}>CPU Utilization</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '4px 0' }}>
                    <span style={{ fontSize: '26px', fontWeight: 'bold', color: '#fff' }}>{cpu}%</span>
                    <Tag color={cpu > 80 ? 'red' : cpu > 60 ? 'warning' : 'success'} style={{ fontSize: '10px' }}>
                      {cpu > 80 ? 'CRITICAL' : cpu > 60 ? 'HIGH' : 'NORMAL'}
                    </Tag>
                  </div>
                  <Progress 
                    percent={cpu} 
                    status={cpu > 80 ? 'exception' : 'active'} 
                    strokeColor={cpu > 80 ? '#ff4d4f' : cpu > 60 ? '#faad14' : '#52c41a'} 
                    showInfo={false} 
                    strokeWidth={6}
                  />
                </div>
                <div style={{ marginTop: 12 }}>
                  <span style={{ color: '#555', fontSize: '11px', display: 'block', marginBottom: '8px' }}>Real-time sparkline (3s polling)</span>
                  <MiniLineChart data={cpuHistory} color={cpu > 80 ? '#ff4d4f' : cpu > 60 ? '#faad14' : '#52c41a'} />
                </div>
              </Col>
              
              <Col xs={24} sm={12}>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ color: '#8c8c8c', fontSize: '13px' }}>Memory Allocation</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '4px 0' }}>
                    <span style={{ fontSize: '26px', fontWeight: 'bold', color: '#fff' }}>{ram}%</span>
                    <Tag color={ram > 80 ? 'red' : 'success'} style={{ fontSize: '10px' }}>
                      {ram > 80 ? 'OVERFLOW' : 'OPTIMAL'}
                    </Tag>
                  </div>
                  <Progress 
                    percent={ram} 
                    status="active" 
                    strokeColor={{ '0%': '#b37feb', '100%': '#9254de' }} 
                    showInfo={false} 
                    strokeWidth={6}
                  />
                </div>
                <div style={{ marginTop: 12 }}>
                  <span style={{ color: '#555', fontSize: '11px', display: 'block', marginBottom: '8px' }}>Real-time sparkline (3s polling)</span>
                  <MiniLineChart data={ramHistory} color="#9254de" />
                </div>
              </Col>
            </Row>
          </Card>
        </Col>

        {/* Quick Actions Panel */}
        <Col xs={24} lg={8}>
          <Card title={<span style={{ color: '#fff', fontSize: '16px', fontWeight: 600 }}>Quick Actions Operations</span>} bordered={false}>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Button 
                type="primary" 
                block 
                icon={<PlayCircleOutlined />} 
                onClick={handleTriggerEvent}
                disabled={isExecutingJob}
                style={{ height: '40px', borderRadius: '6px', fontWeight: 600 }}
              >
                Run Diagnostic Job
              </Button>
              
              <Button 
                block 
                icon={<CloudUploadOutlined />} 
                onClick={handleS3UploadEvent}
                disabled={isExecutingJob}
                style={{ height: '40px', borderRadius: '6px', backgroundColor: 'rgba(255, 87, 34, 0.05)', color: '#ff7a45', border: '1px solid #ff7a45' }}
              >
                Upload Log File
              </Button>

              <Row gutter={12}>
                <Col span={12}>
                  <Button 
                    block 
                    icon={<ReloadOutlined />} 
                    onClick={handleRestartWorker}
                    disabled={isExecutingJob}
                    style={{ height: '36px', fontSize: '12px' }}
                  >
                    Restart Worker
                  </Button>
                </Col>
                <Col span={12}>
                  <Button 
                    block 
                    icon={<SyncOutlined />} 
                    onClick={handleFlushRedisQueue}
                    disabled={isExecutingJob}
                    style={{ height: '36px', fontSize: '12px' }}
                  >
                    Sync Event Sources
                  </Button>
                </Col>
              </Row>

              <Button 
                type="link" 
                block 
                icon={<CodeOutlined />} 
                onClick={() => history.push('/logs')}
                style={{ textAlign: 'center', color: '#ff7a45', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                Open Console Logs <RightOutlined style={{ fontSize: '10px', marginLeft: 4 }} />
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* 3. Mini Terminal & Service Health Status */}
      <Row gutter={[16, 16]} style={{ marginTop: '20px' }}>
        {/* Operations Terminal Console */}
        <Col xs={24} lg={16}>
          <Card 
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CodeOutlined style={{ color: '#e26f54' }} />
                <span style={{ color: '#fff', fontSize: '16px', fontWeight: 600 }}>CloudOps Log Console (cloudops-worker-01)</span>
              </div>
            } 
            bordered={false}
          >
            <div className="terminal-container" style={{ minHeight: '240px' }}>
              {terminalLogs.map((log, idx) => {
                let color = '#d9d9d9';
                if (log.type === 'cmd') color = '#e26f54';
                else if (log.type === 'success') color = '#52c41a';
                else if (log.type === 'warn') color = '#faad14';
                else if (log.type === 'cyan') color = '#13c2c2';

                return (
                  <div key={idx} style={{ color, marginBottom: '6px', fontSize: '12px', fontFamily: "'Courier New', monospace", lineHeight: '1.5' }}>
                    {log.text}
                  </div>
                );
              })}
              <div style={{ display: 'flex', alignItems: 'center', color: '#52c41a', fontSize: '12px', fontFamily: "'Courier New', monospace" }}>
                <span>[root@cloudops-worker] # </span>
                <span className="terminal-cursor" />
              </div>
              <div ref={terminalEndRef} />
            </div>
          </Card>
        </Col>

        {/* Datadog style Health Status */}
        <Col xs={24} lg={8}>
          <Card 
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#fff', fontSize: '16px', fontWeight: 600 }}>CloudOps Service Monitors</span>
                <Tag color="success" style={{ border: 'none', fontSize: '10px' }}>ALL OK</Tag>
              </div>
            } 
            bordered={false}
          >
            <List
              dataSource={monitors}
              renderItem={(item) => (
                <div 
                  key={item.key} 
                  style={{ 
                    padding: '8px 0', 
                    borderBottom: '1px solid #222',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Space size="small">
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#52c41a', boxShadow: '0 0 8px #52c41a' }} />
                      <span style={{ color: '#d9d9d9', fontWeight: 600, fontSize: '12px' }}>{item.name}</span>
                    </Space>
                    <span style={{ color: '#8c8c8c', fontSize: '10px' }}>{item.value}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                    {/* Datadog Uptime Check Bars */}
                    <div style={{ display: 'flex', gap: '2px' }}>
                      {[...Array(18)].map((_, idx) => {
                        // Randomly insert a warning check bar in some nodes to look extremely realistic
                        const isWarningBar = item.status === 'warning' || (item.key === 'rds' && idx === 11);
                        return (
                          <div 
                            key={idx} 
                            style={{ 
                              width: '5px', 
                              height: '12px', 
                              borderRadius: '1px', 
                              backgroundColor: isWarningBar ? '#faad14' : '#52c41a',
                              opacity: 0.85
                            }} 
                          />
                        );
                      })}
                    </div>
                    <span style={{ color: '#52c41a', fontSize: '10px', fontWeight: 500 }}>{item.uptime} uptime</span>
                  </div>
                </div>
              )}
            />
          </Card>
        </Col>
      </Row>

      {/* 4. Active Alerts & Activity Feed */}
      <Row gutter={[16, 16]} style={{ marginTop: '20px' }}>
        {/* Severity Alerts Center */}
        <Col xs={24} lg={16}>
          <Card 
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#fff', fontSize: '16px', fontWeight: 600 }}>Active Alerts Center</span>
                <Badge count={alerts.length} style={{ backgroundColor: '#ff4d4f' }} />
              </div>
            } 
            bordered={false}
          >
            {alerts.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: '#555' }}>
                <CheckCircleOutlined style={{ fontSize: '32px', color: '#52c41a', marginBottom: '8px' }} />
                <div>All nodes reporting healthy status.</div>
              </div>
            ) : (
              <List
                dataSource={alerts}
                renderItem={(item) => (
                  <List.Item 
                    style={{ 
                      borderBottom: '1px solid #222',
                      padding: '12px 0',
                      alignItems: 'flex-start'
                    }}
                    actions={[
                      <Button 
                        type="text" 
                        size="small" 
                        onClick={() => dismissAlert(item.id)}
                        style={{ color: '#ff7a45', fontSize: '11px', padding: 0 }}
                      >
                        Acknowledge
                      </Button>
                    ]}
                  >
                    <List.Item.Meta
                      avatar={getAlertIcon(item.level)}
                      title={
                        <Space size="small">
                          <span style={{ color: '#fff', fontWeight: 600, fontSize: '12px' }}>{item.service}</span>
                          <Tag 
                            color={item.level === 'critical' ? 'red' : item.level === 'warning' ? 'gold' : 'blue'}
                            style={{ fontSize: '9px', lineHeight: '14px', height: '14px', padding: '0 4px', border: 'none' }}
                          >
                            {item.level.toUpperCase()}
                          </Tag>
                        </Space>
                      }
                      description={
                        <div style={{ marginTop: '2px' }}>
                          <div style={{ color: '#d9d9d9', fontSize: '11px', lineHeight: 1.3 }}>{item.msg}</div>
                          <div style={{ color: '#555', fontSize: '10px', marginTop: '4px' }}>{item.time}</div>
                        </div>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>

        {/* System Activity Feed */}
        <Col xs={24} lg={8}>
          <Card title={<span style={{ color: '#fff', fontSize: '16px', fontWeight: 600 }}>Operations Activity Feed</span>} bordered={false}>
            <List
              dataSource={activities}
              renderItem={(item) => {
                let dotColor = '#52c41a';
                if (item.status === 'warning') dotColor = '#faad14';
                else if (item.status === 'info') dotColor = '#1890ff';
                else if (item.status === 'error') dotColor = '#ff4d4f';

                return (
                  <div 
                    key={item.id}
                    style={{ 
                      padding: '10px 0',
                      borderBottom: '1px solid #222',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px'
                    }}
                  >
                    <span style={{ color: '#ff7a45', fontFamily: 'monospace', fontSize: '11px', width: '42px', display: 'inline-block' }}>
                      {item.time}
                    </span>
                    <span 
                      style={{ 
                        width: '6px', 
                        height: '6px', 
                        borderRadius: '50%', 
                        backgroundColor: dotColor,
                        display: 'inline-block'
                      }} 
                    />
                    <span style={{ color: '#d9d9d9', fontSize: '12px', flex: 1 }}>
                      {item.text}
                    </span>
                  </div>
                );
              }}
            />
          </Card>
        </Col>
      </Row>
    </PageContainer>
  );
};

export default Dashboard;
