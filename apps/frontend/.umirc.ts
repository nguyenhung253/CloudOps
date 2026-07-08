import { defineConfig } from '@umijs/max';

export default defineConfig({
  antd: {},
  access: {},
  model: {},
  initialState: {},
  request: {},
  layout: {
    title: 'DataFlowHub',
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
      name: 'Dashboard Overview',
      path: '/dashboard',
      component: './Dashboard',
      icon: 'DashboardOutlined',
    },
    {
      name: 'ETL Pipelines',
      path: '/pipelines',
      component: './Pipelines',
      icon: 'SyncOutlined',
    },
    {
      name: 'Data Sources',
      path: '/data-sources',
      component: './DataSources',
      icon: 'DatabaseOutlined',
    },
    {
      name: 'S3 File Storage',
      path: '/storage',
      component: './Storage',
      icon: 'FolderOpenOutlined',
    },
    {
      name: 'Log Console',
      path: '/logs',
      component: './Logs',
      icon: 'CodeOutlined',
    },
    {
      name: 'Realtime Telemetry',
      path: '/monitoring',
      component: './Monitoring',
      icon: 'DesktopOutlined',
    },
    {
      name: 'Alert Center',
      path: '/alerts',
      component: './Alerts',
      icon: 'WarningOutlined',
    },
    {
      name: 'Cron Scheduler',
      path: '/scheduler',
      component: './Scheduler',
      icon: 'CalendarOutlined',
    },
    {
      name: 'Reports & Analytics',
      path: '/reports',
      component: './Reports',
      icon: 'BarChartOutlined',
    },
    {
      name: 'User Management',
      path: '/users',
      component: './Users',
      icon: 'UserOutlined',
    },
    {
      name: 'System Settings',
      path: '/settings',
      component: './Settings',
      icon: 'SettingOutlined',
    },
  ],
  npmClient: 'pnpm',
});
