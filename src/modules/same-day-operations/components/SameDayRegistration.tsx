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
// Import from shared services - these will be created or imported from the correct location
// For now, we'll use placeholder types and mock functionality

type LocalRunner = {
  name: { first: string; last: string };
  club: string;
  cardNumber?: number;
  birthYear?: number;
  sex?: 'M' | 'F';
  phone?: string;
  nationality?: string;
};

type LocalEntry = {
  id: string;
  name: { first: string; last: string };
  club: string;
  className: string;
  classId: string;
  cardNumber: string;
  birthYear?: string;
  sex?: 'M' | 'F';
  phone?: string;
  nationality?: string;
  status: 'checked-in';
  checkedInAt: Date;
  submittedToMeos: boolean;
  isHiredCard: boolean;
  rented: boolean;
  issues: any;
};

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
    // Mock runner search - in production this would use the runner database service
    setTimeout(() => {
      setFoundRunner(null);
      // Pre-populate the card number
      form.setFieldsValue({
        cardNumber: cardNumber
      });
      message.info(`Card ${cardNumber} - please enter runner details.`);
      setLoading(false);
    }, 500);
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

      // Mock entry creation - in production this would use the entry service
      console.log('Creating new entry:', newEntry);
      
      // Mock MeOS submission
      try {
        message.loading(`Submitting ${values.firstName} ${values.lastName} to MeOS...`, 0);
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1000));
        message.destroy();
        message.success(`✅ ${values.firstName} ${values.lastName} registered successfully!`);
      } catch (meosError) {
        message.destroy();
        message.warning(`⚠️ Registration completed, but MeOS submission failed.`);
      }

      // Notify parent component
      if (onRegistrationComplete) {
        onRegistrationComplete(newEntry, values.cardNumber);
      }

        // Close modal and reset form
        handleClose();
    } catch (error) {
      console.error('Registration error:', error);
      message.error('Registration failed');
    } finally {
      setSubmitting(false);
    }
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