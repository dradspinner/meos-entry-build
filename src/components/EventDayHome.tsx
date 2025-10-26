import React, { useState } from 'react';
import { Card, Row, Col, Button, Typography, Statistic, Table, Input, Tag, Space, Badge, message, Alert, Modal } from 'antd';
import { CheckCircleOutlined, UserAddOutlined, DatabaseOutlined, ArrowLeftOutlined, UsbOutlined, EditOutlined, IdcardOutlined, LoginOutlined, ReloadOutlined, SyncOutlined, DeleteOutlined, TrophyOutlined } from '@ant-design/icons';
import RunnerDatabaseManager from './RunnerDatabaseManager';
import { localEntryService, type LocalEntry } from '../services/localEntryService';
import { localRunnerService } from '../services/localRunnerService';
import { eventMetaService } from '../services/eventMetaService';
import SameDayRegistration from './SameDayRegistration';
import EntryEditModal from './EntryEditModal';
import { sportIdentService, type SICardReadEvent } from '../services/sportIdentService';
import { meosApi } from '../services/meosApi';

const { Title, Paragraph, Text } = Typography;

interface EventDayHomeProps {
  onBack?: () => void;
  onBackToMain?: () => void;
}

const EventDayHome: React.FC<EventDayHomeProps> = ({ onBack, onBackToMain }) => {
  const [showSameDay, setShowSameDay] = useState(false);
  const [entries, setEntries] = useState<LocalEntry[]>(localEntryService.getAllEntries());
  const [filter, setFilter] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [selected, setSelected] = useState<LocalEntry | null>(null);
  const [lastCard, setLastCard] = useState<string | null>(null);
  const [readerStatus, setReaderStatus] = useState(sportIdentService.getStatus());
  const [meosIndex, setMeosIndex] = useState<{ byCard: Set<string>; byName: Set<string> } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [attemptedVerify, setAttemptedVerify] = useState(false);
  const [filterKey, setFilterKey] = useState<'all' | 'pending' | 'checked-in' | 'needsRental'>('all');
  const [meosConnected, setMeosConnected] = useState<boolean | null>(null);
  const [checkingMeos, setCheckingMeos] = useState(false);
  const [runnerDbOpen, setRunnerDbOpen] = useState(false);

  const refresh = () => {
    setEntries(localEntryService.getAllEntries());
    // Export checked-in runners to JSON file for live results
    exportLiveResultsData();
  };

  const exportLiveResultsData = async () => {
    try {
      const allEntries = localEntryService.getAllEntries();
      const checkedIn = allEntries.filter(e => e.status === 'checked-in' || e.checkedInAt);
      
      const liveData = {
        timestamp: new Date().toISOString(),
        totalCheckedIn: checkedIn.length,
        runners: checkedIn.map(e => ({
          name: e.name,
          club: e.club,
          className: e.className,
          classId: e.classId,
          cardNumber: e.cardNumber,
          checkedInAt: e.checkedInAt,
          status: e.status
        }))
      };

      // Write to public/live_data.json
      const jsonStr = JSON.stringify(liveData, null, 2);
      
      // Check if we're in Electron with file system access
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        await (window as any).electronAPI.writeLiveResults(jsonStr);
        console.log('[LiveResults Export] Exported', checkedIn.length, 'checked-in runners to live_data.json');
      } else {
        // Browser fallback - write to localStorage for same-origin access
        localStorage.setItem('live_results_export', jsonStr);
        console.log('[LiveResults Export] Exported to localStorage (browser mode)');
      }
    } catch (error) {
      console.error('[LiveResults Export] Failed:', error);
    }
  };

  React.useEffect(() => {
    // Run migration to fix existing entries with needsRentalCard but not isHiredCard
    const migrationResult = localEntryService.migrateRentalCardFlags();
    if (migrationResult.updated > 0) {
      console.log(`[EventDayHome] Migrated ${migrationResult.updated} rental card entries`);
      // Refresh entries after migration
      refresh();
    }
    
    // Export live results data on initial load
    exportLiveResultsData();
    
    // Initial MeOS status check - only run once on mount
    checkMeos();
    const cb = (ev: SICardReadEvent) => {
      setReaderStatus(sportIdentService.getStatus());
      if (ev.type === 'card_read' && ev.card) {
        const cnum = ev.card.cardNumber.toString();
        setLastCard(cnum);
        // auto-match pending entry by card - get fresh entries
        const currentEntries = localEntryService.getAllEntries();
        const match = currentEntries.find(e => e.status === 'pending' && e.cardNumber === cnum);
        if (match) {
          setSelected(match);
          setEditOpen(true);
          message.success(`Card ${cnum} → ${match.name.first} ${match.name.last}`);
        } else {
          message.info(`Card ${cnum} scanned. Select an entry and click Assign Last Card.`);
        }
      }
    };
    sportIdentService.addCallback(cb);
    const interval = setInterval(() => setReaderStatus(sportIdentService.getStatus()), 2000);
    return () => { sportIdentService.removeCallback(cb); clearInterval(interval); };
  }, []); // Remove entries dependency to prevent infinite loop

  // Auto-verify in MeOS once when there are checked-in entries
  React.useEffect(() => {
    const hasCheckedIn = entries.some(e => e.status === 'checked-in');
    if (hasCheckedIn && !attemptedVerify && !meosIndex && !verifying) {
      (async () => {
        try {
          setVerifying(true);
          const list = await meosApi.getAllEntries();
          const byCard = new Set<string>();
          const byName = new Set<string>();
          list.forEach((m:any)=>{
            if (m.cardNumber && m.cardNumber !== '0') byCard.add(String(m.cardNumber));
            const nm = `${(m.name?.first||'').toLowerCase()} ${(m.name?.last||'').toLowerCase()}`.trim();
            if (nm) byName.add(nm);
          });
          setMeosIndex({ byCard, byName });
        } catch (e) {
          // silent
        } finally {
          setVerifying(false);
          setAttemptedVerify(true);
        }
      })();
    }
  }, [entries, attemptedVerify, meosIndex, verifying]);

  const totalEntries = entries.length;
  const checkedIn = entries.filter(e => e.status === 'checked-in').length;
  const pending = totalEntries - checkedIn;
  const needsRental = entries.filter(e => e.issues?.needsRentalCard).length;
  
  // Get event metadata from MeOS API or fallback to stored/default
  const [meta, setMeta] = React.useState(eventMetaService.get());
  React.useEffect(() => {
    (async () => {
      try {
        // Try to fetch competition info from MeOS API
        const competition = await meosApi.getCompetition();
        if (competition && competition.name) {
          const fetchedMeta = {
            name: competition.name,
            date: competition.date,
            organizer: competition.organizer
          };
          eventMetaService.set(fetchedMeta);
          setMeta(fetchedMeta);
          console.log('[EventDayHome] Loaded event metadata from MeOS:', fetchedMeta);
          return;
        }
      } catch (error) {
        console.warn('[EventDayHome] Failed to fetch competition from MeOS API:', error);
      }
      
      // Fallback to stored metadata or defaults
      let currentMeta = eventMetaService.get();
      if (!currentMeta) {
        const defaultMeta = { name: 'DVOA Event', date: new Date().toISOString().split('T')[0] };
        eventMetaService.set(defaultMeta);
        currentMeta = defaultMeta;
      }
      setMeta(currentMeta);
    })();
  }, []);

  const checkMeos = async () => {
    try {
      setCheckingMeos(true);
      const ok = await meosApi.testConnection();
      setMeosConnected(ok);
    } catch {
      setMeosConnected(false);
    } finally {
      setCheckingMeos(false);
    }
  };


  const refreshRunnerDatabase = () => {
    localRunnerService.refreshFromStorage();
    const stats = localRunnerService.getStats();
    message.success(`Runner database refreshed: ${stats.total} runners loaded`);
  };

  const handleOpenLiveResults = () => {
    // Open live results in a new window
    const liveResultsUrl = window.location.origin + '/live_results.html';
    window.open(liveResultsUrl, 'live-results');
    console.log('🏆 Opening Live Results Display...');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', overflowX: 'hidden' }}>
      <div style={{ padding: '16px 16px 0 16px' }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 4 }}>
        <Col>
          <Title level={2} style={{ marginBottom: 0, fontSize: '20px' }}>
            Event Day Dashboard - {meta?.name || 'DVOA Event'} - {meta?.date || new Date().toISOString().split('T')[0]}
          </Title>
        </Col>
        <Col>
          <Space>
            <Button 
              icon={<TrophyOutlined />} 
              type="primary" 
              size="small"
              onClick={handleOpenLiveResults}
              title="Open Live Results in New Window"
              style={{ background: '#52c41a', borderColor: '#52c41a' }}
            >
              Live Results
            </Button>
            {onBack && (
              <Button icon={<ArrowLeftOutlined />} onClick={onBack} size="small">
                Back to Operations
              </Button>
            )}
            {onBackToMain && <Button size="small" onClick={onBackToMain}>Back to Main</Button>}
          </Space>
        </Col>
      </Row>
      
      <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>Check-in pre-registered runners or register new entries</Text>

      <Row justify="space-between" align="middle" style={{ marginBottom: 8 }}>
        <Col>
          <Space>
            <Badge 
              status={meosConnected === null ? 'default' : meosConnected ? 'success' : 'error'} 
              text={meosConnected === null ? 'MeOS API: Unknown' : meosConnected ? 'MeOS API: Connected' : 'MeOS API: Disconnected'}
            />
            <Button size="small" loading={checkingMeos} onClick={checkMeos}>Refresh</Button>
            <Button size="small" icon={<SyncOutlined />} onClick={refreshRunnerDatabase} title="Refresh runner database from localStorage">Refresh Runners ({localRunnerService.getStats().total})</Button>
            <Button size="small" icon={<DatabaseOutlined />} onClick={()=>setRunnerDbOpen(true)} title="Open Runner Database">Runner Database</Button>
          </Space>
        </Col>
      </Row>

      <Row gutter={[8, 8]} style={{ marginTop: 12, marginBottom: 12 }}>
        <Col xs={12} sm={4}>
          <Card size="small" hoverable onClick={() => setFilterKey('all')} bodyStyle={{ padding: '12px' }}>
            <Statistic title="Total Entries" value={totalEntries} valueStyle={{ fontSize: '20px' }} />
          </Card>
        </Col>
        <Col xs={12} sm={4}>
          <Card size="small" hoverable onClick={() => setFilterKey('checked-in')} bodyStyle={{ padding: '12px' }}>
            <Statistic title="Checked In" value={checkedIn} valueStyle={{ fontSize: '20px' }} />
          </Card>
        </Col>
        <Col xs={12} sm={4}>
          <Card size="small" hoverable onClick={() => setFilterKey('pending')} bodyStyle={{ padding: '12px' }}>
            <Statistic title="Pending" value={pending} valueStyle={{ fontSize: '20px' }} />
          </Card>
        </Col>
        <Col xs={12} sm={4}>
          <Card size="small" hoverable onClick={() => setFilterKey('needsRental')} bodyStyle={{ padding: '12px' }}>
            <Statistic title="Needs Rental" value={needsRental} valueStyle={{ fontSize: '20px' }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" bodyStyle={{ padding: '12px' }}>
            <Space size="small">
              <UsbOutlined />
              <Badge status={readerStatus.connected ? 'success' : 'error'} text={readerStatus.connected ? 'Connected' : 'Disconnected'} />
              {lastCard && <Tag color="green">Last: {lastCard}</Tag>}
              {!readerStatus.connected && (
                <Button size="small" icon={<UsbOutlined />} onClick={async ()=>{try{await sportIdentService.connect(); setReaderStatus(sportIdentService.getStatus());}catch{}}}>Connect</Button>
              )}
            </Space>
          </Card>
        </Col>
      </Row>

      <Card size="small" bodyStyle={{ padding: '8px 16px' }} style={{ marginTop: 8, marginBottom: 8 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space size="small">
            <Button type="primary" size="small" icon={<UserAddOutlined />} onClick={() => setShowSameDay(true)}>
              New Registration
            </Button>
            <Input.Search 
              size="small"
              allowClear 
              placeholder="Search name, club, or card"
              value={filter}
              onChange={(e)=>setFilter(e.target.value)}
              style={{ width: 320 }}
            />
            <Button size="small" icon={<ReloadOutlined />} onClick={refresh}>Refresh</Button>
          </Space>
          <Space size="small">
            <Button size="small" loading={verifying} onClick={async ()=>{
              try {
                setVerifying(true);
                const list = await meosApi.getAllEntries();
                const byCard = new Set<string>();
                const byName = new Set<string>();
                list.forEach((m:any)=>{
                  if (m.cardNumber && m.cardNumber !== '0') byCard.add(String(m.cardNumber));
                  const nm = `${(m.name?.first||'').toLowerCase()} ${(m.name?.last||'').toLowerCase()}`.trim();
                  if (nm) byName.add(nm);
                });
                setMeosIndex({ byCard, byName });
                message.success(`Verified against MeOS (${list.length} entries)`);
              } catch (e) {
                message.error('MeOS verification failed');
              } finally {
                setVerifying(false);
              }
            }}>Verify in MeOS</Button>
          </Space>
        </Space>
      </Card>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0 16px 16px 16px' }}>
      <Table size="small" className="table-compact" sticky scroll={{ x: 'max-content' }}
        key={entries.length}
        rowKey={(r: LocalEntry)=>r.id}
        dataSource={entries.filter(e => {
          // Quick filter by metric
          if (filterKey === 'pending' && e.status !== 'pending') return false;
          if (filterKey === 'checked-in' && e.status !== 'checked-in') return false;
          if (filterKey === 'needsRental' && !e.issues?.needsRentalCard) return false;
          const q = filter.trim().toLowerCase();
          if (!q) return true;
          return (
            `${e.name.first} ${e.name.last}`.toLowerCase().includes(q) ||
            e.club.toLowerCase().includes(q) ||
            e.cardNumber.toLowerCase().includes(q) ||
            e.className?.toLowerCase().includes(q)
          );
        })}
        pagination={false}
        showSorterTooltip={false}
        columns={[
          { 
            title: 'First Name', 
            dataIndex: ['name','first'], 
            key: 'first', 
            sorter: (a: LocalEntry, b: LocalEntry) => (a.name.first||'').localeCompare(b.name.first||''), 
            render: (v: string, record: LocalEntry) => {
              const isGroup = parseInt(record.nationality || '0') > 1;
              return isGroup ? <span>👥 {v}</span> : v;
            }
          },
          { title: 'Last Name', dataIndex: ['name','last'], key: 'last', sorter: (a: LocalEntry, b: LocalEntry) => (a.name.last||'').localeCompare(b.name.last||'') },
          { title: 'Club', dataIndex: 'club', key: 'club', sorter: (a: LocalEntry, b: LocalEntry) => a.club.localeCompare(b.club) },
          { title: 'Class', dataIndex: 'className', key: 'className', sorter: (a: LocalEntry, b: LocalEntry) => (a.className||'').localeCompare(b.className||'') },
          { 
            title: 'Card', 
            dataIndex: 'cardNumber', 
            key: 'cardNumber', 
            sorter: (a: LocalEntry, b: LocalEntry) => (parseInt(a.cardNumber||'0')||0) - (parseInt(b.cardNumber||'0')||0), 
            render: (v: string, record: LocalEntry) => {
              const hasNumber = v && v !== '0';
              // Rental requests before check-in or assignment: show Hired with red shading
              if (record.issues?.needsRentalCard && !hasNumber) {
                return <Tag style={{ border: '1px solid #ff4d4f', color: '#ff4d4f', backgroundColor: '#fff1f0' }}>Hired</Tag>;
              }
              // After assigning a rental card number: keep number with red outline and shading
              if (record.isHiredCard && hasNumber) {
                return <Tag style={{ border: '1px solid #ff4d4f', color: '#ff4d4f', backgroundColor: '#fff1f0' }}>{v}</Tag>;
              }
              // Personal cards
              return hasNumber ? <Tag>{v}</Tag> : <Tag color="warning">None</Tag>;
            }
          },
          { title: 'Status', key: 'status', sorter: (a: LocalEntry, b: LocalEntry) => a.status.localeCompare(b.status), render: (_: any, r: LocalEntry) => r.status === 'checked-in' ? <Tag color="green">Checked In</Tag> : <Tag>Pending</Tag> },
          { title: 'MeOS', key: 'meos', render: (_:any, r: LocalEntry) => {
              if (r.status !== 'checked-in') return <Tag>-</Tag>;
              // Optimistic: recently submitted entries show as In MeOS until verified
              if ((r as any).submittedToMeosAt) return <Tag color="green">Submitted</Tag>;
              if (!meosIndex) return <Button size="small" onClick={async ()=>{
                try {
                  setVerifying(true);
                  const list = await meosApi.getAllEntries();
                  const byCard = new Set<string>();
                  const byName = new Set<string>();
                  list.forEach((m:any)=>{
                    if (m.cardNumber && m.cardNumber !== '0') byCard.add(String(m.cardNumber));
                    const nm = `${(m.name?.first||'').toLowerCase()} ${(m.name?.last||'').toLowerCase()}`.trim();
                    if (nm) byName.add(nm);
                  });
                  setMeosIndex({ byCard, byName });
                  message.success('Verified in MeOS');
                } finally { setVerifying(false); }
              }}>Verify</Button>;
              const inMeos = (r.cardNumber && r.cardNumber !== '0' && meosIndex.byCard.has(String(r.cardNumber))) || meosIndex.byName.has(`${r.name.first.toLowerCase()} ${r.name.last.toLowerCase()}`);
              return inMeos ? <Tag color="green">In MeOS</Tag> : <Tag color="red">Missing</Tag>;
            }
          },
          { title: 'Actions', key: 'actions', render: (_: any, r: LocalEntry) => (
            <Space>
              <Button 
                size="small" 
                icon={<EditOutlined />} 
                onClick={()=>{setSelected(r); setEditOpen(true);}}
                style={{ backgroundColor: '#f0f5ff', borderColor: '#adc6ff' }}
              >
                Edit
              </Button>
              <Button 
                size="small" 
                danger 
                icon={<DeleteOutlined />} 
                onClick={() => {
                  Modal.confirm({
                    title: `Delete ${r.name.first} ${r.name.last}?`,
                    content: `This will permanently remove this entry from the system.`,
                    okText: 'Delete',
                    okType: 'danger',
                    onOk: () => {
                      const success = localEntryService.deleteEntry(r.id);
                      if (success) {
                        message.success(`Deleted ${r.name.first} ${r.name.last}`);
                        refresh();
                      } else {
                        message.error('Failed to delete entry');
                      }
                    }
                  });
                }}
                style={{ backgroundColor: '#fff1f0', borderColor: '#ffccc7' }}
              >
                Delete
              </Button>
              {r.status !== 'checked-in' ? (
                <>
                  <Button 
                    size="small" 
                    icon={<IdcardOutlined />} 
                    onClick={()=>{
                      if (lastCard) {
                        const u = localEntryService.updateEntry(r.id, { cardNumber: lastCard, isHiredCard: true });
                        if (u) { message.success(`Assigned card ${lastCard}`); refresh(); }
                      } else {
                        message.info('Scan a card, then click Assign Last Card');
                      }
                    }}
                    style={{ backgroundColor: '#f6ffed', borderColor: '#b7eb8f' }}
                  >
                    Assign Last Card
                  </Button>
                  <Button size="small" type="primary" icon={<LoginOutlined />} onClick={()=>{
                    // Open edit modal to confirm info before check-in
                    setSelected(r);
                    setEditOpen(true);
                  }}>Check In</Button>
                </>
              ) : (
                <Button size="small" danger onClick={()=>{
                  // Uncheck-in: revert to pending
                  const upd = localEntryService.updateEntry(r.id, { status: 'pending', checkedInAt: undefined, submittedToMeosAt: undefined });
                  if (upd) { message.success('Entry set to pending'); refresh(); }
                }}>Uncheck-In</Button>
              )}
            </Space>
          )}
        ]}
      />
      </div>

      {/* Edit Entry Modal */}
      <EntryEditModal 
        open={editOpen}
        entry={selected}
        onClose={()=>{setEditOpen(false); setSelected(null);}}
        onUpdated={(e)=>{setSelected(e); refresh();}}
        onCheckedIn={()=>{setEditOpen(false); setSelected(null); refresh();}}
        lastCardNumber={lastCard}
      />

      {/* Same-Day Registration Modal */}
      <SameDayRegistration 
        visible={showSameDay} 
        onClose={() => {
          setShowSameDay(false); 
          // Reset filters to show all entries (whether saved or registered)
          setFilterKey('all');
          setFilter('');
          refresh();
        }}
        onRegistrationComplete={(entry, cardNumber) => {
          setShowSameDay(false);
          // Reset filters to show all entries so new registration is visible
          setFilterKey('all');
          setFilter('');
          refresh();
          message.success(`${entry.name.first} ${entry.name.last} registered and visible in table!`);
        }}
      />

      {/* Runner Database Manager */}
      <RunnerDatabaseManager open={runnerDbOpen} onClose={()=>setRunnerDbOpen(false)} />

    </div>
  );
};

export default EventDayHome;
