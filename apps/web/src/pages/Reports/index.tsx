import React, { useState } from 'react';
import { Card, Row, Col, Button, Table, Tag, DatePicker, Select, Space, message, Statistic, Typography } from 'antd';
import { 
  FilePdfOutlined, 
  FileExcelOutlined, 
  FileTextOutlined, 
  SearchOutlined, 
  BarChartOutlined,
  CalendarOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';

const { Title, Paragraph } = Typography;

interface Report {
  id: string;
  name: string;
  type: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  period: string;
  processedEvents: string;
  avgResolutionTime: string;
  successRate: number;
}

const Reports: React.FC = () => {
  const [reportType, setReportType] = useState<'ALL' | 'DAILY' | 'WEEKLY' | 'MONTHLY'>('ALL');
  const [reports] = useState<Report[]>([
    { id: '1', name: 'CloudOps Daily Report - July 7', type: 'DAILY', period: '2026-07-07', processedEvents: '45,820', avgResolutionTime: '12m', successRate: 99.8 },
    { id: '2', name: 'CloudOps Daily Report - July 6', type: 'DAILY', period: '2026-07-06', processedEvents: '41,200', avgResolutionTime: '14m', successRate: 100 },
    { id: '3', name: 'Weekly Incident Performance - W27', type: 'WEEKLY', period: '2026-07-01 to 2026-07-07', processedEvents: '298,500', avgResolutionTime: '15m', successRate: 98.4 },
    { id: '4', name: 'Monthly Executive Summary - June', type: 'MONTHLY', period: '2026-06-01 to 2026-06-30', processedEvents: '1,240,000', avgResolutionTime: '18m', successRate: 99.1 },
  ]);

  const exportReport = (name: string, format: 'PDF' | 'EXCEL' | 'CSV') => {
    message.loading(`Preparing export of "${name}" in ${format} format...`, 1);
    setTimeout(() => {
      message.success(`Successfully exported and downloaded "${name}.${format.toLowerCase()}"`);
    }, 1200);
  };

  const filteredReports = reportType === 'ALL' ? reports : reports.filter(r => r.type === reportType);

  const columns = [
    {
      title: 'Report Title',
      dataIndex: 'name',
      key: 'name',
      render: (t: string) => <strong style={{ color: '#fff' }}>{t}</strong>,
    },
    {
      title: 'Report Type',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => {
        let color = 'blue';
        if (type === 'WEEKLY') color = 'purple';
        else if (type === 'MONTHLY') color = 'magenta';
        return <Tag color={color}>{type}</Tag>;
      },
    },
    {
      title: 'Reporting Period',
      dataIndex: 'period',
      key: 'period',
      render: (t: string) => <span style={{ color: '#8c8c8c' }}>{t}</span>,
    },
    {
      title: 'Events Ingested',
      dataIndex: 'processedEvents',
      key: 'processedEvents',
      render: (t: string) => <span style={{ color: '#fff' }}>{t}</span>,
    },
    {
      title: 'Avg. Resolution Time',
      dataIndex: 'avgResolutionTime',
      key: 'avgResolutionTime',
      render: (t: string) => <span style={{ color: '#8c8c8c' }}>{t}</span>,
    },
    {
      title: 'SLA Success Rate',
      dataIndex: 'successRate',
      key: 'successRate',
      render: (rate: number) => (
        <span style={{ color: rate >= 99 ? '#52c41a' : '#faad14', fontWeight: 600 }}>{rate}%</span>
      ),
    },
    {
      title: 'Export Options',
      key: 'action',
      render: (_: any, record: Report) => (
        <Space>
          <Button 
            size="small" 
            type="text" 
            icon={<FilePdfOutlined style={{ color: '#ff4d4f' }} />} 
            onClick={() => exportReport(record.name, 'PDF')}
          >
            PDF
          </Button>
          <Button 
            size="small" 
            type="text" 
            icon={<FileExcelOutlined style={{ color: '#52c41a' }} />} 
            onClick={() => exportReport(record.name, 'EXCEL')}
          >
            Excel
          </Button>
          <Button 
            size="small" 
            type="text" 
            icon={<FileTextOutlined style={{ color: '#1890ff' }} />} 
            onClick={() => exportReport(record.name, 'CSV')}
          >
            CSV
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      title={<span style={{ color: '#fff', fontSize: '24px', fontWeight: 600 }}>Alerts Analytics</span>}
      subTitle={<span style={{ color: '#8c8c8c' }}>Export analytical summaries and incident mitigation reports</span>}
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false}>
            <Statistic
              title={<span style={{ color: '#8c8c8c' }}>Total Ingested Events</span>}
              value={1582900}
              valueStyle={{ color: '#fff', fontSize: '24px', fontWeight: 'bold' }}
              prefix={<BarChartOutlined style={{ color: '#ff5722', marginRight: 8 }} />}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false}>
            <Statistic
              title={<span style={{ color: '#8c8c8c' }}>Avg. Event Resolution</span>}
              value="12 minutes"
              valueStyle={{ color: '#fff', fontSize: '20px', fontWeight: 'bold' }}
              prefix={<CalendarOutlined style={{ color: '#1890ff', marginRight: 8 }} />}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false}>
            <Statistic
              title={<span style={{ color: '#8c8c8c' }}>Mean Success SLA</span>}
              value={99.3}
              precision={2}
              valueStyle={{ color: '#52c41a', fontSize: '24px', fontWeight: 'bold' }}
              suffix="%"
              prefix={<CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false}>
            <Statistic
              title={<span style={{ color: '#8c8c8c' }}>Top Triggered Rule</span>}
              value="CPU_Over_90_Percent"
              valueStyle={{ color: '#ff7a45', fontSize: '18px', fontWeight: 'bold' }}
            />
          </Card>
        </Col>
      </Row>

      <Card bordered={false} style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <Space>
            <Select 
              value={reportType} 
              onChange={setReportType} 
              style={{ width: 180 }}
              dropdownStyle={{ backgroundColor: '#1c1c1c' }}
            >
              <Select.Option value="ALL">All Summaries</Select.Option>
              <Select.Option value="DAILY">Daily Reports</Select.Option>
              <Select.Option value="WEEKLY">Weekly Summaries</Select.Option>
              <Select.Option value="MONTHLY">Monthly Overview</Select.Option>
            </Select>
            <DatePicker.RangePicker style={{ backgroundColor: '#121212', border: '1px solid #333' }} />
            <Button type="primary" icon={<SearchOutlined />}>
              Filter
            </Button>
          </Space>

          <Button type="dashed" style={{ color: '#ff5722', borderColor: '#ff5722' }}>
            Generate Custom Report
          </Button>
        </div>

        <Table 
          columns={columns} 
          dataSource={filteredReports} 
          rowKey="id"
          pagination={false}
          style={{ backgroundColor: '#1c1c1c' }}
        />
      </Card>
    </PageContainer>
  );
};

export default Reports;
