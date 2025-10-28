// Database Cleanup Component (SQLite Version)
// Fast database management using SQL queries

import React, { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Table,
  Typography,
  Space,
  Modal,
  Tabs,
  Statistic,
  Row,
  Col,
  Alert,
  Input,
  Tag,
  Select,
  App,
  Badge,
  Collapse,
  Progress,
} from 'antd';
import {
  DeleteOutlined,
  MergeCellsOutlined,
  WarningOutlined,
  TeamOutlined,
  FileTextOutlined,
  DownloadOutlined,
  SearchOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  EyeOutlined,
  ArrowLeftOutlined,
  SyncOutlined,
  UploadOutlined,
  CloseCircleOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { sqliteRunnerDB, RunnerRecord, ClubRecord, DuplicateCandidate } from '../services/sqliteRunnerDatabaseService';
import { runnerDatabaseMigration } from '../services/runnerDatabaseMigration';

const { Title, Text, Paragraph } = Typography;
const { TabPane } = Tabs;
const { Panel } = Collapse;

interface DatabaseCleanupProps {
  onBack?: () => void;
}

export const DatabaseCleanupSQLite: React.FC<DatabaseCleanupProps> = ({ onBack }) => {
  const { message: messageApi } = App.useApp();
  
  // State
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [runners, setRunners] = useState<RunnerRecord[]>([]);
  const [clubs, setClubs] = useState<ClubRecord[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [dataQualityIssues, setDataQualityIssues] = useState<RunnerRecord[]>([]);
  const [clubMisspellings, setClubMisspellings] = useState<Array<{
    club1: string;
    club2: string;
    distance: number;
    count1: number;
    count2: number;
  }>>([]);
  const [selectedRunners, setSelectedRunners] = useState<Set<string>>(new Set());
  const [clubFilter, setClubFilter] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [activeTab, setActiveTab] = useState('duplicates');
  const [duplicateThreshold, setDuplicateThreshold] = useState(95);
  const [stats, setStats] = useState({ totalRunners: 0, totalClubs: 0, lastUpdated: null as Date | null });
  const [clubAliases, setClubAliases] = useState<Array<{ alias: string; clubName: string; clubId: number }>>([]);
  const [selectedClubs, setSelectedClubs] = useState<Set<number>>(new Set());
  const [editingRunner, setEditingRunner] = useState<RunnerRecord | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);

  // Initialize database and check for migration
  useEffect(() => {
    initializeDatabase();
  }, []);

  const initializeDatabase = async () => {
    setLoading(true);
    try {
      // Check if migration is needed
      const migrationStatus = runnerDatabaseMigration.getMigrationStatus();
      
      if (migrationStatus.needsMigration) {
        Modal.confirm({
          title: 'Migrate to SQLite Database?',
          content: (
            <div>
              <Paragraph>
                Found {migrationStatus.localStorageCount} runners in localStorage. 
                Would you like to migrate them to the faster SQLite database?
              </Paragraph>
              <Alert
                message="This is a one-time migration"
                description="Your data will be backed up automatically. This will greatly improve performance!"
                type="info"
                showIcon
              />
            </div>
          ),
          okText: 'Migrate Now',
          cancelText: 'Skip',
          onOk: async () => {
            const migrationResult = await runnerDatabaseMigration.migrateFromLocalStorage();
            if (migrationResult.success) {
              messageApi.success(`Migrated ${migrationResult.migratedCount} runners successfully!`);
              await loadAllData();
            } else {
              messageApi.error(`Migration failed: ${migrationResult.errors.join(', ')}`);
            }
          },
          onCancel: async () => {
            await sqliteRunnerDB.initialize();
            await loadAllData();
          }
        });
      } else {
        // Initialize SQLite
        await sqliteRunnerDB.initialize();
        await loadAllData();
      }

      setInitialized(true);
    } catch (error) {
      console.error('[DatabaseCleanup] Failed to initialize:', error);
      messageApi.error('Failed to initialize database');
    } finally {
      setLoading(false);
    }
  };

  const loadAllData = async () => {
    setLoading(true);
    try {
      // Load all data from SQLite (fast!)
      const [runnersData, clubsData, duplicatesData, qualityData, statsData, aliasData, misspellingsData] = await Promise.all([
        Promise.resolve(sqliteRunnerDB.getAllRunners()),
        Promise.resolve(sqliteRunnerDB.getAllClubs()),
        Promise.resolve(sqliteRunnerDB.findDuplicates(duplicateThreshold)),
        Promise.resolve(sqliteRunnerDB.getDataQualityIssues()),
        Promise.resolve(sqliteRunnerDB.getStats()),
        Promise.resolve(sqliteRunnerDB.getClubAliases()),
        Promise.resolve(sqliteRunnerDB.findClubMisspellings())
      ]);

      setRunners(runnersData);
      setClubs(clubsData);
      setDuplicates(duplicatesData);
      setDataQualityIssues(qualityData);
      setStats(statsData);
      setClubAliases(aliasData);
      setClubMisspellings(misspellingsData);

      messageApi.success(`Loaded ${runnersData.length} runners, found ${duplicatesData.length} potential duplicates`);
    } catch (error) {
      console.error('[DatabaseCleanup] Failed to load data:', error);
      messageApi.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Refresh duplicates with new threshold
  const refreshDuplicates = () => {
    setLoading(true);
    try {
      const duplicatesData = sqliteRunnerDB.findDuplicates(duplicateThreshold);
      setDuplicates(duplicatesData);
      messageApi.success(`Found ${duplicatesData.length} duplicate groups with ${duplicateThreshold}% threshold`);
    } catch (error) {
      console.error('[DatabaseCleanup] Failed to refresh duplicates:', error);
      messageApi.error('Failed to refresh duplicates');
    } finally {
      setLoading(false);
    }
  };

  // Ignore duplicate (mark as unique runners)
  const handleIgnore = (duplicate: DuplicateCandidate) => {
    try {
      sqliteRunnerDB.markDuplicateAsUnique(duplicate.runner_id_1, duplicate.runner_id_2);
      messageApi.success('Marked as unique runners - will not show as duplicate again');
      
      // Update local state without full reload
      setDuplicates(prev => prev.filter(d => 
        !(d.runner_id_1 === duplicate.runner_id_1 && d.runner_id_2 === duplicate.runner_id_2)
      ));
    } catch (error) {
      console.error('[DatabaseCleanup] Ignore failed:', error);
      messageApi.error('Failed to mark as unique');
    }
  };

  // Merge duplicate runners
  const handleMerge = (duplicate: DuplicateCandidate) => {
    const runner1 = sqliteRunnerDB.getRunnerById(duplicate.runner_id_1);
    const runner2 = sqliteRunnerDB.getRunnerById(duplicate.runner_id_2);

    if (!runner1 || !runner2) {
      messageApi.error('Failed to load runner details');
      return;
    }

    Modal.confirm({
      title: 'Merge Duplicate Runners?',
      content: (
        <div>
          <Paragraph>
            <strong>Runner 1:</strong> {runner1.first_name} {runner1.last_name} ({runner1.club})<br/>
            <strong>Runner 2:</strong> {runner2.first_name} {runner2.last_name} ({runner2.club})<br/>
          </Paragraph>
          <Paragraph>
            The system will keep the most complete record and delete the other.
          </Paragraph>
        </div>
      ),
      okText: 'Merge',
      okType: 'primary',
      onOk: () => {
        try {
          // Determine which runner is more complete
          const score1 = [runner1.birth_year, runner1.sex, runner1.card_number, runner1.phone, runner1.email].filter(Boolean).length;
          const score2 = [runner2.birth_year, runner2.sex, runner2.card_number, runner2.phone, runner2.email].filter(Boolean).length;

          const keepRunner = score1 >= score2 ? runner1 : runner2;
          const deleteRunner = score1 >= score2 ? runner2 : runner1;

          // Delete the less complete runner
          sqliteRunnerDB.deleteRunner(deleteRunner.id);

          messageApi.success(`Merged runners, kept ${keepRunner.first_name} ${keepRunner.last_name}`);
          
          // Update local state without full reload
          setDuplicates(prev => prev.filter(d => d.id !== duplicate.id));
          setRunners(prev => prev.filter(r => r.id !== deleteRunner.id));
          setStats(prev => ({ ...prev, totalRunners: prev.totalRunners - 1 }));
        } catch (error) {
          console.error('[DatabaseCleanup] Merge failed:', error);
          messageApi.error('Failed to merge runners');
        }
      }
    });
  };

  // Update runner field immediately (auto-save)
  const handleUpdateRunnerField = (runnerId: string, field: 'birth_year' | 'sex', value: number | 'M' | 'F') => {
    try {
      const runner = dataQualityIssues.find(r => r.id === runnerId);
      if (!runner) return;

      // Update runner with new value
      const updatedRunner = {
        ...runner,
        [field]: value,
      };
      
      sqliteRunnerDB.upsertRunner(updatedRunner);
      
      // Update local state
      setDataQualityIssues(prev => prev.map(r => r.id === runnerId ? updatedRunner : r));
      
      // Check if runner should be removed from quality issues list
      setTimeout(() => {
        const qualityData = sqliteRunnerDB.getDataQualityIssues();
        setDataQualityIssues(qualityData);
      }, 100);
    } catch (error) {
      console.error('[DatabaseCleanup] Update failed:', error);
      messageApi.error('Failed to update runner');
    }
  };

  // Delete single runner
  const handleDeleteSingle = (runnerId: string) => {
    try {
      sqliteRunnerDB.deleteRunner(runnerId);
      messageApi.success('Runner deleted');
      
      // Update local state without full reload
      setRunners(prev => prev.filter(r => r.id !== runnerId));
      setDuplicates(prev => prev.filter(d => d.runner_id_1 !== runnerId && d.runner_id_2 !== runnerId));
      setDataQualityIssues(prev => prev.filter(r => r.id !== runnerId));
      setStats(prev => ({ ...prev, totalRunners: prev.totalRunners - 1 }));
    } catch (error) {
      console.error('[DatabaseCleanup] Delete failed:', error);
      messageApi.error('Failed to delete runner');
    }
  };

  // Edit runner
  const handleEditRunner = (runner: RunnerRecord) => {
    setEditingRunner({...runner});
    setEditModalVisible(true);
  };

  // Save edited runner
  const handleSaveEdit = () => {
    if (!editingRunner) return;

    try {
      sqliteRunnerDB.upsertRunner(editingRunner);
      messageApi.success('Runner updated successfully');
      setEditModalVisible(false);
      setEditingRunner(null);
      
      // Update local state
      setRunners(prev => prev.map(r => r.id === editingRunner.id ? editingRunner : r));
      loadAllData();
    } catch (error) {
      console.error('[DatabaseCleanup] Update failed:', error);
      messageApi.error('Failed to update runner');
    }
  };

  // Bulk delete
  const handleBulkDelete = () => {
    if (selectedRunners.size === 0) {
      messageApi.warning('No runners selected');
      return;
    }

    Modal.confirm({
      title: 'Delete Selected Runners?',
      content: `This will permanently delete ${selectedRunners.size} runners from your database.`,
      okText: 'Delete',
      okType: 'danger',
      onOk: () => {
        try {
          const deletedCount = selectedRunners.size;
          selectedRunners.forEach(id => sqliteRunnerDB.deleteRunner(id));
          messageApi.success(`Deleted ${deletedCount} runners`);
          
          // Update local state without full reload
          setRunners(prev => prev.filter(r => !selectedRunners.has(r.id)));
          setDuplicates(prev => prev.filter(d => !selectedRunners.has(d.runner_id_1) && !selectedRunners.has(d.runner_id_2)));
          setDataQualityIssues(prev => prev.filter(r => !selectedRunners.has(r.id)));
          setStats(prev => ({ ...prev, totalRunners: prev.totalRunners - deletedCount }));
          setSelectedRunners(new Set());
        } catch (error) {
          console.error('[DatabaseCleanup] Bulk delete failed:', error);
          messageApi.error('Failed to delete runners');
        }
      }
    });
  };

  // Rename club
  const handleRenameClub = (clubId: number, oldName: string) => {
    Modal.confirm({
      title: 'Rename Club',
      content: (
        <div>
          <Paragraph>Current name: <strong>{oldName}</strong></Paragraph>
          <Input id="newClubName" placeholder="Enter new club name" />
        </div>
      ),
      onOk: () => {
        const newName = (document.getElementById('newClubName') as HTMLInputElement)?.value;
        if (!newName) {
          messageApi.error('Please enter a club name');
          return;
        }
        try {
          sqliteRunnerDB.renameClub(clubId, newName);
          messageApi.success(`Renamed club to ${newName}`);
          
          // Update local state
          setClubs(prev => prev.map(c => c.id === clubId ? { ...c, name: newName } : c));
          setRunners(prev => prev.map(r => r.club_id === clubId ? { ...r, club: newName } : r));
        } catch (error) {
          console.error('[DatabaseCleanup] Rename failed:', error);
          messageApi.error('Failed to rename club');
        }
      }
    });
  };

  // Merge clubs
  const handleMergeClubs = () => {
    if (selectedClubs.size !== 2) {
      messageApi.warning('Please select exactly 2 clubs to merge');
      return;
    }

    const [club1Id, club2Id] = Array.from(selectedClubs);
    const club1 = clubs.find(c => c.id === club1Id);
    const club2 = clubs.find(c => c.id === club2Id);

    if (!club1 || !club2) return;

    Modal.confirm({
      title: 'Merge Clubs',
      content: (
        <div>
          <Paragraph>Select which club name to keep:</Paragraph>
          <Select id="targetClub" style={{ width: '100%' }} placeholder="Keep this club">
            <Select.Option value={club1Id}>{club1.name} ({club1.runner_count} runners)</Select.Option>
            <Select.Option value={club2Id}>{club2.name} ({club2.runner_count} runners)</Select.Option>
          </Select>
        </div>
      ),
      onOk: () => {
        const targetClubId = parseInt((document.getElementById('targetClub') as HTMLSelectElement)?.value);
        const fromClubId = targetClubId === club1Id ? club2Id : club1Id;

        try {
          const targetClub = clubs.find(c => c.id === targetClubId);
          const fromClub = clubs.find(c => c.id === fromClubId);
          
          sqliteRunnerDB.mergeClubs(fromClubId, targetClubId);
          messageApi.success('Clubs merged successfully');
          
          // Update local state
          setClubs(prev => {
            const updated = prev.filter(c => c.id !== fromClubId);
            return updated.map(c => c.id === targetClubId 
              ? { ...c, runner_count: (c.runner_count || 0) + (fromClub?.runner_count || 0) }
              : c
            );
          });
          setRunners(prev => prev.map(r => r.club_id === fromClubId ? { ...r, club_id: targetClubId, club: targetClub?.name || r.club } : r));
          setSelectedClubs(new Set());
        } catch (error) {
          console.error('[DatabaseCleanup] Merge failed:', error);
          messageApi.error('Failed to merge clubs');
        }
      }
    });
  };

  // Add club alias
  const handleAddAlias = (clubName: string) => {
    Modal.confirm({
      title: 'Add Club Alias',
      content: (
        <div>
          <Paragraph>Add an alias/typo that should map to: <strong>{clubName}</strong></Paragraph>
          <Input id="aliasName" placeholder="e.g., DVO, D V O A, dvoa" />
        </div>
      ),
      onOk: () => {
        const alias = (document.getElementById('aliasName') as HTMLInputElement)?.value;
        if (!alias) {
          messageApi.error('Please enter an alias');
          return;
        }
        try {
          sqliteRunnerDB.addClubAlias(alias, clubName);
          messageApi.success(`Added alias: ${alias} → ${clubName}`);
          
          // Reload aliases only
          const aliasData = sqliteRunnerDB.getClubAliases();
          setClubAliases(aliasData);
        } catch (error) {
          console.error('[DatabaseCleanup] Add alias failed:', error);
          messageApi.error('Failed to add alias');
        }
      }
    });
  };

  // Import from XML
  const handleXMLImport = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xml';
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setLoading(true);
      try {
        const xmlContent = await file.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
        
        let imported = 0;
        
        // Check for result_runner format (custom DVOA format)
        const dataRecords = xmlDoc.getElementsByTagName('DATA_RECORD');
        if (dataRecords.length > 0) {
          const totalRecords = dataRecords.length;
          messageApi.loading(`Importing ${totalRecords} runners...`, 0);
          
          for (let i = 0; i < totalRecords; i++) {
            const record = dataRecords[i];
            
            const fname = record.getElementsByTagName('fname')[0]?.textContent?.trim();
            const lname = record.getElementsByTagName('lname')[0]?.textContent?.trim();
            
            if (!fname || !lname) continue;
            
            const sex = record.getElementsByTagName('sex')[0]?.textContent?.trim() as 'M' | 'F' | undefined;
            const yobText = record.getElementsByTagName('yob')[0]?.textContent?.trim();
            const birthYear = yobText ? parseInt(yobText.replace(/,/g, '')) : undefined;
            
            const clubName = record.getElementsByTagName('club_name')[0]?.textContent?.trim();
            const club = clubName || 'Unknown';
            
            const runnerId = `${lname}_${fname}_${birthYear || 'unknown'}`
              .toLowerCase()
              .replace(/[^a-z0-9_]/g, '_');
            
            // Skip save on each insert (batch mode)
            sqliteRunnerDB.upsertRunner({
              id: runnerId,
              first_name: fname,
              last_name: lname,
              birth_year: birthYear,
              sex: sex,
              club: club,
              nationality: 'USA'
            }, true);
            
            imported++;
            
            // Update progress every 500 records
            if (i % 500 === 0 && i > 0) {
              messageApi.loading(`Importing... ${i}/${totalRecords} (${Math.round(i/totalRecords*100)}%)`, 0);
              // Allow UI to update
              await new Promise(resolve => setTimeout(resolve, 0));
            }
          }
          
          // Save once at the end
          messageApi.loading('Saving database...', 0);
          sqliteRunnerDB.save();
          messageApi.destroy();
        } else {
          // Try IOF XML format (standard MeOS format)
          const competitors = xmlDoc.getElementsByTagName('Competitor');
          const totalRecords = competitors.length;
          
          if (totalRecords > 0) {
            messageApi.loading(`Importing ${totalRecords} runners...`, 0);
          }
          
          for (let i = 0; i < totalRecords; i++) {
            const competitor = competitors[i];
            const person = competitor.getElementsByTagName('Person')[0];
            if (!person) continue;
            
            const nameElement = person.getElementsByTagName('Name')[0];
            if (!nameElement) continue;
            
            const givenName = nameElement.getElementsByTagName('Given')[0]?.textContent?.trim();
            const familyName = nameElement.getElementsByTagName('Family')[0]?.textContent?.trim();
            
            if (!givenName || !familyName) continue;
            
            const sex = person.getAttribute('sex') as 'M' | 'F' | undefined;
            const birthDateElement = person.getElementsByTagName('BirthDate')[0];
            let birthYear;
            if (birthDateElement) {
              const birthDate = birthDateElement.textContent?.trim();
              if (birthDate) birthYear = parseInt(birthDate.split('-')[0]);
            }
            
            const controlCard = competitor.getElementsByTagName('ControlCard')[0];
            let cardNumber;
            if (controlCard) {
              const cardText = controlCard.textContent?.trim();
              if (cardText) cardNumber = parseInt(cardText);
            }
            
            const orgElement = competitor.getElementsByTagName('Organisation')[0];
            let club = 'Unknown';
            if (orgElement) {
              const orgName = orgElement.getElementsByTagName('Name')[0]?.textContent?.trim();
              if (orgName) {
                club = orgName;
              }
            }
            
            const runnerId = `${familyName}_${givenName}_${birthYear || 'unknown'}`
              .toLowerCase()
              .replace(/[^a-z0-9_]/g, '_');
            
            // Skip save on each insert (batch mode)
            sqliteRunnerDB.upsertRunner({
              id: runnerId,
              first_name: givenName,
              last_name: familyName,
              birth_year: birthYear,
              sex: sex,
              club: club,
              card_number: cardNumber,
              nationality: 'USA'
            }, true);
            
            imported++;
            
            // Update progress every 500 records
            if (i % 500 === 0 && i > 0) {
              messageApi.loading(`Importing... ${i}/${totalRecords} (${Math.round(i/totalRecords*100)}%)`, 0);
              // Allow UI to update
              await new Promise(resolve => setTimeout(resolve, 0));
            }
          }
          
          if (totalRecords > 0) {
            // Save once at the end
            messageApi.loading('Saving database...', 0);
            sqliteRunnerDB.save();
            messageApi.destroy();
          }
        }
        
        if (imported === 0) {
          messageApi.error('No runners found in XML file');
        } else {
          messageApi.success(`Imported ${imported} runners from ${file.name}`);
          await loadAllData();
        }
      } catch (error) {
        console.error('[DatabaseCleanup] XML import failed:', error);
        messageApi.error('Failed to import XML file');
      } finally {
        setLoading(false);
      }
    };
    input.click();
  };

  // Export database
  const handleExport = () => {
    try {
      const data = sqliteRunnerDB.exportDatabase();
      const blob = new Blob([data], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `runner_database_${new Date().toISOString().slice(0, 10).replace(/-/g, '_')}.db`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      messageApi.success('Database exported successfully');
    } catch (error) {
      console.error('[DatabaseCleanup] Export failed:', error);
      messageApi.error('Failed to export database');
    }
  };

  // Filter runners
  const filteredRunners = searchText
    ? sqliteRunnerDB.searchRunners(searchText, 100)
    : clubFilter === 'all'
      ? runners
      : sqliteRunnerDB.getRunnersByClub(clubFilter);

  // Render duplicate card
  const renderDuplicateCard = (duplicate: DuplicateCandidate) => {
    const runner1 = runners.find(r => r.id === duplicate.runner_id_1);
    const runner2 = runners.find(r => r.id === duplicate.runner_id_2);

    if (!runner1 || !runner2) return null;

    const confidenceColor = duplicate.similarity_score >= 95 ? 'red' : duplicate.similarity_score >= 85 ? 'orange' : 'gold';
    const confidenceText = duplicate.similarity_score >= 95 ? 'High' : duplicate.similarity_score >= 85 ? 'Medium' : 'Low';

    return (
      <Panel
        key={duplicate.id}
        header={
          <Space>
            <Tag color={confidenceColor}>{confidenceText} Confidence</Tag>
            <Text strong>{runner1.first_name} {runner1.last_name}</Text>
            <Text type="secondary">• {duplicate.similarity_score.toFixed(0)}% similar</Text>
          </Space>
        }
        extra={
          <Space onClick={(e) => e.stopPropagation()}>
            <Button 
              size="small" 
              icon={<CloseCircleOutlined />}
              onClick={() => handleIgnore(duplicate)}
            >
              Ignore
            </Button>
            <Button 
              size="small" 
              icon={<MergeCellsOutlined />} 
              type="primary"
              onClick={() => handleMerge(duplicate)}
            >
              Merge
            </Button>
          </Space>
        }
      >
        <Table
          dataSource={[runner1, runner2]}
          rowKey="id"
          size="small"
          pagination={false}
          columns={[
            { title: 'Name', render: (_, r: RunnerRecord) => <Text strong>{r.first_name} {r.last_name}</Text> },
            { title: 'Club', dataIndex: 'club' },
            { title: 'YB', dataIndex: 'birth_year', render: (v) => v || '-' },
            { title: 'Card', dataIndex: 'card_number', render: (v) => v || '-' },
            { title: 'Times Used', dataIndex: 'times_used', render: (v) => v || 0 },
            {
              title: 'Action',
              render: (_, r: RunnerRecord) => (
                <Button size="small" icon={<DeleteOutlined />} danger onClick={() => handleDeleteSingle(r.id)}>
                  Delete
                </Button>
              ),
            },
          ]}
        />
        <div style={{ marginTop: 8 }}>
          <Text type="secondary">Reason: {duplicate.match_reason}</Text>
        </div>
      </Panel>
    );
  };

  if (!initialized) {
    return (
      <Card>
        <Space direction="vertical" align="center" style={{ width: '100%', padding: '40px' }}>
          <SyncOutlined spin style={{ fontSize: 48, color: '#1890ff' }} />
          <Text>Initializing database...</Text>
        </Space>
      </Card>
    );
  }

  return (
    <div>
      {/* Edit Runner Modal */}
      <Modal
        title="Edit Runner"
        open={editModalVisible}
        onOk={handleSaveEdit}
        onCancel={() => {
          setEditModalVisible(false);
          setEditingRunner(null);
        }}
        width={600}
      >
        {editingRunner && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Row gutter={16}>
              <Col span={12}>
                <Text strong>First Name</Text>
                <Input
                  value={editingRunner.first_name}
                  onChange={(e) => setEditingRunner({
                    ...editingRunner,
                    first_name: e.target.value
                  })}
                  placeholder="First name"
                />
              </Col>
              <Col span={12}>
                <Text strong>Last Name</Text>
                <Input
                  value={editingRunner.last_name}
                  onChange={(e) => setEditingRunner({
                    ...editingRunner,
                    last_name: e.target.value
                  })}
                  placeholder="Last name"
                />
              </Col>
            </Row>
            
            <div>
              <Text strong>Club</Text>
              <Input
                value={editingRunner.club}
                onChange={(e) => setEditingRunner({ ...editingRunner, club: e.target.value })}
                placeholder="Club name"
              />
            </div>

            <Row gutter={16}>
              <Col span={12}>
                <Text strong>Birth Year</Text>
                <Input
                  type="number"
                  value={editingRunner.birth_year || ''}
                  onChange={(e) => setEditingRunner({ 
                    ...editingRunner, 
                    birth_year: e.target.value ? parseInt(e.target.value) : undefined 
                  })}
                  placeholder="YYYY"
                />
              </Col>
              <Col span={12}>
                <Text strong>Sex</Text>
                <Select
                  value={editingRunner.sex || undefined}
                  onChange={(value) => setEditingRunner({ ...editingRunner, sex: value })}
                  style={{ width: '100%' }}
                  placeholder="Select sex"
                  allowClear
                >
                  <Select.Option value="M">Male</Select.Option>
                  <Select.Option value="F">Female</Select.Option>
                </Select>
              </Col>
            </Row>

            <div>
              <Text strong>Email</Text>
              <Input
                type="email"
                value={editingRunner.email || ''}
                onChange={(e) => setEditingRunner({ ...editingRunner, email: e.target.value })}
                placeholder="email@example.com"
              />
            </div>

            <div>
              <Text strong>Phone</Text>
              <Input
                value={editingRunner.phone || ''}
                onChange={(e) => setEditingRunner({ ...editingRunner, phone: e.target.value })}
                placeholder="Phone number"
              />
            </div>

            <div>
              <Text strong>Card Number</Text>
              <Input
                type="number"
                value={editingRunner.card_number || ''}
                onChange={(e) => setEditingRunner({ 
                  ...editingRunner, 
                  card_number: e.target.value ? parseInt(e.target.value) : undefined 
                })}
                placeholder="SI Card number"
              />
            </div>
          </Space>
        )}
      </Modal>

      <style>
        {`
          .missing-data-select .ant-select-selector {
            background-color: #fff7e6 !important;
            border-color: #ffa940 !important;
          }
        `}
      </style>
      <Card>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {onBack && (
                <Button icon={<ArrowLeftOutlined />} onClick={onBack} size="large">
                  Back
                </Button>
              )}
              <Title level={3} style={{ margin: 0 }}>
                <WarningOutlined style={{ marginRight: 8 }} />
                Database Cleanup <Tag color="green">SQLite</Tag>
              </Title>
            </div>
            <Space>
              <Button icon={<SyncOutlined />} onClick={loadAllData} loading={loading}>
                Refresh
              </Button>
              <Button icon={<UploadOutlined />} onClick={handleXMLImport} loading={loading}>
                Import XML
              </Button>
              <Button icon={<DownloadOutlined />} onClick={handleExport}>
                Export Database
              </Button>
              <Button 
                icon={<DeleteOutlined />} 
                danger 
                onClick={handleBulkDelete}
                disabled={selectedRunners.size === 0}
              >
                Delete Selected ({selectedRunners.size})
              </Button>
            </Space>
          </div>

          {/* Statistics Dashboard */}
          <Row gutter={16}>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="Total Runners"
                  value={stats.totalRunners}
                  prefix={<TeamOutlined />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="Duplicate Groups"
                  value={duplicates.length}
                  valueStyle={{ color: duplicates.length > 0 ? '#cf1322' : '#3f8600' }}
                  prefix={<WarningOutlined />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="Data Quality Issues"
                  value={dataQualityIssues.length}
                  valueStyle={{ color: dataQualityIssues.length > 0 ? '#faad14' : '#3f8600' }}
                  prefix={<InfoCircleOutlined />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="Total Clubs"
                  value={stats.totalClubs}
                  prefix={<TeamOutlined />}
                />
              </Card>
            </Col>
          </Row>

          <Alert
            message="⚡ SQLite Performance"
            description="This database uses SQLite for lightning-fast queries. All operations are optimized for speed and efficiency."
            type="success"
            showIcon
          />

          {/* Main Content Tabs */}
          <Tabs activeKey={activeTab} onChange={setActiveTab}>
            
            {/* Duplicates Tab */}
            <TabPane 
              tab={<span><Badge count={duplicates.length} offset={[10, 0]}><MergeCellsOutlined /> Duplicates</Badge></span>} 
              key="duplicates"
            >
              <Space direction="vertical" style={{ width: '100%' }} size="large">
                <Row gutter={16} align="middle">
                  <Col span={8}>
                    <Space>
                      <Text>Similarity Threshold:</Text>
                      <Select 
                        value={duplicateThreshold} 
                        onChange={setDuplicateThreshold}
                        style={{ width: 100 }}
                      >
                        <Select.Option value={95}>95%</Select.Option>
                        <Select.Option value={90}>90%</Select.Option>
                      </Select>
                      <Button onClick={refreshDuplicates} loading={loading}>
                        Refresh
                      </Button>
                    </Space>
                  </Col>
                </Row>

                {duplicates.length > 0 ? (
                  <Collapse>
                    {duplicates.map(dup => renderDuplicateCard(dup))}
                  </Collapse>
                ) : (
                  <Alert
                    message="No Duplicates Found"
                    description="Your database looks clean! No duplicate runners detected."
                    type="success"
                    icon={<CheckCircleOutlined />}
                    showIcon
                  />
                )}
              </Space>
            </TabPane>

            {/* Club Misspellings Tab */}
            <TabPane 
              tab={<span><Badge count={clubMisspellings.length} offset={[10, 0]}><TeamOutlined /> Club Cleanup</Badge></span>} 
              key="club-cleanup"
            >
              <Space direction="vertical" style={{ width: '100%' }} size="large">
                <Alert
                  message="Advanced Club Cleanup"
                  description="This tool uses fuzzy matching to detect potential club name misspellings. For 3-4 letter club names, only 1-character differences are shown for accuracy."
                  type="info"
                  showIcon
                />

                {clubMisspellings.length > 0 ? (
                  <Table
                    dataSource={clubMisspellings}
                    rowKey={(record) => `${record.club1}_${record.club2}`}
                    size="small"
                    pagination={{ pageSize: 20 }}
                    columns={[
                      { 
                        title: 'Club 1', 
                        dataIndex: 'club1',
                        render: (name: string, record) => (
                          <Space direction="vertical" size="small">
                            <Text strong>{name}</Text>
                            <Text type="secondary">{record.count1} runners</Text>
                          </Space>
                        )
                      },
                      { 
                        title: 'Club 2', 
                        dataIndex: 'club2',
                        render: (name: string, record) => (
                          <Space direction="vertical" size="small">
                            <Text strong>{name}</Text>
                            <Text type="secondary">{record.count2} runners</Text>
                          </Space>
                        )
                      },
                      { 
                        title: 'Difference', 
                        dataIndex: 'distance',
                        render: (distance: number) => (
                          <Tag color={distance === 1 ? 'red' : 'orange'}>
                            {distance} character{distance !== 1 ? 's' : ''}
                          </Tag>
                        ),
                        sorter: (a, b) => a.distance - b.distance,
                      },
                      {
                        title: 'Actions',
                        render: (_, record) => {
                          const keepClub = record.count1 >= record.count2 ? record.club1 : record.club2;
                          const mergeClub = record.count1 >= record.count2 ? record.club2 : record.club1;
                          
                          return (
                            <Space>
                              <Button 
                                size="small" 
                                icon={<MergeCellsOutlined />}
                                onClick={() => {
                                  Modal.confirm({
                                    title: 'Merge Clubs?',
                                    content: (
                                      <div>
                                        <Paragraph>
                                          Merge <strong>{mergeClub}</strong> into <strong>{keepClub}</strong>?
                                        </Paragraph>
                                        <Paragraph type="secondary">
                                          All runners from {mergeClub} will be moved to {keepClub}.
                                        </Paragraph>
                                      </div>
                                    ),
                                    okText: 'Merge',
                                    okType: 'primary',
                                    onOk: () => {
                                      try {
                                        const club1Data = clubs.find(c => c.name === keepClub);
                                        const club2Data = clubs.find(c => c.name === mergeClub);
                                        
                                        if (club1Data && club2Data) {
                                          sqliteRunnerDB.mergeClubs(club2Data.id, club1Data.id);
                                          messageApi.success(`Merged ${mergeClub} into ${keepClub}`);
                                          loadAllData();
                                        }
                                      } catch (error) {
                                        console.error('[ClubCleanup] Merge failed:', error);
                                        messageApi.error('Failed to merge clubs');
                                      }
                                    }
                                  });
                                }}
                              >
                                Merge
                              </Button>
                              <Button 
                                size="small"
                                onClick={() => {
                                  // Remove from list (mark as reviewed)
                                  setClubMisspellings(prev => prev.filter(m => 
                                    !(m.club1 === record.club1 && m.club2 === record.club2)
                                  ));
                                  messageApi.success('Marked as not a misspelling');
                                }}
                              >
                                Ignore
                              </Button>
                            </Space>
                          );
                        },
                      },
                    ]}
                  />
                ) : (
                  <Alert
                    message="No Potential Misspellings Found"
                    description="All club names appear to be distinct."
                    type="success"
                    icon={<CheckCircleOutlined />}
                    showIcon
                  />
                )}
              </Space>
            </TabPane>

            {/* Clubs Tab */}
            <TabPane 
              tab={<span><TeamOutlined /> All Clubs ({clubs.length})</span>} 
              key="clubs"
            >
              <Space direction="vertical" style={{ width: '100%' }} size="large">
                <Space>
                  <Button 
                    icon={<MergeCellsOutlined />} 
                    onClick={handleMergeClubs}
                    disabled={selectedClubs.size !== 2}
                  >
                    Merge Selected ({selectedClubs.size})
                  </Button>
                  <Text type="secondary">Select 2 clubs to merge duplicates/typos</Text>
                </Space>

                <Table
                  dataSource={clubs}
                  rowKey="id"
                  size="small"
                  pagination={{ pageSize: 20 }}
                  rowSelection={{
                    selectedRowKeys: Array.from(selectedClubs),
                    onChange: (keys) => setSelectedClubs(new Set(keys as number[])),
                  }}
                  columns={[
                    { title: 'Club', dataIndex: 'name', render: (name: string) => <Text strong>{name}</Text> },
                    { title: 'Runners', dataIndex: 'runner_count', sorter: (a, b) => (b.runner_count || 0) - (a.runner_count || 0), defaultSortOrder: 'descend' },
                    {
                      title: 'Actions',
                      render: (_, record) => (
                        <Space>
                          <Button 
                            size="small" 
                            icon={<EyeOutlined />}
                            onClick={() => {
                              setClubFilter(record.name);
                              setActiveTab('browse');
                            }}
                          >
                            View
                          </Button>
                          <Button 
                            size="small" 
                            onClick={() => handleRenameClub(record.id, record.name)}
                          >
                            Rename
                          </Button>
                          <Button 
                            size="small" 
                            type="dashed"
                            onClick={() => handleAddAlias(record.name)}
                          >
                            Add Alias
                          </Button>
                        </Space>
                      ),
                    },
                  ]}
                />

                {clubAliases.length > 0 && (
                  <Card size="small" title="Club Aliases" style={{ marginTop: 16 }}>
                    <Table
                      dataSource={clubAliases}
                      rowKey="alias"
                      size="small"
                      pagination={false}
                      columns={[
                        { title: 'Alias/Typo', dataIndex: 'alias', render: (v) => <Tag>{v}</Tag> },
                        { title: '→ Maps To', dataIndex: 'clubName' },
                        {
                          title: 'Action',
                          render: (_, record) => (
                            <Button 
                              size="small" 
                              danger 
                              icon={<DeleteOutlined />}
                              onClick={() => {
                                sqliteRunnerDB.deleteClubAlias(record.alias);
                                messageApi.success('Alias deleted');
                                loadAllData();
                              }}
                            >
                              Delete
                            </Button>
                          ),
                        },
                      ]}
                    />
                  </Card>
                )}
              </Space>
            </TabPane>

            {/* Browse Tab */}
            <TabPane 
              tab={<span><SearchOutlined /> Browse</span>} 
              key="browse"
            >
              <Space direction="vertical" style={{ width: '100%' }} size="large">
                <Row gutter={16}>
                  <Col span={12}>
                    <Input
                      placeholder="Search by name..."
                      prefix={<SearchOutlined />}
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      allowClear
                    />
                  </Col>
                  <Col span={12}>
                    <Select
                      placeholder="Filter by club"
                      value={clubFilter}
                      onChange={setClubFilter}
                      style={{ width: '100%' }}
                      allowClear
                      showSearch
                    >
                      <Select.Option value="all">All Clubs</Select.Option>
                      {clubs.map(club => (
                        <Select.Option key={club.id} value={club.name}>{club.name}</Select.Option>
                      ))}
                    </Select>
                  </Col>
                </Row>

                <Table
                  dataSource={filteredRunners}
                  rowKey="id"
                  size="small"
                  loading={loading}
                  rowSelection={{
                    selectedRowKeys: Array.from(selectedRunners),
                    onChange: (keys) => setSelectedRunners(new Set(keys as string[])),
                  }}
                  pagination={{ pageSize: 50, showSizeChanger: true, showQuickJumper: true }}
                  columns={[
                    { title: 'Name', render: (_, r: RunnerRecord) => <Text strong>{r.first_name} {r.last_name}</Text> },
                    { title: 'Club', dataIndex: 'club' },
                    { title: 'YB', dataIndex: 'birth_year', render: (v) => v || '-' },
                    { title: 'Email', dataIndex: 'email', render: (v) => v || '-' },
                    { title: 'Phone', dataIndex: 'phone', render: (v) => v || '-' },
                    { title: 'Card', dataIndex: 'card_number', render: (v) => v || '-' },
                    { title: 'Used', dataIndex: 'times_used', render: (v) => v || 0 },
                    {
                      title: 'Action',
                      render: (_, r: RunnerRecord) => (
                        <Space size="small">
                          <Button size="small" icon={<EditOutlined />} onClick={() => handleEditRunner(r)}>
                            Edit
                          </Button>
                          <Button size="small" icon={<DeleteOutlined />} danger onClick={() => handleDeleteSingle(r.id)}>
                            Delete
                          </Button>
                        </Space>
                      ),
                    },
                  ]}
                />
              </Space>
            </TabPane>

            {/* Data Quality Tab */}
            <TabPane 
              tab={<span><Badge count={dataQualityIssues.length} offset={[10, 0]}><FileTextOutlined /> Data Quality</Badge></span>} 
              key="quality"
            >
              <Space direction="vertical" style={{ width: '100%' }} size="large">
                {dataQualityIssues.length > 0 ? (
                  <Table
                    dataSource={dataQualityIssues}
                    rowKey="id"
                    size="small"
                    scroll={{ y: 600 }}
                    pagination={{ pageSize: 100, showSizeChanger: true, showTotal: (total) => `Total ${total} items` }}
                    columns={[
                      { 
                        title: 'First Name', 
                        dataIndex: 'first_name',
                        sorter: (a, b) => a.first_name.localeCompare(b.first_name)
                      },
                      { 
                        title: 'Last Name', 
                        dataIndex: 'last_name',
                        sorter: (a, b) => a.last_name.localeCompare(b.last_name),
                        defaultSortOrder: 'ascend' as const
                      },
                      { title: 'Club', dataIndex: 'club' },
                      { 
                        title: 'YB', 
                        dataIndex: 'birth_year', 
                        render: (v, r: RunnerRecord) => (
                          <Input
                            size="small"
                            type="number"
                            value={v || ''}
                            placeholder="YYYY"
                            style={{ 
                              width: 80, 
                              backgroundColor: v ? undefined : '#fff7e6',
                              borderColor: v ? undefined : '#ffa940'
                            }}
                            onBlur={(e) => {
                              const year = parseInt(e.target.value);
                              if (year && year !== v) {
                                handleUpdateRunnerField(r.id, 'birth_year', year);
                              }
                            }}
                            onPressEnter={(e) => {
                              const year = parseInt(e.currentTarget.value);
                              if (year && year !== v) {
                                handleUpdateRunnerField(r.id, 'birth_year', year);
                              }
                            }}
                          />
                        )
                      },
                      { 
                        title: 'Sex', 
                        dataIndex: 'sex', 
                        render: (v, r: RunnerRecord) => (
                          <Select
                            size="small"
                            value={v || undefined}
                            placeholder="M/F"
                            style={{ 
                              width: 60
                            }}
                            className={!v ? 'missing-data-select' : ''}
                            onChange={(value) => handleUpdateRunnerField(r.id, 'sex', value)}
                          >
                            <Select.Option value="M">M</Select.Option>
                            <Select.Option value="F">F</Select.Option>
                          </Select>
                        )
                      },
                      { title: 'Card #', dataIndex: 'card_number', render: (v) => v || '-' },
                      {
                        title: 'Action',
                        render: (_, r: RunnerRecord) => (
                          <Button size="small" icon={<DeleteOutlined />} danger onClick={() => handleDeleteSingle(r.id)}>
                            Delete
                          </Button>
                        ),
                      },
                    ]}
                  />
                ) : (
                  <Alert message="All records are complete!" type="success" showIcon />
                )}
              </Space>
            </TabPane>
          </Tabs>
        </Space>
      </Card>
    </div>
  );
};

export default DatabaseCleanupSQLite;
