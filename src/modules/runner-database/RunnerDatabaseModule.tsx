import { useState } from 'react';
import { Card, Tabs, Space, Alert, Badge, Button } from 'antd';
import { 
  DatabaseOutlined, 
  CloudSyncOutlined, 
  UserOutlined,
  ImportOutlined,
  ExportOutlined,
  HistoryOutlined
} from '@ant-design/icons';
import RunnerSearch from './components/RunnerSearch';
import CloudSync from './components/CloudSync';
import DataImportExport from './components/DataImportExport';
import AuditLog from './components/AuditLog';

export default function RunnerDatabaseModule() {
  const [activeTab, setActiveTab] = useState('search');
  const [syncStatus, setSyncStatus] = useState<'synced' | 'pending' | 'error'>('synced');
  const [pendingChanges, setPendingChanges] = useState(0);

  const getSyncBadge = () => {
    if (pendingChanges > 0) {
      return <Badge count={pendingChanges} size="small" />;
    }
    return null;
  };

  const getSyncColor = () => {
    switch (syncStatus) {
      case 'synced': return '#52c41a';
      case 'pending': return '#faad14';
      case 'error': return '#ff4d4f';
      default: return '#d9d9d9';
    }
  };

  const tabItems = [
    {
      key: 'search',
      label: (
        <Space>
          <UserOutlined />
          Search Runners
        </Space>
      ),
      children: <RunnerSearch onDataChange={(count) => setPendingChanges(count)} />,
    },
    {
      key: 'sync',
      label: (
        <Space>
          <CloudSyncOutlined style={{ color: getSyncColor() }} />
          Cloud Sync
          {getSyncBadge()}
        </Space>
      ),
      children: (
        <CloudSync 
          onStatusChange={setSyncStatus}
          pendingChanges={pendingChanges}
          onSyncComplete={() => setPendingChanges(0)}
        />
      ),
    },
    {
      key: 'import-export',
      label: (
        <Space>
          <ImportOutlined />
          Import/Export
        </Space>
      ),
      children: <DataImportExport />,
    },
    {
      key: 'audit',
      label: (
        <Space>
          <HistoryOutlined />
          Audit Log
        </Space>
      ),
      children: <AuditLog />,
    },
  ];

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <Card title="DVOA Runner Database" style={{ marginBottom: 24 }}>
        <Alert
          message="Centralized Runner Management"
          description="Manage the DVOA runner database with cloud synchronization, data validation, and comprehensive audit tracking."
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Space>
            <span>Status: </span>
            <Badge 
              status={syncStatus === 'synced' ? 'success' : syncStatus === 'pending' ? 'warning' : 'error'} 
              text={syncStatus === 'synced' ? 'Synchronized' : syncStatus === 'pending' ? 'Changes Pending' : 'Sync Error'}
            />
          </Space>
          
          <Space>
            {pendingChanges > 0 && (
              <Button 
                type="primary" 
                icon={<CloudSyncOutlined />}
                onClick={() => setActiveTab('sync')}
              >
                Sync {pendingChanges} Changes
              </Button>
            )}
          </Space>
        </div>
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