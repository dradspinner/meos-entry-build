import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Table, Tag, Button, Space, Typography, App } from 'antd';
import { CheckCircleOutlined, DatabaseOutlined, SyncOutlined } from '@ant-design/icons';
import { sqliteRunnerDB, type RunnerRecord } from '../services/sqliteRunnerDatabaseService';
import { meosApi } from '../services/meosApi';
import type { MeOSRunnerEntry } from '../services/meosResultsValidationService';

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
  runner: MeOSRunnerEntry;
  sqliteRunner?: RunnerRecord;
  status: 'matched' | 'unmatched';
  diffs: FieldDiff[];
}

function getClubName(r: MeOSRunnerEntry): string {
  // Handle string or object shapes from different endpoints
  const raw: any = (r as any).club;
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    if (typeof raw.name === 'string') return raw.name;
    if (typeof raw.Name === 'string') return raw.Name;
    if (raw['#text']) return String(raw['#text']);
  }
  return '';
}

function normalizeRunnerField(r: MeOSRunnerEntry, field: FieldKey): string | number | undefined {
  switch (field) {
    case 'club': {
      const club = getClubName(r).trim();
      return club.toLowerCase() === 'none' ? '' : club;
    }
    case 'birthYear': return r.birthYear ? parseInt(String(r.birthYear)) : undefined;
    case 'sex': return (r.sex || '').toString().trim();
    case 'cardNumber': return r.cardNumber && String(r.cardNumber).trim() !== '' && String(r.cardNumber) !== '0' ? parseInt(String(r.cardNumber)) : undefined;
    case 'phone': return undefined; // MeOS competitors typically don't expose phone here
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

function computeDiffsMeOS(runner: MeOSRunnerEntry, sqliteRunner?: RunnerRecord): FieldDiff[] {
  const fields: FieldKey[] = ['club', 'birthYear', 'sex', 'cardNumber', 'phone'];
  return fields.map((f) => {
    const eVal = normalizeRunnerField(runner, f);
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

interface Props {
  open: boolean;
  onClose: () => void;
  runners: MeOSRunnerEntry[];
}

const ResultsReviewAndFix: React.FC<Props> = ({ open, onClose, runners }) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ReviewItem[]>([]);

  const scan = () => {
    const mapped: ReviewItem[] = runners.map(r => {
      const sqliteRunner = r.lastName ? findSqliteRunnerByExactName(r.firstName, r.lastName) : undefined;
      const status: ReviewItem['status'] = sqliteRunner ? 'matched' : 'unmatched';
      const diffs = computeDiffsMeOS(r, sqliteRunner);
      return { runner: r, sqliteRunner, status, diffs };
    });
    setItems(mapped);
  };

  useEffect(() => {
    // ensure DB is initialized
    (async () => {
      try { await sqliteRunnerDB.initialize(); } catch {}
      scan();
    })();
  }, [runners]);

  const applyFixFromDB = async (item: ReviewItem, fieldToUpdate?: FieldKey) => {
    if (!item.sqliteRunner) return;
    const updates: any = {};

    item.diffs.forEach(d => {
      if (fieldToUpdate && d.field !== fieldToUpdate) return;
      if (d.type === 'entry_missing' || d.type === 'conflict') {
        switch (d.field) {
          case 'club': updates.club = String(d.dbVal || ''); break;
          case 'birthYear': updates.birthYear = d.dbVal ? parseInt(String(d.dbVal)) : undefined; break;
          case 'sex': updates.sex = String(d.dbVal || ''); break;
          // Do NOT push card updates blindly (avoid rented chips)
          // case 'cardNumber': updates.cardNumber = d.dbVal ? String(d.dbVal) : undefined; break;
          // Phone not supported in update API at this time
        }
      }
    });

    if (Object.keys(updates).length === 0) {
      if (fieldToUpdate) message.info(`No changes needed for ${fieldToUpdate}`);
      else message.info('No fields to update from database');
      return;
    }

    try {
      setLoading(true);
      const resp = await meosApi.updateCompetitorFields(parseInt(item.runner.id), updates);
      if (resp.success) {
        message.success(`Updated ${item.runner.firstName} ${item.runner.lastName} in MeOS`);
        scan();
      } else {
        message.warning({
          content: resp.error || 'Update failed',
          duration: 6,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const actionableFields: FieldKey[] = ['club', 'birthYear', 'sex', 'cardNumber'];

  const isActionable = (it: ReviewItem) => {
    if (it.status !== 'matched') return false;
    return it.diffs.some(d => (d.type === 'entry_missing' || d.type === 'conflict') && actionableFields.includes(d.field));
  };

  const addRunnerToDB = async (item: ReviewItem) => {
    const r = item.runner;
    if (!r.firstName || !r.lastName) { message.warning('Cannot add groups or runners without last name'); return; }
    try {
      setLoading(true);
      await sqliteRunnerDB.initialize();
      const cardNum = r.cardNumber ? parseInt(String(r.cardNumber)) : undefined;
      const clubName = getClubName(r);
      sqliteRunnerDB.updateRunnerFromEntry(
        r.firstName,
        r.lastName,
        r.birthYear ? Number(r.birthYear) : undefined,
        (r.sex as any) || undefined,
        clubName,
        cardNum && !isNaN(cardNum) && cardNum > 0 ? cardNum : undefined,
        false
      );
      message.success(`Added ${r.firstName} ${r.lastName} to Runner DB`);
      scan();
    } catch (e) {
      message.error('Failed to add runner to DB');
    } finally { setLoading(false); }
  };

  const columns = [
    {
      title: 'Runner',
      key: 'name',
      render: (record: ReviewItem) => {
        const clubStr = getClubName(record.runner);
        const clubDisplay = clubStr && clubStr.toLowerCase() !== 'none'
          ? clubStr
          : <Text type="secondary" italic>(No club)</Text>;
        return (
          <Space direction="vertical" size={2}>
            <span>{record.runner.firstName} {record.runner.lastName || <Text type="secondary">(group)</Text>}</span>
            <Text type="secondary" style={{ fontSize: 12 }}>{clubDisplay}</Text>
          </Space>
        );
      }
    },
    {
      title: 'Match',
      key: 'match',
      width: 120,
      render: (record: ReviewItem) => (
        record.status === 'matched'
          ? <Tag color="green" icon={<CheckCircleOutlined />}>Matched</Tag>
          : <Tag color="orange">Not in DB</Tag>
      )
    },
    {
      title: 'Differences',
      key: 'diffs',
      render: (record: ReviewItem) => {
        if (record.status !== 'matched') return <Text type="secondary">—</Text>;
        const important: FieldKey[] = actionableFields; // Only show fields we can push to MeOS
        return (
          <Space wrap>
            {record.diffs
              .filter(d => important.includes(d.field))
              .filter(d => d.type === 'entry_missing' || d.type === 'conflict')
              .map(d => {
              if (d.type === 'same') return null;
              if (d.field === 'cardNumber') {
                const entryEmpty = !d.entryVal || d.entryVal === 0 || d.entryVal === '0';
                const dbEmpty = !d.dbVal || d.dbVal === 0 || d.dbVal === '0';
                if (entryEmpty && dbEmpty) return null;
              }
              const labelMap: Record<FieldKey, string> = { club: 'Club', birthYear: 'YB', sex: 'Sex', cardNumber: 'Card', phone: 'Phone' };
              const color = d.type === 'entry_missing' ? 'blue' : 'red';
              const text = `${labelMap[d.field]}: ${d.entryVal ?? '—'} → ${d.dbVal ?? '—'}`;
              return (
                <Tag
                  key={d.field}
                  color={color}
                  style={{ cursor: 'default' }}
                  title={`${labelMap[d.field]} difference: MeOS has "${d.entryVal ?? '(none)'}", database has "${d.dbVal ?? '(none)'}". Update manually in MeOS.`}
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
      width: 220,
      render: (record: ReviewItem) => (
        <Space>
          {record.status === 'unmatched' ? (
            <Button size="small" onClick={() => addRunnerToDB(record)} loading={loading}>Add to DB</Button>
          ) : (
            <Text type="secondary" italic style={{ fontSize: 11 }}>Manual update required</Text>
          )}
        </Space>
      )
    }
  ];

  return (
    <Modal
      title={(
        <Space>
          <DatabaseOutlined />
          <span>Review & Fix Runner Data (MeOS)</span>
        </Space>
      )}
      open={open}
      onCancel={onClose}
      width={1000}
      footer={(
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Text type="secondary" style={{ fontSize: 11, maxWidth: '60%' }}>
            Review differences and update the live MeOS entry manually.
          </Text>
          <Space>
            <Button icon={<SyncOutlined />} onClick={scan} loading={loading}>Rescan</Button>
            <Button type="primary" onClick={onClose}>Close</Button>
          </Space>
        </Space>
      )}
    >
      <Table
        dataSource={items}
        columns={columns as any}
        rowKey={(r: ReviewItem) => r.runner.id}
        size="small"
        pagination={{ pageSize: 100, showSizeChanger: true }}
        loading={loading}
      />
    </Modal>
  );
};

export default ResultsReviewAndFix;
