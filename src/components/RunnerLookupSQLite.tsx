// Fast Runner Lookup using SQLite
// Optimized for large databases with pagination and search

import React, { useState, useEffect } from 'react';
import { Modal, Input, Table, Button, Space, Typography, Tag, Form, Select, InputNumber, message, App } from 'antd';
import { SearchOutlined, UserOutlined, EditOutlined, SaveOutlined } from '@ant-design/icons';
import { sqliteRunnerDB, RunnerRecord } from '../services/sqliteRunnerDatabaseService';

const { Text } = Typography;

interface RunnerLookupSQLiteProps {
  open: boolean;
  onClose: () => void;
  onSelectRunner?: (runner: RunnerRecord) => void;
}

export const RunnerLookupSQLite: React.FC<RunnerLookupSQLiteProps> = ({ 
  open, 
  onClose, 
  onSelectRunner 
}) => {
  const { message: messageApi } = App.useApp();
  const [searchText, setSearchText] = useState('');
  const [runners, setRunners] = useState<RunnerRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [editingRunner, setEditingRunner] = useState<RunnerRecord | null>(null);
  const [form] = Form.useForm();

  // Initialize database on mount
  useEffect(() => {
    const init = async () => {
      try {
        await sqliteRunnerDB.initialize();
        setInitialized(true);
      } catch (error) {
        console.error('[RunnerLookup] Failed to initialize:', error);
      }
    };
    init();
  }, []);

  // Search with debounce
  useEffect(() => {
    if (!open) return;

    const timer = setTimeout(() => {
      performSearch();
    }, 300);

    return () => clearTimeout(timer);
  }, [searchText, open]);

  const performSearch = () => {
    if (!initialized || searchText.length < 2) {
      setRunners([]);
      return;
    }

    setLoading(true);
    try {
      const results = sqliteRunnerDB.searchRunners(searchText, 100);
      console.log(`[RunnerLookup] Found ${results.length} results for "${searchText}"`);
      setRunners(results);
    } catch (error) {
      console.error('[RunnerLookup] Search failed:', error);
      setRunners([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSearchText('');
    setRunners([]);
    setEditingRunner(null);
    form.resetFields();
    onClose();
  };

  const handleSelect = (runner: RunnerRecord) => {
    if (onSelectRunner) {
      onSelectRunner(runner);
    }
    handleClose();
  };

  const handleEdit = (runner: RunnerRecord) => {
    setEditingRunner(runner);
    form.setFieldsValue({
      first_name: runner.first_name,
      last_name: runner.last_name,
      birth_year: runner.birth_year,
      sex: runner.sex,
      club: runner.club,
      card_number: runner.card_number,
    });
  };

  const handleSave = async () => {
    if (!editingRunner) return;

    try {
      const values = await form.validateFields();
      
      sqliteRunnerDB.upsertRunner({
        id: editingRunner.id,
        first_name: values.first_name,
        last_name: values.last_name,
        birth_year: values.birth_year,
        sex: values.sex,
        club: values.club,
        card_number: values.card_number,
        nationality: editingRunner.nationality,
      });

      messageApi.success('Runner updated');
      setEditingRunner(null);
      form.resetFields();
      
      // Refresh search results
      performSearch();
    } catch (error) {
      console.error('[RunnerLookup] Save failed:', error);
      messageApi.error('Failed to save runner');
    }
  };

  const handleCancelEdit = () => {
    setEditingRunner(null);
    form.resetFields();
  };

  return (
    <>
    <Modal
      title={
        <Space>
          <UserOutlined />
          <span>Runner Lookup</span>
          <Tag color="green">SQLite</Tag>
        </Space>
      }
      open={open}
      onCancel={handleClose}
      footer={[
        <Button key="close" onClick={handleClose}>
          Close
        </Button>
      ]}
      width={900}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Input
          prefix={<SearchOutlined />}
          placeholder="Search by name..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          size="large"
          autoFocus
          allowClear
        />

        {!initialized && (
          <Text type="secondary">Initializing database...</Text>
        )}

        {initialized && searchText.length > 0 && searchText.length < 2 && (
          <Text type="secondary">Type at least 2 characters to search</Text>
        )}

        {searchText.length >= 2 && (
          <Table
            dataSource={runners}
            rowKey="id"
            loading={loading}
            pagination={{ 
              pageSize: 20,
              showSizeChanger: false,
              showTotal: (total) => `${total} results`
            }}
            size="small"
            columns={[
              {
                title: 'Name',
                key: 'name',
                render: (_, record) => (
                  <Text strong>
                    {record.first_name} {record.last_name}
                  </Text>
                ),
              },
              {
                title: 'Club',
                dataIndex: 'club',
                width: 150,
              },
              {
                title: 'YB',
                dataIndex: 'birth_year',
                width: 80,
                render: (v) => v || '-',
              },
              {
                title: 'Sex',
                dataIndex: 'sex',
                width: 60,
                render: (v) => v || '-',
              },
              {
                title: 'Card',
                dataIndex: 'card_number',
                width: 100,
                render: (v) => v || '-',
              },
              {
                title: 'Used',
                dataIndex: 'times_used',
                width: 80,
                render: (v) => v || 0,
              },
              {
                title: 'Action',
                width: 100,
                render: (_, record) => (
                  <Space>
                    <Button 
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => handleEdit(record)}
                    >
                      Edit
                    </Button>
                    {onSelectRunner && (
                      <Button 
                        type="primary" 
                        size="small"
                        onClick={() => handleSelect(record)}
                      >
                        Select
                      </Button>
                    )}
                  </Space>
                ),
              },
            ]}
          />
        )}
      </Space>
    </Modal>

    {/* Edit Modal */}
    <Modal
      title="Edit Runner"
      open={!!editingRunner}
      onCancel={handleCancelEdit}
      onOk={handleSave}
      okText="Save"
      width={600}
    >
      <Form form={form} layout="vertical">
        <Form.Item label="First Name" name="first_name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Last Name" name="last_name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Year of Birth" name="birth_year">
          <InputNumber style={{ width: '100%' }} min={1900} max={2020} />
        </Form.Item>
        <Form.Item label="Sex" name="sex">
          <Select>
            <Select.Option value="M">Male</Select.Option>
            <Select.Option value="F">Female</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="Club" name="club">
          <Input />
        </Form.Item>
        <Form.Item label="Card Number" name="card_number">
          <InputNumber style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
    </>
  );
};

export default RunnerLookupSQLite;
