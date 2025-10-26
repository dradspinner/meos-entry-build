import React from 'react';
import { Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import EventDayCheckIn from './EventDayCheckIn';

interface EventDayCheckInPageProps {
  onBack: () => void;
}

const EventDayCheckInPage: React.FC<EventDayCheckInPageProps> = ({ onBack }) => {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack} size="large">Back to Event Day Dashboard</Button>
      </div>
      <EventDayCheckIn visible={true} onClose={onBack} />
    </div>
  );
};

export default EventDayCheckInPage;
