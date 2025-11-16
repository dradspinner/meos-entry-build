import React, { useEffect, useMemo, useState } from 'react';
import { Card, Table, Tag, Button, Space, Typography, Alert, App, Checkbox, Modal, Radio } from 'antd';
import { SyncOutlined, CheckCircleOutlined, DatabaseOutlined } from '@ant-design/icons';
import { localEntryService, type LocalEntry } from '../services/localEntryService';
import { sqliteRunnerDB, type RunnerRecord } from '../services/sqliteRunnerDatabaseService';
import RunnerDatabaseManager from './RunnerDatabaseManager';

const { Text } = Typography;

type FieldKey = 'club' | 'birthYear' | 'sex' | 'cardNumber' | 'phone';

type DiffType = 'same' | 'entry_missing' | 'db_missing' | 'conflict';

interface FieldDiff {
  field: FieldKey;
  entryVal?: string | number;
  dbVal?: string | number;
  type: DiffType;
}

interface ReviewItem {
  entry: LocalEntry;
  sqliteRunner?: RunnerRecord;
  status: 'matched' | 'unmatched' | 'skipped';
  diffs: FieldDiff[];
}

function normalizeEntryField(e: LocalEntry, field: FieldKey): string | number | undefined {
  switch (field) {
    case 'club': {
      const club = (e.club || '').trim();
      // Treat 'none' as empty/no club
      return club.toLowerCase() === 'none' ? '' : club;
    }
    case 'birthYear': return e.birthYear ? parseInt(e.birthYear) : undefined;
    case 'sex': return (e.sex || '').trim();
    case 'cardNumber': return e.cardNumber && e.cardNumber.trim() !== '' && e.cardNumber !== '0' ? parseInt(e.cardNumber) : undefined;
    case 'phone': return (e.phone || '').trim();
  }
}

function normalizeSqliteField(r: RunnerRecord, field: FieldKey): string | number | undefined {
  switch (field) {
    case 'club': return (r.club || '').trim();
    case 'birthYear': return r.birth_year;
    case 'sex': return r.sex;
    case 'cardNumber': return r.card_number;
    case 'phone': return (r.phone || '').trim();
  }
}

function computeDiffs(entry: LocalEntry, sqliteRunner?: RunnerRecord): FieldDiff[] {
  const fields: FieldKey[] = ['club', 'birthYear', 'sex', 'cardNumber', 'phone'];
  return fields.map((f) => {
    const eVal = normalizeEntryField(entry, f);
    const rVal = sqliteRunner ? normalizeSqliteField(sqliteRunner, f) : undefined;
    let type: DiffType = 'same';

    const isMissing = (v: any) => v === undefined || v === '' || v === null || v === 0 || v === '0';
    if (sqliteRunner === undefined) {
      type = 'db_missing';
    } else if (isMissing(eVal) && !isMissing(rVal)) {
      type = 'entry_missing';
    } else if (!isMissing(eVal) && isMissing(rVal)) {
      type = 'db_missing';
    } else if (!isMissing(eVal) && !isMissing(rVal)) {
      // compare after stringifying numbers
      const ev = typeof eVal === 'number' ? String(eVal) : String(eVal).trim();
      const rv = typeof rVal === 'number' ? String(rVal) : String(rVal).trim();
      type = ev.toLowerCase() === rv.toLowerCase() ? 'same' : 'conflict';
    }

    return { field: f, entryVal: eVal as any, dbVal: rVal as any, type };
  });
}

function findSqliteRunnerByExactName(first: string, last: string): RunnerRecord | undefined {
  try {
    const runner = sqliteRunnerDB.getRunnerByExactName(first, last);
    return runner || undefined;
  } catch {
    return undefined;
  }
}

