import { Card, Alert, Button, Progress, List } from 'antd';
import { CloudSyncOutlined, CheckOutlined } from '@ant-design/icons';

interface CloudSyncProps {
  onStatusChange: (status: 'synced' | 'pending' | 'error') => void;
  pendingChanges: number;
  onSyncComplete: () => void;
}

export default function CloudSync({ onStatusChange, pendingChanges, onSyncComplete }: CloudSyncProps) {
  const handleSync = () => {
    onStatusChange('pending');
    setTimeout(() => {
      onStatusChange('synced');
      onSyncComplete();
    }, 2000);
  };

  return (
    <div>
      <Alert
        message="Cloud Synchronization"
        description="Keep local and cloud runner databases synchronized."
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Card title="Sync Status" style={{ marginBottom: 24 }}>
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <Progress type="circle" percent={100} status="success" />
          <div style={{ marginTop: 16 }}>Database is synchronized</div>
        </div>
        
        {pendingChanges > 0 && (
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Button 
              type="primary" 
              icon={<CloudSyncOutlined />}
              onClick={handleSync}
            >
              Sync {pendingChanges} Changes
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}