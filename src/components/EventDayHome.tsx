import React, { useState } from 'react';
import { Card, Row, Col, Button, Typography, Statistic, Table, Input, Tag, Space, Badge, message, Alert } from 'antd';
import { CheckCircleOutlined, UserAddOutlined, DatabaseOutlined, ArrowLeftOutlined, UsbOutlined, EditOutlined, IdcardOutlined, LoginOutlined, ReloadOutlined } from '@ant-design/icons';
import { localEntryService, type LocalEntry } from '../services/localEntryService';
import { eventMetaService } from '../services/eventMetaService';
import SameDayRegistration from './SameDayRegistration';
import EntryEditModal from './EntryEditModal';
import { sportIdentService, type SICardReadEvent } from '../services/sportIdentService';
import { meosApi } from '../services/meosApi';

const { Title, Paragraph, Text } = Typography;

interface EventDayHomeProps {
  onBack?: () => void;
}

const EventDayHome: React.FC<EventDayHomeProps> = ({ onBack }) => {
  const [showSameDay, setShowSameDay] = useState(false);
  const [entries, setEntries] = useState<LocalEntry[]>(localEntryService.getAllEntries());
  const [filter, setFilter] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [selected, setSelected] = useState<LocalEntry | null>(null);
  const [lastCard, setLastCard] = useState<string | null>(null);
  const [readerStatus, setReaderStatus] = useState(sportIdentService.getStatus());
  const [meosIndex, setMeosIndex] = useState<{ byCard: Set<string>; byName: Set<string> } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [filterKey, setFilterKey] = useState<'all' | 'pending' | 'checked-in' | 'needsRental'>('all');

  const refresh = () => setEntries(localEntryService.getAllEntries());

  React.useEffect(() => {
    const cb = (ev: SICardReadEvent) => {
      setReaderStatus(sportIdentService.getStatus());
      if (ev.type === 'card_read' && ev.card) {
        const cnum = ev.card.cardNumber.toString();
        setLastCard(cnum);
        // auto-match pending entry by card
        const match = entries.find(e => e.status === 'pending' && e.cardNumber === cnum);
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
  }, [entries]);

  const totalEntries = entries.length;
  const checkedIn = entries.filter(e => e.status === 'checked-in').length;
  const pending = totalEntries - checkedIn;
  const needsRental = entries.filter(e => e.issues?.needsRentalCard).length;
  const meta = eventMetaService.get();

  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
      {onBack && (
        <div style={{ marginBottom: 16 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={onBack} size="large">
            Back to Operations
          </Button>
        </div>
      )}

      <Title level={2} style={{ marginBottom: 8 }}>Event Day Dashboard</Title>
      <Text type="secondary">Check-in pre-registered runners or register new entries</Text>

      {meta && (
        <Alert
          style={{ marginTop: 12 }}
          type="success"
          showIcon
          message={meta.name}
          description={<Text type="secondary">Date: {meta.date || 'N/A'}</Text>}
        />
      )}

      <Row gutter={[16, 16]} style={{ marginTop: 16, marginBottom: 16 }}>
        <Col xs={24} sm={6}>
          <Card hoverable onClick={() => setFilterKey('all')}>
            <Statistic title="Total Entries" value={totalEntries} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card hoverable onClick={() => setFilterKey('checked-in')}>
            <Statistic title="Checked In" value={checkedIn} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card hoverable onClick={() => setFilterKey('pending')}>
            <Statistic title="Pending" value={pending} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card hoverable onClick={() => setFilterKey('needsRental')}>
            <Statistic title="Needs Rental" value={needsRental} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            <Space>
              <UsbOutlined />
              <Badge status={readerStatus.connected ? 'success' : 'error'} text={readerStatus.connected ? 'Reader Connected' : 'Reader Disconnected'} />
              {lastCard && <Tag color="green">Last: {lastCard}</Tag>}
              {!readerStatus.connected && (
                <Button size="small" icon={<UsbOutlined />} onClick={async ()=>{try{await sportIdentService.connect(); setReaderStatus(sportIdentService.getStatus());}catch{}}}>Connect</Button>
              )}
            </Space>
          </Card>
        </Col>
      </Row>

      <Card style={{ marginTop: 16, marginBottom: 12 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <Button type="primary" icon={<UserAddOutlined />} onClick={() => setShowSameDay(true)}>
              New Registration
            </Button>
            <Input.Search 
              allowClear 
              placeholder="Search name, club, or card"
              value={filter}
              onChange={(e)=>setFilter(e.target.value)}
              style={{ width: 320 }}
            />
            <Button icon={<ReloadOutlined />} onClick={refresh}>Refresh</Button>
          </Space>
          <Space>
            <Button loading={verifying} onClick={async ()=>{
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

      <Table
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
        columns={[
          { title: 'Name', dataIndex: 'name', key: 'name', sorter: (a: LocalEntry, b: LocalEntry) => (`${a.name.last} ${a.name.first}`).localeCompare(`${b.name.last} ${b.name.first}`), render: (_: any, r: LocalEntry) => `${r.name.first} ${r.name.last}` },
          { title: 'Club', dataIndex: 'club', key: 'club', sorter: (a: LocalEntry, b: LocalEntry) => a.club.localeCompare(b.club) },
          { title: 'Class', dataIndex: 'className', key: 'className', sorter: (a: LocalEntry, b: LocalEntry) => (a.className||'').localeCompare(b.className||'') },
          { title: 'Card', dataIndex: 'cardNumber', key: 'cardNumber', sorter: (a: LocalEntry, b: LocalEntry) => (parseInt(a.cardNumber||'0')||0) - (parseInt(b.cardNumber||'0')||0), render: (v: string) => v && v !== '0' ? <Tag>#{v}</Tag> : <Tag color="warning">None</Tag> },
          { title: 'Status', key: 'status', sorter: (a: LocalEntry, b: LocalEntry) => a.status.localeCompare(b.status), render: (_: any, r: LocalEntry) => r.status === 'checked-in' ? <Tag color="green">Checked In</Tag> : <Tag>Pending</Tag> },
          { title: 'Rental?', key: 'rental', sorter: (a: LocalEntry, b: LocalEntry) => Number(!!a.issues?.needsRentalCard) - Number(!!b.issues?.needsRentalCard), render: (_: any, r: LocalEntry) => r.issues?.needsRentalCard ? <Tag color="red">Needs Rental</Tag> : null },
          { title: 'MeOS', key: 'meos', render: (_:any, r: LocalEntry) => {
              if (r.status !== 'checked-in') return <Tag>-</Tag>;
              if (!meosIndex) return <Tag>Unknown</Tag>;
              const inMeos = (r.cardNumber && r.cardNumber !== '0' && meosIndex.byCard.has(String(r.cardNumber))) || meosIndex.byName.has(`${r.name.first.toLowerCase()} ${r.name.last.toLowerCase()}`);
              return inMeos ? <Tag color="green">In MeOS</Tag> : <Tag color="red">Missing</Tag>;
            }
          },
          { title: 'Actions', key: 'actions', render: (_: any, r: LocalEntry) => (
            <Space>
              <Button size="small" icon={<EditOutlined />} onClick={()=>{setSelected(r); setEditOpen(true);}}>Edit</Button>
              {r.status !== 'checked-in' && (
                <>
                  <Button size="small" icon={<IdcardOutlined />} onClick={()=>{
                    if (lastCard) {
                      const u = localEntryService.updateEntry(r.id, { cardNumber: lastCard, isHiredCard: true });
                      if (u) { message.success(`Assigned card ${lastCard}`); refresh(); }
                    } else {
                      message.info('Scan a card, then click Assign Last Card');
                    }
                  }}>Assign Last Card</Button>
                  <Button size="small" type="primary" icon={<LoginOutlined />} onClick={()=>{
                    // Open edit modal to confirm info before check-in
                    setSelected(r);
                    setEditOpen(true);
                  }}>Check In</Button>
                </>
              )}
            </Space>
          )}
        ]}
      />

      <Card style={{ marginTop: 24 }}>
        <Title level={4}><DatabaseOutlined /> Notes</Title>
        <Paragraph type="secondary">Scan card at any time: if matched, the entry opens for quick edit; otherwise assign it to a selected runner with "Assign Last Card".</Paragraph>
      </Card>

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
        onClose={()=>{setShowSameDay(false); refresh();}}
      />
    </div>
  );
};

export default EventDayHome;
