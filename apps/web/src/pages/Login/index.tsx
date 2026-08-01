import React, { useState } from 'react';
import { Form, Input, Button, Card, message, Modal } from 'antd';
import {
  LockOutlined,
  CloudServerOutlined,
  MailOutlined,
} from '@ant-design/icons';
import { history, useModel, request } from '@umijs/max';
import { extractApiError, getApiErrorMessage } from '@/utils/api-error';
import styles from './index.less';

const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const { setInitialState } = useModel('@@initialState');
  const [form] = Form.useForm();
  const [forgotForm] = Form.useForm();

  const showAuthError = (error: unknown) => {
    const parsed = extractApiError(error);
    if (parsed.code === 'VALIDATION_ERROR' && parsed.details?.length) {
      const fieldErrors = parsed.details
        .filter((d) => d.field && d.message)
        .map((d) => ({
          name: d.field === 'fullName' ? 'username' : d.field!,
          errors: [d.message!],
        }));
      if (fieldErrors.length > 0) {
        form.setFields(fieldErrors);
        message.error(fieldErrors[0].errors[0]);
        return;
      }
    }
    message.error(parsed.message || getApiErrorMessage(error));
  };

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const response = await request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: {
          email: values.email,
          password: values.password,
        },
        skipErrorHandler: true,
      });

      const { accessToken, user } = response.data || response;

      localStorage.setItem('dataflow_token', accessToken);
      localStorage.setItem('dataflow_user_role', user.role.toLowerCase());
      localStorage.setItem('dataflow_username', user.fullName || user.email);

      await setInitialState({
        currentUser: {
          name: user.fullName || user.email,
          avatar: 'https://gw.alipayobjects.com/zos/antfincdn/XAosamN5UP/BiazfanxmamNRoxxVxka.png',
          role: user.role.toLowerCase(),
        },
      });

      const displayName = user.fullName || user.email;
      message.success(`Xin chào ${displayName}, đăng nhập thành công!`);
      history.push('/dashboard');
    } catch (error: unknown) {
      showAuthError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (values: { email: string }) => {
    setForgotLoading(true);
    try {
      await request('/api/v1/auth/forgot-password', {
        method: 'POST',
        data: { email: values.email },
        skipErrorHandler: true,
      });
      message.success('If an account with that email exists, a reset link has been sent.');
      setForgotOpen(false);
      forgotForm.resetFields();
    } catch {
      // Always show success to prevent account enumeration
      message.success('If an account with that email exists, a reset link has been sent.');
      setForgotOpen(false);
      forgotForm.resetFields();
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className={styles.loginContainer}>
      <div className={styles.loginBgGrid}></div>
      <div className={styles.glowBlob1}></div>
      <div className={styles.glowBlob2}></div>

      <Card className={styles.loginCard} bordered={false}>
        <div className={styles.loginHeader}>
          <div className={styles.logoWrapper}>
            <CloudServerOutlined className={styles.logoIcon} />
          </div>
          <h2 className={styles.title}>CloudOps</h2>
          <p className={styles.subtitle}>AWS Cloud Operations & Incident Management</p>
        </div>

        <Form
          form={form}
          name="loginForm"
          initialValues={{ email: '', password: '' }}
          onFinish={onFinish}
          layout="vertical"
          size="large"
        >
          <Form.Item
            name="email"
            rules={[
              { required: true, message: 'Vui lòng nhập email!' },
              { type: 'email', message: 'Email không hợp lệ!' },
            ]}
          >
            <Input
              prefix={<MailOutlined className={styles.inputIcon} />}
              placeholder="Email Address"
              className={styles.loginInput}
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Vui lòng nhập mật khẩu!' }]}
          >
            <Input.Password
              prefix={<LockOutlined className={styles.inputIcon} />}
              placeholder="Password"
              className={styles.loginInput}
            />
          </Form.Item>

          <Form.Item style={{ marginTop: 32, marginBottom: 8 }}>
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

        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <a
            onClick={() => setForgotOpen(true)}
            style={{ color: '#8c8c8c', fontSize: 12, cursor: 'pointer' }}
          >
            Forgot Password?
          </a>
        </div>
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <span style={{ color: '#595959', fontSize: 12 }}>
            Accounts are created by your administrator. Contact admin for access.
          </span>
        </div>
      </Card>

      <Modal
        title={<span style={{ color: '#fff' }}>Forgot Password</span>}
        open={forgotOpen}
        onCancel={() => { setForgotOpen(false); forgotForm.resetFields(); }}
        footer={null}
        className="glass-panel"
        width={400}
      >
        <Form form={forgotForm} layout="vertical" onFinish={handleForgotPassword} style={{ marginTop: 16 }}>
          <Form.Item
            name="email"
            rules={[
              { required: true, message: 'Please enter your email' },
              { type: 'email', message: 'Invalid email' },
            ]}
          >
            <Input
              prefix={<MailOutlined className={styles.inputIcon} />}
              placeholder="Enter your account email"
              className={styles.loginInput}
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
            <Button type="primary" htmlType="submit" loading={forgotLoading} block className={styles.submitBtn}>
              Send Reset Link
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      <div className={styles.loginFooter}>
        <span>CloudOps ©2026 Powered by AWS Cloud Infrastructure</span>
      </div>
    </div>
  );
};

export default Login;
