// Event Day Dashboard Component
import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Tag,
  Space,
  Button,
  Alert,
  Typography,
  Row,
  Col,
  Statistic,
  Input,
  Select,
  Tooltip,
  Upload,
  App,
  Modal,
  Form,
  Dropdown,
  Checkbox
} from 'antd';
import {
  ReloadOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  SearchOutlined,
  FilterOutlined,
  UserOutlined,
  IdcardOutlined,
  CloudDownloadOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  EditOutlined,
  LoginOutlined,
  DatabaseOutlined,
  CheckOutlined,
  HistoryOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { meosApi } from '../services/meosApi';
import { localEntryService, type LocalEntry } from '../services/localEntryService';
import { meosClassService } from '../services/meosClassService';
// import { runnerDatabaseService } from '../services/runnerDatabaseService'; // Disabled - causes CORS errors
import { localRunnerService } from '../services/localRunnerService';
import { meosRunnerDatabaseClient } from '../services/meosRunnerDatabaseClient';
import type { ColumnsType } from 'antd/es/table';
import CardReaderPanel from './CardReaderPanel';
import type { SICard } from '../services/sportIdentService';
import { meosHiredCardService } from '../services/meosHiredCardService';

const { Title, Text } = Typography;
const { Search } = Input;
const { Option } = Select;

// Using LocalEntry interface from localEntryService

const EventDayDashboard: React.FC = () => {
  const { message } = App.useApp();
  const [entries, setEntries] = useState<LocalEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filterIssues, setFilterIssues] = useState<string>('all');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedClub, setSelectedClub] = useState<string>('all');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LocalEntry | null>(null);
  const [editForm] = Form.useForm();
  const [runnerLookupLoading, setRunnerLookupLoading] = useState(false);
  const [clubLookupLoading, setClubLookupLoading] = useState(false);
  const [runnerSuggestions, setRunnerSuggestions] = useState<any[]>([]);
  const [clubSuggestions, setClubSuggestions] = useState<any[]>([]);
  const [currentGroupSize, setCurrentGroupSize] = useState<number>(1);
  const [classesLoading, setClassesLoading] = useState(false);
  const [rollbackPoints, setRollbackPoints] = useState<any[]>([]);
  const [rollbackLoading, setRollbackLoading] = useState(false);
  
  // Multi-selection state
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  
  // New entry state
  const [newEntryModalVisible, setNewEntryModalVisible] = useState(false);
  const [newEntryForm] = Form.useForm();
  const [newEntryGroupSize, setNewEntryGroupSize] = useState<number>(1);
  const [availableClasses, setAvailableClasses] = useState<any[]>([]);
  const [runnerLookupTimeout, setRunnerLookupTimeout] = useState<NodeJS.Timeout | null>(null);
  const [runnerLookupAvailable, setRunnerLookupAvailable] = useState<boolean>(true);
  
  // Pagination state
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 100,
    showTotal: (total: number, range: [number, number]) => `${range[0]}-${range[1]} of ${total} entries`,
    showSizeChanger: true,
    showQuickJumper: true,
    pageSizeOptions: ['50', '100', '200', '500'],
  });

  // Card reader state
  
  // Card confirmation modal state
  const [cardConfirmationVisible, setCardConfirmationVisible] = useState(false);
  const [scannedCard, setScannedCard] = useState<SICard | null>(null);
  const [matchedEntry, setMatchedEntry] = useState<LocalEntry | null>(null);
  const [suggestedEntries, setSuggestedEntries] = useState<LocalEntry[]>([]);
  const [isHiredCard, setIsHiredCard] = useState(false);
  
  // Card edit mode state
  const [cardEditMode, setCardEditMode] = useState(false);
  const [cardEditForm] = Form.useForm();


  // Load entries and MeOS classes on component mount
  useEffect(() => {
    loadEntries();
    loadMeosClasses();
    loadRollbackPoints();
    setSelectedRowKeys([]);
    
    return () => {
      setSelectedRowKeys([]);
    };
  }, []);
  
  // Ensure row selection state is properly initialized after entries load
  useEffect(() => {
    if (entries.length > 0 && selectedRowKeys.length > 0) {
      // Filter out any selected keys that no longer exist in entries
      const validKeys = selectedRowKeys.filter(key => 
        entries.some(entry => entry.id === key)
      );
      if (validKeys.length !== selectedRowKeys.length) {
        console.log('[EventDay] Cleaning up invalid selection keys');
        setSelectedRowKeys(validKeys);
      }
    }
  }, [entries, selectedRowKeys]);
  
  // Reset pagination to first page when filters change significantly
  useEffect(() => {
    const filteredEntries = getFilteredEntries();
    if (pagination.current > 1 && filteredEntries.length <= pagination.pageSize) {
      console.log('[EventDay] Resetting pagination due to filter change');
      setPagination(prev => ({ ...prev, current: 1 }));
    }
  }, [searchText, filterIssues, selectedClass, selectedClub, pagination.current, pagination.pageSize]);

  // Load available classes from MeOS
  const loadMeosClasses = async () => {
    setClassesLoading(true);
    try {
      const classes = await meosClassService.getClasses(true); // Force refresh
      console.log(`[EventDay] Loaded ${classes.length} classes from MeOS:`, classes);
      
      if (classes.length > 0) {
        const classNames = classes.map(c => `${c.name}(${c.id})`).join(', ');
        console.log(`[EventDay] Available classes: ${classNames}`);
        // Removed verbose message - status shown in compact status bar instead
      } else {
        message.warning('No classes found in MeOS. Check if event is properly configured.');
      }
    } catch (error) {
      console.error('Failed to load MeOS classes:', error);
      message.error('Could not load class information from MeOS. Using fallback mapping.');
    } finally {
      setClassesLoading(false);
    }
  };

  const loadEntries = () => {
    setLoading(true);
    try {
      const entriesData = localEntryService.getAllEntries();
      console.log('[EventDay] Loaded entries from localStorage:', entriesData.length);
      
      if (entriesData.length > 0) {
        // Debug: Show class distribution and entry structure
        const classDistribution = entriesData.reduce((acc: any, entry) => {
          const key = `${entry.classId}|${entry.className}`;
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {});
        console.log('[EventDay] Class distribution in loaded entries:', classDistribution);
        
        // Debug: Show first entry structure to see what data is available
        console.log('[EventDay] First entry detailed structure:', {
          id: entriesData[0].id,
          name: entriesData[0].name,
          club: entriesData[0].club,
          birthYear: entriesData[0].birthYear,
          sex: entriesData[0].sex,
          nationality: entriesData[0].nationality,
          phone: entriesData[0].phone,
          classId: entriesData[0].classId,
          className: entriesData[0].className,
          cardNumber: entriesData[0].cardNumber,
          status: entriesData[0].status,
          full_entry: entriesData[0]
        });
      }
      
      setEntries(entriesData);
      // Entries loaded silently - count shown in statistics
      loadRollbackPoints(); // Refresh rollback points when entries change
    } catch (error) {
      console.error('Failed to load entries:', error);
      message.error('Failed to load entries from local storage');
    } finally {
      setLoading(false);
    }
  };

  // Backup management functions
  const handleExportBackup = async () => {
    try {
      const preferredDir = localEntryService.getSaveDirectoryPreference();
      await localEntryService.exportToFile();
      message.success(`Exported to ${preferredDir}/`);
    } catch (error) {
      console.error('Export failed:', error);
      message.error('Failed to export entries');
    }
  };

  const handleImportBackup = async (file: File) => {
    try {
      const result = await localEntryService.importFromFile(file);
      loadEntries(); // Refresh the display
      loadRollbackPoints(); // Refresh rollback points
      
      // Simplified import success message
      if (result.errors.length > 0) {
        message.warning(`Imported ${result.imported} entries (${result.errors.length} errors)`);
        console.warn('Import errors:', result.errors);
      } else {
        message.success(`Imported ${result.imported} entries`);
      }
      
      // Log detailed results
      console.log('[Import] Detailed results:', {
        imported: result.imported,
        errors: result.errors.length,
        meosChecked: result.meosChecked,
        meosUpdated: result.meosUpdated
      });
      
    } catch (error) {
      console.error('Import failed:', error);
      message.error('Failed to import entries');
    }
  };
  
  // Handle export hired cards CSV
  const handleExportHiredCards = async () => {
    try {
      const hiredCards = localEntryService.getHiredCardsList();
      
      if (hiredCards.length === 0) {
        message.warning('No hired cards found to export');
        return;
      }
      
      await localEntryService.exportHiredCardsCSV();
      
      // Show success message with instructions
      Modal.success({
        title: 'Hired Cards CSV Exported',
        content: (
          <div>
            <p><strong>Successfully exported {hiredCards.length} hired card numbers</strong></p>
            <p>Card numbers exported: {hiredCards.join(', ')}</p>
            <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: '6px' }}>
              <p><strong>🔧 MeOS Import Instructions:</strong></p>
              <ol>
                <li>Open MeOS software</li>
                <li>Go to <strong>SI tab</strong></li>
                <li>Select <strong>"Register Hired Cards"</strong> mode</li>
                <li>Click <strong>"Import..."</strong> button</li>
                <li>Select the <strong>dvoa_hired_cards.csv</strong> file</li>
                <li>When prompted, click <strong>"Yes"</strong> to apply hired card flags to existing runners</li>
              </ol>
              <p style={{ color: '#fa8c16', marginTop: '8px' }}>💡 This will fix the hired card flags for entries already submitted via REST API.</p>
            </div>
          </div>
        ),
        width: 600,
      });
      
    } catch (error) {
      console.error('Export hired cards failed:', error);
      message.error('Failed to export hired cards CSV');
    }
  };
  
  // Load available rollback points
  const loadRollbackPoints = () => {
    try {
      const points = localEntryService.getRollbackPoints();
      setRollbackPoints(points);
      console.log('[Rollback] Available rollback points:', points);
    } catch (error) {
      console.error('[Rollback] Failed to load rollback points:', error);
      setRollbackPoints([]);
    }
  };
  
  // Handle rollback to specific point
  const handleRollback = async (rollbackId: string, pointInfo: any) => {
    Modal.confirm({
      title: 'Rollback Confirmation',
      content: (
        <div>
          <p>Are you sure you want to rollback to:</p>
          <div style={{ padding: '12px', backgroundColor: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: '6px', margin: '12px 0' }}>
            <p><strong>Backup Point:</strong> {pointInfo.filename}</p>
            <p><strong>Timestamp:</strong> {pointInfo.timestamp}</p>
            <p><strong>Entries:</strong> {pointInfo.entryCount}</p>
          </div>
          <p style={{ color: '#cf1322', marginTop: '12px' }}>
            ⚠️ <strong>Warning:</strong> This will replace your current entries with the backup data.
          </p>
          <p style={{ fontSize: '14px', color: '#666' }}>
            Your current state will be backed up before rollback, so you can undo this action if needed.
          </p>
        </div>
      ),
      icon: <UndoOutlined style={{ color: '#fa8c16' }} />,
      okText: 'Rollback Now',
      okType: 'primary',
      cancelText: 'Cancel',
      onOk: async () => {
        setRollbackLoading(true);
        try {
          const result = await localEntryService.rollbackTo(rollbackId);
          
          if (result.success) {
            message.success(`✅ ${result.message}`);
            loadEntries(); // Refresh entries
            loadRollbackPoints(); // Refresh rollback points
          } else {
            message.error(`❌ Rollback failed: ${result.message}`);
          }
        } catch (error) {
          console.error('[Rollback] Rollback failed:', error);
          message.error('❌ Rollback failed due to an error');
        } finally {
          setRollbackLoading(false);
        }
      },
    });
  };

  // Delete entry with confirmation
  const handleDeleteEntry = (entry: LocalEntry) => {
    Modal.confirm({
      title: `Delete ${entry.name.first} ${entry.name.last}?`,
      content: `This will remove ${entry.name.first} ${entry.name.last} from ${entry.className}.`,
      okText: 'Delete',
      okType: 'danger',
      onOk: () => {
        try {
          const success = localEntryService.deleteEntry(entry.id);
          if (success) {
            message.success(`Deleted ${entry.name.first} ${entry.name.last}`);
            loadEntries();
          } else {
            message.error('Delete failed');
          }
        } catch (error) {
          console.error('Delete failed:', error);
          message.error('Delete failed');
        }
      },
    });
  };

  // Edit entry - open modal with form
  const handleEditEntry = (entry: LocalEntry) => {
    // Check if entry is already in MeOS and warn user about potential duplicates
    if (entry.submittedToMeosAt) {
      Modal.confirm({
        title: 'Edit Entry in MeOS',
        content: `${entry.name.first} ${entry.name.last} is already in MeOS. This will only edit the local copy.`,
        okText: 'Edit Local Copy',
        onOk: () => openEditModal(entry),
      });
    } else {
      openEditModal(entry);
    }
  };

  // Open the edit modal (separated for reuse)
  const openEditModal = (entry: LocalEntry) => {
    setEditingEntry(entry);
    setEditModalVisible(true);
    
    // Populate form with current entry data
    const initialGroupSize = parseInt(entry.nationality) || 1;
    setCurrentGroupSize(initialGroupSize);
    
    editForm.setFieldsValue({
      firstName: entry.name.first,
      lastName: entry.name.last,
      club: entry.club,
      birthYear: entry.birthYear,
      sex: entry.sex,
      phone: entry.phone,
      classId: entry.classId,
      className: entry.className,
      cardNumber: entry.cardNumber === '0' ? '' : entry.cardNumber,
      isHiredCard: entry.isHiredCard || false,
      fee: entry.fee,
      groupSize: initialGroupSize,
    });
  };
  
  // Check if current entry is a group based on current state or entry data
  const isGroupEntry = (entry?: LocalEntry | null): boolean => {
    // Use current form state if editing
    if (editModalVisible) {
      return currentGroupSize >= 2;
    }
    
    // Fall back to entry data when not editing
    if (!entry) return false;
    const nat = parseInt(entry.nationality) || 0;
    return nat >= 2;
  };

  // Save edited entry
  const handleSaveEdit = async () => {
    try {
      const values = await editForm.validateFields();
      
      if (!editingEntry) return;
      
      // Update the entry with new values
      const groupSize = parseInt(values.groupSize) || 1;
      const isGroup = groupSize >= 2;
      
      const updatedEntry = localEntryService.updateEntry(editingEntry.id, {
        name: {
          first: values.firstName.trim(),
          last: values.lastName.trim(),
        },
        club: values.club.trim(),
        birthYear: isGroup ? '' : (values.birthYear?.trim() || ''),
        sex: isGroup ? '' : (values.sex || ''),
        nationality: groupSize.toString(), // Store group size in nationality field
        phone: values.phone?.trim() || '',
        classId: values.classId.trim(),
        className: values.className.trim(),
        cardNumber: values.cardNumber?.trim() || '0',
        isHiredCard: values.isHiredCard || false,
        fee: parseInt(values.fee) || 0,
      });
      
      if (updatedEntry) {
        // Learn from this updated entry for future auto-completion
        localRunnerService.learnFromEntry(updatedEntry);
        
        message.success(`Updated entry for ${values.firstName} ${values.lastName}`);
        setEditModalVisible(false);
        setEditingEntry(null);
        editForm.resetFields();
        loadEntries(); // Refresh the table
      } else {
        message.error('Failed to update entry - entry not found');
      }
    } catch (error) {
      console.error('Save edit failed:', error);
      message.error('Failed to save changes');
    }
  };

  // Cancel edit
  const handleCancelEdit = () => {
    setEditModalVisible(false);
    setEditingEntry(null);
    editForm.resetFields();
    setRunnerSuggestions([]);
    setClubSuggestions([]);
    setCurrentGroupSize(1);
  };

  // Open new entry modal
  const handleNewEntry = async () => {
    setNewEntryModalVisible(true);
    setNewEntryGroupSize(1);
    newEntryForm.resetFields();
    
    // Load available classes
    try {
      const classes = await meosClassService.getClasses();
      setAvailableClasses(classes);
      console.log('[NewEntry] Loaded classes for dropdown:', classes);
    } catch (error) {
      console.error('[NewEntry] Failed to load classes:', error);
      message.error('Failed to load available classes');
    }
    
    // Set default values
    newEntryForm.setFieldsValue({
      groupSize: 1,
      cardNumber: '', // Will be assigned later
    });
  };

  // Save new entry
  const handleSaveNewEntry = async () => {
    try {
      const values = await newEntryForm.validateFields();
      
      const groupSize = parseInt(values.groupSize) || 1;
      const isGroup = groupSize >= 2;
      
      // Find the selected class to get both ID and name
      const selectedClass = availableClasses.find(c => c.id.toString() === values.classId.toString());
      const className = selectedClass ? selectedClass.name : values.classId.toString();
      
      // Create the new entry
      const newEntry = localEntryService.addEntry({
        name: {
          first: values.firstName.trim(),
          last: values.lastName.trim(),
        },
        club: values.club.trim(),
        birthYear: isGroup ? '' : (values.birthYear?.trim() || ''),
        sex: isGroup ? '' : (values.sex || ''),
        nationality: groupSize.toString(), // Store group size in nationality field
        phone: values.phone?.trim() || '',
        classId: values.classId.toString(),
        className: className,
        cardNumber: values.cardNumber?.trim() || '0',
        isHiredCard: values.isHiredCard || false, // Track hired card status
        fee: (selectedClass ? selectedClass.fee : 0) || 25, // Use class fee or default
        importedFrom: 'manual',
      });
      
      // Automatically check in same-day entries (walk-up registrations)
      const checkedInEntry = localEntryService.checkInEntry(newEntry.id, values.cardNumber?.trim() || undefined);
      
      // Learn from this entry for future auto-completion
      localRunnerService.learnFromEntry(newEntry);
      
      if (checkedInEntry) {
        message.success(`✅ Added and checked in ${values.firstName} ${values.lastName} for same-day registration`);
      } else {
        message.success(`Added new entry for ${values.firstName} ${values.lastName}`);
      }
      
      setNewEntryModalVisible(false);
      
      // Reset form state
      newEntryForm.resetFields();
      setNewEntryGroupSize(1);
      setAvailableClasses([]);
      
      // Clear any pending lookup timeout
      if (runnerLookupTimeout) {
        clearTimeout(runnerLookupTimeout);
        setRunnerLookupTimeout(null);
      }
      
      loadEntries(); // Refresh the table
    } catch (error) {
      console.error('Save new entry failed:', error);
      message.error('Failed to save new entry');
    }
  };

  // Cancel new entry
  const handleCancelNewEntry = () => {
    setNewEntryModalVisible(false);
    
    // Reset form state
    newEntryForm.resetFields();
    setRunnerSuggestions([]);
    setClubSuggestions([]);
    setNewEntryGroupSize(1);
    setAvailableClasses([]);
    
    // Clear any pending lookup timeout
    if (runnerLookupTimeout) {
      clearTimeout(runnerLookupTimeout);
      setRunnerLookupTimeout(null);
    }
    
    // Force form to reset internal state
    setTimeout(() => {
      newEntryForm.resetFields();
    }, 0);
  };

  // Handle new entry group size change
  const handleNewEntryGroupSizeChange = (value: number) => {
    setNewEntryGroupSize(value);
    
    // Clear birth year and sex when converting to group
    if (value >= 2) {
      newEntryForm.setFieldsValue({
        birthYear: '',
        sex: undefined,
      });
    }
  };

  // Automatic runner lookup with debouncing
  const handleNameChange = (fieldName: 'firstName' | 'lastName', value: string) => {
    // Clear any existing timeout
    if (runnerLookupTimeout) {
      clearTimeout(runnerLookupTimeout);
    }

    // Update the form field
    newEntryForm.setFieldsValue({ [fieldName]: value });

    // Don't lookup for groups, if either name is missing, or if lookup is not available
    if (newEntryGroupSize >= 2 || !runnerLookupAvailable) return;

    const firstName = fieldName === 'firstName' ? value : newEntryForm.getFieldValue('firstName');
    const lastName = fieldName === 'lastName' ? value : newEntryForm.getFieldValue('lastName');

    if (!firstName || !lastName || firstName.length < 2 || lastName.length < 2) {
      return;
    }

    // Set timeout for debounced lookup
    const timeout = setTimeout(async () => {
      try {
        const fullName = `${firstName} ${lastName}`;
        console.log(`[NewEntry] Auto-looking up runner: ${fullName}`);
        
        // Try local runner database first (fastest)
        const localRunners = localRunnerService.searchRunners(fullName);
        
        if (localRunners.length > 0) {
          const runner = localRunners[0]; // Take the best match
          console.log(`[NewEntry] Found runner data in local database:`, runner);
          
          // Auto-populate available information
          const updates: any = {};
          if (runner.club && !newEntryForm.getFieldValue('club')) {
            updates.club = runner.club;
          }
          if (runner.birthYear && !newEntryForm.getFieldValue('birthYear')) {
            updates.birthYear = runner.birthYear.toString();
          }
          if (runner.sex && !newEntryForm.getFieldValue('sex')) {
            updates.sex = runner.sex;
          }
          if (runner.cardNumber && !newEntryForm.getFieldValue('cardNumber')) {
            updates.cardNumber = runner.cardNumber.toString();
          }
          
          if (Object.keys(updates).length > 0) {
            newEntryForm.setFieldsValue(updates);
            localRunnerService.recordUsage(runner.id); // Record usage for better sorting
            message.success(`Auto-populated data for ${runner.name.first} ${runner.name.last} from local database`);
          }
        } else {
          // Try MeOS database.wpersons if local database has no results
          try {
            const meosRunners = await meosRunnerDatabaseClient.searchRunners(fullName, 5);
            
            if (meosRunners.length > 0) {
              const runner = meosRunners[0];
              console.log(`[NewEntry] Found runner data in MeOS database:`, runner);
              
              const updates: any = {};
              if (runner.club && !newEntryForm.getFieldValue('club')) {
                updates.club = runner.club;
              }
              if (runner.birthYear && !newEntryForm.getFieldValue('birthYear')) {
                updates.birthYear = runner.birthYear.toString();
              }
              if (runner.sex && !newEntryForm.getFieldValue('sex')) {
                updates.sex = runner.sex;
              }
              if (runner.cardNumber && !newEntryForm.getFieldValue('cardNumber')) {
                updates.cardNumber = runner.cardNumber.toString();
              }
              
              if (Object.keys(updates).length > 0) {
                newEntryForm.setFieldsValue(updates);
                message.success(`Auto-populated data for ${runner.name.first} ${runner.name.last} from MeOS database`);
                
                // Learn this runner for future local lookups
                localRunnerService.addRunner({
                  name: runner.name,
                  club: runner.club || '',
                  birthYear: runner.birthYear,
                  sex: runner.sex,
                  cardNumber: runner.cardNumber,
                  nationality: runner.nationality || '',
                  phone: '',
                  email: '',
                });
              }
            } else {
              // Final fallback to MeOS REST API if database service not available
              try {
                const runners = await meosApi.lookupRunners(fullName);
                
                if (runners.length > 0) {
                  const runner = runners[0];
                  console.log(`[NewEntry] Found runner data in MeOS API:`, runner);
                  
                  const updates: any = {};
                  if (runner.club && !newEntryForm.getFieldValue('club')) {
                    updates.club = runner.club;
                  }
                  if (runner.birthYear && !newEntryForm.getFieldValue('birthYear')) {
                    updates.birthYear = runner.birthYear.toString();
                  }
                  if (runner.sex && !newEntryForm.getFieldValue('sex')) {
                    updates.sex = runner.sex;
                  }
                  if (runner.cardNumber && !newEntryForm.getFieldValue('cardNumber')) {
                    updates.cardNumber = runner.cardNumber.toString();
                  }
                  
                  if (Object.keys(updates).length > 0) {
                    newEntryForm.setFieldsValue(updates);
                    message.success(`Auto-populated data for ${runner.name} from MeOS API`);
                  }
                } else {
                  console.log(`[NewEntry] No data found for: ${fullName}`);
                }
              } catch (apiError) {
                console.log(`[NewEntry] MeOS API lookup also failed for: ${fullName}`);
              }
            }
          } catch (dbError) {
            console.log(`[NewEntry] MeOS database lookup failed, trying REST API fallback:`, dbError);
            
            // Final fallback to MeOS REST API
            try {
              const runners = await meosApi.lookupRunners(fullName);
              
              if (runners.length > 0) {
                const runner = runners[0];
                console.log(`[NewEntry] Found runner data in MeOS API:`, runner);
                
                const updates: any = {};
                if (runner.club && !newEntryForm.getFieldValue('club')) {
                  updates.club = runner.club;
                }
                if (runner.birthYear && !newEntryForm.getFieldValue('birthYear')) {
                  updates.birthYear = runner.birthYear.toString();
                }
                if (runner.sex && !newEntryForm.getFieldValue('sex')) {
                  updates.sex = runner.sex;
                }
                if (runner.cardNumber && !newEntryForm.getFieldValue('cardNumber')) {
                  updates.cardNumber = runner.cardNumber.toString();
                }
                
                if (Object.keys(updates).length > 0) {
                  newEntryForm.setFieldsValue(updates);
                  message.success(`Auto-populated data for ${runner.name} from MeOS API`);
                }
              } else {
                console.log(`[NewEntry] No data found for: ${fullName}`);
              }
            } catch (apiError) {
              console.log(`[NewEntry] All lookup methods failed for: ${fullName}`);
            }
          }
        }
      } catch (error) {
        console.error('[NewEntry] Auto-lookup failed:', error);
        // Don't show error message to user as this might be expected (MeOS not running, etc.)
        console.log(`[NewEntry] Runner lookup unavailable - MeOS may not be running or lookup feature not enabled`);
        
        // Disable automatic lookup for future attempts
        setRunnerLookupAvailable(false);
      }
    }, 800); // 800ms debounce

    setRunnerLookupTimeout(timeout);
  };

  // Handle group size change
  const handleGroupSizeChange = (value: number) => {
    setCurrentGroupSize(value);
    
    // Clear birth year and sex when converting to group
    if (value >= 2) {
      editForm.setFieldsValue({
        birthYear: '',
        sex: undefined,
      });
    }
  };

  // Lookup runner in MeOS database
  const handleRunnerLookup = async () => {
    // Don't allow runner lookup for groups
    if (isGroupEntry(editingEntry)) {
      message.info('Runner lookup is not available for group entries');
      return;
    }
    
    const firstName = editForm.getFieldValue('firstName');
    const lastName = editForm.getFieldValue('lastName');
    
    if (!firstName || !lastName) {
      message.warning('Please enter first and last name to search MeOS database');
      return;
    }
    
    const fullName = `${firstName} ${lastName}`;
    setRunnerLookupLoading(true);
    
    try {
      const runners = await meosApi.lookupRunners(fullName);
      setRunnerSuggestions(runners);
      
      if (runners.length === 0) {
        message.info(`No runners found in MeOS database for "${fullName}"`);
      } else {
        message.success(`Found ${runners.length} runner(s) in MeOS database`);
      }
    } catch (error) {
      console.error('Runner lookup failed:', error);
      message.error('Failed to lookup runner in MeOS database');
    } finally {
      setRunnerLookupLoading(false);
    }
  };

  // Apply runner data from MeOS database
  const handleApplyRunnerData = (runner: any) => {
    editForm.setFieldsValue({
      club: runner.club || editForm.getFieldValue('club'),
    });
    
    message.success(`Applied data for ${runner.name} from MeOS database`);
    setRunnerSuggestions([]); // Clear suggestions after applying
  };

  // Lookup club in MeOS database
  const handleClubLookup = async () => {
    const clubName = editForm.getFieldValue('club');
    
    if (!clubName || clubName.trim() === '') {
      message.warning('Please enter a club name to search MeOS database');
      return;
    }
    
    setClubLookupLoading(true);
    
    try {
      const clubs = await meosApi.lookupClubs(clubName.trim());
      setClubSuggestions(clubs);
      
      if (clubs.length === 0) {
        message.info(`No clubs found in MeOS database for "${clubName}"`);
      } else {
        message.success(`Found ${clubs.length} club(s) in MeOS database`);
      }
    } catch (error) {
      console.error('Club lookup failed:', error);
      message.error('Failed to lookup club in MeOS database');
    } finally {
      setClubLookupLoading(false);
    }
  };

  // Apply club data from MeOS database
  const handleApplyClubData = (club: any) => {
    editForm.setFieldsValue({
      club: club.name,
    });
    
    message.success(`Applied club "${club.name}" from MeOS database`);
    setClubSuggestions([]); // Clear suggestions after applying
  };

  // Resubmit entry to MeOS after manual deletion
  const handleResubmitToMeos = async (entry: LocalEntry) => {
    Modal.confirm({
      title: 'Resubmit to MeOS',
      content: (
        <div>
          <p>This will submit <strong>{entry.name.first} {entry.name.last}</strong> to MeOS as a new entry.</p>
          <p style={{ color: '#fa8c16', marginTop: '12px' }}>
            ⚠️ <strong>Important:</strong> Only use this if you have manually deleted the old entry from MeOS.
          </p>
          <p style={{ fontSize: '14px', color: '#666' }}>
            If you haven't deleted the old entry, this will create a duplicate in MeOS.
          </p>
        </div>
      ),
      icon: <CloudUploadOutlined style={{ color: '#1890ff' }} />,
      okText: 'Resubmit to MeOS',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          // Clear the submittedToMeosAt timestamp so it can be resubmitted
          const clearedEntry = { ...entry, submittedToMeosAt: undefined, meosEntryId: undefined };
          
          // Use the retry submission function
          await handleRetryMeosSubmission(clearedEntry);
        } catch (error) {
          console.error('Resubmit failed:', error);
          message.error('Failed to resubmit entry to MeOS');
        }
      },
    });
  };

  // Helper function to convert class name/ID to MeOS class ID using service
  const getMeosClassId = async (className: string, classId: string): Promise<number> => {
    const result = await meosClassService.getClassId(className, classId);
    console.log(`[ClassMapping] className="${className}", classId="${classId}" -> MeOS class ${result.id} (${result.method})`);
    return result.id;
  };

  // Check-in entry and submit to MeOS
  const handleCheckInEntry = async (entry: LocalEntry) => {
    try {
      // First, check in locally
      const updatedEntry = localEntryService.checkInEntry(entry.id);
      if (!updatedEntry) {
        message.error('Failed to check in entry - entry not found');
        return;
      }

      message.loading(`Checking in ${entry.name.first} ${entry.name.last} and submitting to MeOS...`, 0);

      try {
        // Convert local entry to MeOS entry format with proper class mapping
        const classId = await getMeosClassId(entry.className, entry.classId);
        
        console.log(`[EventDay] Converting ${entry.name.first} ${entry.name.last}: className="${entry.className}", classId="${entry.classId}" -> MeOS classId=${classId}`);
        console.log(`[EventDay] Hired card debug for ${entry.name.first} ${entry.name.last}: isHiredCard=${entry.isHiredCard}, cardNumber=${entry.cardNumber}`);
        
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
        
        console.log(`[EventDay] MeOS entry params:`, meosEntryParams);
        console.log(`[EventDay] Card ${entry.cardNumber} hired status will be determined by MeOS internal database`);

        // Submit to MeOS
        const meosResult = await meosApi.createEntry(meosEntryParams);
        
        message.destroy(); // Clear loading message

        if (meosResult.success) {
          // Mark as submitted to MeOS
          localEntryService.markSubmittedToMeos(entry.id);
          message.success(`✅ ${entry.name.first} ${entry.name.last} checked in and submitted to MeOS successfully!`);
        } else {
          // Show MeOS error but keep local check-in
          message.warning(`⚠️ ${entry.name.first} ${entry.name.last} checked in locally, but MeOS submission failed: ${meosResult.error}`);
        }
      } catch (meosError) {
        message.destroy(); // Clear loading message
        console.error('MeOS submission failed:', meosError);
        message.warning(`⚠️ ${entry.name.first} ${entry.name.last} checked in locally, but MeOS submission failed. You can retry later.`);
      }

      loadEntries(); // Refresh the table
    } catch (error) {
      message.destroy(); // Clear any loading message
      console.error('Check-in failed:', error);
      message.error('Failed to check in entry');
    }
  };

  // Retry MeOS submission for checked-in entries
  const handleRetryMeosSubmission = async (entry: LocalEntry) => {
    if (entry.status !== 'checked-in') {
      message.warning('Entry must be checked in before submitting to MeOS');
      return;
    }

    message.loading(`Submitting ${entry.name.first} ${entry.name.last} to MeOS...`, 0);

    try {
      // Convert local entry to MeOS entry format with proper class mapping
      const classId = await getMeosClassId(entry.className, entry.classId);
      
      console.log(`[EventDay] Retry submission for ${entry.name.first} ${entry.name.last}: className="${entry.className}", classId="${entry.classId}" -> MeOS classId=${classId}`);
      console.log(`[EventDay] Hired card debug for ${entry.name.first} ${entry.name.last}: isHiredCard=${entry.isHiredCard}, cardNumber=${entry.cardNumber}`);
      
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
      
      console.log(`[EventDay] MeOS entry params:`, meosEntryParams);
      console.log(`[EventDay] Card ${entry.cardNumber} hired status will be determined by MeOS internal database`);

      // Submit to MeOS
      const meosResult = await meosApi.createEntry(meosEntryParams);
      
      message.destroy(); // Clear loading message

      if (meosResult.success) {
        // Mark as submitted to MeOS
        localEntryService.markSubmittedToMeos(entry.id);
        message.success(`✅ ${entry.name.first} ${entry.name.last} submitted to MeOS successfully!`);
        loadEntries(); // Refresh the table
      } else {
        message.error(`❌ MeOS submission failed: ${meosResult.error}`);
      }
    } catch (error) {
      message.destroy(); // Clear loading message
      console.error('MeOS submission retry failed:', error);
      message.error('❌ MeOS submission failed. Please check your connection and try again.');
    }
  };

  // Bulk check-in selected entries
  const handleBulkCheckIn = async () => {
    const selectedEntries = entries.filter(entry => selectedRowKeys.includes(entry.id));
    const eligibleEntries = selectedEntries.filter(entry => entry.status === 'pending');
    
    if (eligibleEntries.length === 0) {
      message.warning('No eligible entries selected for check-in. Only pending entries can be checked in.');
      return;
    }

    Modal.confirm({
      title: 'Bulk Check-in',
      content: (
        <div>
          <p>Check in <strong>{eligibleEntries.length}</strong> selected entries?</p>
          <p>This will:</p>
          <ul>
            <li>Mark entries as checked-in locally</li>
            <li>Submit entries to MeOS automatically</li>
          </ul>
          {selectedEntries.length > eligibleEntries.length && (
            <p style={{ color: '#fa8c16', marginTop: '12px' }}>
              ⚠️ Note: {selectedEntries.length - eligibleEntries.length} already checked-in entries will be skipped.
            </p>
          )}
        </div>
      ),
      icon: <LoginOutlined style={{ color: '#52c41a' }} />,
      okText: 'Check In All',
      cancelText: 'Cancel',
      onOk: async () => {
        setBulkActionLoading(true);
        let successCount = 0;
        let failCount = 0;
        
        try {
          for (const entry of eligibleEntries) {
            try {
              await handleCheckInEntry(entry);
              successCount++;
            } catch (error) {
              console.error(`Failed to check in ${entry.name.first} ${entry.name.last}:`, error);
              failCount++;
            }
          }
          
          if (successCount > 0) {
            message.success(`✅ Successfully checked in ${successCount} entries`);
          }
          if (failCount > 0) {
            message.error(`❌ Failed to check in ${failCount} entries`);
          }
          
          // Clear selection after bulk action
          setSelectedRowKeys([]);
          loadEntries();
        } finally {
          setBulkActionLoading(false);
        }
      },
    });
  };

  // Bulk delete selected entries
  const handleBulkDelete = () => {
    const selectedEntries = entries.filter(entry => selectedRowKeys.includes(entry.id));
    
    if (selectedEntries.length === 0) {
      message.warning('No entries selected for deletion.');
      return;
    }

    Modal.confirm({
      title: 'Bulk Delete Entries',
      content: (
        <div>
          <p>Delete <strong>{selectedEntries.length}</strong> selected entries?</p>
          <div style={{ maxHeight: '200px', overflow: 'auto', margin: '12px 0' }}>
            {selectedEntries.map(entry => (
              <div key={entry.id} style={{ padding: '4px 0' }}>
                • {entry.name.first} {entry.name.last} ({entry.club})
              </div>
            ))}
          </div>
          <p style={{ color: '#cf1322', marginTop: '12px' }}>
            <WarningOutlined /> This action cannot be undone!
          </p>
        </div>
      ),
      icon: <DeleteOutlined style={{ color: '#cf1322' }} />,
      okText: 'Delete All',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: () => {
        let successCount = 0;
        let failCount = 0;
        
        selectedEntries.forEach(entry => {
          try {
            const success = localEntryService.deleteEntry(entry.id);
            if (success) {
              successCount++;
            } else {
              failCount++;
            }
          } catch (error) {
            console.error(`Failed to delete ${entry.name.first} ${entry.name.last}:`, error);
            failCount++;
          }
        });
        
        if (successCount > 0) {
          message.success(`✅ Successfully deleted ${successCount} entries`);
        }
        if (failCount > 0) {
          message.error(`❌ Failed to delete ${failCount} entries`);
        }
        
        // Clear selection after bulk action
        setSelectedRowKeys([]);
        loadEntries();
      },
    });
  };

  // Select all entries in current filtered view
  const handleSelectAll = () => {
    const filteredEntryKeys = getFilteredEntries().map(entry => entry.id);
    setSelectedRowKeys(filteredEntryKeys);
    message.info(`Selected all ${filteredEntryKeys.length} entries in current view`);
  };

  // Clear all selections
  const handleSelectNone = () => {
    setSelectedRowKeys([]);
    message.info('Cleared all selections');
  };

  // Card reader event handlers
  const handleCardRead = async (card: SICard) => {
    setScannedCard(card);
    
    // Look for exact card match first (pending entries only)
    const exactMatch = entries.find(entry => 
      entry.cardNumber === card.cardNumber.toString() && entry.status === 'pending'
    );
    
    // Check if this is a hired card from MeOS
    const isHiredCardInMeos = await meosHiredCardService.isCardInMeos(card.cardNumber.toString());
    setIsHiredCard(isHiredCardInMeos);
    
    if (exactMatch) {
      setMatchedEntry(exactMatch);
      setSuggestedEntries([]);
      setCardConfirmationVisible(true);
      handleEditDetailsBeforeCheckIn(exactMatch);
    } else {
      // No exact match, look for rental assignment candidates
      const suggestedEntries = entries.filter(entry => 
        entry.status === 'pending' && (entry.issues.needsRentalCard || entry.issues.needsCardButNoRental)
      );
      
      setMatchedEntry(null);
      setSuggestedEntries(suggestedEntries);
      setCardConfirmationVisible(true);
    }
  };

  // Helper function to capitalize name parts properly
  const capitalizeNamePart = (name: string): string => {
    if (!name || typeof name !== 'string') return '';
    
    const trimmed = name.trim();
    if (!trimmed) return '';
    
    // Split by spaces, hyphens, or apostrophes while preserving delimiters
    const parts = trimmed.split(/([\s\-'])/);
    
    return parts.map((part) => {
      // Skip delimiters (spaces, hyphens, apostrophes)
      if (part.match(/[\s\-']/)) return part;
      
      if (part.toLowerCase().startsWith('mc') && part.length > 2) {
        // Handle Scottish names like McDonald -> McDonald
        return 'Mc' + part.charAt(2).toUpperCase() + part.slice(3).toLowerCase();
      }
      
      if (part.toLowerCase().startsWith("o'") && part.length > 2) {
        // Handle Irish names like O'Connor -> O'Connor  
        return "O'" + part.charAt(2).toUpperCase() + part.slice(3).toLowerCase();
      }
      
      // Standard title case: First letter uppercase, rest lowercase
      return part[0].toUpperCase() + part.slice(1).toLowerCase();
    }).join(parts.length > 1 ? (trimmed.includes('-') ? '-' : (trimmed.includes("'") ? "'" : ' ')) : '');
  };

  // Handle edit details before check-in
  const handleEditDetailsBeforeCheckIn = (entry: LocalEntry) => {
    setCardEditMode(true);
    
    // Populate form with current entry data
    cardEditForm.setFieldsValue({
      firstName: entry.name.first,
      lastName: entry.name.last,
      club: entry.club,
      birthYear: entry.birthYear,
      sex: entry.sex,
      nationality: entry.nationality,
      phone: entry.phone,
      classId: entry.classId,
      className: entry.className,
      cardNumber: entry.issues.needsRentalCard && scannedCard ? scannedCard.cardNumber.toString() : entry.cardNumber,
      isHiredCard: entry.issues.needsRentalCard ? isHiredCard : entry.isHiredCard,
      fee: entry.fee
    });
  };

  // Handle save edited details and check in
  const handleSaveEditedDetailsAndCheckIn = async () => {
    if (!matchedEntry || !scannedCard) {
      console.error('Missing matchedEntry or scannedCard for card edit');
      return;
    }
    
    try {
      const values = await cardEditForm.validateFields();
      
      // Check if this is a group entry
      const isGroup = parseInt(matchedEntry.nationality || '0') >= 2;
      
      // Update the entry with edited details
      const updatedEntry = localEntryService.updateEntry(matchedEntry.id, {
        name: {
          first: capitalizeNamePart(values.firstName?.trim() || matchedEntry.name.first),
          last: isGroup ? '' : capitalizeNamePart(values.lastName?.trim() || matchedEntry.name.last)
        },
        club: values.club?.trim() || matchedEntry.club,
        birthYear: values.birthYear?.trim() || '',
        sex: values.sex || '',
        nationality: values.nationality?.toString() || matchedEntry.nationality,
        phone: values.phone?.trim() || '',
        classId: values.classId?.trim() || matchedEntry.classId,
        className: values.className?.trim() || matchedEntry.className,
        cardNumber: values.cardNumber?.trim() || scannedCard.cardNumber.toString(),
        isHiredCard: values.isHiredCard || false,
        fee: parseInt(values.fee?.toString() || matchedEntry.fee.toString()) || matchedEntry.fee
      });
      
      if (updatedEntry) {
        // Close modal and reset states
        setCardConfirmationVisible(false);
        setCardEditMode(false);
        setScannedCard(null);
        setMatchedEntry(null);
        setSuggestedEntries([]);
        cardEditForm.resetFields();
        
        // Check in with the updated entry
        await handleCheckInEntry(updatedEntry);
        loadEntries(); // Refresh the table
      } else {
        message.error('Failed to update entry details');
      }
    } catch (error) {
      console.error('Error saving edited details:', error);
      message.error('Failed to save changes');
    }
  };


  // Handle cancel edit mode
  const handleCancelEditDetails = () => {
    setCardEditMode(false);
    cardEditForm.resetFields();
  };

  // Handle rental card selection - opens edit mode for selected runner
  const handleRentalCardSelection = (entry: LocalEntry) => {
    
    // Set this entry as the matched entry
    setMatchedEntry(entry);
    setSuggestedEntries([]); // Clear the suggestion list
    
    // Open edit mode for this entry with the rental card already assigned
    handleEditDetailsBeforeCheckIn(entry);
  };


  // Handle pagination changes
  const handleTableChange = (paginationConfig: any) => {
    console.log('[EventDay] Pagination changed:', paginationConfig);
    setPagination({
      ...pagination,
      current: paginationConfig.current,
      pageSize: paginationConfig.pageSize,
    });
    
    // Clear selections when changing pages/page size to avoid confusion
    if (paginationConfig.pageSize !== pagination.pageSize || paginationConfig.current !== pagination.current) {
      setSelectedRowKeys([]);
    }
  };
  
  // Row selection configuration
  const rowSelection = {
    selectedRowKeys,
    onChange: (newSelectedRowKeys: React.Key[]) => {
      setSelectedRowKeys(newSelectedRowKeys);
    },
  };

  // Check what issues an entry has (using LocalEntry format)
  const getEntryIssues = (entry: LocalEntry): LocalEntry['issues'] => {
    return entry.issues; // Issues are already calculated and stored
  };

  // Get statistics from localEntryService
  const getStats = () => {
    return localEntryService.getStatistics();
  };

  // Filter entries based on search and filters
  const getFilteredEntries = useCallback(() => {
    let filtered = entries;

    // Text search
    if (searchText) {
      const search = searchText.toLowerCase();
      filtered = filtered.filter(entry => 
        `${entry.name.first} ${entry.name.last}`.toLowerCase().includes(search) ||
        entry.club.toLowerCase().includes(search) ||
        entry.className.toLowerCase().includes(search) ||
        entry.cardNumber.includes(search)
      );
    }

    // Class filter
    if (selectedClass !== 'all') {
      filtered = filtered.filter(entry => entry.classId === selectedClass);
    }
    
    // Club filter
    if (selectedClub !== 'all') {
      filtered = filtered.filter(entry => entry.club === selectedClub);
    }

    // Issue filter
    if (filterIssues !== 'all') {
      filtered = filtered.filter(entry => {
        const issues = getEntryIssues(entry);
        switch (filterIssues) {
          case 'needs-attention':
            return issues.missingBirthYear || issues.missingSex || issues.needsNameCapitalization; // Include name capitalization issues
            case 'needs-cards':
              return issues.needsRentalCard || issues.needsCardButNoRental;
          case 'missing-info':
            return issues.missingBirthYear || issues.missingSex;
            case 'ready':
              return !issues.needsRentalCard && !issues.needsCardButNoRental && !issues.missingBirthYear && !issues.missingSex && !issues.needsNameCapitalization && entry.status === 'pending';
          case 'checked-in':
            return entry.status === 'checked-in';
          default:
            return true;
        }
      });
    }

    return filtered;
  }, [entries, searchText, selectedClass, selectedClub, filterIssues]);

  // Get unique classes for filter
  const getClasses = useCallback(() => {
    const classes = entries.reduce((acc: any[], entry) => {
      const existing = acc.find(c => c.id === entry.classId);
      if (!existing) {
        acc.push({
          id: entry.classId,
          name: entry.className || `Class ${entry.classId}`
        });
      }
      return acc;
    }, []);
    
    const sortedClasses = classes.sort((a, b) => a.name.localeCompare(b.name));
    
    return sortedClasses;
  }, [entries]);
  
  // Get unique clubs for filter
  const getClubs = useCallback(() => {
    const clubs = entries.reduce((acc: any[], entry) => {
      const existing = acc.find(c => c.name === entry.club);
      if (!existing && entry.club && entry.club.trim() !== '') {
        acc.push({
          id: entry.club, // Use club name as ID for filtering
          name: entry.club
        });
      }
      return acc;
    }, []);
    
    return clubs.sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  // Table columns
  const columns: ColumnsType<LocalEntry> = [
    {
      title: 'Status',
      key: 'status',
      width: 140,
      render: (_, entry) => {
        const issues = getEntryIssues(entry);
        const hasInfoIssues = issues.missingBirthYear || issues.missingSex || issues.needsNameCapitalization;
          const hasCardIssues = issues.needsRentalCard || issues.needsCardButNoRental;
        
        // Show MeOS submission status for checked-in entries
        if (entry.status === 'checked-in') {
          if (entry.submittedToMeosAt) {
            // Check if entry might be out of sync (edited after submission)
            const wasEditedAfterSubmission = entry.submittedToMeosAt && 
              new Date(entry.importedAt).getTime() > new Date(entry.submittedToMeosAt).getTime();
            
            return (
              <div>
                <Tag color={wasEditedAfterSubmission ? "orange" : "green"} icon={<CheckCircleOutlined />}>
                  Checked In
                </Tag>
                <div style={{ fontSize: '10px', color: wasEditedAfterSubmission ? '#fa8c16' : '#52c41a', marginTop: '2px' }}>
                  {wasEditedAfterSubmission ? '⚠️ May need MeOS sync' : '✅ In MeOS'}
                </div>
              </div>
            );
          } else {
            return (
              <div>
                <Tag color="orange" icon={<CheckCircleOutlined />}>
                  Checked In
                </Tag>
                <div style={{ fontSize: '10px', color: '#fa8c16', marginTop: '2px' }}>
                  ⚠️ Not in MeOS
                </div>
              </div>
            );
          }
        }
        
        // Show info issues (critical - needs personal data)
        if (hasInfoIssues) {
          return (
            <Tag color="orange" icon={<WarningOutlined />}>
              Needs Attention
            </Tag>
          );
        }
        
        // Show card issues (operational - just needs card assignment)
        if (hasCardIssues) {
          const cardIssueType = issues.needsRentalCard ? 'Rental Needed' : 'Card Needed';
          const cardColor = issues.needsRentalCard ? 'orange' : 'red';
          return (
            <Tag color={cardColor} icon={<IdcardOutlined />}>
              {cardIssueType}
            </Tag>
          );
        }
        
        return (
          <Tag color="blue" icon={<ClockCircleOutlined />}>
            Ready
          </Tag>
        );
      },
    },
    {
      title: 'First Name',
      key: 'firstName',
      width: 120,
      render: (_, entry) => (
        <Text strong>{entry.name.first}</Text>
      ),
      sorter: (a, b) => a.name.first.localeCompare(b.name.first),
    },
    {
      title: 'Last Name',
      key: 'lastName',
      width: 120,
      render: (_, entry) => (
        <Text strong>{entry.name.last}</Text>
      ),
      sorter: (a, b) => a.name.last.localeCompare(b.name.last),
    },
    {
      title: 'Club & Contact',
      key: 'contact',
      width: 150,
      render: (_, entry) => {
        const contactParts = [];
        if (entry.phone) contactParts.push(entry.phone);
        const contactInfo = contactParts.join(' • ');
        
        return (
          <Space direction="vertical" size="small">
            <Text type="secondary" style={{ fontSize: '12px' }}>{entry.club}</Text>
            {contactInfo && (
              <Text type="secondary" style={{ fontSize: '11px', color: '#999' }}>
                {contactInfo}
              </Text>
            )}
          </Space>
        );
      },
      sorter: (a, b) => a.club.localeCompare(b.club),
    },
    {
      title: 'Class',
      dataIndex: 'className',
      key: 'class',
      width: 100,
      sorter: (a, b) => a.className.localeCompare(b.className),
    },
    {
      title: 'Card',
      key: 'card',
      width: 120,
        render: (_, entry) => {
          const issues = getEntryIssues(entry);
          
          if (issues.needsRentalCard) {
            return <Tag color="orange" icon={<IdcardOutlined />}>Rental Needed</Tag>;
          }
          
          if (issues.needsCardButNoRental) {
            return <Tag color="red" icon={<IdcardOutlined />}>Card Needed</Tag>;
          }
          
          return (
            <Tag color={entry.isHiredCard ? "purple" : "green"} icon={<CheckCircleOutlined />}>
              {entry.cardNumber}{entry.isHiredCard ? ' (Hired)' : ''}
            </Tag>
          );
        },
    },
    {
      title: 'Info',
      key: 'info',
      width: 140,
      render: (_, entry) => {
        const issues = getEntryIssues(entry);
        const isGroup = parseInt(entry.nationality) >= 2;
        
        // For groups, don't show birth year and sex requirements
        if (isGroup) {
          return (
            <div style={{ fontSize: '12px', color: '#1890ff' }}>
              👥 Group Entry
              <div style={{ color: '#666', fontSize: '10px' }}>YB/Sex not applicable</div>
            </div>
          );
        }
        
        // For individuals, check for missing info and name issues
        const missing = [];
        if (issues.missingBirthYear) missing.push('Birth Year');
        if (issues.missingSex) missing.push('Sex');
        if (issues.needsNameCapitalization) missing.push('Name Format');
        
        if (missing.length > 0) {
          return (
            <Tag color="red" icon={<UserOutlined />}>
              Issues: {missing.join(', ')}
            </Tag>
          );
        }
        
        // Show birth year and sex with headers for individuals
        return (
          <div style={{ fontSize: '12px' }}>
            <div><strong>YB:</strong> {entry.birthYear || 'N/A'}</div>
            <div><strong>Sex:</strong> {entry.sex || 'N/A'}</div>
          </div>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 180,
      render: (_, entry) => {
        const isCheckedIn = entry.status === 'checked-in';
        const isInMeos = entry.submittedToMeosAt;
        
        return (
          <Space size="small">
            <Tooltip title="Edit entry details">
              <Button 
                size="small" 
                type="text"
                icon={<EditOutlined />}
                onClick={() => handleEditEntry(entry)}
              />
            </Tooltip>
            
            {!isCheckedIn ? (
              <Tooltip title="Check-in for event and submit to MeOS">
                <Button 
                  size="small" 
                  type="text"
                  icon={<LoginOutlined />}
                  onClick={() => handleCheckInEntry(entry)}
                  style={{ color: '#52c41a' }}
                />
              </Tooltip>
            ) : !isInMeos ? (
              <Tooltip title="Retry MeOS submission">
                <Button 
                  size="small" 
                  type="text"
                  icon={<CloudUploadOutlined />}
                  onClick={() => handleRetryMeosSubmission(entry)}
                  style={{ color: '#fa8c16' }}
                />
              </Tooltip>
            ) : (
              <Tooltip title="Resubmit to MeOS (after manual deletion)">
                <Button 
                  size="small" 
                  type="text"
                  icon={<CloudUploadOutlined />}
                  onClick={() => handleResubmitToMeos(entry)}
                  style={{ color: '#722ed1' }}
                />
              </Tooltip>
            )}
            
            <Tooltip title="Delete entry">
              <Button 
                size="small" 
                type="text"
                icon={<DeleteOutlined />}
                onClick={() => handleDeleteEntry(entry)}
                style={{ color: '#ff4d4f' }}
                danger
              />
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  const stats = getStats();
  const filteredEntries = getFilteredEntries();
  const classes = getClasses();
  const clubs = getClubs();

  return (
    <div style={{ padding: '24px' }}>
      <Title level={2}>
        <ClockCircleOutlined /> Event Day Dashboard
      </Title>

      {/* Compact Status Bar */}
      <Card size="small" style={{ marginBottom: '16px', backgroundColor: '#fafafa' }}>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Space size="large">
              {(() => {
                const cachedClasses = meosClassService.getCachedClasses();
                const hasClasses = cachedClasses.length > 0;
                return (
                  <Text type={hasClasses ? "success" : "warning"} style={{ fontSize: '12px' }}>
                    {hasClasses ? `✅ MeOS Classes (${cachedClasses.length})` : `⚠️ Classes Not Loaded`}
                  </Text>
                );
              })()}
              <Text type="secondary" style={{ fontSize: '12px' }}>
                💾 Auto-save Active
                {rollbackPoints.length > 0 && ` • ${rollbackPoints.length} backups`}
              </Text>
              {(() => {
                const hiredCardCount = localEntryService.getHiredCardCount();
                if (hiredCardCount > 0) {
                  return (
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      🏷️ {hiredCardCount} hired cards
                    </Text>
                  );
                }
                return null;
              })()}
              {stats.needsAttention > 0 && (
                <Text type="warning" style={{ fontSize: '12px' }}>
                  ⚠️ {stats.needsAttention} entries need attention
                </Text>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Statistics Cards */}
      <Row gutter={16} style={{ marginBottom: '24px' }}>
        <Col span={4}>
          <Card 
            hoverable
            onClick={() => setFilterIssues('all')}
            style={{ cursor: 'pointer', backgroundColor: filterIssues === 'all' ? '#f0f8ff' : undefined }}
          >
            <Statistic
              title="Total Entries"
              value={stats.total}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card 
            hoverable
            onClick={() => setFilterIssues('checked-in')}
            style={{ cursor: 'pointer', backgroundColor: filterIssues === 'checked-in' ? '#f0f8ff' : undefined }}
          >
            <Statistic
              title="Checked In"
              value={stats.checkedIn}
              valueStyle={{ color: '#3f8600' }}
              prefix={<LoginOutlined />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card 
            hoverable
            onClick={() => setFilterIssues('ready')}
            style={{ cursor: 'pointer', backgroundColor: filterIssues === 'ready' ? '#f0f8ff' : undefined }}
          >
            <Statistic
              title="Ready"
              value={stats.ready}
              valueStyle={{ color: '#1890ff' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card 
            hoverable
            onClick={() => setFilterIssues('needs-attention')}
            style={{ cursor: 'pointer', backgroundColor: filterIssues === 'needs-attention' ? '#f0f8ff' : undefined }}
          >
            <Statistic
              title="Need Attention"
              value={stats.needsAttention}
              valueStyle={{ color: '#cf1322' }}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card 
            hoverable
            onClick={() => setFilterIssues('needs-cards')}
            style={{ cursor: 'pointer', backgroundColor: filterIssues === 'needs-cards' ? '#f0f8ff' : undefined }}
          >
            <Statistic
              title="Need Cards"
              value={stats.needsCards}
              valueStyle={{ color: '#fa8c16' }}
              prefix={<IdcardOutlined />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="Remaining"
              value={stats.total - stats.checkedIn}
              valueStyle={{ color: '#722ed1' }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Card Reader Panel */}
      <CardReaderPanel 
        compact={true} 
        onCardRead={handleCardRead}
      />

      {/* Controls */}
      <Card style={{ marginBottom: '24px' }}>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Search
              placeholder="Search by name, club, class, or card number"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              prefix={<SearchOutlined />}
            />
          </Col>
          <Col>
            <Select
              value={selectedClass}
              onChange={setSelectedClass}
              style={{ width: 120 }}
            >
              <Option value="all">All Classes</Option>
              {classes.map(cls => (
                <Option key={cls.id} value={cls.id}>{cls.name}</Option>
              ))}
            </Select>
          </Col>
          <Col>
            <Select
              value={selectedClub}
              onChange={setSelectedClub}
              style={{ width: 140 }}
              placeholder="Filter by club"
            >
              <Option value="all">All Clubs</Option>
              {clubs.map(club => (
                <Option key={club.id} value={club.id}>{club.name}</Option>
              ))}
            </Select>
          </Col>
          <Col>
            <Select
              value={filterIssues}
              onChange={setFilterIssues}
              style={{ width: 140 }}
              prefix={<FilterOutlined />}
            >
              <Option value="all">All Entries</Option>
              <Option value="checked-in">Checked In</Option>
              <Option value="needs-attention">Need Attention</Option>
              <Option value="needs-cards">Need Cards</Option>
              <Option value="missing-info">Missing Info</Option>
              <Option value="ready">Ready</Option>
            </Select>
          </Col>
          <Col>
            <Space>
              <Button
                icon={<CloudDownloadOutlined />}
                onClick={handleExportBackup}
                title="Export entries to file for backup"
              >
                Export
              </Button>
              <Button
                icon={<IdcardOutlined />}
                onClick={handleExportHiredCards}
                title="Export hired cards CSV for MeOS import"
                disabled={localEntryService.getHiredCardCount() === 0}
              >
                Hired Cards ({localEntryService.getHiredCardCount()})
              </Button>
              <Upload
                accept=".json"
                showUploadList={false}
                beforeUpload={(file) => {
                  handleImportBackup(file);
                  return false;
                }}
              >
                <Button
                  icon={<CloudUploadOutlined />}
                  title="Import entries from backup file"
                >
                  Import
                </Button>
              </Upload>
              <Button
                icon={<ReloadOutlined />}
                loading={classesLoading}
                onClick={loadMeosClasses}
                title="Refresh MeOS class information"
              >
                Classes
              </Button>
              <Dropdown
                menu={{
                  items: rollbackPoints.length > 0 ? rollbackPoints.map(point => ({
                    key: point.id,
                    label: (
                      <div>
                        <div style={{ fontWeight: 'bold' }}>{point.filename}</div>
                        <div style={{ fontSize: '12px', color: '#666' }}>
                          {point.timestamp} • {point.entryCount} entries
                        </div>
                      </div>
                    ),
                    icon: <HistoryOutlined />,
                    onClick: () => handleRollback(point.id, point)
                  })) : [{
                    key: 'no-backups',
                    label: 'No backup points available',
                    disabled: true
                  }]
                }}
                trigger={['click']}
                placement="bottomRight"
              >
                <Button
                  icon={<UndoOutlined />}
                  loading={rollbackLoading}
                  disabled={rollbackPoints.length === 0}
                  title="Rollback to previous backup point"
                >
                  Rollback ({rollbackPoints.length})
                </Button>
              </Dropdown>
              <Button
                icon={<CheckOutlined />}
                onClick={() => {
                  const result = localEntryService.recalculateAllIssues();
                  message.success(`Updated issues for ${result.updated} entries`);
                  loadEntries(); // Refresh the display
                }}
                title="Recalculate card status for all entries (useful after card assignments)"
              >
                Fix Status
              </Button>
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                loading={loading}
                onClick={loadEntries}
              >
                Refresh
              </Button>
              <Button
                type="primary"
                icon={<UserOutlined />}
                onClick={handleNewEntry}
                style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
              >
                New Entry
              </Button>
            </Space>
          </Col>
        </Row>
        
        {/* Bulk Action Controls - shown when entries are selected */}
        {selectedRowKeys.length > 0 && (
          <Row style={{ marginTop: '16px', padding: '12px', backgroundColor: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: '6px' }} align="middle">
            <Col flex="auto">
              <Space>
                <Text strong style={{ color: '#52c41a' }}>
                  <CheckCircleOutlined /> {selectedRowKeys.length} entries selected
                </Text>
                <Button size="small" type="link" onClick={handleSelectAll} title="Select all entries in current filtered view">
                  Select All ({getFilteredEntries().length})
                </Button>
                <Button size="small" type="link" onClick={handleSelectNone}>
                  Clear Selection
                </Button>
              </Space>
            </Col>
            <Col>
              <Space>
                <Button
                  icon={<LoginOutlined />}
                  onClick={handleBulkCheckIn}
                  loading={bulkActionLoading}
                  style={{ color: '#52c41a', borderColor: '#52c41a' }}
                  disabled={!entries.some(entry => selectedRowKeys.includes(entry.id) && entry.status === 'pending')}
                  title="Check in all selected pending entries and submit to MeOS"
                >
                  Bulk Check-in
                </Button>
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  onClick={handleBulkDelete}
                  loading={bulkActionLoading}
                  title="Delete all selected entries"
                >
                  Bulk Delete
                </Button>
              </Space>
            </Col>
          </Row>
        )}
      </Card>

      {/* Entries Table */}
      <Card 
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Entries ({filteredEntries.length} of {stats.total})</span>
            {selectedRowKeys.length > 0 && (
              <Text type="secondary" style={{ fontSize: '14px' }}>
                {selectedRowKeys.length} selected
              </Text>
            )}
          </div>
        }
      >
        <Table
          columns={columns}
          dataSource={filteredEntries}
          rowKey="id"
          loading={loading || bulkActionLoading}
          rowSelection={rowSelection}
          pagination={{
            ...pagination,
            total: filteredEntries.length,
          }}
          onChange={handleTableChange}
          size="small"
          scroll={{ x: 1200 }}
        />
      </Card>

      {/* Edit Entry Modal */}
      <Modal
        title={
          <Space>
            <EditOutlined />
            Edit Entry
            {editingEntry && (
              <Text type="secondary">
                - {isGroupEntry(editingEntry) && <span style={{ color: '#1890ff' }}>👥 </span>}
                {editingEntry.name.first} {editingEntry.name.last}
                {isGroupEntry(editingEntry) && <span style={{ color: '#1890ff' }}> (Group)</span>}
              </Text>
            )}
          </Space>
        }
        open={editModalVisible}
        onOk={handleSaveEdit}
        onCancel={handleCancelEdit}
        width={800}
        okText="Save Changes"
        cancelText="Cancel"
        destroyOnHidden
      >
        {/* MeOS Status Warning */}
        {editingEntry?.submittedToMeosAt && (
          <Alert
            message="⚠️ Entry Already in MeOS"
            description="This entry is already submitted to MeOS. Changes here will only affect the local copy. To update MeOS, you'll need to manually delete the entry in MeOS and resubmit."
            type="warning"
            showIcon
            style={{ marginBottom: '16px' }}
          />
        )}
        
        <Form
          form={editForm}
          layout="vertical"
          style={{ marginTop: '16px' }}
        >
          <Row gutter={16}>
            {/* Personal Information Section */}
            <Col span={24}>
              <Card title="Personal Information" size="small" style={{ marginBottom: '16px' }}>
                <Row gutter={16}>
                  <Col span={6}>
                    <Form.Item
                      label="First Name"
                      name="firstName"
                      rules={[{ required: true, message: 'Please enter first name' }]}
                    >
                      <Input placeholder="Enter first name" />
                    </Form.Item>
                  </Col>
                  <Col span={6}>
                    <Form.Item
                      label="Last Name"
                      name="lastName"
                      rules={[{ required: true, message: 'Please enter last name' }]}
                    >
                      <Input placeholder="Enter last name" />
                    </Form.Item>
                  </Col>
                  <Col span={4}>
                    <Form.Item
                      label="Group Size"
                      name="groupSize"
                      rules={[{ required: true, message: 'Required' }]}
                    >
                      <Select
                        placeholder="Size"
                        onChange={handleGroupSizeChange}
                      >
                        <Option value={1}>1 (Individual)</Option>
                        <Option value={2}>2 (Pair)</Option>
                        <Option value={3}>3 (Team)</Option>
                        <Option value={4}>4 (Team)</Option>
                        <Option value={5}>5 (Team)</Option>
                        <Option value={6}>6 (Team)</Option>
                        <Option value={7}>7 (Team)</Option>
                        <Option value={8}>8 (Team)</Option>
                        <Option value={9}>9 (Team)</Option>
                        <Option value={10}>10+ (Large Group)</Option>
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label=" ">
                      <Button 
                        icon={<DatabaseOutlined />} 
                        loading={runnerLookupLoading}
                        onClick={handleRunnerLookup}
                        disabled={isGroupEntry(editingEntry)}
                        block
                        title={isGroupEntry(editingEntry) ? 'Runner lookup not available for groups' : 'Search MeOS database for this runner'}
                      >
                        {isGroupEntry(editingEntry) ? 'N/A for Groups' : 'Lookup in MeOS'}
                      </Button>
                    </Form.Item>
                  </Col>
                </Row>
                
                {/* Runner Suggestions */}
                {runnerSuggestions.length > 0 && (
                  <Alert
                    message="Found in MeOS Database"
                    description={
                      <Space direction="vertical" style={{ width: '100%' }}>
                        {runnerSuggestions.map((runner, index) => (
                          <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text>
                              <strong>{runner.name}</strong> - {runner.club}
                            </Text>
                            <Button 
                              size="small" 
                              type="primary" 
                              icon={<CheckOutlined />}
                              onClick={() => handleApplyRunnerData(runner)}
                            >
                              Apply
                            </Button>
                          </div>
                        ))}
                      </Space>
                    }
                    type="info"
                    showIcon
                    style={{ marginBottom: '16px' }}
                    closable
                    onClose={() => setRunnerSuggestions([])}
                  />
                )}
                
                <Row gutter={16}>
                  {currentGroupSize === 1 && (
                    <>
                      <Col span={6}>
                        <Form.Item
                          label="Birth Year"
                          name="birthYear"
                        >
                          <Input placeholder="YYYY" maxLength={4} />
                        </Form.Item>
                      </Col>
                      <Col span={6}>
                        <Form.Item
                          label="Sex"
                          name="sex"
                        >
                          <Select placeholder="Select sex" allowClear>
                            <Option value="M">Male</Option>
                            <Option value="F">Female</Option>
                          </Select>
                        </Form.Item>
                      </Col>
                      {/* Show conversion notice when changing from group to individual */}
                      {editingEntry && parseInt(editingEntry.nationality) >= 2 && (
                        <Col span={12}>
                          <Alert
                            message="🔄 Converting to Individual"
                            description="This entry was a group. Please fill in birth year and sex for the individual runner."
                            type="warning"
                            showIcon
                            style={{ margin: 0 }}
                          />
                        </Col>
                      )}
                    </>
                  )}
                  <Col span={currentGroupSize === 1 ? 6 : 12}>
                    <Form.Item
                      label="Phone"
                      name="phone"
                    >
                      <Input placeholder="Phone number" />
                    </Form.Item>
                  </Col>
                  {currentGroupSize >= 2 && (
                    <Col span={12}>
                      <Alert
                        message={`Group Entry (${currentGroupSize} ${currentGroupSize === 1 ? 'runner' : 'runners'})`}
                        description={
                          <div>
                            Birth year and sex are not used for group entries.
                            {currentGroupSize > 1 && editingEntry && parseInt(editingEntry.nationality) === 1 && (
                              <div style={{ marginTop: '8px', color: '#1890ff' }}>
                                ✨ <strong>Converting to group!</strong> Individual data will be cleared.
                              </div>
                            )}
                          </div>
                        }
                        type="info"
                        showIcon
                        style={{ margin: 0 }}
                      />
                    </Col>
                  )}
                </Row>
              </Card>
            </Col>
            
            {/* Club Information Section */}
            <Col span={24}>
              <Card title="Club Information" size="small" style={{ marginBottom: '16px' }}>
                <Row gutter={16}>
                  <Col span={18}>
                    <Form.Item
                      label="Club Name"
                      name="club"
                      rules={[{ required: true, message: 'Please enter club name' }]}
                    >
                      <Input placeholder="Enter club name" />
                    </Form.Item>
                  </Col>
                  <Col span={6}>
                    <Form.Item label=" ">
                      <Button 
                        icon={<DatabaseOutlined />} 
                        loading={clubLookupLoading}
                        onClick={handleClubLookup}
                        block
                      >
                        Lookup Club
                      </Button>
                    </Form.Item>
                  </Col>
                </Row>
                
                {/* Club Suggestions */}
                {clubSuggestions.length > 0 && (
                  <Alert
                    message="Found Clubs in MeOS Database"
                    description={
                      <Space direction="vertical" style={{ width: '100%' }}>
                        {clubSuggestions.map((club, index) => (
                          <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text>
                              <strong>{club.name}</strong>
                            </Text>
                            <Button 
                              size="small" 
                              type="primary" 
                              icon={<CheckOutlined />}
                              onClick={() => handleApplyClubData(club)}
                            >
                              Apply
                            </Button>
                          </div>
                        ))}
                      </Space>
                    }
                    type="info"
                    showIcon
                    style={{ marginBottom: '16px' }}
                    closable
                    onClose={() => setClubSuggestions([])}
                  />
                )}
              </Card>
            </Col>
            
            {/* Competition Information Section */}
            <Col span={24}>
              <Card title="Competition Information" size="small">
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item
                      label="Class ID"
                      name="classId"
                      rules={[{ required: true, message: 'Please enter class ID' }]}
                    >
                      <Input placeholder="Enter class ID" />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item
                      label="Class Name"
                      name="className"
                      rules={[{ required: true, message: 'Please enter class name' }]}
                    >
                      <Input placeholder="Enter class name" />
                    </Form.Item>
                  </Col>
                  <Col span={6}>
                    <Form.Item
                      label="Card Number"
                      name="cardNumber"
                    >
                      <Input placeholder="SI Card number (leave empty for rental)" />
                    </Form.Item>
                  </Col>
                  <Col span={2}>
                    <Form.Item
                      name="isHiredCard"
                      valuePropName="checked"
                      label=" "
                    >
                      <Checkbox>Hired</Checkbox>
                    </Form.Item>
                  </Col>
                </Row>
                
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item
                      label="Entry Fee"
                      name="fee"
                    >
                      <Input type="number" placeholder="Entry fee" prefix="$" />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* New Entry Modal */}
      <Modal
        key="new-entry-modal"
        title={
          <Space>
            <UserOutlined />
            New Walk-Up Registration
            <Text type="secondary" style={{ fontSize: '12px' }}>
              - Will be automatically checked in
            </Text>
          </Space>
        }
        open={newEntryModalVisible}
        onOk={handleSaveNewEntry}
        onCancel={handleCancelNewEntry}
        width={800}
        okText="Add & Check In"
        cancelText="Cancel"
        destroyOnClose
      >
        <Alert
          message="📝 Same-Day Registration"
          description="This entry will be automatically checked in since it's a walk-up registration. Make sure to assign a card number if available."
          type="info"
          showIcon
          style={{ marginBottom: '8px' }}
        />
        
        <Alert
          message="🔍 Smart Auto-Fill"
          description="As you type the runner's name, we'll attempt to search the MeOS database and fill in available information (club, birth year, sex, card number). If no data is found, please fill in the information manually."
          type="info"
          showIcon
          style={{ marginBottom: '16px' }}
        />
        
        <Form
          form={newEntryForm}
          layout="vertical"
          style={{ marginTop: '16px' }}
          preserve={false}
        >
          <Row gutter={16}>
            {/* Personal Information Section */}
            <Col span={24}>
              <Card title="Personal Information" size="small" style={{ marginBottom: '16px' }}>
                <Row gutter={16}>
                  <Col span={6}>
                    <Form.Item
                      label="First Name"
                      name="firstName"
                      rules={[{ required: true, message: 'Please enter first name' }]}
                    >
                      <Input 
                        placeholder="Enter first name" 
                        onChange={(e) => handleNameChange('firstName', e.target.value)}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={6}>
                    <Form.Item
                      label="Last Name"
                      name="lastName"
                      rules={[{ required: true, message: 'Please enter last name' }]}
                    >
                      <Input 
                        placeholder="Enter last name" 
                        onChange={(e) => handleNameChange('lastName', e.target.value)}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={4}>
                    <Form.Item
                      label="Group Size"
                      name="groupSize"
                      rules={[{ required: true, message: 'Required' }]}
                    >
                      <Select
                        placeholder="Size"
                        onChange={handleNewEntryGroupSizeChange}
                      >
                        <Option value={1}>1 (Individual)</Option>
                        <Option value={2}>2 (Pair)</Option>
                        <Option value={3}>3 (Team)</Option>
                        <Option value={4}>4 (Team)</Option>
                        <Option value={5}>5 (Team)</Option>
                        <Option value={6}>6 (Team)</Option>
                        <Option value={7}>7 (Team)</Option>
                        <Option value={8}>8 (Team)</Option>
                        <Option value={9}>9 (Team)</Option>
                        <Option value={10}>10+ (Large Group)</Option>
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label=" ">
                      <Button 
                        icon={<DatabaseOutlined />} 
                        loading={runnerLookupLoading}
                        onClick={() => {
                          // Use the same runner lookup but for new entry form
                          const firstName = newEntryForm.getFieldValue('firstName');
                          const lastName = newEntryForm.getFieldValue('lastName');
                          
                          if (!firstName || !lastName) {
                            message.warning('Please enter first and last name to search MeOS database');
                            return;
                          }
                          
                          if (newEntryGroupSize >= 2) {
                            message.info('Runner lookup is not available for group entries');
                            return;
                          }
                          
                          const fullName = `${firstName} ${lastName}`;
                          setRunnerLookupLoading(true);
                          
                          meosApi.lookupRunners(fullName)
                            .then(runners => {
                              setRunnerSuggestions(runners);
                              if (runners.length === 0) {
                                message.info(`No runners found in MeOS database for "${fullName}"`);
                              } else {
                                message.success(`Found ${runners.length} runner(s) in MeOS database`);
                              }
                            })
                            .catch(error => {
                              console.error('Runner lookup failed:', error);
                              message.error('Failed to lookup runner in MeOS database');
                            })
                            .finally(() => setRunnerLookupLoading(false));
                        }}
                        disabled={newEntryGroupSize >= 2 || !runnerLookupAvailable}
                        block
                        title={newEntryGroupSize >= 2 ? 'Runner lookup not available for groups' : !runnerLookupAvailable ? 'Runner lookup not available in MeOS' : 'Search MeOS database for this runner'}
                      >
                        {newEntryGroupSize >= 2 ? 'N/A for Groups' : !runnerLookupAvailable ? 'Lookup Unavailable' : 'Lookup in MeOS'}
                      </Button>
                    </Form.Item>
                  </Col>
                </Row>
                
                {/* Runner Suggestions */}
                {runnerSuggestions.length > 0 && (
                  <Alert
                    message="Found in MeOS Database"
                    description={
                      <Space direction="vertical" style={{ width: '100%' }}>
                        {runnerSuggestions.map((runner, index) => (
                          <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text>
                              <strong>{runner.name}</strong> - {runner.club}
                            </Text>
                            <Button 
                              size="small" 
                              type="primary" 
                              icon={<CheckOutlined />}
                              onClick={() => {
                                // Apply runner data to new entry form
                                newEntryForm.setFieldsValue({
                                  club: runner.club || newEntryForm.getFieldValue('club'),
                                });
                                message.success(`Applied data for ${runner.name} from MeOS database`);
                                setRunnerSuggestions([]);
                              }}
                            >
                              Apply
                            </Button>
                          </div>
                        ))}
                      </Space>
                    }
                    type="info"
                    showIcon
                    style={{ marginBottom: '16px' }}
                    closable
                    onClose={() => setRunnerSuggestions([])}
                  />
                )}
                
                <Row gutter={16}>
                  {newEntryGroupSize === 1 && (
                    <>
                      <Col span={6}>
                        <Form.Item
                          label="Birth Year"
                          name="birthYear"
                        >
                          <Input placeholder="YYYY" maxLength={4} />
                        </Form.Item>
                      </Col>
                      <Col span={6}>
                        <Form.Item
                          label="Sex"
                          name="sex"
                        >
                          <Select placeholder="Select sex" allowClear>
                            <Option value="M">Male</Option>
                            <Option value="F">Female</Option>
                          </Select>
                        </Form.Item>
                      </Col>
                    </>
                  )}
                  <Col span={newEntryGroupSize === 1 ? 6 : 12}>
                    <Form.Item
                      label="Phone"
                      name="phone"
                    >
                      <Input placeholder="Phone number" />
                    </Form.Item>
                  </Col>
                  {newEntryGroupSize >= 2 && (
                    <Col span={12}>
                      <Alert
                        message={`Group Entry (${newEntryGroupSize} ${newEntryGroupSize === 1 ? 'runner' : 'runners'})`}
                        description="Birth year and sex are not used for group entries."
                        type="info"
                        showIcon
                        style={{ margin: 0 }}
                      />
                    </Col>
                  )}
                </Row>
              </Card>
            </Col>
            
            {/* Club Information Section */}
            <Col span={24}>
              <Card title="Club Information" size="small" style={{ marginBottom: '16px' }}>
                <Row gutter={16}>
                  <Col span={18}>
                    <Form.Item
                      label="Club Name"
                      name="club"
                      rules={[{ required: true, message: 'Please enter club name' }]}
                    >
                      <Input placeholder="Enter club name" />
                    </Form.Item>
                  </Col>
                  <Col span={6}>
                    <Form.Item label=" ">
                      <Button 
                        icon={<DatabaseOutlined />} 
                        loading={clubLookupLoading}
                        onClick={() => {
                          // Use club lookup for new entry form
                          const clubName = newEntryForm.getFieldValue('club');
                          
                          if (!clubName || clubName.trim() === '') {
                            message.warning('Please enter a club name to search MeOS database');
                            return;
                          }
                          
                          setClubLookupLoading(true);
                          
                          meosApi.lookupClubs(clubName.trim())
                            .then(clubs => {
                              setClubSuggestions(clubs);
                              if (clubs.length === 0) {
                                message.info(`No clubs found in MeOS database for "${clubName}"`);
                              } else {
                                message.success(`Found ${clubs.length} club(s) in MeOS database`);
                              }
                            })
                            .catch(error => {
                              console.error('Club lookup failed:', error);
                              message.error('Failed to lookup club in MeOS database');
                            })
                            .finally(() => setClubLookupLoading(false));
                        }}
                        block
                      >
                        Lookup Club
                      </Button>
                    </Form.Item>
                  </Col>
                </Row>
                
                {/* Club Suggestions */}
                {clubSuggestions.length > 0 && (
                  <Alert
                    message="Found Clubs in MeOS Database"
                    description={
                      <Space direction="vertical" style={{ width: '100%' }}>
                        {clubSuggestions.map((club, index) => (
                          <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text>
                              <strong>{club.name}</strong>
                            </Text>
                            <Button 
                              size="small" 
                              type="primary" 
                              icon={<CheckOutlined />}
                              onClick={() => {
                                // Apply club data to new entry form
                                newEntryForm.setFieldsValue({
                                  club: club.name
                                });
                                message.success(`Applied club: ${club.name}`);
                                setClubSuggestions([]);
                              }}
                            >
                              Apply
                            </Button>
                          </div>
                        ))}
                      </Space>
                    }
                    type="info"
                    showIcon
                    style={{ marginBottom: '16px' }}
                    closable
                    onClose={() => setClubSuggestions([])}
                  />
                )}
              </Card>
            </Col>
            
            {/* Competition Information Section */}
            <Col span={24}>
              <Card title="Competition Information" size="small">
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item
                      label="Class"
                      name="classId"
                      rules={[{ required: true, message: 'Please select a class' }]}
                    >
                      <Select 
                        placeholder="Select class" 
                        loading={availableClasses.length === 0}
                        showSearch
                        filterOption={(input, option) => 
                          option?.children?.toLowerCase().indexOf(input.toLowerCase()) >= 0
                        }
                        // Class selection no longer updates fee since it's not user-editable
                      >
                        {availableClasses.map(cls => (
                          <Option key={cls.id} value={cls.id}>
                            {cls.name} {cls.fee ? `($${cls.fee})` : ''} 
                            {cls.remainingMaps !== undefined && cls.remainingMaps < 10 ? 
                              ` - ${cls.remainingMaps} maps left` : ''}
                          </Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item
                      label="Card Number"
                      name="cardNumber"
                    >
                      <Input placeholder="SI Card number (leave empty for rental)" />
                    </Form.Item>
                  </Col>
                  <Col span={4}>
                    <Form.Item
                      name="isHiredCard"
                      valuePropName="checked"
                      label=" "
                    >
                      <Checkbox>Hired Card</Checkbox>
                    </Form.Item>
                  </Col>
                </Row>
                
                <Row gutter={16}>
                  <Col span={24}>
                    <Alert
                      message="💳 Card Assignment"
                      description="If you have a card number available now, enter it. Otherwise, leave empty and assign a rental card later."
                      type="success"
                      showIcon
                      style={{ margin: 0 }}
                    />
                  </Col>
                </Row>
              </Card>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Card Reader Confirmation Modal */}
      <Modal
        title={`Card Reader - ${scannedCard ? `Card ${scannedCard.cardNumber}` : 'Card Detected'}`}
        visible={cardConfirmationVisible}
        onCancel={() => {
          setCardConfirmationVisible(false);
          setCardEditMode(false);
          setScannedCard(null);
          setMatchedEntry(null);
          setSuggestedEntries([]);
          cardEditForm.resetFields();
        }}
        footer={null}
        width={800}
        destroyOnClose={true}
      >
        {/* Edit Details Form */}
        {matchedEntry && cardEditMode && (
          <div>
            <Alert
              message={isHiredCard ? 'MeOS Hired Card - Edit Details' : 'Edit Details Before Check-In'}
              description={isHiredCard 
                ? 'This card is confirmed in the MeOS hired card database. Review and edit details as needed, then check in.'
                : 'Review and edit the runner details as needed, then check in.'
              }
              type={isHiredCard ? 'success' : 'info'}
              showIcon
              style={{ marginBottom: '16px' }}
            />
            
            <Form
              form={cardEditForm}
              layout="vertical"
              style={{ marginBottom: '24px' }}
            >
              <Card title="Runner Details" size="small" style={{ marginBottom: '16px' }}>
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item
                      name="firstName"
                      label="First Name"
                      rules={[{ required: true, message: 'Please enter first name' }]}
                    >
                      <Input placeholder="Enter first name" />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item
                      name="lastName"
                      label="Last Name"
                      rules={parseInt(matchedEntry?.nationality || '0') < 2 ? [{ required: true, message: 'Please enter last name' }] : []}
                    >
                      <Input 
                        placeholder={parseInt(matchedEntry?.nationality || '0') >= 2 ? 'Last name (optional for groups)' : 'Enter last name'}
                        disabled={parseInt(matchedEntry?.nationality || '0') >= 2}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item
                      name="club"
                      label="Club"
                      rules={[{ required: true, message: 'Please enter club name' }]}
                    >
                      <Input placeholder="Enter club name" />
                    </Form.Item>
                  </Col>
                </Row>
                
                {parseInt(matchedEntry?.nationality || '0') < 2 && (
                  <Row gutter={16}>
                    <Col span={8}>
                      <Form.Item
                        name="birthYear"
                        label="Birth Year"
                      >
                        <Input placeholder="YYYY" maxLength={4} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item
                        name="sex"
                        label="Sex"
                      >
                        <Select placeholder="Select sex" allowClear>
                          <Option value="M">Male</Option>
                          <Option value="F">Female</Option>
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item
                        name="phone"
                        label="Phone"
                      >
                        <Input placeholder="Phone number" />
                      </Form.Item>
                    </Col>
                  </Row>
                )}
                
                {parseInt(matchedEntry?.nationality || '0') >= 2 && (
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item
                        name="phone"
                        label="Phone"
                      >
                        <Input placeholder="Phone number" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Alert
                        message={`Group Entry (${matchedEntry?.nationality || '2'} runners)`}
                        description="Birth year and sex are not used for group entries."
                        type="info"
                        showIcon
                        style={{ margin: 0 }}
                      />
                    </Col>
                  </Row>
                )}
                
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item
                      name="classId"
                      label="Class"
                      rules={[{ required: true, message: 'Please select a class' }]}
                    >
                      <Select placeholder="Select class" showSearch>
                        {availableClasses.map(cls => (
                          <Option key={cls.id} value={cls.id}>
                            {cls.name} {cls.fee ? `($${cls.fee})` : ''}
                          </Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item
                      name="cardNumber"
                      label="Card Number"
                      rules={[{ required: true, message: 'Card number is required' }]}
                    >
                      <Input placeholder="SI Card number" />
                    </Form.Item>
                  </Col>
                  <Col span={4}>
                    <Form.Item
                      name="isHiredCard"
                      valuePropName="checked"
                      label=" "
                    >
                      <Checkbox>Hired</Checkbox>
                    </Form.Item>
                  </Col>
                </Row>
              </Card>
            </Form>
            
            <Row gutter={16} justify="space-between" align="middle">
              <Col>
                <Button
                  onClick={handleCancelEditDetails}
                >
                  Cancel
                </Button>
              </Col>
              <Col>
                <Space>
                  <Button
                    type="primary"
                    size="large"
                    icon={<LoginOutlined />}
                    onClick={handleSaveEditedDetailsAndCheckIn}
                  >
                    Review & Check In
                  </Button>
                </Space>
              </Col>
            </Row>
          </div>
        )}

        {/* Multiple Matches or Rental Assignment */}
        {!matchedEntry && suggestedEntries.length > 0 && (
          <div>
            <Alert
              message={isHiredCard ? 'MeOS Hired Card - Select Entry to Assign' : 'Select Entry for Rental Card'}
              description={isHiredCard 
                ? 'This card is confirmed in the MeOS hired card database. Select an entry to assign it to:'
                : 'This card could be assigned to one of these entries that need cards:'
              }
              type={isHiredCard ? 'success' : 'info'}
              showIcon
              style={{ marginBottom: '16px' }}
            />
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {suggestedEntries.map(entry => (
                <Card key={entry.id} size="small" style={{ marginBottom: '12px' }}>
                  <Row gutter={16} align="middle">
                    <Col flex="auto">
                      <Space direction="vertical">
                        <Text strong style={{ fontSize: '14px' }}>
                          {entry.name.first} {entry.name.last}
                        </Text>
                        <Text type="secondary">
                          {entry.className} • {entry.club}
                        </Text>
                        {entry.phone && (
                          <Text type="secondary" style={{ fontSize: '12px' }}>
                            📞 {entry.phone}
                          </Text>
                        )}
                        <Tag color="orange">Needs Card</Tag>
                      </Space>
                    </Col>
                    <Col>
                      <Button
                        type={isHiredCard ? 'primary' : 'default'}
                        icon={<IdcardOutlined />}
                        onClick={() => handleRentalCardSelection(entry)}
                      >
                        {isHiredCard ? 'Assign Hired Card' : 'Assign Card'}
                      </Button>
                    </Col>
                  </Row>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* No Matches */}
        {!matchedEntry && suggestedEntries.length === 0 && (
          <Alert
            message={isHiredCard ? 'MeOS Hired Card - No Entries Need Cards' : 'No Matching Entries'}
            description={isHiredCard
              ? 'This is a confirmed hired card from MeOS, but no entries currently need rental cards.'
              : 'This card doesn\'t match any pending entries and no entries currently need rental cards.'
            }
            type={isHiredCard ? 'warning' : 'info'}
            showIcon
          />
        )}
      </Modal>

    </div>
  );
};

export default EventDayDashboard;
