import { useState } from 'react';
import { Card, Steps, Button, Space, Alert } from 'antd';
import { SettingOutlined, UploadOutlined, CheckCircleOutlined } from '@ant-design/icons';

// Simple test components to avoid import errors
interface StepProps {
  data: any;
  onComplete: (data: any) => void;
  isProcessing: boolean;
}

const TestEventConfigurator = ({ data, onComplete, isProcessing }: StepProps) => {
  const handleSubmit = () => {
    onComplete({
      name: 'Test Event',
      date: '2025-04-27',
      organizer: 'DVOA',
      coursePlanner: 'Test Planner',
      website: 'https://dvoa.org',
      eventType: 'individual'
    });
  };

  return (
    <div>
      <Alert
        message="Event Configuration"
        description="Set up your DVOA event details and select the appropriate event type template."
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />
      <Card title="Event Information">
        <p><strong>Event Name:</strong> {data.name || 'Not set'}</p>
        <p><strong>Date:</strong> {data.date || 'Not set'}</p>
        <p><strong>Organizer:</strong> {data.organizer || 'Not set'}</p>
        <p><strong>Course Planner:</strong> {data.coursePlanner || 'Not set'}</p>
        <div style={{ textAlign: 'right', marginTop: 24 }}>
          <Button type="primary" onClick={handleSubmit} loading={isProcessing}>
            Continue to Course Import
          </Button>
        </div>
      </Card>
    </div>
  );
};

const TestCourseImporter = ({ data, onComplete, isProcessing }: StepProps) => {
  const handleContinue = () => {
    onComplete({
      courses: [
        { id: 1, name: 'White', length: 2225, controls: [31, 32, 33], climb: 40 },
        { id: 2, name: 'Yellow', length: 2700, controls: [41, 42, 43], climb: 50 },
        { id: 3, name: 'Orange', length: 4075, controls: [42, 64, 47], climb: 60 }
      ],
      classes: [
        { id: 1, name: 'White', courseId: 1 },
        { id: 2, name: 'Yellow', courseId: 2 },
        { id: 3, name: 'Orange', courseId: 3 }
      ]
    });
  };

  return (
    <div>
      <Alert
        message="Course Import"
        description="Import XML course files to define available courses and classes for your event."
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />
      <Card title="Course Data">
        <p>Courses: {data.courses?.length || 0}</p>
        <p>Classes: {data.classes?.length || 0}</p>
        <div style={{ textAlign: 'right', marginTop: 24 }}>
          <Button type="primary" onClick={handleContinue} loading={isProcessing}>
            Continue to MeOS XML Generation
          </Button>
        </div>
      </Card>
    </div>
  );
};

const TestMeOSXMLGenerator = ({ data, onComplete, isProcessing }: StepProps) => {
  const handleComplete = () => {
    onComplete({ xmlGenerated: true });
  };

  const handleDownload = () => {
    // Simulate XML download
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<meosdata>
  <Event>
    <Name>${data.name || 'Test Event'}</Name>
    <Date>${data.date || '2025-04-27'}</Date>
  </Event>
</meosdata>`;
    
    const blob = new Blob([xmlContent], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${data.name || 'event'}.meosxml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <Alert
        message="MeOS XML Generation"
        description="Generate the final MeOS XML file ready for import into your MeOS installation."
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />
      <Card title="Event Ready">
        <p><strong>Event:</strong> {data.name || 'Not set'}</p>
        <p><strong>Date:</strong> {data.date || 'Not set'}</p>
        <p><strong>Courses:</strong> {data.courses?.length || 0}</p>
        <p><strong>Classes:</strong> {data.classes?.length || 0}</p>
        <div style={{ textAlign: 'right', marginTop: 24 }}>
          <Space>
            <Button onClick={handleDownload}>Download MeOS XML</Button>
            <Button type="primary" onClick={handleComplete}>
              Complete Event Setup
            </Button>
          </Space>
        </div>
      </Card>
    </div>
  );
};

interface EventData {
  name?: string;
  date?: string;
  organizer?: string;
  coursePlanner?: string;
  website?: string;
  eventType?: string;
  courses?: any[];
  classes?: any[];
  xmlGenerated?: boolean;
}

export default function EventBuilderModule() {
  const [currentStep, setCurrentStep] = useState(0);
  const [eventData, setEventData] = useState<EventData>({});
  const [isProcessing, setIsProcessing] = useState(false);

  const steps = [
    {
      title: 'Event Configuration',
      description: 'Set up event details and type',
      icon: <SettingOutlined />,
    },
    {
      title: 'Course Import',
      description: 'Import XML course files',
      icon: <UploadOutlined />,
    },
    {
      title: 'Generate MeOS File',
      description: 'Create final MeOS import file',
      icon: <CheckCircleOutlined />,
    },
  ];

  const handleStepComplete = (stepData: any) => {
    setEventData(prev => ({ ...prev, ...stepData }));
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <TestEventConfigurator
            data={eventData}
            onComplete={handleStepComplete}
            isProcessing={isProcessing}
          />
        );
      case 1:
        return (
          <TestCourseImporter
            data={eventData}
            onComplete={handleStepComplete}
            isProcessing={isProcessing}
          />
        );
      case 2:
        return (
          <TestMeOSXMLGenerator
            data={eventData}
            onComplete={handleStepComplete}
            isProcessing={isProcessing}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ width: '100%', minWidth: '800px', maxWidth: '1200px', margin: '0 auto' }}>
      <Card title="Event Builder" style={{ marginBottom: 24 }}>
        <Alert
          message="Build Complete MeOS Events"
          description="Create new DVOA events from configuration, import courses and classes, then generate MeOS-ready XML files."
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />
        
        <Steps 
          current={currentStep}
          size="small" 
          style={{ marginBottom: 32 }}
          items={steps}
        />
      </Card>

      <Card>
        {renderStepContent()}
        
        <div style={{ marginTop: 24, textAlign: 'right' }}>
          <Space>
            <Button 
              disabled={currentStep === 0}
              onClick={handleBack}
            >
              Back
            </Button>
            {currentStep === steps.length - 1 && eventData.xmlGenerated && (
              <Button 
                type="primary"
                onClick={() => setCurrentStep(0)}
              >
                Start New Event
              </Button>
            )}
          </Space>
        </div>
      </Card>
    </div>
  );
}