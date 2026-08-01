import React, { useState, useEffect } from 'react';
import { 
  Card, Table, Tag, Button, Space, Modal, Form, Input, Select, 
  message, Popconfirm, Drawer, Tooltip, Badge, Typography, Divider,
  Checkbox, Row, Col
} from 'antd';
import { 
  CloudOutlined, PlusOutlined, SyncOutlined, HistoryOutlined, 
  EditOutlined, DeleteOutlined, CheckCircleOutlined, CloseCircleOutlined,
  ExclamationCircleOutlined, InfoCircleOutlined, KeyOutlined, GlobalOutlined,
  CopyOutlined, EyeOutlined
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { request } from '@umijs/max';

const { Option } = Select;
const { Text } = Typography;

interface CloudAccountRegion {
  id: string;
  region: string;
  isEnabled: boolean;
  lastSyncedAt: string | null;
}

interface CloudAccount {
  id: string;
  name: string;
  provider: 'AWS';
  providerAccountId: string;
  roleArn: string;
  status: 'PENDING' | 'CONNECTED' | 'ERROR' | 'DISABLED';
  lastCheckedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  hasExternalId: boolean;
  regions: CloudAccountRegion[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface ConnectionCheck {
  id: string;
  success: boolean;
  assumedRoleArn: string | null;
  callerAccountId: string | null;
  callerArn: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  durationMs: number;
  requestedBy: string;
  createdAt: string;
}

const CloudAccounts: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<CloudAccount[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<CloudAccount | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  
  // Connection History State
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyAccount, setHistoryAccount] = useState<CloudAccount | null>(null);
  const [historyData, setHistoryData] = useState<ConnectionCheck[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [form] = Form.useForm();
  const [userRole] = useState(() => localStorage.getItem('dataflow_user_role') || 'viewer');

  const [backendInfo, setBackendInfo] = useState<{ accountId: string; arn: string }>({
    accountId: '123456789012',
    arn: 'arn:aws:iam::123456789012:user/cloudops-backend'
  });

  const watchedExternalId = Form.useWatch('externalId', form);
  const watchedProviderAccountId = Form.useWatch('providerAccountId', form);

  const generateExternalId = () => {
    const chars = '0123456789abcdef';
    let result = 'co_';
    for (let i = 0; i < 15; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  };

  // UI Redesign States
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<CloudAccount | null>(null);
  const [resourcesMap, setResourcesMap] = useState<Record<string, any>>({});
  const [loadingResources, setLoadingResources] = useState<Record<string, boolean>>({});
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [activeSyncJobs, setActiveSyncJobs] = useState<Record<string, {
    jobId: string;
    status: string;
    progress: number;
    error?: string | null;
  }>>({});

  const pollTimers = React.useRef<Record<string, NodeJS.Timeout>>({});

  const jobErrorMessage = (resultSummary: any, status?: string): string | null => {
    if (!resultSummary && status !== 'FAILED') return null;
    return (
      resultSummary?.lastError ||
      resultSummary?.errorMessage ||
      resultSummary?.error ||
      (status === 'FAILED' ? 'Sync job failed' : null)
    );
  };

  const startPollJob = (accountId: string, jobId: string) => {
    if (pollTimers.current[accountId]) {
      clearInterval(pollTimers.current[accountId]);
    }

    const pollOnce = async () => {
      try {
        const jobRes = await request(`/api/v1/jobs/${jobId}`);
        const job = jobRes?.data ?? jobRes;
        const { status, progress, resultSummary } = job;

        setActiveSyncJobs(prev => ({
          ...prev,
          [accountId]: {
            jobId,
            status,
            progress: progress || 0,
            error: jobErrorMessage(resultSummary, status),
          }
        }));

        if (status === 'SUCCEEDED' || status === 'FAILED' || status === 'CANCELLED' || status === 'TIMED_OUT') {
          clearInterval(pollTimers.current[accountId]);
          delete pollTimers.current[accountId];

          if (status === 'SUCCEEDED') {
            message.success('Đồng bộ tài nguyên thành công.');
          } else {
            const errMsg = jobErrorMessage(resultSummary, status) || 'Lỗi không xác định';
            message.error(`Đồng bộ tài nguyên thất bại: ${errMsg}`);
          }

          // Refresh resource summary
          try {
            const res = await request(`/api/v1/cloud-accounts/${accountId}/resource-summary`);
            const data = res.data || res;
            if (data && data.resources) {
              setResourcesMap(prev => ({ ...prev, [accountId]: data.resources }));
            }
          } catch (e) {
            // ignore
          }
          fetchAccounts();
        }
      } catch (error) {
        console.error('Error polling job:', error);
      }
    };

    // First tick immediately, then every 1.5s
    void pollOnce();
    pollTimers.current[accountId] = setInterval(pollOnce, 1500);
  };

  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const now = new Date();
    const checked = new Date(dateString);
    const diffMs = now.getTime() - checked.getTime();
    if (diffMs < 0) return 'Just now';
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return checked.toLocaleDateString();
  };

  const maskAccountId = (val: string) => {
    if (!val || val.length !== 12) return val;
    return `${val.slice(0, 4)}****${val.slice(8)}`;
  };

  const fetchResourcesForAccounts = async (accountsList: CloudAccount[]) => {
    accountsList.forEach(async (acc) => {
      if (acc.status === 'CONNECTED') {
        setLoadingResources(prev => ({ ...prev, [acc.id]: true }));
        try {
          const res = await request(`/api/v1/cloud-accounts/${acc.id}/resource-summary`);
          const data = res.data || res;
          if (data && data.resources) {
            setResourcesMap(prev => ({ ...prev, [acc.id]: data.resources }));
          }
        } catch (error) {
          // ignore
        } finally {
          setLoadingResources(prev => ({ ...prev, [acc.id]: false }));
        }
      }
    });
  };

  const handleSync = async (id: string) => {
    setSyncingId(id);
    const hide = message.loading('Đang gửi yêu cầu đồng bộ tài nguyên AWS...', 0);
    try {
      const res = await request(`/api/v1/cloud-accounts/${id}/resources/sync`, {
        method: 'POST',
      });
      const data = res.data || res;
      if (data && data.jobId) {
        message.success(`Yêu cầu đồng bộ đã được chấp nhận. Job ID: ${data.jobId}`);
        setActiveSyncJobs(prev => ({
          ...prev,
          [id]: {
            jobId: data.jobId,
            status: 'PENDING',
            progress: 0,
          }
        }));
        startPollJob(id, data.jobId);
      } else {
        message.error('Không nhận được thông tin Job từ hệ thống.');
      }
    } catch (error: any) {
      message.error(error.response?.data?.message || 'Đồng bộ tài nguyên thất bại.');
    } finally {
      hide();
      setSyncingId(null);
    }
  };

  const fetchBackendInfo = async () => {
    try {
      const res = await request('/api/v1/cloud-accounts/backend-info', {
        method: 'GET',
      });
      const data = res.data || res;
      if (data && data.accountId) {
        setBackendInfo(data);
      }
    } catch (error) {
      console.error('Failed to fetch backend info:', error);
    }
  };

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await request('/api/v1/cloud-accounts', {
        method: 'GET',
      });
      const list = res.data || [];
      setAccounts(list);
      fetchResourcesForAccounts(list);
    } catch (error: any) {
      message.error(error.response?.data?.message || 'Không thể tải danh sách tài khoản cloud.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
    fetchBackendInfo();
    return () => {
      Object.values(pollTimers.current).forEach(clearInterval);
    };
  }, []);

  const handleOpenDrawer = (account?: CloudAccount) => {
    if (userRole !== 'admin' && userRole !== 'operator') {
      message.error('Bạn không có quyền thực hiện thao tác này.');
      return;
    }
    if (account) {
      setEditingAccount(account);
      form.setFieldsValue({
        name: account.name,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        roleArn: account.roleArn,
        externalId: '', // Do not populate externalId for security
        regions: account.regions.map(r => r.region),
      });
    } else {
      setEditingAccount(null);
      form.resetFields();
      form.setFieldsValue({
        provider: 'AWS',
        regions: ['ap-southeast-1'],
        externalId: generateExternalId(),
      });
    }
    setDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    form.resetFields();
    setEditingAccount(null);
  };

  const handleSubmit = async (values: any) => {
    try {
      if (editingAccount) {
        // Update
        const payload: any = {
          name: values.name,
          roleArn: values.roleArn,
          regions: values.regions,
        };
        if (values.externalId) {
          payload.externalId = values.externalId;
        }
        await request(`/api/v1/cloud-accounts/${editingAccount.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          data: payload,
        });
        message.success('Cập nhật tài khoản cloud thành công.');
      } else {
        // Create
        await request('/api/v1/cloud-accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          data: {
            name: values.name,
            provider: values.provider,
            providerAccountId: values.providerAccountId,
            roleArn: values.roleArn,
            externalId: values.externalId || undefined,
            regions: values.regions,
          },
        });
        message.success('Tạo tài khoản cloud thành công.');
      }
      handleCloseDrawer();
      fetchAccounts();
    } catch (error: any) {
      message.error(error.response?.data?.message || 'Thao tác thất bại.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await request(`/api/v1/cloud-accounts/${id}`, {
        method: 'DELETE',
      });
      message.success('Đã xóa tài khoản cloud.');
      fetchAccounts();
    } catch (error: any) {
      message.error(error.response?.data?.message || 'Xóa thất bại.');
    }
  };

  const handleTestConnection = async (id: string) => {
    setTestingId(id);
    const hide = message.loading('Đang kiểm tra kết nối tới AWS...', 0);
    try {
      const res = await request(`/api/v1/cloud-accounts/${id}/test-connection`, {
        method: 'POST',
      });
      const data = res.data || res;
      if (data.success) {
        message.success(`Kết nối thành công! (Thời gian phản hồi: ${data.durationMs}ms)`);
      } else {
        message.error(`Kết nối thất bại: ${data.errorMessage || 'Lỗi không xác định'}`);
      }
      fetchAccounts();
    } catch (error: any) {
      message.error(error.response?.data?.message || 'Kiểm tra kết nối thất bại.');
    } finally {
      hide();
      setTestingId(null);
    }
  };

  const handleViewHistory = async (account: CloudAccount) => {
    setHistoryAccount(account);
    setHistoryModalOpen(true);
    setHistoryLoading(true);
    try {
      const res = await request(`/api/v1/cloud-accounts/${account.id}/connection-history`, {
        method: 'GET',
      });
      setHistoryData(res.data || []);
    } catch (error: any) {
      message.error(error.response?.data?.message || 'Không thể tải lịch sử kết nối.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const getStatusTag = (status: string) => {
    switch (status) {
      case 'CONNECTED':
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
            <CheckCircleOutlined style={{ marginRight: 4 }} /> CONNECTED
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
      case 'ERROR':
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
            <CloseCircleOutlined style={{ marginRight: 4 }} /> ERROR
          </Tag>
        );
      case 'DISABLED':
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
            DISABLED
          </Tag>
        );
      default:
        return <Tag style={{ borderRadius: '4px', margin: 0 }}>{status}</Tag>;
    }
  };

  const columns: any[] = [
    {
      title: 'Account Name',
      dataIndex: 'name',
      key: 'name',
      width: 220,
      render: (text: string, record: CloudAccount) => (
        <Space direction="vertical" size={0}>
          <strong style={{ color: '#fff', fontSize: '14px' }}>{text}</strong>
          <span style={{ color: '#555', fontSize: '11px' }}>ID: {record.id.slice(0, 8)}...</span>
        </Space>
      ),
    },
    {
      title: 'Provider',
      dataIndex: 'provider',
      key: 'provider',
      width: 100,
      render: (text: string) => <Tag color="orange" style={{ fontWeight: 600 }}>{text}</Tag>,
    },
    {
      title: 'AWS Account ID',
      dataIndex: 'providerAccountId',
      key: 'providerAccountId',
      width: 160,
      render: (text: string) => (
        <code style={{ color: '#ff7a45', fontFamily: 'monospace', fontSize: '13px' }}>
          {maskAccountId(text)}
        </code>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: string) => getStatusTag(status),
    },
    {
      title: 'Regions',
      dataIndex: 'regions',
      key: 'regions',
      width: 150,
      render: (regions: CloudAccountRegion[]) => (
        <Space size={[0, 4]} wrap>
          {regions.filter(r => r.isEnabled).map(r => (
            <Tag key={r.id} color="cyan" style={{ fontSize: '10px', borderRadius: '4px' }}>
              {r.region}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Resources',
      key: 'resources',
      width: 160,
      render: (_: any, record: CloudAccount) => {
        if (record.status !== 'CONNECTED') {
          return <span style={{ color: '#555' }}>-</span>;
        }
        
        const activeSync = activeSyncJobs[record.id];
        const isJobRunning = activeSync && ['PENDING', 'QUEUED', 'RUNNING', 'RETRYING'].includes(activeSync.status);
        
        if (isJobRunning) {
          return (
            <div style={{ width: '130px' }}>
              <div style={{ fontSize: '11px', color: '#ff7a45', marginBottom: 2 }}>
                <SyncOutlined spin style={{ marginRight: 4 }} /> 
                {activeSync.status}... ({activeSync.progress}%)
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
                  width: `${activeSync.progress}%`,
                  backgroundColor: '#ff7a45',
                  transition: 'width 0.3s ease'
                }} />
              </div>
            </div>
          );
        }

        if (loadingResources[record.id]) {
          return <span style={{ color: '#ff7a45', fontSize: '12px' }}><SyncOutlined spin /> loading...</span>;
        }
        const data = resourcesMap[record.id];
        if (!data) {
          return <span style={{ color: '#555', fontSize: '12px' }}>no data</span>;
        }
        return (
          <Space size={8}>
            <Tag color="blue" style={{ fontSize: '11px', borderRadius: '4px' }}>
              EC2: {data.ec2?.total || 0}
            </Tag>
            <Tag color="purple" style={{ fontSize: '11px', borderRadius: '4px' }}>
              VPC: {data.vpcs || 0}
            </Tag>
          </Space>
        );
      },
    },
    {
      title: 'Last Sync',
      dataIndex: 'lastCheckedAt',
      key: 'lastCheckedAt',
      width: 120,
      render: (t: string | null) => (
        <span style={{ color: '#8c8c8c', fontSize: '13px' }}>
          {formatRelativeTime(t)}
        </span>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 130,
      render: (_: any, record: CloudAccount) => {
        const isWritable = userRole === 'admin' || userRole === 'operator';
        const activeSync = activeSyncJobs[record.id];
        const isJobRunning = activeSync && ['PENDING', 'QUEUED', 'RUNNING', 'RETRYING'].includes(activeSync.status);
        return (
          <Space size="small">
            <Tooltip title="View details">
              <Button 
                size="small" 
                icon={<EyeOutlined />}
                onClick={() => {
                  setSelectedAccount(record);
                  setDetailsModalOpen(true);
                }}
              />
            </Tooltip>
            <Tooltip title="Edit account">
              <Button 
                size="small" 
                icon={<EditOutlined />}
                onClick={() => handleOpenDrawer(record)}
                disabled={!isWritable || isJobRunning}
              />
            </Tooltip>
            <Popconfirm
              title="Bạn có chắc chắn muốn xóa tài khoản cloud này?"
              onConfirm={() => handleDelete(record.id)}
              okText="Xóa"
              cancelText="Hủy"
              disabled={!isWritable}
            >
              <Tooltip title="Delete account">
                <Button 
                  size="small" 
                  danger 
                  icon={<DeleteOutlined />}
                  disabled={!isWritable}
                />
              </Tooltip>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  const trustPolicyJson = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: {
          AWS: backendInfo.arn || 'arn:aws:iam::123456789012:user/cloudops-backend',
        },
        Action: 'sts:AssumeRole',
        Condition: {
          StringEquals: {
            'sts:ExternalId': editingAccount 
              ? (editingAccount.hasExternalId ? '<your-configured-external-id>' : '')
              : (watchedExternalId || ''),
          },
        },
      },
    ],
  };

  const regionOptions = [
    { label: 'ap-southeast-1 (Singapore)', value: 'ap-southeast-1' },
    { label: 'us-east-1 (N. Virginia)', value: 'us-east-1' },
    { label: 'us-west-2 (Oregon)', value: 'us-west-2' },
    { label: 'eu-central-1 (Frankfurt)', value: 'eu-central-1' },
    { label: 'ap-northeast-1 (Tokyo)', value: 'ap-northeast-1' },
  ];

  return (
    <PageContainer
      title={<span style={{ color: '#fff', fontSize: '24px', fontWeight: 600 }}>Cloud Accounts</span>}
      subTitle={<span style={{ color: '#8c8c8c' }}>Manage cloud provider accounts, IAM roles, and cross-account access permissions</span>}
      extra={
        <Button 
          type="primary" 
          icon={<PlusOutlined />} 
          onClick={() => handleOpenDrawer()}
          disabled={userRole !== 'admin' && userRole !== 'operator'}
        >
          Add Cloud Account
        </Button>
      }
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .drawer-disabled-field .ant-input-disabled,
        .drawer-disabled-field.ant-input-disabled,
        .drawer-disabled-field .ant-select-disabled .ant-select-selection-item,
        .drawer-disabled-field.ant-select-disabled .ant-select-selection-item {
          color: #ffffff !important;
          -webkit-text-fill-color: #ffffff !important;
          font-weight: 400 !important;
          opacity: 0.85 !important;
        }
      ` }} />
      <Card bordered={false}>
        <Table 
          columns={columns} 
          dataSource={accounts} 
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          style={{ backgroundColor: '#1c1c1c' }}
          scroll={{ x: 1180 }}
        />
      </Card>

      {/* Create/Edit Drawer */}
      <Drawer
        title={
          <span style={{ color: '#fff', fontSize: '18px', fontWeight: 600 }}>
            {editingAccount ? 'Edit Cloud Account' : 'Add Cloud Account'}
          </span>
        }
        width={560}
        onClose={handleCloseDrawer}
        open={drawerOpen}
        bodyStyle={{ paddingBottom: 80 }}
        headerStyle={{ borderBottom: '1px solid #262626' }}
        footerStyle={{ borderTop: '1px solid #262626' }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              {editingAccount ? (
                <Button 
                  type="primary" 
                  ghost
                  icon={<SyncOutlined spin={testingId === editingAccount.id} />}
                  onClick={() => handleTestConnection(editingAccount.id)}
                  disabled={testingId !== null}
                  style={{
                    backgroundColor: 'transparent',
                    color: testingId !== null ? 'rgba(255,255,255,0.25)' : '#ff7a45',
                    borderColor: testingId !== null ? '#303030' : '#ff7a45',
                    borderRadius: '6px'
                  }}
                >
                  Test Connection
                </Button>
              ) : (
                <Tooltip title="Vui lòng tạo (Connect) tài khoản trước khi kiểm tra kết nối">
                  <Button 
                    disabled
                    style={{
                      backgroundColor: '#1f1f1f',
                      color: 'rgba(255, 255, 255, 0.25)',
                      borderColor: '#303030',
                      borderRadius: '6px'
                    }}
                  >
                    Test Connection
                  </Button>
                </Tooltip>
              )}
            </div>
            <Space>
              <Button 
                onClick={handleCloseDrawer} 
                style={{ 
                  backgroundColor: 'transparent', 
                  color: '#bfbfbf', 
                  border: '1px solid #434343',
                  borderRadius: '6px'
                }}
              >
                Cancel
              </Button>
              <Button 
                onClick={() => form.submit()} 
                type="primary"
                style={{
                  backgroundColor: '#ff7a45',
                  borderColor: '#ff7a45',
                  color: '#fff',
                  borderRadius: '6px'
                }}
              >
                {editingAccount ? 'Save' : 'Connect'}
              </Button>
            </Space>
          </div>
        }
      >
        <Form 
          form={form} 
          layout="vertical" 
          onFinish={handleSubmit}
          initialValues={{ provider: 'AWS', regions: ['ap-southeast-1'] }}
        >
          <Form.Item
            name="name"
            label={<span style={{ color: '#d9d9d9', fontWeight: 500 }}>Cloud Account Name</span>}
            rules={[{ required: true, message: 'Vui lòng nhập tên tài khoản!' }]}
          >
            <Input 
              placeholder="E.g., Production AWS Account" 
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', color: '#ffffff', borderColor: '#303030' }} 
            />
          </Form.Item>

          <Form.Item
            name="provider"
            label={<span style={{ color: '#d9d9d9', fontWeight: 500 }}>Cloud Provider</span>}
            rules={[{ required: true }]}
          >
            <Select 
              disabled 
              className="drawer-disabled-field"
              style={{ width: '100%' }}
              dropdownStyle={{ backgroundColor: '#1c1c1c' }}
            >
              <Option value="AWS">Amazon Web Services (AWS)</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="providerAccountId"
            label={<span style={{ color: '#d9d9d9', fontWeight: 500 }}>AWS Account ID (12 digits)</span>}
            rules={[
              { required: true, message: 'Vui lòng nhập AWS Account ID!' },
              { pattern: /^\d{12}$/, message: 'AWS Account ID phải gồm đúng 12 chữ số!' }
            ]}
          >
            <Input 
              placeholder="E.g., 123456789012" 
              disabled={!!editingAccount} 
              className={editingAccount ? 'drawer-disabled-field' : ''}
              style={{ 
                backgroundColor: editingAccount ? 'rgba(255, 255, 255, 0.015)' : 'rgba(255, 255, 255, 0.03)', 
                color: '#ffffff', 
                borderColor: '#303030' 
              }} 
            />
          </Form.Item>

          <Form.Item
            name="roleArn"
            label={<span style={{ color: '#d9d9d9', fontWeight: 500 }}>IAM Role ARN</span>}
            rules={[
              { required: true, message: 'Vui lòng nhập IAM Role ARN!' },
              { pattern: /^arn:aws:iam::\d{12}:role\/[\w+=,.@-]+$/, message: 'Định dạng Role ARN không hợp lệ!' }
            ]}
          >
            <Input 
              placeholder="arn:aws:iam::123456789012:role/CloudOpsReadOnly" 
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', color: '#ffffff', borderColor: '#303030' }} 
            />
          </Form.Item>

          <Form.Item
            name="externalId"
            label={
              <Space>
                <span style={{ color: '#d9d9d9', fontWeight: 500 }}>External ID</span>
                <Tooltip title="External ID được tự động sinh bởi CloudOps để đảm bảo bảo mật cho cơ chế cross-account AssumeRole.">
                  <InfoCircleOutlined style={{ color: '#8c8c8c' }} />
                </Tooltip>
              </Space>
            }
          >
            <Input 
              disabled 
              className="drawer-disabled-field"
              style={{ 
                color: '#ffffff', 
                fontWeight: 400, 
                fontFamily: 'monospace',
                backgroundColor: 'rgba(255, 255, 255, 0.015)',
                borderColor: '#303030'
              }}
              addonAfter={
                !editingAccount && (
                  <Button 
                    type="text" 
                    size="small" 
                    icon={<CopyOutlined />} 
                    style={{ margin: '-4px -11px', color: '#ff7a45' }}
                    onClick={() => {
                      const val = form.getFieldValue('externalId');
                      if (val) {
                        navigator.clipboard.writeText(val);
                        message.success('Đã sao chép External ID');
                      }
                    }} 
                  >
                    Copy
                  </Button>
                )
              }
              placeholder={editingAccount ? 'Already Configured (Không thể sửa đổi)' : 'Auto-generating...'} 
            />
          </Form.Item>

          <Form.Item
            name="regions"
            label={<span style={{ color: '#d9d9d9', fontWeight: 500 }}>Monitored Regions</span>}
            rules={[{ required: true, message: 'Chọn ít nhất một region!' }]}
          >
            <Checkbox.Group style={{ width: '100%' }}>
              <Row gutter={[16, 12]}>
                {regionOptions.map(opt => (
                  <Col span={12} key={opt.value}>
                    <Checkbox value={opt.value} style={{ color: '#bfbfbf' }}>{opt.label}</Checkbox>
                  </Col>
                ))}
              </Row>
            </Checkbox.Group>
          </Form.Item>
        </Form>

        <Divider style={{ borderColor: '#262626', margin: '24px 0' }} />

        <div style={{ color: '#fff', fontWeight: 600, fontSize: '14px', marginBottom: 16 }}>Setup Instructions</div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <div style={{ color: '#fff', fontSize: '13px', fontWeight: 600, marginBottom: 4 }}>
              ① Create IAM Role
            </div>
            <div style={{ color: '#8c8c8c', fontSize: '12px', lineHeight: '1.4' }}>
              Tạo một IAM Role (ví dụ: <code style={{ color: '#ff7a45' }}>CloudOpsAccessRole</code>) trong AWS Account khách của bạn.
            </div>
          </div>

          <div>
            <div style={{ color: '#fff', fontSize: '13px', fontWeight: 600, marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>② Copy Trust Policy</span>
              <Button 
                type="primary" 
                size="small" 
                icon={<CopyOutlined />}
                style={{ 
                  padding: '0 8px', 
                  height: '24px', 
                  fontSize: '11px', 
                  backgroundColor: '#ff7a45', 
                  borderColor: '#ff7a45', 
                  color: '#ffffff' 
                }}
                onClick={() => {
                  const policy = JSON.stringify(trustPolicyJson, null, 2);
                  navigator.clipboard.writeText(policy);
                  message.success('Đã sao chép Trust Policy JSON!');
                }}
              >
                Copy Policy
              </Button>
            </div>
            <div style={{ color: '#8c8c8c', fontSize: '12px', lineHeight: '1.4', marginBottom: 8 }}>
              Sao chép chính sách quan hệ tin cậy bên dưới làm Trust Policy cho Role trên AWS:
            </div>
            <pre style={{ 
              backgroundColor: '#111', 
              padding: '12px', 
              borderRadius: '6px', 
              border: '1px solid #262626',
              fontSize: '11px',
              fontFamily: 'monospace',
              color: '#d4d4d4',
              maxHeight: '180px',
              overflowY: 'auto',
              margin: 0
            }}>
              {JSON.stringify(trustPolicyJson, null, 2)}
            </pre>
          </div>

          <div>
            <div style={{ color: '#fff', fontSize: '13px', fontWeight: 600, marginBottom: 4 }}>
              ③ Paste into AWS
            </div>
            <div style={{ color: '#8c8c8c', fontSize: '12px', lineHeight: '1.4' }}>
              Dán JSON chính sách trên vào phần <strong>Trust Relationship (Chính sách tin cậy)</strong> của IAM Role vừa tạo trên AWS Console.
            </div>
          </div>

          <div>
            <div style={{ color: '#fff', fontSize: '13px', fontWeight: 600, marginBottom: 4 }}>
              ④ Test Connection
            </div>
            <div style={{ color: '#8c8c8c', fontSize: '12px', lineHeight: '1.4' }}>
              Sau khi lưu cấu hình IAM Role trên AWS, bấm <strong>Test Connection</strong> ở góc dưới bên trái để kiểm tra kết nối. Bấm <strong>Connect</strong> để lưu tài khoản.
            </div>
          </div>
        </div>
      </Drawer>

      {/* Connection History Modal */}
      <Modal
        title={
          <Space>
            <HistoryOutlined style={{ color: '#ff5722' }} />
            <span style={{ color: '#fff' }}>Connection History: {historyAccount?.name}</span>
          </Space>
        }
        open={historyModalOpen}
        onCancel={() => setHistoryModalOpen(false)}
        footer={null}
        width={720}
        className="glass-panel"
      >
        <Table
          dataSource={historyData}
          loading={historyLoading}
          rowKey="id"
          pagination={{ pageSize: 5 }}
          style={{ backgroundColor: '#1c1c1c', marginTop: 16 }}
          columns={[
            {
              title: 'Result',
              dataIndex: 'success',
              key: 'success',
              render: (success: boolean) => success ? (
                <Tag color="green"><CheckCircleOutlined /> PASSED</Tag>
              ) : (
                <Tag color="red"><CloseCircleOutlined /> FAILED</Tag>
              ),
            },
            {
              title: 'Duration',
              dataIndex: 'durationMs',
              key: 'durationMs',
              render: (t: number) => <code style={{ color: '#ff7a45' }}>{t}ms</code>,
            },
            {
              title: 'Error Details',
              key: 'error',
              render: (_: any, record: ConnectionCheck) => {
                if (record.success) return <span style={{ color: '#555' }}>-</span>;
                return (
                  <Space direction="vertical" size={0}>
                    <Tag color="red" style={{ fontSize: '10px' }}>{record.errorCode}</Tag>
                    <span style={{ color: '#ff4d4f', fontSize: '11px' }}>{record.errorMessage}</span>
                  </Space>
                );
              }
            },
            {
              title: 'Checked At',
              dataIndex: 'createdAt',
              key: 'createdAt',
              render: (t: string) => <span style={{ color: '#8c8c8c' }}>{new Date(t).toLocaleString()}</span>,
            }
          ]}
        />
      </Modal>

      {/* View Details Modal */}
      <Modal
        title={
          <Space>
            <CloudOutlined style={{ color: '#ff7a45' }} />
            <span style={{ color: '#fff', fontSize: '16px', fontWeight: 600 }}>
              Cloud Account Details
            </span>
          </Space>
        }
        open={detailsModalOpen}
        onCancel={() => {
          setSelectedAccount(null);
          setDetailsModalOpen(false);
        }}
        width={600}
        footer={[
          <Button 
            key="history"
            icon={<HistoryOutlined />}
            onClick={() => {
              if (selectedAccount) {
                setDetailsModalOpen(false);
                handleViewHistory(selectedAccount);
              }
            }}
            style={{ backgroundColor: 'transparent', color: '#d9d9d9', border: '1px solid #434343', borderRadius: '6px' }}
          >
            History
          </Button>,
          <Button
            key="test"
            icon={<SyncOutlined spin={testingId === selectedAccount?.id} />}
            loading={testingId === selectedAccount?.id}
            onClick={() => selectedAccount && handleTestConnection(selectedAccount.id)}
            disabled={!selectedAccount || selectedAccount.status === 'DISABLED'}
            style={{ backgroundColor: 'transparent', color: '#d9d9d9', border: '1px solid #434343', borderRadius: '6px' }}
          >
            Test Connection
          </Button>,
          <Button
            key="sync"
            type="primary"
            icon={<SyncOutlined spin={syncingId === selectedAccount?.id || !!(selectedAccount && activeSyncJobs[selectedAccount.id] && ['PENDING', 'QUEUED', 'RUNNING', 'RETRYING'].includes(activeSyncJobs[selectedAccount.id].status))} />}
            loading={syncingId === selectedAccount?.id}
            onClick={() => selectedAccount && handleSync(selectedAccount.id)}
            disabled={!selectedAccount || selectedAccount.status === 'DISABLED' || !!(selectedAccount && activeSyncJobs[selectedAccount.id] && ['PENDING', 'QUEUED', 'RUNNING', 'RETRYING'].includes(activeSyncJobs[selectedAccount.id].status))}
            style={{ backgroundColor: '#ff7a45', borderColor: '#ff7a45', color: '#fff', borderRadius: '6px' }}
          >
            Sync Resources
          </Button>,
          <Button 
            key="close" 
            onClick={() => {
              setSelectedAccount(null);
              setDetailsModalOpen(false);
            }}
            style={{ backgroundColor: 'transparent', color: '#d9d9d9', border: '1px solid #434343', borderRadius: '6px' }}
          >
            Close
          </Button>
        ]}
      >
        {selectedAccount && (
          <div style={{ marginTop: 20 }}>
            <Row gutter={[16, 24]}>
              <Col span={12}>
                <div style={{ color: '#8c8c8c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Account Name</div>
                <div style={{ color: '#ffffff', fontSize: '15px', fontWeight: 650 }}>{selectedAccount.name}</div>
              </Col>
              <Col span={12}>
                <div style={{ color: '#8c8c8c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Status</div>
                <div style={{ marginTop: 2 }}>{getStatusTag(selectedAccount.status)}</div>
              </Col>

              <Col span={12}>
                <div style={{ color: '#8c8c8c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Cloud Provider</div>
                <Tag color="orange" style={{ fontWeight: 600, fontSize: '11px', borderRadius: '4px', margin: 0 }}>{selectedAccount.provider}</Tag>
              </Col>
              <Col span={12}>
                <div style={{ color: '#8c8c8c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>AWS Account ID</div>
                <code style={{ color: '#ffffff', fontSize: '13px', fontFamily: 'monospace', fontWeight: 500 }}>
                  {selectedAccount.providerAccountId}
                </code>
              </Col>

              <Col span={24}>
                <div style={{ color: '#8c8c8c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>IAM Role ARN</div>
                <div style={{
                  backgroundColor: '#141414',
                  border: '1px solid #303030',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  color: '#d9d9d9',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ wordBreak: 'break-all', marginRight: 8, userSelect: 'all' }}>{selectedAccount.roleArn}</span>
                  <Button 
                    type="text" 
                    size="small" 
                    icon={<CopyOutlined />} 
                    style={{ color: '#ff7a45', padding: 0, height: 'auto' }}
                    onClick={() => {
                      navigator.clipboard.writeText(selectedAccount.roleArn);
                      message.success('Đã sao chép IAM Role ARN');
                    }}
                  />
                </div>
              </Col>

              <Col span={24}>
                <div style={{ color: '#8c8c8c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>External ID</div>
                <div style={{
                  backgroundColor: '#141414',
                  border: '1px solid #303030',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  color: '#8c8c8c',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ fontWeight: 500 }}>
                    {selectedAccount.hasExternalId ? (
                      <span style={{ color: '#8c8c8c' }}>
                        co_               <span style={{ color: '#555', letterSpacing: '0.15em' }}>***************</span> (Encrypted)
                      </span>
                    ) : 'None'}
                  </span>
                </div>
              </Col>

              <Col span={12}>
                <div style={{ color: '#8c8c8c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Monitored Regions</div>
                <Space size={[0, 4]} wrap>
                  {selectedAccount.regions.map(r => (
                    <Tag 
                      key={r.id} 
                      style={{ 
                        fontSize: '11px', 
                        borderRadius: '4px',
                        border: '1px solid #14393f',
                        backgroundColor: 'rgba(0, 180, 216, 0.08)',
                        color: '#00b4d8',
                        margin: 0
                      }}
                    >
                      {r.region}
                    </Tag>
                  ))}
                </Space>
              </Col>
              
              <Col span={12}>
                <div style={{ color: '#8c8c8c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Resources Detected</div>
                {selectedAccount && activeSyncJobs[selectedAccount.id] && ['PENDING', 'QUEUED', 'RUNNING', 'RETRYING'].includes(activeSyncJobs[selectedAccount.id].status) ? (
                  <div style={{ fontSize: '12px', color: '#ff7a45', fontWeight: 500 }}>
                    <SyncOutlined spin style={{ marginRight: 6 }} /> Syncing ({activeSyncJobs[selectedAccount.id].progress}%)
                  </div>
                ) : (
                  <Space size={8}>
                    <Tag style={{ fontSize: '11px', borderRadius: '4px', border: '1px solid #10239e', backgroundColor: 'rgba(24, 144, 255, 0.08)', color: '#1890ff', margin: 0 }}>
                      EC2: {resourcesMap[selectedAccount.id]?.ec2?.total ?? 0}
                    </Tag>
                    <Tag style={{ fontSize: '11px', borderRadius: '4px', border: '1px solid #3f1a68', backgroundColor: 'rgba(114, 46, 209, 0.08)', color: '#722ed1', margin: 0 }}>
                      VPC: {resourcesMap[selectedAccount.id]?.vpcs ?? 0}
                    </Tag>
                  </Space>
                )}
              </Col>

              <Col span={12}>
                <div style={{ color: '#8c8c8c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Created At</div>
                <span style={{ color: '#ffffff', fontSize: '13px', fontWeight: 500 }}>
                  {new Date(selectedAccount.createdAt).toLocaleString()}
                </span>
              </Col>
              <Col span={12}>
                <div style={{ color: '#8c8c8c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Last Sync</div>
                <span style={{ color: '#ffffff', fontSize: '13px', fontWeight: 500 }}>
                  {selectedAccount.lastCheckedAt ? new Date(selectedAccount.lastCheckedAt).toLocaleString() : 'Never'}
                </span>
              </Col>
            </Row>
          </div>
        )}
      </Modal>
    </PageContainer>
  );
};

export default CloudAccounts;
