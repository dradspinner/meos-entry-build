import { Card, Alert, Input, Button, Table, Space } from 'antd';
import { SearchOutlined, UserOutlined } from '@ant-design/icons';

interface RunnerSearchProps {
  onDataChange: (count: number) => void;
}

const mockRunners = [
  { id: 1, name: 'John Smith', club: 'Downtown OC', birthYear: 1985, lastRace: '2024-01-15' },
  { id: 2, name: 'Sarah Johnson', club: 'Valley Orienteers', birthYear: 1990, lastRace: '2024-02-20' },
];

export default function RunnerSearch({ onDataChange }: RunnerSearchProps) {
  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Club', dataIndex: 'club', key: 'club' },
    { title: 'Birth Year', dataIndex: 'birthYear', key: 'birthYear' },
    { title: 'Last Race', dataIndex: 'lastRace', key: 'lastRace' },
    {
      title: 'Actions',
      key: 'actions',
      render: () => (
        <Space>
          <Button size="small">Edit</Button>
          <Button size="small" type="primary">View History</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Alert
        message="Runner Database Search"
        description="Search and manage runner information in the DVOA database."
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Card title="Search Runners" style={{ marginBottom: 24 }}>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder="Search by name, club, or card number..."
            prefix={<SearchOutlined />}
          />
          <Button type="primary" icon={<SearchOutlined />}>
            Search
          </Button>
        </Space.Compact>
      </Card>

      <Card title="Search Results">
        <Table 
          dataSource={mockRunners}
          columns={columns}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  );
}