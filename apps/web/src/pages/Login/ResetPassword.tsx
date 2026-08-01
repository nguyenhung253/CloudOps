import React, { useState } from 'react';
import { Form, Input, Button, Card, message } from 'antd';
import { LockOutlined, CloudServerOutlined } from '@ant-design/icons';
import { history, request } from '@umijs/max';
import styles from './index.less';

const ResetPassword: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  // Extract token from URL query
  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get('token');

  const onFinish = async (values: { password: string; confirmPassword: string }) => {
    if (values.password !== values.confirmPassword) {
      message.error('Passwords do not match!');
      return;
    }
    if (!token) {
      message.error('Reset token is missing. Please request a new password reset link.');
      return;
    }

    setLoading(true);
    try {
      await request('/api/v1/auth/reset-password', {
        method: 'POST',
        data: { token, newPassword: values.password },
        skipErrorHandler: true,
      });
      message.success('Password reset successful! You can now sign in with your new password.');
      history.push('/login');
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to reset password';
      message.error(typeof msg === 'string' ? msg : 'The reset link may have expired. Please request a new one.');
    } finally {
      setLoading(false);
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
          <h2 className={styles.title}>Reset Password</h2>
          <p className={styles.subtitle}>Enter your new password below</p>
        </div>

        {!token ? (
          <div style={{ color: '#ff4d4f', textAlign: 'center', padding: '24px 0' }}>
            <p>Invalid or missing reset token.</p>
            <a onClick={() => history.push('/login')} style={{ cursor: 'pointer' }}>
              Back to Sign In
            </a>
          </div>
        ) : (
          <Form
            form={form}
            name="resetPassword"
            onFinish={onFinish}
            layout="vertical"
            size="large"
          >
            <Form.Item
              name="password"
              rules={[
                { required: true, message: 'Please enter a new password!' },
                { min: 6, message: 'Password must be at least 6 characters' },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined className={styles.inputIcon} />}
                placeholder="New Password"
                className={styles.loginInput}
              />
            </Form.Item>

            <Form.Item
              name="confirmPassword"
              dependencies={['password']}
              rules={[
                { required: true, message: 'Please confirm your password!' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('Passwords do not match!'));
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined className={styles.inputIcon} />}
                placeholder="Confirm New Password"
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
                Reset Password
              </Button>
            </Form.Item>

            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <a onClick={() => history.push('/login')} style={{ color: '#8c8c8c', fontSize: 12, cursor: 'pointer' }}>
                Back to Sign In
              </a>
            </div>
          </Form>
        )}
      </Card>

      <div className={styles.loginFooter}>
        <span>CloudOps ©2026 Powered by AWS Cloud Infrastructure</span>
      </div>
    </div>
  );
};

export default ResetPassword;
