import React, { useState } from 'react';
import { Form, Input, Button, Card, Radio, message, Space } from 'antd';
import { UserOutlined, LockOutlined, CloudServerOutlined } from '@ant-design/icons';
import { history, useModel } from '@umijs/max';
import styles from './index.less';

const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const { setInitialState } = useModel('@@initialState');

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      // Mock login token saving
      localStorage.setItem('dataflow_token', 'mock_jwt_token_xxxx');
      localStorage.setItem('dataflow_user_role', values.role);
      localStorage.setItem('dataflow_username', values.username);

      // Update initial state
      await setInitialState({
        currentUser: {
          name: values.username,
          avatar: 'https://gw.alipayobjects.com/zos/antfincdn/XAosamN5UP/BiazfanxmamNRoxxVxka.png',
          role: values.role,
        }
      });

      message.success(`Đăng nhập thành công với quyền ${values.role.toUpperCase()}`);
      history.push('/dashboard');
    } catch (error) {
      message.error('Đăng nhập thất bại, vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.loginContainer}>
      <div className={styles.loginBgGrid}></div>
      <Card className={styles.loginCard} bordered={false}>
        <div className={styles.loginHeader}>
          <div className={styles.logoWrapper}>
            <CloudServerOutlined className={styles.logoIcon} />
          </div>
          <h2 className={styles.title}>CloudOps</h2>
          <p className={styles.subtitle}>AWS Cloud Operations & Incident Management</p>
        </div>

        <Form
          name="loginForm"
          initialValues={{ username: 'admin', role: 'admin' }}
          onFinish={onFinish}
          layout="vertical"
          size="large"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: 'Vui lòng nhập tên đăng nhập!' }]}
          >
            <Input 
              prefix={<UserOutlined style={{ color: '#ff5722' }} />} 
              placeholder="Username" 
              className={styles.loginInput}
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Vui lòng nhập mật khẩu!' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#ff5722' }} />}
              placeholder="Password"
              className={styles.loginInput}
            />
          </Form.Item>

          <Form.Item label={<span style={{ color: '#8c8c8c' }}>Chọn vai trò (Demo RBAC)</span>} name="role">
            <Radio.Group className={styles.roleSelector} buttonStyle="solid">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Radio.Button value="admin" className={styles.roleBtn}>
                  Admin (Quyền tối cao)
                </Radio.Button>
                <Radio.Button value="operator" className={styles.roleBtn}>
                  Operator (Chạy & Điều khiển Event/Worker)
                </Radio.Button>
                <Radio.Button value="viewer" className={styles.roleBtn}>
                  Viewer (Chỉ xem Dashboard & Logs)
                </Radio.Button>
              </Space>
            </Radio.Group>
          </Form.Item>

          <Form.Item style={{ marginTop: 24 }}>
            <Button
              type="primary"
              htmlType="submit"
              className={styles.submitBtn}
              loading={loading}
              block
            >
              Sign In
            </Button>
          </Form.Item>
        </Form>
      </Card>
      
      <div className={styles.loginFooter}>
        <span style={{ color: '#555' }}>CloudOps ©2026 Powered by AWS Cloud Infrastructure</span>
      </div>
    </div>
  );
};

export default Login;
