import { useState } from 'react';
import { Card, Button, Space, Alert, Typography, message, Modal, Divider, Progress } from 'antd';
import { 
  ArrowLeftOutlined, 
  SwapOutlined, 
  DownloadOutlined,
  FileTextOutlined,
  DatabaseOutlined,
  CheckCircleOutlined,
  WarningOutlined
} from '@ant-design/icons';
import { sqlRunnerDatabaseConverter } from '../services/sqlRunnerDatabaseConverter';
import { iofRunnerDatabaseService } from '../services/iofRunnerDatabaseService';
import { localRunnerService } from '../services/localRunnerService';

const { Title, Paragraph, Text } = Typography;

interface ToolsProps {
  onBack: () => void;
}

export default function Tools({ onBack }: ToolsProps) {
  const [converting, setConverting] = useState(false);
  const [convertedFile, setConvertedFile] = useState<{ iofXml: string; filename: string; totalRunners: number } | null>(null);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset file input
    event.target.value = '';
    
    setConverting(true);
    setConvertedFile(null);
    setErrors([]);

    try {
      message.loading('Converting SQL runner database to IOF XML...', 0);

      const result = await sqlRunnerDatabaseConverter.convertToIOFXml(file);
      
      message.destroy();

      if (result.success && result.iofXml) {
        message.success(result.message);
        setConvertedFile({
          iofXml: result.iofXml,
          filename: file.name,
          totalRunners: result.totalRunners || 0
        });
        
        if (result.errors && result.errors.length > 0) {
          setErrors(result.errors);
        }
      } else {
        message.error(result.message);
      }

    } catch (error) {
      message.destroy();
      console.error('Conversion error:', error);
      message.error(`Failed to convert file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setConverting(false);
    }
  };

  const handleDownload = () => {
    if (!convertedFile) return;
    
    sqlRunnerDatabaseConverter.downloadIOFXml(
      convertedFile.iofXml,
      convertedFile.filename
    );
    
    message.success('IOF XML file downloaded successfully!');
  };

  const handleImportToDatabase = async () => {
    if (!convertedFile) return;

    setImportModalVisible(false);

    try {
      message.loading('Importing runners to database...', 0);

      // Create a Blob and File from the IOF XML string
      const blob = new Blob([convertedFile.iofXml], { type: 'text/xml' });
      const file = new File([blob], `${convertedFile.filename}_converted.xml`, { type: 'text/xml' });

      // Import using the IOF Runner Database Service
      const result = await iofRunnerDatabaseService.loadFromIOFXML(file);

      message.destroy();

      if (result.success) {
        // Also sync to the Local Runner Service (used by entry system)
        console.log('[Tools] Syncing runners to Local Runner Service...');
        const iofRunners = iofRunnerDatabaseService.getAllRunners();
        
        // Clear existing local runners and add all IOF runners
        localRunnerService.clearAllRunners();
        
        let importedCount = 0;
        iofRunners.forEach(runner => {
          localRunnerService.addRunner({
            name: runner.name,
            club: runner.club,
            birthYear: runner.birthYear,
            sex: runner.sex,
            cardNumber: runner.cardNumber,
            nationality: runner.nationality || '',
            phone: '',
            email: ''
          });
          importedCount++;
        });
        
        console.log(`[Tools] Synced ${importedCount} runners to Local Runner Service`);
        
        message.success(`${result.message} - Database now has ${importedCount} runners!`);
        
        // Trigger update event for other components
        window.dispatchEvent(new Event('localRunnerDatabaseUpdate'));
      } else {
        message.error(result.message);
      }

    } catch (error) {
      message.destroy();
      console.error('Import error:', error);
      message.error(`Failed to import: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <Button 
              icon={<ArrowLeftOutlined />} 
              onClick={onBack}
              style={{ marginBottom: '16px' }}
            >
              Back to Dashboard
            </Button>
            <Title level={2} style={{ margin: 0 }}>
              Tools & Utilities
            </Title>
          </div>
        </div>

        <Alert
          message="Database Conversion Tools"
          description="Convert external database formats to IOF XML 3.0 format compatible with the MeOS Entry Build system."
          type="info"
          showIcon
        />

        {/* SQL Runner Database Converter */}
        <Card 
          title={
            <Space>
              <DatabaseOutlined style={{ fontSize: '20px', color: '#1890ff' }} />
              <span>SQL Runner Database Converter</span>
            </Space>
          }
        >
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <div>
              <Paragraph>
                <strong>Convert DVOA SQL Runner Database to IOF XML Format</strong>
              </Paragraph>
              <Paragraph>
                This tool converts runner database exports from the DVOA SQL database (XML format) 
                into IOF XML 3.0 format that can be imported into the MeOS Entry Build Runner Database.
              </Paragraph>
              
              <ul style={{ marginLeft: '20px', color: '#666' }}>
                <li>Supports SQL database XML exports with DATA_RECORD elements</li>
                <li>Converts runner information (name, birth year, club, gender)</li>
                <li>Includes both members and non-members</li>
                <li>Automatically cleans and formats data for IOF XML 3.0 standard</li>
              </ul>
            </div>

            <Divider />

            {/* File Selection */}
            <div>
              <input
                type="file"
                id="sqlFileInput"
                accept=".xml,.sql"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
                disabled={converting}
              />
              <Button
                type="primary"
                icon={<SwapOutlined />}
                size="large"
                loading={converting}
                onClick={() => document.getElementById('sqlFileInput')?.click()}
              >
                {converting ? 'Converting...' : 'Select SQL Database File to Convert'}
              </Button>
              <div style={{ marginTop: '8px' }}>
                <Text type="secondary">
                  Supported formats: .xml (SQL export with DATA_RECORD elements)
                </Text>
              </div>
            </div>

            {/* Conversion Results */}
            {convertedFile && (
              <>
                <Divider />
                <Alert
                  message="Conversion Successful!"
                  description={
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <div>
                        <CheckCircleOutlined style={{ color: '#52c41a', marginRight: '8px' }} />
                        Successfully converted <strong>{convertedFile.totalRunners} runners</strong> to IOF XML 3.0 format
                      </div>
                      <div style={{ marginTop: '8px' }}>
                        <Text type="secondary">Source file: {convertedFile.filename}</Text>
                      </div>
                    </Space>
                  }
                  type="success"
                  showIcon
                />

                {/* Show errors if any */}
                {errors.length > 0 && (
                  <Alert
                    message={`${errors.length} Record(s) Skipped`}
                    description={
                      <div>
                        <Paragraph>
                          Some records could not be converted (usually due to missing names):
                        </Paragraph>
                        <div style={{ maxHeight: '150px', overflowY: 'auto', fontSize: '12px' }}>
                          {errors.slice(0, 10).map((error, index) => (
                            <div key={index} style={{ color: '#666' }}>• {error}</div>
                          ))}
                          {errors.length > 10 && (
                            <div style={{ color: '#999', marginTop: '4px' }}>
                              ... and {errors.length - 10} more
                            </div>
                          )}
                        </div>
                      </div>
                    }
                    type="warning"
                    showIcon
                    icon={<WarningOutlined />}
                    style={{ marginTop: '16px' }}
                  />
                )}

                <Space size="middle">
                  <Button
                    type="primary"
                    icon={<DownloadOutlined />}
                    size="large"
                    onClick={handleDownload}
                  >
                    Download IOF XML File
                  </Button>
                  <Button
                    type="default"
                    icon={<DatabaseOutlined />}
                    size="large"
                    onClick={() => setImportModalVisible(true)}
                    style={{ backgroundColor: '#52c41a', color: 'white', borderColor: '#52c41a' }}
                  >
                    Import to Runner Database
                  </Button>
                </Space>

                <div style={{ marginTop: '12px' }}>
                  <Paragraph type="secondary" style={{ fontSize: '13px', marginBottom: 0 }}>
                    💡 <strong>Tip:</strong> You can download the IOF XML file for backup or import it directly into the Runner Database.
                  </Paragraph>
                </div>
              </>
            )}
          </Space>
        </Card>

        {/* Future Tools Placeholder */}
        <Card 
          title="Additional Tools (Coming Soon)"
          style={{ opacity: 0.7 }}
        >
          <Space direction="vertical">
            <Text type="secondary">• Database Backup & Restore</Text>
            <Text type="secondary">• Data Migration Utilities</Text>
            <Text type="secondary">• Database Statistics & Reports</Text>
          </Space>
        </Card>
      </Space>

      {/* Import Confirmation Modal */}
      <Modal
        title={
          <Space>
            <DatabaseOutlined />
            <span>Import to Runner Database</span>
          </Space>
        }
        open={importModalVisible}
        onOk={handleImportToDatabase}
        onCancel={() => setImportModalVisible(false)}
        okText="Import Now"
        okButtonProps={{ type: 'primary' }}
        width={500}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Paragraph>
            Import <strong>{convertedFile?.totalRunners} runners</strong> into the Runner Database?
          </Paragraph>
          
          <Alert
            message="This will merge the converted runners with your existing database"
            description={
              <ul style={{ marginBottom: 0, paddingLeft: '20px' }}>
                <li>New runners will be added</li>
                <li>Existing runners will be updated with latest data</li>
                <li>No existing runners will be deleted</li>
              </ul>
            }
            type="info"
            showIcon
          />

          <Paragraph type="secondary" style={{ fontSize: '13px', marginBottom: 0 }}>
            After importing, you can use the Runner Database module to search, manage, and use these runners for event entries.
          </Paragraph>
        </Space>
      </Modal>
    </div>
  );
}
