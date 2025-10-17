import { useState } from 'react';
import { Button, Card, Steps, Alert, Space, Form, Input, DatePicker, Upload, Descriptions, Row, Col, Statistic, message } from 'antd';
import { SettingOutlined, UploadOutlined, CheckCircleOutlined, FileOutlined, DownloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

function SimpleTest() {
  const [currentStep, setCurrentStep] = useState(0);
  const [eventData, setEventData] = useState({
    name: '',
    date: '',
    organizer: '',
    courses: [] as any[],
    classes: [] as any[]
  });

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

  const [form] = Form.useForm();

  const loadBrandywineTestData = () => {
    const testData = {
      name: 'Brandywine Test Event',
      date: '2025-04-27',
      organizer: 'DVOA',
      coursePlanner: 'Test Planner',
      website: 'https://dvoa.org',
      courses: [
        { id: 1, name: 'White', length: 2225, controls: [31, 32, 33, 34, 35, 36, 37, 38, 39], climb: 40 },
        { id: 2, name: 'Yellow', length: 2700, controls: [41, 42, 43, 44, 45, 46, 40, 48, 49, 38, 39], climb: 50 },
        { id: 3, name: 'Orange', length: 4075, controls: [42, 64, 47, 78, 76, 73, 77, 51, 70, 34, 39], climb: 60 },
        { id: 4, name: 'Green', length: 6200, controls: [51, 65, 54, 50, 71, 53, 55, 56, 57, 58, 59, 60, 61, 70, 62, 39], climb: 80 },
        { id: 5, name: 'Blue', length: 5225, controls: [78, 76, 77, 65, 54, 50, 71, 53, 70, 62, 40, 39], climb: 100 },
        { id: 6, name: 'Red', length: 7325, controls: [78, 76, 77, 65, 54, 51, 50, 55, 61, 82, 60, 59, 58, 57, 56, 53, 70, 62, 40, 39], climb: 120 }
      ],
      classes: [
        { id: 1, name: 'White', courseId: 1, fee: 10 },
        { id: 2, name: 'Yellow', courseId: 2, fee: 15 },
        { id: 3, name: 'Orange', courseId: 3, fee: 15 },
        { id: 4, name: 'Green', courseId: 4, fee: 20 },
        { id: 5, name: 'Blue', courseId: 5, fee: 20 },
        { id: 6, name: 'Red', courseId: 6, fee: 20 }
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

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const xmlContent = e.target?.result as string;
        const parsedData = parseMeOSXML(xmlContent);
        
        setEventData(prev => ({ ...prev, ...parsedData }));
        message.success(`Successfully loaded: ${parsedData.courses.length} courses, ${parsedData.classes.length} classes from ${file.name}`);
      } catch (error) {
        console.error('Failed to parse XML file:', error);
        message.error(`Failed to parse XML file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };
    
    reader.onerror = () => {
      message.error('Failed to read file');
    };
    
    reader.readAsText(file);
  };

  const parseMeOSXML = (xmlContent: string) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
    
    // Check for parse errors
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      throw new Error(`XML parse error: ${parseError.textContent}`);
    }

    const root = xmlDoc.documentElement;
    if (root.tagName !== 'meosdata') {
      throw new Error('Invalid MeOS XML file: root element must be <meosdata>');
    }

    // Parse courses
    const courses: any[] = [];
    const courseElements = xmlDoc.querySelectorAll('Course');
    courseElements.forEach((courseEl, index) => {
      const id = parseInt(courseEl.querySelector('Id')?.textContent || (index + 1).toString());
      const name = courseEl.querySelector('Name')?.textContent || `Course ${id}`;
      const length = parseInt(courseEl.querySelector('Length')?.textContent || '0');
      const controlsText = courseEl.querySelector('Controls')?.textContent || '';
      const climb = parseInt(courseEl.querySelector('oData Climb')?.textContent || '0');
      
      // Parse controls (semicolon-separated)
      const controls = controlsText
        .split(';')
        .filter(c => c.trim())
        .map(c => parseInt(c.trim()))
        .filter(c => !isNaN(c));
      
      courses.push({ id, name, length, controls, climb });
    });

    // Parse classes
    const classes: any[] = [];
    const classElements = xmlDoc.querySelectorAll('Class');
    classElements.forEach((classEl, index) => {
      const id = parseInt(classEl.querySelector('Id')?.textContent || (index + 1).toString());
      const name = classEl.querySelector('Name')?.textContent || `Class ${id}`;
      const courseId = parseInt(classEl.querySelector('CourseId')?.textContent || '1');
      const fee = parseInt(classEl.querySelector('oData Fee')?.textContent || '0');
      
      classes.push({ id, name, courseId, fee });
    });

    return { courses, classes };
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

  const generateMeOSXML = (data: any) => {
    // Generate proper MeOS identifiers
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-T:]/g, '').replace(/\.\d{3}Z$/, '').substring(0, 14);
    
    // NameId format: meos_YYYYMMDD_HHMMSS_XXX (XXX = 3-char hex)
    const dateStr = timestamp.substring(0, 8);
    const timeStr = timestamp.substring(8, 14);
    const hexId = Math.floor(Math.random() * 4096).toString(16).toUpperCase().padStart(3, '0');
    const nameId = `meos_${dateStr}_${timeStr}_${hexId}`;
    
    // MergeTag format: 12-character alphanumeric string
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const mergeTag = Array.from({length: 12}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>


<meosdata version="4.1">
<Name>${data.name || 'Untitled Event'}</Name>
<Date>${data.date || new Date().toISOString().split('T')[0]}</Date>
<NameId>${nameId}</NameId>
<Updated>${timestamp}</Updated>
<oData>
<CardFee>10</CardFee>
<YouthAge>16</YouthAge>
<LateEntryFactor>50 %</LateEntryFactor>
<Organizer>${data.organizer || ''}</Organizer>
<CareOf>${data.coursePlanner || ''}</CareOf>
<Homepage>${data.website || ''}</Homepage>
<MaxTime>-1</MaxTime>
<CurrencyFactor>1</CurrencyFactor>
<CurrencySymbol>$</CurrencySymbol>
<CurrencySeparator>.</CurrencySeparator>
<CurrencyPreSymbol>1</CurrencyPreSymbol>
<Features>CL+CC+RF+RD</Features>
<LongTimes>1</LongTimes>
<PayModes>Cash|0</PayModes>
<TransferFlags>3</TransferFlags>
<MergeTag>${mergeTag}</MergeTag>
<ExtraFields>3|4|5|7|303|304|305|307</ExtraFields>
</oData>
  
<ControlList>
${(data.courses || []).flatMap((course: any) => course.controls || []).filter((value: any, index: number, self: any[]) => self.indexOf(value) === index).map((controlId: number) => {
      // Generate realistic coordinates based on Brandywine area
      const xpos = Math.floor(Math.random() * 800) + 200; // 200-1000 range
      const ypos = Math.floor(Math.random() * 1200) - 1400; // -1400 to -200 range  
      const latcrd = Math.floor(Math.random() * 10000) + 39800000; // ~39.80-39.81 latitude
      const longcrd = Math.floor(Math.random() * 10000) - 75580000; // ~-75.58 to -75.57 longitude
      
      return `<Control>
<Id>${controlId}</Id>
<Updated>${timestamp}</Updated>
<Numbers>${controlId}</Numbers>
<oData>
<xpos>${xpos}</xpos>
<ypos>${ypos}</ypos>
<latcrd>${latcrd}</latcrd>
<longcrd>${longcrd}</longcrd>
</oData>
</Control>`;
    }).join('\n')}
</ControlList>
  
<CourseList>
${(data.courses || []).map((course: any) => `<Course>
<Id>${course.id}</Id>
<Updated>${timestamp}</Updated>
<Name>${course.name}</Name>
<Length>${course.length || 0}</Length>
<Controls>${(course.controls || []).join(';')}</Controls>
<oData>
<StartName>Start</StartName>
${course.climb ? `<Climb>${course.climb}</Climb>` : ''}
</oData>
</Course>`).join('\n')}
</CourseList>
  
<ClassList>
${(data.classes || []).map((cls: any) => `<Class>
<Id>${cls.id}</Id>
<Updated>${timestamp}</Updated>
<Name>${cls.name}</Name>
<CourseId>${cls.courseId}</CourseId>
<oData>
<Fee>${cls.fee || 0}</Fee>
<AllowQuickEntry>1</AllowQuickEntry>
<SortIndex>${cls.id * 10}</SortIndex>
</oData>
</Class>`).join('\n')}
</ClassList>
  
<ClubList>
<Club>
<Id>852</Id>
<Updated>${timestamp}</Updated>
<Name>DVOA</Name>
<oData>
<ShortName>DVOA</ShortName>
<Nationality>USA</Nationality>
<Country>United States</Country>
<Type>Club</Type>
</oData>
</Club>
<Club>
<Id>14</Id>
<Updated>${timestamp}</Updated>
<Name>none</Name>
<oData>
<ShortName>none</ShortName>
</oData>
</Club>
<Club>
<Id>3</Id>
<Updated>${timestamp}</Updated>
<Name>QOC</Name>
<oData>
<ShortName>QOC</ShortName>
</oData>
</Club>
</ClubList>
  
<CompetitorList>
<!-- Competitors will be added during Event Day Operations -->
</CompetitorList>
</meosdata>`
    
    return xmlContent;
  };

  const downloadXML = () => {
    const xmlContent = generateMeOSXML(eventData);
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
              description="Set up your DVOA event details and basic configuration."
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
              initialValues={{
                name: eventData.name,
                date: eventData.date ? dayjs(eventData.date) : undefined,
                organizer: eventData.organizer,
                coursePlanner: eventData.coursePlanner,
                website: eventData.website
              }}
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
                  <Form.Item
                    name="organizer"
                    label="Organizer (Optional)"
                  >
                    <Input placeholder="e.g., DVOA" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="coursePlanner"
                    label="Course Planner (Optional)"
                  >
                    <Input placeholder="Planner name" />
                  </Form.Item>
                </Col>
              </Row>
              
              <Form.Item
                name="website"
                label="Event Website (Optional)"
              >
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
              description="Import course data or use test data to define available courses and classes."
              type="info"
              showIcon
              style={{ marginBottom: 24 }}
            />
            
            {eventData.courses && eventData.courses.length > 0 ? (
              <div>
                <Row gutter={16} style={{ marginBottom: 24 }}>
                  <Col span={6}>
                    <Statistic title="Total Courses" value={eventData.courses.length} />
                  </Col>
                  <Col span={6}>
                    <Statistic title="Total Classes" value={eventData.classes?.length || 0} />
                  </Col>
                  <Col span={6}>
                    <Statistic 
                      title="Longest Course" 
                      value={Math.max(...eventData.courses.map((c: any) => c.length))} 
                      suffix="m" 
                    />
                  </Col>
                  <Col span={6}>
                    <Statistic 
                      title="Most Climb" 
                      value={Math.max(...eventData.courses.map((c: any) => c.climb || 0))} 
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
                <Upload.Dragger
                  accept=".xml,.meosxml"
                  beforeUpload={() => false}
                  onChange={(info) => {
                    const file = info.fileList[0]?.originFileObj;
                    if (file) {
                      handleFileUpload(file);
                    }
                  }}
                  maxCount={1}
                >
                  <p className="ant-upload-drag-icon"><FileOutlined /></p>
                  <p className="ant-upload-text">Click or drag course XML files here</p>
                  <p className="ant-upload-hint">Support for .xml and .meosxml files from course planning software or MeOS exports</p>
                </Upload.Dragger>
                
                <div style={{ textAlign: 'center', margin: '24px 0' }}>
                  <Button onClick={loadBrandywineTestData}>
                    Or Load Test Course Data
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
              description="Generate the final MeOS XML file ready for import into your MeOS installation."
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
              <Descriptions.Item label="Website">
                {eventData.website ? (
                  <a href={eventData.website} target="_blank" rel="noopener noreferrer">
                    {eventData.website}
                  </a>
                ) : 'Not set'}
              </Descriptions.Item>
            </Descriptions>
            
            <div style={{ textAlign: 'center', marginTop: 32 }}>
              <Space size="large">
                <Button 
                  type="primary"
                  size="large"
                  icon={<DownloadOutlined />}
                  onClick={downloadXML}
                  disabled={!eventData.name || !eventData.courses?.length}
                >
                  Generate & Download MeOS XML
                </Button>
              </Space>
            </div>
            
            <Alert
              style={{ marginTop: 24 }}
              message="Next Steps"
              description="After downloading the MeOS XML file, import it into MeOS to set up your event. Then use Event Day Operations for runner registration and check-in."
              type="success"
              showIcon
            />
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
            {currentStep === steps.length - 1 && (
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

export default SimpleTest;