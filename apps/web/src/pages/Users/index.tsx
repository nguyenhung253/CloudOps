import React, { useEffect, useState, useCallback } from 'react';
import { Card, Table, Tag, Button, Space, Modal, Form, Input, Select, Tabs, message, Tooltip } from 'antd';
import {
  UserOutlined,
  LockOutlined,
  UnlockOutlined,
  PlusOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { request } from '@umijs/max';

interface ApiUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
}

const Users: React.FC = () => {
  const [activeTab, setActiveTab] = useState('1');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isRoleOpen, setIsRoleOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ApiUser | null>(null);
  const [form] = Form.useForm();
  const [roleForm] = Form.useForm();
  const [currentUserRole] = useState(() => localStorage.getItem('dataflow_user_role') || 'admin');
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request<{ data: ApiUser[] }>('/api/v1/users');
      const list = (res as any)?.data?.data ?? (res as any)?.data ?? [];
      setUsers(Array.isArray(list) ? list : []);
    } catch {
      // keep current list on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreate = async (values: any) => {
    if (currentUserRole !== 'admin') {
      message.error('Chỉ Admin mới có quyền thêm thành viên!');
      return;
    }
    try {
      await request('/api/v1/auth/register', {
        method: 'POST',
        data: {
          email: values.email,
          password: values.password,
          fullName: values.fullName,
        },
      });
      setIsCreateOpen(false);
      form.resetFields();
      message.success(`Đã tạo tài khoản ${values.email}`);
      fetchUsers();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Lỗi khi tạo tài khoản';
      message.error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
  };

  const toggleLock = async (id: string, currentStatus: string) => {
    if (currentUserRole !== 'admin') {
      message.error('Chỉ Admin mới có quyền thay đổi trạng thái!');
      return;
    }
    const nextStatus = currentStatus === 'ACTIVE' ? 'LOCKED' : 'ACTIVE';
    try {
      await request(`/api/v1/users/${id}/status`, {
        method: 'PATCH',
        data: { status: nextStatus },
      });
      message.success(`Đã ${nextStatus === 'ACTIVE' ? 'mở khóa' : 'khóa'} tài khoản`);
      fetchUsers();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Lỗi khi cập nhật trạng thái';
      message.error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
  };

  const openRoleModal = (user: ApiUser) => {
    setSelectedUser(user);
    roleForm.setFieldsValue({ role: user.role });
    setIsRoleOpen(true);
  };

  const handleRoleChange = async (values: { role: string }) => {
    if (!selectedUser) return;
    try {
      await request(`/api/v1/users/${selectedUser.id}/role`, {
        method: 'PATCH',
        data: { role: values.role },
      });
      setIsRoleOpen(false);
      message.success(`Đã đổi vai trò của ${selectedUser.email}`);
      fetchUsers();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Lỗi khi đổi vai trò';
      message.error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
  };

  const userColumns = [
    {
      title: 'User',
      dataIndex: 'fullName',
      key: 'fullName',
      render: (name: string, record: ApiUser) => (
        <Space>
          <UserOutlined style={{ color: '#ff5722' }} />
          <div>
            <div style={{ color: '#fff', fontWeight: 600 }}>{name}</div>
            <div style={{ color: '#8c8c8c', fontSize: 12 }}>{record.email}</div>
          </div>
        </Space>
      ),
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => {
        const color = role === 'ADMIN' ? 'red' : role === 'OPERATOR' ? 'orange' : 'blue';
        return <Tag color={color}>{role}</Tag>;
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'ACTIVE' ? 'green' : 'red'}>{status}</Tag>
      ),
    },
    {
      title: 'Created At',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (t: string) => <span style={{ color: '#8c8c8c' }}>{t ? new Date(t).toLocaleDateString() : '—'}</span>,
    },
    {
      title: 'Actions',
      key: 'action',
      render: (_: any, record: ApiUser) => (
        <Space size="small">
          <Tooltip title={record.status === 'ACTIVE' ? 'Lock user' : 'Unlock user'}>
            <Button
              size="small"
              icon={record.status === 'ACTIVE' ? <LockOutlined style={{ color: '#faad14' }} /> : <UnlockOutlined style={{ color: '#52c41a' }} />}
              onClick={() => toggleLock(record.id, record.status)}
              disabled={currentUserRole !== 'admin'}
            />
          </Tooltip>
          <Tooltip title="Change role">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openRoleModal(record)}
              disabled={currentUserRole !== 'admin'}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      title={<span style={{ color: '#fff', fontSize: '24px', fontWeight: 600 }}>Users & Access Control</span>}
      subTitle={<span style={{ color: '#8c8c8c' }}>Manage operator accounts, RBAC roles, and account security</span>}
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            if (currentUserRole !== 'admin') {
              message.error('Bạn cần quyền Admin để tạo người dùng!');
              return;
            }
            setIsCreateOpen(true);
          }}
          disabled={currentUserRole !== 'admin'}
        >
          Add User
        </Button>
      }
    >
      <Tabs activeKey={activeTab} onChange={setActiveTab} style={{ color: '#8c8c8c' }}>
        <Tabs.TabPane tab="User Directory" key="1">
          <Card bordered={false}>
            <Table
              columns={userColumns}
              dataSource={users}
              rowKey="id"
              loading={loading}
              pagination={false}
              size="middle"
              style={{ backgroundColor: '#1c1c1c' }}
            />
          </Card>
        </Tabs.TabPane>
        <Tabs.TabPane tab="Audit Logs" key="2">
          <Card bordered={false}>
            <div style={{ color: '#8c8c8c', padding: '24px 0', textAlign: 'center' }}>
              Audit logs are stored in the database and available to administrators.
              <br />
              Use <code style={{ color: '#ff7a45' }}>GET /api/v1/audit-logs</code> or check the AuditLogs table directly.
            </div>
          </Card>
        </Tabs.TabPane>
      </Tabs>

      {/* Create User Modal */}
      <Modal
        title={<span style={{ color: '#fff' }}>Create New Account</span>}
        open={isCreateOpen}
        onCancel={() => setIsCreateOpen(false)}
        footer={null}
        className="glass-panel"
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <Form.Item
            label={<span style={{ color: '#d9d9d9' }}>Full Name</span>}
            name="fullName"
            rules={[{ required: true, message: 'Nhập họ tên!' }]}
          >
            <Input placeholder="Nguyen Van A" />
          </Form.Item>
          <Form.Item
            label={<span style={{ color: '#d9d9d9' }}>Email</span>}
            name="email"
            rules={[{ required: true, type: 'email', message: 'Nhập email hợp lệ!' }]}
          >
            <Input placeholder="user@cloudops.com" />
          </Form.Item>
          <Form.Item
            label={<span style={{ color: '#d9d9d9' }}>Password</span>}
            name="password"
            rules={[{ required: true, min: 6, message: 'Mật khẩu ít nhất 6 ký tự!' }]}
          >
            <Input.Password placeholder="••••••" />
          </Form.Item>
          <Form.Item style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 0, marginTop: 24 }}>
            <Space>
              <Button onClick={() => setIsCreateOpen(false)} style={{ backgroundColor: 'transparent', color: '#8c8c8c', border: '1px solid #333' }}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit">
                Create Account
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Change Role Modal */}
      <Modal
        title={<span style={{ color: '#fff' }}>Change Role — {selectedUser?.email}</span>}
        open={isRoleOpen}
        onCancel={() => setIsRoleOpen(false)}
        footer={null}
        className="glass-panel"
      >
        <Form form={roleForm} layout="vertical" onFinish={handleRoleChange} style={{ marginTop: 16 }}>
          <Form.Item
            label={<span style={{ color: '#d9d9d9' }}>Role</span>}
            name="role"
            rules={[{ required: true, message: 'Chọn vai trò!' }]}
          >
            <Select placeholder="Chọn vai trò">
              <Select.Option value="ADMIN">Administrator (Full Control)</Select.Option>
              <Select.Option value="OPERATOR">Operator (Jobs, Rules, Incidents)</Select.Option>
              <Select.Option value="VIEWER">Viewer (Read-only)</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 0, marginTop: 24 }}>
            <Space>
              <Button onClick={() => setIsRoleOpen(false)} style={{ backgroundColor: 'transparent', color: '#8c8c8c', border: '1px solid #333' }}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit">
                Update Role
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default Users;
