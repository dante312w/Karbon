import type {
  ActivateLicenseRequest,
  AddOrderItemsRequest,
  AreaDto,
  AuditLogDto,
  AuditLogQuery,
  AuthUser,
  BackupDto,
  CancelRequest,
  CashMovementDto,
  CashSessionDto,
  CashSessionSummaryDto,
  CategoryDto,
  CertificateInfoDto,
  CloseCashSessionRequest,
  CompleteSetupRequest,
  CreateAreaRequest,
  CreateCashMovementRequest,
  CreateCategoryRequest,
  CreateCustomerRequest,
  CreateExpenseRequest,
  CreateFloorElementRequest,
  CreateIngredientRequest,
  CreateInventoryMovementRequest,
  CreateNoteOptionRequest,
  CreateNumberingRangeRequest,
  CreateOrderRequest,
  CreatePaymentRequest,
  CreatePrinterRequest,
  CreateProductRequest,
  CreatePurchaseRequest,
  CreateReservationRequest,
  CreateRoleRequest,
  CreateStaffCallRequest,
  CreateSupplierRequest,
  CreateTableRequest,
  CreateTaxRequest,
  CreateUserRequest,
  CustomerDto,
  CustomerHistoryEntry,
  DashboardDto,
  DateRangeQuery,
  DuplicateOrderRequest,
  ExpenseDto,
  FloorElementDto,
  HealthResponse,
  IngredientDto,
  InventoryMovementDto,
  InventoryMovementQuery,
  InvoiceDto,
  IssueInvoiceRequest,
  KitchenTicketDto,
  KitchenTicketQuery,
  KitchenTicketStatus,
  LicenseStatusDto,
  LoginRequest,
  LoginResponse,
  LowStockAlert,
  MergeTablesRequest,
  MoveOrderRequest,
  NoteOptionDto,
  NumberingRangeDto,
  OpenCashSessionRequest,
  OrderDto,
  OrderListQuery,
  Paginated,
  PageQuery,
  PaymentDto,
  PaymentResultDto,
  PinLoginRequest,
  PinUserOption,
  PrinterDto,
  ProductDto,
  PurchaseDto,
  RecipeItemDto,
  ReceiptDocument,
  ReorderItemsRequest,
  ReorderNoteOptionsRequest,
  ReservationDto,
  RestaurantSettingsDto,
  RoleDto,
  ServerInfo,
  SetOrderDiscountRequest,
  SetRecipeRequest,
  SetTableStatusRequest,
  SetupStatusDto,
  SplitOrderRequest,
  StaffCallDto,
  SupplierDto,
  TableDto,
  TaxDto,
  UpdateAreaRequest,
  UpdateCategoryRequest,
  UpdateCustomerRequest,
  UpdateFloorElementRequest,
  UpdateIngredientRequest,
  UpdateNoteOptionRequest,
  UpdateOrderItemRequest,
  UpdateOrderRequest,
  UpdatePrinterRequest,
  UpdateProductRequest,
  UpdateReservationRequest,
  UpdateRoleRequest,
  UpdateSettingsRequest,
  UpdateSupplierRequest,
  UpdateTableRequest,
  UpdateTaxRequest,
  UpdateUserRequest,
  UserDto,
  VersionedRequest,
  VoidPaymentRequest,
} from '@karbon/types';
import { type HttpClient, queryString, type RequestOptions } from './http-client';

const PUBLIC: RequestOptions = { auth: false };

