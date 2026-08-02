import { defineConfig } from '@umijs/max';

export default defineConfig({
  antd: {},
  access: {},
  model: {},
  favicons: ['/logo.png'],
  initialState: {},
  request: {},
  proxy: {
    '/api': {
      target: 'http://localhost:3000',
      changeOrigin: true,
    },
  },
  layout: {
    title: 'CloudOps',
    layout: 'side',
  },
  routes: [
    {
      path: '/',
      redirect: '/dashboard',
    },
    {
      path: '/login',
      component: './Login',
      layout: false,
    },
    {
      path: '/reset-password',
      component: './Login/ResetPassword',
      layout: false,
    },
    {
      name: 'Overview',
      path: '/dashboard',
      component: './Dashboard',
      icon: 'DashboardOutlined',
    },
    {
      name: 'Cloud Accounts',
      path: '/cloud-accounts',
      component: './CloudAccounts',
      icon: 'CloudOutlined',
    },
    {
      name: 'Jobs & Queues',
      path: '/jobs',
      component: './Table',
      icon: 'SyncOutlined',
    },
    {
      path: '/pipelines',
      component: './Pipelines',
      hideInMenu: true,
    },
    {
      path: '/table',
      component: './Table',
      hideInMenu: true,
    },
    {
      name: 'Schedules',
      path: '/scheduler',
      component: './Scheduler',
      icon: 'CalendarOutlined',
    },
    {
      name: 'Users',
      path: '/users',
      component: './Users',
      icon: 'UserOutlined',
    },
    {
      name: 'Workers',
      path: '/workers',
      component: './Workers',
      icon: 'ThunderboltOutlined',
    },
    {
      name: 'Alerts',
      path: '/alerts',
      component: './Alerts',
      icon: 'WarningOutlined',
    },
    {
      name: 'Notifications',
      path: '/notifications',
      component: './Notifications',
      icon: 'BellOutlined',
    },
    {
      name: 'Logs',
      path: '/logs',
      component: './Logs',
      icon: 'CodeOutlined',
    },
    {
      name: 'Reports',
      path: '/reports',
      component: './Reports',
      icon: 'BarChartOutlined',
    },
    {
      name: 'Telemetry',
      path: '/monitoring',
      component: './Monitoring',
      icon: 'DesktopOutlined',
    },
    {
      name: 'Settings',
      path: '/settings',
      component: './Settings',
      icon: 'SettingOutlined',
    },
  ],
  npmClient: 'pnpm',
});
