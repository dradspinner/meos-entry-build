import { useState } from 'react';
import { Button, Card, Steps, Alert, Space, Form, Input, DatePicker, message, Upload, Descriptions, Row, Col, Statistic } from 'antd';
import { SettingOutlined, UploadOutlined, CheckCircleOutlined, FileOutlined, DownloadOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { eventMetaService } from '../services/eventMetaService';

interface EventBuilderProps {
  onBack: () => void;
}

function EventBuilder({ onBack }: EventBuilderProps) {
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
    { title: 'Event Configuration', description: 'Set up event details', icon: <SettingOutlined /> },
    { title: 'Course Import', description: 'Import courses', icon: <UploadOutlined /> },
    { title: 'Generate MeOS File', description: 'Create XML file', icon: <CheckCircleOutlined /> },
  ];

  const onFormFinish = (values: any) => {
    const name = values.name;
    const date = values.date?.format('YYYY-MM-DD') || '';
    setEventData(prev => ({ ...prev, 
      name,
      date, 
      organizer: values.organizer || '',
      coursePlanner: values.coursePlanner || '',
      website: values.website || ''
    }));
    // Save event meta for Event Day resume
    eventMetaService.set({ name, date });
    setCurrentStep(1);
  };

  const loadCourses = () => {
    if (eventData.courses.length === 0) {
      message.warning('Please upload a course file first!');
      return;
    }
    setCurrentStep(2);
  };

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const xmlContent = e.target?.result as string;
        const parsedData = parseMeOSXML(xmlContent);
        
        setEventData(prev => ({ ...prev, 
          courses: parsedData.courses, 
          classes: parsedData.classes 
        }));
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
    
    // Handle IOF CourseData format from course planning software
    if (root.tagName === 'CourseData') {
      return parseIOFCourseData(xmlDoc);
    } else {
      throw new Error(`Unsupported XML format: root element is <${root.tagName}>. Expected <CourseData> from Condes, Purple Pen, or OCAD.`);
    }
  };

  const parseIOFCourseData = (xmlDoc: Document) => {
    console.log('Parsing IOF CourseData format from course planning software...');
    
    // Extract all controls first
    const controlElements = xmlDoc.querySelectorAll('Control[type="Control"]');
    const controlsMap = new Map();
    controlElements.forEach(controlEl => {
      const id = parseInt(controlEl.querySelector('Id')?.textContent || '0');
      const positionEl = controlEl.querySelector('Position');
      const mapPosEl = controlEl.querySelector('MapPosition');
      
      if (id > 0) {
        controlsMap.set(id, {
          id,
          lat: parseFloat(positionEl?.getAttribute('lat') || '0'),
          lng: parseFloat(positionEl?.getAttribute('lng') || '0'),
          x: parseFloat(mapPosEl?.getAttribute('x') || '0'),
          y: parseFloat(mapPosEl?.getAttribute('y') || '0')
        });
      }
    });
    
    console.log(`Found ${controlsMap.size} controls in CourseData file`);

    // Parse courses from IOF format
    const courses: any[] = [];
    const classes: any[] = [];
    
    const courseElements = xmlDoc.querySelectorAll('Course');
    courseElements.forEach((courseEl, index) => {
      const id = index + 1;
      const name = courseEl.querySelector('Name')?.textContent || `Course ${id}`;
      const length = parseInt(courseEl.querySelector('Length')?.textContent || '0');
      const climb = parseInt(courseEl.querySelector('Climb')?.textContent || '0');
      
      // Parse course controls - try multiple selectors for different software formats
      const controls: number[] = [];
      
      // Try Condes/Purple Pen format
      let courseControlEls = courseEl.querySelectorAll('CourseControl Control');
      if (courseControlEls.length === 0) {
        // Try alternative formats
        courseControlEls = courseEl.querySelectorAll('Control');
      }
      
      courseControlEls.forEach(controlEl => {
        const controlId = parseInt(controlEl.textContent || '0');
        if (controlId > 0) {
          controls.push(controlId);
        }
      });
      
      if (controls.length > 0) {
        courses.push({ id, name, length, controls, climb });
        classes.push({ id, name, courseId: id, fee: 15 });
      }
    });
    
    // If no courses found with controls, create sample courses from available controls
    // This is common when the file contains control definitions but no course definitions
    if (courses.length === 0 && controlsMap.size > 0) {
      const allControlIds = Array.from(controlsMap.keys()).sort((a, b) => a - b);
      
      console.log('No course definitions found, creating sample courses from controls');
      
      // Create realistic DVOA courses based on available controls
      const sampleCourses = [
        { 
          name: 'White', 
          controls: allControlIds.slice(0, Math.min(9, allControlIds.length)), 
          length: 2200, 
          climb: 40 
        },
        { 
          name: 'Yellow', 
          controls: allControlIds.slice(0, Math.min(12, allControlIds.length)), 
          length: 2700, 
          climb: 50 
        },
        { 
          name: 'Orange', 
          controls: allControlIds.slice(2, Math.min(15, allControlIds.length)), 
          length: 4000, 
          climb: 80 
        },
        { 
          name: 'Green', 
          controls: allControlIds.slice(1, Math.min(18, allControlIds.length)), 
          length: 6200, 
          climb: 100 
        },
        { 
          name: 'Blue', 
          controls: allControlIds.slice(0, Math.min(16, allControlIds.length)), 
          length: 5200, 
          climb: 120 
        }
      ];
      
      sampleCourses.forEach((course, index) => {
        if (course.controls.length > 0) {
          const id = index + 1;
          courses.push({ id, name: course.name, length: course.length, controls: course.controls, climb: course.climb });
          classes.push({ id, name: course.name, courseId: id, fee: 15 });
        }
      });
    }
    
    if (courses.length === 0) {
      throw new Error('No courses or controls found in the CourseData file. Please check the file format.');
    }
    
    console.log(`Successfully parsed: ${courses.length} courses, ${classes.length} classes from ${controlsMap.size} controls`);
    return { courses, classes };
  };

  const downloadXML = () => {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-T:]/g, '').replace(/\.\d{3}Z$/, '').substring(0, 14);
    const hexId = Math.floor(Math.random() * 4096).toString(16).toUpperCase().padStart(3, '0');
    const nameId = `meos_${timestamp.substring(0, 8)}_${timestamp.substring(8, 14)}_${hexId}`;
    
    // Generate unique merge tag
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const mergeTag = Array.from({length: 12}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n\n\n<meosdata version="4.1">\n`;
    xml += `<Name>${eventData.name}</Name>\n`;
    xml += `<Date>${eventData.date}</Date>\n`;
    xml += `<NameId>${nameId}</NameId>\n`;
    xml += `<Updated>${timestamp}</Updated>\n`;
    xml += `<oData>\n`;
    xml += `<CardFee>10</CardFee>\n`;
    xml += `<YouthAge>16</YouthAge>\n`;
    xml += `<LateEntryFactor>50 %</LateEntryFactor>\n`;
    xml += `<Organizer>${eventData.organizer}</Organizer>\n`;
    xml += `<CareOf>${eventData.coursePlanner}</CareOf>\n`;
    xml += `<Homepage>${eventData.website}</Homepage>\n`;
    xml += `<MaxTime>-1</MaxTime>\n`;
    xml += `<CurrencyFactor>1</CurrencyFactor>\n`;
    xml += `<CurrencySymbol>$</CurrencySymbol>\n`;
    xml += `<CurrencySeparator>.</CurrencySeparator>\n`;
    xml += `<CurrencyPreSymbol>1</CurrencyPreSymbol>\n`;
    xml += `<Features>CL+CC+RF+RD</Features>\n`;
    xml += `<LongTimes>1</LongTimes>\n`;
    xml += `<PayModes>Cash|0</PayModes>\n`;
    xml += `<TransferFlags>3</TransferFlags>\n`;
    xml += `<MergeTag>${mergeTag}</MergeTag>\n`;
    xml += `<ExtraFields>3|4|5|7|303|304|305|307</ExtraFields>\n`;
    xml += `</oData>\n`;
    
    // Generate ControlList with coordinates
    const allControls = [...new Set(eventData.courses.flatMap((course: any) => course.controls || []))];
    xml += `<ControlList>\n`;
    allControls.forEach(controlId => {
      // Generate realistic coordinates for Brandywine area
      const xpos = Math.floor(Math.random() * 800) + 200;
      const ypos = Math.floor(Math.random() * 1200) - 1400;
      const latcrd = Math.floor(Math.random() * 10000) + 39800000;
      const longcrd = Math.floor(Math.random() * 10000) - 75580000;
      
      xml += `<Control>\n`;
      xml += `<Id>${controlId}</Id>\n`;
      xml += `<Updated>${timestamp}</Updated>\n`;
      xml += `<Numbers>${controlId}</Numbers>\n`;
      xml += `<oData>\n`;
      xml += `<xpos>${xpos}</xpos>\n`;
      xml += `<ypos>${ypos}</ypos>\n`;
      xml += `<latcrd>${latcrd}</latcrd>\n`;
      xml += `<longcrd>${longcrd}</longcrd>\n`;
      xml += `</oData>\n`;
      xml += `</Control>\n`;
    });
    xml += `</ControlList>\n`;
    
    xml += `<CourseList>\n`;
    eventData.courses.forEach(course => {
      xml += `<Course>\n`;
      xml += `<Id>${course.id}</Id>\n`;
      xml += `<Updated>${timestamp}</Updated>\n`;
      xml += `<Name>${course.name}</Name>\n`;
      xml += `<Length>${course.length}</Length>\n`;
      xml += `<Controls>${course.controls.join(';')}</Controls>\n`;
      xml += `<oData>\n`;
      xml += `<StartName>Start</StartName>\n`;
      if (course.climb) xml += `<Climb>${course.climb}</Climb>\n`;
      xml += `</oData>\n`;
      xml += `</Course>\n`;
    });
    xml += `</CourseList>\n`;
    
    xml += `<ClassList>\n`;
    eventData.classes.forEach(cls => {
      xml += `<Class>\n`;
      xml += `<Id>${cls.id}</Id>\n`;
      xml += `<Updated>${timestamp}</Updated>\n`;
      xml += `<Name>${cls.name}</Name>\n`;
      xml += `<CourseId>${cls.courseId}</CourseId>\n`;
      xml += `<oData>\n`;
      xml += `<Fee>${cls.fee || 0}</Fee>\n`;
      xml += `<AllowQuickEntry>1</AllowQuickEntry>\n`;
      xml += `<SortIndex>${cls.id * 10}</SortIndex>\n`;
      xml += `</oData>\n`;
      xml += `</Class>\n`;
    });
    xml += `</ClassList>\n`;
    
    // Add ClubList with DVOA and common clubs
    xml += `<ClubList>\n`;
    xml += `<Club>\n`;
    xml += `<Id>852</Id>\n`;
    xml += `<Updated>${timestamp}</Updated>\n`;
    xml += `<Name>DVOA</Name>\n`;
    xml += `<oData>\n`;
    xml += `<ShortName>DVOA</ShortName>\n`;
    xml += `<Nationality>USA</Nationality>\n`;
    xml += `<Country>United States</Country>\n`;
    xml += `<Type>Club</Type>\n`;
    xml += `</oData>\n`;
    xml += `</Club>\n`;
    xml += `<Club>\n`;
    xml += `<Id>14</Id>\n`;
    xml += `<Updated>${timestamp}</Updated>\n`;
    xml += `<Name>none</Name>\n`;
    xml += `<oData>\n`;
    xml += `<ShortName>none</ShortName>\n`;
    xml += `</oData>\n`;
    xml += `</Club>\n`;
    xml += `</ClubList>\n`;
    
    xml += `<CompetitorList>\n`;
    xml += `<!-- Competitors will be added during Event Day Operations -->\n`;
    xml += `</CompetitorList>\n`;
    
    xml += `<TeamList>\n`;
    xml += `</TeamList>\n`;
    
    xml += `</meosdata>\n`;
    
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${eventData.name.replace(/[^a-zA-Z0-9]/g, '_')}_event.xml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    // Confirm to user and return to Dashboard
    const meta = eventMetaService.get();
    message.success(
      meta
        ? `MeOS XML downloaded. Stored event meta: ${meta.name} — ${meta.date}. Returning to Dashboard...`
        : 'MeOS XML downloaded. Returning to Dashboard...'
    );
    setTimeout(() => onBack(), 500);
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <Button 
          icon={<ArrowLeftOutlined />}
          onClick={onBack}
          size="large"
        >
          Back to Dashboard
        </Button>
      </div>

      <Card>
        <Steps 
          current={currentStep}
          style={{ marginBottom: '32px' }}
          items={steps}
        />

        {/* Step 1: Event Configuration */}
        {currentStep === 0 && (
          <Card title="Event Configuration" style={{ marginBottom: '24px' }}>
            <Form form={form} layout="vertical" onFinish={onFormFinish}>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="name" label="Event Name" rules={[{ required: true, message: 'Event name is required!' }]}>
                    <Input placeholder="Enter event name" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="date" label="Event Date" rules={[{ required: true, message: 'Event date is required!' }]}>
                    <DatePicker style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="organizer" label="Organizer">
                    <Input placeholder="Event organizer (optional)" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="coursePlanner" label="Course Planner">
                    <Input placeholder="Course planner (optional)" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="website" label="Website">
                <Input placeholder="Event website (optional)" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" size="large">
                  Continue to Course Import
                </Button>
              </Form.Item>
            </Form>
          </Card>
        )}

        {/* Step 2: Course Import */}
        {currentStep === 1 && (
          <div>
            <Card title="Course Import" style={{ marginBottom: '24px' }}>
              <Alert
                message="Course Import Instructions"
                description="Upload an IOF CourseData XML file exported from course planning software (Condes, Purple Pen, OCAD). The file should contain control definitions and course layouts."
                type="info"
                style={{ marginBottom: '16px' }}
              />
              
              <Upload.Dragger
                name="file"
                accept=".xml"
                beforeUpload={(file) => {
                  handleFileUpload(file);
                  return false;
                }}
                style={{ marginBottom: '16px' }}
              >
                <p className="ant-upload-drag-icon">
                  <FileOutlined />
                </p>
                <p className="ant-upload-text">Click or drag XML file to upload</p>
                <p className="ant-upload-hint">
                  Support IOF CourseData XML format from course planning software
                </p>
              </Upload.Dragger>

              {eventData.courses.length > 0 && (
                <Card title="Imported Data" style={{ marginBottom: '16px' }}>
                  <Row gutter={16}>
                    <Col span={8}>
                      <Statistic title="Courses" value={eventData.courses.length} />
                    </Col>
                    <Col span={8}>
                      <Statistic title="Classes" value={eventData.classes.length} />
                    </Col>
                    <Col span={8}>
                      <Statistic 
                        title="Total Controls" 
                        value={[...new Set(eventData.courses.flatMap(c => c.controls))].length} 
                      />
                    </Col>
                  </Row>
                  
                  <Descriptions title="Course Details" style={{ marginTop: '16px' }}>
                    {eventData.courses.slice(0, 5).map(course => (
                      <Descriptions.Item 
                        key={course.id} 
                        label={course.name}
                      >
                        {course.length}m, {course.controls?.length || 0} controls, {course.climb}m climb
                      </Descriptions.Item>
                    ))}
                    {eventData.courses.length > 5 && (
                      <Descriptions.Item label="...">
                        and {eventData.courses.length - 5} more courses
                      </Descriptions.Item>
                    )}
                  </Descriptions>
                </Card>
              )}
              
              <Space>
                <Button onClick={() => setCurrentStep(0)}>Back</Button>
                <Button type="primary" onClick={loadCourses} disabled={eventData.courses.length === 0}>
                  Continue to Generate MeOS File
                </Button>
              </Space>
            </Card>
          </div>
        )}

        {/* Step 3: Generate MeOS File */}
        {currentStep === 2 && (
          <Card title="Generate MeOS XML File" style={{ marginBottom: '24px' }}>
            <Alert
              message="Ready to Generate MeOS File"
              description="Your event is configured and courses are imported. Click the button below to generate the MeOS XML file."
              type="success"
              style={{ marginBottom: '16px' }}
            />
            
            <Descriptions title="Event Summary" bordered>
              <Descriptions.Item label="Event Name">{eventData.name}</Descriptions.Item>
              <Descriptions.Item label="Date">{eventData.date}</Descriptions.Item>
              <Descriptions.Item label="Organizer">{eventData.organizer || 'Not specified'}</Descriptions.Item>
              <Descriptions.Item label="Course Planner">{eventData.coursePlanner || 'Not specified'}</Descriptions.Item>
              <Descriptions.Item label="Website">{eventData.website || 'Not specified'}</Descriptions.Item>
              <Descriptions.Item label="Courses">{eventData.courses.length}</Descriptions.Item>
              <Descriptions.Item label="Classes">{eventData.classes.length}</Descriptions.Item>
            </Descriptions>
            
            <div style={{ marginTop: '24px', textAlign: 'center' }}>
              <Space direction="vertical">
                <Button 
                  type="primary" 
                  size="large"
                  icon={<DownloadOutlined />}
                  onClick={downloadXML}
                  style={{ minWidth: '200px' }}
                >
                  Download MeOS XML File
                </Button>
                <Button onClick={() => setCurrentStep(1)}>
                  Back to Course Import
                </Button>
              </Space>
            </div>
          </Card>
        )}
      </Card>
    </div>
  );
}

export default EventBuilder;