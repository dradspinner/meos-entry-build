import { useState } from 'react';
import { Button, Card, Steps, Alert, Space, Form, Input, DatePicker, Upload, Descriptions, Row, Col, Statistic, message } from 'antd';
import { SettingOutlined, UploadOutlined, CheckCircleOutlined, FileOutlined, DownloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

function EventBuilderWorking() {
  const [currentStep, setCurrentStep] = useState(0);
  const [eventData, setEventData] = useState({
    name: '',
    date: '',
    organizer: '',
    coursePlanner: '',
    website: '',
    courses: [] as any[],
    classes: [] as any[]
  });

  const [form] = Form.useForm();

  const steps = [
    {
      title: 'Event Configuration',
      description: 'Set up event details',
      icon: <SettingOutlined />,
    },
    {
      title: 'Course Import', 
      description: 'Import courses',
      icon: <UploadOutlined />,
    },
    {
      title: 'Generate MeOS File',
      description: 'Create XML file',
      icon: <CheckCircleOutlined />,
    },
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const loadBrandywineTestData = () => {
    const testData = {
      name: 'Brandywine Test Event',
      date: '2025-04-27',
      organizer: 'DVOA',
      coursePlanner: 'Test Planner',
      website: 'https://dvoa.org',
      courses: [
        { id: 1, name: 'White', length: 2225, controls: [31, 32, 33], climb: 40 },
        { id: 2, name: 'Yellow', length: 2700, controls: [41, 42, 43], climb: 50 },
        { id: 3, name: 'Orange', length: 4075, controls: [42, 64, 47], climb: 60 }
      ],
      classes: [
        { id: 1, name: 'White', courseId: 1, fee: 10 },
        { id: 2, name: 'Yellow', courseId: 2, fee: 15 },
        { id: 3, name: 'Orange', courseId: 3, fee: 15 }
      ]
    };
    
    setEventData(prev => ({ ...prev, ...testData }));
    form.setFieldsValue({
      name: testData.name,
      date: dayjs(testData.date),
      organizer: testData.organizer,
      coursePlanner: testData.coursePlanner,
      website: testData.website
    });
    message.success(`Loaded test data: ${testData.courses.length} courses, ${testData.classes.length} classes`);
  };

  const onFormFinish = (values: any) => {
    setEventData(prev => ({
      ...prev,
      name: values.name,
      date: values.date ? values.date.format('YYYY-MM-DD') : '',
      organizer: values.organizer,
      coursePlanner: values.coursePlanner,
      website: values.website
    }));
    handleNext();
  };

  const downloadXML = () => {
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<meosdata version="4.1">
<Name>${eventData.name || 'Untitled Event'}</Name>
<Date>${eventData.date || new Date().toISOString().split('T')[0]}</Date>
<oData>
<Organizer>${eventData.organizer || ''}</Organizer>
<CareOf>${eventData.coursePlanner || ''}</CareOf>
<Homepage>${eventData.website || ''}</Homepage>
<CardFee>10</CardFee>
</oData>
<CourseList>
${eventData.courses.map(course => `<Course>
<Id>${course.id}</Id>
<Name>${course.name}</Name>
<Length>${course.length}</Length>
<Controls>${course.controls.join(';')}</Controls>
</Course>`).join('\n')}
</CourseList>
<ClassList>
${eventData.classes.map(cls => `<Class>
<Id>${cls.id}</Id>
<Name>${cls.name}</Name>
<CourseId>${cls.courseId}</CourseId>
</Class>`).join('\n')}
</ClassList>
</meosdata>`;
    
    const filename = `${(eventData.name || 'event').replace(/\s+/g, '_')}.meosxml`;
    const blob = new Blob([xmlContent], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    message.success(`Downloaded ${filename}`);
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div>
            <Alert
              message="Event Configuration"
              description="Set up your DVOA event details."
              type="info"
              showIcon
              style={{ marginBottom: 24 }}
              action={
                <Button 
                  icon={<FileOutlined />} 
                  onClick={loadBrandywineTestData}
                  size="small"
                >
                  Load Test Data
                </Button>
              }
            />
            
            <Form
              form={form}
              layout="vertical"
              onFinish={onFormFinish}
            >
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="name"
                    label="Event Name"
                    rules={[{ required: true, message: 'Event name is required' }]}
                  >
                    <Input placeholder="e.g., DVOA Spring Classic" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="date"
                    label="Event Date"
                    rules={[{ required: true, message: 'Event date is required' }]}
                  >
                    <DatePicker style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
              
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="organizer" label="Organizer (Optional)">
                    <Input placeholder="e.g., DVOA" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="coursePlanner" label="Course Planner (Optional)">
                    <Input placeholder="Planner name" />
                  </Form.Item>
                </Col>
              </Row>
              
              <Form.Item name="website" label="Website (Optional)">
                <Input placeholder="https://example.com/event" />
              </Form.Item>
              
              <Form.Item>
                <Button type="primary" htmlType="submit">
                  Continue to Course Import
                </Button>
              </Form.Item>
            </Form>
          </div>
        );
        
      case 1:
        return (
          <div>
            <Alert
              message="Course Import"
              description="Import course data or use test data."
              type="info"
              showIcon
              style={{ marginBottom: 24 }}
            />
            
            {eventData.courses && eventData.courses.length > 0 ? (
              <div>
                <Row gutter={16} style={{ marginBottom: 24 }}>
                  <Col span={8}>
                    <Statistic title="Total Courses" value={eventData.courses.length} />
                  </Col>
                  <Col span={8}>
                    <Statistic title="Total Classes" value={eventData.classes?.length || 0} />
                  </Col>
                  <Col span={8}>
                    <Statistic 
                      title="Longest Course" 
                      value={eventData.courses.length > 0 ? Math.max(...eventData.courses.map((c: any) => c.length)) : 0} 
                      suffix="m" 
                    />
                  </Col>
                </Row>
                
                <Card title="Course Overview" size="small">
                  {eventData.courses.map((course: any, index: number) => (
                    <div key={index} style={{ 
                      padding: '8px 12px', 
                      margin: '4px 0',
                      background: '#f5f5f5', 
                      borderRadius: '4px'
                    }}>
                      <strong>{course.name}</strong> • {course.length}m • {course.controls?.length || 0} controls
                      {course.climb ? ` • ${course.climb}m climb` : ''}
                    </div>
                  ))}
                </Card>
                
                <div style={{ textAlign: 'right', marginTop: 24 }}>
                  <Button type="primary" onClick={handleNext}>
                    Continue to MeOS XML Generation
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ textAlign: 'center', margin: '48px 0' }}>
                  <Button type="primary" onClick={loadBrandywineTestData}>
                    Load Test Course Data
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
        
      case 2:
        return (
          <div>
            <Alert
              message="MeOS XML Generation"
              description="Generate the final MeOS XML file."
              type="info"
              showIcon
              style={{ marginBottom: 24 }}
            />
            
            <Descriptions 
              title="Event Summary"
              bordered
              column={2}
              style={{ marginBottom: 24 }}
            >
              <Descriptions.Item label="Event Name">{eventData.name || 'Not set'}</Descriptions.Item>
              <Descriptions.Item label="Date">{eventData.date || 'Not set'}</Descriptions.Item>
              <Descriptions.Item label="Organizer">{eventData.organizer || 'Not set'}</Descriptions.Item>
              <Descriptions.Item label="Course Planner">{eventData.coursePlanner || 'Not set'}</Descriptions.Item>
              <Descriptions.Item label="Courses">{eventData.courses?.length || 0}</Descriptions.Item>
              <Descriptions.Item label="Classes">{eventData.classes?.length || 0}</Descriptions.Item>
            </Descriptions>
            
            <div style={{ textAlign: 'center', marginTop: 32 }}>
              <Button 
                type="primary"
                size="large"
                icon={<DownloadOutlined />}
                onClick={downloadXML}
                disabled={!eventData.name || !eventData.courses?.length}
              >
                Generate & Download MeOS XML
              </Button>
            </div>
          </div>
        );
        
      default:
        return null;
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px' }}>
      <Card title="Event Builder" style={{ marginBottom: 24 }}>
        <Alert
          message="Build Complete MeOS Events"
          description="Create new DVOA events and generate MeOS-ready XML files."
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />
        
        <Steps
          current={currentStep}
          items={steps}
          style={{ marginBottom: 32 }}
        />
      </Card>

      <Card>
        {renderStepContent()}
        
        <div style={{ marginTop: 24, textAlign: 'right' }}>
          <Space>
            <Button disabled={currentStep === 0} onClick={handleBack}>
              Back
            </Button>
            {currentStep === steps.length - 1 && eventData.courses?.length > 0 && (
              <Button type="primary" onClick={() => setCurrentStep(0)}>
                Start New Event
              </Button>
            )}
          </Space>
        </div>
      </Card>
    </div>
  );
}

export default EventBuilderWorking;