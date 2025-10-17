import { Card, Alert, Upload, Button, List, Tag, Row, Col, Statistic, Descriptions } from 'antd';
import { UploadOutlined, FileOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { MeOSXMLParser, type MeOSData, type MeOSCourse } from '../services/meosXmlParser';

interface CourseImporterProps {
  data: any;
  onComplete: (data: any) => void;
  isProcessing: boolean;
}

export default function CourseImporter({ data, onComplete, isProcessing }: CourseImporterProps) {
  // Use Brandywine data if available from previous step
  const brandywineData: MeOSData | null = data.brandywineData || null;
  const courses: MeOSCourse[] = brandywineData?.courses || [];
  
  const getCourseStats = () => {
    if (!brandywineData) return null;
    return MeOSXMLParser.getCourseStats(brandywineData);
  };

  const handleContinue = () => {
    onComplete({ 
      courses: courses,
      courseStats: getCourseStats(),
      brandywineData: brandywineData
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

      {!brandywineData ? (
        <Card title="Import Course Files" style={{ marginBottom: 24 }}>
          <Upload.Dragger
            name="courseFile"
            accept=".xml"
            beforeUpload={() => false}
            onChange={() => {}}
          >
            <p className="ant-upload-drag-icon">
              <FileOutlined />
            </p>
            <p className="ant-upload-text">Click or drag XML course files to this area to upload</p>
            <p className="ant-upload-hint">
              Supports single or multiple file upload. XML files from course planning software.
            </p>
          </Upload.Dragger>
        </Card>
      ) : (
        <Card title="Course Data Summary" style={{ marginBottom: 24 }}>
          <Row gutter={16}>
            <Col span={6}>
              <Statistic title="Total Courses" value={courses.length} />
            </Col>
            <Col span={6}>
              <Statistic title="Total Classes" value={brandywineData.classes.length} />
            </Col>
            <Col span={6}>
              <Statistic title="Total Controls" value={brandywineData.controls.length} />
            </Col>
            <Col span={6}>
              <Statistic 
                title="Longest Course" 
                value={Math.max(...courses.map(c => c.length))} 
                suffix="m" 
              />
            </Col>
          </Row>
        </Card>
      )}

      <Card title={brandywineData ? "Brandywine Test Courses" : "Imported Courses"}>
        {courses.length > 0 ? (
          <List
            dataSource={courses}
            renderItem={(course) => {
              const stats = getCourseStats()?.[course.name];
              return (
                <List.Item>
                  <List.Item.Meta
                    avatar={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                    title={course.name}
                    description={
                      <div>
                        <div>{course.length}m • {course.controls.length} controls{course.climb ? ` • ${course.climb}m climb` : ''}</div>
                        {stats && (
                          <div style={{ fontSize: '12px', color: '#666', marginTop: 4 }}>
                            Classes: {stats.classes.join(', ')}
                          </div>
                        )}
                      </div>
                    }
                  />
                  <Tag color="green">Ready</Tag>
                </List.Item>
              );
            }}
          />
        ) : (
          <Alert
            message="No Courses Available"
            description="Load test data or import course files to see courses here."
            type="warning"
            showIcon
          />
        )}
        
        <div style={{ textAlign: 'right', marginTop: 24 }}>
          <Button 
            type="primary" 
            onClick={handleContinue}
            loading={isProcessing}
          >
            Continue to Entry Processing
          </Button>
        </div>
      </Card>
    </div>
  );
}