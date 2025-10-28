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
  Checkbox,
  List
} from 'antd';
import {
  UserAddOutlined,
  IdcardOutlined,
  CheckCircleOutlined,
  SearchOutlined,
  UserOutlined,
  PlusOutlined
} from '@ant-design/icons';
import { sqliteRunnerDB, type RunnerRecord } from '../services/sqliteRunnerDatabaseService';
import { localEntryService, type LocalEntry, type ClassRegistration } from '../services/localEntryService';
import { meosClassService } from '../services/meosClassService';
import { meosApi } from '../services/meosApi';
import { sportIdentService, type SICardReadEvent } from '../services/sportIdentService';

const { Title, Text } = Typography;
const { Option } = Select;
const { Search } = Input;

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
  isHiredCard?: boolean;
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
  const [foundRunner, setFoundRunner] = useState<RunnerRecord | null>(null);
  const [classes, setClasses] = useState<Array<{ id: string; name: string; fee: number }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [readerStatus, setReaderStatus] = useState(sportIdentService.getStatus());
  const [lastCard, setLastCard] = useState<string | null>(null);
  const [firstNameOptions, setFirstNameOptions] = useState<{ value: string; runner: RunnerRecord }[]>([]);
  const [lastNameOptions, setLastNameOptions] = useState<{ value: string; runner: RunnerRecord }[]>([]);
  const [cardNumberOptions, setCardNumberOptions] = useState<{ value: string; runner: RunnerRecord }[]>([]);
  const [existingEntry, setExistingEntry] = useState<LocalEntry | null>(null);
  const [isAdditionalClass, setIsAdditionalClass] = useState(false);
  const [showExistingSearch, setShowExistingSearch] = useState(false);
  const [existingSearchResults, setExistingSearchResults] = useState<LocalEntry[]>([]);
  const [additionalNewClasses, setAdditionalNewClasses] = useState<string[]>([]); // For new entries with multiple classes
  const [showAddNewClass, setShowAddNewClass] = useState(false);

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

  const searchRunnerByCard = async () => {
    if (!cardNumber) return;

    setLoading(true);
    try {
      await sqliteRunnerDB.initialize();
      const allRunners = sqliteRunnerDB.getAllRunners();
      const runner = allRunners.find(r => r.card_number?.toString() === cardNumber);
      
      if (runner) {
        setFoundRunner(runner);
        // Pre-populate form with found runner data
        form.setFieldsValue({
          firstName: runner.first_name,
          lastName: runner.last_name,
          club: runner.club,
          cardNumber: cardNumber,
          birthYear: runner.birth_year?.toString(),
          sex: runner.sex,
          phone: runner.phone,
          nationality: runner.nationality
        });
        message.success(`Found runner: ${runner.first_name} ${runner.last_name}`);
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
  const handleFirstNameSearch = async (searchText: string) => {
    if (searchText.length >= 2) {
      try {
        await sqliteRunnerDB.initialize();
        const runners = sqliteRunnerDB.searchRunners(searchText, 10);
        const options = runners.map(runner => ({
          value: runner.first_name,
          runner: runner
        }));
        setFirstNameOptions(options);
      } catch (error) {
        console.error('Search error:', error);
      }
    } else {
      setFirstNameOptions([]);
    }
  };

  const handleLastNameSearch = async (searchText: string) => {
    if (searchText.length >= 2) {
      try {
        await sqliteRunnerDB.initialize();
        const runners = sqliteRunnerDB.searchRunners(searchText, 10);
        const options = runners.map(runner => ({
          value: runner.last_name,
          runner: runner
        }));
        setLastNameOptions(options);
      } catch (error) {
        console.error('Search error:', error);
      }
    } else {
      setLastNameOptions([]);
    }
  };

  const handleCardNumberSearch = async (searchText: string) => {
    if (searchText.length >= 3) {
      try {
        await sqliteRunnerDB.initialize();
        const allRunners = sqliteRunnerDB.getAllRunners();
        const runner = allRunners.find(r => r.card_number?.toString().includes(searchText));
        if (runner) {
          setCardNumberOptions([{ value: runner.card_number?.toString() || searchText, runner: runner }]);
        } else {
          setCardNumberOptions([]);
        }
      } catch (error) {
        console.error('Search error:', error);
      }
    } else {
      setCardNumberOptions([]);
    }
  };

  const clearFoundRunner = () => {
    setFoundRunner(null);
  };

  const handleRunnerSelect = (runner: RunnerRecord) => {
    setFoundRunner(runner);
    
    // Check if this runner already has an entry
    const entries = localEntryService.getAllEntries();
    const existing = entries.find(e => 
      e.name.first.toLowerCase() === runner.first_name.toLowerCase() &&
      e.name.last.toLowerCase() === runner.last_name.toLowerCase() &&
      e.club.toLowerCase() === (runner.club || '').toLowerCase()
    );
    
    if (existing) {
      setExistingEntry(existing);
      const hasMultiple = localEntryService.hasMultipleClasses(existing);
      const allClasses = localEntryService.getEntryClasses(existing);
      const classNames = allClasses.map(c => c.className).join(', ');
      message.info(`Runner already registered for: ${classNames}. You can add them to another class.`);
    }
    
    // Auto-populate all form fields when a runner is selected
    // Use setTimeout to ensure the form field is cleared first before setting new value
    setTimeout(() => {
      form.setFieldsValue({
        firstName: runner.first_name,
        lastName: runner.last_name,
        club: runner.club,
        cardNumber: runner.card_number?.toString() || '',
        birthYear: runner.birth_year?.toString() || '',
        sex: runner.sex,
        phone: runner.phone || '',
        nationality: runner.nationality || ''
      });
    }, 0);
    message.success(`Selected runner: ${runner.first_name} ${runner.last_name}`);
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
      
      // Check if this is an additional class registration
      if (existingEntry && isAdditionalClass) {
        // Add to additional classes
        const selectedClass = classes.find(c => c.id === values.classId);
        if (!selectedClass) {
          message.error('Invalid class selection');
          setSubmitting(false);
          return;
        }
        
        const updatedEntry = localEntryService.addAdditionalClass(existingEntry.id, {
          classId: values.classId,
          className: selectedClass.name,
          fee: selectedClass.fee
        });
        
        if (updatedEntry) {
          // Check in for the new class
          const checkedIn = localEntryService.checkInEntryForClass(
            updatedEntry.id,
            values.classId,
            values.cardNumber
          );
          
          if (checkedIn) {
            message.success(`Added ${values.firstName} ${values.lastName} to ${selectedClass.name} and checked in!`);
            
            if (onRegistrationComplete) {
              onRegistrationComplete(checkedIn, values.cardNumber);
            }
            
            handleClose();
          } else {
            message.error('Failed to check in for new class');
          }
        } else {
          message.error('Failed to add additional class');
        }
        
        setSubmitting(false);
        return;
      }

      // Create a new local entry (pending -> checked-in)
      const natNum = parseInt(values.nationality || '0', 10);
      const normalizedSex = (!natNum || natNum <= 1) ? values.sex : undefined;
      let pendingEntry = localEntryService.addEntry({
        name: { 
          first: values.firstName ? values.firstName.trim() : '', 
          last: values.lastName.trim() 
        },
        club: values.club.trim(),
        className: values.className,
        classId: values.classId,
        cardNumber: values.cardNumber,
        birthYear: values.birthYear ?? '',
        sex: normalizedSex ?? '',
        phone: values.phone ?? '',
        nationality: values.nationality ?? '',
        isHiredCard: values.isHiredCard ?? false,
        fee: classes.find(c => c.id === values.classId)?.fee || 0,
        importedFrom: 'manual'
      });
      
      // Add additional classes if any
      for (const classId of additionalNewClasses) {
        const selectedClass = classes.find(c => c.id === classId);
        if (selectedClass && classId !== values.classId) {
          const updated = localEntryService.addAdditionalClass(pendingEntry.id, {
            classId: classId,
            className: selectedClass.name,
            fee: selectedClass.fee
          });
          if (updated) pendingEntry = updated;
        }
      }
      
      const addedEntry = localEntryService.checkInEntry(pendingEntry.id, values.cardNumber);

      if (addedEntry) {
        // Update runner database for future lookups (only individuals, never groups)
        const natNum = parseInt(values.nationality || '0', 10);
        const isGroup = natNum > 1;
        
        // Runner database is automatically updated through localEntryService.addEntry/updateEntry
        // which calls sqliteRunnerDB.updateRunnerFromEntry

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
        birthYear: allValues.birthYear ?? '',
        sex: normalizedSex ?? '',
        phone: allValues.phone ?? '',
        nationality: allValues.nationality ?? '',
        isHiredCard: allValues.isHiredCard ?? false,
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
    setExistingEntry(null);
    setIsAdditionalClass(false);
    setShowExistingSearch(false);
    setExistingSearchResults([]);
    setAdditionalNewClasses([]);
    setShowAddNewClass(false);
    onClose();
  };
  
  const handleSearchExisting = (searchText: string) => {
    if (searchText.length >= 2) {
      const entries = localEntryService.getAllEntries();
      const results = entries.filter(entry =>
        `${entry.name.first} ${entry.name.last}`.toLowerCase().includes(searchText.toLowerCase()) ||
        entry.club.toLowerCase().includes(searchText.toLowerCase())
      ).slice(0, 10);
      setExistingSearchResults(results);
    } else {
      setExistingSearchResults([]);
    }
  };
  
  const handleSelectExisting = (entry: LocalEntry) => {
    setExistingEntry(entry);
    setIsAdditionalClass(true);
    setShowExistingSearch(false);
    setExistingSearchResults([]);
    
    // Pre-populate form
    form.setFieldsValue({
      firstName: entry.name.first,
      lastName: entry.name.last,
      club: entry.club,
      cardNumber: entry.cardNumber,
      birthYear: entry.birthYear,
      sex: entry.sex as 'M' | 'F' | undefined,
      phone: entry.phone,
      nationality: entry.nationality
    });
    
    const allClasses = localEntryService.getEntryClasses(entry);
    const classNames = allClasses.map(c => c.className).join(', ');
    message.info(`Runner already registered for: ${classNames}. Select a new class to add.`);
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
          <UserAddOutlined style={{ fontSize: '20px' }} />
          <Text strong style={{ fontSize: '18px', color: '#000' }}>Same Day Registration</Text>
          {cardNumber && <Tag color="blue" style={{ fontSize: '14px', fontWeight: 600 }}>Card {cardNumber}</Tag>}
        </Space>
      }
      open={visible}
      onCancel={handleClose}
      width={700}
      styles={{ body: { fontSize: '15px' } }}
      footer={[
        <Button 
          key="cancel" 
          onClick={handleClose}
          size="large"
          style={{ fontWeight: 600 }}
        >
          Cancel
        </Button>,
        !isAdditionalClass && (
          <Button 
            key="save" 
            onClick={handleSaveOnly} 
            icon={<UserAddOutlined />}
            size="large"
            style={{ fontWeight: 600 }}
          >
            Save (No Check-In)
          </Button>
        ),
        <Button 
          key="submit" 
          type="primary" 
          onClick={handleSubmit} 
          loading={submitting}
          icon={<CheckCircleOutlined />}
          size="large"
          style={{ fontWeight: 600, minWidth: 180 }}
        >
          {isAdditionalClass ? 'Add to Class & Check In' : 'Register & Check In'}
        </Button>
      ]}
    >
      {/* Button to search for existing runners */}
      {!existingEntry && !showExistingSearch && (
        <Card size="small" style={{ marginBottom: '16px', background: '#f0f5ff' }}>
          <Space>
            <SearchOutlined />
            <Text>Need to add a runner to a second class?</Text>
            <Button 
              type="link" 
              size="small"
              onClick={() => setShowExistingSearch(true)}
            >
              Search for existing runner
            </Button>
          </Space>
        </Card>
      )}
      
      {/* Search for existing runners */}
      {showExistingSearch && (
        <Card 
          title="Find Existing Runner" 
          size="small" 
          style={{ marginBottom: '16px' }}
          extra={
            <Button size="small" onClick={() => {
              setShowExistingSearch(false);
              setExistingSearchResults([]);
            }}>
              Cancel
            </Button>
          }
        >
          <Search
            placeholder="Search by name or club"
            onChange={(e) => handleSearchExisting(e.target.value)}
            style={{ marginBottom: existingSearchResults.length > 0 ? '12px' : '0' }}
          />
          {existingSearchResults.length > 0 && (
            <List
              size="small"
              dataSource={existingSearchResults}
              renderItem={(entry) => (
                <List.Item
                  actions={[
                    <Button
                      key="select"
                      type="primary"
                      size="small"
                      onClick={() => handleSelectExisting(entry)}
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
                        {localEntryService.getEntryClasses(entry).map((c, idx) => (
                          <Tag key={idx} color={c.status === 'checked-in' ? 'green' : 'blue'}>
                            {c.className}
                          </Tag>
                        ))}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </Card>
      )}
      
      {/* Runner Found Alert */}
      {foundRunner && (
        <Alert
          message="Runner Found in Database"
          description={
            <Space>
              <UserOutlined />
              <Text>
                Found <Text strong>{foundRunner.first_name} {foundRunner.last_name}</Text> from <Text strong>{foundRunner.club}</Text>.
                Details have been pre-filled below.
              </Text>
            </Space>
          }
          type="success"
          showIcon
          style={{ marginBottom: '16px' }}
        />
      )}
      
      {/* Existing Entry with Class Info */}
      {existingEntry && (
        <Alert
          message={
            <Space>
              <Text strong>Adding to Additional Class</Text>
              <Tag color="orange">Multi-Class Runner</Tag>
            </Space>
          }
          description={
            <div>
              <Text>
                <Text strong>{existingEntry.name.first} {existingEntry.name.last}</Text> is currently registered for:
              </Text>
              <div style={{ marginTop: '8px', marginBottom: '8px' }}>
                {localEntryService.getEntryClasses(existingEntry).map((classReg) => (
                  <Tag key={classReg.classId} color={classReg.status === 'checked-in' ? 'green' : 'blue'}>
                    {classReg.className} ({classReg.status})
                  </Tag>
                ))}
              </div>
              <Text type="secondary">Select a new class below to add them to an additional class.</Text>
            </div>
          }
          type="info"
          showIcon
          style={{ marginBottom: '16px' }}
          closable
          onClose={() => {
            setExistingEntry(null);
            setIsAdditionalClass(false);
          }}
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
        size="large"
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
                  value: `${option.runner.first_name} ${option.runner.last_name} (${option.runner.club})`,
                  key: option.runner.id,
                  runnerIndex: index
                }))}
                onSearch={handleFirstNameSearch}
                onSelect={(value) => {
                  // Find the runner based on the selected display value
                  const selectedOption = firstNameOptions.find(opt => 
                    `${opt.runner.first_name} ${opt.runner.last_name} (${opt.runner.club})` === value
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
                  value: `${option.runner.first_name} ${option.runner.last_name} (${option.runner.club})`,
                  key: option.runner.id,
                  runnerIndex: index
                }))}
                onSearch={handleLastNameSearch}
                onSelect={(value) => {
                  // Find the runner based on the selected display value
                  const selectedOption = lastNameOptions.find(opt => 
                    `${opt.runner.first_name} ${opt.runner.last_name} (${opt.runner.club})` === value
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
                  value: `${option.value} - ${option.runner.first_name} ${option.runner.last_name} (${option.runner.club})`,
                  key: option.runner.id,
                  runnerIndex: index
                }))}
                onSearch={handleCardNumberSearch}
                onSelect={(value) => {
                  // Find the runner based on the selected display value
                  const selectedOption = cardNumberOptions.find(opt => 
                    `${opt.value} - ${opt.runner.first_name} ${opt.runner.last_name} (${opt.runner.club})` === value
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
              label="Primary Class"
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
            
            {/* Additional Classes for new entries (not for additional class mode) */}
            {!isAdditionalClass && (
              <div style={{ marginTop: 8 }}>
                {additionalNewClasses.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: '12px' }}>Also registering for:</Text>
                    <div style={{ marginTop: 4 }}>
                      {additionalNewClasses.map((classId, idx) => {
                        const className = classes.find(c => c.id === classId)?.name || classId;
                        return (
                          <Tag 
                            key={idx} 
                            color="blue"
                            closable
                            onClose={() => {
                              setAdditionalNewClasses(prev => prev.filter((_, i) => i !== idx));
                            }}
                            style={{ marginBottom: 4 }}
                          >
                            {className}
                          </Tag>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                {!showAddNewClass && (
                  <Button 
                    type="link" 
                    icon={<PlusOutlined />} 
                    onClick={() => setShowAddNewClass(true)}
                    size="small"
                    style={{ paddingLeft: 0 }}
                  >
                    Add another class
                  </Button>
                )}
                
                {showAddNewClass && (
                  <Space.Compact style={{ width: '100%', marginTop: 4 }}>
                    <Select 
                      placeholder="Select additional class"
                      style={{ flex: 1 }}
                      showSearch
                      optionFilterProp="children"
                      size="small"
                      onChange={(value) => {
                        const primaryClassId = form.getFieldValue('classId');
                        
                        if (value === primaryClassId) {
                          message.warning('This is already the primary class');
                          return;
                        }
                        if (additionalNewClasses.includes(value)) {
                          message.warning('This class is already added');
                          return;
                        }
                        
                        setAdditionalNewClasses(prev => [...prev, value]);
                        setShowAddNewClass(false);
                      }}
                    >
                      {classes.map(cls => (
                        <Option key={cls.id} value={cls.id}>
                          {cls.name} (${cls.fee})
                        </Option>
                      ))}
                    </Select>
                    <Button size="small" onClick={() => setShowAddNewClass(false)}>Cancel</Button>
                  </Space.Compact>
                )}
              </div>
            )}
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