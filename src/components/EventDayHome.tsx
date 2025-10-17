import React from 'react';
import { Card, Row, Col, Button, Typography, Statistic } from 'antd';
import { CheckCircleOutlined, UserAddOutlined, DatabaseOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { localEntryService } from '../services/localEntryService';

const { Title, Paragraph, Text } = Typography;

interface EventDayHomeProps {
  onBack?: () => void;
  onOpenCheckIn: () => void;
  onOpenSameDay: () => void;
}

const EventDayHome: React.FC<EventDayHomeProps> = ({ onBack, onOpenCheckIn, onOpenSameDay }) => {
  const entries = localEntryService.getAllEntries();
  const totalEntries = entries.length;
  const checkedIn = entries.filter(e => e.status === 'checked-in').length;
  const pending = totalEntries - checkedIn;

  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
      {onBack && (
        <div style={{ marginBottom: 16 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={onBack} size="large">
            Back to Operations
          </Button>
        </div>
      )}

      <Title level={2} style={{ marginBottom: 8 }}>Event Day Dashboard</Title>
      <Text type="secondary">Check-in pre-registered runners or register new entries</Text>

      <Row gutter={[16, 16]} style={{ marginTop: 16, marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Total Entries" value={totalEntries} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Checked In" value={checkedIn} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Pending" value={pending} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={12}>
          <Card
            hoverable
            cover={
              <div style={{ padding: 32, textAlign: 'center', background: 'linear-gradient(135deg, #36cfc9 0%, #13c2c2 100%)', color: 'white' }}>
                <CheckCircleOutlined style={{ fontSize: 40 }} />
                <Title level={3} style={{ color: 'white', margin: 0 }}>Check-In (Pre-Registered)</Title>
              </div>
            }
          >
            <Paragraph>
              Use an SI reader to check in runners with their own e-punch, or lookup by name for rentals.
            </Paragraph>
            <Button type="primary" size="large" block onClick={onOpenCheckIn}>
              Open Check-In
            </Button>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            hoverable
            cover={
              <div style={{ padding: 32, textAlign: 'center', background: 'linear-gradient(135deg, #ffa940 0%, #fa8c16 100%)', color: 'white' }}>
                <UserAddOutlined style={{ fontSize: 40 }} />
                <Title level={3} style={{ color: 'white', margin: 0 }}>Same Day Registration</Title>
              </div>
            }
          >
            <Paragraph>
              Register new runners, assign courses and rental e-punches, and add them to the local database.
            </Paragraph>
            <Button type="primary" size="large" block onClick={onOpenSameDay}>
              Open Registration
            </Button>
          </Card>
        </Col>
      </Row>

      <Card style={{ marginTop: 24 }}>
        <Title level={4}>
          <DatabaseOutlined /> Data Flow
        </Title>
        <Paragraph type="secondary">
          Entries are stored locally and synced to MeOS at check-in. Use this dashboard throughout the event day.
        </Paragraph>
      </Card>
    </div>
  );
};

export default EventDayHome;
