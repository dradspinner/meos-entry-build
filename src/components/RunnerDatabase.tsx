// Runner Database Management Component
// Manage local runner database for auto-completion

import React, { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Table,
  Typography,
  Space,
  message,
  Modal,
  Upload,
  Statistic,
  Row,
  Col,
  Alert,
  Input,
  Progress,
  Form,
  Select,
  App,
} from 'antd';
import {
  UserOutlined,
  UserAddOutlined,
  DownloadOutlined,
  UploadOutlined,
  DeleteOutlined,
  SyncOutlined,
  SearchOutlined,
  InfoCircleOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { localRunnerService, LocalRunner } from '../services/localRunnerService';
import { meosRunnerDatabaseClient } from '../services/meosRunnerDatabaseClient';
import { iofRunnerDatabaseService } from '../services/iofRunnerDatabaseService';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

export const RunnerDatabase: React.FC = () => {
  const { message: messageApi } = App.useApp();
  const [runners, setRunners] = useState<LocalRunner[]>([]);
  const [stats, setStats] = useState({ total: 0, totalUsage: 0, lastUsed: undefined as Date | undefined });
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [bulkPopulateProgress, setBulkPopulateProgress] = useState({ 
    visible: false, 
    progress: 0, 
    status: 'Initializing...',
    found: 0,
    errors: [] as string[]
  });
  const [iofXmlStats, setIofXmlStats] = useState({ totalRunners: 0, lastUpdated: null as Date | null, sourceFile: '' });
  const [iofXmlLoading, setIofXmlLoading] = useState(false);
  const [addRunnerVisible, setAddRunnerVisible] = useState(false);
  const [editingRunner, setEditingRunner] = useState<LocalRunner | null>(null);
  const [editRunnerVisible, setEditRunnerVisible] = useState(false);
  const [editForm] = Form.useForm();

  // Load data on component mount
  useEffect(() => {
    loadRunners();
    loadIofXmlStats();
  }, []);

  const loadRunners = () => {
    setRunners(localRunnerService.getAllRunners());
    setStats(localRunnerService.getStats());
  };
  
  const loadIofXmlStats = async () => {
    try {
      await iofRunnerDatabaseService.initialize();
      const stats = iofRunnerDatabaseService.getStats();
      setIofXmlStats({
        totalRunners: stats.totalRunners,
        lastUpdated: stats.lastUpdated || null,
        sourceFile: stats.sourceFile || ''
      });
    } catch (error) {
      console.error('Failed to load IOF-XML stats:', error);
    }
  };

  // Filter runners based on search text
  const filteredRunners = runners.filter(runner => {
    if (!searchText) return true;
    const fullName = `${runner.name.first} ${runner.name.last}`.toLowerCase();
    const club = runner.club.toLowerCase();
    const search = searchText.toLowerCase();
    return fullName.includes(search) || club.includes(search);
  });

  // Export database to JSON file
  const handleExport = () => {
    try {
      const jsonData = localRunnerService.exportDatabase();
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `runner_database_${new Date().toISOString().slice(0, 10).replace(/-/g, '_')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      messageApi.success('Runner database exported successfully!');
    } catch (error) {
      console.error('Export failed:', error);
      messageApi.error('Failed to export runner database');
    }
  };

  // Import database from JSON file
  const handleImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonData = e.target?.result as string;
        const result = localRunnerService.importDatabase(jsonData, 'merge');
        
        if (result.errors.length > 0) {
          console.warn('Import warnings:', result.errors);
          Modal.warning({
            title: 'Import Completed with Warnings',
            content: (
              <div>
                <p>Successfully imported {result.imported} new runners and updated {result.updated} existing runners.</p>
                <p>Warnings encountered:</p>
                <ul>
                  {result.errors.slice(0, 5).map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                  {result.errors.length > 5 && <li>...and {result.errors.length - 5} more</li>}
                </ul>
              </div>
            ),
          });
        } else {
          messageApi.success(`Import successful! Added ${result.imported} new runners, updated ${result.updated} existing runners`);
        }
        
        loadRunners();
      } catch (error) {
        console.error('Import failed:', error);
        messageApi.error('Failed to import runner database - invalid file format');
      }
    };
    reader.readAsText(file);
    return false; // Prevent automatic upload
  };
  
  // Handle IOF-XML file loading
  const handleIOFXMLFile = async (file: File) => {
    console.log('[RunnerDatabase] Loading IOF-XML file:', file.name);
    setIofXmlLoading(true);
    
    try {
      const loadingMessage = messageApi.loading(`Loading runners from ${file.name}...`, 0);
      
      const result = await meosRunnerDatabaseClient.loadFromIOFXML(file);
      
      loadingMessage();
      
      if (result.success) {
        messageApi.success(result.message);
        
        // Refresh IOF-XML stats
        await loadIofXmlStats();
        
        // Show success modal with option to populate local database
        Modal.success({
          title: 'IOF-XML Database Loaded Successfully!',
          content: (
            <div>
              <p>{result.message}</p>
              <p><strong>Would you like to populate your local runner database with this data for auto-completion?</strong></p>
            </div>
          ),
          onOk: () => {
            // Auto-populate local database from IOF-XML
            handlePopulateFromIOFXML();
          },
          okText: 'Yes, Populate Local Database',
          cancelText: 'Skip for Now'
        });
        
      } else {
        messageApi.error(result.message);
      }
      
    } catch (error) {
      console.error('[RunnerDatabase] Failed to load IOF-XML:', error);
      messageApi.error(`Failed to load IOF-XML file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIofXmlLoading(false);
    }
  };
  
  // Populate local database from IOF-XML data
  const handlePopulateFromIOFXML = async () => {
    try {
      const result = await meosRunnerDatabaseClient.populateLocalRunnerService();
      
      if (result.imported > 0 || result.updated > 0) {
        let messageText = '';
        if (result.imported > 0 && result.updated > 0) {
          messageText = `Successfully imported ${result.imported} new runners and updated ${result.updated} existing runners from IOF-XML database!`;
        } else if (result.imported > 0) {
          messageText = `Successfully imported ${result.imported} new runners from IOF-XML database!`;
        } else {
          messageText = `Successfully updated ${result.updated} existing runners from IOF-XML database!`;
        }
        
        messageApi.success(messageText);
        loadRunners();
      } else {
        messageApi.warning('No new runner data to import from IOF-XML database.');
      }
      
    } catch (error) {
      console.error('[RunnerDatabase] Failed to populate from IOF-XML:', error);
      messageApi.error('Failed to populate local database from IOF-XML data');
    }
  };

  // Handle clear all runners
  const handleClear = () => {
    Modal.confirm({
      title: 'Clear Learning Database?',
      content: 'This will remove all learned runners from your auto-completion database. Your IOF-XML master database will remain intact.',
      okText: 'Clear All',
      okType: 'danger',
      onOk: () => {
        localRunnerService.clearAll();
        loadRunners();
        messageApi.success('Learning database cleared successfully');
      }
    });
  };

  // Table columns definition
  const columns = [
    {
      title: 'Name',
      key: 'name',
      render: (text: any, runner: LocalRunner) => (
        <div>
          <Text strong>{runner.name.first} {runner.name.last}</Text>
          {runner.timesUsed > 0 && (
            <div style={{ fontSize: '11px', color: '#666' }}>
              Used {runner.timesUsed} time{runner.timesUsed !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      ),
      sorter: (a: LocalRunner, b: LocalRunner) => 
        `${a.name.first} ${a.name.last}`.localeCompare(`${b.name.first} ${b.name.last}`),
    },
    {
      title: 'Club',
      dataIndex: 'club',
      key: 'club',
      sorter: (a: LocalRunner, b: LocalRunner) => a.club.localeCompare(b.club),
    },
    {
      title: 'YB',
      key: 'birthYear',
      width: 80,
      render: (text: any, runner: LocalRunner) => (
        <Text style={{ fontSize: '12px' }}>
          {runner.birthYear || '-'}
        </Text>
      ),
      sorter: (a: LocalRunner, b: LocalRunner) => (a.birthYear || 0) - (b.birthYear || 0),
    },
    {
      title: 'Card',
      key: 'cardNumber',
      width: 100,
      render: (text: any, runner: LocalRunner) => (
        <Text style={{ fontSize: '12px' }}>
          {runner.cardNumber || '-'}
        </Text>
      ),
      sorter: (a: LocalRunner, b: LocalRunner) => (a.cardNumber || 0) - (b.cardNumber || 0),
    },
    {
      title: 'Phone',
      key: 'phone',
      width: 120,
      render: (text: any, runner: LocalRunner) => (
        <Text style={{ fontSize: '12px' }}>
          {runner.phone || '-'}
        </Text>
      ),
    },
    {
      title: 'Email',
      key: 'email',
      width: 150,
      render: (text: any, runner: LocalRunner) => (
        <Text style={{ fontSize: '12px' }}>
          {runner.email || '-'}
        </Text>
      ),
    },
    {
      title: 'Last Used',
      key: 'lastUsed',
      width: 100,
      render: (text: any, runner: LocalRunner) => (
        <Text type="secondary" style={{ fontSize: '12px' }}>
          {runner.lastUsed.toLocaleDateString()}
        </Text>
      ),
      sorter: (a: LocalRunner, b: LocalRunner) => 
        b.lastUsed.getTime() - a.lastUsed.getTime(),
      defaultSortOrder: 'descend' as const,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      fixed: 'right' as const,
      render: (text: any, runner: LocalRunner) => (
        <Space>
          <Button 
            size="small" 
            icon={<EditOutlined />} 
            onClick={() => {
              setEditingRunner(runner);
              setEditRunnerVisible(true);
            }}
          />
          <Button 
            size="small" 
            icon={<DeleteOutlined />} 
            danger
            onClick={() => {
              Modal.confirm({
                title: `Delete ${runner.name.first} ${runner.name.last}?`,
                content: 'This will permanently remove this runner from your learning database.',
                onOk: () => {
                  localRunnerService.deleteRunner(runner.id);
                  loadRunners();
                  messageApi.success('Runner deleted successfully');
                }
              });
            }}
          />
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card>
        <Space direction="vertical" style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Title level={3} style={{ margin: 0 }}>
              <UserOutlined style={{ marginRight: 8 }} />
              Runner Database
            </Title>
            <Space>
              <Button type="primary" icon={<UserAddOutlined />} onClick={() => setAddRunnerVisible(true)}>
                Add Runner
              </Button>
              <Button icon={<SyncOutlined />} onClick={handlePopulateFromIOFXML} 
                disabled={iofXmlStats.totalRunners === 0}
                title={iofXmlStats.totalRunners === 0 ? 'Load IOF-XML file first' : 'Copy all runners from IOF-XML master database'}
              >
                Import from Master DB
              </Button>
              <Button icon={<DownloadOutlined />} onClick={handleExport} 
                title="Export learning database as JSON backup">
                Backup
              </Button>
              <Upload
                accept=".json"
                beforeUpload={handleImport}
                showUploadList={false}
              >
                <Button icon={<UploadOutlined />} title="Restore from JSON backup">Restore</Button>
              </Upload>
              <Button icon={<DeleteOutlined />} danger onClick={handleClear}
                title="Clear all learned runners (keeps IOF-XML master database)">
                Clear Learning DB
              </Button>
            </Space>
          </div>

          <Alert
            message="Local Learning Database for Auto-Completion"
            description={
              <div>
                <Paragraph style={{ margin: 0 }}>
                  This is your <strong>learning database</strong> that automatically grows as you process registrations. 
                  It includes runners from CSV imports, manual entries, and gets populated from your MeOS master database.
                </Paragraph>
                <ul style={{ marginTop: 8, marginBottom: 0 }}>
                  <li><strong>Auto-Learning:</strong> Learns from every registration CSV you import</li>
                  <li><strong>Cross-Event:</strong> Accumulates runners across all your events</li>
                  <li><strong>Smart Ranking:</strong> Most-used runners appear first in auto-completion</li>
                  <li><strong>Manual Editing:</strong> Add, edit, or delete runners as needed</li>
                </ul>
              </div>
            }
            type="info"
            icon={<InfoCircleOutlined />}
            style={{ marginBottom: 16 }}
          />

          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Statistic title="Total Runners" value={stats.total} prefix={<UserOutlined />} />
            </Col>
            <Col span={6}>
              <Statistic title="Total Usage" value={stats.totalUsage} />
            </Col>
            <Col span={12}>
              <div>
                <Text type="secondary">Last Activity:</Text><br />
                <Text>{stats.lastUsed ? stats.lastUsed.toLocaleString() : 'Never'}</Text>
              </div>
            </Col>
          </Row>

          {/* IOF-XML Master Database Section */}
          <Card 
            title="📤 MeOS Master Database (IOF-XML)" 
            style={{ marginBottom: 16 }}
            size="small"
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={12}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <div style={{ marginBottom: 12 }}>
                    <Text strong>Load complete runner history from MeOS:</Text>
                    <br/>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      ⚠️ Manual process: Export fresh XML from MeOS when you need updated data
                    </Text>
                  </div>
                  
                  <div style={{ 
                    border: iofXmlStats.totalRunners > 0 ? '2px solid #52c41a' : '2px dashed #d9d9d9', 
                    borderRadius: '6px', 
                    padding: '16px', 
                    textAlign: 'center',
                    backgroundColor: iofXmlStats.totalRunners > 0 ? '#f6ffed' : '#fafafa'
                  }}>
                    <input 
                      type="file" 
                      accept=".xml" 
                      style={{ display: 'none' }} 
                      id="iof-xml-file-input"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleIOFXMLFile(file);
                        }
                      }}
                    />
                    <Button 
                      type={iofXmlStats.totalRunners > 0 ? "default" : "primary"}
                      size="large"
                      loading={iofXmlLoading}
                      onClick={() => document.getElementById('iof-xml-file-input')?.click()}
                    >
                      {iofXmlStats.totalRunners > 0 ? 'Update IOF-XML File' : 'Load IOF-XML File'}
                    </Button>
                    <div style={{ marginTop: '8px' }}>
                      <Text type="secondary">
                        {iofXmlStats.totalRunners > 0 
                          ? `${iofXmlStats.totalRunners} runners loaded`
                          : 'Select your exported MeOS runner database'
                        }
                      </Text>
                    </div>
                  </div>
                  
                  {iofXmlStats.totalRunners > 0 && (
                    <Alert
                      message={`Master database loaded: ${iofXmlStats.sourceFile}`}
                      description={
                        <div>
                          <Text>📊 {iofXmlStats.totalRunners} runners available for lookup</Text><br/>
                          <Text type="secondary">Updated: {iofXmlStats.lastUpdated?.toLocaleString()}</Text>
                        </div>
                      }
                      type="success"
                      showIcon
                      action={
                        <Button 
                          size="small" 
                          type="link"
                          onClick={handlePopulateFromIOFXML}
                        >
                          Populate Local DB
                        </Button>
                      }
                    />
                  )}
                </Space>
              </Col>
              
              <Col xs={24} lg={12}>
                <div style={{ padding: '0 16px' }}>
                  <Text strong>Quick Export Steps:</Text>
                  <ol style={{ marginTop: '8px', paddingLeft: '16px', marginBottom: 0 }}>
                    <li><Text>Open MeOS → <Text code>Lists → Competitors → Export</Text></Text></li>
                    <li><Text>Choose <Text code>IOF-XML 3.0</Text> format</Text></li>
                    <li><Text>Save and load the XML file above</Text></li>
                  </ol>
                  <div style={{ marginTop: 12, padding: '8px', backgroundColor: '#f0f2f5', borderRadius: '4px' }}>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      💡 <strong>Benefits:</strong> Fast searches, works offline, includes complete runner history from all your MeOS events
                    </Text>
                  </div>
                </div>
              </Col>
            </Row>
          </Card>

          <div style={{ marginBottom: 16 }}>
            <Input
              placeholder="Search runners by name or club..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 300 }}
            />
            <Text type="secondary" style={{ marginLeft: 16 }}>
              Showing {filteredRunners.length} of {runners.length} runners
            </Text>
          </div>

          <Table
            dataSource={filteredRunners}
            columns={columns}
            rowKey="id"
            scroll={{ x: 1200 }}
            pagination={{
              pageSize: 100,
              showSizeChanger: true,
              showQuickJumper: true,
              pageSizeOptions: ['50', '100', '200', '500'],
              showTotal: (total, range) => 
                `${range[0]}-${range[1]} of ${total} runners`,
            }}
          />
        </Space>
      </Card>

      {/* Bulk Populate Progress Modal */}
      <Modal
        title="Populating from MeOS"
        open={bulkPopulateProgress.visible}
        footer={null}
        closable={false}
        centered
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Progress percent={bulkPopulateProgress.progress} />
          <Text>{bulkPopulateProgress.status}</Text>
          {bulkPopulateProgress.found > 0 && (
            <Text type="success">Found {bulkPopulateProgress.found} runners so far...</Text>
          )}
          {bulkPopulateProgress.errors.length > 0 && (
            <div>
              <Text type="warning">Some lookups failed (this is normal):</Text>
              <TextArea
                value={bulkPopulateProgress.errors.slice(0, 5).join('\n')}
                rows={3}
                readOnly
                style={{ marginTop: 8 }}
              />
            </div>
          )}
        </Space>
      </Modal>
      
      {/* Add Runner Modal */}
      <Modal
        title="Add New Runner"
        open={addRunnerVisible}
        onCancel={() => setAddRunnerVisible(false)}
        footer={null}
        width={600}
      >
        <Form
          layout="vertical"
          onFinish={(values) => {
            const newRunner = {
              name: {
                first: values.firstName || '',
                last: values.lastName || ''
              },
              club: values.club || '',
              birthYear: values.birthYear,
              sex: values.sex,
              cardNumber: values.cardNumber,
              nationality: values.nationality || '',
              phone: values.phone || '',
              email: values.email || ''
            };
            
            localRunnerService.learnFromEntry(newRunner);
            loadRunners();
            setAddRunnerVisible(false);
            messageApi.success('Runner added successfully!');
          }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="First Name" name="firstName" rules={[{ required: true, message: 'Required' }]}>
                <Input placeholder="John" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Last Name" name="lastName" rules={[{ required: true, message: 'Required' }]}>
                <Input placeholder="Doe" />
              </Form.Item>
            </Col>
          </Row>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Club" name="club">
                <Input placeholder="DVOA" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="Birth Year" name="birthYear">
                <Input type="number" placeholder="1990" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="Sex" name="sex">
                <Select placeholder="Select">
                  <Select.Option value="M">Male</Select.Option>
                  <Select.Option value="F">Female</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="Card Number" name="cardNumber">
                <Input type="number" placeholder="123456" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Phone" name="phone">
                <Input placeholder="555-1234" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Nationality" name="nationality">
                <Input placeholder="USA" maxLength={3} />
              </Form.Item>
            </Col>
          </Row>
          
          <Form.Item label="Email" name="email">
            <Input type="email" placeholder="john@example.com" />
          </Form.Item>
          
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                Add Runner
              </Button>
              <Button onClick={() => setAddRunnerVisible(false)}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
      
      {/* Edit Runner Modal */}
      <Modal
        title="Edit Runner"
        open={editRunnerVisible}
        destroyOnClose
        onCancel={() => {
          setEditRunnerVisible(false);
          setEditingRunner(null);
        }}
        footer={null}
        width={600}
      >
        {editingRunner && (
          <Form
            key={editingRunner.id}
            form={editForm}
            layout="vertical"
            initialValues={{
              firstName: editingRunner.name.first,
              lastName: editingRunner.name.last,
              club: editingRunner.club,
              birthYear: editingRunner.birthYear,
              sex: editingRunner.sex,
              cardNumber: editingRunner.cardNumber,
              nationality: editingRunner.nationality,
              phone: editingRunner.phone,
              email: editingRunner.email
            }}
            onFinish={(values) => {
              const updates = {
                name: {
                  first: (values.firstName || '').toString().trim(),
                  last: (values.lastName || '').toString().trim(),
                },
                club: (values.club || '').toString().trim(),
                birthYear: values.birthYear !== undefined && values.birthYear !== '' ? parseInt(values.birthYear as any, 10) : undefined,
                sex: values.sex as 'M' | 'F' | undefined,
                cardNumber: values.cardNumber !== undefined && values.cardNumber !== '' ? parseInt(values.cardNumber as any, 10) : undefined,
                nationality: (values.nationality || '').toString().trim(),
                phone: (values.phone || '').toString().trim(),
                email: (values.email || '').toString().trim(),
              } as Partial<Omit<LocalRunner, 'id' | 'lastUsed' | 'timesUsed'>>;

              localRunnerService.updateRunner(editingRunner.id, updates);
              loadRunners();
              setEditRunnerVisible(false);
              setEditingRunner(null);
              messageApi.success('Runner updated successfully!');
            }}
          >
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="First Name" name="firstName" rules={[{ required: true, message: 'Required' }]}>
                  <Input placeholder="John" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Last Name" name="lastName" rules={[{ required: true, message: 'Required' }]}>
                  <Input placeholder="Doe" />
                </Form.Item>
              </Col>
            </Row>
            
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="Club" name="club">
                  <Input placeholder="DVOA" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label="Birth Year" name="birthYear">
                  <Input type="number" placeholder="1990" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label="Sex" name="sex">
                  <Select placeholder="Select">
                    <Select.Option value="M">Male</Select.Option>
                    <Select.Option value="F">Female</Select.Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
            
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item label="Card Number" name="cardNumber">
                  <Input type="number" placeholder="123456" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="Phone" name="phone">
                  <Input placeholder="555-1234" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="Nationality" name="nationality">
                  <Input placeholder="USA" maxLength={3} />
                </Form.Item>
              </Col>
            </Row>
            
            <Form.Item label="Email" name="email">
              <Input type="email" placeholder="john@example.com" />
            </Form.Item>
            
            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit">
                  Update Runner
                </Button>
                <Button onClick={() => {
                  setEditRunnerVisible(false);
                  setEditingRunner(null);
                }}>
                  Cancel
                </Button>
              </Space>
            </Form.Item>
          </Form>
        )}
      </Modal>
    </div>
  );
};

export default RunnerDatabase;