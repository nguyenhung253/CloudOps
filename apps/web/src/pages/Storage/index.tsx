import React, { useState } from 'react';
import { Card, Table, Tag, Input, Space, Button, Breadcrumb, Progress, Modal, message, Upload } from 'antd';
import { 
  FolderOutlined, 
  FileOutlined, 
  DownloadOutlined, 
  DeleteOutlined, 
  SearchOutlined, 
  UploadOutlined, 
  FolderOpenOutlined, 
  DatabaseOutlined
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';

interface S3File {
  id: string;
  name: string;
  type: 'folder' | 'file';
  size: string;
  lastModified: string;
  owner: string;
}

const Storage: React.FC = () => {
  const [currentPath, setCurrentPath] = useState<string[]>(['root']);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [files, setFiles] = useState<S3File[]>([
    { id: '1', name: 'raw-datasets', type: 'folder', size: '--', lastModified: '2026-07-07 10:20', owner: 'iam-role-dataops' },
    { id: '2', name: 'processed-outputs', type: 'folder', size: '--', lastModified: '2026-07-06 18:30', owner: 'iam-role-dataops' },
    { id: '3', name: 'temp-logs', type: 'folder', size: '--', lastModified: '2026-07-05 09:12', owner: 'iam-role-dataops' },
    { id: '4', name: 'cloudops-config.json', type: 'file', size: '12 KB', lastModified: '2026-07-07 15:40', owner: 'admin' },
    { id: '5', name: 'daily_report_final.pdf', type: 'file', size: '1.2 MB', lastModified: '2026-07-07 00:05', owner: 'scheduler-service' },
  ]);

  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [userRole] = useState(() => localStorage.getItem('dataflow_user_role') || 'admin');

  const navigateToFolder = (folderName: string) => {
    setCurrentPath([...currentPath, folderName]);
    // Mock changing folder content
    message.loading(`Loading s3://cloudops-hub-bucket/${currentPath.join('/')}/${folderName}...`, 0.5);
    setTimeout(() => {
      setFiles([
        { id: '10', name: 'sales_data_2026.csv', type: 'file', size: '24.5 MB', lastModified: '2026-07-07 08:30', owner: 'dataops-ingest' },
        { id: '11', name: 'customer_profiles.json', type: 'file', size: '8.4 MB', lastModified: '2026-07-07 09:00', owner: 'dataops-ingest' },
      ]);
    }, 500);
  };

  const navigateUp = (index: number) => {
    if (index === 0) {
      setCurrentPath(['root']);
      setFiles([
        { id: '1', name: 'raw-datasets', type: 'folder', size: '--', lastModified: '2026-07-07 10:20', owner: 'iam-role-dataops' },
        { id: '2', name: 'processed-outputs', type: 'folder', size: '--', lastModified: '2026-07-06 18:30', owner: 'iam-role-dataops' },
        { id: '3', name: 'temp-logs', type: 'folder', size: '--', lastModified: '2026-07-05 09:12', owner: 'iam-role-dataops' },
        { id: '4', name: 'cloudops-config.json', type: 'file', size: '12 KB', lastModified: '2026-07-07 15:40', owner: 'admin' },
        { id: '5', name: 'daily_report_final.pdf', type: 'file', size: '1.2 MB', lastModified: '2026-07-07 00:05', owner: 'scheduler-service' },
      ]);
    } else {
      const newPath = currentPath.slice(0, index + 1);
      setCurrentPath(newPath);
    }
  };

  const deleteFile = (id: string, name: string) => {
    if (userRole === 'viewer') {
      message.error('Bạn không có quyền xóa tệp trên S3!');
      return;
    }
    setFiles(files.filter(f => f.id !== id));
    message.success(`Đã xóa thành công s3://cloudops-hub-bucket/${name}`);
  };

  const downloadFile = (name: string) => {
    message.success(`Đang tải tệp: ${name} (từ AWS S3 Presigned URL)`);
  };

  const previewFile = (file: S3File) => {
    message.loading('Đang tải bản xem trước từ S3...', 0.5);
    setTimeout(() => {
      if (file.name.endsWith('.json')) {
        setPreviewContent(JSON.stringify({
          projectId: "CloudOpsHub",
          version: "1.0.4",
          awsRegion: "ap-southeast-1",
          concurrencyLimit: 20,
          retryPolicy: {
            maxAttempts: 3,
            backoffRate: 2.0
          }
        }, null, 2));
      } else {
        setPreviewContent(`"id","name","email","country"\n"1","Alex Jones","alex.jones@example.com","US"\n"2","Maria Rossi","maria.rossi@example.com","IT"\n"3","Ken Tanaka","ken.tanaka@example.com","JP"`);
      }
      setIsPreviewVisible(true);
    }, 600);
  };

  const handleUploadS3 = (info: any) => {
    if (userRole === 'viewer') {
      message.error('Bạn không có quyền upload tệp lên S3!');
      return;
    }
    const { status } = info.file;
    if (status === 'done' || info.file) {
      const newFile: S3File = {
        id: String(files.length + 10),
        name: info.file.name,
        type: 'file',
        size: '420 KB',
        lastModified: new Date().toISOString().replace('T', ' ').substring(0, 16),
        owner: localStorage.getItem('dataflow_username') || 'admin'
      };
      setFiles([newFile, ...files]);
      message.success(`Đã tải lên tệp: ${info.file.name} lên AWS S3`);
    }
  };

  const filteredFiles = files.filter(f => f.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: S3File) => {
        if (record.type === 'folder') {
          return (
            <Button 
              type="link" 
              icon={<FolderOutlined style={{ color: '#ff7a45', fontSize: '18px' }} />} 
              onClick={() => navigateToFolder(record.name)}
              style={{ padding: 0, height: 'auto', fontWeight: 600, color: '#ff7a45' }}
            >
              {text}
            </Button>
          );
        }
        return (
          <Space>
            <FileOutlined style={{ color: '#1890ff', fontSize: '18px' }} />
            <span style={{ color: '#fff' }}>{text}</span>
          </Space>
        );
      },
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => <Tag color={type === 'folder' ? 'orange' : 'blue'}>{type.toUpperCase()}</Tag>,
    },
    {
      title: 'Size',
      dataIndex: 'size',
      key: 'size',
      render: (size: string) => <span style={{ color: '#8c8c8c' }}>{size}</span>,
    },
    {
      title: 'Last Modified',
      dataIndex: 'lastModified',
      key: 'lastModified',
      render: (time: string) => <span style={{ color: '#8c8c8c' }}>{time}</span>,
    },
    {
      title: 'IAM Owner',
      dataIndex: 'owner',
      key: 'owner',
      render: (owner: string) => <code style={{ color: '#9254de' }}>{owner}</code>,
    },
    {
      title: 'Actions',
      key: 'action',
      render: (_: any, record: S3File) => (
        <Space size="middle">
          {record.type === 'file' && (
            <>
              <Button 
                type="text" 
                icon={<DownloadOutlined style={{ color: '#52c41a' }} />} 
                onClick={() => downloadFile(record.name)}
              />
              <Button 
                type="text" 
                icon={<FolderOpenOutlined style={{ color: '#1890ff' }} />} 
                onClick={() => previewFile(record)}
              />
            </>
          )}
          <Button 
            type="text" 
            danger
            icon={<DeleteOutlined />} 
            onClick={() => deleteFile(record.id, record.name)}
            disabled={userRole === 'viewer'}
          />
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      title={<span style={{ color: '#fff', fontSize: '24px', fontWeight: 600 }}>Cloud Storage Events</span>}
      subTitle={<span style={{ color: '#8c8c8c' }}>Direct bucket objects control panel with IAM rules</span>}
    >
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <Space>
            <DatabaseOutlined style={{ color: '#ff5722', fontSize: '20px' }} />
            <div>
              <div style={{ color: '#fff', fontWeight: 600 }}>Bucket: cloudops-hub-bucket</div>
              <div style={{ color: '#8c8c8c', fontSize: '12px' }}>Region: ap-southeast-1 (Singapore)</div>
            </div>
          </Space>
          <div style={{ width: '300px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#8c8c8c', fontSize: '12px', marginBottom: 4 }}>
              <span>Storage Used: 3.4 TB</span>
              <span>Limit: 10 TB</span>
            </div>
            <Progress percent={34} size="small" strokeColor="#ff5722" trailColor="#222" />
          </div>
        </div>
      </Card>

      <Card bordered={false}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <Breadcrumb style={{ color: '#8c8c8c' }}>
            {currentPath.map((folder, index) => (
              <Breadcrumb.Item key={index}>
                <span 
                  onClick={() => navigateUp(index)} 
                  style={{ cursor: 'pointer', color: index === currentPath.length - 1 ? '#ff5722' : '#8c8c8c', fontWeight: 500 }}
                >
                  {folder}
                </span>
              </Breadcrumb.Item>
            ))}
          </Breadcrumb>

          <Space>
            <Input
              placeholder="Search files..."
              prefix={<SearchOutlined style={{ color: '#8c8c8c' }} />}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ width: 220, backgroundColor: '#121212', border: '1px solid #333', color: '#fff' }}
            />
            <Upload 
              customRequest={({ onSuccess }) => setTimeout(() => onSuccess?.('ok'), 600)}
              onChange={handleUploadS3}
              showUploadList={false}
              disabled={userRole === 'viewer'}
            >
              <Button type="primary" icon={<UploadOutlined />} disabled={userRole === 'viewer'}>
                Upload to S3
              </Button>
            </Upload>
          </Space>
        </div>

        <Table 
          columns={columns} 
          dataSource={filteredFiles} 
          rowKey="id"
          pagination={false}
          style={{ backgroundColor: '#1c1c1c' }}
        />
      </Card>

      <Modal
        title={<span style={{ color: '#fff' }}>S3 Object Contents Preview</span>}
        open={isPreviewVisible}
        onCancel={() => setIsPreviewVisible(false)}
        footer={[
          <Button key="close" type="primary" onClick={() => setIsPreviewVisible(false)}>
            Close
          </Button>
        ]}
        width={700}
        className="glass-panel"
      >
        <pre className="terminal-container" style={{ margin: '12px 0', maxHeight: '450px' }}>
          {previewContent}
        </pre>
      </Modal>
    </PageContainer>
  );
};

export default Storage;
