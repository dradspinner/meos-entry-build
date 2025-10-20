import React, { useEffect, useMemo, useState } from 'react';
import { Card, Table, Tag, Button, Space, Typography, Alert, App, Checkbox } from 'antd';
import { SyncOutlined, CheckCircleOutlined, PlusOutlined, ToolOutlined, DatabaseOutlined } from '@ant-design/icons';
import { localEntryService, type LocalEntry } from '../services/localEntryService';
import { localRunnerService, type LocalRunner } from '../services/localRunnerService';
import RunnerDatabaseManager from './RunnerDatabaseManager';

const { Text } = Typography;

type FieldKey = 'club' | 'birthYear' | 'sex' | 'cardNumber' | 'phone' | 'email';

type DiffType = 'same' | 'entry_missing' | 'db_missing' | 'conflict';

interface FieldDiff {
  field: FieldKey;
  entryVal?: string | number;
  dbVal?: string | number;
  type: DiffType;
}

interface ReviewItem {
  entry: LocalEntry;
  runner?: LocalRunner;
  status: 'matched' | 'unmatched' | 'skipped';
  diffs: FieldDiff[];
}

function normalizeEntryField(e: LocalEntry, field: FieldKey): string | number | undefined {
  switch (field) {
    case 'club': return (e.club || '').trim();
    case 'birthYear': return e.birthYear ? parseInt(e.birthYear) : undefined;
    case 'sex': return (e.sex || '').trim();
    case 'cardNumber': return e.cardNumber && e.cardNumber.trim() !== '' && e.cardNumber !== '0' ? parseInt(e.cardNumber) : undefined;
    case 'phone': return (e.phone || '').trim();
    case 'email': return undefined; // LocalEntry does not store email
  }
}

function normalizeRunnerField(r: LocalRunner, field: FieldKey): string | number | undefined {
  switch (field) {
    case 'club': return (r.club || '').trim();
    case 'birthYear': return r.birthYear;
    case 'sex': return r.sex;
    case 'cardNumber': return r.cardNumber;
    case 'phone': return (r.phone || '').trim();
    case 'email': return (r.email || '').trim();
  }
}

