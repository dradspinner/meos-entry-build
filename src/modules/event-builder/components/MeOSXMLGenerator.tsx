import { Card, Alert, Button, Result, Descriptions, message } from 'antd';
import { CheckCircleOutlined, DownloadOutlined, FileTextOutlined } from '@ant-design/icons';
import { FileService } from '../services/fileService';
import { type MeOSData } from '../services/meosXmlParser';

interface MeOSXMLGeneratorProps {
  data: any;
  onComplete: (data: any) => void;
  isProcessing: boolean;
}

export default function MeOSXMLGenerator({ data, onComplete, isProcessing }: MeOSXMLGeneratorProps) {
  const brandywineData: MeOSData | null = data.brandywineData || null;
  
  const handleDownloadXML = () => {
    if (!brandywineData) {
      message.error('No event data available to generate XML');
      return;
    }
    
    try {
      const filename = `${data.name || 'event'}.meosxml`;
      FileService.downloadMeOSXML(brandywineData, filename.replace(/\s+/g, '_'));
      message.success('MeOS XML file downloaded successfully!');
    } catch (error) {
      console.error('Failed to generate XML:', error);
      message.error('Failed to generate MeOS XML file');
    }
  };
  
  const handleDownloadStats = () => {
    if (!brandywineData) {
      message.error('No course data available to export stats');
      return;
    }
    
    try {
      const filename = `${data.name || 'event'}_course_stats.csv`;
      FileService.downloadCourseStats(brandywineData, filename.replace(/\s+/g, '_'));
      message.success('Course statistics exported successfully!');
    } catch (error) {
      console.error('Failed to export stats:', error);
      message.error('Failed to export course statistics');
    }
  };

  const handleComplete = () => {
    onComplete({ xmlGenerated: true });
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

      <Card>
        <Result
          icon={<CheckCircleOutlined />}
          title="Event Ready for Generation"
          subTitle={`Event: ${data.name || 'Untitled Event'} • Date: ${data.date || 'Not set'}`}
          extra={[
            <Button 
              key="download"
              type="primary" 
              icon={<DownloadOutlined />}
              onClick={handleDownloadXML}
              loading={isProcessing}
              disabled={!brandywineData}
            >
              Generate & Download MeOS XML
            </Button>,
            <Button 
              key="stats"
              icon={<FileTextOutlined />}
              onClick={handleDownloadStats}
              disabled={!brandywineData}
            >
              Export Course Stats
            </Button>,
            <Button key="complete" onClick={handleComplete}>
              Complete Event Setup
            </Button>
          ]}
        />
        
        {brandywineData && (
          <div style={{ marginTop: 24 }}>
            <Descriptions 
              title="Event Summary"
              bordered
              column={2}
              size="small"
            >
              <Descriptions.Item label="Event Name">{data.name || 'Not set'}</Descriptions.Item>
              <Descriptions.Item label="Date">{data.date || 'Not set'}</Descriptions.Item>
              <Descriptions.Item label="Organizer">{data.organizer || 'Not set'}</Descriptions.Item>
              <Descriptions.Item label="Course Planner">{data.coursePlanner || 'Not set'}</Descriptions.Item>
              <Descriptions.Item label="Courses">{brandywineData.courses.length}</Descriptions.Item>
              <Descriptions.Item label="Classes">{brandywineData.classes.length}</Descriptions.Item>
              <Descriptions.Item label="Controls">{brandywineData.controls.length}</Descriptions.Item>
              <Descriptions.Item label="Clubs">{brandywineData.clubs.length}</Descriptions.Item>
              <Descriptions.Item label="Event Type">{data.eventType || 'Individual'}</Descriptions.Item>
              <Descriptions.Item label="Website">
                {data.website ? (
                  <a href={data.website} target="_blank" rel="noopener noreferrer">
                    {data.website}
                  </a>
                ) : 'Not set'}
              </Descriptions.Item>
            </Descriptions>
            
            <Card size="small" title="Course Overview" style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {brandywineData.courses.map(course => (
                  <div key={course.id} style={{ 
                    padding: '8px 12px', 
                    background: '#f0f0f0', 
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}>
                    <strong>{course.name}</strong><br />
                    {course.length}m • {course.controls.length} controls
                    {course.climb ? ` • ${course.climb}m climb` : ''}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
        
        {!brandywineData && (
          <Alert
            style={{ marginTop: 24 }}
            message="No Event Data"
            description="Load test data or import event files in the previous steps to generate MeOS XML."
            type="warning"
            showIcon
          />
        )}
      </Card>
    </div>
  );
}