// MeOS Entry Build - Type Definitions

// === Web Serial API Types ===

// Global declarations for Web Serial API
declare global {
  interface Navigator {
    serial: Serial;
  }

  interface Serial {
    requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
    getPorts(): Promise<SerialPort[]>;
  }

  interface SerialPortRequestOptions {
    filters?: SerialPortFilter[];
  }

  interface SerialPortFilter {
    usbVendorId?: number;
    usbProductId?: number;
  }

  interface SerialPort {
    open(options: SerialOptions): Promise<void>;
    close(): Promise<void>;
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    getInfo(): SerialPortInfo;
  }

  interface SerialPortInfo {
    usbVendorId?: number;
    usbProductId?: number;
  }

  interface SerialOptions {
    baudRate: number;
    dataBits?: number;
    stopBits?: number;
    parity?: 'none' | 'even' | 'odd';
    bufferSize?: number;
    flowControl?: 'none' | 'hardware';
  }
}

// === MeOS API Types ===

export interface MeosApiConfig {
  baseUrl: string;
  timeout: number;
  retryAttempts: number;
}

export interface MeosApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  rawXml?: string;
}

// === Entry Management Types ===

export interface EntryParams {
  name: string;
  club: string;
  classId: number;
  cardNumber: number;
  cardFee?: number; // Fee for hired/rental cards - MeOS requires >0 value to mark card as hired
  birthYear?: number;
  sex?: 'M' | 'F';
  nationality?: string;
  phone?: string;
  bib?: string;
  rank?: string;
  textA?: string;
  dataA?: number;
  dataB?: number;
  noTiming?: boolean;
}

export interface Entry {
  id?: number; // MeOS ID after creation
  name: string;
  club: string;
  classId: number;
  className?: string;
  cardNumber: number;
  birthYear?: number;
  sex?: 'M' | 'F';
  nationality?: string;
  phone?: string;
  bib?: string;
  fee: number;
  isHiredCard: boolean;
  status: 'new' | 'submitted' | 'error';
  createdAt: Date;
  submittedAt?: Date;
  errorMessage?: string;
}

export interface EntryResult {
  success: boolean;
  entry?: Entry;
  fee?: number;
  info?: string;
  error?: string;
  isHiredCard?: boolean;
}

// === Database Lookup Types ===

export interface Runner {
  id: number;
  name: string;
  club: string;
  clubId?: number;
  birthYear?: number;
  sex?: 'M' | 'F';
  nationality?: string;
  cardNumber?: number;
  externalId?: string;
}

export interface Club {
  id: number;
  name: string;
  shortName?: string;
  country?: string;
  district?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  externalId?: string;
}

export interface Class {
  id: number;
  name: string;
  shortName?: string;
  allowQuickEntry: boolean;
  fee: number;
  remainingMaps?: number;
  ageFrom?: number;
  ageTo?: number;
  sex?: 'M' | 'F' | 'X'; // X for mixed/open
}

export interface Competition {
  id?: number;
  name: string;
  date: string;
  organizer?: string;
  venue?: string;
  classes: Class[];
}

// === Hired Card Management Types ===

export interface HiredCard {
  id: number;
  cardNumber: number;
  status: 'available' | 'assigned' | 'checked-out' | 'returned' | 'damaged';
  condition: 'excellent' | 'good' | 'fair' | 'poor' | 'damaged';
  assignedTo?: string; // Runner name
  assignedToId?: number; // Runner ID
  checkOutTime?: Date;
  returnTime?: Date;
  rentalFee: number;
  depositRequired: boolean;
  depositAmount?: number;
  notes?: string;
  lastCleanedAt?: Date;
  purchaseDate?: Date;
  retirementDate?: Date;
}

export interface CardAssignment {
  id: string;
  cardId: number;
  cardNumber: number;
  runnerId: number;
  runnerName: string;
  assignedAt: Date;
  checkedOutAt?: Date;
  returnedAt?: Date;
  condition?: string;
  damageNotes?: string;
  finalFee?: number;
  depositReturned?: boolean;
}

export interface CardInventoryStats {
  total: number;
  available: number;
  assigned: number;
  checkedOut: number;
  damaged: number;
  totalValue: number;
  outstandingDeposits: number;
}

