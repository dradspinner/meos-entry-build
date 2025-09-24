// Import Test Component
// Quick test utility to verify both OE12 and Jotform import formats

import React, { useState } from 'react';
import { Button, Card, Space, Typography, Alert, Table, Tag } from 'antd';
import { FileTextOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { localEntryService, type LocalEntry } from '../services/localEntryService';

const { Title, Text } = Typography;

interface TestResult {
  format: string;
  success: boolean;
  entries: LocalEntry[];
  newCount: number;
  updatedCount: number;
  error?: string;
}

const ImportTest: React.FC = () => {
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [testing, setTesting] = useState(false);

  // Test OE12 format with sample data
  const testOE12Import = async (): Promise<TestResult> => {
    const sampleOE12Data = [
      {
        "Entry ID": "1",
        "First name": "Test",
        "Surname": "Runner1", 
        "YB": "1990",
        "S": "M",
        "City": "DVOA",
        "Chipno1": "12345",
        "Short": "Orange",
        "Long": "Orange", 
        "Cl. no.": "4",
        "Start fee": "25"
      },
      {
        "Entry ID": "2", 
        "First name": "Test",
        "Surname": "Runner2",
        "YB": "1995",
        "S": "F", 
        "City": "HVOC",
        "Chipno1": "67890",
        "Short": "Green",
        "Long": "Green",
        "Cl. no.": "3", 
        "Start fee": "25"
      }
    ];

    try {
      const result = await localEntryService.importFromOE12(sampleOE12Data, 'test-oe12.csv');
      return {
        format: 'OE12 (EventReg)',
        success: true,
        entries: result.entries,
        newCount: result.newCount,
        updatedCount: result.updatedCount
      };
    } catch (error) {
      return {
        format: 'OE12 (EventReg)', 
        success: false,
        entries: [],
        newCount: 0,
        updatedCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  };

  // Test Jotform format with sample data
  const testJotformImport = async (): Promise<TestResult> => {
    const sampleJotformData = [
      {
        "Stno": "1",
        "Chip": "11111", 
        "Surname": "Test",
        "First name": "Runner3",
        "YB": "1988",
        "S": "M",
        "Cl.name": "DVOA",
        "Short": "Blue", 
        "Long": "Blue",
        "Cl. no.": "1",
        "Phone": "(555) 123-4567",
        "Start fee": "30"
      },
      {
        "Stno": "2",
        "Chip": "22222",
        "Surname": "Test", 
        "First name": "Runner4",
        "YB": "1992",
        "S": "F",
        "Cl.name": "HVOC",
        "Short": "Yellow",
        "Long": "Yellow", 
        "Cl. no.": "7",
        "Phone": "(555) 987-6543",
        "Start fee": "30"
      }
    ];

    try {
      const result = await localEntryService.importFromJotform(sampleJotformData, 'test-jotform.csv');
      return {
        format: 'Jotform/MeOS',
        success: true,
        entries: result.entries,
        newCount: result.newCount, 
        updatedCount: result.updatedCount
      };
    } catch (error) {
      return {
        format: 'Jotform/MeOS',
        success: false, 
        entries: [],
        newCount: 0,
        updatedCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  };

  // Run both import tests
  const runImportTests = async () => {
    setTesting(true);
    setTestResults([]);

    console.log('[Import Test] Starting import format tests...');

    try {
      // Test both formats
      const oe12Result = await testOE12Import();
      const jotformResult = await testJotformImport();

      setTestResults([oe12Result, jotformResult]);

      console.log('[Import Test] OE12 Result:', oe12Result);
      console.log('[Import Test] Jotform Result:', jotformResult);
    } catch (error) {
      console.error('[Import Test] Test execution failed:', error);
    } finally {
      setTesting(false);
    }
  };

  // Clear test data
  const clearTestData = () => {
    // Remove test entries (those with names starting with "Test")
    const allEntries = localEntryService.getAllEntries();
    const testEntries = allEntries.filter(entry => 
      entry.name.first.startsWith('Test') && entry.name.last.startsWith('Runner')
    );
    
    testEntries.forEach(entry => {
      localEntryService.deleteEntry(entry.id);
    });

    console.log(`[Import Test] Cleared ${testEntries.length} test entries`);
    setTestResults([]);
  };

  // Table columns for displaying test results
  const columns = [
    {
      title: 'Format',
      dataIndex: 'format',
      key: 'format',
    },
    {
      title: 'Status',
      key: 'status',
      render: (_: any, record: TestResult) => (
        <Tag 
          color={record.success ? 'green' : 'red'}
          icon={record.success ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
        >
          {record.success ? 'Success' : 'Failed'}
        </Tag>
      ),
    },
    {
      title: 'New Entries',
      dataIndex: 'newCount',
      key: 'newCount',
    },
    {
      title: 'Updated Entries', 
      dataIndex: 'updatedCount',
      key: 'updatedCount',
    },
    {
      title: 'Total Imported',
      key: 'total',
      render: (_: any, record: TestResult) => record.newCount + record.updatedCount,
    },
    {
      title: 'Error',
      dataIndex: 'error',
      key: 'error',
      render: (error: string) => error ? <Text type="danger">{error}</Text> : '-',
    },
  ];

  return (
    <Card style={{ margin: '24px' }}>
      <Title level={3}>
        <FileTextOutlined /> Import Format Test
      </Title>
      
      <Alert
        message="Import Format Verification"
        description="This test verifies that both OE12 (EventReg) and Jotform import formats are working correctly. It imports sample data for each format."
        type="info"
        showIcon
        style={{ marginBottom: '24px' }}
      />

      <Space style={{ marginBottom: '24px' }}>
        <Button 
          type="primary"
          loading={testing}
          onClick={runImportTests}
        >
          Run Import Tests
        </Button>
        <Button 
          onClick={clearTestData}
          disabled={testing}
        >
          Clear Test Data
        </Button>
      </Space>

      {testResults.length > 0 && (
        <>
          <Title level={4}>Test Results</Title>
          <Table
            columns={columns}
            dataSource={testResults}
            pagination={false}
            rowKey="format"
            size="small"
            style={{ marginBottom: '24px' }}
          />

          {/* Show detailed entry information */}
          {testResults.some(result => result.entries.length > 0) && (
            <Alert
              message="✅ Import Test Summary"
              description={
                <div>
                  <p><strong>Total test entries created:</strong> {testResults.reduce((sum, result) => sum + result.entries.length, 0)}</p>
                  <p><strong>Formats tested:</strong> {testResults.filter(r => r.success).map(r => r.format).join(', ')}</p>
                  <p>Check the browser console for detailed debug logs during import.</p>
                  <p style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                    💡 <strong>Tip:</strong> After testing, use "Clear Test Data" to remove test entries and keep your real data clean.
                  </p>
                </div>
              }
              type="success"
              showIcon
            />
          )}
        </>
      )}
    </Card>
  );
};

export default ImportTest;