function computeDiffs(entry: LocalEntry, runner?: LocalRunner): FieldDiff[] {
  const fields: FieldKey[] = ['club', 'birthYear', 'sex', 'cardNumber', 'phone', 'email'];
  return fields.map((f) => {
    const eVal = normalizeEntryField(entry, f);
    const rVal = runner ? normalizeRunnerField(runner, f) : undefined;
    let type: DiffType = 'same';

    const isMissing = (v: any) => v === undefined || v === '' || v === null;
    if (runner === undefined) {
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

function findRunnerByExactName(first: string, last: string): LocalRunner | undefined {
  const targetFirst = (first || '').toLowerCase().trim();
  const targetLast = (last || '').toLowerCase().trim();
  return localRunnerService.getAllRunners().find(r =>
    r.name.first.toLowerCase().trim() === targetFirst &&
    r.name.last.toLowerCase().trim() === targetLast
  );
}

const EntryReviewAndFix: React.FC = () => {
  const { message } = App.useApp();
  const [entries, setEntries] = useState<LocalEntry[]>([]);
  const [showUnmatchedOnly, setShowUnmatchedOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [runnerCount, setRunnerCount] = useState<number>(localRunnerService.getAllRunners().length);
  const [dbManagerOpen, setDbManagerOpen] = useState<boolean>(false);

  const scan = () => {
    setEntries(localEntryService.getAllEntries());
    setRunnerCount(localRunnerService.getAllRunners().length);
  };

  useEffect(() => { scan(); }, []);

  const reviewItems: ReviewItem[] = useMemo(() => {
    return entries.map((e) => {
      // Skip adding groups (we store group size in nationality and often last name empty)
      const groupSize = parseInt(e.nationality || '1');
      const isGroup = groupSize >= 2 || !e.name.last;
      const runner = isGroup ? undefined : findRunnerByExactName(e.name.first, e.name.last);
      const status: ReviewItem['status'] = isGroup ? 'skipped' : (runner ? 'matched' : 'unmatched');
      const diffs = computeDiffs(e, runner);
      return { entry: e, runner, status, diffs };
    });
  }, [entries]);

  const filteredItems = useMemo(() => {
    if (showUnmatchedOnly) return reviewItems.filter(i => i.status === 'unmatched');
    return reviewItems;
  }, [reviewItems, showUnmatchedOnly]);

  const updateEntryFromDB = (item: ReviewItem, fieldToUpdate?: FieldKey) => {
    if (!item.runner) return;
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
          // email not stored on entries
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

  const updateDBFromEntry = (item: ReviewItem) => {
    if (!item.runner) return;
    const updates: Partial<Omit<LocalRunner, 'id' | 'lastUsed' | 'timesUsed' | 'name'>> = {};

    item.diffs.forEach(d => {
      // Prefer filling DB when DB is missing; do not overwrite conflicts automatically
      if (d.type === 'db_missing') {
        switch (d.field) {
          case 'club': updates.club = String(d.entryVal || ''); break;
          case 'birthYear': updates.birthYear = typeof d.entryVal === 'number' ? d.entryVal : (d.entryVal ? parseInt(String(d.entryVal)) : undefined); break;
          case 'sex': updates.sex = (d.entryVal as any) as 'M' | 'F' | undefined; break;
          case 'cardNumber': updates.cardNumber = typeof d.entryVal === 'number' ? d.entryVal : (d.entryVal ? parseInt(String(d.entryVal)) : undefined); break;
          case 'phone': updates.phone = String(d.entryVal || ''); break;
          case 'email': /* no email on entry */ break;
        }
      }
    });

    if (Object.keys(updates).length === 0) {
      message.info('No missing database fields to fill from entry');
      return;
    }

    const updated = localRunnerService.updateRunner(item.runner.id, updates as any);
    if (updated) {
      message.success(`Updated database for ${updated.name.first} ${updated.name.last}`);
      scan();
    }
  };

  const addToDatabase = (item: ReviewItem) => {
    const e = item.entry;
    if (!e.name.last) {
      message.warning('Skipping group/team entries for database');
      return;
    }
    localRunnerService.addRunner({
      name: { first: e.name.first.trim(), last: e.name.last.trim() },
      club: (e.club || '').trim(),
      birthYear: e.birthYear ? parseInt(e.birthYear) : undefined,
      sex: (e.sex as 'M' | 'F' | undefined) || undefined,
      cardNumber: e.cardNumber && e.cardNumber !== '0' ? parseInt(e.cardNumber) : undefined,
      phone: (e.phone || '').trim(),
      email: '',
      nationality: (e.nationality || '').trim(),
    });
    message.success(`Added ${e.name.first} ${e.name.last} to database`);
    scan();
  };

  const addAllMissingToDatabase = () => {
    const toAdd = reviewItems.filter(i => i.status === 'unmatched' && i.entry.name.last);
    if (toAdd.length === 0) {
      message.info('No unmatched runners to add');
      return;
    }
    const before = localRunnerService.getAllRunners().length;
    toAdd.forEach(item => {
      const e = item.entry;
      localRunnerService.addRunner({
        name: { first: e.name.first.trim(), last: e.name.last.trim() },
        club: (e.club || '').trim(),
        birthYear: e.birthYear ? parseInt(e.birthYear) : undefined,
        sex: (e.sex as 'M' | 'F' | undefined) || undefined,
        cardNumber: e.cardNumber && e.cardNumber !== '0' ? parseInt(e.cardNumber) : undefined,
        phone: (e.phone || '').trim(),
        email: '',
        nationality: (e.nationality || '').trim(),
      });
    });
    const after = localRunnerService.getAllRunners().length;
    const added = after - before;
    message.success(`Added ${added} runner${added!==1?'s':''} to database (total: ${after})`);
    scan();
  };

  const applyAllSafeEntryFixes = () => {
    const toFix = reviewItems.filter(i => i.status === 'matched');
    let fixed = 0;
    toFix.forEach(i => {
      const before = localEntryService.getAllEntries().find(e => e.id === i.entry.id);
      updateEntryFromDB(i);
      const after = localEntryService.getAllEntries().find(e => e.id === i.entry.id);
      if (before && after && JSON.stringify(before) !== JSON.stringify(after)) fixed++;
    });
    if (fixed > 0) message.success(`Applied ${fixed} safe fixes from database`);
  };

  const columns = [
    {
      title: 'Runner',
      key: 'name',
      render: (record: ReviewItem) => (
        <Space direction="vertical" size={2}>
          <span>{record.entry.name.first} {record.entry.name.last || <Text type="secondary">(group)</Text>}</span>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.entry.club}</Text>
        </Space>
      )
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
              
              const labelMap: Record<FieldKey, string> = { club: 'Club', birthYear: 'YB', sex: 'Sex', cardNumber: 'Card', phone: 'Phone', email: 'Email' };
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
      width: 320,
      render: (record: ReviewItem) => (
        <Space>
          {record.status === 'matched' && (
            <>
              <Button size="small" onClick={() => updateEntryFromDB(record)} icon={<ToolOutlined />}>Fix Entry</Button>
              <Button size="small" onClick={() => updateDBFromEntry(record)} icon={<SyncOutlined />}>Update DB</Button>
            </>
          )}
          {record.status === 'unmatched' && (
            <Button size="small" type="primary" onClick={() => addToDatabase(record)} icon={<PlusOutlined />}>Add to DB</Button>
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
        <Button onClick={() => setDbManagerOpen(true)} icon={<DatabaseOutlined />}>Open DB</Button>
        <Button onClick={applyAllSafeEntryFixes} icon={<ToolOutlined />}>Apply Safe Fixes</Button>
        <Button type="primary" onClick={addAllMissingToDatabase} icon={<PlusOutlined />}>Add All Missing</Button>
      </Space>
    }>
      <Alert
        type="info"
        showIcon
        message="How this works"
        description={
          <div>
            <p>Each entry is matched against the Runner Database by exact name (First + Last).</p>
            <ul style={{ marginLeft: 16 }}>
              <li>Fix Entry: fill missing entry fields from the database. Click individual difference tags to update specific fields.</li>
              <li>Update DB: fill missing database fields from the entry; does not overwrite existing values.</li>
              <li>Add to DB: create a new runner record if no match is found (skips groups/teams).</li>
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
