import React, { useState } from 'react';
import { Card, Table, Tag, Button, Space, Modal, Form, Input, Select, Switch, Tabs, message } from 'antd';
import { 
  UserOutlined, 
  LockOutlined, 
  UnlockOutlined, 
  PlusOutlined, 
  SafetyCertificateOutlined,
  HistoryOutlined
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';

interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'operator' | 'viewer';
  status: 'ACTIVE' | 'LOCKED';
  createdDate: string;
}

interface ActivityLog {
  id: string;
  user: string;
  action: string;
  time: string;
  ip: string;
}

const Users: React.FC = () => {
  const [activeTab, setActiveTab] = useState('1');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [currentUserRole] = useState(() => localStorage.getItem('dataflow_user_role') || 'admin');

  const [users, setUsers] = useState<User[]>([
    { id: '1', username: 'admin', email: 'admin@cloudopshub.com', role: 'admin', status: 'ACTIVE', createdDate: '2026-06-01' },
    { id: '2', username: 'john_operator', email: 'john@cloudopshub.com', role: 'operator', status: 'ACTIVE', createdDate: '2026-06-15' },
    { id: '3', username: 'guest_viewer', email: 'viewer@cloudopshub.com', role: 'viewer', status: 'ACTIVE', createdDate: '2026-07-01' },
    { id: '4', username: 'malicious_user', email: 'spammer@cloudopshub.com', role: 'viewer', status: 'LOCKED', createdDate: '2026-07-02' },
  ]);

  const [logs] = useState<ActivityLog[]>([
    { id: '1', user: 'admin', action: 'Triggered CPU_Over_90_Percent Rule manually', time: '2026-07-07 15:42:00', ip: '192.168.1.42' },
    { id: '2', user: 'john_operator', action: 'Simulated AWS CloudWatch CPU_HIGH Event', time: '2026-07-07 08:30:12', ip: '192.168.1.45' },
    { id: '3', user: 'admin', action: 'Paused scheduler task: Redis BullMQ Queue Health Check', time: '2026-07-07 04:02:11', ip: '10.0.0.4' },
    { id: '4', user: 'guest_viewer', action: 'Downloaded Weekly System Performance Report', time: '2026-07-07 01:15:30', ip: '172.16.52.99' },
  ]);

  const handleCreate = (values: any) => {
    if (currentUserRole !== 'admin') {
      message.error('Chỉ Admin mới có quyền thêm thành viên!');
      return;
    }
    const newUser: User = {
      id: String(users.length + 1),
      username: values.username,
      email: values.email,
      role: values.role,
      status: 'ACTIVE',
      createdDate: new Date().toISOString().substring(0, 10),
    };
    setUsers([...users, newUser]);
    setIsModalOpen(false);
    form.resetFields();
    message.success(`Thêm người dùng ${values.username} thành công!`);
  };

  const toggleLock = (id: string, name: string, currentStatus: 'ACTIVE' | 'LOCKED') => {
    if (currentUserRole !== 'admin') {
      message.error('Chỉ Admin mới có quyền Khóa/Mở khóa tài khoản!');
      return;
    }
    const nextStatus = currentStatus === 'ACTIVE' ? 'LOCKED' : 'ACTIVE';
    setUsers(prev => 
      prev.map(u => u.id === id ? { ...u, status: nextStatus } : u)
    );
    message.warning(`Đã ${nextStatus === 'ACTIVE' ? 'mở khóa' : 'khóa'} tài khoản của ${name}`);
  };

  const deleteUser = (id: string, name: string) => {
    if (currentUserRole !== 'admin') {
      message.error('Chỉ Admin mới có quyền xóa tài khoản!');
      return;
    }
    setUsers(users.filter(u => u.id !== id));
    message.success(`Đã xóa tài khoản ${name}`);
  };

  const userColumns = [
    {
      title: 'Username',
      dataIndex: 'username',
      key: 'username',
      render: (t: string) => (
        <Space>
          <UserOutlined style={{ color: '#ff5722' }} />
          <strong style={{ color: '#fff' }}>{t}</strong>
        </Space>
      ),
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      render: (t: string) => <span style={{ color: '#8c8c8c' }}>{t}</span>,
    },
    {
      title: 'Role Permissions',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => {
        let color = 'blue';
        if (role === 'admin') color = 'red';
        else if (role === 'operator') color = 'orange';
        return <Tag color={color}>{role.toUpperCase()}</Tag>;
      },
    },
    {
      title: 'Account Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'ACTIVE' ? 'green' : 'red'}>{status}</Tag>
      ),
    },
    {
      title: 'Created At',
      dataIndex: 'createdDate',
      key: 'createdDate',
      render: (t: string) => <span style={{ color: '#8c8c8c' }}>{t}</span>,
    },
    {
      title: 'Actions',
      key: 'action',
      render: (_: any, record: User) => (
        <Space size="middle">
          <Button 
            size="small" 
            type="text" 
            icon={record.status === 'ACTIVE' ? <LockOutlined style={{ color: '#faad14' }} /> : <UnlockOutlined style={{ color: '#52c41a' }} />}
            onClick={() => toggleLock(record.id, record.username, record.status)}
            disabled={currentUserRole !== 'admin'}
          >
            {record.status === 'ACTIVE' ? 'Lock' : 'Unlock'}
          </Button>
          <Button 
            size="small" 
            type="text" 
            danger 
            onClick={() => deleteUser(record.id, record.username)}
            disabled={currentUserRole !== 'admin'}
          >
            Delete
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      title={<span style={{ color: '#fff', fontSize: '24px', fontWeight: 600 }}>Workers & Access Control</span>}
      subTitle={<span style={{ color: '#8c8c8c' }}>Manage worker nodes, operations staff access, and security audit logs</span>}
    >
      <Tabs activeKey={activeTab} onChange={setActiveTab} style={{ color: '#8c8c8c' }}>
        <Tabs.TabPane tab="User Directory" key="1">
          <Card 
            bordered={false}
            extra={
              <Button 
                type="primary" 
                icon={<PlusOutlined />} 
                onClick={() => {
                  if (currentUserRole !== 'admin') {
                    message.error('Bạn cần có quyền Admin để tạo người dùng mới!');
                    return;
                  }
                  setIsModalOpen(true);
                }}
                disabled={currentUserRole !== 'admin'}
              >
                Add User
              </Button>
            }
          >
            <Table 
              columns={userColumns} 
              dataSource={users} 
              rowKey="id"
              pagination={false}
              style={{ backgroundColor: '#1c1c1c' }}
            />
          </Card>
        </Tabs.TabPane>
        <Tabs.TabPane tab="Audit Logs / Activity" key="2">
          <Card title="Activity Ingestion Logs" bordered={false}>
            <Table 
              dataSource={logs}
              rowKey="id"
              columns={[
                { title: 'User Account', dataIndex: 'user', render: (t) => <strong style={{ color: '#fff' }}>{t}</strong> },
                { title: 'Operation Action', dataIndex: 'action' },
                { title: 'Audit Time', dataIndex: 'time', render: (t) => <span style={{ color: '#8c8c8c' }}>{t}</span> },
                { title: 'Source IP Address', dataIndex: 'ip', render: (t) => <code style={{ color: '#ff7a45' }}>{t}</code> },
              ]}
              pagination={false}
              style={{ backgroundColor: '#1c1c1c' }}
            />
          </Card>
        </Tabs.TabPane>
      </Tabs>

      <Modal
        title={<span style={{ color: '#fff' }}>Create New Account Profile</span>}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        className="glass-panel"
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <Form.Item
            label={<span style={{ color: '#d9d9d9' }}>Account Username</span>}
            name="username"
            rules={[{ required: true, message: 'Nhập username!' }]}
          >
            <Input placeholder="E.g., operator_alex" />
          </Form.Item>

          <Form.Item
            label={<span style={{ color: '#d9d9d9' }}>Email Address</span>}
            name="email"
            rules={[{ required: true, type: 'email', message: 'Nhập email hợp lệ!' }]}
          >
            <Input placeholder="operator_alex@cloudopshub.com" />
          </Form.Item>

          <Form.Item
            label={<span style={{ color: '#d9d9d9' }}>Security Role Permissions</span>}
            name="role"
            rules={[{ required: true, message: 'Chọn vai trò!' }]}
          >
            <Select placeholder="Chọn vai trò">
              <Select.Option value="admin">Administrator (Full Control)</Select.Option>
              <Select.Option value="operator">Operator (Event & Rules Control)</Select.Option>
              <Select.Option value="viewer">Viewer (Dashboard & Logs)</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 0, marginTop: 24 }}>
            <Space>
              <Button onClick={() => setIsModalOpen(false)} style={{ backgroundColor: 'transparent', color: '#8c8c8c', border: '1px solid #333' }}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit">
                Create Account
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default Users;