/** Funciones tipadas por módulo de la API REST. */
export function createApi(http: HttpClient) {
  return {
    system: {
      health: () => http.get<HealthResponse>('/health', PUBLIC),
      info: () => http.get<ServerInfo>('/system/info', PUBLIC),
      setupStatus: () => http.get<SetupStatusDto>('/setup/status', PUBLIC),
      completeSetup: (body: CompleteSetupRequest) =>
        http.post<LoginResponse>('/setup', body, PUBLIC),
      certificate: () => http.get<CertificateInfoDto>('/system/certificate', PUBLIC),
      license: () => http.get<LicenseStatusDto>('/license'),
      activateLicense: (body: ActivateLicenseRequest) =>
        http.post<LicenseStatusDto>('/license', body),
      backups: () => http.get<BackupDto[]>('/backups'),
      createBackup: () => http.post<BackupDto>('/backups'),
      restoreBackup: (fileName: string) =>
        http.post<undefined>(`/backups/${encodeURIComponent(fileName)}/restore`),
      auditLogs: (query: AuditLogQuery = {}) =>
        http.get<Paginated<AuditLogDto>>(`/audit-logs${queryString(query)}`),
    },
    auth: {
      login: (body: LoginRequest) => http.post<LoginResponse>('/auth/login', body, PUBLIC),
      pinLogin: (body: PinLoginRequest) =>
        http.post<LoginResponse>('/auth/pin-login', body, PUBLIC),
      pinUsers: () => http.get<PinUserOption[]>('/auth/pin-users', PUBLIC),
      logout: (refreshToken: string) =>
        http.post<undefined>('/auth/logout', { refreshToken }, PUBLIC),
      me: () => http.get<AuthUser>('/auth/me'),
    },
    settings: {
      get: () => http.get<RestaurantSettingsDto>('/settings'),
      update: (body: UpdateSettingsRequest) => http.patch<RestaurantSettingsDto>('/settings', body),
      uploadLogo: (dataUrl: string) =>
        http.put<RestaurantSettingsDto>('/settings/logo', { dataUrl }),
      taxes: () => http.get<TaxDto[]>('/taxes'),
      createTax: (body: CreateTaxRequest) => http.post<TaxDto>('/taxes', body),
      updateTax: (id: string, body: UpdateTaxRequest) => http.patch<TaxDto>(`/taxes/${id}`, body),
      printers: () => http.get<PrinterDto[]>('/printers'),
      createPrinter: (body: CreatePrinterRequest) => http.post<PrinterDto>('/printers', body),
      updatePrinter: (id: string, body: UpdatePrinterRequest) =>
        http.patch<PrinterDto>(`/printers/${id}`, body),
      deletePrinter: (id: string) => http.delete(`/printers/${id}`),
      testPrinter: (id: string) => http.post<undefined>(`/printers/${id}/test`),
      numberingRanges: () => http.get<NumberingRangeDto[]>('/numbering-ranges'),
      createNumberingRange: (body: CreateNumberingRangeRequest) =>
        http.post<NumberingRangeDto>('/numbering-ranges', body),
      setNumberingRangeActive: (id: string, isActive: boolean) =>
        http.patch<NumberingRangeDto>(`/numbering-ranges/${id}`, { isActive }),
    },
    users: {
      list: () => http.get<UserDto[]>('/users'),
      create: (body: CreateUserRequest) => http.post<UserDto>('/users', body),
      update: (id: string, body: UpdateUserRequest) => http.patch<UserDto>(`/users/${id}`, body),
      remove: (id: string) => http.delete(`/users/${id}`),
      roles: () => http.get<RoleDto[]>('/roles'),
      createRole: (body: CreateRoleRequest) => http.post<RoleDto>('/roles', body),
      updateRole: (id: string, body: UpdateRoleRequest) =>
        http.patch<RoleDto>(`/roles/${id}`, body),
      removeRole: (id: string) => http.delete(`/roles/${id}`),
    },
    floor: {
      areas: () => http.get<AreaDto[]>('/areas'),
      createArea: (body: CreateAreaRequest) => http.post<AreaDto>('/areas', body),
      updateArea: (id: string, body: UpdateAreaRequest) =>
        http.patch<AreaDto>(`/areas/${id}`, body),
      removeArea: (id: string) => http.delete(`/areas/${id}`),
      createElement: (areaId: string, body: CreateFloorElementRequest) =>
        http.post<FloorElementDto>(`/areas/${areaId}/elements`, body),
      updateElement: (id: string, body: UpdateFloorElementRequest) =>
        http.patch<FloorElementDto>(`/floor-elements/${id}`, body),
      removeElement: (id: string) => http.delete(`/floor-elements/${id}`),
      tables: (query: { areaId?: string; includeInactive?: boolean } = {}) =>
        http.get<TableDto[]>(`/tables${queryString(query)}`),
      createTable: (body: CreateTableRequest) => http.post<TableDto>('/tables', body),
      updateTable: (id: string, body: UpdateTableRequest) =>
        http.patch<TableDto>(`/tables/${id}`, body),
      removeTable: (id: string) => http.delete(`/tables/${id}`),
      merge: (id: string, body: MergeTablesRequest) =>
        http.post<TableDto>(`/tables/${id}/merge`, body),
      unmerge: (id: string) => http.post<TableDto>(`/tables/${id}/unmerge`),
      setStatus: (id: string, body: SetTableStatusRequest) =>
        http.patch<TableDto>(`/tables/${id}/status`, body),
      reservations: (query: { from?: string; to?: string } = {}) =>
        http.get<ReservationDto[]>(`/reservations${queryString(query)}`),
      createReservation: (body: CreateReservationRequest) =>
        http.post<ReservationDto>('/reservations', body),
      updateReservation: (id: string, body: UpdateReservationRequest) =>
        http.patch<ReservationDto>(`/reservations/${id}`, body),
      removeReservation: (id: string) => http.delete(`/reservations/${id}`),
    },
    catalog: {
      categories: (includeInactive = false) =>
        http.get<CategoryDto[]>(
          `/categories${queryString({ includeInactive: includeInactive || undefined })}`,
        ),
      createCategory: (body: CreateCategoryRequest) => http.post<CategoryDto>('/categories', body),
      updateCategory: (id: string, body: UpdateCategoryRequest) =>
        http.patch<CategoryDto>(`/categories/${id}`, body),
      removeCategory: (id: string) => http.delete(`/categories/${id}`),
      noteOptions: (includeInactive = false) =>
        http.get<NoteOptionDto[]>(
          `/note-options${queryString({ includeInactive: includeInactive || undefined })}`,
        ),
      createNoteOption: (body: CreateNoteOptionRequest) =>
        http.post<NoteOptionDto>('/note-options', body),
      updateNoteOption: (id: string, body: UpdateNoteOptionRequest) =>
        http.patch<NoteOptionDto>(`/note-options/${id}`, body),
      removeNoteOption: (id: string) => http.delete(`/note-options/${id}`),
      reorderNoteOptions: (body: ReorderNoteOptionsRequest) =>
        http.put<NoteOptionDto[]>('/note-options/order', body),
      products: (query: { categoryId?: string; search?: string; includeInactive?: boolean } = {}) =>
        http.get<ProductDto[]>(`/products${queryString(query)}`),
      createProduct: (body: CreateProductRequest) => http.post<ProductDto>('/products', body),
      updateProduct: (id: string, body: UpdateProductRequest) =>
        http.patch<ProductDto>(`/products/${id}`, body),
      setAvailability: (id: string, isAvailable: boolean) =>
        http.patch<ProductDto>(`/products/${id}/availability`, { isAvailable }),
      removeProduct: (id: string) => http.delete(`/products/${id}`),
      uploadProductImage: (id: string, dataUrl: string) =>
        http.put<ProductDto>(`/products/${id}/image`, { dataUrl }),
      recipe: (id: string) => http.get<RecipeItemDto[]>(`/products/${id}/recipe`),
      setRecipe: (id: string, body: SetRecipeRequest) =>
        http.put<RecipeItemDto[]>(`/products/${id}/recipe`, body),
    },
    orders: {
      list: (query: OrderListQuery & PageQuery = {}) =>
        http.get<Paginated<OrderDto>>(`/orders${queryString(query)}`),
      get: (id: string) => http.get<OrderDto>(`/orders/${id}`),
      create: (body: CreateOrderRequest, idempotencyKey?: string) =>
        http.post<OrderDto>('/orders', body, idempotencyKey ? { idempotencyKey } : {}),
      update: (id: string, body: UpdateOrderRequest) => http.patch<OrderDto>(`/orders/${id}`, body),
      addItems: (id: string, body: AddOrderItemsRequest, idempotencyKey?: string) =>
        http.post<OrderDto>(`/orders/${id}/items`, body, idempotencyKey ? { idempotencyKey } : {}),
      updateItem: (id: string, itemId: string, body: UpdateOrderItemRequest) =>
        http.patch<OrderDto>(`/orders/${id}/items/${itemId}`, body),
      cancelItem: (id: string, itemId: string, body: VersionedRequest & { reason?: string }) =>
        http.post<OrderDto>(`/orders/${id}/items/${itemId}/cancel`, body),
      duplicateItem: (id: string, itemId: string, body: VersionedRequest) =>
        http.post<OrderDto>(`/orders/${id}/items/${itemId}/duplicate`, body),
      reorderItems: (id: string, body: ReorderItemsRequest) =>
        http.put<OrderDto>(`/orders/${id}/items/order`, body),
      send: (id: string, version?: number, idempotencyKey?: string) =>
        http.post<OrderDto>(
          `/orders/${id}/send`,
          { version },
          idempotencyKey ? { idempotencyKey } : {},
        ),
      requestBill: (id: string, version?: number) =>
        http.post<OrderDto>(`/orders/${id}/request-bill`, { version }),
      deliverTicket: (id: string, ticketId: string) =>
        http.post<OrderDto>(`/orders/${id}/tickets/${ticketId}/deliver`),
      undeliverTicket: (id: string, ticketId: string) =>
        http.post<OrderDto>(`/orders/${id}/tickets/${ticketId}/undeliver`),
      move: (id: string, body: MoveOrderRequest) => http.post<OrderDto>(`/orders/${id}/move`, body),
      setDiscount: (id: string, body: SetOrderDiscountRequest) =>
        http.put<OrderDto>(`/orders/${id}/discount`, body),
      split: (id: string, body: SplitOrderRequest) =>
        http.post<OrderDto>(`/orders/${id}/split`, body),
      duplicate: (id: string, body: DuplicateOrderRequest) =>
        http.post<OrderDto>(`/orders/${id}/duplicate`, body),
      cancel: (id: string, body: CancelRequest) =>
        http.post<OrderDto>(`/orders/${id}/cancel`, body),
      receipt: (id: string) => http.get<ReceiptDocument>(`/orders/${id}/receipt`),
      printReceipt: (id: string, printerId: string) =>
        http.post<undefined>(`/orders/${id}/receipt/print`, { printerId }),
      payments: (id: string) => http.get<PaymentDto[]>(`/orders/${id}/payments`),
      pay: (id: string, body: CreatePaymentRequest, idempotencyKey?: string) =>
        http.post<PaymentResultDto>(
          `/orders/${id}/payments`,
          body,
          idempotencyKey ? { idempotencyKey } : {},
        ),
      voidPayment: (paymentId: string, body: VoidPaymentRequest) =>
        http.post<PaymentResultDto>(`/payments/${paymentId}/void`, body),
    },
    kitchen: {
      tickets: (query: KitchenTicketQuery = {}) =>
        http.get<KitchenTicketDto[]>(`/kitchen/tickets${queryString(query)}`),
      setStatus: (id: string, status: KitchenTicketStatus) =>
        http.patch<KitchenTicketDto>(`/kitchen/tickets/${id}/status`, { status }),
      reprint: (id: string) => http.post<undefined>(`/kitchen/tickets/${id}/print`),
    },
    staffCalls: {
      list: () => http.get<StaffCallDto[]>('/staff-calls'),
      create: (body: CreateStaffCallRequest) => http.post<StaffCallDto>('/staff-calls', body),
      acknowledge: (id: string) => http.post<StaffCallDto>(`/staff-calls/${id}/acknowledge`),
      resolve: (id: string) => http.post<StaffCallDto>(`/staff-calls/${id}/resolve`),
      cancel: (id: string) => http.post<StaffCallDto>(`/staff-calls/${id}/cancel`),
    },
    cash: {
      current: () => http.get<CashSessionSummaryDto | null>('/cash-sessions/current'),
      sessions: (query: PageQuery = {}) =>
        http.get<Paginated<CashSessionDto>>(`/cash-sessions${queryString(query)}`),
      summary: (id: string) => http.get<CashSessionSummaryDto>(`/cash-sessions/${id}`),
      open: (body: OpenCashSessionRequest) =>
        http.post<CashSessionSummaryDto>('/cash-sessions/open', body),
      close: (id: string, body: CloseCashSessionRequest) =>
        http.post<CashSessionSummaryDto>(`/cash-sessions/${id}/close`, body),
      movements: (id: string) => http.get<CashMovementDto[]>(`/cash-sessions/${id}/movements`),
      addMovement: (body: CreateCashMovementRequest) =>
        http.post<CashMovementDto>('/cash-sessions/current/movements', body),
      expenses: (query: PageQuery & { from?: string; to?: string; cashSessionId?: string } = {}) =>
        http.get<Paginated<ExpenseDto>>(`/expenses${queryString(query)}`),
      createExpense: (body: CreateExpenseRequest) => http.post<ExpenseDto>('/expenses', body),
      removeExpense: (id: string) => http.delete(`/expenses/${id}`),
    },
    invoices: {
      issue: (orderId: string, body: IssueInvoiceRequest = {}) =>
        http.post<InvoiceDto>(`/orders/${orderId}/invoices`, body),
      list: (query: PageQuery & { orderId?: string; from?: string; to?: string } = {}) =>
        http.get<Paginated<InvoiceDto>>(`/invoices${queryString(query)}`),
      document: (id: string) => http.get<ReceiptDocument>(`/invoices/${id}/document`),
      print: (id: string, printerId: string, openDrawer = false) =>
        http.post<undefined>(`/invoices/${id}/print`, { printerId, openDrawer }),
      void: (id: string, reason: string) =>
        http.post<InvoiceDto>(`/invoices/${id}/void`, { reason }),
    },
    inventory: {
      ingredients: (
        query: { search?: string; lowStockOnly?: boolean; includeInactive?: boolean } = {},
      ) => http.get<IngredientDto[]>(`/ingredients${queryString(query)}`),
      createIngredient: (body: CreateIngredientRequest) =>
        http.post<IngredientDto>('/ingredients', body),
      updateIngredient: (id: string, body: UpdateIngredientRequest) =>
        http.patch<IngredientDto>(`/ingredients/${id}`, body),
      removeIngredient: (id: string) => http.delete(`/ingredients/${id}`),
      movements: (query: InventoryMovementQuery = {}) =>
        http.get<Paginated<InventoryMovementDto>>(`/inventory/movements${queryString(query)}`),
      createMovement: (body: CreateInventoryMovementRequest) =>
        http.post<IngredientDto>('/inventory/movements', body),
      alerts: () => http.get<LowStockAlert[]>('/inventory/alerts'),
      suppliers: (search?: string) =>
        http.get<SupplierDto[]>(`/suppliers${queryString({ search })}`),
      createSupplier: (body: CreateSupplierRequest) => http.post<SupplierDto>('/suppliers', body),
      updateSupplier: (id: string, body: UpdateSupplierRequest) =>
        http.patch<SupplierDto>(`/suppliers/${id}`, body),
      removeSupplier: (id: string) => http.delete(`/suppliers/${id}`),
      purchases: (query: PageQuery & { supplierId?: string } = {}) =>
        http.get<Paginated<PurchaseDto>>(`/purchases${queryString(query)}`),
      createPurchase: (body: CreatePurchaseRequest) => http.post<PurchaseDto>('/purchases', body),
      receivePurchase: (id: string) => http.post<PurchaseDto>(`/purchases/${id}/receive`),
      cancelPurchase: (id: string) => http.post<PurchaseDto>(`/purchases/${id}/cancel`),
    },
    customers: {
      list: (query: PageQuery = {}) =>
        http.get<Paginated<CustomerDto>>(`/customers${queryString(query)}`),
      get: (id: string) => http.get<CustomerDto>(`/customers/${id}`),
      history: (id: string) => http.get<CustomerHistoryEntry[]>(`/customers/${id}/history`),
      create: (body: CreateCustomerRequest) => http.post<CustomerDto>('/customers', body),
      update: (id: string, body: UpdateCustomerRequest) =>
        http.patch<CustomerDto>(`/customers/${id}`, body),
      remove: (id: string) => http.delete(`/customers/${id}`),
    },
    reports: {
      dashboard: (query: DateRangeQuery = {}) =>
        http.get<DashboardDto>(`/reports/dashboard${queryString(query)}`),
    },
  };
}

export type KarbonApi = ReturnType<typeof createApi>;
