import { useState } from 'react';
import { Card, Tabs, Badge, Space, Alert } from 'antd';
import { 
  CheckOutlined, 
  UserAddOutlined, 
  CreditCardOutlined,
  DashboardOutlined 
} from '@ant-design/icons';
import Dashboard from '../../components/Dashboard';
import CheckInInterface from './components/CheckInInterface';
import HiredCardManager from './components/HiredCardManager';

export default function SameDayOperationsModule() {
  const [activeTab, setActiveTab] = useState('dashboard');
  
  const tabItems = [
    {
      key: 'dashboard',
      label: (
        <Space>
          <DashboardOutlined />
          Dashboard
        </Space>
      ),
      children: <Dashboard />,
    },
    {
      key: 'checkin',
      label: (
        <Space>
          <CheckOutlined />
          Check-In
        </Space>
      ),
      children: <CheckInInterface />,
    },
    {
      key: 'registration',
      label: (
        <Space>
          <UserAddOutlined />
          Same-Day Registration
        </Space>
      ),
      children: <div style={{ padding: '20px' }}>Same-day registration interface will be available here.</div>,
    },
    {
      key: 'cards',
      label: (
        <Space>
          <CreditCardOutlined />
          Hired Cards
          <Badge count={25} size="small" />
        </Space>
      ),
      children: <HiredCardManager />,
    },
  ];

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <Card title="Event Day Operations" style={{ marginBottom: 24 }}>
        <Alert
          message="Event Day Management"
          description="Handle pre-registered check-ins, same-day registrations, and hired card management with real-time MeOS integration."
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />
      </Card>

      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          size="large"
        />
      </Card>
    </div>
  );
}