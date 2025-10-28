import React, { useState } from 'react';
import { Card, Row, Col, Button, Typography, Statistic, Table, Input, Tag, Space, Badge, message, Alert, Modal, Dropdown } from 'antd';
import { CheckCircleOutlined, UserAddOutlined, DatabaseOutlined, ArrowLeftOutlined, UsbOutlined, EditOutlined, IdcardOutlined, LoginOutlined, ReloadOutlined, SyncOutlined, DeleteOutlined, TrophyOutlined, HomeOutlined } from '@ant-design/icons';
import RunnerLookupSQLite from './RunnerLookupSQLite';
import { localEntryService, type LocalEntry, type ClassRegistration } from '../services/localEntryService';
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
  const needsRental = entries.filter(e => e.issues?.needsRentalCard).length;
  const pending = entries.filter(e => e.status === 'pending' && !e.issues?.needsRentalCard).length;
  
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


  // SQLite database is now used and auto-initializes on demand

  const handleOpenLiveResults = () => {
    // Open live results in a new window
    const liveResultsUrl = window.location.origin + '/live_results.html';
    window.open(liveResultsUrl, 'live-results');
    console.log('🏆 Opening Live Results Display...');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', overflowX: 'hidden' }}>
      <div style={{ padding: '16px 16px 0 16px' }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
        <Col>
          <Title level={2} style={{ marginBottom: 0, fontSize: '24px', fontWeight: 700, color: '#000' }}>
            Event Day Dashboard - {meta?.name || 'DVOA Event'} - {meta?.date || new Date().toISOString().split('T')[0]}
          </Title>
        </Col>
        <Col>
          <Space>
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'main-dashboard',
                    icon: <HomeOutlined />,
                    label: 'Main Dashboard',
                    onClick: onBackToMain,
                  },
                ],
              }}
              placement="bottomLeft"
            >
              <Button size="small">
                Event
              </Button>
            </Dropdown>
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
            <Button size="small" icon={<DatabaseOutlined />} onClick={()=>setRunnerDbOpen(true)} title="Open SQLite Runner Database">Runner Database</Button>
          </Space>
        </Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginTop: 16, marginBottom: 16 }}>
        <Col xs={12} sm={4}>
          <Card 
            size="small" 
            hoverable 
            onClick={() => setFilterKey('all')} 
            bodyStyle={{ padding: '16px' }}
            style={{ border: filterKey === 'all' ? '2px solid #1890ff' : '1px solid #d9d9d9' }}
          >
            <Statistic 
              title={<span style={{ fontSize: '15px', fontWeight: 600, color: '#000' }}>Total Entries</span>} 
              value={totalEntries} 
              valueStyle={{ fontSize: '28px', fontWeight: 700, color: '#000' }} 
            />
          </Card>
        </Col>
        <Col xs={12} sm={4}>
          <Card 
            size="small" 
            hoverable 
            onClick={() => setFilterKey('checked-in')} 
            bodyStyle={{ padding: '16px' }}
            style={{ border: filterKey === 'checked-in' ? '2px solid #52c41a' : '1px solid #d9d9d9' }}
          >
            <Statistic 
              title={<span style={{ fontSize: '15px', fontWeight: 600, color: '#000' }}>Checked In</span>} 
              value={checkedIn} 
              valueStyle={{ fontSize: '28px', fontWeight: 700, color: '#52c41a' }} 
            />
          </Card>
        </Col>
        <Col xs={12} sm={4}>
          <Card 
            size="small" 
            hoverable 
            onClick={() => setFilterKey('pending')} 
            bodyStyle={{ padding: '16px' }}
            style={{ border: filterKey === 'pending' ? '2px solid #faad14' : '1px solid #d9d9d9' }}
          >
            <Statistic 
              title={<span style={{ fontSize: '15px', fontWeight: 600, color: '#000' }}>Pending</span>} 
              value={pending} 
              valueStyle={{ fontSize: '28px', fontWeight: 700, color: '#faad14' }} 
            />
          </Card>
        </Col>
        <Col xs={12} sm={4}>
          <Card 
            size="small" 
            hoverable 
            onClick={() => setFilterKey('needsRental')} 
            bodyStyle={{ padding: '16px' }}
            style={{ border: filterKey === 'needsRental' ? '2px solid #ff4d4f' : '1px solid #d9d9d9' }}
          >
            <Statistic 
              title={<span style={{ fontSize: '15px', fontWeight: 600, color: '#000' }}>Needs Rental</span>} 
              value={needsRental} 
              valueStyle={{ fontSize: '28px', fontWeight: 700, color: '#ff4d4f' }} 
            />
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

      <Card size="small" bodyStyle={{ padding: '12px 16px' }} style={{ marginTop: 12, marginBottom: 12, borderWidth: 2 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space size="middle">
            <Button 
              type="primary" 
              size="large" 
              icon={<UserAddOutlined />} 
              onClick={() => setShowSameDay(true)}
              style={{ fontWeight: 600, minHeight: 44 }}
            >
              New Registration
            </Button>
            <Input.Search 
              size="large"
              allowClear 
              placeholder="Search name, club, or card"
              value={filter}
              onChange={(e)=>setFilter(e.target.value)}
              style={{ width: 360, fontSize: '15px', fontWeight: 500 }}
            />
            <Button size="large" icon={<ReloadOutlined />} onClick={refresh} style={{ fontWeight: 600 }}>Refresh</Button>
          </Space>
          <Space size="middle">
            <Button size="large" loading={verifying} style={{ fontWeight: 600 }} onClick={async ()=>{
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
      <Table 
        size="small" 
        sticky 
        scroll={{ x: 'max-content' }}
        style={{ fontSize: '14px' }}
        key={entries.length}
        rowKey={(r: any)=>r.rowId}
        rowClassName={(row: any) => {
          // Alternate shading per runner (not per row)
          // Find the entry's index in the original entries list
          const entryIndex = entries.findIndex(e => e.id === row.entry.id);
          return entryIndex % 2 === 0 ? 'row-even' : 'row-odd';
        }}
        dataSource={(() => {
          // Transform entries into rows - one row per class registration
          const rows: any[] = [];
          entries.forEach(entry => {
            const allClasses = localEntryService.getEntryClasses(entry);
            allClasses.forEach((classReg, idx) => {
              rows.push({
                rowId: `${entry.id}_${classReg.classId}`,
                entry: entry,
                classReg: classReg,
                isPrimary: idx === 0,
                totalClasses: allClasses.length
              });
            });
          });
          return rows;
        })().filter(row => {
          const e = row.entry;
          const classReg = row.classReg;
          // Quick filter by metric - filter by the specific class registration status
          if (filterKey === 'pending' && (classReg.status !== 'pending' || e.issues?.needsRentalCard)) return false;
          if (filterKey === 'checked-in' && classReg.status !== 'checked-in') return false;
          if (filterKey === 'needsRental' && !e.issues?.needsRentalCard) return false;
          const q = filter.trim().toLowerCase();
          if (!q) return true;
          return (
            `${e.name.first} ${e.name.last}`.toLowerCase().includes(q) ||
            e.club.toLowerCase().includes(q) ||
            e.cardNumber.toLowerCase().includes(q) ||
            classReg.className?.toLowerCase().includes(q)
          );
        })}
        pagination={false}
        showSorterTooltip={false}
        columns={[
          { 
            title: 'First Name', 
            key: 'first', 
            sorter: (a: any, b: any) => (a.entry.name.first||'').localeCompare(b.entry.name.first||''), 
            render: (_: any, row: any) => {
              const e = row.entry;
              const isGroup = parseInt(e.nationality || '0') > 1;
              return <span style={{ fontSize: '13px', fontWeight: 500 }}>{isGroup ? `👥 ${e.name.first}` : e.name.first}</span>;
            }
          },
          { 
            title: <span style={{ fontWeight: 700, fontSize: '13px' }}>Last Name</span>, 
            key: 'last', 
            sorter: (a: any, b: any) => (a.entry.name.last||'').localeCompare(b.entry.name.last||''), 
            render: (_: any, row: any) => <span style={{ fontSize: '13px', fontWeight: 500 }}>{row.entry.name.last}</span>
          },
          { 
            title: <span style={{ fontWeight: 700, fontSize: '13px' }}>Club</span>, 
            key: 'club', 
            sorter: (a: any, b: any) => a.entry.club.localeCompare(b.entry.club), 
            render: (_: any, row: any) => <span style={{ fontSize: '13px', fontWeight: 500 }}>{row.entry.club}</span>
          },
          { 
            title: <span style={{ fontWeight: 700, fontSize: '13px' }}>Class</span>, 
            key: 'className', 
            sorter: (a: any, b: any) => (a.classReg.className||'').localeCompare(b.classReg.className||''), 
            render: (_: any, row: any) => <span style={{ fontSize: '13px', fontWeight: 600 }}>{row.classReg.className}</span>
          },
          { 
            title: <span style={{ fontWeight: 700, fontSize: '13px' }}>Card</span>, 
            key: 'cardNumber',
            sorter: (a: any, b: any) => (parseInt(a.entry.cardNumber||'0')||0) - (parseInt(b.entry.cardNumber||'0')||0), 
            render: (_: any, row: any) => {
              const e = row.entry;
              const v = e.cardNumber;
              const hasNumber = v && v !== '0';
              // Rental requests before check-in or assignment: show Hired with red shading
              if (e.issues?.needsRentalCard && !hasNumber) {
                return <Tag style={{ border: '1px solid #ff4d4f', color: '#ff4d4f', backgroundColor: '#fff1f0' }}>Hired</Tag>;
              }
              // After assigning a rental card number: keep number with red outline and shading
              if (e.isHiredCard && hasNumber) {
                return <Tag style={{ border: '1px solid #ff4d4f', color: '#ff4d4f', backgroundColor: '#fff1f0' }}>{v}</Tag>;
              }
              // Personal cards
              return hasNumber ? <Tag>{v}</Tag> : <Tag color="warning">None</Tag>;
            }
          },
          { 
            title: <span style={{ fontWeight: 700, fontSize: '13px' }}>Status</span>, 
            key: 'status', 
            sorter: (a: any, b: any) => a.classReg.status.localeCompare(b.classReg.status), 
            render: (_: any, row: any) => row.classReg.status === 'checked-in' 
              ? <Tag color="green" style={{ fontSize: '12px', fontWeight: 600, padding: '2px 8px', margin: 0 }}>Checked In</Tag> 
              : <Tag style={{ fontSize: '12px', fontWeight: 600, padding: '2px 8px', margin: 0 }}>Pending</Tag>
          },
          { 
            title: <span style={{ fontWeight: 700, fontSize: '13px' }}>MeOS</span>, 
            key: 'meos',
            render: (_:any, row: any) => {
              const classReg = row.classReg;
              const e = row.entry;
              if (classReg.status !== 'checked-in') return <Tag>-</Tag>;
              // Optimistic: recently submitted entries show as In MeOS until verified
              if (classReg.submittedToMeosAt) return <Tag color="green">Submitted</Tag>;
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
              const inMeos = (e.cardNumber && e.cardNumber !== '0' && meosIndex.byCard.has(String(e.cardNumber))) || meosIndex.byName.has(`${e.name.first.toLowerCase()} ${e.name.last.toLowerCase()}`);
              return inMeos ? <Tag color="green">In MeOS</Tag> : <Tag color="red">Missing</Tag>;
            }
          },
          { 
            title: <span style={{ fontWeight: 700, fontSize: '13px' }}>Actions</span>, 
            key: 'actions',
            render: (_: any, row: any) => {
            const e = row.entry;
            const classReg = row.classReg;
            const isPrimary = row.isPrimary;
            const totalClasses = row.totalClasses;
            
            return (
              <Space size="small">
                {/* Show Edit button only on the first row for this runner, placeholder on others */}
                {isPrimary ? (
                  <Button 
                    size="small" 
                    icon={<EditOutlined />} 
                    onClick={()=>{setSelected(e); setEditOpen(true);}}
                    style={{ 
                      backgroundColor: '#f0f5ff', 
                      borderColor: '#adc6ff',
                      fontWeight: 600,
                      fontSize: '13px',
                      width: '72px'
                    }}
                  >
                    Edit
                  </Button>
                ) : (
                  <div style={{ width: '72px', display: 'inline-block' }} />
                )}
                
                {/* Delete button - deletes just this class or entire entry if only one class */}
                <Button
                  size="small" 
                  danger 
                  icon={<DeleteOutlined />}
                  onClick={() => {
                    const deleteMessage = totalClasses > 1 
                      ? `Remove ${e.name.first} ${e.name.last} from ${classReg.className}?` 
                      : `Delete ${e.name.first} ${e.name.last}?`;
                    const deleteContent = totalClasses > 1
                      ? `This will remove them from ${classReg.className} only. They will remain registered for their other class(es).`
                      : `This will permanently remove this entry from the system.`;
                    
                    Modal.confirm({
                      title: deleteMessage,
                      content: deleteContent,
                      okText: 'Delete',
                      okType: 'danger',
                      onOk: () => {
                        // Check if this class is already checked in
                        if (classReg.status === 'checked-in') {
                          message.error(`Cannot delete ${classReg.className} - runner is already checked in. Uncheck-in first.`);
                          return;
                        }
                        
                        if (totalClasses > 1) {
                          // Remove just this class registration
                          if (classReg.classId === e.classId) {
                            // Removing the primary class - promote an additional class to primary
                            const additionalClasses = e.additionalClasses || [];
                            if (additionalClasses.length > 0) {
                              const newPrimary = additionalClasses[0];
                              const remainingAdditional = additionalClasses.slice(1);
                              
                              const success = localEntryService.updateEntry(e.id, {
                                classId: newPrimary.classId,
                                className: newPrimary.className,
                                fee: newPrimary.fee,
                                status: newPrimary.status,
                                checkedInAt: newPrimary.checkedInAt,
                                submittedToMeosAt: newPrimary.submittedToMeosAt,
                                additionalClasses: remainingAdditional
                              });
                              
                              if (success) {
                                message.success(`Removed ${e.name.first} ${e.name.last} from ${classReg.className}`);
                                refresh();
                              }
                            }
                          } else {
                            // Removing an additional class
                            const updated = e.additionalClasses?.filter((c: ClassRegistration) => c.classId !== classReg.classId);
                            const success = localEntryService.updateEntry(e.id, { additionalClasses: updated });
                            if (success) {
                              message.success(`Removed ${e.name.first} ${e.name.last} from ${classReg.className}`);
                              refresh();
                            }
                          }
                        } else {
                          // Delete entire entry
                          const success = localEntryService.deleteEntry(e.id);
                          if (success) {
                            message.success(`Deleted ${e.name.first} ${e.name.last}`);
                            refresh();
                          } else {
                            message.error('Failed to delete entry');
                          }
                        }
                      }
                    });
                  }}
                  style={{ 
                    backgroundColor: '#fff1f0', 
                    borderColor: '#ffccc7',
                    fontWeight: 600,
                    fontSize: '13px'
                  }}
                >
                  Delete
                </Button>
                
                {/* Check In button - opens edit modal to confirm before checking in */}
                {classReg.status !== 'checked-in' ? (
                  <Button 
                    size="small" 
                    type="primary" 
                    icon={<LoginOutlined />} 
                    style={{ fontWeight: 600, fontSize: '13px' }}
                    onClick={()=>{
                      // Open edit modal to confirm information before checking in
                      setSelected(e);
                      setEditOpen(true);
                    }}
                  >
                    Check In
                  </Button>
                ) : (
                  <Button 
                    size="small" 
                    danger 
                    style={{ fontWeight: 600, fontSize: '13px' }}
                    onClick={()=>{
                    // Uncheck-in: revert to pending for this class
                    if (classReg.classId === e.classId) {
                      // Primary class
                      const upd = localEntryService.updateEntry(e.id, { status: 'pending', checkedInAt: undefined, submittedToMeosAt: undefined });
                      if (upd) { message.success('Set to pending'); refresh(); }
                    } else {
                      // Additional class
                      const updated = e.additionalClasses?.map((c: ClassRegistration) => 
                        c.classId === classReg.classId
                          ? { ...c, status: 'pending' as const, checkedInAt: undefined, submittedToMeosAt: undefined }
                          : c
                      );
                      const upd = localEntryService.updateEntry(e.id, { additionalClasses: updated });
                      if (upd) { message.success('Set to pending'); refresh(); }
                    }
                  }}>Uncheck-In</Button>
                )}
              </Space>
            );
          }}
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

      {/* Runner Database Lookup */}
      <RunnerLookupSQLite open={runnerDbOpen} onClose={()=>setRunnerDbOpen(false)} />

    </div>
  );
};

export default EventDayHome;
