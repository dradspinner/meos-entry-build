import { useState } from 'react';
import { Card, Steps, Button, Space, Alert } from 'antd';
import { FileTextOutlined, UploadOutlined, SettingOutlined, CheckCircleOutlined } from '@ant-design/icons';
import EventConfigurator from './components/EventConfigurator';
import CourseImporter from './components/CourseImporter';
import OEFileProcessor from './components/OEFileProcessor';
import MeOSXMLGenerator from './components/MeOSXMLGenerator';

interface EventData {
  name?: string;
  date?: string;
  organizer?: string;
  coursePlanner?: string;
  website?: string;
  eventType?: string;
  courses?: any[];
  entries?: any[];
  xmlFile?: string;
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
      title: 'Entry Processing',
      description: 'Process OE registration file',
      icon: <FileTextOutlined />,
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
          <EventConfigurator
            data={eventData}
            onComplete={handleStepComplete}
            isProcessing={isProcessing}
          />
        );
      case 1:
        return (
          <CourseImporter
            data={eventData}
            onComplete={handleStepComplete}
            isProcessing={isProcessing}
          />
        );
      case 2:
        return (
          <OEFileProcessor
            data={eventData}
            onComplete={handleStepComplete}
            isProcessing={isProcessing}
          />
        );
      case 3:
        return (
          <MeOSXMLGenerator
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
          description="Create new DVOA events from configuration files, import courses and entries, then generate MeOS-ready XML files."
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
            {currentStep === steps.length - 1 && (
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