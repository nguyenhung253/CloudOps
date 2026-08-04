import React from 'react';
import { history } from '@umijs/max';
import { Button, Space, Avatar, message, ConfigProvider, theme } from 'antd';
import {
  LogoutOutlined,
  UserOutlined,
  PoweroffOutlined,
  CloudServerOutlined,
  DashboardOutlined,
  SyncOutlined,
  DatabaseOutlined,
  FolderOpenOutlined,
  CodeOutlined,
  WarningOutlined,
  ClockCircleOutlined,
  BarChartOutlined,
  SettingOutlined,
  CalendarOutlined,
  CloudOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import type { RunTimeLayoutConfig } from '@umijs/max';
import HeaderActions from '@/components/HeaderActions';

// Dynamic header title/subtitle mapping based on pathname
const getHeaderInfo = (pathname: string) => {
  switch (pathname) {
    case '/dashboard':
      return { title: 'System Health Overview', sub: 'Real-time cloud operations, jobs, workers and incidents' };
    case '/cloud-accounts':
      return { title: 'Cloud Accounts', sub: 'Manage cloud provider accounts, IAM roles, and cross-account access permissions' };
    case '/pipelines':
    case '/jobs':
    case '/table':
      return { title: 'Jobs & Queues', sub: 'Manage background jobs and queue metrics' };
    case '/data-sources':
      return { title: 'Event Sources', sub: 'Configure event receivers, validate signatures, and dispatch queue events' };
    case '/storage':
      return { title: 'Cloud Storage Events', sub: 'Explore cloud storage event payloads and backup archives' };
    case '/logs':
      return { title: 'Distributed Logs', sub: 'Aggregated logs from API gateways, message queues, and worker processes' };
    case '/monitoring':
      return { title: 'Telemetry & Metrics', sub: 'Real-time active worker processes, Redis queue capacity, and load parameters' };
    case '/alerts':
      return { title: 'Alerts Console', sub: 'Active alerts, severity levels, and incident management' };
    case '/scheduler':
      return { title: 'Job Schedules', sub: 'Configure recurring sync and collection schedules' };
    case '/reports':
      return { title: 'Reports & Analytics', sub: 'SLA trends, MTTR analytics, and resolution reports' };
    case '/users':
      return { title: 'Users & Access Control', sub: 'Manage operators, RBAC policies, and account security' };
    case '/workers':
      return { title: 'Worker Pool', sub: 'Active BullMQ worker processes, queue concurrency, and heartbeat status' };
    case '/settings':
      return { title: 'System Settings', sub: 'Configure global adapters, SMTP relays, and parameter stores' };
    default:
      return { title: 'CloudOps', sub: 'Unified Cloud Incident & Events Console' };
  }
};

// Map routes to appropriate icons for header title (soft coral orange: #e26f54)
const getHeaderIcon = (pathname: string) => {
  const iconStyle = { fontSize: '22px', color: '#e26f54' };
  switch (pathname) {
    case '/dashboard':
      return React.createElement(DashboardOutlined, { style: iconStyle });
    case '/cloud-accounts':
      return React.createElement(CloudOutlined, { style: iconStyle });
    case '/pipelines':
    case '/jobs':
    case '/table':
      return React.createElement(SyncOutlined, { style: iconStyle });
    case '/data-sources':
      return React.createElement(DatabaseOutlined, { style: iconStyle });
    case '/storage':
      return React.createElement(FolderOpenOutlined, { style: iconStyle });
    case '/logs':
      return React.createElement(CodeOutlined, { style: iconStyle });
    case '/monitoring':
      return React.createElement(CloudServerOutlined, { style: iconStyle });
    case '/alerts':
      return React.createElement(WarningOutlined, { style: iconStyle });
    case '/scheduler':
      return React.createElement(CalendarOutlined, { style: iconStyle });
    case '/reports':
      return React.createElement(BarChartOutlined, { style: iconStyle });
    case '/users':
      return React.createElement(UserOutlined, { style: iconStyle });
    case '/workers':
      return React.createElement(ThunderboltOutlined, { style: iconStyle });
    case '/settings':
      return React.createElement(SettingOutlined, { style: iconStyle });
    default:
      return React.createElement(CloudServerOutlined, { style: iconStyle });
  }
};

// Access validation check
export async function getInitialState(): Promise<{
  currentUser?: {
    name: string;
    avatar?: string;
    role: string;
  };
}> {
  const token = localStorage.getItem('dataflow_token');
  const role = localStorage.getItem('dataflow_user_role');
  const username = localStorage.getItem('dataflow_username');

  // If we are on login page, don't force redirect
  if (location.pathname === '/login') {
    return {};
  }

  if (!token) {
    history.push('/login');
    return {};
  }

  return {
    currentUser: {
      name: username || 'Admin',
      avatar: '/account.png',
      role: role || 'admin',
    },
  };
}

// Runtime Layout configuration
export const layout: RunTimeLayoutConfig = ({ initialState, setInitialState }) => {
  const isLoginPage = location.pathname === '/login';

  return {
    logo: false,
    title: false,
    pure: isLoginPage, // Hides sidebar & top-bar on Login Page
    layout: 'side',
    navTheme: 'realDark',
    colorPrimary: '#e26f54', // Soft coral orange
    
    // Disable native header so we can render our custom sticky header cleanly inside childrenRender
    headerRender: false,

    // Custom layout children wrapper to inject our premium sticky header directly into the page content
    childrenRender: (children, props) => {
      if (isLoginPage) return children;
      const info = getHeaderInfo(location.pathname);
      const icon = getHeaderIcon(location.pathname);
      const leftGap = props?.collapsed ? 80 : 256;

      return React.createElement(
        'div',
        { style: { minHeight: '100vh', position: 'relative' } },
        // Custom Sticky Top Header (Navbar)
        React.createElement(
          'div',
          {
            style: {
              position: 'fixed',
              top: 0,
              right: 0,
              left: `${leftGap}px`,
              height: '72px',
              backgroundColor: 'rgba(22, 22, 22, 0.75)', // Muted glassmorphism background
              backdropFilter: 'blur(12px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 24px',
              zIndex: 99,
              transition: 'left 0.2s ease',
            }
          },
          // Left side: Title and Subtitle with colored icon
          React.createElement(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
            icon,
            React.createElement(
              'div',
              { style: { display: 'flex', flexDirection: 'column' } },
              React.createElement(
                'span',
                { style: { color: '#d4d4d4', fontSize: '20px', fontWeight: 600, lineHeight: '1.2', fontFamily: "'Outfit', sans-serif" } }, // Softer white
                info.title
              ),
              React.createElement(
                'span',
                { style: { color: '#7a7a7a', fontSize: '11px', fontWeight: 400, marginTop: '2px', lineHeight: '1' } }, // Muted subtitle
                info.sub
              )
            )
          ),
          // Right side: Theme / Appstore actions
          React.createElement(
            'div',
            { style: { display: 'flex', alignItems: 'center' } },
            React.createElement(HeaderActions)
          )
        ),
        // Page Content Area pushed down by the header height
        React.createElement(
          'div',
          { style: { paddingTop: '72px' } },
          children
        )
      );
    },

    // Custom menu header for the sidebar with macOS window control dots and brand logo/title
    menuHeaderRender: (logoDom, titleDom, props) => {
      if (isLoginPage) return null;
      if (props?.collapsed) {
        return React.createElement('div', { style: { height: '36px' } });
      }
      return React.createElement(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '24px', padding: '12px 16px 8px 12px' } },
        // Three macOS window control dots (red, yellow, green)
        React.createElement(
          Space,
          { size: 6 },
          React.createElement('div', { style: { width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#ff5f56' } }),
          React.createElement('div', { style: { width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#ffbd2e' } }),
          React.createElement('div', { style: { width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#27c93f' } })
        ),
        // Logo and title (Using img from public directory)
        React.createElement(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '0px' } },
          React.createElement('img', { src: '/logo.png', alt: 'CloudOps Logo', style: { width: '28px', height: '28px', objectFit: 'contain' } }),
          React.createElement(
            'span',
            { style: { color: '#fff', fontSize: '18px', fontWeight: 600, fontFamily: "'Outfit', sans-serif" } },
            'CloudOps'
          )
        )
      );
    },

    // Custom menu layout to look exactly like the dark sidebar list
    menuExtraRender: (props) => {
      if (isLoginPage || props?.collapsed) return null;
      return React.createElement(
        'div',
        { style: { padding: '8px 12px', color: '#ff7a45', fontSize: '11px', fontWeight: 600 } },
        'SYSTEM DASHBOARD'
      );
    },

    // Bottom of Sidebar containing only the User Profile and Shutdown button
    menuFooterRender: (props) => {
      if (isLoginPage || props?.collapsed) return null;

      const handleLogout = async () => {
        localStorage.removeItem('dataflow_token');
        localStorage.removeItem('dataflow_user_role');
        localStorage.removeItem('dataflow_username');
        await setInitialState({});
        message.success('Đã đăng xuất thành công.');
        history.push('/login');
      };

      return React.createElement(
        'div',
        { 
          style: { 
            padding: '12px', 
            borderTop: '1px solid #262626',
            backgroundColor: '#1f1f1f',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          } 
        },
        // 1. User Profile Box
        React.createElement(
          'div',
          { 
            style: { 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              padding: '8px 10px',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              borderRadius: '8px',
              border: '1px solid #262626'
            } 
          },
          React.createElement(
            Space,
            { size: 'small' },
            React.createElement(Avatar, { 
              size: 'small', 
              src: initialState?.currentUser?.avatar || undefined, 
              icon: !initialState?.currentUser?.avatar ? React.createElement(UserOutlined) : undefined 
            }),
            React.createElement(
              'div',
              { style: { display: 'flex', flexDirection: 'column' } },
              React.createElement(
                'span',
                { style: { color: '#fff', fontSize: '12px', fontWeight: 600, lineHeight: 1.2 } },
                initialState?.currentUser?.name || ''
              ),
              React.createElement(
                'span',
                { style: { color: '#ff7a45', fontSize: '10px', fontWeight: 500, lineHeight: 1 } },
                (initialState?.currentUser?.role || '').toUpperCase()
              )
            )
          ),
          React.createElement(Button, {
            type: 'text',
            size: 'small',
            danger: true,
            icon: React.createElement(LogoutOutlined),
            onClick: handleLogout,
            style: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, width: '24px', height: '24px' }
          })
        ),
        // 2. Shutdown Button
        React.createElement(
          Button,
          {
            type: 'text',
            danger: true,
            block: true,
            icon: React.createElement(PoweroffOutlined),
            onClick: () => {
              localStorage.removeItem('dataflow_token');
              history.push('/login');
              message.success('Đã tắt kết nối tới Cluster node.');
            },
            style: {
              borderRadius: '8px',
              border: '1px solid #ff4d4f',
              color: '#ff4d4f',
              backgroundColor: 'rgba(255, 77, 79, 0.05)',
              height: '36px',
              fontWeight: 500,
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            },
          },
          'Shutdown Cluster'
        )
      );
    },

    onPageChange: () => {
      const token = localStorage.getItem('dataflow_token');
      // If no token and not on login page, send to login
      if (!token && location.pathname !== '/login') {
        history.push('/login');
      }
    },
  };
};

export const request = {
  requestInterceptors: [
    (url: string, options: any) => {
      const token = localStorage.getItem('dataflow_token');
      const headers = options.headers || {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      return {
        url,
        options: { ...options, headers },
      };
    },
  ],
  responseInterceptors: [
    [
      (response: any) => response,
      (error: any) => {
        if (error?.response?.status === 401) {
          localStorage.removeItem('dataflow_token');
          localStorage.removeItem('dataflow_user_role');
          localStorage.removeItem('dataflow_username');
          if (location.pathname !== '/login') {
            location.href = '/login';
          }
        }
        return Promise.reject(error);
      },
    ],
  ],
  errorConfig: {
    errorHandler: (error: any) => {
      if (error?.response?.status === 401) {
        localStorage.removeItem('dataflow_token');
        localStorage.removeItem('dataflow_user_role');
        localStorage.removeItem('dataflow_username');
        if (location.pathname !== '/login') {
          location.href = '/login';
        }
      }
    },
  },
};

// Wrap with Ant Design Dark Theme ConfigProvider (muted coral theme)
export function rootContainer(container: React.ReactNode) {
  return React.createElement(
    ConfigProvider,
    {
      theme: {
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#e26f54', // Soft coral orange from user image
          colorBgBase: '#161616',  // Darker web background (darker than sidebar #1f1f1f)
          colorBgContainer: '#191919', // Darker card background
          colorBorder: '#262626',
          colorTextBase: '#bfbfbf', // Softer text base color
          fontFamily: "'Outfit', -apple-system, sans-serif",
          borderRadius: 8,
        },
        components: {
          Card: {
            colorBgContainer: '#191919',
            colorBorderSecondary: '#262626',
          },
          Table: {
            colorBgContainer: '#191919',
            headerBg: '#161616',
          },
          Menu: {
            colorItemBgSelected: 'rgba(226, 111, 84, 0.12)',
            colorItemTextSelected: '#e26f54',
          },
        },
      },
    },
    container
  );
}
