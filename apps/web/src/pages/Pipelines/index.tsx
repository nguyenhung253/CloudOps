import React, { useState } from 'react';
import { Table, Tag, Space, Button, Modal, Form, Input, Select, Switch, message, Tooltip, Badge } from 'antd';
import { 
  PlayCircleOutlined, 
  StopOutlined, 
  ReloadOutlined, 
  PlusOutlined, 
  EyeOutlined,
  WarningOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';

interface Rule {
  id: string;
  name: string;
  condition: string;
  source: string;
  action: string;
  severity: 'critical' | 'warning' | 'info';
  status: 'active' | 'disabled';
  lastTriggered: string;
}

const Pipelines: React.FC = () => {
  const [rules, setRules] = useState<Rule[]>([
    { id: '1', name: 'CPU_Over_90_Percent', condition: 'CPU utilization > 90%', source: 'AWS CloudWatch', action: 'Create Critical Incident', severity: 'critical', status: 'active', lastTriggered: 'Just now' },
    { id: '2', name: 'Disk_Space_Low', condition: 'Disk space < 5%', source: 'AWS CloudWatch', action: 'Create Warning Incident', severity: 'warning', status: 'active', lastTriggered: '10m ago' },
    { id: '3', name: 'Redis_Queue_Overflow', condition: 'Redis BullMQ queue > 1000 jobs', source: 'BullMQ Redis Queue', action: 'Send Alert Webhook & Slack', severity: 'warning', status: 'active', lastTriggered: '1h ago' },
    { id: '4', name: 'EC2_Instance_Down', condition: 'EC2 instance StatusCheckFailed == 1', source: 'AWS CloudWatch', action: 'Create Critical Incident', severity: 'critical', status: 'disabled', lastTriggered: 'Never' },
  ]);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [userRole] = useState(() => localStorage.getItem('dataflow_user_role') || 'admin');

  const showModal = () => {
    if (userRole === 'viewer') {
      message.error('Bạn chỉ có quyền xem, không thể tạo Rule!');
      return;
    }
    setIsModalVisible(true);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
    form.resetFields();
  };

  const handleCreate = (values: any) => {
    const newRule: Rule = {
      id: String(rules.length + 1),
      name: values.name,
      condition: values.condition,
      source: values.source,
      action: values.action,
      severity: values.severity,
      status: 'active',
      lastTriggered: 'Never',
    };
    setRules([...rules, newRule]);
    message.success('Tạo Rule mới thành công!');
    setIsModalVisible(false);
    form.resetFields();
  };

  const toggleRuleStatus = (id: string, checked: boolean) => {
    if (userRole === 'viewer') {
      message.error('Bạn không có quyền thay đổi trạng thái Rule!');
      return;
    }
    setRules(prev => prev.map(r => r.id === id ? { ...r, status: checked ? 'active' : 'disabled' } : r));
    message.success(`Đã ${checked ? 'bật' : 'tắt'} Rule.`);
  };

  const triggerRuleManual = (id: string) => {
    if (userRole === 'viewer') {
      message.error('Bạn không có quyền kích hoạt Rule!');
      return;
    }
    message.info('Đang đánh giá Rule thủ công...');
    setTimeout(() => {
      setRules(prev => prev.map(r => {
        if (r.id === id) {
          return { ...r, lastTriggered: 'Just now' };
        }
        return r;
      }));
      message.success('Đã chạy đánh giá Rule. Trạng thái: OK.');
    }, 1000);
  };

  const columns = [
    {
      title: 'Rule Name',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <span style={{ color: '#fff', fontWeight: 600 }}>{text}</span>,
    },
    {
      title: 'Condition',
      dataIndex: 'condition',
      key: 'condition',
      render: (text: string) => <span style={{ color: '#ff7a45', fontFamily: 'monospace' }}>{text}</span>,
    },
    {
      title: 'Source Provider',
      dataIndex: 'source',
      key: 'source',
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: 'Incident Action',
      dataIndex: 'action',
      key: 'action',
      render: (text: string) => <span style={{ color: '#d9d9d9' }}>{text}</span>,
    },
    {
      title: 'Severity',
      dataIndex: 'severity',
      key: 'severity',
      render: (sev: string) => {
        let color = 'blue';
        if (sev === 'critical') color = 'red';
        if (sev === 'warning') color = 'gold';
        return <Tag color={color}>{sev.toUpperCase()}</Tag>;
      }
    },
    {
      title: 'Status',
      key: 'status',
      render: (_: any, record: Rule) => (
        <Switch 
          checkedChildren="ACTIVE" 
          unCheckedChildren="OFF" 
          checked={record.status === 'active'}
          onChange={(checked) => toggleRuleStatus(record.id, checked)}
          disabled={userRole === 'viewer'}
        />
      )
    },
    {
      title: 'Last Triggered',
      dataIndex: 'lastTriggered',
      key: 'lastTriggered',
      render: (text: string) => <span style={{ color: '#8c8c8c', fontSize: '12px' }}>{text}</span>,
    },
    {
      title: 'Actions',
      key: 'action',
      render: (_: any, record: Rule) => (
        <Space size="middle">
          <Tooltip title="Evaluate manual">
            <Button 
              type="text" 
              icon={<ThunderboltOutlined style={{ color: '#52c41a' }} />} 
              onClick={() => triggerRuleManual(record.id)}
              disabled={userRole === 'viewer' || record.status !== 'active'}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      title={<span style={{ color: '#fff', fontSize: '24px', fontWeight: 600 }}>Event Workflows</span>}
      subTitle={<span style={{ color: '#8c8c8c' }}>Define workflow rules, alarm thresholds, and incident actions</span>}
      extra={[
        <Button 
          key="create" 
          type="primary" 
          icon={<PlusOutlined />} 
          onClick={showModal}
          disabled={userRole === 'viewer'}
        >
          Create Rule
        </Button>,
      ]}
    >
      <Table 
        columns={columns} 
        dataSource={rules} 
        rowKey="id"
        pagination={false}
        style={{
          backgroundColor: '#1c1c1c',
          borderRadius: '12px',
          overflow: 'hidden',
          border: '1px solid #2d2d2d'
        }}
      />

      <Modal
        title={<span style={{ color: '#fff', fontSize: '18px' }}>Create Event Action Rule</span>}
        open={isModalVisible}
        onCancel={handleCancel}
        footer={null}
        className="glass-panel"
        style={{ borderRadius: '12px' }}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <Form.Item
            label={<span style={{ color: '#d9d9d9' }}>Rule Name</span>}
            name="name"
            rules={[{ required: true, message: 'Nhập tên Rule!' }]}
          >
            <Input placeholder="E.g., High_Error_Rate" style={{ backgroundColor: '#121212', color: '#fff', border: '1px solid #333' }} />
          </Form.Item>

          <Form.Item
            label={<span style={{ color: '#d9d9d9' }}>Condition Expression</span>}
            name="condition"
            rules={[{ required: true, message: 'Nhập điều kiện!' }]}
          >
            <Input placeholder="E.g., error_rate > 5%" style={{ backgroundColor: '#121212', color: '#fff', border: '1px solid #333' }} />
          </Form.Item>

          <Form.Item
            label={<span style={{ color: '#d9d9d9' }}>Cloud Source</span>}
            name="source"
            rules={[{ required: true, message: 'Chọn nguồn Cloud!' }]}
          >
            <Select dropdownStyle={{ backgroundColor: '#1c1c1c' }}>
              <Select.Option value="AWS CloudWatch">AWS CloudWatch</Select.Option>
              <Select.Option value="AWS S3">AWS S3</Select.Option>
              <Select.Option value="BullMQ Redis Queue">BullMQ Redis Queue</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            label={<span style={{ color: '#d9d9d9' }}>Incident Action</span>}
            name="action"
            rules={[{ required: true, message: 'Chọn hành động!' }]}
          >
            <Select dropdownStyle={{ backgroundColor: '#1c1c1c' }}>
              <Select.Option value="Create Critical Incident">Create Critical Incident</Select.Option>
              <Select.Option value="Create Warning Incident">Create Warning Incident</Select.Option>
              <Select.Option value="Send Alert Webhook & Slack">Send Alert Webhook & Slack</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            label={<span style={{ color: '#d9d9d9' }}>Severity Level</span>}
            name="severity"
            rules={[{ required: true, message: 'Chọn mức độ nghiêm trọng!' }]}
          >
            <Select dropdownStyle={{ backgroundColor: '#1c1c1c' }}>
              <Select.Option value="critical">Critical</Select.Option>
              <Select.Option value="warning">Warning</Select.Option>
              <Select.Option value="info">Info</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 0, marginTop: 24 }}>
            <Space>
              <Button onClick={handleCancel} style={{ backgroundColor: 'transparent', color: '#8c8c8c', border: '1px solid #333' }}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit">
                Create Rule
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default Pipelines;
