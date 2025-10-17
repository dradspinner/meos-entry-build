import { useState, useEffect } from 'react';
import { Form, Input, DatePicker, Select, Radio, Card, Button, Space, Row, Col, Alert, message } from 'antd';
import { CalendarOutlined, UserOutlined, GlobalOutlined, SettingOutlined, FileOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { type MeOSData } from '../services/meosXmlParser';
import { FileService } from '../services/fileService';

const { Option } = Select;
const { TextArea } = Input;

interface EventConfiguratorProps {
  data: any;
  onComplete: (data: any) => void;
  isProcessing: boolean;
}

interface EventTemplate {
  id: string;
  name: string;
  description: string;
  defaultClasses: string[];
  allowMultipleCourses: boolean;
  eventType: 'individual' | 'relay' | 'sprint' | 'regaining';
}

const eventTemplates: EventTemplate[] = [
  {
    id: 'standard-individual',
    name: 'Standard Individual',
    description: 'Traditional individual orienteering event',
    defaultClasses: ['White', 'Yellow', 'Orange', 'Green', 'Blue', 'Red'],
    allowMultipleCourses: false,
    eventType: 'individual'
  },
  {
    id: 'sprint',
    name: 'Sprint Event',
    description: 'Fast-paced urban/park sprint orienteering',
    defaultClasses: ['Beginner', 'Intermediate', 'Advanced', 'Elite'],
    allowMultipleCourses: false,
    eventType: 'sprint'
  },
  {
    id: 'relay',
    name: 'Relay Event',
    description: 'Team-based relay competition',
    defaultClasses: ['Mixed Teams', 'Open Teams', 'Junior Teams'],
    allowMultipleCourses: true,
    eventType: 'relay'
  },
  {
    id: 'regaining',
    name: 'Regaining Event',
    description: 'Multiple courses per participant',
    defaultClasses: ['Course 1', 'Course 2', 'Course 3', 'Course 4'],
    allowMultipleCourses: true,
    eventType: 'regaining'
  }
];

export default function EventConfigurator({ data, onComplete, isProcessing }: EventConfiguratorProps) {
  const [form] = Form.useForm();
  const [selectedTemplate, setSelectedTemplate] = useState<EventTemplate | null>(null);
  const [brandywineData, setBrandywineData] = useState<MeOSData | null>(null);
  const [isLoadingBrandywine, setIsLoadingBrandywine] = useState(false);

  const handleTemplateChange = (templateId: string) => {
    const template = eventTemplates.find(t => t.id === templateId);
    setSelectedTemplate(template || null);
    
    if (template) {
      form.setFieldsValue({
        eventType: template.eventType,
        allowMultipleCourses: template.allowMultipleCourses
      });
    }
  };

  // Load Brandywine test data
  const loadBrandywineData = async () => {
    setIsLoadingBrandywine(true);
    try {
      const parsedData = await FileService.loadBrandywineTestData();
      
      setBrandywineData(parsedData);
      
      // Pre-fill form with Brandywine data
      form.setFieldsValue({
        name: parsedData.event.name,
        date: parsedData.event.date ? dayjs(parsedData.event.date) : undefined,
        organizer: parsedData.event.organizer,
        coursePlanner: parsedData.event.courseSetter,
        website: parsedData.event.homepage,
        eventType: 'individual', // Default based on courses
        allowMultipleCourses: false,
        description: `Event with ${parsedData.courses.length} courses and ${parsedData.classes.length} classes`
      });
      
      message.success(`Loaded Brandywine test data: ${parsedData.courses.length} courses, ${parsedData.classes.length} classes`);
    } catch (error) {
      console.error('Failed to load Brandywine data:', error);
      message.error('Failed to load Brandywine test data. Using default template.');
    } finally {
      setIsLoadingBrandywine(false);
    }
  };

  const handleSubmit = async (values: any) => {
    const eventConfig = {
      ...values,
      date: values.date ? values.date.format('YYYY-MM-DD') : undefined,
      template: selectedTemplate,
      brandywineData: brandywineData, // Include parsed data
      configuredAt: new Date().toISOString()
    };

    onComplete(eventConfig);
  };

  const initialValues = {
    name: data.name || '',
    date: data.date ? dayjs(data.date) : undefined,
    organizer: data.organizer || '',
    coursePlanner: data.coursePlanner || '',
    website: data.website || '',
    eventType: data.eventType || 'individual',
    allowMultipleCourses: data.allowMultipleCourses || false,
    description: data.description || ''
  };

  return (
    <div style={{ width: '100%', minWidth: '800px' }}>
      <Alert
        message="Event Configuration"
        description="Set up your DVOA event details and select the appropriate event type template."
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
        action={
          <Button 
            icon={<FileOutlined />} 
            loading={isLoadingBrandywine}
            onClick={loadBrandywineData}
            size="small"
          >
            Load Brandywine Test Data
          </Button>
        }
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={initialValues}
        onFinish={handleSubmit}
      >
        <Row gutter={[24, 24]} style={{ width: '100%' }}>
          <Col span={12}>
            <Card title="Event Information" style={{ marginBottom: 24 }}>
              <Form.Item
                name="name"
                label="Event Name"
                rules={[{ required: true, message: 'Event name is required' }]}
              >
                <Input placeholder="e.g., DVOA Spring Classic" />
              </Form.Item>

              <Form.Item
                name="date"
                label="Event Date"
                rules={[{ required: true, message: 'Event date is required' }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>

              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <Form.Item
                    name="organizer"
                    label="Organizer"
                    rules={[{ required: true, message: 'Organizer is required' }]}
                  >
                    <Input placeholder="Organization name" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="coursePlanner"
                    label="Course Planner"
                    rules={[{ required: true, message: 'Course planner is required' }]}
                  >
                    <Input placeholder="Planner name" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                name="website"
                label="Event Website"
              >
                <Input 
                  prefix={<GlobalOutlined />}
                  placeholder="https://example.com/event"
                />
              </Form.Item>

              <Form.Item
                name="description"
                label="Event Description"
              >
                <TextArea 
                  rows={3}
                  placeholder="Brief description of the event, special instructions, etc."
                />
              </Form.Item>
            </Card>
          </Col>

          <Col span={12}>
            <Card title="Event Type" style={{ marginBottom: 24 }}>
              <Form.Item
                label="Event Template"
                style={{ marginBottom: 16 }}
              >
                <Select
                  placeholder="Select event template"
                  onChange={handleTemplateChange}
                  value={selectedTemplate?.id}
                >
                  {eventTemplates.map(template => (
                    <Option key={template.id} value={template.id}>
                      <div>
                        <strong>{template.name}</strong>
                        <div style={{ fontSize: '12px', color: '#666' }}>
                          {template.description}
                        </div>
                      </div>
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              {selectedTemplate && (
                <Alert
                  message={selectedTemplate.name}
                  description={
                    <div>
                      <div>{selectedTemplate.description}</div>
                      <div style={{ marginTop: 8 }}>
                        <strong>Default Classes:</strong> {selectedTemplate.defaultClasses.join(', ')}
                      </div>
                      <div>
                        <strong>Multiple Courses:</strong> {selectedTemplate.allowMultipleCourses ? 'Yes' : 'No'}
                      </div>
                    </div>
                  }
                  type="success"
                  style={{ marginBottom: 16 }}
                />
              )}

              <Form.Item
                name="eventType"
                label="Event Type"
                rules={[{ required: true, message: 'Event type is required' }]}
              >
                <Radio.Group>
                  <Radio value="individual">Individual</Radio>
                  <Radio value="sprint">Sprint</Radio>
                  <Radio value="relay">Relay</Radio>
                  <Radio value="regaining">Regaining</Radio>
                </Radio.Group>
              </Form.Item>

              <Form.Item
                name="allowMultipleCourses"
                label="Multiple Courses per Runner"
                valuePropName="checked"
              >
                <Radio.Group>
                  <Radio value={true}>Yes</Radio>
                  <Radio value={false}>No</Radio>
                </Radio.Group>
              </Form.Item>
            </Card>
            
            {brandywineData && (
              <Card size="small" title="Loaded Test Data" style={{ marginTop: 16 }}>
                <div style={{ fontSize: '12px', color: '#666' }}>
                  <div><strong>Courses:</strong> {brandywineData.courses.map(c => `${c.name} (${c.length}m)`).join(', ')}</div>
                  <div style={{ marginTop: 4 }}><strong>Classes:</strong> {brandywineData.classes.map(c => c.name).join(', ')}</div>
                  <div style={{ marginTop: 4 }}><strong>Controls:</strong> {brandywineData.controls.length} controls</div>
                  <div style={{ marginTop: 4 }}><strong>Clubs:</strong> {brandywineData.clubs.map(c => c.name).join(', ')}</div>
                </div>
              </Card>
            )}
          </Col>
        </Row>

        <div style={{ textAlign: 'right' }}>
          <Space>
            <Button size="large">
              Save Draft
            </Button>
            <Button 
              type="primary" 
              size="large" 
              htmlType="submit"
              loading={isProcessing}
            >
              Continue to Course Import
            </Button>
          </Space>
        </div>
      </Form>
    </div>
  );
}