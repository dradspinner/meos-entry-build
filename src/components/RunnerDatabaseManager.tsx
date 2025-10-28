import React, { useState, useEffect } from 'react';
import { Modal, Table, Button, Space, Form, Input, Select, Row, Col, message, Card, Typography, Statistic } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SaveOutlined, DatabaseOutlined, SearchOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { sqliteRunnerDB, type RunnerRecord } from '../services/sqliteRunnerDatabaseService';

const { Option } = Select;
const { Text } = Typography;

interface RunnerDatabaseManagerProps {
  open: boolean;
  onClose: () => void;
}

const RunnerDatabaseManager: React.FC<RunnerDatabaseManagerProps> = ({ open, onClose }) => {
  const [runners, setRunners] = useState<RunnerRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<RunnerRecord | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [searchText, setSearchText] = useState<string>('');
  const [stats, setStats] = useState<{ totalRunners: number; totalClubs: number; lastUpdated: Date | null }>({
    totalRunners: 0,
    totalClubs: 0,
    lastUpdated: null
  });
  const [form] = Form.useForm();

  const refresh = async () => {
    setLoading(true);
    try {
      await sqliteRunnerDB.initialize();
      
      // Get all runners
      const allRunners = sqliteRunnerDB.getAllRunners();
      setRunners(allRunners);
      
      // Get stats
      const dbStats = sqliteRunnerDB.getStats();
      setStats(dbStats);
      
    } catch (error) {
      console.error('[RunnerDBManager] Failed to load runners:', error);
      message.error('Failed to load runner database');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      refresh();
    }
  }, [open]);

  const startEdit = (runner?: RunnerRecord) => {
    setEditing(runner || null);
    setShowEditForm(true);
    
    form.resetFields();
    
    if (runner) {
      setTimeout(() => {
        form.setFieldsValue({
          firstName: runner.first_name,
          lastName: runner.last_name,
          birthYear: runner.birth_year,
          club: runner.club,
          sex: runner.sex,
          phone: runner.phone,
          cardNumber: runner.card_number,
        });
      }, 50);
    }
  };

  const saveRunner = async () => {
    try {
      const vals = await form.validateFields();
      
      if (editing) {
        // Update existing runner
        sqliteRunnerDB.upsertRunner({
          id: editing.id,
          first_name: vals.firstName.trim(),
          last_name: vals.lastName.trim(),
          birth_year: vals.birthYear ? parseInt(vals.birthYear) : undefined,
          club: vals.club?.trim() || 'Unknown',
          sex: vals.sex,
          phone: vals.phone?.trim(),
          card_number: vals.cardNumber ? parseInt(vals.cardNumber) : undefined,
        });
        message.success('Runner updated');
      } else {
        // Create new runner with generated ID
        const firstName = vals.firstName.trim();
        const lastName = vals.lastName.trim();
        const birthYear = vals.birthYear ? parseInt(vals.birthYear) : undefined;
        
        const runnerId = `${lastName}_${firstName}_${birthYear || 'unknown'}`
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, '_');
        
        sqliteRunnerDB.upsertRunner({
          id: runnerId,
          first_name: firstName,
          last_name: lastName,
          birth_year: birthYear,
          club: vals.club?.trim() || 'Unknown',
          sex: vals.sex,
          phone: vals.phone?.trim(),
          card_number: vals.cardNumber ? parseInt(vals.cardNumber) : undefined,
          times_used: 0,
          last_used: new Date().toISOString(),
        });
        message.success('Runner added');
      }
      
      setEditing(null);
      setShowEditForm(false);
      refresh();
    } catch (error) {
      console.error('Save runner error:', error);
      message.error('Failed to save runner');
    }
  };

  const delRunner = (r: RunnerRecord) => {
    Modal.confirm({
      title: `Delete ${r.first_name} ${r.last_name}?`,
      content: 'This action cannot be undone.',
      okText: 'Delete',
      okType: 'danger',
      onOk: () => {
        try {
          sqliteRunnerDB.deleteRunner(r.id);
          message.success('Runner deleted');
          refresh();
        } catch (error) {
          message.error('Failed to delete runner');
        }
      }
    });
  };

  const handleSearch = (value: string) => {
    setSearchText(value);
    if (!value.trim()) {
      // If search is empty, show all runners
      refresh();
      return;
    }
    
    setLoading(true);
    try {
      // Use SQLite search
      const results = sqliteRunnerDB.searchRunners(value, 500);
      setRunners(results);
    } catch (error) {
      console.error('Search error:', error);
      message.error('Search failed');
    } finally {
      setLoading(false);
    }
  };

  const clearSearch = () => {
    setSearchText('');
    refresh();
  };

  const columns = [
    { 
      title: 'First Name', 
      dataIndex: 'first_name', 
      key: 'first_name', 
      width: 120, 
      sorter: (a: RunnerRecord, b: RunnerRecord) => (a.first_name || '').localeCompare(b.first_name || '') 
    },
    { 
      title: 'Last Name', 
      dataIndex: 'last_name', 
      key: 'last_name', 
      width: 120, 
      sorter: (a: RunnerRecord, b: RunnerRecord) => (a.last_name || '').localeCompare(b.last_name || '') 
    },
    { 
      title: 'Year', 
      dataIndex: 'birth_year', 
      key: 'birth_year', 
      width: 70,
      sorter: (a: RunnerRecord, b: RunnerRecord) => (a.birth_year || 0) - (b.birth_year || 0)
    },
    { 
      title: 'Club', 
      dataIndex: 'club', 
      key: 'club', 
      width: 100,
      sorter: (a: RunnerRecord, b: RunnerRecord) => (a.club || '').localeCompare(b.club || '')
    },
    { 
      title: 'Sex', 
      dataIndex: 'sex', 
      key: 'sex', 
      width: 50 
    },
    { 
      title: 'Card', 
      dataIndex: 'card_number', 
      key: 'card_number', 
      width: 80,
      sorter: (a: RunnerRecord, b: RunnerRecord) => (a.card_number || 0) - (b.card_number || 0)
    },
    { 
      title: 'Phone', 
      dataIndex: 'phone', 
      key: 'phone', 
      width: 120 
    },
    {
      title: 'Used',
      dataIndex: 'times_used',
      key: 'times_used',
      width: 60,
      render: (val: number) => val || 0,
      sorter: (a: RunnerRecord, b: RunnerRecord) => (a.times_used || 0) - (b.times_used || 0)
    },
    {
      title: 'Actions', 
      key: 'actions', 
      width: 90, 
      fixed: 'right' as const,
      render: (_: any, r: RunnerRecord) => (
        <Space size="small">
          <Button 
            type="text" 
            size="small" 
            icon={<EditOutlined />} 
            onClick={() => startEdit(r)}
            title="Edit"
          />
          <Button 
            type="text" 
            size="small" 
            danger 
            icon={<DeleteOutlined />} 
            onClick={() => delRunner(r)}
            title="Delete"
          />
        </Space>
      )
    }
  ];

  return (
    <Modal
      title={
        <Space>
          <DatabaseOutlined />
          SQLite Runner Database
          <Button size="small" icon={<PlusOutlined />} onClick={() => startEdit(undefined)}>
            Add Runner
          </Button>
        </Space>
      }
      open={open}
      onCancel={() => { 
        setEditing(null); 
        setShowEditForm(false); 
        setSearchText('');
        onClose(); 
      }}
      footer={null}
      width={1200}
      style={{ top: 20 }}
    >
      {/* Stats Cards */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={8}>
            <Statistic 
              title="Total Runners" 
              value={stats.totalRunners} 
              prefix={<DatabaseOutlined />}
            />
          </Col>
          <Col span={8}>
            <Statistic 
              title="Clubs" 
              value={stats.totalClubs}
            />
          </Col>
          <Col span={8}>
            <Statistic 
              title="Last Updated" 
              value={stats.lastUpdated ? stats.lastUpdated.toLocaleDateString() : 'Never'}
              valueStyle={{ fontSize: 16 }}
            />
          </Col>
        </Row>
      </Card>

      {/* Search Box */}
      <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
        <Input
          placeholder="Search by name, club, or card number..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onPressEnter={() => handleSearch(searchText)}
          prefix={<SearchOutlined />}
          suffix={
            searchText && (
              <CloseCircleOutlined 
                onClick={clearSearch}
                style={{ cursor: 'pointer', color: '#999' }}
              />
            )
          }
        />
        <Button type="primary" onClick={() => handleSearch(searchText)}>
          Search
        </Button>
      </Space.Compact>

      {searchText && (
        <div style={{ marginBottom: 8 }}>
          <Text type="secondary">
            Showing {runners.length} result{runners.length !== 1 ? 's' : ''} for "{searchText}"
          </Text>
          {' '}
          <Button type="link" size="small" onClick={clearSearch}>
            Clear search
          </Button>
        </div>
      )}

      <Table 
        rowKey={(r: RunnerRecord) => r.id} 
        dataSource={runners} 
        columns={columns} 
        size="small" 
        loading={loading}
        scroll={{ y: 400 }}
        pagination={{ 
          pageSize: 50, 
          showSizeChanger: true,
          showTotal: (total) => `Total ${total} runners`,
          pageSizeOptions: ['50', '100', '200', '500']
        }} 
      />
      
      {/* Edit/Add Runner Modal */}
      <Modal
        title={editing ? `Edit Runner: ${editing.first_name} ${editing.last_name}` : 'Add New Runner'}
        open={showEditForm}
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
              <Form.Item name="firstName" label="First Name" rules={[{ required: true, message: 'Required' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="lastName" label="Last Name" rules={[{ required: true, message: 'Required' }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="birthYear" label="Year Born">
                <Input type="number" placeholder="YYYY" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="sex" label="Sex">
                <Select allowClear placeholder="Select">
                  <Option value="M">M</Option>
                  <Option value="F">F</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="cardNumber" label="SI Card">
                <Input type="number" placeholder="Card #" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="club" label="Club">
                <Input placeholder="e.g., DVOA" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="phone" label="Phone">
                <Input placeholder="(123) 456-7890" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </Modal>
  );
};

export default RunnerDatabaseManager;
