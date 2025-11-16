import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Alert, Typography, Radio, Input, Tag, Modal, Tooltip, Statistic, Row, Col, App } from 'antd';
import { CheckCircleOutlined, WarningOutlined, EditOutlined, DatabaseOutlined, FileTextOutlined, SaveOutlined, PlusOutlined, UserAddOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { RunnerValidation, ValidationResult, csvValidationService } from '../services/csvValidationService';
import { sqliteRunnerDB } from '../services/sqliteRunnerDatabaseService';

const { Title, Text } = Typography;

interface CSVReviewAndFixProps {
  validationResult: ValidationResult;
  onComplete: (validations: RunnerValidation[]) => void;
  onCancel: () => void;
}

const CSVReviewAndFix: React.FC<CSVReviewAndFixProps> = ({
  validationResult,
  onComplete,
  onCancel
}) => {
  const { message: messageApi } = App.useApp();
  const [validations, setValidations] = useState<RunnerValidation[]>(validationResult.validations);
  const [editingKey, setEditingKey] = useState<string>('');
  const [editForm, setEditForm] = useState<{
    firstName: string;
    lastName: string;
    yearOfBirth: string;
    club: string;
  }>({
    firstName: '',
    lastName: '',
    yearOfBirth: '',
    club: ''
  });

  // Filter to show only runners with discrepancies or no DB match
  const [showOnlyIssues, setShowOnlyIssues] = useState(true);
  const [addedToDb, setAddedToDb] = useState<Set<number>>(new Set());
  const [fixedRows, setFixedRows] = useState<Set<number>>(new Set());
  
  // Create filtered validations with original indices preserved
  const filteredValidations = showOnlyIssues
    ? validations
        .map((v, idx) => ({ validation: v, originalIndex: idx }))
        .filter(({ validation: v, originalIndex: idx }) => {
          // Exclude if already added to DB or manually fixed
          if (addedToDb.has(idx) || fixedRows.has(idx)) return false;
          // Show if not in DB or has discrepancies
          return !v.dbRunner || 
            v.discrepancies.name || 
            v.discrepancies.yearOfBirth || 
            v.discrepancies.club;
        })
    : validations.map((v, idx) => ({ validation: v, originalIndex: idx }));

  const handleSourceSelect = (index: number, source: 'xml' | 'db') => {
    const updated = [...validations];
    csvValidationService.applyCorrection(updated[index], source);
    setValidations(updated);
    
    // Mark this row as fixed
    setFixedRows(prev => new Set(prev).add(index));
  };

  const handleEdit = (index: number) => {
    const validation = validations[index];
    const finalData = csvValidationService.getFinalData(validation);
    
    setEditingKey(`${index}`);
    setEditForm({
      firstName: finalData.firstName,
      lastName: finalData.lastName,
      yearOfBirth: finalData.yearOfBirth?.toString() || '',
      club: finalData.club || ''
    });
  };

  const handleSaveEdit = (index: number) => {
    const updated = [...validations];
    csvValidationService.applyCorrection(updated[index], 'custom', {
      firstName: editForm.firstName,
      lastName: editForm.lastName,
      yearOfBirth: editForm.yearOfBirth ? parseInt(editForm.yearOfBirth) : undefined,
      club: editForm.club || undefined
    });
    setValidations(updated);
    setEditingKey('');
    
    // Mark this row as fixed
    setFixedRows(prev => new Set(prev).add(index));
  };

  const handleCancelEdit = () => {
    setEditingKey('');
  };

  const handleAcceptAll = (source: 'xml' | 'db') => {
    const newFixedRows = new Set(fixedRows);
    const updated = validations.map((v, idx) => {
      if (!v.correctedData && (v.dbRunner || source === 'xml')) {
        csvValidationService.applyCorrection(v, source);
        // Mark rows that had discrepancies as fixed
        if (v.discrepancies.name || v.discrepancies.yearOfBirth || v.discrepancies.club) {
          newFixedRows.add(idx);
        }
      }
      return v;
    });
    setValidations(updated);
    setFixedRows(newFixedRows);
  };

  const handleAddToDatabase = async (index: number) => {
    const validation = validations[index];
    const finalData = csvValidationService.getFinalData(validation);
    
    try {
      // Generate a unique ID for the runner
      const runnerId = `${finalData.lastName}_${finalData.firstName}_${finalData.yearOfBirth || 'unknown'}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      
      sqliteRunnerDB.upsertRunner({
        id: runnerId,
        first_name: finalData.firstName,
        last_name: finalData.lastName,
        birth_year: finalData.yearOfBirth,
        club: finalData.club,
        nationality: 'USA'
      });
      
      messageApi.success(`Added ${finalData.firstName} ${finalData.lastName} to database`);
      
      // Mark as added and apply correction from XML (since we just added it)
      const updated = [...validations];
      csvValidationService.applyCorrection(updated[index], 'xml');
      setValidations(updated);
      
      // Track that this runner was added
      setAddedToDb(prev => new Set(prev).add(index));
    } catch (error) {
      console.error('[CSVReview] Failed to add runner to database:', error);
      messageApi.error(`Failed to add runner to database: ${error}`);
    }
  };
  
  const handleAddAllNotInDb = async () => {
    const notInDb = validations
      .map((v, idx) => ({ validation: v, index: idx }))
      .filter(({ validation }) => !validation.dbRunner);
    
    if (notInDb.length === 0) {
      messageApi.info('All runners are already in the database');
      return;
    }
    
    try {
      let addedCount = 0;
      const newAddedSet = new Set(addedToDb);
      
      for (const { validation, index } of notInDb) {
        const finalData = csvValidationService.getFinalData(validation);
        const runnerId = `${finalData.lastName}_${finalData.firstName}_${finalData.yearOfBirth || 'unknown'}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        
        sqliteRunnerDB.upsertRunner({
          id: runnerId,
          first_name: finalData.firstName,
          last_name: finalData.lastName,
          birth_year: finalData.yearOfBirth,
          club: finalData.club,
          nationality: 'USA'
        }, true); // Skip individual saves for batch operation
        
        // Apply correction from XML
        csvValidationService.applyCorrection(validation, 'xml');
        newAddedSet.add(index);
        addedCount++;
      }
      
      // Save once at the end
      sqliteRunnerDB.save();
      
      setAddedToDb(newAddedSet);
      messageApi.success(`Added ${addedCount} runners to database`);
    } catch (error) {
      console.error('[CSVReview] Failed to add runners to database:', error);
      messageApi.error(`Failed to add runners: ${error}`);
    }
  };

  const handleComplete = () => {
    // Apply XML data as default for any uncorrected entries
    const finalValidations = validations.map(v => {
      if (!v.correctedData) {
        csvValidationService.applyCorrection(v, 'xml');
      }
      return v;
    });
    onComplete(finalValidations);
  };

  const columns: ColumnsType<{ validation: RunnerValidation; originalIndex: number }> = [
    {
      title: 'Name',
      key: 'name',
      width: 180,
      fixed: 'left',
      render: (_, { validation: record, originalIndex }) => {
        const isEditing = editingKey === `${originalIndex}`;
        const finalData = csvValidationService.getFinalData(record);
        const hasNameIssue = record.discrepancies.name || !record.dbRunner;
        
        if (isEditing) {
          return (
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Input
                placeholder="First Name"
                value={editForm.firstName}
                onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                size="small"
              />
              <Input
                placeholder="Last Name"
                value={editForm.lastName}
                onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                size="small"
              />
            </Space>
          );
        }
        
        return (
          <Space direction="vertical" size={0}>
            <Text strong style={{ color: hasNameIssue ? '#ff4d4f' : undefined }}>
              {finalData.firstName} {finalData.lastName}
            </Text>
            {record.correctedData && (
              <Tag color="blue" style={{ fontSize: '10px' }}>Corrected</Tag>
            )}
          </Space>
        );
      }
    },
    {
      title: 'Year of Birth',
      key: 'yob',
      width: 110,
      render: (_, { validation: record, originalIndex }) => {
        const isEditing = editingKey === `${originalIndex}`;
        const finalData = csvValidationService.getFinalData(record);
        const hasYobIssue = record.discrepancies.yearOfBirth;
        
        if (isEditing) {
          return (
            <Input
              placeholder="YYYY"
              value={editForm.yearOfBirth}
              onChange={(e) => setEditForm({ ...editForm, yearOfBirth: e.target.value })}
              size="small"
            />
          );
        }
        
        return (
          <Text style={{ color: hasYobIssue ? '#ff4d4f' : undefined }}>
            {finalData.yearOfBirth || <Text type="secondary">Not set</Text>}
          </Text>
        );
      }
    },
    {
      title: 'Club',
      key: 'club',
      width: 120,
      render: (_, { validation: record, originalIndex }) => {
        const isEditing = editingKey === `${originalIndex}`;
        const finalData = csvValidationService.getFinalData(record);
        const hasClubIssue = record.discrepancies.club;
        
        if (isEditing) {
          return (
            <Input
              placeholder="Club"
              value={editForm.club}
              onChange={(e) => setEditForm({ ...editForm, club: e.target.value })}
              size="small"
            />
          );
        }
        
        return (
          <Text style={{ color: hasClubIssue ? '#ff4d4f' : undefined }}>
            {finalData.club || <Text type="secondary">Not set</Text>}
          </Text>
        );
      }
    },
    {
      title: 'Class',
      key: 'class',
      width: 100,
      render: (_, { validation: record }) => record.className
    },
    {
      title: 'Source',
      key: 'source',
      width: 220,
      render: (_, { validation: record, originalIndex }) => {
        const isEditing = editingKey === `${originalIndex}`;
        const wasAddedToDb = addedToDb.has(originalIndex);
        
        if (isEditing) {
          return (
            <Space>
              <Button size="small" type="primary" icon={<SaveOutlined />} onClick={() => handleSaveEdit(originalIndex)}>
                Save
              </Button>
              <Button size="small" onClick={handleCancelEdit}>
                Cancel
              </Button>
            </Space>
          );
        }
        
        if (!record.dbRunner && !wasAddedToDb) {
          return (
            <Space>
              <Tag color="orange">No DB Match</Tag>
              <Button 
                size="small" 
                icon={<UserAddOutlined />} 
                onClick={() => handleAddToDatabase(originalIndex)}
                type="primary"
              >
                Add to DB
              </Button>
              <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(originalIndex)} />
            </Space>
          );
        }
        
        if (wasAddedToDb) {
          return (
            <Space>
              <Tag color="green" icon={<CheckCircleOutlined />}>Added to DB</Tag>
              <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(originalIndex)} />
            </Space>
          );
        }
        
        const hasDiscrepancies = record.discrepancies.name || record.discrepancies.yearOfBirth || record.discrepancies.club;
        
        if (!hasDiscrepancies) {
          return <Tag color="green" icon={<CheckCircleOutlined />}>Matched</Tag>;
        }
        
        return (
          <Space>
            <Radio.Group
              size="small"
              value={record.correctedData ? 'custom' : undefined}
              onChange={(e) => handleSourceSelect(originalIndex, e.target.value)}
            >
              <Tooltip title="Use results data">
                <Radio.Button value="xml">
                  <FileTextOutlined /> Results
                </Radio.Button>
              </Tooltip>
              <Tooltip title="Use database data">
                <Radio.Button value="db">
                  <DatabaseOutlined /> DB
                </Radio.Button>
              </Tooltip>
            </Radio.Group>
            <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(originalIndex)} />
          </Space>
        );
      }
    },
    {
      title: 'Differences (Runner DB → XML)',
      key: 'issues',
      width: 350,
      render: (_, { validation: record, originalIndex }) => {
        if (!record.dbRunner && !addedToDb.has(originalIndex)) {
          return <Tag color="warning">Not in database</Tag>;
        }
        
        if (addedToDb.has(originalIndex)) {
          return <Tag color="green" icon={<CheckCircleOutlined />}>Runner added to database</Tag>;
        }
        
        const issues = [];
        
        // Name differences
        if (record.discrepancies.name && record.dbRunner) {
          const xmlName = `${record.xmlRunner.firstName} ${record.xmlRunner.lastName}`;
          const dbName = `${record.dbRunner.first_name} ${record.dbRunner.last_name}`;
          issues.push(
            <Tag key="name" color="red">
              Name: {dbName} ⇄ {xmlName}
            </Tag>
          );
        }
        
        // Year of birth differences
        if (record.discrepancies.yearOfBirth && record.dbRunner) {
          const xmlYob = record.xmlRunner.yearOfBirth || '—';
          const dbYob = record.dbRunner.birth_year || '—';
          issues.push(
            <Tag key="yob" color="orange">
              YOB: {dbYob} ⇄ {xmlYob}
            </Tag>
          );
        }
        
        // Club differences
        if (record.discrepancies.club && record.dbRunner) {
          const xmlClub = record.xmlRunner.club || '—';
          const dbClub = record.dbRunner.club || '—';
          issues.push(
            <Tag key="club" color="orange">
              Club: {dbClub} ⇄ {xmlClub}
            </Tag>
          );
        }
        
        return issues.length > 0 ? (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            {issues}
          </Space>
        ) : (
          <Tag color="green">OK</Tag>
        );
      }
    }
  ];

  const pendingCount = validations.filter((v, idx) => {
    // Exclude if already added to DB or fixed
    if (addedToDb.has(idx) || fixedRows.has(idx)) return false;
    // Count if has no corrected data and has issues
    return !v.correctedData && (
      !v.dbRunner || v.discrepancies.name || v.discrepancies.yearOfBirth || v.discrepancies.club
    );
  }).length;

  return (
    <div style={{ padding: '24px' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Header */}
        <div>
          <Title level={3}>
            <WarningOutlined style={{ color: '#faad14' }} /> Review Runner Data
          </Title>
          <Text type="secondary">
            Compare results against database and resolve discrepancies before generating CSV
          </Text>
        </div>

        {/* Stats */}
        <Row gutter={16}>
          <Col span={6}>
            <Statistic 
              title="Total Runners" 
              value={validationResult.totalRunners} 
            />
          </Col>
          <Col span={6}>
            <Statistic 
              title="Matched in DB" 
              value={validationResult.matchedInDb} 
              valueStyle={{ color: '#3f8600' }}
            />
          </Col>
          <Col span={6}>
            <Statistic 
              title="Issues Found" 
              value={validationResult.nameDiscrepancies + validationResult.yobDiscrepancies + validationResult.clubDiscrepancies}
              valueStyle={{ color: '#cf1322' }}
            />
          </Col>
          <Col span={6}>
            <Statistic 
              title="Pending Review" 
              value={pendingCount}
              valueStyle={{ color: pendingCount > 0 ? '#faad14' : '#3f8600' }}
            />
          </Col>
        </Row>

        {/* Info Alert */}
        <Alert
          message="How to Review"
          description={
            <ul style={{ marginBottom: 0, paddingLeft: '20px' }}>
              <li>Runners with discrepancies are highlighted in red</li>
              <li>Select "Results" to use data from the XML file, or "DB" to use database values</li>
              <li>Click "Edit" to manually enter correct values</li>
              <li>Use bulk actions to apply all results or database values at once</li>
            </ul>
          }
          type="info"
          showIcon
        />

        {/* Bulk Actions */}
        <Space wrap>
          <Button 
            icon={<PlusOutlined />}
            onClick={handleAddAllNotInDb}
            type="primary"
          >
            Add All Not in DB
          </Button>
          <Button 
            icon={<FileTextOutlined />}
            onClick={() => handleAcceptAll('xml')}
          >
            Accept All from Results
          </Button>
          <Button 
            icon={<DatabaseOutlined />}
            onClick={() => handleAcceptAll('db')}
          >
            Accept All from Database
          </Button>
          <Button
            type={showOnlyIssues ? 'primary' : 'default'}
            onClick={() => setShowOnlyIssues(!showOnlyIssues)}
          >
            {showOnlyIssues ? 'Show Only Issues' : 'Show All Runners'}
          </Button>
        </Space>

        {/* Table */}
        <Table
          columns={columns}
          dataSource={filteredValidations}
          rowKey={(item) => `${item.originalIndex}`}
          pagination={false}
          size="small"
          scroll={{ x: 1300, y: 500 }}
        />

        {/* Actions */}
        <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
          <Button size="large" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="primary"
            size="large"
            icon={<CheckCircleOutlined />}
            onClick={handleComplete}
            disabled={pendingCount > 0}
          >
            {pendingCount > 0 ? `Review ${pendingCount} More` : 'Generate CSV'}
          </Button>
        </Space>
      </Space>
    </div>
  );
};

export default CSVReviewAndFix;
