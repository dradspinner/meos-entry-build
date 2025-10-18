import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Select, Row, Col, Space, Button, Typography, message } from 'antd';
import { IdcardOutlined, LoginOutlined } from '@ant-design/icons';
import { localEntryService, type LocalEntry } from '../services/localEntryService';
import { meosClassService } from '../services/meosClassService';

const { Text } = Typography;
const { Option } = Select;

interface EntryEditModalProps {
  open: boolean;
  entry: LocalEntry | null;
  onClose: () => void;
  onUpdated: (entry: LocalEntry) => void;
  onCheckedIn: (entry: LocalEntry) => void;
  lastCardNumber?: string | null;
}

const EntryEditModal: React.FC<EntryEditModalProps> = ({ open, entry, onClose, onUpdated, onCheckedIn, lastCardNumber }) => {
  const [form] = Form.useForm();
  const [classes, setClasses] = useState<Array<{ id: string; name: string; fee?: number }>>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const cls = await meosClassService.getAllClasses();
        setClasses(cls);
      } catch (e) {
        // fall back to common set
        setClasses([
          { id: '1', name: 'White' },
          { id: '2', name: 'Yellow' },
          { id: '3', name: 'Orange' },
          { id: '4', name: 'Brown' },
          { id: '5', name: 'Green' },
          { id: '6', name: 'Red' },
          { id: '7', name: 'Blue' },
        ]);
      }
    })();
  }, [open]);

  useEffect(() => {
    if (open && entry) {
      form.setFieldsValue({
        firstName: entry.name.first,
        lastName: entry.name.last,
        club: entry.club,
        classId: entry.classId,
        cardNumber: entry.cardNumber,
        birthYear: entry.birthYear,
        sex: entry.sex,
        phone: entry.phone,
      });
    } else {
      form.resetFields();
    }
  }, [open, entry, form]);

  const applyLastCard = () => {
    if (lastCardNumber && lastCardNumber !== '0') {
      form.setFieldsValue({ cardNumber: lastCardNumber });
    } else {
      message.info('Scan a card to fill card number');
    }
  };

  const handleSave = async () => {
    if (!entry) return;
    const values = await form.validateFields();
    setSaving(true);
    try {
      const updated = localEntryService.updateEntry(entry.id, {
        name: { first: values.firstName, last: values.lastName },
        club: values.club,
        classId: values.classId,
        className: classes.find(c => c.id === values.classId)?.name || entry.className,
        cardNumber: values.cardNumber,
        birthYear: values.birthYear,
        sex: values.sex,
        phone: values.phone,
      });
      if (updated) {
        onUpdated(updated);
        message.success('Entry updated');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCheckIn = async () => {
    if (!entry) return;
    const values = await form.validateFields();
    const updated = localEntryService.updateEntry(entry.id, {
      name: { first: values.firstName, last: values.lastName },
      club: values.club,
      classId: values.classId,
      className: classes.find(c => c.id === values.classId)?.name || entry.className,
      cardNumber: values.cardNumber,
      birthYear: values.birthYear,
      sex: values.sex,
      phone: values.phone,
    });
    if (updated) {
      const checkedIn = localEntryService.checkInEntry(updated.id, values.cardNumber);
      if (checkedIn) {
        onCheckedIn(checkedIn);
        message.success(`Checked in ${checkedIn.name.first} ${checkedIn.name.last}`);
      }
    }
  };

  return (
    <Modal
      title={
        <Space>
          <Text>Edit Entry</Text>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={720}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="First Name" name="firstName" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Last Name" name="lastName" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="Club" name="club" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label="Birth Year" name="birthYear">
              <Input />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label="Sex" name="sex">
              <Select allowClear>
                <Option value="M">M</Option>
                <Option value="F">F</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="Class" name="classId" rules={[{ required: true }]}>
              <Select showSearch optionFilterProp="children">
                {classes.map(c => (
                  <Option key={c.id} value={c.id}>{c.name}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Card Number" name="cardNumber" rules={[{ required: true }]}>
              <Input addonAfter={<IdcardOutlined onClick={applyLastCard} />} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="Phone" name="phone">
              <Input />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item 
              label="Birth Year" 
              name="birthYear"
              rules={[{
                validator: async (_, value) => {
                  const natNum = parseInt((entry?.nationality as any) || '0', 10);
                  if (!natNum || natNum <= 1) {
                    if (!value || `${value}`.trim() === '') {
                      return Promise.reject(new Error('Birth Year is required unless Nationality > 1'));
                    }
                  }
                  return Promise.resolve();
                }
              }]}
            >
              <Input />
            </Form.Item>
          </Col>
        </Row>
      </Form>
      <Row justify="end">
        <Space>
          <Button onClick={handleSave} loading={saving}>Save</Button>
          <Button type="primary" icon={<LoginOutlined />} onClick={handleCheckIn}>
            Check In
          </Button>
        </Space>
      </Row>
    </Modal>
  );
};

export default EntryEditModal;
