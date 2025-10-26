// Enhanced Event Day Check-In Component
// Supports the three main event day scenarios:
// 1) Pre-registered with own card
// 2) Pre-registered with rental card  
// 3) Same day registration

import React, { useState, useEffect } from 'react';
import {
  Modal,
  Card,
  Button,
  Space,
  Typography,
  Input,
  Form,
  Row,
  Col,
  Select,
  Tag,
  Alert,
  Divider,
  message,
  List,
  Badge,
  Tooltip
} from 'antd';
import {
  UserOutlined,
  IdcardOutlined,
  LoginOutlined,
  PlusOutlined,
  UsbOutlined
} from '@ant-design/icons';
import { sportIdentService, type SICard, type SICardReadEvent } from '../services/sportIdentService';
import { localEntryService, type LocalEntry } from '../services/localEntryService';
import { localRunnerService } from '../services/localRunnerService';
import { meosHiredCardService } from '../services/meosHiredCardService';
import { meosClassService } from '../services/meosClassService';

const { Title, Text } = Typography;
const { Search } = Input;
const { Option } = Select;

interface EventDayCheckInProps {
  visible: boolean;
  onClose: () => void;
  onEntryProcessed?: (entry: LocalEntry, cardNumber: string, scenario: 'pre-reg-own' | 'pre-reg-rental' | 'same-day') => void;
}

interface WorkflowState {
  scenario: 'select' | 'pre-reg-own' | 'pre-reg-rental' | 'same-day';
  selectedEntry?: LocalEntry;
  scannedCard?: SICard;
  editingEntry?: Partial<LocalEntry>;
}