const EntryReviewAndFix: React.FC = () => {
  const { message } = App.useApp();
  const [entries, setEntries] = useState<LocalEntry[]>([]);
  const [showUnmatchedOnly, setShowUnmatchedOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dbInitialized, setDbInitialized] = useState(false);
  const [runnerCount, setRunnerCount] = useState<number>(0);
  const [dbManagerOpen, setDbManagerOpen] = useState<boolean>(false);
  const [duplicatesQueue, setDuplicatesQueue] = useState<Array<{ entry: LocalEntry; matches: RunnerRecord[] }>>([]);
  const [currentDuplicateIndex, setCurrentDuplicateIndex] = useState(0);
  const [selectedRunner, setSelectedRunner] = useState<string | null>(null);

  const scan = () => {
    setEntries(localEntryService.getAllEntries());
    if (dbInitialized) {
      try {
        const stats = sqliteRunnerDB.getStats();
        setRunnerCount(stats.totalRunners);
      } catch {
        setRunnerCount(0);
      }
    }
  };

  useEffect(() => {
    const initDB = async () => {
      try {
        await sqliteRunnerDB.initialize();
        setDbInitialized(true);
        console.log('[EntryReview] SQLite database initialized');
      } catch (error) {
        console.error('[EntryReview] Failed to initialize SQLite:', error);
      }
    };
    
    initDB();
    scan();
  }, []);

  const reviewItems: ReviewItem[] = useMemo(() => {
    if (!dbInitialized) {
      // Return basic items without DB lookups until DB is ready
      return entries.map((e) => {
        const groupSize = parseInt(e.nationality || '1');
        const isGroup = groupSize >= 2 || !e.name.last;
        const status: ReviewItem['status'] = isGroup ? 'skipped' : 'unmatched';
        return { entry: e, sqliteRunner: undefined, status, diffs: [] };
      });
    }
    
    return entries.map((e) => {
      // Skip adding groups (we store group size in nationality and often last name empty)
      const groupSize = parseInt(e.nationality || '1');
      const isGroup = groupSize >= 2 || !e.name.last;
      const sqliteRunner = isGroup ? undefined : findSqliteRunnerByExactName(e.name.first, e.name.last);
      const status: ReviewItem['status'] = isGroup ? 'skipped' : (sqliteRunner ? 'matched' : 'unmatched');
      const diffs = computeDiffs(e, sqliteRunner);
      return { entry: e, sqliteRunner, status, diffs };
    });
  }, [entries, dbInitialized]);

  const filteredItems = useMemo(() => {
    if (showUnmatchedOnly) return reviewItems.filter(i => i.status === 'unmatched');
    return reviewItems;
  }, [reviewItems, showUnmatchedOnly]);

  const updateEntryFromDB = (item: ReviewItem, fieldToUpdate?: FieldKey) => {
    if (!item.sqliteRunner) return;
    const updates: Partial<LocalEntry> = {};

    item.diffs.forEach(d => {
      // If fieldToUpdate is specified, only update that field
      if (fieldToUpdate && d.field !== fieldToUpdate) return;
      
      // Update if entry is missing OR if it's a conflict (allow user to overwrite with DB value)
      if (d.type === 'entry_missing' || d.type === 'conflict') {
        switch (d.field) {
          case 'club': updates.club = String(d.dbVal || ''); break;
          case 'birthYear': updates.birthYear = d.dbVal ? String(d.dbVal) : ''; break;
          case 'sex': updates.sex = String(d.dbVal || ''); break;
          case 'cardNumber': updates.cardNumber = d.dbVal ? String(d.dbVal) : '0'; break;
          case 'phone': updates.phone = String(d.dbVal || ''); break;
        }
      }
    });

    if (Object.keys(updates).length === 0) {
      if (fieldToUpdate) {
        message.info(`No changes needed for ${fieldToUpdate}`);
      } else {
        message.info('No fields to update from database');
      }
      return;
    }

    const updated = localEntryService.updateEntry(item.entry.id, updates);
    if (updated) {
      const fieldName = fieldToUpdate || 'entry';
      message.success(`Updated ${fieldName} for ${updated.name.first} ${updated.name.last}`);
      scan();
    }
  };


  // Helper function to detect similar names (e.g., "Ron" vs "Ronald")
  const findPotentialDuplicates = (firstName: string, lastName: string): RunnerRecord[] => {
    const allRunners = sqliteRunnerDB.getAllRunners();
    
    return allRunners.filter(r => {
      // Exact last name match (case-insensitive)
      if (r.last_name.toLowerCase() !== lastName.toLowerCase()) return false;
      
      const f1 = firstName.toLowerCase().trim();
      const f2 = r.first_name.toLowerCase().trim();
      
      // Exact match
      if (f1 === f2) return true;
      
      // Check if one is a nickname/abbreviation of the other
      if (f1.startsWith(f2) || f2.startsWith(f1)) return true;
      if (f1.includes(f2) || f2.includes(f1)) return true;
      
      return false;
    });
  };

  const syncAllToSQLite = async () => {
    setLoading(true);
    try {
      await sqliteRunnerDB.initialize();
      let synced = 0;
      let pulled = 0;
      let duplicatesFound: Array<{ entry: LocalEntry; matches: RunnerRecord[] }> = [];
      
      // First pass: detect potential duplicates
      for (const item of reviewItems) {
        const e = item.entry;
        if (!e.name.last) continue; // Skip groups
        
        const matches = findPotentialDuplicates(e.name.first, e.name.last);
        
        // If multiple matches found (potential duplicates), flag for review
        if (matches.length > 1) {
          duplicatesFound.push({ entry: e, matches });
        }
      }
      
      setLoading(false);
      
      // If duplicates found, show modal for user to resolve
      if (duplicatesFound.length > 0) {
        showDuplicateResolutionModal(duplicatesFound);
        return;
      }
      
      // No duplicates - proceed with sync
      setLoading(true);
      for (const item of reviewItems) {
        const e = item.entry;
        if (!e.name.last) continue;
        
        // If runner exists in database, pull missing data from DB first
        if (item.sqliteRunner) {
          const updates: Partial<LocalEntry> = {};
          let hasUpdates = false;
          
          // Pull phone number if entry is missing it but DB has it
          if ((!e.phone || e.phone.trim() === '') && item.sqliteRunner.phone && item.sqliteRunner.phone.trim() !== '') {
            updates.phone = item.sqliteRunner.phone;
            hasUpdates = true;
          }
          
          // Pull other missing fields from database
          if ((!e.birthYear || e.birthYear.trim() === '') && item.sqliteRunner.birth_year) {
            updates.birthYear = String(item.sqliteRunner.birth_year);
            hasUpdates = true;
          }
          
          if ((!e.sex || e.sex.trim() === '') && item.sqliteRunner.sex) {
            updates.sex = item.sqliteRunner.sex;
            hasUpdates = true;
          }
          
          // Apply updates if any
          if (hasUpdates) {
            localEntryService.updateEntry(e.id, updates);
            pulled++;
          }
        }
        
        // Then sync entry data to database
        const cardNum = e.cardNumber ? parseInt(e.cardNumber.toString()) : undefined;
        sqliteRunnerDB.updateRunnerFromEntry(
          e.name.first,
          e.name.last,
          e.birthYear ? parseInt(e.birthYear.toString()) : undefined,
          e.sex as 'M' | 'F' | undefined,
          e.club,
          cardNum && !isNaN(cardNum) && cardNum > 0 ? cardNum : undefined
        );
        synced++;
      }
      
      // Rescan to show updated data
      scan();
      
      if (pulled > 0) {
        message.success(`Synced ${synced} runners to database and pulled ${pulled} phone numbers/info from database`);
      } else {
        message.success(`Synced ${synced} runners to SQLite database`);
      }
    } catch (error) {
      console.error('[EntryReview] Sync to SQLite failed:', error);
      message.error('Failed to sync to SQLite database');
    } finally {
      setLoading(false);
    }
  };

  const showDuplicateResolutionModal = (duplicates: Array<{ entry: LocalEntry; matches: RunnerRecord[] }>) => {
    setDuplicatesQueue(duplicates);
    setCurrentDuplicateIndex(0);
    setSelectedRunner(null);
  };
  
  // Effect to show the next duplicate modal when queue changes
  useEffect(() => {
    if (duplicatesQueue.length === 0 || currentDuplicateIndex >= duplicatesQueue.length) return;
    
    const dup = duplicatesQueue[currentDuplicateIndex];
    const e = dup.entry;
    
    // Track selection locally to avoid closure issues
    let localSelectedRunner: string | null = null;
    
    Modal.confirm({
      title: `Potential Duplicate ${currentDuplicateIndex + 1}/${duplicatesQueue.length}: ${e.name.first} ${e.name.last}`,
      width: 800,
      content: (
        <div>
          <Alert 
            type="warning" 
            message="Multiple similar runners found in database" 
            description={`Which runner should "${e.name.first} ${e.name.last}" (YB: ${e.birthYear || '?'}, Card: ${e.cardNumber || '?'}) match with?`}
            style={{ marginBottom: 16 }}
          />
          
          <Radio.Group 
            onChange={(ev) => {
              localSelectedRunner = ev.target.value;
              setSelectedRunner(ev.target.value);
            }} 
            defaultValue={null}
            style={{ width: '100%' }}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              {dup.matches.map((match) => (
                <Radio key={match.id} value={match.id} style={{ width: '100%' }}>
                  <Card size="small" style={{ width: '100%' }}>
                    <Space direction="vertical">
                      <Text strong>{match.first_name} {match.last_name}</Text>
                      <Text type="secondary">YB: {match.birth_year || '?'} | Sex: {match.sex || '?'} | Card: {match.card_number || '?'} | Club: {match.club}</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>Used {match.times_used || 0} times</Text>
                    </Space>
                  </Card>
                </Radio>
              ))}
              <Radio value="new">
                <Card size="small" style={{ backgroundColor: '#f0f5ff' }}>
                  <Text strong>Create New Runner</Text>
                  <br />
                  <Text type="secondary">These are different people</Text>
                </Card>
              </Radio>
            </Space>
          </Radio.Group>
        </div>
      ),
      okText: currentDuplicateIndex < duplicatesQueue.length - 1 ? 'Next' : 'Finish',
      cancelText: 'Skip All',
      onOk: () => {
        if (!localSelectedRunner) {
          message.warning('Please select an option');
          return false;
        }
        
        if (localSelectedRunner === 'new') {
          // User confirmed these are different people - do nothing
        } else {
          // User selected which runner to merge with
          const targetRunner = dup.matches.find(m => m.id === localSelectedRunner);
          if (targetRunner) {
            // Delete other duplicates
            dup.matches.forEach(m => {
              if (m.id !== localSelectedRunner) {
                sqliteRunnerDB.deleteRunner(m.id);
              }
            });
            message.success(`Merged duplicates into ${targetRunner.first_name} ${targetRunner.last_name}`);
          }
        }
        
        // Move to next duplicate or finish
        if (currentDuplicateIndex < duplicatesQueue.length - 1) {
          setSelectedRunner(null);
          setCurrentDuplicateIndex(currentDuplicateIndex + 1);
        } else {
          setDuplicatesQueue([]);
          setCurrentDuplicateIndex(0);
          message.success(`Resolved all duplicates. Run sync again to complete.`);
          scan();
        }
      },
      onCancel: () => {
        setDuplicatesQueue([]);
        setCurrentDuplicateIndex(0);
        message.info('Skipped duplicate resolution. Please clean up database manually.');
      }
    });
  }, [duplicatesQueue, currentDuplicateIndex]);


  const columns = [
    {
      title: 'Runner',
      key: 'name',
      render: (record: ReviewItem) => {
        // Normalize club display - treat 'none', empty string, or null as 'No club'
        const clubDisplay = record.entry.club && record.entry.club.toLowerCase() !== 'none' 
          ? record.entry.club 
          : <Text type="secondary" italic>(No club)</Text>;
        
        return (
          <Space direction="vertical" size={2}>
            <span>{record.entry.name.first} {record.entry.name.last || <Text type="secondary">(group)</Text>}</span>
            <Text type="secondary" style={{ fontSize: 12 }}>{clubDisplay}</Text>
          </Space>
        );
      }
    },
    {
      title: 'Match',
      key: 'match',
      width: 120,
      render: (record: ReviewItem) => {
        if (record.status === 'skipped') return <Tag>Skipped</Tag>;
        if (record.status === 'matched') return <Tag color="green" icon={<CheckCircleOutlined />}>Matched</Tag>;
        return <Tag color="orange">Not in DB</Tag>;
      }
    },
    {
      title: 'Differences',
      key: 'diffs',
      render: (record: ReviewItem) => {
        if (record.status !== 'matched') return <Text type="secondary">—</Text>;
        const important: FieldKey[] = ['birthYear', 'sex', 'cardNumber', 'club', 'phone'];
        return (
          <Space wrap>
            {record.diffs.filter(d => important.includes(d.field)).map(d => {
              if (d.type === 'same') return null;
              
              // Skip cardNumber if both values are blank/zero (don't flag blank epunch)
              if (d.field === 'cardNumber') {
                const entryEmpty = !d.entryVal || d.entryVal === 0 || d.entryVal === '0';
                const dbEmpty = !d.dbVal || d.dbVal === 0 || d.dbVal === '0';
                if (entryEmpty && dbEmpty) return null;
              }
              
              const labelMap: Record<FieldKey, string> = { club: 'Club', birthYear: 'YB', sex: 'Sex', cardNumber: 'Card', phone: 'Phone' };
              const color = d.type === 'entry_missing' ? 'blue' : d.type === 'db_missing' ? 'gold' : 'red';
              const text = `${labelMap[d.field]}: ${d.entryVal ?? '—'} ⇄ ${d.dbVal ?? '—'}`;
              
              return (
                <Tag 
                  key={d.field} 
                  color={color}
                  style={{ cursor: d.type === 'conflict' || d.type === 'entry_missing' ? 'pointer' : 'default' }}
                  onClick={() => {
                    if (d.type === 'conflict' || d.type === 'entry_missing') {
                      updateEntryFromDB(record, d.field);
                    }
                  }}
                  title={d.type === 'conflict' || d.type === 'entry_missing' ? `Click to update ${labelMap[d.field]} from database` : ''}
                >
                  {text}
                </Tag>
              );
            })}
          </Space>
        );
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 180,
      render: (record: ReviewItem) => (
        <Space>
          {record.status === 'matched' && (
            <Button size="small" onClick={() => updateEntryFromDB(record)}>Fix Entry</Button>
          )}
          {record.status === 'unmatched' && (
            <Text type="secondary">Not in DB</Text>
          )}
        </Space>
      )
    }
  ];

  return (
    <Card title="Step 2: Review & Fix Entry Data" extra={
      <Space>
        <Tag color="blue" icon={<DatabaseOutlined />}>DB: {runnerCount}</Tag>
        <Checkbox checked={showUnmatchedOnly} onChange={(e) => setShowUnmatchedOnly(e.target.checked)}>Show unmatched only</Checkbox>
        <Button onClick={scan} loading={loading} icon={<SyncOutlined />}>Rescan</Button>
        <Button onClick={() => setDbManagerOpen(true)} icon={<DatabaseOutlined />}>Manage Database</Button>
        <Button onClick={syncAllToSQLite} loading={loading} icon={<DatabaseOutlined />} type="primary">Sync Database</Button>
      </Space>
    }>
      <Alert
        type="info"
        showIcon
        message="How this works"
        description={
          <div>
            <p>Each entry is matched against the SQLite Runner Database by exact name (First + Last).</p>
            <ul style={{ marginLeft: 16 }}>
              <li><strong>Matched (green):</strong> Runner found in database. Click difference tags to fix entry fields from database.</li>
              <li><strong>Not in DB (orange):</strong> Runner not found. Use "Sync Database" to add all entries to database.</li>
              <li><strong>Sync Database:</strong> Updates SQLite database with all entries from this event. Detects and merges duplicates.</li>
            </ul>
          </div>
        }
        style={{ marginBottom: 16 }}
      />

      <Table
        dataSource={filteredItems}
        columns={columns as any}
        rowKey={(r: ReviewItem) => r.entry.id}
        size="small"
        pagination={{ pageSize: 100, showSizeChanger: true }}
      />

      <RunnerDatabaseManager open={dbManagerOpen} onClose={() => { setDbManagerOpen(false); scan(); }} />
    </Card>
  );
};

export default EntryReviewAndFix;
