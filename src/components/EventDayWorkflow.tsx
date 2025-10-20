import React, { useEffect, useState } from 'react';
import { Card, Typography, Steps, Alert, Button, Space, message } from 'antd';
import { 
  UploadOutlined, 
  CheckCircleOutlined, 
  SolutionOutlined, 
  CreditCardOutlined,
  UserAddOutlined,
  DatabaseOutlined,
  ArrowLeftOutlined
} from '@ant-design/icons';
import JotformImport from './JotformImport';
import EntryReviewAndFix from './EntryReviewAndFix';
import { localEntryService } from '../services/localEntryService';
import { runnerCloudSyncService } from '../services/runnerCloudSyncService';

const { Title, Text, Paragraph } = Typography;

interface EventDayWorkflowProps {
  onBack?: () => void;
  onOpenDayDashboard?: () => void;
}

const EventDayWorkflow: React.FC<EventDayWorkflowProps> = ({ onBack, onOpenDayDashboard }) => {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    // Component initialization
  }, []);

  const steps = [
    { title: 'Import Entries', description: 'Load OE12 from EventReg', icon: <UploadOutlined /> },
    { title: 'Review & Fix', description: 'Validate against runner DB', icon: <SolutionOutlined /> },
    { title: 'Event Operations', description: 'Check-in & same-day reg', icon: <UserAddOutlined /> },
    { title: 'MeOS Sync', description: 'Real-time entry sync', icon: <DatabaseOutlined /> }
  ];

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <Card title="Step 1: Import Latest OE12 File">
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="Import OE12 (EventReg) CSV file with pre-registered entries"
              description={
                <div>
                  <Paragraph>
                    Upload your OE12 CSV export from EventReg containing runner entries. 
                    The system will validate all required information:
                  </Paragraph>
                  <ul style={{ marginLeft: 16, marginBottom: 0 }}>
                    <li>Name (First and Last)</li>
                    <li>Year of birth</li>
                    <li>Club</li>
                    <li>E-punch ID (SI card number)</li>
                    <li>Email and Phone</li>
                    <li>Course and Class assignments</li>
                  </ul>
                </div>
              }
            />
            <JotformImport />
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Button 
                type="primary" 
                onClick={() => setCurrentStep(1)}
                disabled={false} // TODO: Enable when entries are imported
              >
                Continue to Review & Fix
              </Button>
            </div>
          </Card>
        );

      case 1:
        return (
          <div>
            <EntryReviewAndFix />
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Space>
                <Button onClick={() => setCurrentStep(0)}>Back</Button>
                <Button 
                  type="primary"
                  onClick={() => {
                    const hasEntries = localEntryService.getAllEntries().length > 0;
                    if (!hasEntries) {
                      alert('No entries found. Please import entries before opening the Event Day Dashboard.');
                      setCurrentStep(0);
                      return;
                    }
                    if (onOpenDayDashboard) onOpenDayDashboard();
                  }}
                  disabled={localEntryService.getAllEntries().length === 0}
                >
                  Open Event Day Dashboard
                </Button>
              </Space>
            </div>
          </div>
        );

      case 2:
        return (
          <Card title="Step 3: Event Day Check-In & Registration">
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="Live Check-In and Same-Day Registration"
              description={
                <div>
                  <Paragraph>Two main workflows will be available:</Paragraph>
                  <div style={{ marginLeft: 16 }}>
                    <Paragraph><strong>A. Check-in (pre-registered runners)</strong></Paragraph>
                    <ul style={{ marginLeft: 16 }}>
                      <li>Runners with own e-punch: Punch → Display info → Make corrections → Check-in</li>
                      <li>Runners with hired e-punch: Name lookup → Display info → Assign rental → Punch to confirm</li>
                    </ul>
                    <Paragraph><strong>B. Same Day Registration</strong></Paragraph>
                    <ul style={{ marginLeft: 16 }}>
                      <li>New runner dialog with auto-complete from DVOA Runner Database</li>
                      <li>Collect: Name, Club, Year Born, Course/class, E-punch rental, Phone, Email</li>
                      <li>Update DVOA Runner Database with new information</li>
                    </ul>
                  </div>
                </div>
              }
            />
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <Text type="secondary">Check-in and registration interface coming soon...</Text>
              <div style={{ marginTop: 16 }}>
                <Space>
                  <Button onClick={() => setCurrentStep(1)}>Back</Button>
                  <Button 
                    type="primary"
                    onClick={() => {
                      const hasEntries = localEntryService.getAllEntries().length > 0;
                      if (!hasEntries) {
                        alert('No entries found. Please import entries before opening the Event Day Dashboard.');
                        setCurrentStep(0);
                        return;
                      }
                      if (onOpenDayDashboard) onOpenDayDashboard();
                    }}
                    disabled={localEntryService.getAllEntries().length === 0}
                  >
                    Open Event Day Dashboard
                  </Button>
                </Space>
              </div>
            </div>
          </Card>
        );

      case 3:
        return (
          <Card title="Step 4: Real-Time MeOS Integration">
            <Alert
              type="success"
              showIcon
              style={{ marginBottom: 16 }}
              message="Automatic Entry Sync with MeOS"
              description={
                <div>
                  <Paragraph>
                    After each runner checks in for a course, their entry data will be passed to MeOS 
                    in real-time using the REST API.
                  </Paragraph>
                  <Paragraph>
                    <strong>Benefits:</strong>
                  </Paragraph>
                  <ul style={{ marginLeft: 16, marginBottom: 0 }}>
                    <li>Limits runners in MeOS to only those who checked in</li>
                    <li>Easier to use radio control for the start</li>
                    <li>Better tracking of runners in the forest for each runner/course combination</li>
                    <li>Enables multiple course runs per participant</li>
                  </ul>
                </div>
              }
            />
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <Text type="secondary">Real-time MeOS API integration coming soon...</Text>
              <div style={{ marginTop: 16 }}>
                <Space>
                  <Button onClick={() => setCurrentStep(2)}>Back</Button>
                  <Button type="primary" onClick={() => setCurrentStep(4)}>
                    Continue to MeOS Sync
                  </Button>
                </Space>
              </div>
            </div>
          </Card>
        );

      case 4:
        return (
          <Card title="Step 5: Real-Time MeOS Integration">
            <Alert
              type="success"
              showIcon
              style={{ marginBottom: 16 }}
              message="Automatic Entry Sync with MeOS"
              description={
                <div>
                  <Paragraph>
                    After each runner checks in for a course, their entry data will be passed to MeOS 
                    in real-time using the REST API.
                  </Paragraph>
                  <Paragraph>
                    <strong>Benefits:</strong>
                  </Paragraph>
                  <ul style={{ marginLeft: 16, marginBottom: 0 }}>
                    <li>Limits runners in MeOS to only those who checked in</li>
                    <li>Easier to use radio control for the start</li>
                    <li>Better tracking of runners in the forest for each runner/course combination</li>
                    <li>Enables multiple course runs per participant</li>
                  </ul>
                </div>
              }
            />
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <Text type="secondary">Real-time MeOS API integration coming soon...</Text>
              <div style={{ marginTop: 16 }}>
                <Space>
                  <Button onClick={() => setCurrentStep(3)}>Back</Button>
                  <Button 
                    type="primary" 
                    onClick={() => {
                      const hasEntries = localEntryService.getAllEntries().length > 0;
                      if (!hasEntries) {
                        alert('No entries found. Please import OE12/Jotform entries before opening the Event Day Dashboard.');
                        setCurrentStep(0);
                        return;
                      }
                      if (onOpenDayDashboard) {
                        onOpenDayDashboard();
                      }
                    }}
                    disabled={localEntryService.getAllEntries().length === 0}
                  >
                    Open Event Day Dashboard
                  </Button>
                </Space>
              </div>
            </div>
          </Card>
        );

      default:
        return null;
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {onBack && (
        <div style={{ marginBottom: '24px' }}>
          <Button 
            icon={<ArrowLeftOutlined />}
            onClick={onBack}
            size="large"
          >
            Back to Dashboard
          </Button>
        </div>
      )}

      <Title level={2} style={{ marginBottom: '8px' }}>Event Day Operations</Title>
      <Text type="secondary">
        Complete workflow for event day check-in and MeOS integration
      </Text>

      <Card style={{ marginTop: '16px', marginBottom: '24px' }}>
        <Steps 
          current={currentStep} 
          items={steps}
          onChange={(step) => setCurrentStep(step)}
        />
      </Card>

      {renderStepContent()}

      {/* DVOA Runner Database Info */}
      <Card 
        title="DVOA Runner Database Integration" 
        type="inner" 
        style={{ marginTop: '24px' }}
      >
        <Alert
          type="info"
          showIcon
          message="Cloud-Synced Runner Database"
          description={
            <div>
              <Paragraph>
                This system maintains a cloud version of the DVOA runner database that syncs 
                with local computers used for MeOS events.
              </Paragraph>
              <ul style={{ marginLeft: 16, marginBottom: 0 }}>
                <li><strong>Online:</strong> Changes sync in real-time with cloud database</li>
                <li><strong>Offline:</strong> Changes are queued and synced when internet is restored</li>
                <li><strong>Event Startup:</strong> Local database always syncs with latest changes</li>
              </ul>
            </div>
          }
        />
      </Card>
    </div>
  );
};

export default EventDayWorkflow;