const EventDayCheckIn: React.FC<EventDayCheckInProps> = ({
  visible,
  onClose,
  onEntryProcessed
}) => {
  const [form] = Form.useForm();
  const [workflowState, setWorkflowState] = useState<WorkflowState>({ scenario: 'select' });
  const [readerStatus, setReaderStatus] = useState(sportIdentService.getStatus());
  const [searchResults, setSearchResults] = useState<LocalEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [processing, setProcessing] = useState(false);
  const [entries, setEntries] = useState<LocalEntry[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [rentalCardWarnings, setRentalCardWarnings] = useState<string[]>([]);

  // Load data when modal opens
  useEffect(() => {
    if (visible) {
      setEntries(localEntryService.getAllEntries());
      loadClasses();
      setWorkflowState({ scenario: 'select' });
      setSearchTerm('');
      setSearchResults([]);
      form.resetFields();
    }
  }, [visible, form]);

  // Set up card reader event listener
  useEffect(() => {
    if (!visible) return;

    const handleCardReadEvent = (event: SICardReadEvent) => {
      setReaderStatus(sportIdentService.getStatus());

      if (event.type === 'card_read' && event.card) {
        handleCardRead(event.card);
      }
    };

    sportIdentService.addCallback(handleCardReadEvent);

    const statusInterval = setInterval(() => {
      setReaderStatus(sportIdentService.getStatus());
    }, 2000);

    return () => {
      sportIdentService.removeCallback(handleCardReadEvent);
      clearInterval(statusInterval);
    };
  }, [visible, workflowState]);

  const loadClasses = async () => {
    try {
      const classData = await meosClassService.getClasses();
      setClasses(classData);
    } catch (error) {
      console.error('Failed to load classes:', error);
    }
  };

  const handleCardRead = async (card: SICard) => {
    console.log('[EventDayCheckIn] Card read:', card);
    
    const cardNumber = card.cardNumber.toString();
    setWorkflowState(prev => ({ ...prev, scannedCard: card }));

    // Check if this is a rental card that needs MeOS sync
    if (workflowState.scenario === 'pre-reg-rental' || workflowState.scenario === 'same-day') {
      await checkRentalCardStatus(cardNumber);
    }

    // Handle based on current scenario
    switch (workflowState.scenario) {
      case 'pre-reg-own':
        await handlePreRegOwnCard(card);
        break;
      case 'pre-reg-rental':
        await handlePreRegRentalCard(card);
        break;
      case 'same-day':
        await handleSameDayCard(card);
        break;
      default:
        // Auto-detect scenario
        await autoDetectScenario(card);
    }
  };

  const checkRentalCardStatus = async (cardNumber: string) => {
    try {
      const isInMeos = await meosHiredCardService.isCardInMeos(cardNumber);
      if (!isInMeos) {
        setRentalCardWarnings(prev => [
          ...prev,
          `⚠️ Card ${cardNumber} is not in MeOS hired card database. Sync needed.`
        ]);
      }
    } catch (error) {
      console.warn('Could not check rental card status:', error);
    }
  };

  const autoDetectScenario = async (card: SICard) => {
    const cardNumber = card.cardNumber.toString();
    
    // Look for existing entry with this card number
    const matchedEntry = entries.find(entry => 
      entry.cardNumber === cardNumber && entry.status === 'pending'
    );

    if (matchedEntry) {
      // Pre-registered with own card (Scenario 1)
      setWorkflowState({
        scenario: 'pre-reg-own',
        selectedEntry: matchedEntry,
        scannedCard: card
      });
      populateFormForEntry(matchedEntry);
      message.success(`Found pre-registered runner: ${matchedEntry.name.first} ${matchedEntry.name.last}`);
    } else {
      // Show options for rental or same-day
      message.info(`Card ${cardNumber} scanned. Choose scenario:`);
    }
  };

  const handlePreRegOwnCard = async (card: SICard) => {
    if (workflowState.selectedEntry) {
      // Card confirms the pre-selected entry
      message.success(`Card ${card.cardNumber} confirmed for ${workflowState.selectedEntry.name.first} ${workflowState.selectedEntry.name.last}`);
    }
  };

  const handlePreRegRentalCard = async (card: SICard) => {
    if (workflowState.selectedEntry) {
      // Assign rental card to the selected entry
      const updatedEntry = { 
        ...workflowState.selectedEntry, 
        cardNumber: card.cardNumber.toString(),
        isHiredCard: true 
      };
      setWorkflowState(prev => ({ ...prev, editingEntry: updatedEntry }));
      form.setFieldsValue({ cardNumber: card.cardNumber.toString() });
      message.success(`Rental card ${card.cardNumber} assigned to ${workflowState.selectedEntry.name.first} ${workflowState.selectedEntry.name.last}`);
    }
  };

  const handleSameDayCard = async (card: SICard) => {
    // Set the card number in the new registration form
    form.setFieldsValue({ cardNumber: card.cardNumber.toString() });
    setWorkflowState(prev => ({ ...prev, scannedCard: card }));
    message.success(`Card ${card.cardNumber} ready for same-day registration`);
  };

  const populateFormForEntry = (entry: LocalEntry) => {
    form.setFieldsValue({
      firstName: entry.name.first,
      lastName: entry.name.last,
      club: entry.club,
      birthYear: entry.birthYear,
      sex: entry.sex,
      nationality: entry.nationality,
      phone: entry.phone,
      classId: entry.classId,
      cardNumber: entry.cardNumber
    });
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    if (value.length >= 2) {
      const results = entries.filter(entry =>
        entry.status === 'pending' && (
          `${entry.name.first} ${entry.name.last}`.toLowerCase().includes(value.toLowerCase()) ||
          entry.club.toLowerCase().includes(value.toLowerCase()) ||
          entry.cardNumber.includes(value)
        )
      ).slice(0, 10);
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  };

  const handleSelectEntry = (entry: LocalEntry) => {
    setWorkflowState(prev => ({ ...prev, selectedEntry: entry }));
    populateFormForEntry(entry);
    setSearchResults([]);
    setSearchTerm('');
  };

  const handleCheckIn = async () => {
    try {
      setProcessing(true);
      const formValues = await form.validateFields();

      let updatedEntry: LocalEntry | null = null;

      switch (workflowState.scenario) {
        case 'pre-reg-own':
        case 'pre-reg-rental':
          if (!workflowState.selectedEntry) {
            throw new Error('No entry selected');
          }
          // Update existing entry
          updatedEntry = localEntryService.updateEntry(workflowState.selectedEntry.id, {
            name: {
              first: formValues.firstName,
              last: formValues.lastName
            },
            club: formValues.club,
            birthYear: formValues.birthYear,
            sex: formValues.sex,
            nationality: formValues.nationality,
            phone: formValues.phone,
            classId: formValues.classId,
            className: classes.find(c => c.id === formValues.classId)?.name || '',
            cardNumber: formValues.cardNumber,
            isHiredCard: workflowState.scenario === 'pre-reg-rental'
          });
          if (updatedEntry) {
            updatedEntry = localEntryService.checkInEntry(updatedEntry.id, formValues.cardNumber);
          }
          break;

        case 'same-day':
          // Create new entry
          const newEntry = localEntryService.addEntry({
            name: {
              first: formValues.firstName,
              last: formValues.lastName
            },
            club: formValues.club,
            birthYear: formValues.birthYear,
            sex: formValues.sex,
            nationality: formValues.nationality || '1',
            phone: formValues.phone || '',
            classId: formValues.classId,
            className: classes.find(c => c.id === formValues.classId)?.name || '',
            cardNumber: formValues.cardNumber,
            isHiredCard: formValues.isHiredCard || false,
            fee: classes.find(c => c.id === formValues.classId)?.fee || 0,
            importedFrom: 'manual'
          });
          updatedEntry = localEntryService.checkInEntry(newEntry.id, formValues.cardNumber);
          break;
      }

      if (updatedEntry) {
        // Update runner database
        await localRunnerService.learnFromEntry(updatedEntry);
        
        message.success(`✅ ${updatedEntry.name.first} ${updatedEntry.name.last} checked in successfully!`);
        
        if (onEntryProcessed) {
          onEntryProcessed(updatedEntry, formValues.cardNumber, workflowState.scenario as any);
        }

        // Reset for next participant
        setWorkflowState({ scenario: 'select' });
        form.resetFields();
        setRentalCardWarnings([]);
        
      } else {
        message.error('Failed to process check-in');
      }
    } catch (error) {
      console.error('Check-in error:', error);
      message.error('Check-in failed: ' + (error as Error).message);
    } finally {
      setProcessing(false);
    }
  };

  const handleConnectReader = async () => {
    try {
      await sportIdentService.connect();
      message.success('Connected to card reader');
    } catch (error) {
      console.error('Connection failed:', error);
      message.error('Failed to connect to card reader');
    }
  };

  return (
    <Modal
      title={
        <Space>
          <UserOutlined />
          Event Day Check-In
          {workflowState.scenario !== 'select' && (
            <Tag color="blue">
              {workflowState.scenario === 'pre-reg-own' && 'Pre-reg (Own Card)'}
              {workflowState.scenario === 'pre-reg-rental' && 'Pre-reg (Rental)'}
              {workflowState.scenario === 'same-day' && 'Same Day Registration'}
            </Tag>
          )}
        </Space>
      }
      open={visible}
      onCancel={onClose}
      width={800}
      footer={null}
      destroyOnHidden
    >
      {/* Card Reader Status */}
      <Card size="small" style={{ marginBottom: '16px' }}>
        <Row align="middle" justify="space-between">
          <Col>
            <Space>
              <UsbOutlined />
              <Badge 
                status={readerStatus.connected ? 'success' : 'error'} 
                text={readerStatus.connected ? 'Card Reader Connected' : 'Card Reader Disconnected'}
              />
              {workflowState.scannedCard && (
                <Tag color="green">
                  Last card: {workflowState.scannedCard.cardNumber}
                </Tag>
              )}
            </Space>
          </Col>
          <Col>
            {!readerStatus.connected && (
              <Button size="small" icon={<UsbOutlined />} onClick={handleConnectReader}>
                Connect
              </Button>
            )}
          </Col>
        </Row>
      </Card>

      {/* Rental Card Warnings */}
      {rentalCardWarnings.length > 0 && (
        <Alert
          type="warning"
          message="Rental Card Sync Required"
          description={
            <div>
              {rentalCardWarnings.map((warning, index) => (
                <div key={index}>{warning}</div>
              ))}
              <Button size="small" type="link" style={{ padding: 0 }}>
                Sync MeOS Rental Cards
              </Button>
            </div>
          }
          style={{ marginBottom: '16px' }}
          closable
          onClose={() => setRentalCardWarnings([])}
        />
      )}

      {/* Scenario Selection */}
      {workflowState.scenario === 'select' && (
        <Card title="Choose Scenario" style={{ marginBottom: '16px' }}>
          <Row gutter={[16, 16]}>
            <Col span={8}>
              <Button
                type="primary"
                size="large"
                icon={<UserOutlined />}
                onClick={() => setWorkflowState({ scenario: 'pre-reg-own' })}
                block
              >
                Pre-registered
                <br />
                <Text type="secondary" style={{ fontSize: '12px' }}>Own Card</Text>
              </Button>
            </Col>
            <Col span={8}>
              <Button
                type="primary"
                size="large"
                icon={<IdcardOutlined />}
                onClick={() => setWorkflowState({ scenario: 'pre-reg-rental' })}
                block
              >
                Pre-registered
                <br />
                <Text type="secondary" style={{ fontSize: '12px' }}>Rental Card</Text>
              </Button>
            </Col>
            <Col span={8}>
              <Button
                type="primary"
                size="large"
                icon={<PlusOutlined />}
                onClick={() => setWorkflowState({ scenario: 'same-day' })}
                block
              >
                Same Day
                <br />
                <Text type="secondary" style={{ fontSize: '12px' }}>Registration</Text>
              </Button>
            </Col>
          </Row>
        </Card>
      )}

      {/* Entry Search (for pre-registered scenarios) */}
      {(workflowState.scenario === 'pre-reg-own' || workflowState.scenario === 'pre-reg-rental') && !workflowState.selectedEntry && (
        <Card title="Find Pre-registered Entry" style={{ marginBottom: '16px' }}>
          <Search
            placeholder="Search by name, club, or card number"
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            style={{ marginBottom: '12px' }}
          />
          {searchResults.length > 0 && (
            <List
              size="small"
              dataSource={searchResults}
              renderItem={(entry) => (
                <List.Item
                  actions={[
                    <Button
                      key="select"
                      type="primary"
                      size="small"
                      onClick={() => handleSelectEntry(entry)}
                    >
                      Select
                    </Button>
                  ]}
                >
                  <List.Item.Meta
                    title={`${entry.name.first} ${entry.name.last}`}
                    description={
                      <Space>
                        <Text>{entry.club}</Text>
                        <Text>•</Text>
                        <Text>{entry.className}</Text>
                        {entry.cardNumber !== '0' && (
                          <>
                            <Text>•</Text>
                            <Tag>Card {entry.cardNumber}</Tag>
                          </>
                        )}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </Card>
      )}

      {/* Entry Form */}
      {workflowState.scenario !== 'select' && (workflowState.selectedEntry || workflowState.scenario === 'same-day') && (
        <Card title="Participant Details">
          <Form form={form} layout="vertical">
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  label="First Name"
                  name="firstName"
                  rules={[{ required: true, message: 'Required' }]}
                >
                  <Input />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label="Last Name"
                  name="lastName"
                  rules={[{ required: true, message: 'Required' }]}
                >
                  <Input />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  label="Club"
                  name="club"
                  rules={[{ required: true, message: 'Required' }]}
                >
                  <Input />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item
                  label="Birth Year"
                  name="birthYear"
                >
                  <Input />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item
                  label="Sex"
                  name="sex"
                >
                  <Select>
                    <Option value="M">M</Option>
                    <Option value="F">F</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item
                  label="Class"
                  name="classId"
                  rules={[{ required: true, message: 'Required' }]}
                >
                  <Select>
                    {classes.map(cls => (
                      <Option key={cls.id} value={cls.id}>
                        {cls.name} (${cls.fee})
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  label="Card Number"
                  name="cardNumber"
                  rules={[{ required: true, message: 'Required' }]}
                >
                  <Input 
                    addonAfter={
                      <Tooltip title="Scan card to auto-fill">
                        <IdcardOutlined />
                      </Tooltip>
                    }
                  />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="Phone" name="phone">
                  <Input />
                </Form.Item>
              </Col>
            </Row>
          </Form>

          <Divider />

          <Row justify="space-between">
            <Col>
              <Button onClick={() => setWorkflowState({ scenario: 'select' })}>
                ← Back to Scenarios
              </Button>
            </Col>
            <Col>
              <Space>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                  type="primary"
                  icon={<LoginOutlined />}
                  loading={processing}
                  onClick={handleCheckIn}
                >
                  Check In
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>
      )}
    </Modal>
  );
};

export default EventDayCheckIn;