import React from 'react';
import { Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import SameDayRegistration from './SameDayRegistration';

interface SameDayRegistrationPageProps {
  onBack: () => void;
}

const SameDayRegistrationPage: React.FC<SameDayRegistrationPageProps> = ({ onBack }) => {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack} size="large">Back to Event Day Dashboard</Button>
      </div>
      <SameDayRegistration />
    </div>
  );
};

export default SameDayRegistrationPage;
