import React, { useState } from 'react';
import { Form, Input, Button, Card, message } from 'antd';
import { 
  UserOutlined, 
  LockOutlined, 
  CloudServerOutlined, 
  MailOutlined
} from '@ant-design/icons';
import { history, useModel } from '@umijs/max';
import styles from './index.less';

const Login: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const { setInitialState } = useModel('@@initialState');
  const [form] = Form.useForm();

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      if (isLogin) {
        let role = 'viewer';
        if (values.username.toLowerCase() === 'admin') {
          role = 'admin';
        } else if (values.username.toLowerCase() === 'operator') {
          role = 'operator';
        }

        // Mock login token saving
        localStorage.setItem('dataflow_token', 'mock_jwt_token_xxxx');
        localStorage.setItem('dataflow_user_role', role);
        localStorage.setItem('dataflow_username', values.username);

        // Update initial state
        await setInitialState({
          currentUser: {
            name: values.username,
            avatar: 'https://gw.alipayobjects.com/zos/antfincdn/XAosamN5UP/BiazfanxmamNRoxxVxka.png',
            role: role,
          }
        });

        message.success(`Đăng nhập thành công với quyền ${role.toUpperCase()}`);
        history.push('/dashboard');
      } else {
        // Mock signup
        if (values.password !== values.confirmPassword) {
          message.error('Mật khẩu xác nhận không khớp!');
          return;
        }
        message.success('Đăng ký tài khoản thành công! Vui lòng đăng nhập.');
        setIsLogin(true);
        form.resetFields();
      }
    } catch (error) {
      message.error(isLogin ? 'Đăng nhập thất bại, vui lòng thử lại.' : 'Đăng ký thất bại, vui lòng thử lại.');
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
              prefix={<UserOutlined className={styles.inputIcon} />} 
              placeholder="Username" 
              className={styles.loginInput}
            />
          </Form.Item>

          <div className={`${styles.transitionField} ${!isLogin ? styles.transitionFieldVisible : ''}`}>
            <Form.Item
              name="email"
              rules={isLogin ? [] : [
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
          </div>

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

          <div className={`${styles.transitionField} ${!isLogin ? styles.transitionFieldVisible : ''}`}>
            <Form.Item
              name="confirmPassword"
              rules={isLogin ? [] : [{ required: true, message: 'Vui lòng xác nhận mật khẩu!' }]}
            >
              <Input.Password
                prefix={<LockOutlined className={styles.inputIcon} />}
                placeholder="Confirm Password"
                className={styles.loginInput}
              />
            </Form.Item>
          </div>



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
