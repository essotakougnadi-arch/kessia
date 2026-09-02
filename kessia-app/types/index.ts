// KESSIA — TypeScript Types

// ============================================================
// Auth & User
// ============================================================
export type UserRole =
  | 'USER'
  | 'ADMIN'
  | 'SUPER_ADMIN'
  | 'COMPLIANCE'
  | 'FINANCE'
  | 'SUPPORT'
  | 'MODERATOR'
  | 'CONTENT_MANAGER'
  | 'OPERATIONS'
  | 'ANALYST';

export type KycStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'UNDER_REVIEW'
  | 'VERIFIED'
  | 'REJECTED'
  | 'ACTION_REQUIRED';

export interface User {
  id: string;
  phone: string;
  email?: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  kycStatus: KycStatus;
  kycLevel: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile extends User {
  avatar?: string;
  profession?: string;
  city?: string;
  country: string;
  language: string;
  bio?: string;
  kessiaScore?: number;
}

// ============================================================
// Wallet & Ledger
// ============================================================
export type TransactionType =
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'TONTINE_CONTRIBUTION'
  | 'TONTINE_PAYOUT'
  | 'SALE_PAYMENT'
  | 'FEE'
  | 'REVERSAL'
  | 'REFUND';

export type TransactionStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REVERSED'
  | 'CANCELLED';

export interface Wallet {
  id: string;
  userId: string;
  balance: number;
  currency: string;
  isLocked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface LedgerEntry {
  id: string;
  walletId: string;
  type: TransactionType;
  direction: 'CREDIT' | 'DEBIT';
  amount: number;
  currency: string;
  balanceBefore: number;
  balanceAfter: number;
  status: TransactionStatus;
  description?: string;
  referenceId?: string;
  externalReference?: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  processedAt?: Date;
}

// ============================================================
// Tontine
// ============================================================
export type TontineType = 'CLASSIC_ROTATING' | 'PROJECT' | 'GROWTH' | 'PURCHASE';
export type TontineFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
export type TontineStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'SUSPENDED' | 'CANCELLED';
export type MemberStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'REMOVED';
export type ContributionStatus = 'PENDING' | 'PAID' | 'LATE' | 'WAIVED';

export interface Tontine {
  id: string;
  name: string;
  description?: string;
  type: TontineType;
  amount: number;
  currency: string;
  frequency: TontineFrequency;
  startDate: Date;
  maxMembers: number;
  rules?: string;
  isPublic: boolean;
  inviteCode: string;
  status: TontineStatus;
  createdById: string;
  memberCount: number;
  nextContributionDate?: Date;
  currentRound: number;
  totalRounds: number;
  createdAt: Date;
}

export interface TontineMember {
  id: string;
  tontineId: string;
  userId: string;
  status: MemberStatus;
  orderPosition?: number;
  totalContributed: number;
  totalReceived: number;
  joinedAt: Date;
  user?: Pick<User, 'id' | 'firstName' | 'lastName' | 'phone'>;
}

export interface TontineContribution {
  id: string;
  tontineId: string;
  memberId: string;
  round: number;
  amount: number;
  status: ContributionStatus;
  dueDate: Date;
  paidAt?: Date;
  transactionId?: string;
}

// ============================================================
// Business
// ============================================================
export type BusinessStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
export type SaleStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'REFUNDED';
export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export interface Business {
  id: string;
  userId: string;
  name: string;
  sector: string;
  description?: string;
  phone?: string;
  city?: string;
  logo?: string;
  status: BusinessStatus;
  createdAt: Date;
}

export interface Product {
  id: string;
  businessId: string;
  name: string;
  description?: string;
  price: number;
  cost?: number;
  stock: number;
  category?: string;
  image?: string;
  isActive: boolean;
  createdAt: Date;
}

export interface Sale {
  id: string;
  businessId: string;
  customerId?: string;
  totalAmount: number;
  paymentMethod?: string;
  status: SaleStatus;
  notes?: string;
  createdAt: Date;
  items?: SaleItem[];
}

export interface SaleItem {
  id: string;
  saleId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  product?: Pick<Product, 'name' | 'image'>;
}

export interface Expense {
  id: string;
  businessId: string;
  category: string;
  amount: number;
  description?: string;
  date: Date;
  receiptUrl?: string;
  createdAt: Date;
}

export interface Invoice {
  id: string;
  businessId: string;
  invoiceNumber: string;
  customerId?: string;
  customerName?: string;
  customerEmail?: string;
  items: InvoiceItem[];
  subtotal: number;
  tax?: number;
  total: number;
  status: InvoiceStatus;
  dueDate?: Date;
  issuedAt: Date;
  paidAt?: Date;
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

// ============================================================
// Business Dashboard
// ============================================================
export interface BusinessDashboard {
  todaySales: number;
  monthSales: number;
  monthExpenses: number;
  estimatedMargin: number;
  totalTransactions: number;
  topProducts: { name: string; count: number; revenue: number }[];
  lowStockProducts: { id: string; name: string; stock: number }[];
  recentSales: Sale[];
}

// ============================================================
// Notifications
// ============================================================
export type NotificationCategory =
  | 'SECURITY'
  | 'PAYMENT'
  | 'TONTINE'
  | 'BUSINESS'
  | 'SUPPORT'
  | 'SYSTEM'
  | 'PROMOTION';

export type NotificationPriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';

export interface Notification {
  id: string;
  userId: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  body: string;
  actionUrl?: string;
  isRead: boolean;
  createdAt: Date;
}

// ============================================================
// Support
// ============================================================
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING' | 'RESOLVED' | 'CLOSED';
export type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type TicketCategory =
  | 'ACCOUNT'
  | 'KYC'
  | 'WALLET'
  | 'TONTINE'
  | 'BUSINESS'
  | 'PAYMENT'
  | 'SECURITY'
  | 'OTHER';

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  userId: string;
  category: TicketCategory;
  priority: TicketPriority;
  subject: string;
  description: string;
  status: TicketStatus;
  assignedToId?: string;
  resolvedAt?: Date;
  closedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// KESSIA AI
// ============================================================
export type AiMessageRole = 'USER' | 'ASSISTANT';
export type AiContext =
  | 'ONBOARDING'
  | 'KYC'
  | 'WALLET'
  | 'TONTINE'
  | 'BUSINESS'
  | 'SUPPORT'
  | 'GENERAL';

export interface AiMessage {
  id: string;
  role: AiMessageRole;
  content: string;
  suggestions?: string[];
  actionButtons?: { label: string; action: string }[];
  timestamp: Date;
}

export interface AiConversation {
  id: string;
  userId: string;
  context: AiContext;
  messages: AiMessage[];
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// API Responses
// ============================================================
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  errors?: Record<string, string[]>;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    hasMore?: boolean;
  };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

// ============================================================
// Form Types
// ============================================================
export interface RegisterForm {
  phone: string;
  firstName: string;
  lastName: string;
  password: string;
  acceptTerms: boolean;
  acceptPrivacy: boolean;
}

export interface LoginForm {
  phone: string;
  password: string;
}

export interface OtpForm {
  code: string;
}

export interface CreateTontineForm {
  name: string;
  description?: string;
  type: TontineType;
  amount: number;
  frequency: TontineFrequency;
  startDate: string;
  maxMembers: number;
  rules?: string;
  isPublic: boolean;
}
