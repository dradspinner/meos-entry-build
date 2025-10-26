import React from 'react';
import { Card, Row, Col, Button, Typography, Divider } from 'antd';
import { 
  CalendarOutlined, 
  PlayCircleOutlined, 
  ToolOutlined,
  FileTextOutlined,
  UsergroupAddOutlined,
  TrophyOutlined,
  GlobalOutlined
} from '@ant-design/icons';

const { Title, Paragraph } = Typography;

interface DashboardProps {
  onNavigateToEventBuilder: () => void;
  onNavigateToEventDayOps: () => void;
  onNavigateToResultsExport?: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  onNavigateToEventBuilder, 
  onNavigateToEventDayOps,
  onNavigateToResultsExport
}) => {

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Title level={2} style={{ textAlign: 'center', marginBottom: '40px' }}>
        MeOS Event Management System
      </Title>
      
      <Paragraph style={{ textAlign: 'center', fontSize: '16px', marginBottom: '40px' }}>
        Complete event management solution for orienteering competitions. 
        Build events, manage entries, and run day-of-event operations.
      </Paragraph>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={12}>
          <Card 
            hoverable
            style={{ height: '100%', minHeight: '350px' }}
            cover={
              <div style={{ 
                padding: '40px', 
                textAlign: 'center', 
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white'
              }}>
                <CalendarOutlined style={{ fontSize: '48px', marginBottom: '16px' }} />
                <Title level={3} style={{ color: 'white', margin: 0 }}>
                  Event Builder
                </Title>
              </div>
            }
          >
            <div style={{ padding: '8px' }}>
              <Paragraph>
                <strong>Pre-Event Setup</strong>
              </Paragraph>
              <Paragraph>
                Set up your orienteering event by configuring event details, 
                importing course data from planning software, and generating 
                MeOS-compatible XML files for event management.
              </Paragraph>
              
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <ToolOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
                  <span>Event Configuration</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <FileTextOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
                  <span>Course Import (IOF XML)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
                  <FileTextOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
                  <span>MeOS XML Generation</span>
                </div>
              </div>

              <Button 
                type="primary" 
                size="large" 
                block
                onClick={onNavigateToEventBuilder}
                style={{ height: '48px', fontSize: '16px' }}
              >
                Launch Event Builder
              </Button>
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card 
            hoverable
            style={{ height: '100%', minHeight: '350px' }}
            cover={
              <div style={{ 
                padding: '40px', 
                textAlign: 'center', 
                background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                color: 'white'
              }}>
                <PlayCircleOutlined style={{ fontSize: '48px', marginBottom: '16px' }} />
                <Title level={3} style={{ color: 'white', margin: 0 }}>
                  Event Day Operations
                </Title>
              </div>
            }
          >
            <div style={{ padding: '8px' }}>
              <Paragraph>
                <strong>Day-of-Event Management</strong>
              </Paragraph>
              <Paragraph>
                Manage participant entries, handle late registrations, 
                process results, and run all day-of-event operations 
                with direct MeOS integration.
              </Paragraph>
              
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <UsergroupAddOutlined style={{ marginRight: '8px', color: '#ff4d4f' }} />
                  <span>Entry Management</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <PlayCircleOutlined style={{ marginRight: '8px', color: '#ff4d4f' }} />
                  <span>Real-time Operations</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
                  <TrophyOutlined style={{ marginRight: '8px', color: '#ff4d4f' }} />
                  <span>Results Processing</span>
                </div>
              </div>

              <Button 
                type="primary" 
                danger
                size="large" 
                block
                onClick={onNavigateToEventDayOps}
                style={{ height: '48px', fontSize: '16px' }}
              >
                Launch Event Day Operations
              </Button>
              
              <Paragraph style={{ 
                textAlign: 'center', 
                marginTop: '12px', 
                fontSize: '12px', 
                color: '#999',
                marginBottom: 0
              }}>
                Available in Phase 2
              </Paragraph>
            </div>
          </Card>
        </Col>
      </Row>

      {onNavigateToResultsExport && (
        <Row gutter={[24, 24]} style={{ marginTop: '24px' }}>
          <Col xs={24} lg={12}>
            <Card 
              hoverable
              style={{ height: '100%' }}
              cover={
                <div style={{ 
                  padding: '40px', 
                  textAlign: 'center', 
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white'
                }}>
                  <GlobalOutlined style={{ fontSize: '48px', marginBottom: '16px' }} />
                  <Title level={3} style={{ color: 'white', margin: 0 }}>
                    Post Results Online
                  </Title>
                </div>
              }
            >
              <div style={{ padding: '8px' }}>
                <Paragraph>
                  <strong>Results Export</strong>
                </Paragraph>
                <Paragraph>
                  Generate professional HTML results pages from OE12 XML files 
                  for posting to your club website.
                </Paragraph>
                
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                    <FileTextOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
                    <span>Import OE12 XML Results</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                    <GlobalOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
                    <span>Generate HTML Pages</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
                    <TrophyOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
                    <span>Professional Styling</span>
                  </div>
                </div>

                <Button 
                  type="primary" 
                  size="large" 
                  block
                  onClick={onNavigateToResultsExport}
                  style={{ height: '48px', fontSize: '16px' }}
                >
                  Launch Results Export
                </Button>
              </div>
            </Card>
          </Col>
        </Row>
      )}

      <Divider style={{ margin: '40px 0' }} />
      
      <div style={{ textAlign: 'center' }}>
        <Paragraph style={{ color: '#666' }}>
          Built for DVOA • Powered by MeOS • Version 1.0
        </Paragraph>
      </div>
    </div>
  );
};

export default Dashboard;