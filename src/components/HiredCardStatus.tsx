import React, { useState, useEffect } from 'react';
import { Tooltip, Typography } from 'antd';
import { CheckCircleOutlined, WarningOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { meosHiredCardService, type MeosHiredCardStatus } from '../services/meosHiredCardService';

const { Text } = Typography;

interface HiredCardStatusProps {
  cardNumber: string;
  isHiredCard: boolean;
  inline?: boolean; // New prop for inline display
  size?: 'small' | 'default';
}

const HiredCardStatus: React.FC<HiredCardStatusProps> = ({
  cardNumber,
  isHiredCard,
  inline = false,
  size = 'default'
}) => {
  const [status, setStatus] = useState<MeosHiredCardStatus | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isHiredCard && cardNumber && cardNumber !== '0') {
      setLoading(true);
      meosHiredCardService.getHiredCardStatus(cardNumber)
        .then(setStatus)
        .catch(error => {
          console.error('Failed to get hired card status:', error);
          setStatus({
            cardNumber: cardNumber.trim(),
            isInMeos: false,
            source: 'unknown'
          });
        })
        .finally(() => setLoading(false));
    } else {
      setStatus(null);
    }
  }, [cardNumber, isHiredCard]);

  // Don't show anything if not a hired card
  if (!isHiredCard || !cardNumber || cardNumber === '0') {
    return null;
  }

  // Show loading state
  if (loading) {
    if (inline) {
      return <InfoCircleOutlined spin style={{ color: '#1890ff', marginLeft: '4px' }} />;
    }
    return (
      <div style={{ color: '#1890ff' }}>
        <InfoCircleOutlined spin /> Checking MeOS status...
      </div>
    );
  }

  // Show status if we have it
  if (status) {
    if (status.isInMeos) {
      // Card is already in MeOS - no action needed
      if (inline) {
        return (
          <Tooltip title={`Card ${cardNumber} is already registered as hired in MeOS - ready to submit!`}>
            <CheckCircleOutlined style={{ color: '#52c41a', marginLeft: '4px' }} />
          </Tooltip>
        );
      }
      return (
        <div style={{ color: '#52c41a' }}>
          <CheckCircleOutlined /> Card is registered in MeOS
        </div>
      );
    } else {
      // Card needs to be imported to MeOS
      if (inline) {
        return (
          <Tooltip title={`Card ${cardNumber} needs to be imported to MeOS first - export hired cards CSV and import to MeOS`}>
            <WarningOutlined style={{ color: '#fa8c16', marginLeft: '4px' }} />
          </Tooltip>
        );
      }
      return (
        <div style={{ color: '#fa8c16' }}>
          <WarningOutlined /> Card needs MeOS import
        </div>
      );
    }
  }

  // Fallback - no status available
  if (inline) {
    return null; // Don't show anything inline if we don't have status
  }
  return (
    <div style={{ color: '#666' }}>
      <InfoCircleOutlined /> Hired card status unknown
    </div>
  );
};

export default HiredCardStatus;