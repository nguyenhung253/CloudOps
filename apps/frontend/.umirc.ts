import { defineConfig } from '@umijs/max';

export default defineConfig({
  antd: {},
  access: {},
  model: {},
  initialState: {},
  request: {},
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
      name: 'Jobs',
      path: '/pipelines',
      component: './Pipelines',
      icon: 'SyncOutlined',
    },
    {
      name: 'Queues',
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
