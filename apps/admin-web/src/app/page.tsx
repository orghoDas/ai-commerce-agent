import {
  AlertTriangle,
  BarChart3,
  Bot,
  CalendarDays,
  CreditCard,
  Download,
  FileUp,
  MessageSquare,
  Package,
  Plus,
  RefreshCw,
  Save,
  Send,
  ShoppingCart,
  UserRoundCheck
} from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch, apiPost, getApiAuthToken, setApiAuthToken } from "../lib/api";

const DEMO_BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID ?? "cmq4w4tnf0000rt4rfr38t93b";

type OrderItem = {
  id: string;
  productName: string;
  variantTitle: string;
  sku: string;
  quantity: number;
  unitPriceCents: number;
  currency: string;
};

type AuthUser = {
  userId: string;
  businessId: string;
  email: string;
  name: string | null;
  role: "OWNER" | "ADMIN" | "AGENT" | "VIEWER";
};

type AuthSession = {
  user: AuthUser;
  business?: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    defaultCurrency: string;
  };
};

type LoginResponse = AuthSession & {
  token: string;
};

type LoginFormState = {
  email: string;
  password: string;
  businessSlug: string;
};

type BillingPlan = {
  id: "STARTER" | "GROWTH" | "SCALE";
  name: string;
  monthlyPriceCents: number;
  seats: number;
  conversationLimit: number;
  productLimit: number;
};

type BillingOverview = {
  subscription: {
    id: string;
    plan: BillingPlan["id"];
    status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED";
    seats: number;
    monthlyPriceCents: number;
    currency: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    trialEndsAt: string | null;
    cancelAtPeriodEnd: boolean;
    provider: string;
  };
  plans: BillingPlan[];
  usage: {
    activeProducts: number;
    conversations: number;
    orders: number;
    users: number;
  };
};

type Order = {
  id: string;
  orderNumber: string;
  status: "DRAFT" | "PENDING" | "CONFIRMED" | "FULFILLED" | "CANCELLED" | "NEEDS_HUMAN_REVIEW";
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  subtotalCents: number;
  currency: string;
  createdAt: string;
  items: OrderItem[];
};

type ConversationCustomer = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  defaultAddress: string | null;
};

type ConversationMessage = {
  id: string;
  role: "CUSTOMER" | "ASSISTANT" | "ADMIN" | "TOOL" | "SYSTEM";
  content: string;
  imageUrl: string | null;
  toolName: string | null;
  createdAt: string;
};

type Conversation = {
  id: string;
  channel: "WEB" | "WHATSAPP" | "INSTAGRAM" | "SMS" | "ADMIN_TEST";
  status: string;
  handoffToHuman: boolean;
  createdAt: string;
  updatedAt: string;
  customer: ConversationCustomer | null;
  messages: ConversationMessage[];
  orders: Order[];
  _count: {
    messages: number;
    orders: number;
  };
};

type ReportPeriod = "daily" | "weekly" | "monthly";

type ReportInventoryRow = {
  productName: string;
  variantTitle: string;
  sku: string;
  stockOnHand: number;
  reserved: number;
  available: number;
  reorderPoint: number;
  status: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
};

type ReportTopProduct = {
  productName: string;
  variantTitle: string;
  sku: string;
  quantity: number;
  grossSalesCents: number;
  currency: string;
};

type ReportUnavailableRequest = {
  id: string;
  rawQuery: string;
  normalizedName: string | null;
  requestedQty: number;
  imageUrl: string | null;
  createdAt: string;
};

type ReportResponse = {
  period: ReportPeriod;
  range: {
    startDate: string;
    endDate: string;
    label: string;
  };
  summary: {
    inventory: {
      activeProducts: number;
      activeVariants: number;
      inStockVariants: number;
      lowStockVariants: number;
      outOfStockVariants: number;
      stockOnHandUnits: number;
      reservedUnits: number;
      availableUnits: number;
    };
    orders: {
      total: number;
      pending: number;
      confirmed: number;
      fulfilled: number;
      cancelled: number;
      needsHumanReview: number;
      grossOrderValueCents: number;
      averageOrderValueCents: number;
    };
    demand: {
      unavailableRequests: number;
      noMatchSearches: number;
    };
    conversations: {
      opened: number;
      needsHuman: number;
    };
  };
  inventoryRows: ReportInventoryRow[];
  orders: Order[];
  topProducts: ReportTopProduct[];
  unavailableRequests: ReportUnavailableRequest[];
};

type ProductImportResult = {
  totalRows: number;
  processedRows: number;
  productsCreated: number;
  productsUpdated: number;
  variantsCreated: number;
  variantsUpdated: number;
  inventoryUpdated: number;
  skippedRows: number;
  errors: Array<{
    row: number;
    sku?: string;
    message: string;
  }>;
};

type ProductVariant = {
  id: string;
  sku: string;
  title: string;
  color: string | null;
  size: string | null;
  unitPriceCents: number;
  currency: string;
  isActive: boolean;
  inventory: {
    stockOnHand: number;
    reorderPoint: number;
  } | null;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  brand: string | null;
  category: string | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  tags: string[];
  searchKeywords: string[];
  variants: ProductVariant[];
};

type ProductFormState = {
  name: string;
  brand: string;
  category: string;
  tags: string;
  searchKeywords: string;
  sku: string;
  variantTitle: string;
  color: string;
  size: string;
  price: string;
  stockOnHand: string;
  reorderPoint: string;
};

type VariantFormState = {
  productId: string;
  sku: string;
  title: string;
  color: string;
  size: string;
  price: string;
  stockOnHand: string;
  reorderPoint: string;
};

type VariantEditState = {
  price: string;
  stockOnHand: string;
  reorderPoint: string;
  isActive: boolean;
};

const emptyProductForm: ProductFormState = {
  name: "",
  brand: "",
  category: "",
  tags: "",
  searchKeywords: "",
  sku: "",
  variantTitle: "Default",
  color: "",
  size: "",
  price: "",
  stockOnHand: "0",
  reorderPoint: "3"
};

const emptyVariantForm: VariantFormState = {
  productId: "",
  sku: "",
  title: "",
  color: "",
  size: "",
  price: "",
  stockOnHand: "0",
  reorderPoint: "3"
};

const REPORT_PERIODS: Array<{ label: string; value: ReportPeriod }> = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" }
];