// === Entry Modification Types ===

export interface EntryModification {
  id: string;
  runnerId: number;
  runnerName: string;
  modificationType: 'course' | 'card' | 'personal' | 'status';
  currentValue: any;
  requestedValue: any;
  reason?: string;
  requestedAt: Date;
  requestedBy?: string;
  status: 'pending' | 'exported' | 'completed' | 'error' | 'cancelled';
  priority: 'low' | 'medium' | 'high';
  approvedBy?: string;
  appliedAt?: Date;
  errorMessage?: string;
  exportFilename?: string;
}

export interface ModificationExport {
  id: string;
  filename: string;
  format: 'csv' | 'xml';
  modifications: EntryModification[];
  createdAt: Date;
  exportedBy?: string;
  importedAt?: Date;
  importStatus?: 'pending' | 'success' | 'error';
  importNotes?: string;
}

// === Dashboard and Statistics Types ===

export interface DashboardStats {
  todayEntries: number;
  pendingModifications: number;
  availableCards: number;
  checkedOutCards: number;
  totalRevenue: number;
  lastSyncTime?: Date;
  meosConnectionStatus: 'connected' | 'disconnected' | 'error';
}

export interface RegistrationStats {
  totalEntries: number;
  newEntries: number;
  modifiedEntries: number;
  errorEntries: number;
  entriesByClass: Record<string, number>;
  entriesByClub: Record<string, number>;
  hourlyRegistrations: Array<{ hour: number; count: number }>;
}

// === Form and Validation Types ===

export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings?: ValidationError[];
}

export interface FormState {
  isLoading: boolean;
  errors: Record<string, string>;
  isDirty: boolean;
  isValid: boolean;
  touchedFields: Record<string, boolean>;
}

// === Configuration Types ===

export interface AppConfig {
  meosApiUrl: string;
  meosPort: number;
  databasePath: string;
  exportPath: string;
  backupPath: string;
  autoBackup: boolean;
  offlineMode: boolean;
  printingEnabled: boolean;
  cardInventoryEnabled: boolean;
  modificationsEnabled: boolean;
  debugMode: boolean;
  language: 'en' | 'sv'; // English or Swedish
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  compactMode: boolean;
  showTooltips: boolean;
  autoSaveInterval: number; // minutes
  defaultClass?: number;
  defaultClub?: string;
  quickActions: string[];
}

// === Audit and Logging Types ===

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  userId?: string;
  action: string;
  entityType: 'entry' | 'card' | 'modification' | 'config';
  entityId: string;
  oldValue?: any;
  newValue?: any;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
  sessionId?: string;
}

export interface SystemLog {
  id: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  timestamp: Date;
  message: string;
  component: string;
  data?: Record<string, any>;
  error?: Error;
  correlationId?: string;
}

// === API Client Types ===

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  details?: any;
  timestamp: Date;
}

export interface ApiRequestConfig {
  timeout?: number;
  retries?: number;
  validateResponse?: boolean;
  skipErrorHandling?: boolean;
}

// === Event Management Types ===

export interface EventSession {
  id: string;
  startTime: Date;
  endTime?: Date;
  totalEntries: number;
  totalRevenue: number;
  operatorName?: string;
  notes?: string;
  backupCreated: boolean;
  finalReportGenerated: boolean;
}

export interface QuickAction {
  id: string;
  name: string;
  icon: string;
  description: string;
  action: () => void;
  enabled: boolean;
  keyboardShortcut?: string;
}

// === Utility Types ===

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// === Component Props Types ===

export interface BaseComponentProps {
  className?: string;
  testId?: string;
  loading?: boolean;
  disabled?: boolean;
}

export interface TableColumn<T = any> {
  key: string;
  title: string;
  dataIndex: keyof T;
  width?: number;
  sortable?: boolean;
  filterable?: boolean;
  render?: (value: any, record: T, index: number) => React.ReactNode;
}

export interface ModalProps extends BaseComponentProps {
  visible: boolean;
  title: string;
  onCancel: () => void;
  onOk?: () => void;
  width?: number;
  footer?: React.ReactNode;
}

// All types are already exported individually above
