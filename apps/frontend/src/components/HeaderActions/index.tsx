import React from 'react';
import { Button, Space } from 'antd';
import { SunOutlined, AppstoreOutlined } from '@ant-design/icons';

const HeaderActions: React.FC = () => {
  return React.createElement(
    Space,
    { size: 12 },
    React.createElement(Button, {
      type: 'text',
      icon: React.createElement(SunOutlined, { style: { color: '#8c8c8c', fontSize: '18px' } }),
      style: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px' }
    }),
    React.createElement(Button, {
      type: 'text',
      icon: React.createElement(AppstoreOutlined, { style: { color: '#8c8c8c', fontSize: '18px' } }),
      style: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px' }
    })
  );
};

export default HeaderActions;
