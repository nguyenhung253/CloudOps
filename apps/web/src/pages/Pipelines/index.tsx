import React, { useState, useEffect, useRef } from 'react';
import { 
  Table, Tag, Space, Button, Modal, Tabs, Timeline, 
  message, Tooltip, Popconfirm, Select, Row, Col, Typography, Card 
} from 'antd';
import { 
  SyncOutlined, StopOutlined, ReloadOutlined, 
  EyeOutlined, HistoryOutlined, FieldTimeOutlined,
  CheckCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined,
  InfoCircleOutlined, DatabaseOutlined, ClusterOutlined, UserOutlined
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { request } from '@umijs/max';
import dayjs from 'dayjs';

const { Option } = Select;
const { Text, Title: TypographyTitle } = Typography;

interface PublicJob {
  id: string;
  type: 'RESOURCE_SYNC' | 'HEALTH_CHECK';
  status: string; // PENDING, QUEUED, RUNNING, RETRYING, SUCCEEDED, FAILED, CANCELLED, TIMED_OUT
  cloudAccountId: string | null;
  resourceId: string | null;
  requestedBy: string | null;
  payload: any;
  resultSummary: any;
  priority: number;
  progress: number;
  attemptsMade: number;
  maxAttempts: number;
  queuedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface JobExecution {
  id: string;
  jobId: string;
  attemptNumber: number;
  workerName: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  errorDetails: any;
  output: any;
  createdAt: string;
}

interface JobEvent {
  id: string;
  jobId: string;
  eventType: string;
  message: string | null;
  progress: number | null;
  payload: any;
  createdAt: string;
}

const Pipelines: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);

  // Filters State
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');

  // Info modal State
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<PublicJob | null>(null);
  const [executions, setExecutions] = useState<JobExecution[]>([]);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

  const detailPollTimer = useRef<NodeJS.Timeout | null>(null);
  const [userRole] = useState(() => localStorage.getItem('dataflow_user_role') || 'viewer');

  const fetchJobs = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await request('/api/v1/jobs', {
        method: 'GET',
        params: {
          page,
          limit,
          status: statusFilter || undefined,
          type: typeFilter || undefined,
        }
      });
      // ResponseInterceptor (paginated): { success, data: Job[], meta: { total, page, ... } }
      // Fallback if nested: { data: { data, meta } }
      const items = Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res?.data?.data)
          ? res.data.data
          : Array.isArray(res)
            ? res
            : [];
      const totalCount =
        res?.meta?.total ??
        res?.data?.meta?.total ??
        items.length;
      setJobs(items);
      setTotal(totalCount);
    } catch (error: any) {
      message.error(error.response?.data?.message || 'Không thể tải danh sách Jobs.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const startPollingDetail = (jobId: string) => {
    if (detailPollTimer.current) {
      clearInterval(detailPollTimer.current);
    }
    const pollOnce = async () => {
      try {
        const [jobRes, exRes, evRes] = await Promise.all([
          request(`/api/v1/jobs/${jobId}`),
          request(`/api/v1/jobs/${jobId}/executions`),
          request(`/api/v1/jobs/${jobId}/events`),
        ]);
        const job = jobRes?.data ?? jobRes;
        const execList = Array.isArray(exRes?.data)
          ? exRes.data
          : Array.isArray(exRes)
            ? exRes
            : [];
        const eventList = Array.isArray(evRes?.data)
          ? evRes.data
          : Array.isArray(evRes)
            ? evRes
            : [];
        setSelectedJob(job);
        setExecutions(execList);
        setEvents(eventList);

        if (['SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT'].includes(job.status)) {
          if (detailPollTimer.current) {
            clearInterval(detailPollTimer.current);
            detailPollTimer.current = null;
          }
        }
      } catch (err) {
        console.error('Error polling job details:', err);
      }
    };

    void pollOnce();
    detailPollTimer.current = setInterval(pollOnce, 1500);
  };

  const handleOpenDetails = async (job: PublicJob) => {
    setSelectedJob(job);
    setDetailModalOpen(true);
    setModalLoading(true);
    try {
      const [exRes, evRes] = await Promise.all([
        request(`/api/v1/jobs/${job.id}/executions`),
        request(`/api/v1/jobs/${job.id}/events`),
      ]);
      const execList = Array.isArray(exRes?.data)
        ? exRes.data
        : Array.isArray(exRes)
          ? exRes
          : [];
      const eventList = Array.isArray(evRes?.data)
        ? evRes.data
        : Array.isArray(evRes)
          ? evRes
          : [];
      setExecutions(execList);
      setEvents(eventList);

      if (['PENDING', 'QUEUED', 'RUNNING', 'RETRYING'].includes(job.status)) {
        startPollingDetail(job.id);
      }
    } catch (err) {
      message.error('Không thể tải chi tiết Job.');
    } finally {
      setModalLoading(false);
    }
  };

  const handleCloseDetails = () => {
    setDetailModalOpen(false);
    setSelectedJob(null);
    setExecutions([]);
    setEvents([]);
    if (detailPollTimer.current) {
      clearInterval(detailPollTimer.current);
      detailPollTimer.current = null;
    }
  };

  const handleCancelJob = async (id: string) => {
    try {
      await request(`/api/v1/jobs/${id}/cancel`, {
        method: 'POST',
      });
      message.success('Đã gửi yêu cầu hủy Job thành công.');
      fetchJobs(false);
      // If modal is open for this job, refresh details
      if (selectedJob && selectedJob.id === id) {
        handleOpenDetails({ ...selectedJob, status: 'CANCELLED' });
      }
    } catch (error: any) {
      message.error(error.response?.data?.message || 'Hủy Job thất bại.');
    }
  };

  const handleRequeueJob = async (id: string) => {
    try {
      await request(`/api/v1/jobs/${id}/requeue`, {
        method: 'POST',
      });
      message.success('Đã requeue Job thành công.');
      fetchJobs(true);
      if (selectedJob && selectedJob.id === id) {
        handleOpenDetails({ ...selectedJob, status: 'QUEUED' });
      }
    } catch (error: any) {
      message.error(error.response?.data?.message || 'Requeue Job thất bại.');
    }
  };

  useEffect(() => {
    fetchJobs();
    const mainInterval = setInterval(() => {
      fetchJobs(false);
    }, 5000);

    return () => {
      clearInterval(mainInterval);
      if (detailPollTimer.current) {
        clearInterval(detailPollTimer.current);
      }
    };
  }, [page, statusFilter, typeFilter]);

  const getStatusTag = (status: string) => {
    switch (status) {
      case 'SUCCEEDED':
        return (
          <Tag 
            style={{ 
              borderRadius: '4px', 
              border: '1px solid #274916', 
              color: '#52c41a', 
              backgroundColor: 'rgba(82, 196, 26, 0.08)',
              fontWeight: 500,
              fontSize: '12px',
              margin: 0
            }}
          >
            <CheckCircleOutlined style={{ marginRight: 4 }} /> SUCCEEDED
          </Tag>
        );
      case 'FAILED':
        return (
          <Tag 
            style={{ 
              borderRadius: '4px', 
              border: '1px solid #5c2020', 
              color: '#ff4d4f', 
              backgroundColor: 'rgba(255, 77, 79, 0.08)',
              fontWeight: 500,
              fontSize: '12px',
              margin: 0
            }}
          >
            <CloseCircleOutlined style={{ marginRight: 4 }} /> FAILED
          </Tag>
        );
      case 'PENDING':
        return (
          <Tag 
            style={{ 
              borderRadius: '4px', 
              border: '1px solid #5b4618', 
              color: '#faad14', 
              backgroundColor: 'rgba(250, 173, 20, 0.08)',
              fontWeight: 500,
              fontSize: '12px',
              margin: 0
            }}
          >
            <SyncOutlined spin style={{ marginRight: 4 }} /> PENDING
          </Tag>
        );
      case 'QUEUED':
        return (
          <Tag 
            style={{ 
              borderRadius: '4px', 
              border: '1px solid #14393f', 
              color: '#00b4d8', 
              backgroundColor: 'rgba(0, 180, 216, 0.08)',
              fontWeight: 500,
              fontSize: '12px',
              margin: 0
            }}
          >
            QUEUED
          </Tag>
        );
      case 'RUNNING':
        return (
          <Tag 
            style={{ 
              borderRadius: '4px', 
              border: '1px solid #096dd9', 
              color: '#1890ff', 
              backgroundColor: 'rgba(24, 144, 255, 0.08)',
              fontWeight: 500,
              fontSize: '12px',
              margin: 0
            }}
          >
            <SyncOutlined spin style={{ marginRight: 4 }} /> RUNNING
          </Tag>
        );
      case 'RETRYING':
        return (
          <Tag 
            style={{ 
              borderRadius: '4px', 
              border: '1px solid #d4380d', 
              color: '#f5222d', 
              backgroundColor: 'rgba(245, 34, 45, 0.08)',
              fontWeight: 500,
              fontSize: '12px',
              margin: 0
            }}
          >
            <SyncOutlined spin style={{ marginRight: 4 }} /> RETRYING
          </Tag>
        );
      case 'CANCELLED':
        return (
          <Tag 
            style={{ 
              borderRadius: '4px', 
              border: '1px solid #434343', 
              color: '#8c8c8c', 
              backgroundColor: 'rgba(140, 140, 140, 0.08)',
              fontWeight: 500,
              fontSize: '12px',
              margin: 0
            }}
          >
            CANCELLED
          </Tag>
        );
      case 'TIMED_OUT':
        return (
          <Tag 
            style={{ 
              borderRadius: '4px', 
              border: '1px solid #5c2020', 
              color: '#cf1322', 
              backgroundColor: 'rgba(207, 19, 34, 0.08)',
              fontWeight: 500,
              fontSize: '12px',
              margin: 0
            }}
          >
            TIMED_OUT
          </Tag>
        );
      default:
        return <Tag style={{ borderRadius: '4px', margin: 0 }}>{status}</Tag>;
    }
  };

  const columns = [
    {
      title: 'Job ID',
      dataIndex: 'id',
      key: 'id',
      render: (text: string) => (
        <code style={{ color: '#ff7a45', fontFamily: 'monospace', fontSize: '13px' }}>
          {text.slice(0, 8)}...
        </code>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (text: string) => {
        let color = 'cyan';
        if (text === 'HEALTH_CHECK') color = 'orange';
        return <Tag color={color} style={{ fontWeight: 600, fontSize: '11px', borderRadius: '4px' }}>{text}</Tag>;
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getStatusTag(status),
    },
    {
      title: 'Progress',
      key: 'progress',
      render: (_: any, record: PublicJob) => (
        <div style={{ width: '130px' }}>
          <div style={{ fontSize: '11px', color: '#bfbfbf', marginBottom: 2 }}>
            {record.progress}%
          </div>
          <div style={{
            height: '4px',
            width: '100%',
            backgroundColor: '#303030',
            borderRadius: '2px',
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: `${record.progress}%`,
              backgroundColor: record.status === 'FAILED' ? '#ff4d4f' : record.status === 'SUCCEEDED' ? '#52c41a' : '#ff7a45',
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>
      )
    },
    {
      title: 'Attempts',
      key: 'attempts',
      render: (_: any, record: PublicJob) => (
        <span style={{ color: '#bfbfbf', fontSize: '12px' }}>
          {record.attemptsMade} / {record.maxAttempts}
        </span>
      ),
    },
    {
      title: 'Created At',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (text: string) => (
        <span style={{ color: '#8c8c8c', fontSize: '12px' }}>
          {dayjs(text).format('YYYY-MM-DD HH:mm:ss')}
        </span>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: PublicJob) => {
        const isWritable = userRole === 'admin' || userRole === 'operator';
        const isCancellable = ['PENDING', 'QUEUED', 'RUNNING', 'RETRYING'].includes(record.status);
        const isRequeuable = record.status === 'PENDING';
        return (
          <Space size="middle">
            <Button 
              size="small" 
              icon={<EyeOutlined />}
              onClick={() => handleOpenDetails(record)}
            >
              Details
            </Button>
            {isCancellable && (
              <Popconfirm
                title="Bạn có chắc chắn muốn hủy Job này?"
                onConfirm={() => handleCancelJob(record.id)}
                disabled={!isWritable}
                okText="Hủy Job"
                cancelText="Quay lại"
              >
                <Button 
                  size="small" 
                  danger 
                  icon={<StopOutlined />}
                  disabled={!isWritable}
                >
                  Cancel
                </Button>
              </Popconfirm>
            )}
            {isRequeuable && (
              <Popconfirm
                title="Bạn có chắc chắn muốn Requeue Job này?"
                onConfirm={() => handleRequeueJob(record.id)}
                disabled={!isWritable}
                okText="Requeue"
                cancelText="Quay lại"
              >
                <Button 
                  size="small" 
                  type="primary" 
                  ghost
                  icon={<ReloadOutlined />}
                  disabled={!isWritable}
                >
                  Requeue
                </Button>
              </Popconfirm>
            )}
          </Space>
        );
      }
    }
  ];

  return (
    <PageContainer
      title={<span style={{ color: '#fff', fontSize: '24px', fontWeight: 600 }}>Background Jobs</span>}
      subTitle={<span style={{ color: '#8c8c8c' }}>Monitor background operations, sync tasks, and execution logs</span>}
    >
      <Card bordered={false} style={{ marginBottom: 16 }}>
        <Space size="large" wrap>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#bfbfbf', fontSize: '13px' }}>Job Status:</span>
            <Select 
              value={statusFilter} 
              onChange={(val) => { setStatusFilter(val); setPage(1); }}
              style={{ width: 140 }}
              dropdownStyle={{ backgroundColor: '#1c1c1c' }}
            >
              <Option value="">All Statuses</Option>
              <Option value="PENDING">PENDING</Option>
              <Option value="QUEUED">QUEUED</Option>
              <Option value="RUNNING">RUNNING</Option>
              <Option value="SUCCEEDED">SUCCEEDED</Option>
              <Option value="FAILED">FAILED</Option>
              <Option value="CANCELLED">CANCELLED</Option>
              <Option value="TIMED_OUT">TIMED_OUT</Option>
            </Select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#bfbfbf', fontSize: '13px' }}>Job Type:</span>
            <Select 
              value={typeFilter} 
              onChange={(val) => { setTypeFilter(val); setPage(1); }}
              style={{ width: 160 }}
              dropdownStyle={{ backgroundColor: '#1c1c1c' }}
            >
              <Option value="">All Types</Option>
              <Option value="RESOURCE_SYNC">RESOURCE_SYNC</Option>
              <Option value="HEALTH_CHECK">HEALTH_CHECK</Option>
            </Select>
          </div>

          <Button 
            icon={<SyncOutlined spin={loading} />}
            onClick={() => fetchJobs(true)}
            style={{ backgroundColor: 'transparent', color: '#fff', border: '1px solid #434343' }}
          >
            Refresh
          </Button>
        </Space>
      </Card>

      <Card bordered={false}>
        <Table 
          columns={columns} 
          dataSource={jobs} 
          rowKey="id"
          loading={loading}
          pagination={{ 
            current: page,
            pageSize: limit,
            total,
            onChange: (p) => setPage(p),
            showSizeChanger: false
          }}
          style={{ backgroundColor: '#1c1c1c' }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      {/* Details Modal */}
      <Modal
        title={
          <Space>
            <HistoryOutlined style={{ color: '#ff7a45' }} />
            <span style={{ color: '#fff', fontSize: '16px', fontWeight: 600 }}>
              Job execution details
            </span>
          </Space>
        }
        open={detailModalOpen}
        onCancel={handleCloseDetails}
        footer={[
          selectedJob && ['PENDING', 'QUEUED', 'RUNNING', 'RETRYING'].includes(selectedJob.status) && (
            <Popconfirm
              key="cancel-modal"
              title="Bạn có chắc chắn muốn hủy Job này?"
              onConfirm={() => handleCancelJob(selectedJob.id)}
              disabled={userRole === 'viewer'}
              okText="Hủy Job"
              cancelText="Quay lại"
            >
              <Button danger icon={<StopOutlined />} disabled={userRole === 'viewer'}>
                Cancel Job
              </Button>
            </Popconfirm>
          ),
          selectedJob && selectedJob.status === 'PENDING' && (
            <Popconfirm
              key="requeue-modal"
              title="Bạn có chắc chắn muốn Requeue Job này?"
              onConfirm={() => handleRequeueJob(selectedJob.id)}
              disabled={userRole === 'viewer'}
              okText="Requeue"
              cancelText="Quay lại"
            >
              <Button type="primary" ghost icon={<ReloadOutlined />} disabled={userRole === 'viewer'}>
                Requeue Job
              </Button>
            </Popconfirm>
          ),
          <Button 
            key="close" 
            onClick={handleCloseDetails}
            style={{ backgroundColor: 'transparent', color: '#d9d9d9', border: '1px solid #434343', borderRadius: '6px' }}
          >
            Close
          </Button>
        ]}
        width={720}
        loading={modalLoading}
        className="glass-panel"
      >
        {selectedJob && (
          <div style={{ marginTop: 20 }}>
            <Tabs defaultActiveKey="overview" items={[
              {
                key: 'overview',
                label: 'Overview',
                children: (
                  <div style={{ padding: '8px 0' }}>
                    <Row gutter={[16, 24]}>
                      <Col span={12}>
                        <div style={{ color: '#8c8c8c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Job ID</div>
                        <code style={{ color: '#ffffff', fontSize: '13px', fontFamily: 'monospace' }}>{selectedJob.id}</code>
                      </Col>
                      <Col span={12}>
                        <div style={{ color: '#8c8c8c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Status</div>
                        <div style={{ marginTop: 2 }}>{getStatusTag(selectedJob.status)}</div>
                      </Col>
                      <Col span={12}>
                        <div style={{ color: '#8c8c8c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Job Type</div>
                        <Tag color={selectedJob.type === 'HEALTH_CHECK' ? 'orange' : 'cyan'} style={{ fontWeight: 600 }}>{selectedJob.type}</Tag>
                      </Col>
                      <Col span={12}>
                        <div style={{ color: '#8c8c8c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Progress</div>
                        <div style={{ width: '100%', marginTop: 2 }}>
                          <span style={{ fontSize: '11px', color: '#bfbfbf', marginRight: 8 }}>{selectedJob.progress}%</span>
                          <div style={{
                            height: '6px',
                            width: '120px',
                            display: 'inline-block',
                            backgroundColor: '#303030',
                            borderRadius: '3px',
                            overflow: 'hidden',
                            verticalAlign: 'middle'
                          }}>
                            <div style={{
                              height: '100%',
                              width: `${selectedJob.progress}%`,
                              backgroundColor: '#ff7a45',
                              transition: 'width 0.3s ease'
                            }} />
                          </div>
                        </div>
                      </Col>
                      <Col span={12}>
                        <div style={{ color: '#8c8c8c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Attempts</div>
                        <span style={{ color: '#ffffff', fontSize: '13px' }}>{selectedJob.attemptsMade} / {selectedJob.maxAttempts}</span>
                      </Col>
                      <Col span={12}>
                        <div style={{ color: '#8c8c8c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Requested By</div>
                        <span style={{ color: '#ffffff', fontSize: '13px' }}><UserOutlined style={{ marginRight: 4 }} />{selectedJob.requestedBy || 'System'}</span>
                      </Col>
                      <Col span={12}>
                        <div style={{ color: '#8c8c8c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Created At</div>
                        <span style={{ color: '#ffffff', fontSize: '13px' }}><FieldTimeOutlined style={{ marginRight: 4 }} />{selectedJob.createdAt ? dayjs(selectedJob.createdAt).format('YYYY-MM-DD HH:mm:ss') : 'Never'}</span>
                      </Col>
                      <Col span={12}>
                        <div style={{ color: '#8c8c8c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Queued At</div>
                        <span style={{ color: '#ffffff', fontSize: '13px' }}><FieldTimeOutlined style={{ marginRight: 4 }} />{selectedJob.queuedAt ? dayjs(selectedJob.queuedAt).format('YYYY-MM-DD HH:mm:ss') : 'Never'}</span>
                      </Col>
                      <Col span={12}>
                        <div style={{ color: '#8c8c8c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Started At</div>
                        <span style={{ color: '#ffffff', fontSize: '13px' }}><FieldTimeOutlined style={{ marginRight: 4 }} />{selectedJob.startedAt ? dayjs(selectedJob.startedAt).format('YYYY-MM-DD HH:mm:ss') : 'Never'}</span>
                      </Col>
                      <Col span={12}>
                        <div style={{ color: '#8c8c8c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Completed At</div>
                        <span style={{ color: '#ffffff', fontSize: '13px' }}><FieldTimeOutlined style={{ marginRight: 4 }} />{selectedJob.completedAt ? dayjs(selectedJob.completedAt).format('YYYY-MM-DD HH:mm:ss') : 'Never'}</span>
                      </Col>
                      <Col span={24}>
                        <div style={{ color: '#8c8c8c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Payload Parameters</div>
                        <pre style={{ 
                          backgroundColor: '#111', 
                          padding: '12px', 
                          borderRadius: '6px', 
                          border: '1px solid #262626',
                          fontSize: '11px',
                          fontFamily: 'monospace',
                          color: '#d4d4d4',
                          maxHeight: '130px',
                          overflowY: 'auto',
                          margin: 0
                        }}>
                          {JSON.stringify(selectedJob.payload || {}, null, 2)}
                        </pre>
                      </Col>
                      {selectedJob.resultSummary && (
                        <Col span={24}>
                          <div style={{ color: '#8c8c8c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Result Summary</div>
                          <pre style={{ 
                            backgroundColor: '#111', 
                            padding: '12px', 
                            borderRadius: '6px', 
                            border: '1px solid #2d1f1f',
                            fontSize: '11px',
                            fontFamily: 'monospace',
                            color: selectedJob.status === 'FAILED' ? '#ff4d4f' : '#d4d4d4',
                            maxHeight: '130px',
                            overflowY: 'auto',
                            margin: 0
                          }}>
                            {JSON.stringify(selectedJob.resultSummary, null, 2)}
                          </pre>
                        </Col>
                      )}
                    </Row>
                  </div>
                )
              },
              {
                key: 'executions',
                label: 'Executions Log',
                children: (
                  <Table 
                    dataSource={executions}
                    rowKey="id"
                    pagination={false}
                    size="small"
                    style={{ backgroundColor: '#1c1c1c', marginTop: 8 }}
                    columns={[
                      {
                        title: 'Attempt',
                        dataIndex: 'attemptNumber',
                        key: 'attemptNumber',
                        render: (val: number) => <strong style={{ color: '#ff7a45' }}>#{val}</strong>
                      },
                      {
                        title: 'Worker',
                        dataIndex: 'workerName',
                        key: 'workerName',
                        render: (val: string) => <code style={{ color: '#bfbfbf', fontSize: '11px' }}><ClusterOutlined style={{ marginRight: 4 }} />{val}</code>
                      },
                      {
                        title: 'Status',
                        dataIndex: 'status',
                        key: 'status',
                        render: (val: string) => getStatusTag(val)
                      },
                      {
                        title: 'Duration',
                        dataIndex: 'durationMs',
                        key: 'durationMs',
                        render: (val: number | null) => val !== null ? `${val}ms` : '-'
                      },
                      {
                        title: 'Error Message',
                        dataIndex: 'errorMessage',
                        key: 'errorMessage',
                        render: (val: string | null) => val ? (
                          <Text type="danger" style={{ fontSize: '11px' }}>{val}</Text>
                        ) : <span style={{ color: '#555' }}>-</span>
                      }
                    ]}
                  />
                )
              },
              {
                key: 'events',
                label: 'Event Timelines',
                children: (
                  <div style={{ marginTop: 16, maxHeight: '350px', overflowY: 'auto', padding: '12px 20px 8px 8px' }}>
                    {events.length === 0 ? (
                      <div style={{ color: '#555', textAlign: 'center', padding: '24px 0' }}>No events logged yet.</div>
                    ) : (
                      <Timeline>
                        {events.map((ev) => {
                          let dotIcon = <InfoCircleOutlined style={{ fontSize: '14px', color: '#1890ff' }} />;
                          if (ev.eventType.includes('SUCCESS') || ev.eventType.includes('COMPLETED')) {
                            dotIcon = <CheckCircleOutlined style={{ fontSize: '14px', color: '#52c41a' }} />;
                          } else if (ev.eventType.includes('FAILED') || ev.eventType.includes('ERROR')) {
                            dotIcon = <CloseCircleOutlined style={{ fontSize: '14px', color: '#ff4d4f' }} />;
                          } else if (ev.eventType.includes('CANCEL')) {
                            dotIcon = <ExclamationCircleOutlined style={{ fontSize: '14px', color: '#8c8c8c' }} />;
                          } else if (ev.eventType.includes('QUEUED') || ev.eventType.includes('RUNNING')) {
                            dotIcon = <SyncOutlined spin style={{ fontSize: '14px', color: '#faad14' }} />;
                          }

                          return (
                            <Timeline.Item 
                              key={ev.id} 
                              dot={dotIcon}
                            >
                              <div style={{ display: 'flex', flexDirection: 'column', paddingRight: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                                  <span style={{ color: '#fff', fontSize: '13px', fontWeight: 650 }}>{ev.eventType}</span>
                                  <span style={{ color: '#8c8c8c', fontSize: '11px', fontFamily: 'monospace' }}>{dayjs(ev.createdAt).format('HH:mm:ss.SSS')}</span>
                                </div>
                                {ev.message && <span style={{ color: '#bfbfbf', fontSize: '12px' }}>{ev.message}</span>}
                                {ev.progress !== null && <span style={{ color: '#8c8c8c', fontSize: '11px', marginTop: 2 }}>Progress: {ev.progress}%</span>}
                              </div>
                            </Timeline.Item>
                          );
                        })}
                      </Timeline>
                    )}
                  </div>
                )
              }
            ]} />
          </div>
        )}
      </Modal>
    </PageContainer>
  );
};

export default Pipelines;
