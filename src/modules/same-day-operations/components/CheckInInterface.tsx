import { Card, Alert, Button, Input, Space, Spin } from 'antd';
import { CheckOutlined, ScanOutlined } from '@ant-design/icons';
import { useState } from 'react';

export default function CheckInInterface() {
  const [isScanning, setIsScanning] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const handleScanCard = () => {
    setIsScanning(true);
    // Simulate SI Reader connection
    setTimeout(() => {
      setIsScanning(false);
      // TODO: Integrate with SportIdent service
    }, 2000);
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <Alert
        message="Pre-Registered Runner Check-In"
        description="Check in runners using SI card scanning or name search. Update information and handle course changes as needed."
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Card title="Check-In Methods" style={{ marginBottom: 24 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Card size="small" title="With Own SI Card" extra={<CheckOutlined />}>
            <p>Runner punches their SI card to automatically load their entry.</p>
            <Button 
              type="primary" 
              icon={<ScanOutlined />}
              loading={isScanning}
              onClick={handleScanCard}
            >
              {isScanning ? 'Waiting for SI Card...' : 'Start SI Card Scanning'}
            </Button>
          </Card>

          <Card size="small" title="Without SI Card (Search)" extra={<CheckOutlined />}>
            <p>Search for runner by name to load their entry.</p>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                placeholder="Enter runner name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Button type="primary">Search</Button>
            </Space.Compact>
          </Card>
        </Space>
      </Card>

      {isScanning && (
        <Card>
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16, fontSize: '16px' }}>
              Please punch your SI card now...
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}