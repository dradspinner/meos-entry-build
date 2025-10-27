import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Select, Row, Col, Space, Button, Typography, message, Alert, Checkbox } from 'antd';
import { IdcardOutlined, LoginOutlined } from '@ant-design/icons';
import { localEntryService, type LocalEntry } from '../services/localEntryService';
import { meosClassService, type MeosClass } from '../services/meosClassService';
import { meosApi } from '../services/meosApi';
import { sportIdentService, type SICardReadEvent } from '../services/sportIdentService';
import { RENTAL_CARD_FEE } from '../constants';

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
  const [classes, setClasses] = useState<MeosClass[]>([]);
  const [saving, setSaving] = useState(false);
  const [readerStatus, setReaderStatus] = useState(sportIdentService.getStatus());
  const [lastCard, setLastCard] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const cls = await meosClassService.getClasses();
        setClasses(cls);
      } catch (e) {
        // fall back to common set
        setClasses([
          { id: 1, name: 'White' },
          { id: 2, name: 'Yellow' },
          { id: 3, name: 'Orange' },
          { id: 4, name: 'Brown' },
          { id: 5, name: 'Green' },
          { id: 6, name: 'Red' },
          { id: 7, name: 'Blue' },
        ]);
      }
    })();
  }, [open]);

  useEffect(() => {
    if (open && entry) {
      // If classId is not in the classes list, try to find by className
      let classIdToUse = entry.classId;
      if (entry.classId && classes.length > 0) {
        const classExists = classes.find(c => c.id.toString() === entry.classId);
        if (!classExists && entry.className) {
          // Try to find by name
          const classByName = classes.find(c => c.name.toLowerCase() === entry.className.toLowerCase());
          if (classByName) {
            classIdToUse = classByName.id.toString();
          }
        }
      }
      
      form.setFieldsValue({
        firstName: entry.name.first,
        lastName: entry.name.last,
        club: entry.club,
        classId: classIdToUse,
        cardNumber: entry.cardNumber,
        birthYear: entry.birthYear,
        sex: entry.sex,
        phone: entry.phone,
        email: (entry as any).email,
        nationality: entry.nationality,
        isHiredCard: entry.isHiredCard || false,
      });
    }
  }, [open, entry, form, classes]);

  // Listen to SI card reader while modal is open to auto-fill card number
  useEffect(() => {
    if (!open) return;
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
  }, [open]);

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
      className: classes.find(c => c.id.toString() === values.classId)?.name || entry.className,
      cardNumber: values.cardNumber,
      birthYear: values.birthYear,
      sex: values.sex,
      phone: values.phone,
      email: values.email,
      nationality: values.nationality,
      isHiredCard: values.isHiredCard || false,
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
    
    // Use the checkbox value as the source of truth for hired card status
    const isHired = values.isHiredCard || false;
    console.log(`[EntryEditModal] Rental card checkbox: isHiredCard=${isHired}`);;
    
    const updated = localEntryService.updateEntry(entry.id, {
      name: { first: values.firstName, last: values.lastName },
      club: values.club,
      classId: values.classId,
      className: classes.find(c => c.id.toString() === values.classId)?.name || entry.className,
      cardNumber: values.cardNumber,
      birthYear: values.birthYear,
      sex: values.sex,
      phone: values.phone,
      email: values.email,
      nationality: values.nationality,
      isHiredCard: isHired, // Set hired card flag from checkbox
    });
    if (updated) {
      const checkedIn = localEntryService.checkInEntry(updated.id, values.cardNumber);
      if (checkedIn) {
        try {
          // Ensure MeOS classes are loaded and map by class NAME, not fallback
          const meosClasses = await meosClassService.getClasses(true);
          const classNameToFind = meosClasses.find(c => c.id.toString() === values.classId)?.name || checkedIn.className;
          const meosClass = meosClasses.find(c => 
            c.name?.toLowerCase() === (classNameToFind||'').toLowerCase() ||
            c.shortName?.toLowerCase() === (classNameToFind||'').toLowerCase()
          );
          if (!meosClass) {
            message.error('Could not map class to MeOS. Click "Verify in MeOS" on the dashboard, then try again.');
            onCheckedIn(checkedIn);
            return;
          }

          const natNum = parseInt(values.nationality || '0', 10);
          const sexVal = (!natNum || natNum <= 1) ? values.sex : undefined;
          
          // isHired already set from checkbox above
          
          console.log(`[EntryEditModal] 📤 Submitting to MeOS: ${values.firstName} ${values.lastName}, card ${values.cardNumber}, isHired=${isHired}`);
          if (isHired) {
            console.log(`[EntryEditModal] 💳 RENTAL CARD DETECTED - will be marked in MeOS with cardFee=$${RENTAL_CARD_FEE}`);
          } else {
            console.log(`[EntryEditModal] 👤 Personal card - no cardFee will be sent`);
          }
          
          await meosApi.createEntry({
            name: `${values.firstName} ${values.lastName}`.trim(),
            club: values.club,
            classId: meosClass.id,
            cardNumber: parseInt(values.cardNumber) || 0,
            cardFee: isHired ? RENTAL_CARD_FEE : undefined, // CRITICAL: Mark as hired card in MeOS
            phone: values.phone,
            birthYear: values.birthYear ? parseInt(values.birthYear) : undefined,
            sex: sexVal as any,
            nationality: values.nationality
          });
          localEntryService.markSubmittedToMeos(checkedIn.id);
          message.success(`Checked in and submitted to MeOS: ${checkedIn.name.first} ${checkedIn.name.last}`);
        } catch (e) {
          message.warning('Checked in locally, but MeOS submit failed. You can retry after Verify.');
        }
        onCheckedIn(checkedIn);
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
      destroyOnHidden
      forceRender
      key={entry?.id || 'new'}
    >
      <>
        <Alert 
          type={readerStatus.connected ? 'success' : 'warning'} 
          showIcon 
          style={{ marginBottom: 12 }}
          message={readerStatus.connected ? 'Card Reader Connected' : 'Card Reader Disconnected'}
          action={!readerStatus.connected ? (
            <Button size="small" onClick={async ()=>{try{await sportIdentService.connect(); setReaderStatus(sportIdentService.getStatus());}catch{}}}>
              Connect
            </Button>
          ) : undefined}
        />
        {open && <Form form={form} layout="vertical" key={`form-${entry?.id || 'new'}`}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item 
                label="First Name" 
                name="firstName" 
                rules={[{
                  validator: async (_, value) => {
                    const natVal = form.getFieldValue('nationality');
                    const natNum = parseInt(natVal || '0', 10);
                    if (!natNum || natNum <= 1) {
                      if (!value || `${value}`.trim() === '') {
                        return Promise.reject(new Error('First Name is required unless Nationality > 1'));
                      }
                    }
                    return Promise.resolve();
                  }
                }]}
              >
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
                    <Option key={c.id} value={c.id.toString()}>{c.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Card Number" name="cardNumber" rules={[{ required: true }]}>
                <Input addonAfter={<IdcardOutlined onClick={() => { if (lastCard) { form.setFieldsValue({ cardNumber: lastCard }); } else { applyLastCard(); } }} />} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="isHiredCard" valuePropName="checked">
                <Checkbox>
                  <Text strong style={{ color: '#ff4d4f' }}>This is a RENTAL card (must be collected)</Text>
                </Checkbox>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Phone" name="phone">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Email" name="email">
                <Input type="email" />
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
                    const natVal = form.getFieldValue('nationality');
                    const natNum = parseInt(natVal || '0', 10);
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
            <Col span={12}>
              <Form.Item label="Nationality (for groups)" name="nationality">
                <Input placeholder="Leave empty or 0 for individual, 2+ for group" />
              </Form.Item>
            </Col>
          </Row>
        </Form>}
          
        <Row justify="end" style={{ marginTop: 16 }}>
          <Space>
            <Button onClick={handleSave} loading={saving}>Save</Button>
            <Button type="primary" icon={<LoginOutlined />} onClick={handleCheckIn}>
              Check In
            </Button>
          </Space>
        </Row>
      </>
    </Modal>
  );
};

export default EntryEditModal;
