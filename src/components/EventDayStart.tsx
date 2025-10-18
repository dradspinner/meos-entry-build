import React from 'react';
import { Card, Typography, Button, Row, Col, Statistic, Space, Alert, Modal } from 'antd';
import { HistoryOutlined, ReloadOutlined } from '@ant-design/icons';
import { localEntryService } from '../services/localEntryService';

const { Title, Text, Paragraph } = Typography;

interface EventDayStartProps {
  onResume: () => void;
  onStartNew: () => void;
}

const EventDayStart: React.FC<EventDayStartProps> = ({ onResume, onStartNew }) => {
  const entries = localEntryService.getAllEntries();
  const total = entries.length;
  const checkedIn = entries.filter(e => e.status === 'checked-in').length;
  const pending = total - checkedIn;
  const dirPref = localEntryService.getSaveDirectoryPreference();

  const confirmNew = () => {
    Modal.confirm({
      title: 'Start a new event?',
      content: 'This will archive current entries and clear the local dashboard.',
      okText: 'Start New',
      okType: 'danger',
      onOk: () => {
        localEntryService.clearAllEntries();
        onStartNew();
      }
    });
  };

  return (
    <div style={{ padding: '24px', maxWidth: 1000, margin: '0 auto' }}>
      <Title level={2} style={{ marginBottom: 8 }}>Event Day Operations</Title>
      <Text type="secondary">Resume your last event or start a new one</Text>

      <Row gutter={[16,16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="Total Entries" value={total} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="Checked In" value={checkedIn} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="Pending" value={pending} />
          </Card>
        </Col>
      </Row>

      <Alert
        style={{ marginTop: 16 }}
        type="info"
        showIcon
        message="Working directory"
        description={<Text type="secondary">{dirPref}</Text>}
      />

      <Row gutter={[16,16]} style={{ marginTop: 24 }}>
        <Col xs={24} md={12}>
          <Card hoverable>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Title level={4}><HistoryOutlined /> Resume Existing Event</Title>
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                Continue with imported entries and current check-in status.
              </Paragraph>
              <Button type="primary" size="large" onClick={onResume} disabled={total === 0}>
                Resume
              </Button>
            </Space>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card hoverable>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Title level={4}><ReloadOutlined /> Start New Event</Title>
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                Clear local entries and begin with a fresh import.
              </Paragraph>
              <Button danger size="large" onClick={confirmNew}>
                Start New Event
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default EventDayStart;
