import React, { useState, useEffect } from 'react';
import {
  Modal,
  Alert,
  Space,
  Typography,
  Button,
  Card,
  Row,
  Col,
  List,
  Tag,
  Input,
  message,
  Divider,
  Tooltip,
  Badge,
  Spin
} from 'antd';
import {
  UsbOutlined,
  IdcardOutlined,
  LoginOutlined,
  UserOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  SearchOutlined,
  ReloadOutlined,
  UserAddOutlined
} from '@ant-design/icons';
import { sportIdentService, type SICard, type SICardReadEvent } from '../services/sportIdentService';
import { localEntryService, type LocalEntry } from '../services/localEntryService';
import { meosHiredCardService } from '../services/meosHiredCardService';
import { meosApi } from '../services/meosApi';
import { meosClassService } from '../services/meosClassService';
import SameDayRegistration from './SameDayRegistration';

const { Title, Text } = Typography;

interface CardReaderCheckInProps {
  visible: boolean;
  onClose: () => void;
  onEntryCheckedIn?: (entry: LocalEntry, cardNumber: string) => void;
}

interface CardReadResult {
  card: SICard;
  matchedEntries: LocalEntry[];
  suggestedEntries: LocalEntry[];
  timestamp: Date;
  isHiredCard?: boolean;
}

