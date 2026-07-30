import { defineConfig } from '@umijs/max';

export default defineConfig({
  antd: {},
  access: {},
  model: {},
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
      name: 'Event Sources',
      path: '/data-sources',
      component: './DataSources',
      icon: 'DatabaseOutlined',
    },
    {
      name: 'Cloud Storage Events',
      path: '/storage',
      component: './Storage',
      icon: 'FolderOpenOutlined',
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
      name: 'Workers',
      path: '/users',
      component: './Users',
      icon: 'UserOutlined',
    },
    {
      name: 'Incidents',
      path: '/alerts',
      component: './Alerts',
      icon: 'WarningOutlined',
    },
    {
      name: 'Logs',
      path: '/logs',
      component: './Logs',
      icon: 'CodeOutlined',
    },
    {
      name: 'Alerts',
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
