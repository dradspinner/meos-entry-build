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
  message,
  Divider,
  Tag
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
  const [form] = Form.useForm<RegistrationFormData>();
  const [loading, setLoading] = useState(false);
  const [foundRunner, setFoundRunner] = useState<LocalRunner | null>(null);
  const [classes, setClasses] = useState<Array<{ id: string; name: string; fee: number }>>([]);
  const [submitting, setSubmitting] = useState(false);

  // Load available classes
  useEffect(() => {
    if (visible) {
      loadClasses();
      if (cardNumber) {
        searchRunnerByCard();
      }
    }
  }, [visible, cardNumber]);

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

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      // Create a new local entry
      const newEntry = {
        id: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: {
          first: values.firstName.trim(),
          last: values.lastName.trim()
        },
        club: values.club.trim(),
        className: values.className,
        classId: values.classId,
        cardNumber: values.cardNumber,
        birthYear: values.birthYear,
        sex: values.sex,
        phone: values.phone,
        nationality: values.nationality,
        status: 'checked-in' as const,
        checkedInAt: new Date(),
        submittedToMeos: false,
        isHiredCard: false,
        rented: false,
        issues: {
          needsRentalCard: false,
          needsCardButNoRental: false,
          duplicateCard: false,
          missingInfo: false
        }
      };

      // Add the entry to local storage
      const addedEntry = localEntryService.addOrUpdateEntry(newEntry);

      if (addedEntry) {
        // Update runner database for future lookups
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

  const handleClose = () => {
    form.resetFields();
    setFoundRunner(null);
    onClose();
  };

  const handleClassChange = (value: string, option: any) => {
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
      {cardNumber && !foundRunner && !loading && (
        <Alert
          message="New Runner Registration"
          description={
            <Space>
              <IdcardOutlined />
              <Text>
                Card <Text strong>{cardNumber}</Text> not found in database. 
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
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label="First Name"
              name="firstName"
              rules={[{ required: true, message: 'Please enter first name' }]}
            >
              <Input placeholder="Enter first name" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="Last Name"
              name="lastName"
              rules={[{ required: true, message: 'Please enter last name' }]}
            >
              <Input placeholder="Enter last name" />
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
              rules={[{ required: true, message: 'Please enter card number' }]}
            >
              <Input placeholder="Card number" disabled={!!cardNumber} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label="Class"
              name="classId"
              rules={[{ required: true, message: 'Please select a class' }]}
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
            <Form.Item label="Birth Year" name="birthYear">
              <Input placeholder="Birth year (optional)" type="number" />
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