const CardReaderCheckIn: React.FC<CardReaderCheckInProps> = ({
  visible,
  onClose,
  onEntryCheckedIn
}) => {
  const [readerStatus, setReaderStatus] = useState(sportIdentService.getStatus());
  const [cardReads, setCardReads] = useState<CardReadResult[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [entries, setEntries] = useState<LocalEntry[]>([]);
  const [sameDayRegistrationVisible, setSameDayRegistrationVisible] = useState(false);
  const [registrationCardNumber, setRegistrationCardNumber] = useState<string>('');

  // Load entries when modal opens
  useEffect(() => {
    if (visible) {
      setEntries(localEntryService.getAllEntries());
    }
  }, [visible]);

  // Set up card reader event listener
  useEffect(() => {
    if (!visible) return;

    const handleCardReadEvent = (event: SICardReadEvent) => {
      setReaderStatus(sportIdentService.getStatus());

      if (event.type === 'card_read' && event.card) {
        handleCardRead(event.card);
      }
    };

    sportIdentService.addCallback(handleCardReadEvent);

    // Update reader status periodically
    const statusInterval = setInterval(() => {
      setReaderStatus(sportIdentService.getStatus());
    }, 2000);

    return () => {
      sportIdentService.removeCallback(handleCardReadEvent);
      clearInterval(statusInterval);
    };
  }, [visible, entries]);

  const handleCardRead = async (card: SICard) => {
    console.log('[CardReaderCheckIn] Card read:', card);
    console.log('[CardReaderCheckIn] Card number as string:', card.cardNumber.toString());

    // Check if this card is a hired card in MeOS
    let isHiredCard = await meosHiredCardService.isCardInMeos(card.cardNumber.toString());
    console.log(`[CardReaderCheckIn] Card ${card.cardNumber} is hired card (from MeOS):`, isHiredCard);
    
    // TEMPORARY OVERRIDE: Force card 8508148 to be treated as personal card for testing
    if (card.cardNumber.toString() === '8508148') {
      console.log(`[CardReaderCheckIn] TEMPORARY OVERRIDE: Forcing card 8508148 to be treated as personal card`);
      isHiredCard = false;
    }
    
    // Debug: Get the current MeOS hired cards list
    const meosHiredCards = await meosHiredCardService.getMeosHiredCards();
    console.log('[CardReaderCheckIn] Current MeOS hired cards:', meosHiredCards);

    // Find entries that match this card number
    const matchedEntries = entries.filter(entry => 
      entry.cardNumber === card.cardNumber.toString() && entry.status === 'pending'
    );
    console.log(`[CardReaderCheckIn] Found ${matchedEntries.length} matching entries for card ${card.cardNumber}:`, matchedEntries.map(e => `${e.name.first} ${e.name.last} (${e.status})`));

    // Find entries that need cards (potential matches for rental cards)
    const suggestedEntries = entries.filter(entry => 
      entry.issues.needsRentalCard && entry.status === 'pending'
    ).slice(0, 5); // Limit to top 5 suggestions
    console.log(`[CardReaderCheckIn] Found ${suggestedEntries.length} entries needing rental cards:`, suggestedEntries.map(e => `${e.name.first} ${e.name.last}`));

    const result: CardReadResult = {
      card,
      matchedEntries,
      suggestedEntries,
      timestamp: new Date(),
      isHiredCard
    };

    // Add to beginning of list (most recent first)
    setCardReads(prev => [result, ...prev.slice(0, 9)]); // Keep last 10 reads

    // Decision flow for card handling
    console.log(`[CardReaderCheckIn] Decision flow for card ${card.cardNumber}:`);
    console.log(`[CardReaderCheckIn] - matchedEntries.length: ${matchedEntries.length}`);
    console.log(`[CardReaderCheckIn] - suggestedEntries.length: ${suggestedEntries.length}`);
    console.log(`[CardReaderCheckIn] - isHiredCard: ${isHiredCard}`);
    
    // Auto-check-in if we have an exact match
    if (matchedEntries.length === 1) {
      console.log(`[CardReaderCheckIn] DECISION: Auto-checking in single matched entry`);
      handleCheckInEntry(matchedEntries[0], card.cardNumber.toString());
    } else if (matchedEntries.length > 1) {
      console.log(`[CardReaderCheckIn] DECISION: Multiple entries found, showing warning`);
      message.warning(`Multiple entries found for card ${card.cardNumber}. Please select one.`);
    } else if (isHiredCard) {
      console.log(`[CardReaderCheckIn] DECISION: Hired card detected, showing rental assignment`);
      message.success(`✅ Hired card ${card.cardNumber} detected - ready for assignment!`);
    } else {
      console.log(`[CardReaderCheckIn] DECISION: Personal card with no matching entry - opening same-day registration`);
      // This is a personal card with no matching entry - open same-day registration
      setRegistrationCardNumber(card.cardNumber.toString());
      setSameDayRegistrationVisible(true);
      message.info(`Personal card ${card.cardNumber} detected. Opening registration form...`);
    }
  };

  const handleCheckInEntry = async (entry: LocalEntry, cardNumber: string) => {
    setCheckingIn(entry.id);
    
    try {
      // Check in the entry with the scanned card number
      const updatedEntry = localEntryService.checkInEntry(entry.id, cardNumber);
      
      if (updatedEntry) {
        message.loading(`🔄 ${entry.name.first} ${entry.name.last} checked in - submitting to MeOS...`, 0);
        
        // Auto-submit to MeOS after local check-in
        try {
          await submitToMeOS(updatedEntry);
          message.destroy();
          message.success(`✅ ${entry.name.first} ${entry.name.last} checked in and submitted to MeOS!`);
        } catch (meosError) {
          message.destroy();
          console.warn('MeOS submission failed:', meosError);
          message.warning(`⚠️ ${entry.name.first} ${entry.name.last} checked in locally, but MeOS submission failed. You can retry later from the dashboard.`);
        }
        
        // Update local entries list
        setEntries(localEntryService.getAllEntries());
        
        // Notify parent
        if (onEntryCheckedIn) {
          onEntryCheckedIn(updatedEntry, cardNumber);
        }
        
        // Remove this card read from the list since it's been processed
        setCardReads(prev => prev.filter(read => 
          !(read.card.cardNumber.toString() === cardNumber && 
            read.matchedEntries.some(e => e.id === entry.id))
        ));
      } else {
        message.error('Failed to check in entry');
      }
    } catch (error) {
      console.error('Check-in error:', error);
      message.error('Check-in failed');
    } finally {
      setCheckingIn(null);
    }
  };

  // Helper function to submit entry to MeOS
  const submitToMeOS = async (entry: LocalEntry): Promise<void> => {
    console.log(`[CardReaderCheckIn] Submitting ${entry.name.first} ${entry.name.last} to MeOS...`);
    
    // Convert local entry to MeOS entry format with proper class mapping
    const classId = await getMeosClassId(entry.className, entry.classId);
    
    console.log(`[CardReaderCheckIn] Converting entry: className="${entry.className}", classId="${entry.classId}" -> MeOS classId=${classId}`);
    console.log(`[CardReaderCheckIn] Hired card debug: isHiredCard=${entry.isHiredCard}, cardNumber=${entry.cardNumber}`);
    
    const meosEntryParams = {
      name: `${entry.name.first} ${entry.name.last}`,
      club: entry.club,
      classId: classId,
      cardNumber: parseInt(entry.cardNumber) || 0,
      // Note: MeOS determines hired card status from its internal hired card database
      phone: entry.phone,
      birthYear: entry.birthYear ? parseInt(entry.birthYear) : undefined,
      sex: entry.sex as 'M' | 'F' | undefined,
      nationality: entry.nationality,
    };
    
    console.log(`[CardReaderCheckIn] MeOS entry params:`, meosEntryParams);
    console.log(`[CardReaderCheckIn] Card ${entry.cardNumber} hired status will be determined by MeOS internal database`);

    // Submit to MeOS
    const meosResult = await meosApi.createEntry(meosEntryParams);
    
    if (meosResult.success) {
      // Mark as submitted to MeOS
      localEntryService.markSubmittedToMeos(entry.id);
      console.log(`[CardReaderCheckIn] Successfully submitted ${entry.name.first} ${entry.name.last} to MeOS`);
    } else {
      throw new Error(meosResult.error || 'Unknown MeOS error');
    }
  };

  // Helper function to convert class name/ID to MeOS class ID using service
  const getMeosClassId = async (className: string, classId: string): Promise<number> => {
    const result = await meosClassService.getClassId(className, classId);
    console.log(`[CardReaderCheckIn] ClassMapping: className="${className}", classId="${classId}" -> MeOS class ${result.id} (${result.method})`);
    return result.id;
  };

  const handleConnectReader = async () => {
    try {
      await sportIdentService.connect();
      message.success('Connected to card reader');
    } catch (error) {
      console.error('Connection failed:', error);
      message.error('Failed to connect to card reader');
    }
  };

  const handleSameDayRegistrationComplete = (entry: LocalEntry, cardNumber: string) => {
    console.log(`[CardReaderCheckIn] Same-day registration complete for ${entry.name.first} ${entry.name.last}`);
    
    // Refresh entries list to include the new entry
    setEntries(localEntryService.getAllEntries());
    
    // Remove any card reads for this card since it's now registered and checked in
    setCardReads(prev => prev.filter(read => read.card.cardNumber.toString() !== cardNumber));
    
    // Notify parent if provided
    if (onEntryCheckedIn) {
      onEntryCheckedIn(entry, cardNumber);
    }
  };

  const handleCloseSameDayRegistration = () => {
    setSameDayRegistrationVisible(false);
    setRegistrationCardNumber('');
  };

  const getFilteredEntries = () => {
    if (!searchTerm) return [];
    
    const search = searchTerm.toLowerCase();
    return entries.filter(entry =>
      entry.status === 'pending' && (
        `${entry.name.first} ${entry.name.last}`.toLowerCase().includes(search) ||
        entry.club.toLowerCase().includes(search) ||
        entry.cardNumber.includes(search)
      )
    ).slice(0, 10); // Limit results
  };

  const renderCardReadResult = (result: CardReadResult) => {
    const { card, matchedEntries, suggestedEntries, isHiredCard } = result;
    
    return (
      <Card 
        key={`${card.cardNumber}-${result.timestamp.getTime()}`}
        size="small" 
        style={{ 
          marginBottom: '12px',
          borderColor: isHiredCard ? '#52c41a' : undefined,
          backgroundColor: isHiredCard ? '#f6ffed' : undefined
        }}
        title={
          <Space>
            <IdcardOutlined style={{ color: isHiredCard ? '#52c41a' : undefined }} />
            <Text strong>Card {card.cardNumber}</Text>
            {isHiredCard && <Tag color="green">MeOS Hired Card</Tag>}
            <Text type="secondary" style={{ fontSize: '12px' }}>
              SI{card.cardSeries} • {result.timestamp.toLocaleTimeString()}
            </Text>
          </Space>
        }
      >
        {/* Exact Matches */}
        {matchedEntries.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <Text strong style={{ color: '#52c41a' }}>
              <CheckCircleOutlined /> Exact Matches ({matchedEntries.length})
            </Text>
            <List
              size="small"
              dataSource={matchedEntries}
              renderItem={(entry) => (
                <List.Item
                  actions={[
                    <Button
                      key="checkin"
                      type="primary"
                      size="small"
                      icon={<LoginOutlined />}
                      loading={checkingIn === entry.id}
                      onClick={() => handleCheckInEntry(entry, card.cardNumber.toString())}
                    >
                      Check In
                    </Button>
                  ]}
                >
                  <List.Item.Meta
                    avatar={<UserOutlined />}
                    title={`${entry.name.first} ${entry.name.last}`}
                    description={
                      <Space>
                        <Text>{entry.className}</Text>
                        <Text type="secondary">{entry.club}</Text>
                        <Tag color="blue">Card {entry.cardNumber}</Tag>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </div>
        )}

        {/* No Matches - Show Rental Suggestions */}
        {matchedEntries.length === 0 && suggestedEntries.length > 0 && (
          <div>
            <Text strong style={{ color: isHiredCard ? '#52c41a' : '#fa8c16' }}>
              {isHiredCard ? <CheckCircleOutlined /> : <WarningOutlined />} 
              {isHiredCard ? 'MeOS Hired Card - Select Entry to Assign' : 'Possible Rental Card Assignment'}
            </Text>
            <Text type="secondary" style={{ display: 'block', marginBottom: '8px', fontSize: '12px' }}>
              {isHiredCard 
                ? 'This is a confirmed hired card from MeOS. Select an entry to assign it to:' 
                : 'These entries need rental cards - could this be one of them?'
              }
            </Text>
            <List
              size="small"
              dataSource={suggestedEntries}
              renderItem={(entry) => (
                <List.Item
                  actions={[
                    <Button
                      key="assign"
                      type={isHiredCard ? 'primary' : 'default'}
                      size="small"
                      icon={<IdcardOutlined />}
                      loading={checkingIn === entry.id}
                      onClick={() => handleCheckInEntry(entry, card.cardNumber.toString())}
                    >
                      {isHiredCard ? 'Assign Hired Card' : 'Assign & Check In'}
                    </Button>
                  ]}
                >
                  <List.Item.Meta
                    avatar={<UserOutlined />}
                    title={`${entry.name.first} ${entry.name.last}`}
                    description={
                      <Space>
                        <Text>{entry.className}</Text>
                        <Text type="secondary">{entry.club}</Text>
                        <Tag color="orange">Needs Card</Tag>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </div>
        )}

        {/* No Matches at All */}
        {matchedEntries.length === 0 && suggestedEntries.length === 0 && (
          <div>
            <Alert
              message={isHiredCard ? 'MeOS Hired Card - No Rental Entries Found' : 'Personal Card - Same Day Registration'}
              description={
                isHiredCard
                  ? 'This is a confirmed hired card from MeOS, but no entries need rental cards. The card may already be assigned, or all entries may already have cards.'
                  : 'This appears to be a personal card. Would you like to register this runner for same-day entry?'
              }
              type={isHiredCard ? 'warning' : 'info'}
              showIcon
              action={
                !isHiredCard ? (
                  <Button 
                    size="small" 
                    type="primary"
                    icon={<UserAddOutlined />}
                    onClick={() => {
                      setRegistrationCardNumber(card.cardNumber.toString());
                      setSameDayRegistrationVisible(true);
                    }}
                  >
                    Register Runner
                  </Button>
                ) : undefined
              }
            />
          </div>
        )}
      </Card>
    );
  };

  return (
    <Modal
      title={
        <Space>
          <UsbOutlined />
          Card Reader Check-In
          <Badge 
            status={readerStatus.connected ? 'success' : 'default'} 
            text={readerStatus.connected ? 'Connected' : 'Disconnected'} 
          />
        </Space>
      }
      open={visible}
      onCancel={onClose}
      width={800}
      footer={[
        <Button key="close" onClick={onClose}>
          Close
        </Button>
      ]}
    >
      {/* Reader Connection Status */}
      {!readerStatus.connected && (
        <Alert
          message="Card Reader Not Connected"
          description={
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text>Connect your SportIdent BSF8 reader to start scanning cards.</Text>
              <Button 
                type="primary" 
                icon={<UsbOutlined />}
                onClick={handleConnectReader}
              >
                Connect Reader
              </Button>
            </Space>
          }
          type="warning"
          showIcon
          style={{ marginBottom: '16px' }}
        />
      )}

      {readerStatus.connected && (
        <Alert
          message="Reader Ready"
          description={
            <Space>
              <CheckCircleOutlined style={{ color: '#52c41a' }} />
              <Text>Place cards on the reader to check in entries automatically.</Text>
              <Text type="secondary">
                ({readerStatus.readCount} cards read)
              </Text>
            </Space>
          }
          type="success"
          showIcon
          style={{ marginBottom: '16px' }}
        />
      )}

      {/* Manual Search */}
      <Card size="small" title="Manual Entry Search" style={{ marginBottom: '16px' }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input
            placeholder="Search by name, club, or card number..."
            prefix={<SearchOutlined />}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            allowClear
          />
          
          {searchTerm && (
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              <List
                size="small"
                dataSource={getFilteredEntries()}
                renderItem={(entry) => (
                  <List.Item
                    actions={[
                      <Button
                        key="checkin"
                        type="primary"
                        size="small"
                        icon={<LoginOutlined />}
                        loading={checkingIn === entry.id}
                        onClick={() => handleCheckInEntry(entry, entry.cardNumber)}
                      >
                        Check In
                      </Button>
                    ]}
                  >
                    <List.Item.Meta
                      avatar={<UserOutlined />}
                      title={`${entry.name.first} ${entry.name.last}`}
                      description={
                        <Space>
                          <Text>{entry.className}</Text>
                          <Text type="secondary">{entry.club}</Text>
                          <Tag color={entry.issues.needsRentalCard ? 'orange' : 'blue'}>
                            {entry.issues.needsRentalCard ? 'Needs Card' : `Card ${entry.cardNumber}`}
                          </Tag>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            </div>
          )}
        </Space>
      </Card>

      {/* Card Read Results */}
      {cardReads.length > 0 && (
        <div>
          <Title level={5}>
            <Space>
              <IdcardOutlined />
              Recent Card Reads
              <Badge count={cardReads.length} />
            </Space>
          </Title>
          
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {cardReads.map(renderCardReadResult)}
          </div>
        </div>
      )}

      {/* Empty State */}
      {readerStatus.connected && cardReads.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <IdcardOutlined style={{ fontSize: '48px', color: '#ccc', marginBottom: '16px' }} />
          <Text type="secondary">
            Waiting for card reads...<br/>
            Place a SportIdent card on the reader to begin.
          </Text>
        </div>
      )}

      {/* Same Day Registration Modal */}
      <SameDayRegistration
        visible={sameDayRegistrationVisible}
        onClose={handleCloseSameDayRegistration}
        cardNumber={registrationCardNumber}
        onRegistrationComplete={handleSameDayRegistrationComplete}
      />
    </Modal>
  );
};

export default CardReaderCheckIn;
