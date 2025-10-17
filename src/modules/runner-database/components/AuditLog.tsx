import { Card, Alert, Table, Tag } from 'antd';

const mockAuditData = [
  { 
    id: 1, 
    timestamp: '2024-10-16 14:30:15', 
    action: 'Update Runner', 
    user: 'admin', 
    details: 'Updated John Smith birth year',
    status: 'success'
  },
  { 
    id: 2, 
    timestamp: '2024-10-16 14:25:33', 
    action: 'Sync Database', 
    user: 'system', 
    details: 'Cloud sync completed',
    status: 'success'
  }
];

export default function AuditLog() {
  const columns = [
    { title: 'Timestamp', dataIndex: 'timestamp', key: 'timestamp' },
    { title: 'Action', dataIndex: 'action', key: 'action' },
    { title: 'User', dataIndex: 'user', key: 'user' },
    { title: 'Details', dataIndex: 'details', key: 'details' },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'success' ? 'green' : 'red'}>
          {status.toUpperCase()}
        </Tag>
      ),
    },
  ];

  return (
    <div>
      <Alert
        message="Audit Log"
        description="Track all database changes and system operations."
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Card title="Recent Activity">
        <Table 
          dataSource={mockAuditData}
          columns={columns}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  );
}