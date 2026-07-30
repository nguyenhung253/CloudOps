import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  InputNumber,
  Select,
  Switch,
  Row,
  Col,
  Space,
  Tag,
  Tabs,
  Radio,
  Modal,
  Tooltip,
  Alert,
  Popconfirm,
  message,
  Typography,
} from 'antd';
import {
  CloudOutlined,
  MailOutlined,
  BellOutlined,
  SaveOutlined,
  DatabaseOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  ReloadOutlined,
  EditOutlined,
  EyeOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  AuditOutlined,
  SettingOutlined,
  DeleteOutlined,
  ThunderboltOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { request } from '@umijs/max';
import dayjs from 'dayjs';
import 'dayjs/locale/en';

dayjs.locale('en');
const { Text, Paragraph } = Typography;

/* ------------------------------------------------------------------ */
/*  Interfaces                                                         */
/* ------------------------------------------------------------------ */

interface AwsControlPlaneData {
  configured: boolean;
  status: 'CONNECTED' | 'NOT_CONFIGURED' | 'INVALID_CREDENTIALS' | 'PERMISSION_DENIED' | 'ERROR';
  authenticationMethod: 'ACCESS_KEY' | 'IAM_ROLE';
  accountId: string | null;
  principalArn: string | null;
  identityType: string;
  accessKeyMasked: string;
  defaultRegion: string;
  roleArn: string | null;
  lastVerifiedAt: string | null;
  lastError?: string | null;
  credentialCreatedAt?: string | null;
}

const REQUIRED_POLICY_JSON = JSON.stringify(
  {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: ['sts:AssumeRole', 'sts:GetCallerIdentity'],
        Resource: 'arn:aws:iam::*:role/CloudOpsAccessRole',
      },
    ],
  },
  null,
  2,
);

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState('aws');
  const [controlPlane, setControlPlane] = useState<AwsControlPlaneData | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [policyModalOpen, setPolicyModalOpen] = useState(false);

  const [form] = Form.useForm();
  const [updateForm] = Form.useForm();
  const [userRole] = useState(() => localStorage.getItem('dataflow_user_role') || 'admin');
  const isWritable = userRole === 'admin';

  /* ---- Data Fetching ---- */

  const fetchControlPlane = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request('/api/v1/settings/aws/control-plane');
      const data = res?.data ?? res;
      setControlPlane(data);
    } catch {
      // Non-blocking
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchControlPlane();
  }, [fetchControlPlane]);

  /* ---- Actions ---- */

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const res = await request('/api/v1/settings/aws/control-plane/test', {
        method: 'POST',
      });
      const data = res?.data ?? res;
      if (data.success) {
        message.success('AWS Control Plane connection verified successfully!');
      } else {
        message.error(`Connection check failed: ${data.status}`);
      }
      fetchControlPlane();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.data?.message || 'Connection check failed';
      message.error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setTesting(false);
    }
  };

  const handleUpdateCredentials = async (values: any) => {
    setSaving(true);
    try {
      await request('/api/v1/settings/aws/control-plane', {
        method: 'PUT',
        data: values,
      });
      message.success('AWS Credentials validated and saved successfully!');
      setUpdateModalOpen(false);
      updateForm.resetFields();
      fetchControlPlane();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.data?.message || 'Failed to save credentials';
      message.error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCredentials = async () => {
    try {
      await request('/api/v1/settings/aws/control-plane', {
        method: 'DELETE',
      });
      message.success('AWS Control Plane configuration removed');
      fetchControlPlane();
    } catch {
      message.error('Failed to remove configuration');
    }
  };

  const handleGeneralSave = (values: any) => {
    message.success('General settings updated');
  };

  /* ---- Render Helpers ---- */

  const renderStatusBadge = (status?: string) => {
    switch (status) {
      case 'CONNECTED':
        return (
          <Tag color="success" style={{ borderRadius: '12px', padding: '2px 10px', fontSize: '12px', fontWeight: 600 }}>
            Connected ●
          </Tag>
        );
      case 'INVALID_CREDENTIALS':
        return (
          <Tag color="error" style={{ borderRadius: '12px', padding: '2px 10px', fontSize: '12px', fontWeight: 600 }}>
            Invalid Credentials ●
          </Tag>
        );
      case 'PERMISSION_DENIED':
        return (
          <Tag color="warning" style={{ borderRadius: '12px', padding: '2px 10px', fontSize: '12px', fontWeight: 600 }}>
            Permission Denied ●
          </Tag>
        );
      case 'ERROR':
        return (
          <Tag color="error" style={{ borderRadius: '12px', padding: '2px 10px', fontSize: '12px', fontWeight: 600 }}>
            Connection Error ●
          </Tag>
        );
      default:
        return (
          <Tag color="default" style={{ borderRadius: '12px', padding: '2px 10px', fontSize: '12px', fontWeight: 600 }}>
            Not Configured ●
          </Tag>
        );
    }
  };

  const isOldKey =
    controlPlane?.credentialCreatedAt &&
    dayjs().diff(dayjs(controlPlane.credentialCreatedAt), 'day') > 90;

  return (
    <PageContainer title={false}>
      <Tabs activeKey={activeTab} onChange={setActiveTab} style={{ color: '#8c8c8c' }}>
        {/* TAB 1: AWS CONTROL PLANE */}
        <Tabs.TabPane
          tab={
            <Space>
              <CloudOutlined style={{ color: '#e26f54' }} />
              <span>AWS Control Plane</span>
            </Space>
          }
          key="aws"
        >
          {/* Card 1: Connection Status Header */}
          <Card
            bordered={false}
            style={{ backgroundColor: '#1c1c1c', border: '1px solid #262626', borderRadius: '8px', marginBottom: 16 }}
            loading={loading}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <Space size={12}>
                  <span style={{ color: '#fff', fontSize: '18px', fontWeight: 600 }}>AWS Control Plane</span>
                  {renderStatusBadge(controlPlane?.status)}
                </Space>
                <div style={{ color: '#7a7a7a', fontSize: '12px', marginTop: 4 }}>
                  Backend credentials used to assume IAM roles in target AWS accounts
                </div>
              </div>

              <Space>
                <Button
                  icon={<ReloadOutlined spin={testing} />}
                  onClick={handleTestConnection}
                  loading={testing}
                  disabled={!isWritable || !controlPlane?.configured}
                >
                  Test Connection
                </Button>
                <Button
                  type="primary"
                  icon={<EditOutlined />}
                  onClick={() => {
                    updateForm.setFieldsValue({
                      authenticationMethod: controlPlane?.authenticationMethod || 'ACCESS_KEY',
                      defaultRegion: controlPlane?.defaultRegion || 'ap-southeast-1',
                      roleArn: controlPlane?.roleArn || '',
                    });
                    setUpdateModalOpen(true);
                  }}
                  disabled={!isWritable}
                >
                  Update Credentials
                </Button>
              </Space>
            </div>

            <Row gutter={[24, 16]}>
              <Col span={6}>
                <div style={{ color: '#8c8c8c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Account ID</div>
                <div style={{ color: '#d4d4d4', fontSize: '14px', fontWeight: 600, fontFamily: 'monospace', marginTop: 4 }}>
                  {controlPlane?.accountId || '—'}
                </div>
              </Col>
              <Col span={8}>
                <div style={{ color: '#8c8c8c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Identity ARN</div>
                <div style={{ color: '#d4d4d4', fontSize: '13px', fontWeight: 500, fontFamily: 'monospace', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {controlPlane?.principalArn || '—'}
                </div>
              </Col>
              <Col span={4}>
                <div style={{ color: '#8c8c8c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Identity Type</div>
                <div style={{ color: '#d4d4d4', fontSize: '13px', fontWeight: 500, marginTop: 4 }}>
                  {controlPlane?.identityType || '—'}
                </div>
              </Col>
              <Col span={3}>
                <div style={{ color: '#8c8c8c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Default Region</div>
                <div style={{ color: '#e26f54', fontSize: '13px', fontWeight: 600, fontFamily: 'monospace', marginTop: 4 }}>
                  {controlPlane?.defaultRegion || 'ap-southeast-1'}
                </div>
              </Col>
              <Col span={3}>
                <div style={{ color: '#8c8c8c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last Verified</div>
                <div style={{ color: '#8c8c8c', fontSize: '12px', marginTop: 4 }}>
                  {controlPlane?.lastVerifiedAt ? dayjs(controlPlane.lastVerifiedAt).locale('en').fromNow() : 'Never'}
                </div>
              </Col>
            </Row>
          </Card>

          <Row gutter={16}>
            {/* Card 2: Authentication Method */}
            <Col xs={24} lg={12}>
              <Card
                title={
                  <Space>
                    <KeyOutlined style={{ color: '#1890ff' }} />
                    <span style={{ color: '#fff' }}>Authentication Method</span>
                  </Space>
                }
                bordered={false}
                style={{ backgroundColor: '#1c1c1c', border: '1px solid #262626', borderRadius: '8px', marginBottom: 16, height: '100%' }}
              >
                <div style={{ marginBottom: 16 }}>
                  <Radio.Group value={controlPlane?.authenticationMethod || 'ACCESS_KEY'} disabled>
                    <Space direction="vertical" size={12}>
                      <Radio value="ACCESS_KEY">
                        <span style={{ color: '#d4d4d4', fontWeight: 600 }}>Access Keys (Local Dev / External VPS)</span>
                        <div style={{ color: '#7a7a7a', fontSize: '12px' }}>Uses static access key and secret key credentials</div>
                      </Radio>
                      <Radio value="IAM_ROLE">
                        <span style={{ color: '#d4d4d4', fontWeight: 600 }}>IAM Role — Recommended for Production</span>
                        <div style={{ color: '#7a7a7a', fontSize: '12px' }}>Automatic credentials provided by EC2 / ECS instance metadata</div>
                      </Radio>
                    </Space>
                  </Radio.Group>
                </div>

                <div style={{ backgroundColor: '#141414', padding: '14px', borderRadius: '6px', border: '1px solid #262626' }}>
                  {controlPlane?.authenticationMethod === 'IAM_ROLE' ? (
                    <div>
                      <div style={{ color: '#8c8c8c', fontSize: '11px' }}>ROLE ARN</div>
                      <code style={{ color: '#52c41a', fontSize: '12px' }}>{controlPlane.roleArn || 'Managed by EC2 Instance Metadata'}</code>
                      <div style={{ color: '#555', fontSize: '11px', marginTop: 6 }}>
                        Credentials automatically rotated by AWS Instance Profile. No access keys stored.
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ color: '#8c8c8c', fontSize: '11px' }}>MASKED ACCESS KEY ID</div>
                      <code style={{ color: '#e26f54', fontSize: '13px', fontFamily: 'monospace' }}>
                        {controlPlane?.accessKeyMasked || 'AKIA••••••••7H2K'}
                      </code>
                    </div>
                  )}
                </div>
              </Card>
            </Col>

            {/* Card 3: Required Permissions */}
            <Col xs={24} lg={12}>
              <Card
                title={
                  <Space>
                    <SafetyCertificateOutlined style={{ color: '#52c41a' }} />
                    <span style={{ color: '#fff' }}>Required IAM Permissions</span>
                  </Space>
                }
                extra={
                  <Button size="small" icon={<EyeOutlined />} onClick={() => setPolicyModalOpen(true)}>
                    View Policy
                  </Button>
                }
                bordered={false}
                style={{ backgroundColor: '#1c1c1c', border: '1px solid #262626', borderRadius: '8px', marginBottom: 16, height: '100%' }}
              >
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    <span style={{ color: '#d4d4d4', fontFamily: 'monospace', fontSize: '13px' }}>sts:AssumeRole</span>
                    <span style={{ color: '#7a7a7a', fontSize: '11px' }}>(Required to assume IAM roles in target accounts)</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    <span style={{ color: '#d4d4d4', fontFamily: 'monospace', fontSize: '13px' }}>sts:GetCallerIdentity</span>
                    <span style={{ color: '#7a7a7a', fontSize: '11px' }}>(Required to verify backend caller identity)</span>
                  </div>
                </Space>

                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #262626' }}>
                  <div style={{ color: '#8c8c8c', fontSize: '11px' }}>MANAGED POLICY NAME</div>
                  <div style={{ color: '#d4d4d4', fontWeight: 600, fontSize: '13px', marginTop: 2 }}>CloudOpsAssumeRolePolicy</div>
                </div>
              </Card>
            </Col>
          </Row>

          {/* Card 4: Credential Health */}
          <Card
            title={
              <Space>
                <AuditOutlined style={{ color: '#faad14' }} />
                <span style={{ color: '#fff' }}>Credential Health & Lifecycle</span>
              </Space>
            }
            bordered={false}
            style={{ backgroundColor: '#1c1c1c', border: '1px solid #262626', borderRadius: '8px', marginTop: 16 }}
          >
            {isOldKey && (
              <Alert
                message="Security Warning: Access key is older than 90 days."
                description="We recommend rotating your access key periodically to maintain compliance and security standards."
                type="warning"
                showIcon
                style={{ marginBottom: 16, backgroundColor: 'rgba(250, 173, 20, 0.08)', border: '1px solid #faad1440' }}
              />
            )}

            <Row gutter={24}>
              <Col span={6}>
                <div style={{ color: '#8c8c8c', fontSize: '11px' }}>LAST VALIDATED</div>
                <div style={{ color: '#d4d4d4', fontSize: '13px', marginTop: 2 }}>
                  {controlPlane?.lastVerifiedAt ? dayjs(controlPlane.lastVerifiedAt).format('YYYY-MM-DD HH:mm:ss') : 'Never'}
                </div>
              </Col>
              <Col span={6}>
                <div style={{ color: '#8c8c8c', fontSize: '11px' }}>CREDENTIAL CREATED</div>
                <div style={{ color: '#d4d4d4', fontSize: '13px', marginTop: 2 }}>
                  {controlPlane?.credentialCreatedAt ? dayjs(controlPlane.credentialCreatedAt).format('YYYY-MM-DD') : 'Initial setup'}
                </div>
              </Col>
              <Col span={6}>
                <div style={{ color: '#8c8c8c', fontSize: '11px' }}>ROTATION STATUS</div>
                <div style={{ color: isOldKey ? '#faad14' : '#52c41a', fontSize: '13px', fontWeight: 600, marginTop: 2 }}>
                  {isOldKey ? 'Rotation Recommended' : 'Healthy (Under 90 days)'}
                </div>
              </Col>
              <Col span={6} style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                <Popconfirm
                  title="Remove Control Plane configuration?"
                  description="This will clear saved credentials from the system database."
                  onConfirm={handleDeleteCredentials}
                  okText="Remove"
                  cancelText="Cancel"
                  disabled={!isWritable}
                >
                  <Button danger icon={<DeleteOutlined />} disabled={!isWritable}>
                    Remove Configuration
                  </Button>
                </Popconfirm>
              </Col>
            </Row>
          </Card>
        </Tabs.TabPane>

        {/* TAB 2: GENERAL SETTINGS */}
        <Tabs.TabPane
          tab={
            <Space>
              <SettingOutlined />
              <span>General</span>
            </Space>
          }
          key="general"
        >
          <Card bordered={false} style={{ backgroundColor: '#1c1c1c', border: '1px solid #262626', borderRadius: '8px' }}>
            <Form layout="vertical" initialValues={{ logRetention: 30, glacierDays: '90', autoScale: true }} onFinish={handleGeneralSave}>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label={<span style={{ color: '#d9d9d9' }}>Log Retention Window (Days)</span>} name="logRetention">
                    <InputNumber min={7} max={365} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label={<span style={{ color: '#d9d9d9' }}>S3 Glacier Transition</span>} name="glacierDays">
                    <Select>
                      <Select.Option value="30">30 Days</Select.Option>
                      <Select.Option value="90">90 Days</Select.Option>
                      <Select.Option value="180">180 Days</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item label={<span style={{ color: '#d9d9d9' }}>Auto Scale Cluster Nodes</span>} name="autoScale" valuePropName="checked">
                <Switch />
              </Form.Item>

              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} disabled={!isWritable}>
                Save General Settings
              </Button>
            </Form>
          </Card>
        </Tabs.TabPane>

        {/* TAB 3: SECURITY */}
        <Tabs.TabPane
          tab={
            <Space>
              <LockOutlined />
              <span>Security</span>
            </Space>
          }
          key="security"
        >
          <Card bordered={false} style={{ backgroundColor: '#1c1c1c', border: '1px solid #262626', borderRadius: '8px' }}>
            <Form layout="vertical" initialValues={{ sessionTtl: 24, enforceMfa: false }}>
              <Form.Item label={<span style={{ color: '#d9d9d9' }}>Session Expiration Window (Hours)</span>} name="sessionTtl">
                <InputNumber min={1} max={72} style={{ width: '200px' }} />
              </Form.Item>

              <Form.Item label={<span style={{ color: '#d9d9d9' }}>Enforce Multi-Factor Authentication (MFA)</span>} name="enforceMfa" valuePropName="checked">
                <Switch />
              </Form.Item>

              <Button type="primary" icon={<SaveOutlined />} disabled={!isWritable}>
                Save Security Policy
              </Button>
            </Form>
          </Card>
        </Tabs.TabPane>

        {/* TAB 4: NOTIFICATIONS */}
        <Tabs.TabPane
          tab={
            <Space>
              <BellOutlined style={{ color: '#faad14' }} />
              <span>Notifications</span>
            </Space>
          }
          key="notifications"
        >
          <Card bordered={false} style={{ backgroundColor: '#1c1c1c', border: '1px solid #262626', borderRadius: '8px' }}>
            <Form layout="vertical" initialValues={{ smtpHost: 'smtp.mailgun.org', smtpPort: 587, webhookUrl: '' }}>
              <Form.Item label={<span style={{ color: '#d9d9d9' }}>Slack Alert Webhook URL</span>} name="webhookUrl">
                <Input placeholder="https://hooks.slack.com/services/..." />
              </Form.Item>

              <Row gutter={16}>
                <Col span={16}>
                  <Form.Item label={<span style={{ color: '#d9d9d9' }}>SMTP Host</span>} name="smtpHost">
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label={<span style={{ color: '#d9d9d9' }}>Port</span>} name="smtpPort">
                    <InputNumber style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>

              <Button type="primary" icon={<SaveOutlined />} disabled={!isWritable}>
                Save Notification Gateway
              </Button>
            </Form>
          </Card>
        </Tabs.TabPane>

        {/* TAB 5: AUDIT LOGS */}
        <Tabs.TabPane
          tab={
            <Space>
              <AuditOutlined style={{ color: '#13c2c2' }} />
              <span>Audit Logs</span>
            </Space>
          }
          key="audit"
        >
          <Card bordered={false} style={{ backgroundColor: '#1c1c1c', border: '1px solid #262626', borderRadius: '8px' }}>
            <div style={{ color: '#8c8c8c', fontSize: '13px' }}>
              System audit events for configuration modifications are recorded in the central audit database table.
            </div>
          </Card>
        </Tabs.TabPane>
      </Tabs>

      {/* MODAL 1: UPDATE CREDENTIALS */}
      <Modal
        title={<span style={{ color: '#fff', fontWeight: 600 }}>Update AWS Control Plane Credentials</span>}
        open={updateModalOpen}
        onCancel={() => setUpdateModalOpen(false)}
        footer={null}
        width={500}
      >
        <Form form={updateForm} layout="vertical" onFinish={handleUpdateCredentials} style={{ marginTop: 16 }}>
          <Form.Item label={<span style={{ color: '#d9d9d9' }}>Authentication Method</span>} name="authenticationMethod">
            <Select>
              <Select.Option value="ACCESS_KEY">Access Keys (Development / External VPS)</Select.Option>
              <Select.Option value="IAM_ROLE">IAM Role (Production EC2 / ECS)</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item label={<span style={{ color: '#d9d9d9' }}>Access Key ID</span>} name="accessKeyId" rules={[{ required: true, message: 'Input Access Key ID' }]}>
            <Input placeholder="AKIAIOSFODNN7EXAMPLE" />
          </Form.Item>

          <Form.Item label={<span style={{ color: '#d9d9d9' }}>Secret Access Key</span>} name="secretAccessKey" rules={[{ required: true, message: 'Input Secret Access Key' }]}>
            <Input.Password placeholder="••••••••••••••••••••••••••••••••" />
          </Form.Item>

          <Form.Item label={<span style={{ color: '#d9d9d9' }}>Default Region</span>} name="defaultRegion" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="ap-southeast-1">ap-southeast-1 (Singapore)</Select.Option>
              <Select.Option value="us-east-1">us-east-1 (N. Virginia)</Select.Option>
              <Select.Option value="eu-central-1">eu-central-1 (Frankfurt)</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item label={<span style={{ color: '#d9d9d9' }}>Credential Label</span>} name="credentialLabel">
            <Input placeholder="E.g., Local development credentials" />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
            <Button onClick={() => setUpdateModalOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={saving} icon={<ThunderboltOutlined />}>
              Validate and Save
            </Button>
          </div>
        </Form>
      </Modal>

      {/* MODAL 2: IAM POLICY VIEWER */}
      <Modal
        title={<span style={{ color: '#fff', fontWeight: 600 }}>Required IAM Policy (CloudOpsAssumeRolePolicy)</span>}
        open={policyModalOpen}
        onCancel={() => setPolicyModalOpen(false)}
        footer={[
          <Button key="close" type="primary" onClick={() => setPolicyModalOpen(false)}>
            Close
          </Button>,
        ]}
        width={560}
      >
        <Paragraph style={{ color: '#8c8c8c', fontSize: '12px' }}>
          Attach this IAM policy to your AWS Control Plane IAM User or Instance Role to grant permission to assume target roles.
        </Paragraph>
        <pre
          style={{
            backgroundColor: '#111',
            padding: '14px',
            borderRadius: '6px',
            border: '1px solid #2d2d2d',
            color: '#52c41a',
            fontSize: '12px',
            fontFamily: 'monospace',
            maxHeight: '320px',
            overflowY: 'auto',
          }}
        >
          {REQUIRED_POLICY_JSON}
        </pre>
      </Modal>
    </PageContainer>
  );
};

export default Settings;
