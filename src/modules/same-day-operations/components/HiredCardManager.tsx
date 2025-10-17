import { Card, Alert, Table, Button, Badge, Space } from 'antd';
import { CreditCardOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';

const mockCards = [
  { id: 1, cardNumber: '9999001', status: 'available', condition: 'good', assignedTo: null },
  { id: 2, cardNumber: '9999002', status: 'assigned', condition: 'good', assignedTo: 'John Smith' },
  { id: 3, cardNumber: '9999003', status: 'checked-out', condition: 'fair', assignedTo: 'Sarah Johnson' },
];

export default function HiredCardManager() {
  const columns = [
    {
      title: 'Card Number',
      dataIndex: 'cardNumber',
      key: 'cardNumber',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const color = status === 'available' ? 'green' : status === 'assigned' ? 'blue' : 'orange';
        return <Badge color={color} text={status.charAt(0).toUpperCase() + status.slice(1)} />;
      },
    },
    {
      title: 'Assigned To',
      dataIndex: 'assignedTo',
      key: 'assignedTo',
      render: (name: string) => name || '-',
    },
    {
      title: 'Condition',
      dataIndex: 'condition',
      key: 'condition',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (record: any) => (
        <Space>
          <Button size="small" icon={<CheckOutlined />}>Check Out</Button>
          <Button size="small" icon={<CloseOutlined />}>Return</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Alert
        message="Hired Card Management"
        description="Manage rental card inventory, assignments, and check-in/out process."
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Card title="Card Inventory" extra={<Badge count={25} />}>
        <Table 
          dataSource={mockCards}
          columns={columns}
          pagination={false}
          size="small"
        />
      </Card>
    </div>
  );
}