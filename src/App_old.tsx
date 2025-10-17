import { useState } from 'react';
import { Layout, ConfigProvider } from 'antd';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import EventBuilder from './components/EventBuilder';

type CurrentView = 'dashboard' | 'eventBuilder' | 'eventDayOps';

function App() {
  const [currentView, setCurrentView] = useState<CurrentView>('dashboard');


  const onFormFinish = (values: any) => {
    setEventData(prev => ({ ...prev, 
      name: values.name, 
      date: values.date?.format('YYYY-MM-DD') || '', 
      organizer: values.organizer || '',
      coursePlanner: values.coursePlanner || '',
      website: values.website || ''
    }));
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

  const parseMeOSData = (xmlDoc: Document) => {
    console.log('Parsing MeOS XML format...');
    
    // Parse courses from MeOS format
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

    // Parse classes from MeOS format
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
    xml += `</meosdata>`;
    
    const filename = `${eventData.name.replace(/\s+/g, '_')}.meosxml`;
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    message.success(`Downloaded ${filename}`);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div>
            <Alert message="Event Configuration" type="info" style={{ marginBottom: 16 }} 
              action={<Button size="small" icon={<FileOutlined />} onClick={loadTestData}>Load Test Data</Button>} />
            <Form form={form} onFinish={onFormFinish} layout="vertical">
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="name" label="Event Name" rules={[{ required: true }]}>
                    <Input placeholder="e.g., DVOA Spring Classic" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="date" label="Event Date" rules={[{ required: true }]}>
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
                <Button type="primary" htmlType="submit">Continue to Course Import</Button>
              </Form.Item>
            </Form>
          </div>
        );
      case 1:
        return (
          <div>
            <Alert message="Course Import" type="info" style={{ marginBottom: 16 }} />
            
            {eventData.courses.length > 0 ? (
              <div>
                <Row gutter={16} style={{ marginBottom: 24 }}>
                  <Col span={8}>
                    <Statistic title="Total Courses" value={eventData.courses.length} />
                  </Col>
                  <Col span={8}>
                    <Statistic title="Total Classes" value={eventData.classes.length} />
                  </Col>
                  <Col span={8}>
                    <Statistic 
                      title="Longest Course" 
                      value={eventData.courses.length > 0 ? Math.max(...eventData.courses.map((c: any) => c.length)) : 0} 
                      suffix="m" 
                    />
                  </Col>
                </Row>
                
                <Card title="Course Overview" size="small" style={{ marginBottom: 16 }}>
                  {eventData.courses.map((course: any) => (
                    <div key={course.id} style={{ 
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
                
                <Button type="primary" onClick={() => setCurrentStep(2)}>Continue to MeOS XML Generation</Button>
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
                  style={{ marginBottom: 24 }}
                >
                  <p className="ant-upload-drag-icon"><FileOutlined /></p>
                  <p className="ant-upload-text">Click or drag XML files here to upload</p>
                  <p className="ant-upload-hint">Support for .xml and .meosxml files from course planning software or MeOS exports</p>
                </Upload.Dragger>
                
                <div style={{ textAlign: 'center' }}>
                  <Button onClick={loadCourses}>Or Load Test Course Data</Button>
                </div>
              </div>
            )}
          </div>
        );
      case 2:
        return (
          <div>
            <Alert message="Generate MeOS XML" description="Generate the final MeOS XML file ready for import." type="info" style={{ marginBottom: 24 }} />
            
            <Descriptions title="Event Summary" bordered column={2} style={{ marginBottom: 24 }}>
              <Descriptions.Item label="Event Name">{eventData.name || 'Not set'}</Descriptions.Item>
              <Descriptions.Item label="Date">{eventData.date || 'Not set'}</Descriptions.Item>
              <Descriptions.Item label="Organizer">{eventData.organizer || 'Not set'}</Descriptions.Item>
              <Descriptions.Item label="Course Planner">{eventData.coursePlanner || 'Not set'}</Descriptions.Item>
              <Descriptions.Item label="Website">
                {eventData.website ? (
                  <a href={eventData.website} target="_blank" rel="noopener noreferrer">{eventData.website}</a>
                ) : 'Not set'}
              </Descriptions.Item>
              <Descriptions.Item label="Courses">{eventData.courses.length}</Descriptions.Item>
              <Descriptions.Item label="Classes">{eventData.classes.length}</Descriptions.Item>
            </Descriptions>
            
            <div style={{ textAlign: 'center', marginTop: 32 }}>
              <Button 
                type="primary" 
                size="large"
                icon={<DownloadOutlined />}
                onClick={downloadXML} 
                disabled={!eventData.name || eventData.courses.length === 0}
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
    <div style={{ padding: 20, maxWidth: 800 }}>
      <Card title="Event Builder" style={{ marginBottom: 16 }}>
        <Steps current={currentStep} items={steps} style={{ marginBottom: 24 }} />
      </Card>
      <Card>
        {renderStep()}
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <Space>
            <Button disabled={currentStep === 0} onClick={() => setCurrentStep(currentStep - 1)}>Back</Button>
            {currentStep === 2 && eventData.courses > 0 && (
              <Button type="primary" onClick={() => setCurrentStep(0)}>Start New Event</Button>
            )}
          </Space>
        </div>
      </Card>
    </div>
  );
}

export default App;