import React, { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  Button,
  Space,
  Typography,
  Card,
  Row,
  Col,
  Alert,
  App,
  Divider,
  Tag,
  AutoComplete,
  Checkbox
} from 'antd';
import {
  UserAddOutlined,
  IdcardOutlined,
  CheckCircleOutlined,
  SearchOutlined,
  UserOutlined
} from '@ant-design/icons';
import { localRunnerService, type LocalRunner } from '../services/localRunnerService';
import { localEntryService, type LocalEntry } from '../services/localEntryService';
import { meosClassService } from '../services/meosClassService';
import { meosApi } from '../services/meosApi';
import { sportIdentService, type SICardReadEvent } from '../services/sportIdentService';

const { Title, Text } = Typography;
const { Option } = Select;

interface SameDayRegistrationProps {
  visible: boolean;
  onClose: () => void;
  cardNumber?: string;
  onRegistrationComplete?: (entry: LocalEntry, cardNumber: string) => void;
}

interface RegistrationFormData {
  firstName: string;
  lastName: string;
  club: string;
  className: string;
  classId: string;
  cardNumber: string;
  birthYear?: string;
  sex?: 'M' | 'F';
  phone?: string;
  nationality?: string;
}

const SameDayRegistration: React.FC<SameDayRegistrationProps> = ({
  visible,
  onClose,
  cardNumber,
  onRegistrationComplete
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<RegistrationFormData>();
  const [loading, setLoading] = useState(false);
  const [foundRunner, setFoundRunner] = useState<LocalRunner | null>(null);
  const [classes, setClasses] = useState<Array<{ id: string; name: string; fee: number }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [readerStatus, setReaderStatus] = useState(sportIdentService.getStatus());
  const [lastCard, setLastCard] = useState<string | null>(null);
  const [firstNameOptions, setFirstNameOptions] = useState<{ value: string; runner: LocalRunner }[]>([]);
  const [lastNameOptions, setLastNameOptions] = useState<{ value: string; runner: LocalRunner }[]>([]);
  const [cardNumberOptions, setCardNumberOptions] = useState<{ value: string; runner: LocalRunner }[]>([]);

  // Load available classes
  useEffect(() => {
    if (visible) {
      loadClasses();
      if (cardNumber) {
        searchRunnerByCard();
      }
    }
  }, [visible, cardNumber]);

  // Listen to SI card reader when modal is open
  useEffect(() => {
    if (!visible) return;
    const cb = (ev: SICardReadEvent) => {
      setReaderStatus(sportIdentService.getStatus());
      if (ev.type === 'card_read' && ev.card) {
        const c = ev.card.cardNumber.toString();
        setLastCard(c);
        form.setFieldsValue({ cardNumber: c });
        message.success(`Card ${c} read`);
      }
    };
    sportIdentService.addCallback(cb);
    const interval = setInterval(() => setReaderStatus(sportIdentService.getStatus()), 2000);
    return () => { sportIdentService.removeCallback(cb); clearInterval(interval); };
  }, [visible]);

  const loadClasses = async () => {
    try {
      // This would typically load from MeOS API or local cache
      // For now, using some common classes
      const mockClasses = [
        { id: '1', name: 'White', fee: 15 },
        { id: '2', name: 'Yellow', fee: 15 },
        { id: '3', name: 'Orange', fee: 20 },
        { id: '4', name: 'Light Green', fee: 20 },
        { id: '5', name: 'Green', fee: 25 },
        { id: '6', name: 'Blue', fee: 25 },
        { id: '7', name: 'Brown', fee: 30 },
        { id: '8', name: 'Red', fee: 30 }
      ];
      setClasses(mockClasses);
    } catch (error) {
      console.error('Failed to load classes:', error);
    }
  };

  const searchRunnerByCard = () => {
    if (!cardNumber) return;

    setLoading(true);
    try {
      const runner = localRunnerService.searchByCardNumber(cardNumber);
      if (runner) {
        setFoundRunner(runner);
        // Pre-populate form with found runner data
        form.setFieldsValue({
          firstName: runner.name.first,
          lastName: runner.name.last,
          club: runner.club,
          cardNumber: cardNumber,
          birthYear: runner.birthYear?.toString(),
          sex: runner.sex,
          phone: runner.phone,
          nationality: runner.nationality
        });
        message.success(`Found runner: ${runner.name.first} ${runner.name.last}`);
      } else {
        setFoundRunner(null);
        // Still pre-populate the card number
        form.setFieldsValue({
          cardNumber: cardNumber
        });
        message.info(`Card ${cardNumber} not found in database. Please enter runner details.`);
      }
    } catch (error) {
      console.error('Error searching for runner:', error);
      message.error('Failed to search runner database');
    } finally {
      setLoading(false);
    }
  };

  // Auto-complete handlers
  const handleFirstNameSearch = (searchText: string) => {
    if (searchText.length >= 2) {
      const runners = localRunnerService.searchRunners(searchText);
      const options = runners.map(runner => ({
        value: runner.name.first,
        runner: runner
      }));
      setFirstNameOptions(options);
    } else {
      setFirstNameOptions([]);
    }
  };

  const handleLastNameSearch = (searchText: string) => {
    if (searchText.length >= 2) {
      const runners = localRunnerService.searchRunners(searchText);
      const options = runners.map(runner => ({
        value: runner.name.last,
        runner: runner
      }));
      setLastNameOptions(options);
    } else {
      setLastNameOptions([]);
    }
  };

  const handleCardNumberSearch = (searchText: string) => {
    if (searchText.length >= 3) {
      const runner = localRunnerService.searchByCardNumber(searchText);
      if (runner) {
        setCardNumberOptions([{ value: searchText, runner: runner }]);
      } else {
        setCardNumberOptions([]);
      }
    } else {
      setCardNumberOptions([]);
    }
  };

  const clearFoundRunner = () => {
    setFoundRunner(null);
  };

  const handleRunnerSelect = (runner: LocalRunner) => {
    setFoundRunner(runner);
    // Auto-populate all form fields when a runner is selected
    // Use setTimeout to ensure the form field is cleared first before setting new value
    setTimeout(() => {
      form.setFieldsValue({
        firstName: runner.name.first,
        lastName: runner.name.last,
        club: runner.club,
        cardNumber: runner.cardNumber?.toString() || '',
        birthYear: runner.birthYear?.toString() || '',
        sex: runner.sex,
        phone: runner.phone || '',
        nationality: runner.nationality || ''
      });
    }, 0);
    message.success(`Selected runner: ${runner.name.first} ${runner.name.last}`);
    // Record usage for priority in future searches
    localRunnerService.recordUsage(runner.id);
  };


  const handleSubmit = async () => {
    try {
      // First validate all fields except class
      const values = await form.validateFields();
      
      // Then specifically check for class since it's required for check-in
      if (!values.classId) {
        message.error('Please select a class before registering and checking in');
        return;
      }
      setSubmitting(true);

      // Require card number to check in now
      if (!values.cardNumber || values.cardNumber.trim() === '') {
        message.error('Card number required to check in now. Use Save to add without checking in.');
        setSubmitting(false);
        return;
      }

      // Create a new local entry (pending -> checked-in)
      const natNum = parseInt(values.nationality || '0', 10);
      const normalizedSex = (!natNum || natNum <= 1) ? values.sex : undefined;
      const pendingEntry = localEntryService.addEntry({
        name: { 
          first: values.firstName ? values.firstName.trim() : '', 
          last: values.lastName.trim() 
        },
        club: values.club.trim(),
        className: values.className,
        classId: values.classId,
        cardNumber: values.cardNumber,
        birthYear: values.birthYear,
        sex: normalizedSex,
        phone: values.phone,
        nationality: values.nationality,
        isHiredCard: values.isHiredCard || false,
        fee: classes.find(c => c.id === values.classId)?.fee || 0,
        importedFrom: 'manual'
      });
      const addedEntry = localEntryService.checkInEntry(pendingEntry.id, values.cardNumber);

      if (addedEntry) {
        // Update runner database for future lookups (only individuals, never groups)
        const natNum = parseInt(values.nationality || '0', 10);
        const isGroup = natNum > 1;
        
        if (!isGroup && values.firstName) {
          const runnerData = {
            name: {
              first: values.firstName.trim(),
              last: values.lastName.trim()
            },
            club: values.club.trim(),
            cardNumber: parseInt(values.cardNumber),
            birthYear: values.birthYear ? parseInt(values.birthYear) : undefined,
            sex: values.sex,
            phone: values.phone,
            nationality: values.nationality
          };
          localRunnerService.addRunner(runnerData);
        }

        // Try to submit to MeOS immediately
        try {
          message.loading(`Submitting ${values.firstName} ${values.lastName} to MeOS...`, 0);
          await submitToMeOS(addedEntry);
          message.destroy();
          message.success(`✅ ${values.firstName} ${values.lastName} registered and submitted to MeOS!`);
        } catch (meosError) {
          message.destroy();
          console.warn('MeOS submission failed:', meosError);
          message.warning(`⚠️ ${values.firstName} ${values.lastName} registered locally, but MeOS submission failed. Will retry later.`);
        }

        // Notify parent component
        if (onRegistrationComplete) {
          onRegistrationComplete(addedEntry, values.cardNumber);
        }

        // Close modal and reset form
        handleClose();
      } else {
        message.error('Failed to register runner');
      }
    } catch (error) {
      console.error('Registration error:', error);
      message.error('Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  const submitToMeOS = async (entry: LocalEntry): Promise<void> => {
    console.log(`[SameDayRegistration] Submitting ${entry.name.first} ${entry.name.last} to MeOS...`);
    
    // Convert class name to MeOS class ID
    const classId = await getMeosClassId(entry.className, entry.classId);
    
    const meosEntryParams = {
      name: `${entry.name.first} ${entry.name.last}`,
      club: entry.club,
      classId: classId,
      cardNumber: parseInt(entry.cardNumber) || 0,
      phone: entry.phone,
      birthYear: entry.birthYear ? parseInt(entry.birthYear) : undefined,
      sex: entry.sex as 'M' | 'F' | undefined,
      nationality: entry.nationality,
    };
    
    console.log(`[SameDayRegistration] MeOS entry params:`, meosEntryParams);

    // Submit to MeOS
    const meosResult = await meosApi.createEntry(meosEntryParams);
    
    if (meosResult.success) {
      // Mark as submitted to MeOS
      localEntryService.markSubmittedToMeos(entry.id);
      console.log(`[SameDayRegistration] Successfully submitted ${entry.name.first} ${entry.name.last} to MeOS`);
    } else {
      throw new Error(meosResult.error || 'Unknown MeOS error');
    }
  };

  const getMeosClassId = async (className: string, classId: string): Promise<number> => {
    const result = await meosClassService.getClassId(className, classId);
    console.log(`[SameDayRegistration] ClassMapping: className="${className}", classId="${classId}" -> MeOS class ${result.id} (${result.method})`);
    return result.id;
  };

  const handleSaveOnly = async () => {
    try {
      console.log('[SameDayRegistration] Save button clicked - starting validation...');
      
      // For save-only, validate only required fields (name, lastName, club)
      const values = await form.validateFields(['firstName', 'lastName', 'club']);
      console.log('[SameDayRegistration] Validation passed:', values);
      
      // Get all form values (including optional ones)
      const allValues = form.getFieldsValue();
      console.log('[SameDayRegistration] All form values:', allValues);
      
      // Allow empty card number and class for save-only
      const natNum = parseInt(allValues.nationality || '0', 10);
      const normalizedSex = (!natNum || natNum <= 1) ? allValues.sex : undefined;
      
      const saved = localEntryService.addEntry({
        name: { 
          first: allValues.firstName ? allValues.firstName.trim() : '', 
          last: allValues.lastName.trim() 
        },
        club: allValues.club.trim(),
        className: allValues.classId ? (classes.find(c => c.id === allValues.classId)?.name || allValues.className) : 'TBD',
        classId: allValues.classId || 'TBD',
        cardNumber: allValues.cardNumber || '0',
        birthYear: allValues.birthYear,
        sex: normalizedSex,
        phone: allValues.phone,
        nationality: allValues.nationality,
        isHiredCard: allValues.isHiredCard || false,
        fee: allValues.classId ? (classes.find(c => c.id === allValues.classId)?.fee || 0) : 0,
        importedFrom: 'manual'
      });
      
      console.log('[SameDayRegistration] Entry saved:', saved);
      
      const classText = allValues.classId ? ` in class ${classes.find(c => c.id === allValues.classId)?.name}` : ' (class to be determined)';
      message.success(`Saved ${allValues.firstName} ${allValues.lastName}${classText} (not checked-in)`);
      
      console.log('[SameDayRegistration] Calling onRegistrationComplete...');
      if (onRegistrationComplete) {
        onRegistrationComplete(saved as any, allValues.cardNumber || '0');
      }
      
      console.log('[SameDayRegistration] Closing modal...');
      handleClose();
    } catch (e) {
      console.error('[SameDayRegistration] Save failed:', e);
      // If validation errors, they're shown in form UI by antd
      // But log other errors
      if (e && typeof e === 'object' && 'errorFields' in e) {
        console.log('[SameDayRegistration] Validation errors:', (e as any).errorFields);
      } else {
        message.error('Failed to save entry. Please check the form and try again.');
      }
    }
  };

  const handleClose = () => {
    form.resetFields();
    setFoundRunner(null);
    onClose();
  };

  const handleClassChange = (value: string) => {
    const selectedClass = classes.find(c => c.id === value);
    if (selectedClass) {
      form.setFieldValue('className', selectedClass.name);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <UserAddOutlined />
          Same Day Registration
          {cardNumber && <Tag color="blue">Card {cardNumber}</Tag>}
        </Space>
      }
      open={visible}
      onCancel={handleClose}
      width={600}
      footer={[
        <Button key="cancel" onClick={handleClose}>
          Cancel
        </Button>,
        <Button key="save" onClick={handleSaveOnly} icon={<UserAddOutlined />}>Save (No Check-In)</Button>,
        <Button 
          key="submit" 
          type="primary" 
          onClick={handleSubmit} 
          loading={submitting}
          icon={<CheckCircleOutlined />}
        >
          Register & Check In
        </Button>
      ]}
    >
      {/* Runner Found Alert */}
      {foundRunner && (
        <Alert
          message="Runner Found in Database"
          description={
            <Space>
              <UserOutlined />
              <Text>
                Found <Text strong>{foundRunner.name.first} {foundRunner.name.last}</Text> from <Text strong>{foundRunner.club}</Text>.
                Details have been pre-filled below.
              </Text>
            </Space>
          }
          type="success"
          showIcon
          style={{ marginBottom: '16px' }}
        />
      )}

      {/* No Runner Found Alert */}
      {(cardNumber || lastCard) && !foundRunner && !loading && (
        <Alert
          message="New Runner Registration"
          description={
            <Space>
              <IdcardOutlined />
              <Text>
                Card <Text strong>{cardNumber || lastCard}</Text> not found in database. 
                Please enter the runner's details below for registration.
              </Text>
            </Space>
          }
          type="info"
          showIcon
          style={{ marginBottom: '16px' }}
        />
      )}

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          cardNumber: cardNumber || ''
        }}
      >
        {/* Reader status */}
        <Alert 
          type={readerStatus.connected ? 'success' : 'warning'} 
          showIcon 
          style={{ marginBottom: 12 }}
          message={readerStatus.connected ? 'Card Reader Connected' : 'Card Reader Disconnected'}
          action={!readerStatus.connected ? (<Button size="small" onClick={async ()=>{try{await sportIdentService.connect(); setReaderStatus(sportIdentService.getStatus());}catch{}}}>Connect</Button>) : undefined}
        />

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label="First Name"
              name="firstName"
              rules={[{
                validator: async (_, value) => {
                  const nat = parseInt(form.getFieldValue('nationality') || '0', 10);
                  if (!nat || nat <= 1) {
                    if (!value || `${value}`.trim() === '') {
                      return Promise.reject(new Error('First Name is required unless Nationality > 1'));
                    }
                  }
                  return Promise.resolve();
                }
              }]}
            >
              <AutoComplete
                options={firstNameOptions.map((option, index) => ({
                  value: `${option.runner.name.first} ${option.runner.name.last} (${option.runner.club})`,
                  key: option.runner.id,
                  runnerIndex: index
                }))}
                onSearch={handleFirstNameSearch}
                onSelect={(value) => {
                  // Find the runner based on the selected display value
                  const selectedOption = firstNameOptions.find(opt => 
                    `${opt.runner.name.first} ${opt.runner.name.last} (${opt.runner.club})` === value
                  );
                  if (selectedOption) {
                    handleRunnerSelect(selectedOption.runner);
                  }
                }}
                onChange={(value) => {
                  // If value doesn't contain parentheses (club), user is typing manually
                  if (typeof value === 'string' && !value.includes('(')) {
                    clearFoundRunner();
                  }
                }}
                placeholder="Enter first name (auto-complete from database)"
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="Last Name / Group"
              name="lastName"
              rules={[{ required: true, message: 'Please enter last name or group name' }]}
            >
              <AutoComplete
                options={lastNameOptions.map((option, index) => ({
                  value: `${option.runner.name.first} ${option.runner.name.last} (${option.runner.club})`,
                  key: option.runner.id,
                  runnerIndex: index
                }))}
                onSearch={handleLastNameSearch}
                onSelect={(value) => {
                  // Find the runner based on the selected display value
                  const selectedOption = lastNameOptions.find(opt => 
                    `${opt.runner.name.first} ${opt.runner.name.last} (${opt.runner.club})` === value
                  );
                  if (selectedOption) {
                    handleRunnerSelect(selectedOption.runner);
                  }
                }}
                onChange={(value) => {
                  // If value doesn't contain parentheses (club), user is typing manually
                  if (typeof value === 'string' && !value.includes('(')) {
                    clearFoundRunner();
                  }
                }}
                placeholder="Enter last name (auto-complete from database)"
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label="Club"
              name="club"
              rules={[{ required: true, message: 'Please enter club name' }]}
            >
              <Input placeholder="Enter club name" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="Card Number"
              name="cardNumber"
              rules={[]}
            >
              <AutoComplete
                options={cardNumberOptions.map((option, index) => ({
                  value: `${option.value} - ${option.runner.name.first} ${option.runner.name.last} (${option.runner.club})`,
                  key: option.runner.id,
                  runnerIndex: index
                }))}
                onSearch={handleCardNumberSearch}
                onSelect={(value) => {
                  // Find the runner based on the selected display value
                  const selectedOption = cardNumberOptions.find(opt => 
                    `${opt.value} - ${opt.runner.name.first} ${opt.runner.name.last} (${opt.runner.club})` === value
                  );
                  if (selectedOption) {
                    handleRunnerSelect(selectedOption.runner);
                  }
                }}
                onChange={(value) => {
                  // If value doesn't contain dash and parentheses, user is typing manually
                  if (typeof value === 'string' && !value.includes(' - ') && !value.includes('(')) {
                    clearFoundRunner();
                  }
                }}
                placeholder="Scan card or enter number (auto-complete from database)"
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={24}>
            <Form.Item
              name="isHiredCard"
              valuePropName="checked"
            >
              <Checkbox style={{ color: '#ff4d4f', fontWeight: 500 }}>
                🎫 This is a RENTAL card (must be collected)
              </Checkbox>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label="Class"
              name="classId"
              rules={[
                {
                  validator: async (_, value) => {
                    // Class is only required for "Register & Check In", not for "Save (No Check-In)"
                    // This validation will be handled differently for each button
                    return Promise.resolve();
                  }
                }
              ]}
            >
              <Select 
                placeholder="Select class"
                onChange={handleClassChange}
                showSearch
                optionFilterProp="children"
              >
                {classes.map(cls => (
                  <Option key={cls.id} value={cls.id}>
                    {cls.name} (${cls.fee})
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item 
              label="Birth Year" 
              name="birthYear"
              rules={[
                {
                  validator: async (_, value) => {
                    const natRaw = form.getFieldValue('nationality');
                    const natNum = parseInt(natRaw || '0', 10);
                    if (!natNum || natNum <= 1) {
                      if (!value || `${value}`.trim() === '') {
                        return Promise.reject(new Error('Birth Year is required unless Nationality > 1'));
                      }
                    }
                    return Promise.resolve();
                  }
                }
              ]}
            >
              <Input placeholder="Birth year" type="number" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label="Sex" name="sex">
              <Select placeholder="Select sex">
                <Option value="M">Male</Option>
                <Option value="F">Female</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={16}>
            <Form.Item label="Phone" name="phone">
              <Input placeholder="Phone number (optional)" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item label="Nationality" name="nationality">
          <Input placeholder="Nationality (optional)" />
        </Form.Item>

        {/* Hidden field for class name */}
        <Form.Item name="className" hidden>
          <Input />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default SameDayRegistration;