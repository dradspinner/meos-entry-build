import { Card, Alert, Button, Space } from 'antd';
import { ImportOutlined, ExportOutlined } from '@ant-design/icons';

export default function DataImportExport() {
  return (
    <div>
      <Alert
        message="Data Import/Export"
        description="Import runner data from external sources or export for backup."
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Card title="Import/Export Operations">
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Card size="small" title="Import Data">
            <p>Import runner data from CSV files or other sources.</p>
            <Button type="primary" icon={<ImportOutlined />}>
              Import Runners
            </Button>
          </Card>

          <Card size="small" title="Export Data">
            <p>Export runner database for backup or external use.</p>
            <Button icon={<ExportOutlined />}>
              Export Database
            </Button>
          </Card>
        </Space>
      </Card>
    </div>
  );
}