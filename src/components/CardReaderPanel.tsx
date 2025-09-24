import React, { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Badge,
  Space,
  Typography,
  Alert,
  Statistic,
  Row,
  Col,
  Modal,
  Input,
  message,
  Divider,
  Tooltip
} from 'antd';
import {
  UsbOutlined,
  DisconnectOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  ReloadOutlined,
  SettingOutlined,
  IdcardOutlined,
  SoundOutlined
} from '@ant-design/icons';
import { sportIdentService, type SICard, type SICardReadEvent } from '../services/sportIdentService';

const { Title, Text } = Typography;

interface CardReaderPanelProps {
  onCardRead?: (card: SICard) => void;
  compact?: boolean;
}

const CardReaderPanel: React.FC<CardReaderPanelProps> = ({ 
  onCardRead,
  compact = false 
}) => {
  const [status, setStatus] = useState(sportIdentService.getStatus());
  const [connecting, setConnecting] = useState(false);
  const [testModalVisible, setTestModalVisible] = useState(false);
  const [testCardNumber, setTestCardNumber] = useState('');
  const [lastCardReadTime, setLastCardReadTime] = useState<Date | null>(null);
  const [readerSupported, setReaderSupported] = useState(true);

  // Check Web Serial API support on mount
  useEffect(() => {
    setReaderSupported(sportIdentService.isWebSerialSupported());
  }, []);

  // Set up card read event listener
  useEffect(() => {
    const handleCardReadEvent = (event: SICardReadEvent) => {
      console.log('[CardReaderPanel] Card read event:', event);
      
      // Update status
      setStatus(sportIdentService.getStatus());
      
      if (event.type === 'card_read' && event.card) {
        setLastCardReadTime(new Date());
        
        // Play sound notification (if browser supports it)
        try {
          const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+D11Wk=');
          audio.volume = 0.3;
          audio.play().catch(() => {
            // Ignore audio play errors (browser restrictions)
          });
        } catch (error) {
          // Ignore audio errors
        }
        
        // Notify parent component
        if (onCardRead) {
          onCardRead(event.card);
        }

        // Show success message
        message.success(`Card ${event.card.cardNumber} read successfully!`, 2);
      } else if (event.type === 'connection_lost') {
        message.error('Lost connection to card reader');
        setStatus(sportIdentService.getStatus());
      } else if (event.type === 'reader_error') {
        message.warning(`Reader error: ${event.error}`);
        setStatus(sportIdentService.getStatus());
      }
    };

    sportIdentService.addCallback(handleCardReadEvent);

    // Update status periodically
    const statusInterval = setInterval(() => {
      setStatus(sportIdentService.getStatus());
    }, 1000);

    return () => {
      sportIdentService.removeCallback(handleCardReadEvent);
      clearInterval(statusInterval);
    };
  }, [onCardRead]);

  const handleConnect = async () => {
    if (!readerSupported) {
      Modal.warning({
        title: 'Web Serial API Not Supported',
        content: (
          <div>
            <p>Your browser doesn't support the Web Serial API needed for card reader communication.</p>
            <p><strong>Please use:</strong></p>
            <ul>
              <li>Google Chrome 89+</li>
              <li>Microsoft Edge 89+</li>
            </ul>
            <p>Firefox and Safari are not currently supported.</p>
          </div>
        ),
        width: 500,
      });
      return;
    }

    setConnecting(true);
    try {
      await sportIdentService.connect();
      message.success('Connected to SportIdent reader');
    } catch (error) {
      console.error('Connection failed:', error);
      if (error instanceof Error) {
        if (error.message.includes('No port selected')) {
          message.warning('No reader selected. Please select your BSF8 reader from the list.');
        } else {
          message.error(`Failed to connect: ${error.message}`);
        }
      } else {
        message.error('Failed to connect to card reader');
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await sportIdentService.disconnect();
      message.info('Disconnected from card reader');
    } catch (error) {
      console.error('Disconnect failed:', error);
      message.error('Failed to disconnect from card reader');
    }
  };

  const handleTestCard = async () => {
    const cardNumber = parseInt(testCardNumber);
    if (isNaN(cardNumber) || cardNumber <= 0) {
      message.error('Please enter a valid card number');
      return;
    }

    try {
      await sportIdentService.testCardRead(cardNumber);
      setTestModalVisible(false);
      setTestCardNumber('');
    } catch (error) {
      console.error('Test card read failed:', error);
      message.error('Test card read failed');
    }
  };

  const getConnectionBadge = () => {
    if (status.connected) {
      return <Badge status="success" text="Connected" />;
    } else if (connecting) {
      return <Badge status="processing" text="Connecting..." />;
    } else {
      return <Badge status="default" text="Disconnected" />;
    }
  };

  const getStatusColor = () => {
    if (!readerSupported) return 'red';
    if (status.connected) return 'green';
    if (connecting) return 'blue';
    return 'gray';
  };

  if (compact) {
    return (
      <Card size="small" style={{ marginBottom: '16px' }}>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Space>
              <UsbOutlined style={{ color: getStatusColor(), fontSize: '16px' }} />
              <Text strong>Card Reader</Text>
              {getConnectionBadge()}
              {status.connected && status.lastCard && (
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  Last: {status.lastCard.cardNumber} ({status.readCount} reads)
                </Text>
              )}
            </Space>
          </Col>
          <Col>
            <Space>
              {!status.connected ? (
                <Button 
                  type="primary" 
                  icon={<UsbOutlined />}
                  loading={connecting}
                  onClick={handleConnect}
                  disabled={!readerSupported}
                >
                  Connect
                </Button>
              ) : (
                <Button 
                  icon={<DisconnectOutlined />}
                  onClick={handleDisconnect}
                >
                  Disconnect
                </Button>
              )}
              <Button 
                icon={<SettingOutlined />}
                onClick={() => setTestModalVisible(true)}
                title="Test card read"
              />
            </Space>
          </Col>
        </Row>
      </Card>
    );
  }

  return (
    <>
      <Card 
        title={
          <Space>
            <UsbOutlined style={{ color: getStatusColor() }} />
            SportIdent Card Reader
            {getConnectionBadge()}
          </Space>
        }
        extra={
          <Space>
            <Button 
              icon={<SettingOutlined />}
              onClick={() => setTestModalVisible(true)}
              title="Test & Settings"
            >
              Test
            </Button>
          </Space>
        }
      >
        {!readerSupported && (
          <Alert
            message="Web Serial API Not Supported"
            description="Please use Chrome or Edge browser for card reader support."
            type="warning"
            showIcon
            style={{ marginBottom: '16px' }}
          />
        )}

        <Row gutter={16}>
          <Col span={12}>
            <Space direction="vertical" style={{ width: '100%' }}>
              {!status.connected ? (
                <Button 
                  type="primary" 
                  icon={<UsbOutlined />}
                  loading={connecting}
                  onClick={handleConnect}
                  disabled={!readerSupported}
                  size="large"
                  block
                >
                  Connect to BSF8 Reader
                </Button>
              ) : (
                <Button 
                  danger
                  icon={<DisconnectOutlined />}
                  onClick={handleDisconnect}
                  size="large"
                  block
                >
                  Disconnect Reader
                </Button>
              )}

              {status.connected && status.deviceInfo && (
                <Alert
                  message="Reader Connected"
                  description={
                    <div>
                      <Text style={{ fontSize: '12px' }}>
                        Vendor ID: 0x{status.deviceInfo.vendorId?.toString(16).toUpperCase()}<br/>
                        Product ID: 0x{status.deviceInfo.productId?.toString(16).toUpperCase()}
                      </Text>
                    </div>
                  }
                  type="success"
                  showIcon
                />
              )}
            </Space>
          </Col>

          <Col span={12}>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Statistic
                  title="Cards Read"
                  value={status.readCount}
                  prefix={<IdcardOutlined />}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="Errors"
                  value={status.errorCount}
                  prefix={<WarningOutlined />}
                  valueStyle={{ color: status.errorCount > 0 ? '#cf1322' : undefined }}
                />
              </Col>
            </Row>

            {status.lastCard && (
              <div style={{ marginTop: '16px' }}>
                <Divider style={{ margin: '12px 0' }} />
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text strong style={{ color: '#52c41a' }}>
                    <CheckCircleOutlined /> Last Card Read
                  </Text>
                  <div style={{ 
                    padding: '12px', 
                    backgroundColor: '#f6ffed', 
                    border: '1px solid #b7eb8f', 
                    borderRadius: '6px' 
                  }}>
                    <Row>
                      <Col span={12}>
                        <Text strong>Card Number:</Text><br/>
                        <Text style={{ fontSize: '18px', fontFamily: 'monospace' }}>
                          {status.lastCard.cardNumber}
                        </Text>
                      </Col>
                      <Col span={12}>
                        <Text strong>Card Type:</Text><br/>
                        <Text>SI{status.lastCard.cardSeries}</Text>
                        <br/><br/>
                        <Text strong>Read Time:</Text><br/>
                        <Text style={{ fontSize: '12px' }}>
                          {status.lastCard.readTime.toLocaleTimeString()}
                        </Text>
                      </Col>
                    </Row>
                  </div>
                </Space>
              </div>
            )}
          </Col>
        </Row>

        {status.connected && (
          <Alert
            message="Reader Ready"
            description="Place a SportIdent card on the reader to read its number. The reader will beep when a card is successfully read."
            type="info"
            showIcon
            style={{ marginTop: '16px' }}
          />
        )}
      </Card>

      {/* Test Card Read Modal */}
      <Modal
        title="Test Card Reader"
        open={testModalVisible}
        onOk={handleTestCard}
        onCancel={() => {
          setTestModalVisible(false);
          setTestCardNumber('');
        }}
        okText="Test Read"
        cancelText="Cancel"
        width={400}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            message="Development Testing"
            description="This simulates a card read for testing purposes. Enter any card number to test the card read workflow."
            type="info"
            showIcon
          />
          
          <div>
            <Text strong>Test Card Number:</Text>
            <Input
              placeholder="Enter card number (e.g., 1234567)"
              value={testCardNumber}
              onChange={(e) => setTestCardNumber(e.target.value)}
              onPressEnter={handleTestCard}
              style={{ marginTop: '8px' }}
            />
          </div>

          <Divider />

          <div>
            <Text strong>Reader Status:</Text>
            <div style={{ marginTop: '8px' }}>
              {getConnectionBadge()}
              {status.connected && (
                <div style={{ marginTop: '8px' }}>
                  <Text>✅ Connected and ready</Text>
                </div>
              )}
              {!readerSupported && (
                <div style={{ marginTop: '8px' }}>
                  <Text type="warning">⚠️ Web Serial API not supported</Text>
                </div>
              )}
            </div>
          </div>
        </Space>
      </Modal>
    </>
  );
};

export default CardReaderPanel;