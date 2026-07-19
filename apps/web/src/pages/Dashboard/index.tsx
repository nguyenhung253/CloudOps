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
  
  const [cpuHistory, setCpuHistory] = useState([45, 48, 42, 50, 52, 47, 49, 44, 48]);
  const [ramHistory, setRamHistory] = useState([64, 65, 65, 66, 65, 64, 66, 65, 65]);

  // ETL statistics state
  const [stats, setStats] = useState({
    running: 3,
    queued: 5,
    completed: 134,
    failed: 2,
    filesProcessed: 8924,
    dailyRequests: 452812,
  });

  // Datadog Monitors State
  const [monitors, setMonitors] = useState([
    { key: 'ec2', name: 'EC2 Worker Nodes', type: 'system', status: 'healthy', value: '12 active', uptime: '99.98%' },
    { key: 'docker', name: 'Docker Executors', type: 'container', status: 'healthy', value: '5/5 running', uptime: '100.0%' },
    { key: 'redis', name: 'Redis Cache Server', type: 'cache', status: 'healthy', value: '0.8ms latency', uptime: '99.99%' },
    { key: 'rds', name: 'RDS Aurora PostgreSQL', type: 'database', status: 'healthy', value: 'Synced', uptime: '99.95%' },
    { key: 's3', name: 'S3 Object Storage', type: 'storage', status: 'healthy', value: '128 GB', uptime: '100.0%' }
  ]);

  // Active Alerts state
  const [alerts, setAlerts] = useState([
    { id: '1', service: 'ETL Spark Master', msg: 'Container Memory allocation exceeds threshold limit (>85%)', level: 'warning', time: 'Just now' },
    { id: '2', service: 'Amazon RDS DB', msg: 'Spark job connection write failure: replication lag peak at 12ms', level: 'critical', time: '10m ago' },
    { id: '3', service: 'S3 Sync Daemon', msg: 'Incremental raw dataset synchronization completed successfully', level: 'info', time: '15m ago' }
  ]);

  // Terminal Console Logs State
  const [terminalLogs, setTerminalLogs] = useState<TerminalLine[]>([
    { text: '[root@etl-worker] workspace_env_init --verbose', type: 'cmd' },
    { text: 'Loading configuration profiles from AWS Secrets Manager...', type: 'info' },
    { text: 'Connection to Spark cluster master node at spark://10.0.1.42:7077 established.', type: 'info' },
    { text: 'DataFlowHub worker pool listening for job execution pipelines...', type: 'success' },
  ]);

  // Activities logs state
  const [activities, setActivities] = useState<ActivityItem[]>([
    { id: '1', time: '21:08', text: 'Job Import User completed', status: 'success' },
    { id: '2', time: '21:06', text: 'Dataset uploaded', status: 'info' },
    { id: '3', time: '21:02', text: 'Worker restarted', status: 'warning' },
    { id: '4', time: '20:59', text: 'Backup Database success', status: 'success' }
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

        // Randomly simulate a processed file increment
        setStats(prev => ({
          ...prev,
          filesProcessed: prev.filesProcessed + Math.floor(Math.random() * 2),
          dailyRequests: prev.dailyRequests + Math.floor(Math.random() * 50) + 10,
        }));

        setSecondsSinceUpdate(0);
      }, 3000);

      // Background terminal operations simulation
      backgroundLogInterval = setInterval(() => {
        if (isExecutingJob) return; // Don't interrupt manual job logs

        const backgroundCommands = [
          { cmd: 'systemctl status dataflow-agent.service', out: 'dataflow-agent.service (v2.4.1) is active (running)...', type: 'success' },
          { cmd: 'df -h /data', out: 'Filesystem /dev/xvda1: 128G used, 114G avail (52% capacity)', type: 'info' },
          { cmd: 'redis-cli ping', out: 'PONG (latency 0.82ms)', type: 'success' },
          { cmd: 'aws sqs get-queue-attributes', out: 'SQS MessagesAvailable: 5 | MessagesDelayed: 0', type: 'info' },
          { cmd: 'pgrep -f spark-executor', out: 'Active spark-executor PIDs: [19402, 19415, 19420]', type: 'info' }
        ];

        const selected = backgroundCommands[Math.floor(Math.random() * backgroundCommands.length)];
        
        setTerminalLogs(prev => [
          ...prev,
          { text: `[root@etl-worker] ${selected.cmd}`, type: 'cmd' },
        ]);

        setTimeout(() => {
          setTerminalLogs(prev => [
            ...prev,
            { text: selected.out, type: selected.type as any }
          ]);
        }, 60000); // Trigger outputs slightly delayed or just append directly for simulation speed:
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
  const handleRunETL = () => {
    if (isExecutingJob) return;
    setIsExecutingJob(true);
    message.loading({ content: 'Initiating Spark Cluster ETL Job...', key: 'etl_action' });

    // Stream logs to terminal
    const steps = [
      { text: '[root@etl-worker] spark-submit --master spark://spark-master:7077 --deploy-mode client /opt/etl/jobs/import_users.py', type: 'cmd' },
      { text: 'Starting Job: ETL_User_Import_Pipeline...', type: 'info' },
      { text: 'Loading Dataset from S3 bucket: dataflow-hub-bucket...', type: 'cyan' },
      { text: 'Transforming... [PySpark mapping, cleaning, and partitioning]', type: 'cyan' },
      { text: 'Uploading target records to Amazon RDS Aurora postgres pool...', type: 'cyan' },
      { text: 'Completed successfully. Spark session closed.', type: 'success' }
    ];

    steps.forEach((step, index) => {
      setTimeout(() => {
        setTerminalLogs(prev => [...prev, step as TerminalLine]);
        if (index === steps.length - 1) {
          // Finalize state
          setStats(prev => ({
            ...prev,
            running: Math.max(0, prev.running - 1),
            completed: prev.completed + 1
          }));

          // Add to activity feed
          const now = new Date();
          const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
          setActivities(prev => [
            { id: String(Date.now()), time: timeStr, text: 'Job Import User completed', status: 'success' },
            ...prev
          ]);

          notification.success({
            message: 'Spark Task Completed',
            description: 'ETL Pipeline Job #912 successfully processed and saved to Aurora RDS.',
            placement: 'topRight'
          });
          message.success({ content: 'Job triggered successfully!', key: 'etl_action' });
          setIsExecutingJob(false);
        }
      }, index * 400);
    });
  };

  const handleUploadDataset = () => {
    if (isExecutingJob) return;
    setIsExecutingJob(true);
    message.loading({ content: 'Mock uploading dataset partitions to AWS S3...', key: 'upload_action' });

    const steps = [
      { text: '[root@etl-worker] aws s3 cp /tmp/batch-2026-07.parquet s3://dataflow-hub-bucket/raw/', type: 'cmd' },
      { text: 'Initializing S3 Multipart Upload stream...', type: 'info' },
      { text: 'Uploading dataset partitions... [File size: 24.8 MB]', type: 'cyan' },
      { text: 'S3 Upload completed. Checksum verification MD5: OK.', type: 'success' }
    ];

    steps.forEach((step, index) => {
      setTimeout(() => {
        setTerminalLogs(prev => [...prev, step as TerminalLine]);
        if (index === steps.length - 1) {
          setStats(prev => ({
            ...prev,
            filesProcessed: prev.filesProcessed + 1
          }));

          const now = new Date();
          const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
          setActivities(prev => [
            { id: String(Date.now()), time: timeStr, text: 'Dataset uploaded', status: 'info' },
            ...prev
          ]);

          notification.info({
            message: 'S3 Object Uploaded',
            description: 'Partition batch-2026-07.parquet successfully written to s3://dataflow-hub-bucket/raw/',
            placement: 'topRight'
          });
          message.success({ content: 'Upload completed!', key: 'upload_action' });
          setIsExecutingJob(false);
        }
      }, index * 400);
    });
  };

  const handleRestartWorker = () => {
    if (isExecutingJob) return;
    setIsExecutingJob(true);
    message.loading({ content: 'Restarting Spark Worker containers...', key: 'restart_action' });
    
    // Set docker status warning
    setMonitors(prev => prev.map(m => m.key === 'docker' ? { ...m, status: 'warning', value: '4/5 active' } : m));

    const steps = [
      { text: '[root@etl-worker] docker restart spark-worker-01 spark-worker-02', type: 'cmd' },
      { text: 'Sending SIGTERM to active spark container processes...', type: 'info' },
      { text: 'Stopping container executors... [Instance PIDs 19402, 19415]', type: 'cyan' },
      { text: 'Docker worker nodes restarted successfully. Status: ONLINE.', type: 'success' }
    ];

    steps.forEach((step, index) => {
      setTimeout(() => {
        setTerminalLogs(prev => [...prev, step as TerminalLine]);
        if (index === steps.length - 1) {
          setMonitors(prev => prev.map(m => m.key === 'docker' ? { ...m, status: 'healthy', value: '5/5 running' } : m));

          const now = new Date();
          const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
          setActivities(prev => [
            { id: String(Date.now()), time: timeStr, text: 'Worker restarted', status: 'warning' },
            ...prev
          ]);

          notification.success({
            message: 'Worker Restart Completed',
            description: 'Spark container executor nodes restarted successfully on EC2 cluster instances.',
            placement: 'topRight'
          });
          message.success({ content: 'Workers restarted successfully!', key: 'restart_action' });
          setIsExecutingJob(false);
        }
      }, index * 500);
    });
  };

  const handleSyncData = () => {
    if (isExecutingJob) return;
    setIsExecutingJob(true);
    message.loading({ content: 'Synchronizing RDS replica configurations...', key: 'sync_action' });

    const steps = [
      { text: '[root@etl-worker] pg_dump -h rds-master -U postgres | psql -h rds-replica', type: 'cmd' },
      { text: 'Checking master DB connection pool availability...', type: 'info' },
      { text: 'Syncing RDS replicas... [Delta stream replication lag: 0.1ms]', type: 'cyan' },
      { text: 'Backup Database success. Master/Replica synced successfully.', type: 'success' }
    ];

    steps.forEach((step, index) => {
      setTimeout(() => {
        setTerminalLogs(prev => [...prev, step as TerminalLine]);
        if (index === steps.length - 1) {
          const now = new Date();
          const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
          setActivities(prev => [
            { id: String(Date.now()), time: timeStr, text: 'Backup Database success', status: 'success' },
            ...prev
          ]);

          notification.success({
            message: 'RDS DB Repositories Synced',
            description: 'Primary master and read replicas synchronized successfully. Replication lag minimized.',
            placement: 'topRight'
          });
          message.success({ content: 'Sync completed!', key: 'sync_action' });
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

  return (
    <PageContainer title={false}>
      
      {/* 1. ETL Jobs Status Banner Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: '20px' }}>
        <Col xs={12} sm={12} md={6}>
          <Card bordered={false} className="stat-card" style={{ borderLeft: '4px solid #1890ff', backgroundColor: '#191919' }}>
            <Statistic
              title={<span style={{ color: '#8c8c8c', fontSize: '13px' }}>Running Pipelines</span>}
              value={stats.running}
              valueStyle={{ color: '#1890ff', fontSize: '28px', fontWeight: 'bold' }}
              prefix={<SyncOutlined spin style={{ marginRight: 8, fontSize: '20px' }} />}
            />
            <div style={{ marginTop: 4, color: '#8c8c8c', fontSize: '11px' }}>
              Active Spark executor sessions
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card bordered={false} className="stat-card" style={{ borderLeft: '4px solid #faad14', backgroundColor: '#191919' }}>
            <Statistic
              title={<span style={{ color: '#8c8c8c', fontSize: '13px' }}>Queued Jobs</span>}
              value={stats.queued}
              valueStyle={{ color: '#faad14', fontSize: '28px', fontWeight: 'bold' }}
              prefix={<ClockCircleOutlined style={{ marginRight: 8, fontSize: '20px' }} />}
            />
            <div style={{ marginTop: 4, color: '#8c8c8c', fontSize: '11px' }}>
              Waiting in AWS SQS queue
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card bordered={false} className="stat-card" style={{ borderLeft: '4px solid #52c41a', backgroundColor: '#191919' }}>
            <Statistic
              title={<span style={{ color: '#8c8c8c', fontSize: '13px' }}>Completed Jobs</span>}
              value={stats.completed}
              valueStyle={{ color: '#52c41a', fontSize: '28px', fontWeight: 'bold' }}
              prefix={<CheckCircleOutlined style={{ marginRight: 8, fontSize: '20px' }} />}
            />
            <div style={{ marginTop: 4, color: '#8c8c8c', fontSize: '11px' }}>
              Processed successfully today
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card bordered={false} className="stat-card" style={{ borderLeft: '4px solid #ff4d4f', backgroundColor: '#191919' }}>
            <Statistic
              title={<span style={{ color: '#8c8c8c', fontSize: '13px' }}>Failed Pipelines</span>}
              value={stats.failed}
              valueStyle={{ color: '#ff4d4f', fontSize: '28px', fontWeight: 'bold' }}
              prefix={<BugOutlined style={{ marginRight: 8, fontSize: '20px' }} />}
            />
            <div style={{ marginTop: 4, color: '#8c8c8c', fontSize: '11px' }}>
              Requires developer check
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
                onClick={handleRunETL}
                disabled={isExecutingJob}
                style={{ height: '40px', borderRadius: '6px', fontWeight: 600 }}
              >
                Run ETL Pipeline Job
              </Button>
              
              <Button 
                block 
                icon={<CloudUploadOutlined />} 
                onClick={handleUploadDataset}
                disabled={isExecutingJob}
                style={{ height: '40px', borderRadius: '6px', backgroundColor: 'rgba(255, 87, 34, 0.05)', color: '#ff7a45', border: '1px solid #ff7a45' }}
              >
                Upload Raw Dataset
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
                    onClick={handleSyncData}
                    disabled={isExecutingJob}
                    style={{ height: '36px', fontSize: '12px' }}
                  >
                    Sync Databases
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
                Open Terminal Console Log <RightOutlined style={{ fontSize: '10px', marginLeft: 4 }} />
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
                <span style={{ color: '#fff', fontSize: '16px', fontWeight: 600 }}>Operations Console Logs (etl-worker-01)</span>
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
                <span>[root@etl-worker] # </span>
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
                <span style={{ color: '#fff', fontSize: '16px', fontWeight: 600 }}>Datadog Service Monitors</span>
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
          <Card title={<span style={{ color: '#fff', fontSize: '16px', fontWeight: 600 }}>Cluster Activity Feed</span>} bordered={false}>
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
