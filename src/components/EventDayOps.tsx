import React from 'react';
import { Card, Typography, Steps, Alert } from 'antd';
import { UploadOutlined, CheckCircleOutlined, SolutionOutlined, CreditCardOutlined } from '@ant-design/icons';
import JotformImport from './JotformImport';
import EventDayWorkflow from './EventDayWorkflow';

const { Title, Paragraph, Text } = Typography;

interface EventDayOpsProps {
  onBack?: () => void;
  onOpenDayDashboard?: () => void;
}

const EventDayOps: React.FC<EventDayOpsProps> = ({ onBack, onOpenDayDashboard }) => {
  const steps = [
    { title: 'Import Entries', description: 'Load OE12 or Jotform CSV', icon: <UploadOutlined /> },
    { title: 'Review & Fix', description: 'Resolve data issues', icon: <SolutionOutlined /> },
    { title: 'Check-In', description: 'Assign cards and check-in', icon: <CreditCardOutlined /> },
    { title: 'Run Event', description: 'Sync with MeOS (coming soon)', icon: <CheckCircleOutlined /> },
  ];

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Title level={2} style={{ marginBottom: '8px' }}>Event Day Operations</Title>
      <Text type="secondary">Step 1: Import entries from OE12 CSV (EventReg) or Jotform MeOS CSV</Text>

      <Card style={{ marginTop: '16px', marginBottom: '16px' }}>
        <Steps current={0} items={steps} />
      </Card>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={
          <span>
            To start, upload your OE12 CSV file (e.g. exported from EventReg). We will parse it and save entries locally for check-in. <br/>
            Example: <Text code>...dvoabrandywine2025_oe12m_20250918003744.csv</Text>
          </span>
        }
      />

      <EventDayWorkflow onBack={onBack} onOpenDayDashboard={onOpenDayDashboard} />
    </div>
  );
};

export default EventDayOps;
