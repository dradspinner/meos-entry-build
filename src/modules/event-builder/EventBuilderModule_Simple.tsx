import { Card, Steps, Alert } from 'antd';
import { SettingOutlined, UploadOutlined, FileTextOutlined, CheckCircleOutlined } from '@ant-design/icons';

export default function EventBuilderModule() {
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
          current={0}
          size="small" 
          style={{ marginBottom: 32 }}
          items={steps}
        />
      </Card>

      <Card>
        <h3>Event Configuration Step</h3>
        <p>This is where the Event Configuration form would appear.</p>
        <p>If you can see this, the EventBuilderModule structure is working correctly.</p>
      </Card>
    </div>
  );
}