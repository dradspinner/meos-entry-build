import React, { useState, useEffect } from 'react';
import { Modal, Table, Button, Space, Form, Input, Select, Row, Col, message, Card, Switch, Typography, Divider } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SaveOutlined, CloudSyncOutlined, FolderOpenOutlined, CloudDownloadOutlined, CloudUploadOutlined, ImportOutlined } from '@ant-design/icons';
import { localRunnerService, type LocalRunner } from '../services/localRunnerService';

const { Option } = Select;

interface RunnerDatabaseManagerProps {
  open: boolean;
  onClose: () => void;
}

const RunnerDatabaseManager: React.FC<RunnerDatabaseManagerProps> = ({ open, onClose }) => {
  const [runners, setRunners] = useState<LocalRunner[]>([]);
  const [editing, setEditing] = useState<LocalRunner | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [forceRender, setForceRender] = useState(0);
  const [cloudPath, setCloudPath] = useState<string>('');
  const [autoSave, setAutoSave] = useState<boolean>(true);
  const [isElectron, setIsElectron] = useState<boolean>(false);
  const [xmlImporting, setXmlImporting] = useState<boolean>(false);
  const [form] = Form.useForm();
  
  // Removed continuous console logging to prevent spam

  const refresh = () => {
    setRunners(localRunnerService.getAllRunners());
    // Update cloud sync status
    const status = localRunnerService.getCloudSyncStatus();
    setCloudPath(status.path);
    setAutoSave(status.autoSave);
    // Check if running in Electron
    setIsElectron(!!(typeof window !== 'undefined' && (window as any).electronAPI));
  };

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  const startEdit = (runner?: LocalRunner) => {
    console.log('startEdit called with:', runner?.name);
    setEditing(runner || null);
    setShowEditForm(!!runner);
    setForceRender(prev => prev + 1); // Force a re-render
    
    form.resetFields();
    
    if (runner) {
      // Use setTimeout to ensure the form is rendered before setting values
      setTimeout(() => {
        try {
          form.setFieldsValue({
            firstName: runner.name.first,
            lastName: runner.name.last,
            birthYear: runner.birthYear,
            club: runner.club,
            sex: runner.sex,
            phone: runner.phone,
            email: runner.email,
            cardNumber: runner.cardNumber,
          });
          console.log('Form values set successfully');
        } catch (error) {
          console.error('Error setting form values:', error);
        }
      }, 100);
    }
    
    console.log('State updated - editing:', !!runner, 'showEditForm:', !!runner);
  };

  const saveRunner = async () => {
    const vals = await form.validateFields();
    if (editing) {
      const updated = localRunnerService.updateRunner(editing.id, {
        name: { first: vals.firstName.trim(), last: vals.lastName.trim() },
        birthYear: vals.birthYear ? parseInt(vals.birthYear) : undefined,
        club: vals.club?.trim() || '',
        sex: vals.sex,
        phone: vals.phone?.trim() || '',
        email: vals.email?.trim() || '',
        cardNumber: vals.cardNumber ? parseInt(vals.cardNumber) : undefined,
      });
      if (updated) message.success('Runner updated');
    } else {
      localRunnerService.addRunner({
        name: { first: vals.firstName.trim(), last: vals.lastName.trim() },
        birthYear: vals.birthYear ? parseInt(vals.birthYear) : undefined,
        club: vals.club?.trim() || '',
        sex: vals.sex,
        phone: vals.phone?.trim() || '',
        email: vals.email?.trim() || '',
        cardNumber: vals.cardNumber ? parseInt(vals.cardNumber) : undefined,
        nationality: '',
      } as any);
      message.success('Runner added');
    }
    setEditing(null);
    setShowEditForm(false);
    refresh();
  };

  const delRunner = (r: LocalRunner) => {
    if (localRunnerService.deleteRunner(r.id)) {
      message.success('Runner deleted');
      refresh();
    }
  };

  // Cloud sync handlers
  const handleChooseCloudPath = async () => {
    const newPath = await localRunnerService.chooseCloudPath();
    if (newPath) {
      setCloudPath(newPath);
      message.success(`Cloud path updated to: ${newPath}`);
    }
  };

  const handleLoadFromCloud = async () => {
    try {
      const result = await localRunnerService.loadFromCloud();
      if (result.success) {
        message.success(`Loaded ${result.imported} runners from cloud`);
        refresh();
      } else {
        message.error(`Failed to load from cloud: ${result.errors.join(', ')}`);
      }
    } catch (error) {
      message.error('Error loading from cloud');
    }
  };

  const handleSaveToCloud = async () => {
    try {
      const success = await localRunnerService.saveToCloud();
      if (success) {
        message.success('Successfully saved to cloud');
      } else {
        message.error('Failed to save to cloud');
      }
    } catch (error) {
      message.error('Error saving to cloud');
    }
  };

  const handleAutoSaveToggle = (enabled: boolean) => {
    localRunnerService.setAutoSave(enabled);
    setAutoSave(enabled);
    message.success(`Auto-save ${enabled ? 'enabled' : 'disabled'}`);
  };

  const handleXMLImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setXmlImporting(true);
    try {
      message.loading('Importing XML file...', 0);
      
      const xmlContent = await file.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
      
      const competitors = xmlDoc.getElementsByTagName('Competitor');
      const xmlRunners = [];
      
      for (let i = 0; i < competitors.length; i++) {
        const competitor = competitors[i];
        const person = competitor.getElementsByTagName('Person')[0];
        if (!person) continue;
        
        const nameElement = person.getElementsByTagName('Name')[0];
        if (!nameElement) continue;
        
        const givenName = nameElement.getElementsByTagName('Given')[0]?.textContent?.trim();
        const familyName = nameElement.getElementsByTagName('Family')[0]?.textContent?.trim();
        
        if (!givenName || !familyName) continue;
        
        const sex = person.getAttribute('sex') || undefined;
        const birthDateElement = person.getElementsByTagName('BirthDate')[0];
        let birthYear;
        if (birthDateElement) {
          const birthDate = birthDateElement.textContent?.trim();
          if (birthDate) birthYear = parseInt(birthDate.split('-')[0]);
        }
        
        const controlCard = competitor.getElementsByTagName('ControlCard')[0];
        let cardNumber;
        if (controlCard) {
          const cardText = controlCard.textContent?.trim();
          if (cardText) cardNumber = parseInt(cardText);
        }
        
        const orgElement = competitor.getElementsByTagName('Organisation')[0];
        let club = '';
        if (orgElement) {
          const orgName = orgElement.getElementsByTagName('Name')[0]?.textContent?.trim();
          if (orgName) {
            club = orgName;
          } else {
            const orgId = orgElement.getElementsByTagName('Id')[0]?.textContent?.trim();
            if (orgId === '852') club = 'DVOA';
            else if (orgId === '3') club = 'QOC';
            else if (orgId === '4') club = 'HVO';
            else if (orgId === '14') club = 'None';
            else if (orgId === '90010') club = 'CSU';
            else club = orgId ? `Org-${orgId}` : '';
          }
        }
        
        xmlRunners.push({
          name: { first: givenName, last: familyName },
          club: club,
          birthYear: birthYear,
          sex: sex as 'M' | 'F' | undefined,
          cardNumber: cardNumber,
          nationality: '',
          phone: '',
          email: ''
        });
      }
      
      message.destroy();
      
      if (xmlRunners.length === 0) {
        message.error('No valid runners found in XML file');
        return;
      }
      
      // Clear existing and import new runners (replace mode)
      localRunnerService.clearAllRunners();
      
      let imported = 0;
      xmlRunners.forEach(runnerData => {
        localRunnerService.addRunner(runnerData);
        imported++;
      });
      
      message.success(`Successfully imported ${imported} runners from ${file.name}`);
      refresh(); // Refresh the display
      
    } catch (error) {
      message.destroy();
      console.error('XML import error:', error);
      message.error(`Failed to import XML: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setXmlImporting(false);
      // Clear the file input
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const columns = [
    { title: 'First Name', dataIndex: ['name','first'], key: 'first', sorter: (a: any, b: any) => (a.name.first||'').localeCompare(b.name.first||'') },
    { title: 'Last Name', dataIndex: ['name','last'], key: 'last', sorter: (a: any, b: any) => (a.name.last||'').localeCompare(b.name.last||'') },
    { title: 'Year Born', dataIndex: 'birthYear', key: 'birthYear', width: 100 },
    { title: 'Club', dataIndex: 'club', key: 'club' },
    { title: 'Sex', dataIndex: 'sex', key: 'sex', width: 80 },
    { title: 'Phone', dataIndex: 'phone', key: 'phone' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'SI Card', dataIndex: 'cardNumber', key: 'cardNumber', width: 100 },
    {
      title: 'Actions', key: 'actions', render: (_: any, r: LocalRunner) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => {
            console.log('Edit button clicked for:', r.name);
            startEdit(r);
          }}>Edit</Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => {
            console.log('Delete button clicked for:', r.name);
            delRunner(r);
          }}>Delete</Button>
        </Space>
      )
    }
  ];

  return (
    <Modal
      title={
        <Space>
          Runner Database ({runners.length})
          <Button size="small" icon={<PlusOutlined />} onClick={() => startEdit(undefined)}>Add Runner</Button>
          <input type="file" id="xmlFileInput" accept=".xml" style={{display: 'none'}} onChange={handleXMLImport} />
          <Button 
            size="small" 
            icon={<ImportOutlined />} 
            loading={xmlImporting}
            onClick={() => document.getElementById('xmlFileInput')?.click()}
          >
            Import XML
          </Button>
        </Space>
      }
      open={open}
      onCancel={() => { setEditing(null); setShowEditForm(false); onClose(); }}
      footer={null}
      width={1000}
    >
      {/* Cloud Sync Controls */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space split={<Divider type="vertical" />} wrap>
          <Space>
            <CloudSyncOutlined />
            <Typography.Text strong>Cloud Sync:</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: '12px', maxWidth: '300px' }}>
              {cloudPath || 'No path set'}
            </Typography.Text>
            {!isElectron && (
              <Typography.Text type="warning" style={{ fontSize: '11px' }}>
                (Web mode - limited functionality)
              </Typography.Text>
            )}
          </Space>
          <Space>
            <Button 
              size="small" 
              icon={<FolderOpenOutlined />} 
              onClick={handleChooseCloudPath}
              title={isElectron ? 'Choose cloud sync location' : 'Set cloud path manually'}
            >
              {isElectron ? 'Choose Path' : 'Set Path'}
            </Button>
            <Button 
              size="small" 
              icon={<CloudDownloadOutlined />} 
              onClick={handleLoadFromCloud}
              title={isElectron ? 'Load from cloud file' : 'Load from JSON file'}
            >
              {isElectron ? 'Load from Cloud' : 'Load File'}
            </Button>
            <Button 
              size="small" 
              icon={<CloudUploadOutlined />} 
              onClick={handleSaveToCloud}
              title={isElectron ? 'Save to cloud file' : 'Download JSON file'}
            >
              {isElectron ? 'Save to Cloud' : 'Download'}
            </Button>
          </Space>
          <Space>
            <Typography.Text>Auto-save:</Typography.Text>
            <Switch size="small" checked={autoSave} onChange={handleAutoSaveToggle} />
          </Space>
        </Space>
      </Card>
      
      <Table rowKey={(r: LocalRunner)=>r.id} dataSource={runners} columns={columns} size="small" pagination={false} />
      
      {/* Edit Runner Modal */}
      <Modal
        title={`Edit Runner: ${editing ? `${editing.name.first} ${editing.name.last}` : ''}`}
        open={showEditForm && editing !== null}
        onCancel={() => { setEditing(null); setShowEditForm(false); }}
        footer={[
          <Button key="cancel" onClick={() => { setEditing(null); setShowEditForm(false); }}>
            Cancel
          </Button>,
          <Button key="save" type="primary" icon={<SaveOutlined />} onClick={saveRunner}>
            Save
          </Button>
        ]}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="firstName" label="First Name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="lastName" label="Last Name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="birthYear" label="Year Born">
                <Input type="number" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="sex" label="Sex">
                <Select allowClear>
                  <Option value="M">M</Option>
                  <Option value="F">F</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="cardNumber" label="SI Card">
                <Input type="number" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="club" label="Club">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="phone" label="Phone">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="email" label="Email">
                <Input type="email" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </Modal>
  );
};

export default RunnerDatabaseManager;