const PRODUCT_IMPORT_TEMPLATE = [
  "name,sku,variantTitle,price,stockOnHand,reorderPoint,brand,category,tags,searchKeywords,color,size,currency,productStatus,variantActive",
  "Wireless Headphones,WH-1000XM5-BLK,Black,349.00,12,3,Sony,Audio,headphones|wireless,sony|black,Black,,USD,ACTIVE,true"
].join("\n");

const defaultLoginForm: LoginFormState = {
  email: "owner@demo-shop.local",
  password: "",
  businessSlug: "demo-shop"
};

export default function DashboardPage() {
  const [authToken, setAuthToken] = useState<string | null>(() => getApiAuthToken());
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [loginForm, setLoginForm] = useState<LoginFormState>(defaultLoginForm);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(Boolean(getApiAuthToken()));
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>("daily");
  const [reportDate, setReportDate] = useState(todayDateInput());
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [billing, setBilling] = useState<BillingOverview | null>(null);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingConversationDetail, setIsLoadingConversationDetail] = useState(false);
  const [isLoadingReport, setIsLoadingReport] = useState(true);
  const [isLoadingBilling, setIsLoadingBilling] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);
  const [savingConversationAction, setSavingConversationAction] = useState(false);
  const [adminReplyText, setAdminReplyText] = useState("");
  const [isSavingBilling, setIsSavingBilling] = useState(false);
  const [productForm, setProductForm] = useState<ProductFormState>(emptyProductForm);
  const [variantForm, setVariantForm] = useState<VariantFormState>(emptyVariantForm);
  const [variantEdits, setVariantEdits] = useState<Record<string, VariantEditState>>({});
  const [csvImportText, setCsvImportText] = useState("");
  const [csvImportResult, setCsvImportResult] = useState<ProductImportResult | null>(null);
  const [csvImportError, setCsvImportError] = useState<string | null>(null);
  const [isImportingProducts, setIsImportingProducts] = useState(false);
  const businessId = authSession?.user.businessId ?? DEMO_BUSINESS_ID;

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);
    try {
      const response = await apiPost<LoginResponse>("/v1/auth/login", {
        email: loginForm.email,
        password: loginForm.password,
        businessSlug: loginForm.businessSlug || undefined
      });
      setApiAuthToken(response.token);
      setAuthToken(response.token);
      setAuthSession({ user: response.user, business: response.business });
      setLoginForm((current) => ({ ...current, password: "" }));
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Could not log in");
    } finally {
      setIsLoggingIn(false);
    }
  }

  function logout() {
    setApiAuthToken(null);
    setAuthToken(null);
    setAuthSession(null);
    setOrders([]);
    setProducts([]);
    setConversations([]);
    setSelectedConversation(null);
    setReport(null);
    setBilling(null);
  }

  async function loadCurrentSession() {
    if (!authToken) {
      setIsCheckingAuth(false);
      return;
    }

    try {
      const response = await apiGet<AuthSession>("/v1/auth/me");
      setAuthSession(response);
    } catch {
      setApiAuthToken(null);
      setAuthToken(null);
      setAuthSession(null);
    } finally {
      setIsCheckingAuth(false);
    }
  }

  async function loadOrders() {
    setIsLoadingOrders(true);
    setOrdersError(null);
    try {
      const data = await apiGet<Order[]>(`/v1/admin/orders?businessId=${businessId}`);
      setOrders(data);
    } catch (error) {
      setOrdersError(error instanceof Error ? error.message : "Could not load orders");
    } finally {
      setIsLoadingOrders(false);
    }
  }

  async function loadProducts() {
    setIsLoadingProducts(true);
    setProductsError(null);
    try {
      const data = await apiGet<Product[]>(`/v1/admin/products?businessId=${businessId}`);
      setProducts(data);
      setVariantEdits(buildVariantEditState(data));
      setVariantForm((current) => ({
        ...current,
        productId: current.productId || data[0]?.id || ""
      }));
    } catch (error) {
      setProductsError(error instanceof Error ? error.message : "Could not load products");
    } finally {
      setIsLoadingProducts(false);
    }
  }

  async function loadConversationDetail(conversationId: string) {
    setIsLoadingConversationDetail(true);
    setConversationError(null);
    try {
      const data = await apiGet<Conversation>(`/v1/admin/conversations/${conversationId}?businessId=${businessId}`);
      setSelectedConversation(data);
      setSelectedConversationId(data.id);
    } catch (error) {
      setConversationError(error instanceof Error ? error.message : "Could not load conversation");
    } finally {
      setIsLoadingConversationDetail(false);
    }
  }

  async function loadConversations() {
    setIsLoadingConversations(true);
    setConversationError(null);
    try {
      const data = await apiGet<Conversation[]>(`/v1/admin/conversations?businessId=${businessId}`);
      setConversations(data);

      const nextSelectedId =
        selectedConversationId && data.some((conversation) => conversation.id === selectedConversationId)
          ? selectedConversationId
          : data[0]?.id ?? null;

      setSelectedConversationId(nextSelectedId);
      if (nextSelectedId) {
        await loadConversationDetail(nextSelectedId);
      } else {
        setSelectedConversation(null);
      }
    } catch (error) {
      setConversationError(error instanceof Error ? error.message : "Could not load conversations");
    } finally {
      setIsLoadingConversations(false);
    }
  }

  async function loadReport(period = reportPeriod, date = reportDate) {
    setIsLoadingReport(true);
    setReportError(null);
    try {
      const data = await apiGet<ReportResponse>(
        `/v1/admin/reports?businessId=${businessId}&period=${period}&date=${encodeURIComponent(date)}`
      );
      setReport(data);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Could not load report");
    } finally {
      setIsLoadingReport(false);
    }
  }

  async function loadBilling() {
    setIsLoadingBilling(true);
    setBillingError(null);
    try {
      const data = await apiGet<BillingOverview>(`/v1/admin/billing?businessId=${businessId}`);
      setBilling(data);
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Could not load billing");
    } finally {
      setIsLoadingBilling(false);
    }
  }

  async function refreshAll() {
    await Promise.all([loadOrders(), loadProducts(), loadConversations(), loadReport(), loadBilling()]);
  }

  useEffect(() => {
    void loadCurrentSession();
  }, []);

  useEffect(() => {
    if (authSession) {
      void refreshAll();
    }
  }, [authSession?.user.businessId]);

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveMessage(null);
    try {
      await apiPost<Product>("/v1/admin/products", {
        businessId: businessId,
        name: productForm.name,
        brand: productForm.brand,
        category: productForm.category,
        tags: productForm.tags,
        searchKeywords: productForm.searchKeywords,
        variant: {
          sku: productForm.sku,
          title: productForm.variantTitle,
          color: productForm.color,
          size: productForm.size,
          unitPriceCents: dollarsToCents(productForm.price),
          currency: "USD",
          stockOnHand: numberFromInput(productForm.stockOnHand),
          reorderPoint: numberFromInput(productForm.reorderPoint)
        }
      });
      setProductForm(emptyProductForm);
      setSaveMessage("Product created.");
      await loadProducts();
    } catch (error) {
      setProductsError(error instanceof Error ? error.message : "Could not create product");
    }
  }

  async function createVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!variantForm.productId) {
      setProductsError("Choose a product before adding a variant.");
      return;
    }

    setSaveMessage(null);
    try {
      await apiPost<ProductVariant>(`/v1/admin/products/${variantForm.productId}/variants`, {
        businessId: businessId,
        sku: variantForm.sku,
        title: variantForm.title,
        color: variantForm.color,
        size: variantForm.size,
        unitPriceCents: dollarsToCents(variantForm.price),
        currency: "USD",
        stockOnHand: numberFromInput(variantForm.stockOnHand),
        reorderPoint: numberFromInput(variantForm.reorderPoint)
      });
      setVariantForm({ ...emptyVariantForm, productId: variantForm.productId });
      setSaveMessage("Variant added.");
      await loadProducts();
    } catch (error) {
      setProductsError(error instanceof Error ? error.message : "Could not add variant");
    }
  }

  async function importProductsCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCsvImportError(null);
    setCsvImportResult(null);

    if (!csvImportText.trim()) {
      setCsvImportError("Choose a CSV file or paste CSV rows before importing.");
      return;
    }

    setIsImportingProducts(true);
    try {
      const result = await apiPost<ProductImportResult>("/v1/admin/products/import-csv", {
        businessId: businessId,
        csvText: csvImportText
      });
      setCsvImportResult(result);
      setSaveMessage(`CSV import processed ${result.processedRows} rows.`);
      await Promise.all([loadProducts(), loadReport()]);
    } catch (error) {
      setCsvImportError(error instanceof Error ? error.message : "Could not import CSV");
    } finally {
      setIsImportingProducts(false);
    }
  }

  async function readCsvFile(event: ChangeEvent<HTMLInputElement>) {
    setCsvImportError(null);
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      setCsvImportText(await file.text());
    } catch (error) {
      setCsvImportError(error instanceof Error ? error.message : "Could not read CSV file");
    }
  }

  async function saveVariant(productId: string, variant: ProductVariant) {
    const edit = variantEdits[variant.id];
    if (!edit) {
      return;
    }

    setSaveMessage(null);
    try {
      await apiPatch<ProductVariant>(`/v1/admin/products/${productId}/variants/${variant.id}`, {
        businessId: businessId,
        unitPriceCents: dollarsToCents(edit.price),
        stockOnHand: numberFromInput(edit.stockOnHand),
        reorderPoint: numberFromInput(edit.reorderPoint),
        isActive: edit.isActive
      });
      setSaveMessage(`${variant.sku} saved.`);
      await loadProducts();
    } catch (error) {
      setProductsError(error instanceof Error ? error.message : "Could not save variant");
    }
  }

  async function setProductStatus(product: Product, status: Product["status"]) {
    setSaveMessage(null);
    try {
      await apiPatch<Product>(`/v1/admin/products/${product.id}`, {
        businessId: businessId,
        status
      });
      setSaveMessage(`${product.name} set to ${formatStatus(status)}.`);
      await loadProducts();
    } catch (error) {
      setProductsError(error instanceof Error ? error.message : "Could not update product");
    }
  }

  async function setOrderStatus(order: Order, status: Order["status"]) {
    setOrdersError(null);
    setSavingOrderId(order.id);
    try {
      await apiPatch<Order>(`/v1/admin/orders/${order.id}/status`, {
        businessId: businessId,
        status
      });
      setSaveMessage(`${order.orderNumber} set to ${formatStatus(status)}.`);
      await Promise.all([loadOrders(), loadProducts()]);
    } catch (error) {
      setOrdersError(error instanceof Error ? error.message : "Could not update order");
    } finally {
      setSavingOrderId(null);
    }
  }

  async function selectConversation(conversationId: string) {
    setSelectedConversationId(conversationId);
    setSelectedConversation(null);
    await loadConversationDetail(conversationId);
  }

  async function setHumanTakeover(conversation: Conversation, enabled: boolean) {
    setConversationError(null);
    setSavingConversationAction(true);
    try {
      await apiPost<Conversation>(`/v1/admin/conversations/${conversation.id}/handoff`, {
        businessId,
        enabled,
        reason: enabled ? "Admin took over from dashboard." : "Admin released conversation to agent."
      });
      setSaveMessage(enabled ? "Conversation moved to human takeover." : "Conversation released to agent.");
      await Promise.all([loadConversations(), loadConversationDetail(conversation.id)]);
    } catch (error) {
      setConversationError(error instanceof Error ? error.message : "Could not update takeover");
    } finally {
      setSavingConversationAction(false);
    }
  }

  async function sendAdminReply(conversation: Conversation) {
    if (!adminReplyText.trim()) {
      setConversationError("Write a reply before sending.");
      return;
    }

    setConversationError(null);
    setSavingConversationAction(true);
    try {
      await apiPost<ConversationMessage>(`/v1/admin/conversations/${conversation.id}/messages`, {
        businessId,
        content: adminReplyText.trim()
      });
      setAdminReplyText("");
      setSaveMessage("Admin reply added to conversation.");
      await Promise.all([loadConversations(), loadConversationDetail(conversation.id)]);
    } catch (error) {
      setConversationError(error instanceof Error ? error.message : "Could not send admin reply");
    } finally {
      setSavingConversationAction(false);
    }
  }

  async function closeConversation(conversation: Conversation) {
    setConversationError(null);
    setSavingConversationAction(true);
    try {
      await apiPatch<Conversation>(`/v1/admin/conversations/${conversation.id}/status`, {
        businessId,
        status: "CLOSED"
      });
      setSaveMessage("Conversation closed.");
      await Promise.all([loadConversations(), loadConversationDetail(conversation.id)]);
    } catch (error) {
      setConversationError(error instanceof Error ? error.message : "Could not close conversation");
    } finally {
      setSavingConversationAction(false);
    }
  }

  async function changeReportPeriod(period: ReportPeriod) {
    setReportPeriod(period);
    await loadReport(period, reportDate);
  }

  async function changeReportDate(date: string) {
    setReportDate(date);
    await loadReport(reportPeriod, date);
  }

  async function updateSubscription(patch: Partial<{ plan: BillingPlan["id"]; status: BillingOverview["subscription"]["status"]; cancelAtPeriodEnd: boolean }>) {
    setBillingError(null);
    setIsSavingBilling(true);
    try {
      const data = await apiPatch<BillingOverview>("/v1/admin/billing/subscription", {
        businessId,
        ...patch
      });
      setBilling(data);
      setSaveMessage("Billing subscription updated.");
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Could not update subscription");
    } finally {
      setIsSavingBilling(false);
    }
  }

  const pendingOrders = useMemo(() => orders.filter((order) => order.status === "PENDING"), [orders]);
  const confirmedOrders = useMemo(() => orders.filter((order) => order.status === "CONFIRMED"), [orders]);
  const actionOrders = useMemo(
    () => orders.filter((order) => ["PENDING", "CONFIRMED", "NEEDS_HUMAN_REVIEW"].includes(order.status)),
    [orders]
  );
  const inventorySummary = useMemo(() => summarizeInventory(products), [products]);
  const activeConversation = useMemo(
    () =>
      selectedConversation?.id === selectedConversationId
        ? selectedConversation
        : conversations.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversations, selectedConversation, selectedConversationId]
  );
  const openConversations = useMemo(
    () => conversations.filter((conversation) => conversation.status === "OPEN" || conversation.handoffToHuman).length,
    [conversations]
  );
  const humanQueue = useMemo(
    () => conversations.filter((conversation) => conversation.handoffToHuman || conversation.status === "NEEDS_HUMAN").length,
    [conversations]
  );
  const metrics = useMemo(
    () => [
      { label: "Active Products", value: String(products.filter((product) => product.status === "ACTIVE").length) },
      { label: "Open Conversations", value: String(openConversations) },
      { label: "Pending Orders", value: String(pendingOrders.length) },
      { label: "Confirmed Orders", value: String(confirmedOrders.length) },
      { label: "Out Of Stock", value: String(inventorySummary.outOfStock) }
    ],
    [confirmedOrders, inventorySummary, openConversations, pendingOrders, products]
  );

  if (isCheckingAuth) {
    return (
      <div className="authShell">
        <div className="authPanel">
          <h1>AI Commerce Agent</h1>
          <p>Checking your session.</p>
        </div>
      </div>
    );
  }

  if (!authSession) {
    return (
      <div className="authShell">
        <form className="authPanel" onSubmit={(event) => void login(event)}>
          <h1>AI Commerce Agent</h1>
          <label>
            Email
            <input
              type="email"
              value={loginForm.email}
              onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={loginForm.password}
              onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
              required
            />
          </label>
          <label>
            Business Slug
            <input value={loginForm.businessSlug} onChange={(event) => setLoginForm({ ...loginForm, businessSlug: event.target.value })} />
          </label>
          {loginError ? <div className="empty dangerText compactEmpty">{loginError}</div> : null}
          <button className="button" type="submit" disabled={isLoggingIn}>
            {isLoggingIn ? "Signing In" : "Sign In"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">AI Commerce Agent</div>
        <nav className="nav" aria-label="Admin navigation">
          <a href="#">Dashboard</a>
          <a href="#">Products</a>
          <a href="#">Inventory</a>
          <a href="#">Orders</a>
          <a href="#">Conversations</a>
          <a href="#">Reports</a>
          <a href="#">Billing</a>
          <a href="#">Settings</a>
        </nav>
      </aside>

      <main className="main">
        <section className="topbar">
          <div>
            <h1>Operations Dashboard</h1>
            <p>Manage catalog, stock, and pending orders for the deterministic sales assistant.</p>
          </div>
          <div className="topbarActions">
            <span className="sessionBadge">
              {authSession.user.name ?? authSession.user.email}
              <span>{formatStatus(authSession.user.role)}</span>
            </span>
            <button
              className="button"
              onClick={() => void refreshAll()}
              disabled={isLoadingOrders || isLoadingProducts || isLoadingConversations || isLoadingReport || isLoadingBilling}
            >
              <RefreshCw size={18} aria-hidden="true" />
              Refresh
            </button>
            <button className="button secondary" onClick={logout} type="button">
              Sign Out
            </button>
          </div>
        </section>

        <section className="metrics" aria-label="Business metrics">
          {metrics.map((metric) => (
            <div className="metric" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          ))}
        </section>

        <section className="panel">
          <header className="reportHeader">
            <div>
              <h2>
                <BarChart3 size={18} aria-hidden="true" /> Reports
              </h2>
              <span className="subtle">{report ? report.range.label : "Daily, weekly, and monthly operations"}</span>
            </div>

            <div className="reportControls">
              <div className="segmented" aria-label="Report period">
                {REPORT_PERIODS.map((period) => (
                  <button
                    className={reportPeriod === period.value ? "active" : ""}
                    type="button"
                    key={period.value}
                    onClick={() => void changeReportPeriod(period.value)}
                  >
                    {period.label}
                  </button>
                ))}
              </div>
              <label className="dateControl">
                <CalendarDays size={16} aria-hidden="true" />
                <input type="date" value={reportDate} onChange={(event) => void changeReportDate(event.target.value)} />
              </label>
            </div>
          </header>

          {reportError ? <div className="empty dangerText">{reportError}</div> : null}

          {report ? (
            <div className="reportBody">
              <div className="reportStatGrid">
                <div className="reportStat">
                  <span>Gross Value</span>
                  <strong>{formatMoney(report.summary.orders.grossOrderValueCents, reportCurrency(report))}</strong>
                </div>
                <div className="reportStat">
                  <span>Total Orders</span>
                  <strong>{report.summary.orders.total}</strong>
                </div>
                <div className="reportStat">
                  <span>Average Order</span>
                  <strong>{formatMoney(report.summary.orders.averageOrderValueCents, reportCurrency(report))}</strong>
                </div>
                <div className="reportStat">
                  <span>Unavailable Requests</span>
                  <strong>{report.summary.demand.unavailableRequests}</strong>
                </div>
                <div className="reportStat">
                  <span>Opened Conversations</span>
                  <strong>{report.summary.conversations.opened}</strong>
                </div>
              </div>

              <div className="reportGrid">
                <div className="reportBlock">
                  <h3>Order Status</h3>
                  <div className="statusBreakdown">
                    <span>
                      Pending <strong>{report.summary.orders.pending}</strong>
                    </span>
                    <span>
                      Confirmed <strong>{report.summary.orders.confirmed}</strong>
                    </span>
                    <span>
                      Fulfilled <strong>{report.summary.orders.fulfilled}</strong>
                    </span>
                    <span>
                      Cancelled <strong>{report.summary.orders.cancelled}</strong>
                    </span>
                    <span>
                      Review <strong>{report.summary.orders.needsHumanReview}</strong>
                    </span>
                  </div>
                </div>

                <div className="reportBlock">
                  <h3>Inventory Health</h3>
                  <div className="statusBreakdown">
                    <span>
                      Active Products <strong>{report.summary.inventory.activeProducts}</strong>
                    </span>
                    <span>
                      Active Variants <strong>{report.summary.inventory.activeVariants}</strong>
                    </span>
                    <span>
                      Available Units <strong>{report.summary.inventory.availableUnits}</strong>
                    </span>
                    <span>
                      Reserved Units <strong>{report.summary.inventory.reservedUnits}</strong>
                    </span>
                    <span>
                      Low Stock <strong>{report.summary.inventory.lowStockVariants}</strong>
                    </span>
                    <span>
                      Out Of Stock <strong>{report.summary.inventory.outOfStockVariants}</strong>
                    </span>
                  </div>
                </div>
              </div>

              <div className="reportGrid">
                <div className="reportBlock">
                  <h3>Top Products</h3>
                  {report.topProducts.length > 0 ? (
                    <div className="tableWrap compactTable">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th>Qty</th>
                            <th>Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.topProducts.map((product) => (
                            <tr key={product.sku}>
                              <td>
                                <strong>{product.productName}</strong>
                                <span className="cellNote">
                                  {product.variantTitle} / {product.sku}
                                </span>
                              </td>
                              <td>{product.quantity}</td>
                              <td>{formatMoney(product.grossSalesCents, product.currency)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="empty compactEmpty">No product sales in this period.</div>
                  )}
                </div>

                <div className="reportBlock">
                  <h3>Stock Risk</h3>
                  {report.inventoryRows.filter((row) => row.status !== "IN_STOCK").length > 0 ? (
                    <div className="tableWrap compactTable">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>SKU</th>
                            <th>Available</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.inventoryRows
                            .filter((row) => row.status !== "IN_STOCK")
                            .slice(0, 8)
                            .map((row) => (
                              <tr key={row.sku}>
                                <td>
                                  <strong>{row.productName}</strong>
                                  <span className="cellNote">
                                    {row.variantTitle} / {row.sku}
                                  </span>
                                </td>
                                <td>{row.available}</td>
                                <td>
                                  <span className={`status ${row.status === "OUT_OF_STOCK" ? "danger" : "warning"}`}>{formatStatus(row.status)}</span>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="empty compactEmpty">No stock risks right now.</div>
                  )}
                </div>
              </div>

              <div className="reportBlock">
                <h3>Unavailable Demand</h3>
                {report.unavailableRequests.length > 0 ? (
                  <div className="tableWrap compactTable">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Request</th>
                          <th>Qty</th>
                          <th>When</th>
                          <th>Image</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.unavailableRequests.map((request) => (
                          <tr key={request.id}>
                            <td>
                              <strong>{request.normalizedName ?? request.rawQuery}</strong>
                              <span className="cellNote">{request.rawQuery}</span>
                            </td>
                            <td>{request.requestedQty}</td>
                            <td>{formatDateTime(request.createdAt)}</td>
                            <td>
                              {request.imageUrl ? (
                                <a href={request.imageUrl} target="_blank" rel="noreferrer">
                                  Open
                                </a>
                              ) : (
                                "No image"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty compactEmpty">No unavailable product requests in this period.</div>
                )}
              </div>
            </div>
          ) : !isLoadingReport ? (
            <div className="empty">No report available.</div>
          ) : (
            <div className="empty">Loading report.</div>
          )}
        </section>

        <section className="panel">
          <header className="reportHeader">
            <div>
              <h2>
                <CreditCard size={18} aria-hidden="true" /> Billing
              </h2>
              <span className="subtle">{billing ? `${formatStatus(billing.subscription.plan)} / ${formatStatus(billing.subscription.status)}` : "Loading"}</span>
            </div>
            {billing ? (
              <div className="rowActions">
                <button
                  className="iconTextButton"
                  type="button"
                  disabled={isSavingBilling}
                  onClick={() => void updateSubscription({ status: billing.subscription.status === "ACTIVE" ? "TRIALING" : "ACTIVE" })}
                >
                  {billing.subscription.status === "ACTIVE" ? "Set Trial" : "Activate"}
                </button>
                <button
                  className="iconTextButton dangerButton"
                  type="button"
                  disabled={isSavingBilling}
                  onClick={() => void updateSubscription({ cancelAtPeriodEnd: !billing.subscription.cancelAtPeriodEnd })}
                >
                  {billing.subscription.cancelAtPeriodEnd ? "Keep Renewal" : "Cancel Renewal"}
                </button>
              </div>
            ) : null}
          </header>

          {billingError ? <div className="empty dangerText">{billingError}</div> : null}

          {billing ? (
            <div className="billingBody">
              <div className="billingSummary">
                <div>
                  <span>Current Plan</span>
                  <strong>{formatStatus(billing.subscription.plan)}</strong>
                </div>
                <div>
                  <span>Monthly Price</span>
                  <strong>{formatMoney(billing.subscription.monthlyPriceCents, billing.subscription.currency)}</strong>
                </div>
                <div>
                  <span>Period Ends</span>
                  <strong>{formatDate(billing.subscription.currentPeriodEnd)}</strong>
                </div>
                <div>
                  <span>Renewal</span>
                  <strong>{billing.subscription.cancelAtPeriodEnd ? "Cancelling" : "Enabled"}</strong>
                </div>
              </div>

              <div className="billingUsage">
                <span>
                  Users <strong>{billing.usage.users}</strong>
                </span>
                <span>
                  Active Products <strong>{billing.usage.activeProducts}</strong>
                </span>
                <span>
                  Conversations <strong>{billing.usage.conversations}</strong>
                </span>
                <span>
                  Orders <strong>{billing.usage.orders}</strong>
                </span>
              </div>

              <div className="planGrid">
                {billing.plans.map((plan) => (
                  <div className={`planCard ${plan.id === billing.subscription.plan ? "active" : ""}`} key={plan.id}>
                    <div>
                      <h3>{plan.name}</h3>
                      <strong>{formatMoney(plan.monthlyPriceCents, billing.subscription.currency)}</strong>
                    </div>
                    <span>{plan.seats} seats</span>
                    <span>{plan.conversationLimit.toLocaleString()} conversations</span>
                    <span>{plan.productLimit.toLocaleString()} products</span>
                    <button
                      className={plan.id === billing.subscription.plan ? "button secondary" : "button"}
                      type="button"
                      disabled={isSavingBilling || plan.id === billing.subscription.plan}
                      onClick={() => void updateSubscription({ plan: plan.id })}
                    >
                      {plan.id === billing.subscription.plan ? "Current" : "Select"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : !isLoadingBilling ? (
            <div className="empty">No subscription found.</div>
          ) : (
            <div className="empty">Loading billing.</div>
          )}
        </section>

        <section className="panel">
          <header>
            <h2>
              <Package size={18} aria-hidden="true" /> Product And Inventory
            </h2>
            <span className="subtle">{isLoadingProducts ? "Loading" : `${products.length} products`}</span>
          </header>

          {productsError ? <div className="empty dangerText">{productsError}</div> : null}
          {saveMessage ? <div className="notice">{saveMessage}</div> : null}

          <form className="importBand" onSubmit={(event) => void importProductsCsv(event)}>
            <div className="importHeader">
              <h3>
                <FileUp size={18} aria-hidden="true" /> CSV Product Import
              </h3>
              <a
                className="iconTextButton"
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(PRODUCT_IMPORT_TEMPLATE)}`}
                download="product-import-template.csv"
              >
                <Download size={16} aria-hidden="true" />
                Template
              </a>
            </div>

            <div className="importControls">
              <label className="fileControl">
                <FileUp size={16} aria-hidden="true" />
                <input type="file" accept=".csv,text/csv" onChange={(event) => void readCsvFile(event)} />
              </label>
              <button className="iconTextButton" type="button" onClick={() => setCsvImportText(PRODUCT_IMPORT_TEMPLATE)}>
                Use Sample
              </button>
              <button className="button" type="submit" disabled={isImportingProducts}>
                <FileUp size={18} aria-hidden="true" />
                Import CSV
              </button>
            </div>

            <textarea
              className="csvTextarea"
              value={csvImportText}
              onChange={(event) => setCsvImportText(event.target.value)}
              placeholder={PRODUCT_IMPORT_TEMPLATE}
              rows={5}
            />

            {csvImportError ? <div className="empty dangerText compactEmpty">{csvImportError}</div> : null}

            {csvImportResult ? (
              <div className="importSummary">
                <span>
                  Rows <strong>{csvImportResult.totalRows}</strong>
                </span>
                <span>
                  Imported <strong>{csvImportResult.processedRows}</strong>
                </span>
                <span>
                  Products Created <strong>{csvImportResult.productsCreated}</strong>
                </span>
                <span>
                  Variants Created <strong>{csvImportResult.variantsCreated}</strong>
                </span>
                <span>
                  Variants Updated <strong>{csvImportResult.variantsUpdated}</strong>
                </span>
                <span>
                  Skipped <strong>{csvImportResult.skippedRows}</strong>
                </span>
              </div>
            ) : null}

            {csvImportResult?.errors.length ? (
              <div className="tableWrap compactTable importErrors">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>SKU</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvImportResult.errors.map((error) => (
                      <tr key={`${error.row}-${error.message}`}>
                        <td>{error.row}</td>
                        <td>{error.sku ?? "No SKU"}</td>
                        <td>{error.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </form>

          <div className="formBand">
            <form className="formGrid" onSubmit={(event) => void createProduct(event)}>
              <h3>Add Product</h3>
              <label>
                Name
                <input value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} required />
              </label>
              <label>
                Brand
                <input value={productForm.brand} onChange={(event) => setProductForm({ ...productForm, brand: event.target.value })} />
              </label>
              <label>
                Category
                <input value={productForm.category} onChange={(event) => setProductForm({ ...productForm, category: event.target.value })} />
              </label>
              <label>
                Tags
                <input value={productForm.tags} onChange={(event) => setProductForm({ ...productForm, tags: event.target.value })} />
              </label>
              <label>
                Search Keywords
                <input
                  value={productForm.searchKeywords}
                  onChange={(event) => setProductForm({ ...productForm, searchKeywords: event.target.value })}
                />
              </label>
              <label>
                SKU
                <input value={productForm.sku} onChange={(event) => setProductForm({ ...productForm, sku: event.target.value })} required />
              </label>
              <label>
                Variant
                <input
                  value={productForm.variantTitle}
                  onChange={(event) => setProductForm({ ...productForm, variantTitle: event.target.value })}
                  required
                />
              </label>
              <label>
                Color
                <input value={productForm.color} onChange={(event) => setProductForm({ ...productForm, color: event.target.value })} />
              </label>
              <label>
                Size
                <input value={productForm.size} onChange={(event) => setProductForm({ ...productForm, size: event.target.value })} />
              </label>
              <label>
                Price
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={productForm.price}
                  onChange={(event) => setProductForm({ ...productForm, price: event.target.value })}
                  required
                />
              </label>
              <label>
                Stock
                <input
                  type="number"
                  min="0"
                  value={productForm.stockOnHand}
                  onChange={(event) => setProductForm({ ...productForm, stockOnHand: event.target.value })}
                  required
                />
              </label>
              <label>
                Reorder
                <input
                  type="number"
                  min="0"
                  value={productForm.reorderPoint}
                  onChange={(event) => setProductForm({ ...productForm, reorderPoint: event.target.value })}
                  required
                />
              </label>
              <button className="button" type="submit">
                <Plus size={18} aria-hidden="true" />
                Add Product
              </button>
            </form>

            <form className="formGrid compactForm" onSubmit={(event) => void createVariant(event)}>
              <h3>Add Variant</h3>
              <label>
                Product
                <select value={variantForm.productId} onChange={(event) => setVariantForm({ ...variantForm, productId: event.target.value })}>
                  {products.map((product) => (
                    <option value={product.id} key={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                SKU
                <input value={variantForm.sku} onChange={(event) => setVariantForm({ ...variantForm, sku: event.target.value })} required />
              </label>
              <label>
                Variant
                <input value={variantForm.title} onChange={(event) => setVariantForm({ ...variantForm, title: event.target.value })} required />
              </label>
              <label>
                Color
                <input value={variantForm.color} onChange={(event) => setVariantForm({ ...variantForm, color: event.target.value })} />
              </label>
              <label>
                Size
                <input value={variantForm.size} onChange={(event) => setVariantForm({ ...variantForm, size: event.target.value })} />
              </label>
              <label>
                Price
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={variantForm.price}
                  onChange={(event) => setVariantForm({ ...variantForm, price: event.target.value })}
                  required
                />
              </label>
              <label>
                Stock
                <input
                  type="number"
                  min="0"
                  value={variantForm.stockOnHand}
                  onChange={(event) => setVariantForm({ ...variantForm, stockOnHand: event.target.value })}
                  required
                />
              </label>
              <label>
                Reorder
                <input
                  type="number"
                  min="0"
                  value={variantForm.reorderPoint}
                  onChange={(event) => setVariantForm({ ...variantForm, reorderPoint: event.target.value })}
                  required
                />
              </label>
              <button className="button secondary" type="submit">
                <Plus size={18} aria-hidden="true" />
                Add Variant
              </button>
            </form>
          </div>

          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Variant</th>
                  <th>SKU</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Reorder</th>
                  <th>Variant Status</th>
                  <th>Product Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.flatMap((product) =>
                  product.variants.map((variant) => {
                    const edit = variantEdits[variant.id] ?? toVariantEdit(variant);
                    return (
                      <tr key={variant.id}>
                        <td>
                          <strong>{product.name}</strong>
                          <span className="cellNote">{[product.brand, product.category].filter(Boolean).join(" / ") || "No category"}</span>
                        </td>
                        <td>{variant.title}</td>
                        <td>{variant.sku}</td>
                        <td>
                          <input
                            className="tableInput"
                            type="number"
                            min="0"
                            step="0.01"
                            value={edit.price}
                            onChange={(event) => updateVariantEdit(variant.id, { price: event.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            className="tableInput"
                            type="number"
                            min="0"
                            value={edit.stockOnHand}
                            onChange={(event) => updateVariantEdit(variant.id, { stockOnHand: event.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            className="tableInput"
                            type="number"
                            min="0"
                            value={edit.reorderPoint}
                            onChange={(event) => updateVariantEdit(variant.id, { reorderPoint: event.target.value })}
                          />
                        </td>
                        <td>
                          <label className="toggleLabel">
                            <input
                              type="checkbox"
                              checked={edit.isActive}
                              onChange={(event) => updateVariantEdit(variant.id, { isActive: event.target.checked })}
                            />
                            {edit.isActive ? "Active" : "Inactive"}
                          </label>
                        </td>
                        <td>
                          <span className={`status ${product.status === "ACTIVE" ? "" : "danger"}`}>{formatStatus(product.status)}</span>
                        </td>
                        <td>
                          <div className="rowActions">
                            <button className="iconTextButton" onClick={() => void saveVariant(product.id, variant)} type="button">
                              <Save size={16} aria-hidden="true" />
                              Save
                            </button>
                            {product.status === "ACTIVE" ? (
                              <button className="iconTextButton dangerButton" onClick={() => void setProductStatus(product, "ARCHIVED")} type="button">
                                Archive
                              </button>
                            ) : (
                              <button className="iconTextButton" onClick={() => void setProductStatus(product, "ACTIVE")} type="button">
                                Activate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <header>
            <h2>
              <ShoppingCart size={18} aria-hidden="true" /> Order Queue
            </h2>
            <span className="subtle">{isLoadingOrders ? "Loading" : `${actionOrders.length} active`}</span>
          </header>

          {ordersError ? <div className="empty dangerText">{ordersError}</div> : null}

          {!ordersError && actionOrders.length === 0 && !isLoadingOrders ? (
            <div className="empty">No orders need action right now.</div>
          ) : null}

          {actionOrders.length > 0 ? (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Items</th>
                    <th>Address</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {actionOrders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <strong>{order.orderNumber}</strong>
                        <span className="cellNote">{formatDateTime(order.createdAt)}</span>
                      </td>
                      <td>
                        {order.customerName ?? "Unknown"}
                        <span className="cellNote">{order.customerPhone ?? "No phone"}</span>
                      </td>
                      <td>
                        <div className="orderItems">
                          {order.items.map((item) => (
                            <span key={item.id}>
                              {item.quantity} x {item.productName} - {item.variantTitle}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>{order.deliveryAddress ?? "No address"}</td>
                      <td>{formatMoney(order.subtotalCents, order.currency)}</td>
                      <td>
                        <span className={`status ${order.status === "CONFIRMED" ? "" : "warning"}`}>{formatStatus(order.status)}</span>
                      </td>
                      <td>
                        <div className="rowActions">
                          {canConfirm(order) ? (
                            <button
                              className="iconTextButton"
                              type="button"
                              disabled={savingOrderId === order.id}
                              onClick={() => void setOrderStatus(order, "CONFIRMED")}
                            >
                              Confirm
                            </button>
                          ) : null}
                          {canFulfill(order) ? (
                            <button
                              className="iconTextButton"
                              type="button"
                              disabled={savingOrderId === order.id}
                              onClick={() => void setOrderStatus(order, "FULFILLED")}
                            >
                              Fulfill
                            </button>
                          ) : null}
                          {canCancel(order) ? (
                            <button
                              className="iconTextButton dangerButton"
                              type="button"
                              disabled={savingOrderId === order.id}
                              onClick={() => void setOrderStatus(order, "CANCELLED")}
                            >
                              Cancel
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section className="panel">
          <header>
            <h2>
              <MessageSquare size={18} aria-hidden="true" /> Conversation Viewer
            </h2>
            <span className="subtle">{isLoadingConversations ? "Loading" : `${conversations.length} recent`}</span>
          </header>

          {conversationError ? <div className="empty dangerText">{conversationError}</div> : null}

          {!conversationError && conversations.length === 0 && !isLoadingConversations ? (
            <div className="empty">No conversations yet.</div>
          ) : null}

          {conversations.length > 0 ? (
            <div className="conversationShell">
              <div className="conversationList" aria-label="Recent conversations">
                {conversations.map((conversation) => {
                  const latestMessage = latestConversationMessage(conversation);
                  return (
                    <button
                      className={`conversationButton ${conversation.id === selectedConversationId ? "active" : ""}`}
                      type="button"
                      key={conversation.id}
                      onClick={() => void selectConversation(conversation.id)}
                    >
                      <span className="conversationTopLine">
                        <strong>{conversationCustomerName(conversation)}</strong>
                        <span>{formatDateTime(conversation.updatedAt)}</span>
                      </span>
                      <span className="conversationSnippet">{latestMessage?.content ?? "No visible messages yet."}</span>
                      <span className="conversationMeta">
                        <span className={`status ${conversation.handoffToHuman ? "warning" : ""}`}>
                          {conversation.handoffToHuman ? "Needs Human" : formatStatus(conversation.status)}
                        </span>
                        <span>{conversation._count.messages} messages</span>
                        {conversation._count.orders > 0 ? <span>{conversation._count.orders} orders</span> : null}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="conversationDetail">
                {activeConversation ? (
                  <>
                    <div className="conversationHeaderBlock">
                      <div>
                        <h3>{conversationCustomerName(activeConversation)}</h3>
                        <div className="conversationContact">
                          <span>{conversationCustomerPhone(activeConversation)}</span>
                          <span>{formatStatus(activeConversation.channel)}</span>
                          <span>{formatStatus(activeConversation.status)}</span>
                        </div>
                      </div>

                      <div className="conversationHeaderActions">
                        {activeConversation.orders.length > 0 ? (
                          <div className="linkedOrders" aria-label="Linked orders">
                            {activeConversation.orders.map((order) => (
                              <span key={order.id}>
                                {order.orderNumber} - {formatStatus(order.status)} - {formatMoney(order.subtotalCents, order.currency)}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <div className="rowActions">
                          <button
                            className="iconTextButton"
                            type="button"
                            disabled={savingConversationAction}
                            onClick={() => void setHumanTakeover(activeConversation, !activeConversation.handoffToHuman)}
                          >
                            {activeConversation.handoffToHuman ? "Release" : "Take Over"}
                          </button>
                          <button
                            className="iconTextButton dangerButton"
                            type="button"
                            disabled={savingConversationAction || activeConversation.status === "CLOSED"}
                            onClick={() => void closeConversation(activeConversation)}
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </div>

                    <form
                      className="adminReplyBox"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void sendAdminReply(activeConversation);
                      }}
                    >
                      <textarea
                        value={adminReplyText}
                        onChange={(event) => setAdminReplyText(event.target.value)}
                        placeholder="Write an admin reply"
                        rows={3}
                      />
                      <button className="button" type="submit" disabled={savingConversationAction}>
                        <Send size={18} aria-hidden="true" />
                        Send
                      </button>
                    </form>

                    <div className="transcript" aria-live="polite">
                      {isLoadingConversationDetail && !selectedConversation ? <div className="empty">Loading transcript.</div> : null}

                      {!isLoadingConversationDetail && activeConversation.messages.length === 0 ? (
                        <div className="empty">No visible transcript yet.</div>
                      ) : null}

                      {activeConversation.messages.map((message) => (
                        <div className={`messageRow ${message.role.toLowerCase()}`} key={message.id}>
                          <div className="messageBubble">
                            <div className="messageMeta">
                              <span>{formatStatus(message.role)}</span>
                              <span>{formatDateTime(message.createdAt)}</span>
                            </div>
                            {message.imageUrl ? (
                              <a href={message.imageUrl} target="_blank" rel="noreferrer">
                                Image attachment
                              </a>
                            ) : null}
                            <p>{message.content}</p>
                            {message.toolName ? <span className="cellNote">{message.toolName}</span> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="empty">Select a conversation.</div>
                )}
              </div>
            </div>
          ) : null}
        </section>

        <section className="grid">
          <div className="panel">
            <header>
              <h2>
                <Bot size={18} aria-hidden="true" /> Agent Controls
              </h2>
            </header>
            <table className="table">
              <tbody>
                <tr>
                  <td>
                    <UserRoundCheck size={18} aria-hidden="true" /> Human takeover queue
                  </td>
                  <td>{humanQueue}</td>
                </tr>
                <tr>
                  <td>
                    <AlertTriangle size={18} aria-hidden="true" /> Failed tool calls
                  </td>
                  <td>0</td>
                </tr>
                <tr>
                  <td>
                    <ShoppingCart size={18} aria-hidden="true" /> Pending orders
                  </td>
                  <td>{pendingOrders.length}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );

  function updateVariantEdit(variantId: string, patch: Partial<VariantEditState>) {
    setVariantEdits((current) => ({
      ...current,
      [variantId]: {
        ...(current[variantId] ?? { price: "0.00", stockOnHand: "0", reorderPoint: "3", isActive: true }),
        ...patch
      }
    }));
  }
}

function buildVariantEditState(products: Product[]) {
  return Object.fromEntries(
    products.flatMap((product) => product.variants.map((variant) => [variant.id, toVariantEdit(variant)]))
  ) as Record<string, VariantEditState>;
}

function toVariantEdit(variant: ProductVariant): VariantEditState {
  return {
    price: centsToDollars(variant.unitPriceCents),
    stockOnHand: String(variant.inventory?.stockOnHand ?? 0),
    reorderPoint: String(variant.inventory?.reorderPoint ?? 3),
    isActive: variant.isActive
  };
}

function summarizeInventory(products: Product[]) {
  let lowStock = 0;
  let outOfStock = 0;

  for (const product of products) {
    for (const variant of product.variants) {
      const stock = variant.inventory?.stockOnHand ?? 0;
      const reorder = variant.inventory?.reorderPoint ?? 3;
      if (stock <= 0) {
        outOfStock += 1;
      } else if (stock <= reorder) {
        lowStock += 1;
      }
    }
  }

  return { lowStock, outOfStock };
}

function latestConversationMessage(conversation: Conversation) {
  return conversation.messages.at(-1) ?? null;
}

function conversationCustomerName(conversation: Conversation) {
  return conversation.customer?.name ?? conversation.orders[0]?.customerName ?? conversation.customer?.phone ?? "Guest customer";
}

function conversationCustomerPhone(conversation: Conversation) {
  return conversation.customer?.phone ?? conversation.orders[0]?.customerPhone ?? "No phone";
}

function reportCurrency(report: ReportResponse) {
  return report.orders.find((order) => order.currency)?.currency ?? report.topProducts.find((product) => product.currency)?.currency ?? "USD";
}

function canConfirm(order: Order) {
  return ["PENDING", "NEEDS_HUMAN_REVIEW"].includes(order.status);
}

function canFulfill(order: Order) {
  return order.status === "CONFIRMED";
}

function canCancel(order: Order) {
  return ["PENDING", "CONFIRMED", "NEEDS_HUMAN_REVIEW"].includes(order.status);
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency
  }).format(cents / 100);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

function formatStatus(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function centsToDollars(cents: number) {
  return (cents / 100).toFixed(2);
}

function dollarsToCents(value: string) {
  return Math.round(Number(value || "0") * 100);
}

function numberFromInput(value: string) {
  return Math.max(Number.parseInt(value || "0", 10), 0);
}

function todayDateInput() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
