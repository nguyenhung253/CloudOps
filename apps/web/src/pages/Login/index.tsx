import React, { useState } from 'react';
import { Form, Input, Button, Card, message } from 'antd';
import { 
  UserOutlined, 
  LockOutlined, 
  CloudServerOutlined, 
  MailOutlined
} from '@ant-design/icons';
import { history, useModel, request } from '@umijs/max';
import { extractApiError, getApiErrorMessage } from '@/utils/api-error';
import styles from './index.less';

const Login: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const { setInitialState } = useModel('@@initialState');
  const [form] = Form.useForm();

  const showAuthError = (error: unknown) => {
    const parsed = extractApiError(error);

    // Map validation details onto form fields when possible
    if (parsed.code === 'VALIDATION_ERROR' && parsed.details?.length) {
      const fieldErrors = parsed.details
        .filter((d) => d.field && d.message)
        .map((d) => ({
          name: d.field === 'fullName' ? 'username' : d.field!,
          errors: [d.message!],
        }));
      if (fieldErrors.length > 0) {
        form.setFields(fieldErrors);
        // Field-level error is enough; toast the first friendly field message
        message.error(fieldErrors[0].errors[0]);
        return;
      }
    }

    message.error(parsed.message || getApiErrorMessage(error));
  };

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      if (isLogin) {
        // Real login API call
        const response = await request('/api/v1/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          data: {
            email: values.email,
            password: values.password,
          },
          // Let us handle 4xx with friendly copy instead of umi default
          skipErrorHandler: true,
        });

        const { accessToken, user } = response.data || response;

        // Save token and user info
        localStorage.setItem('dataflow_token', accessToken);
        localStorage.setItem('dataflow_user_role', user.role.toLowerCase());
        localStorage.setItem('dataflow_username', user.fullName || user.email);

        // Update initial state
        await setInitialState({
          currentUser: {
            name: user.fullName || user.email,
            avatar: 'https://gw.alipayobjects.com/zos/antfincdn/XAosamN5UP/BiazfanxmamNRoxxVxka.png',
            role: user.role.toLowerCase(),
          }
        });

        const displayName = user.fullName || user.email;
        message.success(`Xin chào ${displayName}, đăng nhập thành công!`);
        history.push('/dashboard');
      } else {
        if (values.password !== values.confirmPassword) {
          message.error('Mật khẩu xác nhận không khớp!');
          return;
        }
        // Real register API call
        await request('/api/v1/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          data: {
            email: values.email,
            password: values.password,
            fullName: values.username,
          },
          skipErrorHandler: true,
        });
        message.success('Đăng ký tài khoản thành công! Vui lòng đăng nhập.');
        setIsLogin(true);
        form.resetFields();
      }
    } catch (error: unknown) {
      showAuthError(error);
    } finally {
      setLoading(false);
    }
  };
  const toggleMode = () => {
    setIsLogin(!isLogin);
    form.resetFields();
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

        <div className={styles.formToggle}>
          <button 
            type="button" 
            className={`${styles.toggleTab} ${isLogin ? styles.activeTab : ''}`}
            onClick={() => !isLogin && toggleMode()}
          >
            Sign In
          </button>
          <button 
            type="button" 
            className={`${styles.toggleTab} ${!isLogin ? styles.activeTab : ''}`}
            onClick={() => isLogin && toggleMode()}
          >
            Sign Up
          </button>
        </div>

        <Form
          form={form}
          name="loginForm"
          initialValues={{ email: '', password: '' }}
          onFinish={onFinish}
          layout="vertical"
          size="large"
        >
          {!isLogin && (
            <Form.Item
              name="username"
              rules={[{ required: true, message: 'Vui lòng nhập tên đăng nhập!' }]}
            >
              <Input 
                prefix={<UserOutlined className={styles.inputIcon} />} 
                placeholder="Full Name" 
                className={styles.loginInput}
              />
            </Form.Item>
          )}

          <Form.Item
            name="email"
            rules={[
              { required: true, message: 'Vui lòng nhập email!' },
              { type: 'email', message: 'Email không hợp lệ!' }
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
            rules={[
              { required: true, message: 'Vui lòng nhập mật khẩu!' },
              ...(!isLogin
                ? [{ min: 6, message: 'Mật khẩu phải có ít nhất 6 ký tự' }]
                : []),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined className={styles.inputIcon} />}
              placeholder="Password"
              className={styles.loginInput}
            />
          </Form.Item>

          {!isLogin && (
            <Form.Item
              name="confirmPassword"
              dependencies={['password']}
              rules={[
                { required: true, message: 'Vui lòng xác nhận mật khẩu!' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('Mật khẩu xác nhận không khớp!'));
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined className={styles.inputIcon} />}
                placeholder="Confirm Password"
                className={styles.loginInput}
              />
            </Form.Item>
          )}

          <Form.Item style={{ marginTop: 32, marginBottom: 8 }}>
            <Button
              type="primary"
              htmlType="submit"
              className={styles.submitBtn}
              loading={loading}
              block
            >
              {isLogin ? 'Sign In' : 'Create Account'}
            </Button>
          </Form.Item>
        </Form>
      </Card>
      
      <div className={styles.loginFooter}>
        <span>CloudOps ©2026 Powered by AWS Cloud Infrastructure</span>
      </div>
    </div>
  );
};

export default Login;
