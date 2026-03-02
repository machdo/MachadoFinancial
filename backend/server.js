require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const app = express();

function normalizeOrigin(value) {
  return String(value ?? "")
    .trim()
    .replace(/\/+$/, "");
}

function parseAllowedOrigins() {
  const values = [process.env.CORS_ORIGINS, process.env.FRONTEND_URL]
    .filter(Boolean)
    .flatMap((raw) => String(raw).split(","))
    .map((item) => normalizeOrigin(item))
    .filter(Boolean);

  return [...new Set(values)];
}

const allowedOrigins = parseAllowedOrigins();

const corsOptions = {
  origin(origin, callback) {
    // Permite chamadas server-to-server e ferramentas sem Origin
    if (!origin) return callback(null, true);
    const normalizedOrigin = normalizeOrigin(origin);

    if (allowedOrigins.length === 0) {
      return callback(null, true);
    }

    if (allowedOrigins.includes("*") || allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${normalizedOrigin}`));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

console.log(
  "[CORS] Allowed origins:",
  allowedOrigins.length > 0 ? allowedOrigins.join(", ") : "(all)",
);

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "fincontrol-backend" });
});

// Middleware Auth
async function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true },
    });

    if (!user) {
      return res.status(401).json({ error: "User from token not found" });
    }

    req.userId = decoded.id;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) ? id : null;
}

function requestError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function isTransactionType(value) {
  return value === "income" || value === "expense";
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? "").trim());
}

function parseBudgetYear(value, fallback = null) {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return fallback;
  return year;
}

function parseBudgetMonth(value, fallback = null) {
  const month = Number(value);
  if (!Number.isInteger(month) || month < 1 || month > 12) return fallback;
  return month;
}

function parsePositiveAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

function parseNonNegativeAmount(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return amount;
}

function parseDayOfMonth(value, fallback = null) {
  const day = Number(value);
  if (!Number.isInteger(day) || day < 1 || day > 31) return fallback;
  return day;
}

function parseAlertPercent(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const alertPercent = Number(value);
  if (!Number.isFinite(alertPercent) || alertPercent <= 0 || alertPercent > 100) {
    return null;
  }
  return alertPercent;
}

function parseHistoryMonths(value, fallback = 12) {
  const months = Number(value);
  if (!Number.isInteger(months) || months < 1 || months > 24) return fallback;
  return months;
}

function currentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function getMonthRange(year, month) {
  return {
    start: new Date(year, month - 1, 1),
    end: new Date(year, month, 1),
  };
}

function getYearRange(year) {
  return {
    start: new Date(year, 0, 1),
    end: new Date(year + 1, 0, 1),
  };
}

function toMonthKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function shiftYearMonth(year, month, offset = 0) {
  const date = new Date(year, month - 1 + offset, 1);
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  };
}

function monthClosingDate(year, month, closingDay) {
  const safeMonth = Math.max(1, Math.min(12, Number(month) || 1));
  const lastDay = new Date(year, safeMonth, 0).getDate();
  const safeDay = Math.max(1, Math.min(lastDay, Number(closingDay) || 1));
  return new Date(year, safeMonth - 1, safeDay);
}

function splitInstallments(totalAmount, installments) {
  const count = Math.max(1, Number(installments) || 1);
  const totalCents = Math.round((Number(totalAmount) || 0) * 100);
  const baseCents = Math.floor(totalCents / count);
  const remainder = totalCents - baseCents * count;

  return Array.from({ length: count }, (_, index) => {
    const cents = baseCents + (index < remainder ? 1 : 0);
    return cents / 100;
  });
}

function listRecentMonths(year, month, count) {
  const months = [];
  let currentYear = year;
  let currentMonth = month;

  for (let index = 0; index < count; index += 1) {
    months.push({
      year: currentYear,
      month: currentMonth,
      key: toMonthKey(currentYear, currentMonth),
    });

    currentMonth -= 1;
    if (currentMonth < 1) {
      currentMonth = 12;
      currentYear -= 1;
    }
  }

  return months.reverse();
}

function toProgressPercent(realized, planned) {
  if (planned <= 0) return 0;
  return (realized / planned) * 100;
}

async function buildBudgetOverview(userId, year, month, historyMonths = 12) {
  const { start: monthStart, end: monthEnd } = getMonthRange(year, month);
  const { start: yearStart, end: yearEnd } = getYearRange(year);
  const historyPeriod = listRecentMonths(year, month, historyMonths);
  const historyStart = new Date(historyPeriod[0].year, historyPeriod[0].month - 1, 1);

  const [categoryBudgets, expenseByCategoryRows, accountLimits, expenseByAccountRows, annualBudget, annualExpenseAggregate, monthlyExpenseAggregate, historyBudgets, historyTransactions] =
    await Promise.all([
      prisma.categoryBudget.findMany({
        where: { userId, year, month },
        include: {
          category: {
            select: { id: true, name: true, color: true, type: true },
          },
        },
        orderBy: [{ categoryId: "asc" }],
      }),
      prisma.transaction.groupBy({
        by: ["categoryId"],
        where: {
          userId,
          type: "expense",
          date: { gte: monthStart, lt: monthEnd },
        },
        _sum: { value: true },
      }),
      prisma.accountLimit.findMany({
        where: { userId },
        include: {
          account: {
            select: { id: true, name: true, type: true, balance: true },
          },
        },
        orderBy: [{ accountId: "asc" }],
      }),
      prisma.transaction.groupBy({
        by: ["accountId"],
        where: {
          userId,
          type: "expense",
          date: { gte: monthStart, lt: monthEnd },
        },
        _sum: { value: true },
      }),
      prisma.annualBudget.findUnique({
        where: { userId_year: { userId, year } },
      }),
      prisma.transaction.aggregate({
        where: {
          userId,
          type: "expense",
          date: { gte: yearStart, lt: yearEnd },
        },
        _sum: { value: true },
      }),
      prisma.transaction.aggregate({
        where: {
          userId,
          type: "expense",
          date: { gte: monthStart, lt: monthEnd },
        },
        _sum: { value: true },
      }),
      prisma.categoryBudget.findMany({
        where: {
          userId,
          OR: historyPeriod.map((item) => ({ year: item.year, month: item.month })),
        },
        select: { year: true, month: true, amount: true },
      }),
      prisma.transaction.findMany({
        where: {
          userId,
          type: "expense",
          date: { gte: historyStart, lt: monthEnd },
        },
        select: { value: true, date: true },
      }),
    ]);

  const expenseByCategory = new Map();
  for (const row of expenseByCategoryRows) {
    expenseByCategory.set(row.categoryId, Number(row?._sum?.value) || 0);
  }

  const expenseByAccount = new Map();
  for (const row of expenseByAccountRows) {
    expenseByAccount.set(row.accountId, Number(row?._sum?.value) || 0);
  }

  const categoryProgress = categoryBudgets
    .filter((item) => item.category?.type === "expense")
    .map((budget) => {
      const plannedAmount = Number(budget.amount) || 0;
      const realizedAmount = expenseByCategory.get(budget.categoryId) || 0;
      const progressPercent = toProgressPercent(realizedAmount, plannedAmount);
      const alertPercent = Number(budget.alertPercent) || 80;
      const alertTriggered = plannedAmount > 0 && progressPercent >= alertPercent;

      return {
        id: budget.id,
        categoryId: budget.categoryId,
        categoryName: budget.category?.name || `Categoria ${budget.categoryId}`,
        categoryColor: budget.category?.color || "#64748b",
        year: budget.year,
        month: budget.month,
        plannedAmount: roundMoney(plannedAmount),
        realizedAmount: roundMoney(realizedAmount),
        remainingAmount: roundMoney(plannedAmount - realizedAmount),
        progressPercent: roundMoney(progressPercent),
        alertPercent,
        alertTriggered,
      };
    })
    .sort((a, b) => b.progressPercent - a.progressPercent);

  const accountLimitProgress = accountLimits
    .map((limit) => {
      const plannedAmount = Number(limit.monthlyLimit) || 0;
      const realizedAmount = expenseByAccount.get(limit.accountId) || 0;
      const progressPercent = toProgressPercent(realizedAmount, plannedAmount);
      const alertPercent = Number(limit.alertPercent) || 80;
      const alertTriggered = plannedAmount > 0 && progressPercent >= alertPercent;

      return {
        id: limit.id,
        accountId: limit.accountId,
        accountName: limit.account?.name || `Conta ${limit.accountId}`,
        accountType: limit.account?.type || "",
        monthlyLimit: roundMoney(plannedAmount),
        realizedAmount: roundMoney(realizedAmount),
        remainingAmount: roundMoney(plannedAmount - realizedAmount),
        progressPercent: roundMoney(progressPercent),
        alertPercent,
        alertTriggered,
      };
    })
    .sort((a, b) => b.progressPercent - a.progressPercent);

  const monthlyPlanned = categoryProgress.reduce((sum, item) => sum + item.plannedAmount, 0);
  const monthlyRealized = Number(monthlyExpenseAggregate?._sum?.value) || 0;
  const monthlyProgressPercent = toProgressPercent(monthlyRealized, monthlyPlanned);

  const annualPlanned = Number(annualBudget?.amount) || 0;
  const annualRealized = Number(annualExpenseAggregate?._sum?.value) || 0;
  const annualProgressPercent = toProgressPercent(annualRealized, annualPlanned);
  const annualAlertPercent = Number(annualBudget?.alertPercent) || 80;
  const annualAlertTriggered = annualPlanned > 0 && annualProgressPercent >= annualAlertPercent;

  const alerts = [];
  for (const categoryItem of categoryProgress) {
    if (!categoryItem.alertTriggered) continue;
    alerts.push({
      kind: "category",
      targetId: categoryItem.categoryId,
      targetName: categoryItem.categoryName,
      progressPercent: categoryItem.progressPercent,
      alertPercent: categoryItem.alertPercent,
      plannedAmount: categoryItem.plannedAmount,
      realizedAmount: categoryItem.realizedAmount,
    });
  }

  for (const accountItem of accountLimitProgress) {
    if (!accountItem.alertTriggered) continue;
    alerts.push({
      kind: "account",
      targetId: accountItem.accountId,
      targetName: accountItem.accountName,
      progressPercent: accountItem.progressPercent,
      alertPercent: accountItem.alertPercent,
      plannedAmount: accountItem.monthlyLimit,
      realizedAmount: accountItem.realizedAmount,
    });
  }

  if (annualAlertTriggered) {
    alerts.push({
      kind: "annual",
      targetId: year,
      targetName: `Orcamento anual ${year}`,
      progressPercent: roundMoney(annualProgressPercent),
      alertPercent: annualAlertPercent,
      plannedAmount: roundMoney(annualPlanned),
      realizedAmount: roundMoney(annualRealized),
    });
  }

  alerts.sort((a, b) => b.progressPercent - a.progressPercent);

  const plannedHistoryMap = new Map();
  for (const budget of historyBudgets) {
    const key = toMonthKey(budget.year, budget.month);
    plannedHistoryMap.set(key, (plannedHistoryMap.get(key) ?? 0) + (Number(budget.amount) || 0));
  }

  const realizedHistoryMap = new Map();
  for (const transaction of historyTransactions) {
    const dt = new Date(transaction.date);
    if (Number.isNaN(dt.getTime())) continue;
    const key = toMonthKey(dt.getFullYear(), dt.getMonth() + 1);
    realizedHistoryMap.set(key, (realizedHistoryMap.get(key) ?? 0) + (Number(transaction.value) || 0));
  }

  const history = historyPeriod.map((item) => {
    const plannedAmount = plannedHistoryMap.get(item.key) ?? 0;
    const realizedAmount = realizedHistoryMap.get(item.key) ?? 0;
    return {
      month: item.key,
      year: item.year,
      monthNumber: item.month,
      plannedAmount: roundMoney(plannedAmount),
      realizedAmount: roundMoney(realizedAmount),
      differenceAmount: roundMoney(plannedAmount - realizedAmount),
      progressPercent: roundMoney(toProgressPercent(realizedAmount, plannedAmount)),
    };
  });

  return {
    period: { year, month, monthKey: toMonthKey(year, month) },
    monthlyComparison: {
      plannedAmount: roundMoney(monthlyPlanned),
      realizedAmount: roundMoney(monthlyRealized),
      differenceAmount: roundMoney(monthlyPlanned - monthlyRealized),
      progressPercent: roundMoney(monthlyProgressPercent),
    },
    annualComparison: {
      id: annualBudget?.id ?? null,
      year,
      plannedAmount: roundMoney(annualPlanned),
      realizedAmount: roundMoney(annualRealized),
      differenceAmount: roundMoney(annualPlanned - annualRealized),
      progressPercent: roundMoney(annualProgressPercent),
      alertPercent: annualBudget ? annualAlertPercent : null,
      alertTriggered: annualAlertTriggered,
    },
    categoryProgress,
    accountLimitProgress,
    alerts,
    history,
  };
}

const AI_MAX_HISTORY = 12;
const AI_MAX_MESSAGE_LENGTH = 1200;
const AI_PROVIDER = String(process.env.AI_PROVIDER || "groq")
  .trim()
  .toLowerCase();
const AI_OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const AI_GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

function getAiProviderConfig() {
  if (AI_PROVIDER === "openai") {
    return {
      name: "openai",
      label: "OpenAI",
      endpoint: "https://api.openai.com/v1/chat/completions",
      apiKeyName: "OPENAI_API_KEY",
      apiKey: String(process.env.OPENAI_API_KEY || "").trim(),
      model: AI_OPENAI_MODEL,
    };
  }

  if (AI_PROVIDER === "groq") {
    return {
      name: "groq",
      label: "Groq",
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      apiKeyName: "GROQ_API_KEY",
      apiKey: String(process.env.GROQ_API_KEY || "").trim(),
      model: AI_GROQ_MODEL,
    };
  }

  return {
    name: "unsupported",
    label: "Unsupported",
    endpoint: "",
    apiKeyName: "",
    apiKey: "",
    model: "",
  };
}

function normalizeChatMessages(rawMessages) {
  if (!Array.isArray(rawMessages)) return [];

  return rawMessages
    .map((item) => {
      const role = item?.role === "assistant" ? "assistant" : "user";
      const content = String(item?.content ?? "")
        .trim()
        .slice(0, AI_MAX_MESSAGE_LENGTH);

      if (!content) return null;
      return { role, content };
    })
    .filter(Boolean)
    .slice(-AI_MAX_HISTORY);
}

function roundMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100) / 100;
}

function summarizeInvoiceAmounts(totalAmount, paidAmount) {
  const total = Math.max(0, Number(totalAmount) || 0);
  const paidRaw = Math.max(0, Number(paidAmount) || 0);
  const paid = Math.min(paidRaw, total);
  const outstanding = Math.max(0, total - paid);

  return {
    totalAmount: roundMoney(total),
    paidAmount: roundMoney(paid),
    outstandingAmount: roundMoney(outstanding),
    status: outstanding <= 0 ? "paid" : "open",
  };
}

function toCreditCardInvoicePayload(invoice) {
  const summary = summarizeInvoiceAmounts(invoice.totalAmount, invoice.paidAmount);
  return {
    id: invoice.id,
    userId: invoice.userId,
    creditCardId: invoice.creditCardId,
    year: invoice.year,
    month: invoice.month,
    monthKey: toMonthKey(invoice.year, invoice.month),
    closingDate: invoice.closingDate,
    totalAmount: summary.totalAmount,
    paidAmount: summary.paidAmount,
    outstandingAmount: summary.outstandingAmount,
    status: summary.status,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
  };
}

function toCreditCardPayload(card, invoices = []) {
  let outstandingAmount = 0;
  let paidInvoices = 0;
  let openInvoices = 0;

  for (const invoice of invoices) {
    const summary = summarizeInvoiceAmounts(invoice.totalAmount, invoice.paidAmount);
    outstandingAmount += summary.outstandingAmount;
    if (summary.status === "paid") paidInvoices += 1;
    else openInvoices += 1;
  }

  const totalLimit = roundMoney(card.totalLimit);
  const usedLimit = roundMoney(outstandingAmount);
  const availableLimit = roundMoney(totalLimit - usedLimit);

  return {
    id: card.id,
    name: card.name,
    totalLimit,
    usedLimit,
    availableLimit,
    bestPurchaseDay: card.bestPurchaseDay,
    closingDay: card.closingDay,
    autoInstallments: card.autoInstallments,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    invoiceCount: invoices.length,
    openInvoiceCount: openInvoices,
    paidInvoiceCount: paidInvoices,
  };
}

async function buildCreditCardsOverview(userId) {
  const [cards, invoices] = await Promise.all([
    prisma.creditCard.findMany({
      where: { userId },
      orderBy: [{ name: "asc" }],
    }),
    prisma.creditCardInvoice.findMany({
      where: { userId },
      select: {
        id: true,
        creditCardId: true,
        totalAmount: true,
        paidAmount: true,
      },
    }),
  ]);

  const invoicesByCard = new Map();
  for (const invoice of invoices) {
    const current = invoicesByCard.get(invoice.creditCardId) ?? [];
    current.push(invoice);
    invoicesByCard.set(invoice.creditCardId, current);
  }

  const items = cards.map((card) =>
    toCreditCardPayload(card, invoicesByCard.get(card.id) ?? []),
  );

  const summary = items.reduce(
    (acc, item) => {
      acc.totalLimit += item.totalLimit;
      acc.usedLimit += item.usedLimit;
      acc.availableLimit += item.availableLimit;
      acc.openInvoiceCount += item.openInvoiceCount;
      acc.paidInvoiceCount += item.paidInvoiceCount;
      return acc;
    },
    {
      cardsCount: items.length,
      totalLimit: 0,
      usedLimit: 0,
      availableLimit: 0,
      openInvoiceCount: 0,
      paidInvoiceCount: 0,
    },
  );

  return {
    items,
    summary: {
      cardsCount: summary.cardsCount,
      totalLimit: roundMoney(summary.totalLimit),
      usedLimit: roundMoney(summary.usedLimit),
      availableLimit: roundMoney(summary.availableLimit),
      openInvoiceCount: summary.openInvoiceCount,
      paidInvoiceCount: summary.paidInvoiceCount,
    },
  };
}

async function listCreditCardInvoices(userId, creditCardId, limit = 24) {
  const rows = await prisma.creditCardInvoice.findMany({
    where: { userId, creditCardId },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take: limit,
  });

  return rows.map((row) => toCreditCardInvoicePayload(row));
}

function extractAssistantReply(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part?.type === "text" && typeof part?.text === "string") return part.text;
        return "";
      })
      .join(" ")
      .trim();
  }
  return "";
}

async function buildUserFinanceSnapshot(userId) {
  const since = new Date();
  since.setDate(since.getDate() - 180);

  const [accounts, categories, goals, transactions] = await Promise.all([
    prisma.account.findMany({
      where: { userId },
      select: { id: true, name: true, type: true, balance: true },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({
      where: { userId },
      select: { id: true, name: true, type: true },
    }),
    prisma.goal.findMany({
      where: { userId },
      select: {
        name: true,
        currentValue: true,
        targetValue: true,
        deadline: true,
      },
      orderBy: { deadline: "asc" },
      take: 8,
    }),
    prisma.transaction.findMany({
      where: { userId, date: { gte: since } },
      select: {
        id: true,
        type: true,
        value: true,
        date: true,
        accountId: true,
        categoryId: true,
      },
      orderBy: { date: "asc" },
    }),
  ]);

  const categoryMap = new Map(categories.map((item) => [item.id, item]));
  const last30Cutoff = new Date();
  last30Cutoff.setDate(last30Cutoff.getDate() - 30);

  let incomeTotal = 0;
  let expenseTotal = 0;
  let incomeLast30 = 0;
  let expenseLast30 = 0;

  const expenseByCategory = new Map();
  const monthlyMap = new Map();

  for (const transaction of transactions) {
    const value = Number(transaction.value) || 0;
    const isIncome = transaction.type === "income";
    const transactionDate = new Date(transaction.date);
    const month = Number.isNaN(transactionDate.getTime())
      ? "sem-data"
      : transactionDate.toISOString().slice(0, 7);
    const monthData = monthlyMap.get(month) ?? { income: 0, expense: 0 };

    if (isIncome) {
      incomeTotal += value;
      monthData.income += value;
      if (transactionDate >= last30Cutoff) incomeLast30 += value;
    } else {
      expenseTotal += value;
      monthData.expense += value;
      if (transactionDate >= last30Cutoff) expenseLast30 += value;

      const category = categoryMap.get(transaction.categoryId);
      const categoryName = category?.name || "Sem categoria";
      expenseByCategory.set(categoryName, (expenseByCategory.get(categoryName) ?? 0) + value);
    }

    monthlyMap.set(month, monthData);
  }

  const topExpenseCategories = [...expenseByCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, total]) => ({ name, total: roundMoney(total) }));

  const monthlyNet = [...monthlyMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6)
    .map(([month, values]) => ({
      month,
      income: roundMoney(values.income),
      expense: roundMoney(values.expense),
      net: roundMoney(values.income - values.expense),
    }));

  const goalsSummary = goals.map((goal) => {
    const target = Number(goal.targetValue) || 0;
    const current = Number(goal.currentValue) || 0;
    const progressPercent = target > 0 ? (current / target) * 100 : 0;

    return {
      name: goal.name,
      currentValue: roundMoney(current),
      targetValue: roundMoney(target),
      progressPercent: roundMoney(progressPercent),
      deadline: goal.deadline,
    };
  });

  const totalBalance = accounts.reduce((sum, account) => sum + (Number(account.balance) || 0), 0);

  return {
    generatedAt: new Date().toISOString(),
    windowDays: 180,
    accounts: {
      totalCount: accounts.length,
      totalBalance: roundMoney(totalBalance),
      items: accounts.slice(0, 10).map((account) => ({
        name: account.name,
        type: account.type,
        balance: roundMoney(account.balance),
      })),
    },
    transactions: {
      count: transactions.length,
      incomeTotal: roundMoney(incomeTotal),
      expenseTotal: roundMoney(expenseTotal),
      netTotal: roundMoney(incomeTotal - expenseTotal),
      incomeLast30Days: roundMoney(incomeLast30),
      expenseLast30Days: roundMoney(expenseLast30),
      netLast30Days: roundMoney(incomeLast30 - expenseLast30),
      monthlyNet,
      topExpenseCategories,
    },
    goals: goalsSummary,
  };
}

const TRANSACTION_INCLUDE = {
  category: true,
  attachments: {
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
    },
  },
  tags: {
    include: {
      tag: true,
    },
  },
  recurringTransaction: {
    select: {
      id: true,
      frequency: true,
      interval: true,
      dayOfMonth: true,
      dayOfWeek: true,
      nextRunAt: true,
      active: true,
    },
  },
};

const RECURRING_FREQUENCIES = new Set(["daily", "weekly", "monthly", "yearly"]);
const RECONCILIATION_STATUSES = new Set(["pending", "reconciled", "ignored"]);
const MAX_TAGS_PER_TRANSACTION = 20;
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_ROWS = 5000;

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function parseIsoDate(value, fallback = null) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date;
}

function parseRecurringFrequency(value, fallback = "monthly") {
  const normalized = normalizeText(value);
  if (RECURRING_FREQUENCIES.has(normalized)) return normalized;
  return fallback;
}

function parsePositiveInt(value, fallback = 1, min = 1, max = 120) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function parseDayOfWeek(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const day = Number(value);
  if (!Number.isInteger(day) || day < 0 || day > 6) return fallback;
  return day;
}

function parseTagNames(raw) {
  const values = Array.isArray(raw) ? raw : String(raw ?? "").split(",");
  const unique = new Map();

  for (const item of values) {
    const name = String(item ?? "").trim();
    if (!name) continue;
    const key = normalizeText(name);
    if (!key) continue;
    if (unique.has(key)) continue;
    unique.set(key, name.slice(0, 40));
    if (unique.size >= MAX_TAGS_PER_TRANSACTION) break;
  }

  return [...unique.values()];
}

function dateOnlyKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dayRange(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  const start = new Date(date);
  const end = new Date(date);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function shiftDateMonths(baseDate, offsetMonths = 0, preferredDay = null) {
  const base = new Date(baseDate);
  const originalDay = preferredDay ?? base.getDate();
  const target = new Date(base.getFullYear(), base.getMonth() + offsetMonths, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(Math.max(1, originalDay), lastDay));
  target.setHours(base.getHours(), base.getMinutes(), base.getSeconds(), base.getMilliseconds());
  return target;
}

function nextDateByFrequency(currentDate, frequency, interval, dayOfMonth = null, dayOfWeek = null) {
  const current = new Date(currentDate);
  const step = Math.max(1, Number(interval) || 1);

  if (frequency === "daily") {
    current.setDate(current.getDate() + step);
    return current;
  }

  if (frequency === "weekly") {
    current.setDate(current.getDate() + step * 7);
    if (Number.isInteger(dayOfWeek) && dayOfWeek >= 0 && dayOfWeek <= 6) {
      const diff = dayOfWeek - current.getDay();
      current.setDate(current.getDate() + diff);
    }
    return current;
  }

  if (frequency === "monthly") {
    const preferredDay = parseDayOfMonth(dayOfMonth, current.getDate());
    return shiftDateMonths(current, step, preferredDay);
  }

  if (frequency === "yearly") {
    const target = new Date(current);
    target.setFullYear(target.getFullYear() + step);
    const preferredDay = parseDayOfMonth(dayOfMonth, target.getDate());
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(preferredDay, lastDay));
    return target;
  }

  return null;
}

function alignDateForRule(startDate, frequency, dayOfMonth = null, dayOfWeek = null) {
  const start = new Date(startDate);
  if (frequency === "monthly" || frequency === "yearly") {
    const day = parseDayOfMonth(dayOfMonth, start.getDate());
    const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    start.setDate(Math.min(day, lastDay));
    return start;
  }

  if (frequency === "weekly" && Number.isInteger(dayOfWeek)) {
    const diff = (dayOfWeek - start.getDay() + 7) % 7;
    start.setDate(start.getDate() + diff);
    return start;
  }

  return start;
}

function normalizeAttachmentBase64(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  const marker = "base64,";
  const markerIndex = value.indexOf(marker);
  if (markerIndex >= 0) {
    return value.slice(markerIndex + marker.length).trim();
  }
  return value;
}

function parseAttachmentPayload(body) {
  const fileName = String(body?.fileName ?? "").trim().slice(0, 180);
  const mimeType = String(body?.mimeType ?? "application/octet-stream")
    .trim()
    .slice(0, 120);
  const contentBase64 = normalizeAttachmentBase64(body?.contentBase64);
  if (!fileName || !contentBase64) return null;

  let buffer = null;
  try {
    buffer = Buffer.from(contentBase64, "base64");
  } catch {
    return null;
  }

  if (!buffer || buffer.length === 0 || buffer.length > MAX_ATTACHMENT_BYTES) {
    return null;
  }

  return {
    fileName,
    mimeType,
    contentBase64,
    sizeBytes: buffer.length,
  };
}

function buildEntryFingerprint(entryDate, amount, description) {
  const datePart = dateOnlyKey(entryDate);
  const amountPart = Number(amount).toFixed(2);
  const descPart = normalizeText(description).replace(/[^a-z0-9 ]/g, "").slice(0, 80);
  return `${datePart}|${amountPart}|${descPart}`;
}

function parseImportAmount(value) {
  const raw = String(value ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(/[Rr]\$/g, "");

  if (!raw) return NaN;

  if (/^-?\d+,\d{2}$/.test(raw)) {
    return Number(raw.replace(",", "."));
  }

  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  return Number(normalized);
}

function parseFlexibleDate(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const parsed = new Date(text.slice(0, 10));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
    const [day, month, year] = text.split("/").map((item) => Number(item));
    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (/^\d{2}-\d{2}-\d{4}$/.test(text)) {
    const [day, month, year] = text.split("-").map((item) => Number(item));
    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (/^\d{8}$/.test(text)) {
    const year = Number(text.slice(0, 4));
    const month = Number(text.slice(4, 6));
    const day = Number(text.slice(6, 8));
    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const generic = new Date(text);
  return Number.isNaN(generic.getTime()) ? null : generic;
}

function splitCsvLine(line, delimiter) {
  const output = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      output.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  output.push(current);
  return output.map((item) => item.trim());
}

function detectCsvDelimiter(headerLine) {
  const delimiters = [",", ";", "\t"];
  let selected = ",";
  let bestCount = -1;

  for (const delimiter of delimiters) {
    const count = String(headerLine).split(delimiter).length - 1;
    if (count > bestCount) {
      bestCount = count;
      selected = delimiter;
    }
  }

  return selected;
}

function parseCsvEntries(content) {
  const text = String(content ?? "");
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const delimiter = detectCsvDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter).map((item) => normalizeText(item));

  const dateIndex = headers.findIndex((name) =>
    ["data", "date", "dt", "lancamento"].some((keyword) => name.includes(keyword)),
  );
  const amountIndex = headers.findIndex((name) =>
    ["valor", "value", "amount", "quantia"].some((keyword) => name.includes(keyword)),
  );
  const descriptionIndex = headers.findIndex((name) =>
    ["descricao", "description", "historico", "memo", "detalhe", "narrativa", "name"].some(
      (keyword) => name.includes(keyword),
    ),
  );

  if (dateIndex < 0 || amountIndex < 0) return [];

  const entries = [];
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const cols = splitCsvLine(lines[lineIndex], delimiter);
    const date = parseFlexibleDate(cols[dateIndex]);
    const amount = parseImportAmount(cols[amountIndex]);
    const description = String(cols[descriptionIndex] ?? "").trim();

    if (!date || !Number.isFinite(amount)) continue;

    entries.push({
      date,
      amount: roundMoney(amount),
      description,
      fitId: null,
    });
  }

  return entries;
}

function parseOfxDate(rawValue) {
  const raw = String(rawValue ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return null;
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function extractOfxTag(block, tagName) {
  const regex = new RegExp(`<${tagName}>([^<\\r\\n]+)`, "i");
  const match = String(block ?? "").match(regex);
  return String(match?.[1] ?? "").trim();
}

function parseOfxEntries(content) {
  const text = String(content ?? "");
  const blockRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  const entries = [];

  let match = blockRegex.exec(text);
  while (match) {
    const block = match[1];
    const date = parseOfxDate(extractOfxTag(block, "DTPOSTED"));
    const amount = parseImportAmount(extractOfxTag(block, "TRNAMT"));
    const description =
      extractOfxTag(block, "MEMO") || extractOfxTag(block, "NAME") || "LANCAMENTO OFX";
    const fitId = extractOfxTag(block, "FITID") || null;

    if (date && Number.isFinite(amount)) {
      entries.push({
        date,
        amount: roundMoney(amount),
        description,
        fitId,
      });
    }

    match = blockRegex.exec(text);
  }

  return entries;
}

function transactionTypeFromAmount(amount) {
  return Number(amount) >= 0 ? "income" : "expense";
}

function transactionValueFromAmount(amount) {
  return roundMoney(Math.abs(Number(amount) || 0));
}

function scoreDescriptionMatch(a, b) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.8;

  const leftTokens = new Set(left.split(" ").filter((token) => token.length > 2));
  const rightTokens = new Set(right.split(" ").filter((token) => token.length > 2));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let common = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) common += 1;
  }

  return common / Math.max(leftTokens.size, rightTokens.size);
}

async function writeAuditLog(
  dbClient,
  { userId, transactionId = null, entityType, entityId, action, beforeData = null, afterData = null, metadata = null },
) {
  try {
    await dbClient.auditLog.create({
      data: {
        userId,
        transactionId,
        entityType: String(entityType || "unknown"),
        entityId: String(entityId ?? ""),
        action: String(action || "unknown"),
        beforeData,
        afterData,
        metadata,
      },
    });
  } catch (err) {
    console.error("Falha ao gravar audit log:", err);
  }
}

function toTagPayload(tag) {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
    createdAt: tag.createdAt,
    updatedAt: tag.updatedAt,
  };
}

function toTransactionPayload(transaction) {
  const tags = Array.isArray(transaction.tags)
    ? transaction.tags
        .map((link) => link?.tag)
        .filter(Boolean)
        .map((tag) => toTagPayload(tag))
    : [];

  return {
    ...transaction,
    tags,
    attachments: Array.isArray(transaction.attachments) ? transaction.attachments : [],
  };
}

async function ensureTagsByName(dbClient, userId, rawNames) {
  const names = parseTagNames(rawNames);
  if (names.length === 0) return [];

  const existing = await dbClient.tag.findMany({
    where: {
      userId,
      name: { in: names },
    },
  });

  const existingByName = new Map(
    existing.map((tag) => [normalizeText(tag.name), tag]),
  );

  const createdTags = [];
  for (const name of names) {
    const key = normalizeText(name);
    if (existingByName.has(key)) continue;

    const created = await dbClient.tag.create({
      data: {
        userId,
        name,
      },
    });
    existingByName.set(key, created);
    createdTags.push(created);
  }

  const ordered = names
    .map((name) => existingByName.get(normalizeText(name)))
    .filter(Boolean);

  return ordered.length > 0 ? ordered : createdTags;
}

async function replaceTransactionTags(dbClient, userId, transactionId, rawTagNames) {
  const tags = await ensureTagsByName(dbClient, userId, rawTagNames);
  await dbClient.transactionTag.deleteMany({
    where: { userId, transactionId },
  });

  if (tags.length > 0) {
    await dbClient.transactionTag.createMany({
      data: tags.map((tag) => ({
        userId,
        transactionId,
        tagId: tag.id,
      })),
      skipDuplicates: true,
    });
  }

  return tags;
}

async function loadTransactionOrFail(userId, transactionId) {
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, userId },
    include: TRANSACTION_INCLUDE,
  });
  if (!transaction) {
    throw requestError(404, "Transacao nao encontrada.");
  }
  return transaction;
}

async function processRecurringTransactions(userId) {
  const now = new Date();
  const dueRules = await prisma.recurringTransaction.findMany({
    where: {
      userId,
      active: true,
      nextRunAt: { lte: now },
    },
    orderBy: [{ nextRunAt: "asc" }],
    take: 100,
  });

  let generated = 0;
  let processed = 0;
  let deactivated = 0;

  for (const rule of dueRules) {
    processed += 1;
    let nextRunAt = new Date(rule.nextRunAt);
    let lastRunAt = rule.lastRunAt ? new Date(rule.lastRunAt) : null;
    let active = true;
    let remainingInstallments =
      rule.installmentsRemaining === null ? null : Number(rule.installmentsRemaining);
    let guard = 0;

    const [account, category] = await Promise.all([
      prisma.account.findFirst({
        where: { id: rule.accountId, userId },
        select: { id: true },
      }),
      prisma.category.findFirst({
        where: { id: rule.categoryId, userId },
        select: { id: true, type: true },
      }),
    ]);

    if (!account || !category || category.type !== rule.type) {
      active = false;
      deactivated += 1;
      await writeAuditLog(prisma, {
        userId,
        entityType: "recurringTransaction",
        entityId: rule.id,
        action: "auto_deactivated",
        metadata: {
          reason: "missing_account_or_category",
          accountFound: Boolean(account),
          categoryFound: Boolean(category),
          categoryType: category?.type ?? null,
          transactionType: rule.type,
        },
      });
      await prisma.recurringTransaction.update({
        where: { id: rule.id },
        data: { active: false },
      });
      continue;
    }

    while (active && nextRunAt <= now && guard < 48) {
      if (rule.endDate && nextRunAt > rule.endDate) {
        active = false;
        deactivated += 1;
        break;
      }

      const externalRef = `recurring:${rule.id}:${dateOnlyKey(nextRunAt)}`;
      const existingTransaction = await prisma.transaction.findFirst({
        where: { userId, externalRef },
        select: { id: true },
      });

      if (!existingTransaction) {
        const created = await prisma.transaction.create({
          data: {
            type: rule.type,
            value: roundMoney(rule.value),
            description: rule.description ?? null,
            date: new Date(nextRunAt),
            userId,
            accountId: rule.accountId,
            categoryId: rule.categoryId,
            externalRef,
            isRecurringGenerated: true,
            recurringTransactionId: rule.id,
          },
        });

        generated += 1;
        lastRunAt = new Date(nextRunAt);
        await writeAuditLog(prisma, {
          userId,
          transactionId: created.id,
          entityType: "transaction",
          entityId: created.id,
          action: "created_by_recurring_rule",
          afterData: {
            type: created.type,
            value: created.value,
            date: created.date,
            description: created.description,
          },
          metadata: {
            recurringTransactionId: rule.id,
          },
        });
      }

      if (remainingInstallments !== null) {
        remainingInstallments -= 1;
        if (remainingInstallments <= 0) {
          remainingInstallments = 0;
          active = false;
          deactivated += 1;
          break;
        }
      }

      const candidate = nextDateByFrequency(
        nextRunAt,
        rule.frequency,
        rule.interval,
        rule.dayOfMonth,
        rule.dayOfWeek,
      );

      if (!candidate) {
        active = false;
        deactivated += 1;
        break;
      }

      nextRunAt = candidate;
      if (rule.endDate && nextRunAt > rule.endDate) {
        active = false;
        deactivated += 1;
      }

      guard += 1;
    }

    await prisma.recurringTransaction.update({
      where: { id: rule.id },
      data: {
        nextRunAt,
        lastRunAt,
        installmentsRemaining: remainingInstallments,
        active,
      },
    });
  }

  return { processed, generated, deactivated };
}

async function processRecurringTransfers(userId) {
  const now = new Date();
  const dueRules = await prisma.recurringTransfer.findMany({
    where: {
      userId,
      active: true,
      nextRunAt: { lte: now },
    },
    orderBy: [{ nextRunAt: "asc" }],
    take: 100,
  });

  let processed = 0;
  let executed = 0;
  let skipped = 0;
  let deactivated = 0;

  for (const rule of dueRules) {
    processed += 1;
    let nextRunAt = new Date(rule.nextRunAt);
    let lastRunAt = rule.lastRunAt ? new Date(rule.lastRunAt) : null;
    let active = true;
    let guard = 0;

    while (active && nextRunAt <= now && guard < 48) {
      if (rule.endDate && nextRunAt > rule.endDate) {
        active = false;
        deactivated += 1;
        break;
      }

      try {
        await prisma.$transaction(async (tx) => {
          const [fromAccount, toAccount] = await Promise.all([
            tx.account.findFirst({
              where: { id: rule.fromAccountId, userId },
            }),
            tx.account.findFirst({
              where: { id: rule.toAccountId, userId },
            }),
          ]);

          if (!fromAccount || !toAccount) {
            throw requestError(404, "Conta de origem ou destino nao encontrada.");
          }

          if (Number(fromAccount.balance) < Number(rule.amount)) {
            throw requestError(409, "Saldo insuficiente para transferencia recorrente.");
          }

          await Promise.all([
            tx.account.update({
              where: { id: rule.fromAccountId },
              data: { balance: { decrement: Number(rule.amount) } },
            }),
            tx.account.update({
              where: { id: rule.toAccountId },
              data: { balance: { increment: Number(rule.amount) } },
            }),
          ]);
        });

        executed += 1;
        lastRunAt = new Date(nextRunAt);
        await writeAuditLog(prisma, {
          userId,
          entityType: "recurringTransfer",
          entityId: rule.id,
          action: "executed",
          metadata: {
            amount: roundMoney(rule.amount),
            fromAccountId: rule.fromAccountId,
            toAccountId: rule.toAccountId,
            runAt: nextRunAt,
          },
        });
      } catch (err) {
        skipped += 1;
        await writeAuditLog(prisma, {
          userId,
          entityType: "recurringTransfer",
          entityId: rule.id,
          action: "skipped",
          metadata: {
            amount: roundMoney(rule.amount),
            fromAccountId: rule.fromAccountId,
            toAccountId: rule.toAccountId,
            runAt: nextRunAt,
            reason: err?.message || String(err),
          },
        });
      }

      const candidate = nextDateByFrequency(nextRunAt, rule.frequency, rule.interval);
      if (!candidate) {
        active = false;
        deactivated += 1;
        break;
      }

      nextRunAt = candidate;
      if (rule.endDate && nextRunAt > rule.endDate) {
        active = false;
        deactivated += 1;
      }

      guard += 1;
    }

    await prisma.recurringTransfer.update({
      where: { id: rule.id },
      data: {
        nextRunAt,
        lastRunAt,
        active,
      },
    });
  }

  return { processed, executed, skipped, deactivated };
}

async function importBankEntries({ userId, sourceType, fileName = null, entries }) {
  const normalizedEntries = entries.slice(0, MAX_IMPORT_ROWS);
  const batch = await prisma.bankImportBatch.create({
    data: {
      userId,
      sourceType,
      fileName: fileName ? String(fileName).slice(0, 180) : null,
      totalRows: normalizedEntries.length,
    },
  });

  let createdRows = 0;
  let possibleDuplicates = 0;
  const localFingerprints = new Set();

  for (const entry of normalizedEntries) {
    const fingerprint = buildEntryFingerprint(entry.date, entry.amount, entry.description);
    const duplicateInFile = localFingerprints.has(fingerprint);
    if (!duplicateInFile) localFingerprints.add(fingerprint);

    const type = transactionTypeFromAmount(entry.amount);
    const value = transactionValueFromAmount(entry.amount);
    const { start, end } = dayRange(entry.date);

    const duplicateTransaction = await prisma.transaction.findFirst({
      where: {
        userId,
        type,
        value: {
          gte: value - 0.01,
          lte: value + 0.01,
        },
        date: { gte: start, lt: end },
      },
      select: { id: true },
    });

    const possibleDuplicate = duplicateInFile || Boolean(duplicateTransaction);
    if (possibleDuplicate) possibleDuplicates += 1;

    await prisma.bankStatementEntry.create({
      data: {
        userId,
        importBatchId: batch.id,
        sourceType,
        date: new Date(entry.date),
        amount: roundMoney(entry.amount),
        description: String(entry.description ?? "").trim() || null,
        fitId: entry.fitId ? String(entry.fitId).slice(0, 120) : null,
        fingerprint,
        possibleDuplicate,
      },
    });

    createdRows += 1;
  }

  await writeAuditLog(prisma, {
    userId,
    entityType: "bankImport",
    entityId: batch.id,
    action: "created",
    metadata: {
      sourceType,
      fileName: fileName || null,
      rows: createdRows,
      possibleDuplicates,
    },
  });

  return {
    batchId: batch.id,
    sourceType,
    createdRows,
    possibleDuplicates,
  };
}

async function autoReconcileEntries(userId, limit = 200) {
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 200));
  const pendingEntries = await prisma.bankStatementEntry.findMany({
    where: {
      userId,
      status: "pending",
      matchedTransactionId: null,
    },
    orderBy: [{ date: "desc" }],
    take: safeLimit,
  });

  let reconciled = 0;
  const updates = [];

  for (const entry of pendingEntries) {
    const type = transactionTypeFromAmount(entry.amount);
    const value = transactionValueFromAmount(entry.amount);
    const baseDate = new Date(entry.date);
    const rangeStart = new Date(baseDate);
    rangeStart.setDate(rangeStart.getDate() - 2);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(baseDate);
    rangeEnd.setDate(rangeEnd.getDate() + 3);
    rangeEnd.setHours(0, 0, 0, 0);

    const candidates = await prisma.transaction.findMany({
      where: {
        userId,
        type,
        value: { gte: value - 0.01, lte: value + 0.01 },
        date: { gte: rangeStart, lt: rangeEnd },
        reconciledEntries: {
          none: { status: "reconciled" },
        },
      },
      orderBy: [{ date: "asc" }],
      take: 20,
    });

    let chosen = null;
    let bestScore = -1;
    for (const candidate of candidates) {
      const score = scoreDescriptionMatch(entry.description, candidate.description);
      if (score > bestScore) {
        bestScore = score;
        chosen = candidate;
      }
    }

    if (!chosen) continue;
    if (bestScore < 0.25 && normalizeText(entry.description)) continue;

    const updated = await prisma.bankStatementEntry.update({
      where: { id: entry.id },
      data: {
        matchedTransactionId: chosen.id,
        matchedAt: new Date(),
        status: "reconciled",
      },
      include: {
        matchedTransaction: true,
      },
    });

    updates.push(updated);
    reconciled += 1;
  }

  if (reconciled > 0) {
    await writeAuditLog(prisma, {
      userId,
      entityType: "reconciliation",
      entityId: "auto",
      action: "auto_reconciled",
      metadata: { reconciled, limit: safeLimit },
    });
  }

  return {
    checked: pendingEntries.length,
    reconciled,
    updatedEntries: updates,
  };
}

function toRecurringTransactionPayload(rule) {
  return {
    id: rule.id,
    userId: rule.userId,
    accountId: rule.accountId,
    categoryId: rule.categoryId,
    type: rule.type,
    value: roundMoney(rule.value),
    description: rule.description,
    frequency: rule.frequency,
    interval: rule.interval,
    dayOfMonth: rule.dayOfMonth,
    dayOfWeek: rule.dayOfWeek,
    startDate: rule.startDate,
    endDate: rule.endDate,
    nextRunAt: rule.nextRunAt,
    lastRunAt: rule.lastRunAt,
    installmentsTotal: rule.installmentsTotal,
    installmentsRemaining: rule.installmentsRemaining,
    active: rule.active,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
    accountName: rule.account?.name || null,
    categoryName: rule.category?.name || null,
  };
}

function toRecurringTransferPayload(rule) {
  return {
    id: rule.id,
    userId: rule.userId,
    fromAccountId: rule.fromAccountId,
    toAccountId: rule.toAccountId,
    amount: roundMoney(rule.amount),
    description: rule.description,
    frequency: rule.frequency,
    interval: rule.interval,
    startDate: rule.startDate,
    endDate: rule.endDate,
    nextRunAt: rule.nextRunAt,
    lastRunAt: rule.lastRunAt,
    active: rule.active,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
    fromAccountName: rule.fromAccount?.name || null,
    toAccountName: rule.toAccount?.name || null,
  };
}

function detectTransactionDuplicates(transactions) {
  const groups = new Map();
  for (const transaction of transactions) {
    const key = [
      transaction.type,
      Number(transaction.value).toFixed(2),
      dateOnlyKey(transaction.date),
      transaction.accountId,
      normalizeText(transaction.description).slice(0, 80),
    ].join("|");

    const current = groups.get(key) ?? [];
    current.push(transaction);
    groups.set(key, current);
  }

  return [...groups.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([groupKey, items]) => ({
      key: groupKey,
      count: items.length,
      transactionIds: items.map((item) => item.id),
      amount: roundMoney(items[0]?.value || 0),
      type: items[0]?.type || "expense",
      date: items[0]?.date || null,
      description: items[0]?.description || null,
      items: items.map((item) => ({
        id: item.id,
        type: item.type,
        value: roundMoney(item.value),
        date: item.date,
        description: item.description,
        accountId: item.accountId,
        categoryId: item.categoryId,
      })),
    }))
    .sort((a, b) => b.count - a.count);
}

// Perfil
app.get("/me", auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, name: true, email: true, createdAt: true },
    });
    if (!user) {
      return res.status(404).json({ error: "Usuario nao encontrado." });
    }
    return res.json(user);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Falha ao carregar perfil.", details: String(err) });
  }
});

app.put("/me", auth, async (req, res) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    const email = String(req.body?.email ?? "")
      .trim()
      .toLowerCase();

    if (!name) return res.status(400).json({ error: "Nome e obrigatorio." });
    if (!email) return res.status(400).json({ error: "Email e obrigatorio." });
    if (!isValidEmail(email)) return res.status(400).json({ error: "Email invalido." });

    const existingEmail = await prisma.user.findFirst({
      where: {
        email,
        id: { not: req.userId },
      },
      select: { id: true },
    });
    if (existingEmail) {
      return res.status(409).json({ error: "Ja existe uma conta com este email." });
    }

    const updated = await prisma.user.update({
      where: { id: req.userId },
      data: { name, email },
      select: { id: true, name: true, email: true, createdAt: true },
    });
    return res.json(updated);
  } catch (err) {
    if (err?.code === "P2002") {
      return res.status(409).json({ error: "Ja existe uma conta com este email." });
    }
    console.error(err);
    return res.status(500).json({ error: "Falha ao atualizar perfil.", details: String(err) });
  }
});

app.put("/me/password", auth, async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword ?? "");
    const newPassword = String(req.body?.newPassword ?? "");
    const confirmPassword = String(req.body?.confirmPassword ?? "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: "Preencha todos os campos de senha." });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "A nova senha deve ter pelo menos 6 caracteres." });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "As senhas nao coincidem." });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ error: "A nova senha deve ser diferente da atual." });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, password: true },
    });
    if (!user) return res.status(404).json({ error: "Usuario nao encontrado." });

    const currentMatches = await bcrypt.compare(currentPassword, user.password);
    if (!currentMatches) {
      return res.status(400).json({ error: "Senha atual invalida." });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.userId },
      data: { password: hash },
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Falha ao atualizar senha.", details: String(err) });
  }
});

app.delete("/me", auth, async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword ?? "");
    if (!currentPassword) {
      return res.status(400).json({ error: "Informe sua senha para excluir a conta." });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, password: true },
    });
    if (!user) return res.status(404).json({ error: "Usuario nao encontrado." });

    const currentMatches = await bcrypt.compare(currentPassword, user.password);
    if (!currentMatches) {
      return res.status(400).json({ error: "Senha atual invalida." });
    }

    await prisma.$transaction(async (tx) => {
      await tx.auditLog.deleteMany({ where: { userId: req.userId } });
      await tx.bankStatementEntry.deleteMany({ where: { userId: req.userId } });
      await tx.bankImportBatch.deleteMany({ where: { userId: req.userId } });
      await tx.transactionAttachment.deleteMany({ where: { userId: req.userId } });
      await tx.transactionTag.deleteMany({ where: { userId: req.userId } });
      await tx.transaction.deleteMany({ where: { userId: req.userId } });
      await tx.recurringTransaction.deleteMany({ where: { userId: req.userId } });
      await tx.recurringTransfer.deleteMany({ where: { userId: req.userId } });
      await tx.tag.deleteMany({ where: { userId: req.userId } });
      await tx.goal.deleteMany({ where: { userId: req.userId } });
      await tx.categoryBudget.deleteMany({ where: { userId: req.userId } });
      await tx.accountLimit.deleteMany({ where: { userId: req.userId } });
      await tx.annualBudget.deleteMany({ where: { userId: req.userId } });
      await tx.creditCardInvoice.deleteMany({ where: { userId: req.userId } });
      await tx.creditCard.deleteMany({ where: { userId: req.userId } });
      await tx.category.deleteMany({ where: { userId: req.userId } });
      await tx.account.deleteMany({ where: { userId: req.userId } });
      await tx.user.delete({ where: { id: req.userId } });
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Falha ao excluir conta.", details: String(err) });
  }
});

async function handleAiChat(req, res) {
  try {
    const provider = getAiProviderConfig();
    if (provider.name === "unsupported") {
      return res.status(500).json({
        error: "AI_PROVIDER invalido. Use 'groq' ou 'openai'.",
      });
    }

    if (!provider.apiKey) {
      return res.status(503).json({
        error: `Assistente IA indisponivel. Configure ${provider.apiKeyName} no backend.`,
      });
    }
    if (typeof fetch !== "function") {
      return res.status(500).json({ error: "Ambiente Node sem suporte a fetch." });
    }

    const messages = normalizeChatMessages(req.body?.messages);
    if (messages.length === 0) {
      return res.status(400).json({ error: "Envie pelo menos uma mensagem." });
    }

    const context = await buildUserFinanceSnapshot(req.userId);
    const systemPrompt = [
      "Voce e o Machado AI, assistente financeiro pessoal do usuario.",
      "Responda em portugues do Brasil, de forma clara e pratica.",
      "Use os dados de contexto para personalizar a resposta.",
      "Se faltar dado, diga isso explicitamente e sugira como coletar.",
      "Nao invente retornos garantidos ou previsoes certas de investimento.",
      "Sempre inclua riscos quando sugerir investimentos.",
      "Priorize passos objetivos em lista numerada quando fizer recomendacoes.",
      "Isto e educacional e nao substitui consultoria profissional.",
    ].join(" ");

    const chatMessages = [
      { role: "system", content: systemPrompt },
      {
        role: "system",
        content: `Contexto financeiro do usuario (JSON): ${JSON.stringify(context)}`,
      },
      ...messages,
    ];

    const providerResponse = await fetch(provider.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages: chatMessages,
        temperature: 0.4,
        max_tokens: 700,
      }),
    });

    const payload = await providerResponse.json().catch(() => ({}));
    if (!providerResponse.ok) {
      const providerStatus = Number(providerResponse.status) || 0;
      const providerCode = String(payload?.error?.code ?? "").trim();
      const providerMessage = String(payload?.error?.message ?? "").trim();

      console.error(`${provider.label} chat error:`, {
        status: providerStatus,
        code: providerCode,
        message: providerMessage,
      });

      if (providerStatus === 401) {
        return res.status(503).json({
          error: `${provider.apiKeyName} invalida ou sem permissao para este projeto.`,
        });
      }

      if (providerStatus === 404) {
        return res.status(503).json({
          error: `Modelo de IA '${provider.model}' nao encontrado em ${provider.label}.`,
        });
      }

      if (providerStatus === 429) {
        return res.status(503).json({
          error: `Limite da ${provider.label} atingido. Verifique plano/uso e tente novamente.`,
        });
      }

      if (providerMessage) {
        return res.status(502).json({ error: `Falha ${provider.label}: ${providerMessage}` });
      }

      return res
        .status(502)
        .json({ error: `Nao foi possivel consultar a ${provider.label} no momento.` });
    }

    const reply = extractAssistantReply(payload);
    if (!reply) {
      return res.status(502).json({ error: "A IA retornou uma resposta vazia." });
    }

    return res.json({
      reply,
      provider: provider.name,
      model: provider.model,
      contextGeneratedAt: context.generatedAt,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Falha ao processar chat com IA.", details: String(err) });
  }
}

app.post("/ai/chat", auth, handleAiChat);
app.post("/api/ai/chat", auth, handleAiChat);

// Orcamentos
app.get("/budgets/overview", auth, async (req, res) => {
  try {
    const current = currentYearMonth();
    const year = parseBudgetYear(req.query?.year, current.year);
    const month = parseBudgetMonth(req.query?.month, current.month);
    const historyMonths = parseHistoryMonths(req.query?.months, 12);

    const overview = await buildBudgetOverview(req.userId, year, month, historyMonths);
    return res.json(overview);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao carregar visao geral de orcamento.",
      details: String(err),
    });
  }
});

app.get("/budgets/categories", auth, async (req, res) => {
  try {
    const current = currentYearMonth();
    const year = parseBudgetYear(req.query?.year, current.year);
    const month = parseBudgetMonth(req.query?.month, current.month);
    const overview = await buildBudgetOverview(req.userId, year, month, 12);
    return res.json({
      year,
      month,
      items: overview.categoryProgress,
      alerts: overview.alerts.filter((item) => item.kind === "category"),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao carregar orcamentos por categoria.",
      details: String(err),
    });
  }
});

app.post("/budgets/categories", auth, async (req, res) => {
  try {
    const categoryId = parseId(req.body?.categoryId);
    const year = parseBudgetYear(req.body?.year);
    const month = parseBudgetMonth(req.body?.month);
    const amount = parsePositiveAmount(req.body?.amount);
    const alertPercent = parseAlertPercent(req.body?.alertPercent, 80);

    if (!categoryId) return res.status(400).json({ error: "categoryId invalido." });
    if (!year) return res.status(400).json({ error: "year invalido." });
    if (!month) return res.status(400).json({ error: "month invalido." });
    if (!amount) return res.status(400).json({ error: "amount deve ser positivo." });
    if (alertPercent === null) {
      return res.status(400).json({ error: "alertPercent deve estar entre 1 e 100." });
    }

    const category = await prisma.category.findFirst({
      where: { id: categoryId, userId: req.userId },
      select: { id: true, type: true },
    });
    if (!category) {
      return res.status(404).json({ error: "Categoria nao encontrada." });
    }
    if (category.type !== "expense") {
      return res.status(400).json({ error: "Orcamento por categoria aceita apenas tipo despesa." });
    }

    const saved = await prisma.categoryBudget.upsert({
      where: {
        userId_categoryId_year_month: { userId: req.userId, categoryId, year, month },
      },
      create: {
        userId: req.userId,
        categoryId,
        year,
        month,
        amount,
        alertPercent,
      },
      update: {
        amount,
        alertPercent,
      },
      include: {
        category: {
          select: { id: true, name: true, color: true, type: true },
        },
      },
    });

    return res.json(saved);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao salvar orcamento por categoria.",
      details: String(err),
    });
  }
});

app.put("/budgets/categories/:id", auth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "id invalido." });

    const existing = await prisma.categoryBudget.findFirst({
      where: { id, userId: req.userId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "Orcamento nao encontrado." });

    const data = {};
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "amount")) {
      const amount = parsePositiveAmount(req.body?.amount);
      if (!amount) return res.status(400).json({ error: "amount deve ser positivo." });
      data.amount = amount;
    }
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "alertPercent")) {
      const alertPercent = parseAlertPercent(req.body?.alertPercent);
      if (alertPercent === null) {
        return res.status(400).json({ error: "alertPercent deve estar entre 1 e 100." });
      }
      data.alertPercent = alertPercent;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "Envie amount e/ou alertPercent para atualizar." });
    }

    const updated = await prisma.categoryBudget.update({
      where: { id },
      data,
      include: {
        category: {
          select: { id: true, name: true, color: true, type: true },
        },
      },
    });
    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao atualizar orcamento por categoria.",
      details: String(err),
    });
  }
});

app.delete("/budgets/categories/:id", auth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "id invalido." });

    const existing = await prisma.categoryBudget.findFirst({
      where: { id, userId: req.userId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "Orcamento nao encontrado." });

    await prisma.categoryBudget.delete({ where: { id } });
    return res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao excluir orcamento por categoria.",
      details: String(err),
    });
  }
});

app.get("/budgets/annual", auth, async (req, res) => {
  try {
    const current = currentYearMonth();
    const year = parseBudgetYear(req.query?.year, current.year);
    const { start, end } = getYearRange(year);

    const [budget, realized] = await Promise.all([
      prisma.annualBudget.findUnique({
        where: { userId_year: { userId: req.userId, year } },
      }),
      prisma.transaction.aggregate({
        where: {
          userId: req.userId,
          type: "expense",
          date: { gte: start, lt: end },
        },
        _sum: { value: true },
      }),
    ]);

    const plannedAmount = Number(budget?.amount) || 0;
    const realizedAmount = Number(realized?._sum?.value) || 0;
    const progressPercent = toProgressPercent(realizedAmount, plannedAmount);
    const alertPercent = Number(budget?.alertPercent) || 80;

    return res.json({
      id: budget?.id ?? null,
      year,
      plannedAmount: roundMoney(plannedAmount),
      realizedAmount: roundMoney(realizedAmount),
      differenceAmount: roundMoney(plannedAmount - realizedAmount),
      progressPercent: roundMoney(progressPercent),
      alertPercent: budget ? alertPercent : null,
      alertTriggered: plannedAmount > 0 && progressPercent >= alertPercent,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao carregar orcamento anual.",
      details: String(err),
    });
  }
});

app.post("/budgets/annual", auth, async (req, res) => {
  try {
    const year = parseBudgetYear(req.body?.year);
    const amount = parsePositiveAmount(req.body?.amount);
    const alertPercent = parseAlertPercent(req.body?.alertPercent, 80);

    if (!year) return res.status(400).json({ error: "year invalido." });
    if (!amount) return res.status(400).json({ error: "amount deve ser positivo." });
    if (alertPercent === null) {
      return res.status(400).json({ error: "alertPercent deve estar entre 1 e 100." });
    }

    const saved = await prisma.annualBudget.upsert({
      where: { userId_year: { userId: req.userId, year } },
      create: {
        userId: req.userId,
        year,
        amount,
        alertPercent,
      },
      update: {
        amount,
        alertPercent,
      },
    });
    return res.json(saved);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao salvar orcamento anual.",
      details: String(err),
    });
  }
});

app.put("/budgets/annual/:id", auth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "id invalido." });

    const existing = await prisma.annualBudget.findFirst({
      where: { id, userId: req.userId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "Orcamento anual nao encontrado." });

    const data = {};
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "amount")) {
      const amount = parsePositiveAmount(req.body?.amount);
      if (!amount) return res.status(400).json({ error: "amount deve ser positivo." });
      data.amount = amount;
    }
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "alertPercent")) {
      const alertPercent = parseAlertPercent(req.body?.alertPercent);
      if (alertPercent === null) {
        return res.status(400).json({ error: "alertPercent deve estar entre 1 e 100." });
      }
      data.alertPercent = alertPercent;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "Envie amount e/ou alertPercent para atualizar." });
    }

    const updated = await prisma.annualBudget.update({
      where: { id },
      data,
    });
    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao atualizar orcamento anual.",
      details: String(err),
    });
  }
});

app.delete("/budgets/annual/:id", auth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "id invalido." });

    const existing = await prisma.annualBudget.findFirst({
      where: { id, userId: req.userId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "Orcamento anual nao encontrado." });

    await prisma.annualBudget.delete({ where: { id } });
    return res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao excluir orcamento anual.",
      details: String(err),
    });
  }
});

app.get("/budgets/accounts", auth, async (req, res) => {
  try {
    const current = currentYearMonth();
    const year = parseBudgetYear(req.query?.year, current.year);
    const month = parseBudgetMonth(req.query?.month, current.month);
    const overview = await buildBudgetOverview(req.userId, year, month, 12);
    return res.json({
      year,
      month,
      items: overview.accountLimitProgress,
      alerts: overview.alerts.filter((item) => item.kind === "account"),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao carregar limites por conta.",
      details: String(err),
    });
  }
});

app.post("/budgets/accounts", auth, async (req, res) => {
  try {
    const accountId = parseId(req.body?.accountId);
    const monthlyLimit = parsePositiveAmount(req.body?.monthlyLimit);
    const alertPercent = parseAlertPercent(req.body?.alertPercent, 80);

    if (!accountId) return res.status(400).json({ error: "accountId invalido." });
    if (!monthlyLimit) {
      return res.status(400).json({ error: "monthlyLimit deve ser positivo." });
    }
    if (alertPercent === null) {
      return res.status(400).json({ error: "alertPercent deve estar entre 1 e 100." });
    }

    const account = await prisma.account.findFirst({
      where: { id: accountId, userId: req.userId },
      select: { id: true },
    });
    if (!account) return res.status(404).json({ error: "Conta nao encontrada." });

    const saved = await prisma.accountLimit.upsert({
      where: { userId_accountId: { userId: req.userId, accountId } },
      create: {
        userId: req.userId,
        accountId,
        monthlyLimit,
        alertPercent,
      },
      update: {
        monthlyLimit,
        alertPercent,
      },
      include: {
        account: {
          select: { id: true, name: true, type: true, balance: true },
        },
      },
    });
    return res.json(saved);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao salvar limite por conta.",
      details: String(err),
    });
  }
});

app.put("/budgets/accounts/:id", auth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "id invalido." });

    const existing = await prisma.accountLimit.findFirst({
      where: { id, userId: req.userId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "Limite por conta nao encontrado." });

    const data = {};
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "monthlyLimit")) {
      const monthlyLimit = parsePositiveAmount(req.body?.monthlyLimit);
      if (!monthlyLimit) {
        return res.status(400).json({ error: "monthlyLimit deve ser positivo." });
      }
      data.monthlyLimit = monthlyLimit;
    }
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "alertPercent")) {
      const alertPercent = parseAlertPercent(req.body?.alertPercent);
      if (alertPercent === null) {
        return res.status(400).json({ error: "alertPercent deve estar entre 1 e 100." });
      }
      data.alertPercent = alertPercent;
    }

    if (Object.keys(data).length === 0) {
      return res
        .status(400)
        .json({ error: "Envie monthlyLimit e/ou alertPercent para atualizar." });
    }

    const updated = await prisma.accountLimit.update({
      where: { id },
      data,
      include: {
        account: {
          select: { id: true, name: true, type: true, balance: true },
        },
      },
    });
    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao atualizar limite por conta.",
      details: String(err),
    });
  }
});

app.delete("/budgets/accounts/:id", auth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "id invalido." });

    const existing = await prisma.accountLimit.findFirst({
      where: { id, userId: req.userId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "Limite por conta nao encontrado." });

    await prisma.accountLimit.delete({ where: { id } });
    return res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao excluir limite por conta.",
      details: String(err),
    });
  }
});

// Cartoes de credito
app.get("/credit-cards", auth, async (req, res) => {
  try {
    const overview = await buildCreditCardsOverview(req.userId);
    return res.json(overview);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao carregar cartoes de credito.",
      details: String(err),
    });
  }
});

app.post("/credit-cards", auth, async (req, res) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    const totalLimit = parsePositiveAmount(req.body?.totalLimit);
    const bestPurchaseDay = parseDayOfMonth(req.body?.bestPurchaseDay);
    const closingDay = parseDayOfMonth(req.body?.closingDay);
    const autoInstallmentsProvided = Object.prototype.hasOwnProperty.call(
      req.body ?? {},
      "autoInstallments",
    );
    if (autoInstallmentsProvided && typeof req.body?.autoInstallments !== "boolean") {
      return res.status(400).json({ error: "autoInstallments deve ser true ou false." });
    }
    const autoInstallments = autoInstallmentsProvided ? req.body.autoInstallments : true;

    if (!name) return res.status(400).json({ error: "name e obrigatorio." });
    if (!totalLimit) return res.status(400).json({ error: "totalLimit deve ser positivo." });
    if (!bestPurchaseDay) {
      return res.status(400).json({ error: "bestPurchaseDay deve estar entre 1 e 31." });
    }
    if (!closingDay) {
      return res.status(400).json({ error: "closingDay deve estar entre 1 e 31." });
    }

    const created = await prisma.creditCard.create({
      data: {
        name,
        totalLimit,
        bestPurchaseDay,
        closingDay,
        autoInstallments,
        userId: req.userId,
      },
    });

    return res.status(201).json(toCreditCardPayload(created, []));
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao cadastrar cartao de credito.",
      details: String(err),
    });
  }
});

app.post("/credit-cards/simulate-impact", auth, async (req, res) => {
  try {
    const cardId = parseId(req.body?.cardId);
    const invoiceId = parseId(req.body?.invoiceId);
    const paymentFieldProvided = Object.prototype.hasOwnProperty.call(
      req.body ?? {},
      "paymentAmount",
    );
    const parsedPaymentAmount = parseNonNegativeAmount(req.body?.paymentAmount, null);

    if (paymentFieldProvided && parsedPaymentAmount === null) {
      return res.status(400).json({ error: "paymentAmount deve ser um numero maior ou igual a zero." });
    }

    let targetedInvoice = null;

    if (invoiceId) {
      targetedInvoice = await prisma.creditCardInvoice.findFirst({
        where: {
          id: invoiceId,
          userId: req.userId,
          ...(cardId ? { creditCardId: cardId } : {}),
        },
        include: {
          creditCard: {
            select: { id: true, name: true },
          },
        },
      });

      if (!targetedInvoice) {
        return res.status(404).json({ error: "Fatura nao encontrada para simulacao." });
      }
    } else if (cardId) {
      const year = parseBudgetYear(req.body?.year);
      const month = parseBudgetMonth(req.body?.month);
      if (year && month) {
        targetedInvoice = await prisma.creditCardInvoice.findFirst({
          where: {
            userId: req.userId,
            creditCardId: cardId,
            year,
            month,
          },
          include: {
            creditCard: {
              select: { id: true, name: true },
            },
          },
        });
      }
    }

    const targetedSummary = targetedInvoice
      ? summarizeInvoiceAmounts(targetedInvoice.totalAmount, targetedInvoice.paidAmount)
      : null;

    let paymentAmount = parsedPaymentAmount;
    if (paymentAmount === null) {
      if (!targetedSummary) {
        return res.status(400).json({
          error: "Informe paymentAmount ou selecione uma fatura para simular impacto.",
        });
      }
      paymentAmount = targetedSummary.outstandingAmount;
    }

    if (targetedSummary) {
      paymentAmount = Math.min(paymentAmount, targetedSummary.outstandingAmount);
    }

    const [cashBalanceAggregate, invoices] = await Promise.all([
      prisma.account.aggregate({
        where: {
          userId: req.userId,
          NOT: { type: "credit" },
        },
        _sum: { balance: true },
      }),
      prisma.creditCardInvoice.findMany({
        where: { userId: req.userId },
        select: { totalAmount: true, paidAmount: true },
      }),
    ]);

    let totalOutstanding = 0;
    for (const invoice of invoices) {
      totalOutstanding += summarizeInvoiceAmounts(invoice.totalAmount, invoice.paidAmount).outstandingAmount;
    }

    const cashBalance = roundMoney(Number(cashBalanceAggregate?._sum?.balance) || 0);
    const normalizedPayment = roundMoney(Math.max(0, paymentAmount));
    const impactPercent =
      cashBalance > 0 ? roundMoney((normalizedPayment / cashBalance) * 100) : null;

    return res.json({
      paymentAmount: normalizedPayment,
      cashBalance,
      cashAfterPayment: roundMoney(cashBalance - normalizedPayment),
      impactPercent,
      outstandingBeforePayment: roundMoney(totalOutstanding),
      outstandingAfterPayment: roundMoney(Math.max(0, totalOutstanding - normalizedPayment)),
      targetedInvoice: targetedInvoice
        ? {
            id: targetedInvoice.id,
            creditCardId: targetedInvoice.creditCardId,
            creditCardName: targetedInvoice.creditCard?.name || `Cartao ${targetedInvoice.creditCardId}`,
            year: targetedInvoice.year,
            month: targetedInvoice.month,
            monthKey: toMonthKey(targetedInvoice.year, targetedInvoice.month),
            totalAmount: targetedSummary.totalAmount,
            paidAmount: targetedSummary.paidAmount,
            outstandingAmount: targetedSummary.outstandingAmount,
            status: targetedSummary.status,
          }
        : null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao simular impacto da fatura no fluxo.",
      details: String(err),
    });
  }
});

app.put("/credit-cards/:id", auth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "id invalido." });

    const existing = await prisma.creditCard.findFirst({
      where: { id, userId: req.userId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "Cartao nao encontrado." });

    const data = {};
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "name")) {
      const name = String(req.body?.name ?? "").trim();
      if (!name) return res.status(400).json({ error: "name e obrigatorio." });
      data.name = name;
    }
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "totalLimit")) {
      const totalLimit = parsePositiveAmount(req.body?.totalLimit);
      if (!totalLimit) {
        return res.status(400).json({ error: "totalLimit deve ser positivo." });
      }
      data.totalLimit = totalLimit;
    }
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "bestPurchaseDay")) {
      const bestPurchaseDay = parseDayOfMonth(req.body?.bestPurchaseDay);
      if (!bestPurchaseDay) {
        return res.status(400).json({ error: "bestPurchaseDay deve estar entre 1 e 31." });
      }
      data.bestPurchaseDay = bestPurchaseDay;
    }
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "closingDay")) {
      const closingDay = parseDayOfMonth(req.body?.closingDay);
      if (!closingDay) {
        return res.status(400).json({ error: "closingDay deve estar entre 1 e 31." });
      }
      data.closingDay = closingDay;
    }
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "autoInstallments")) {
      if (typeof req.body?.autoInstallments !== "boolean") {
        return res.status(400).json({ error: "autoInstallments deve ser true ou false." });
      }
      data.autoInstallments = req.body.autoInstallments;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "Nenhum campo valido enviado para atualizacao." });
    }

    const updated = await prisma.creditCard.update({
      where: { id },
      data,
    });
    const invoices = await prisma.creditCardInvoice.findMany({
      where: { userId: req.userId, creditCardId: id },
      select: { id: true, totalAmount: true, paidAmount: true },
    });

    return res.json(toCreditCardPayload(updated, invoices));
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao atualizar cartao de credito.",
      details: String(err),
    });
  }
});

app.delete("/credit-cards/:id", auth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "id invalido." });

    const existing = await prisma.creditCard.findFirst({
      where: { id, userId: req.userId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "Cartao nao encontrado." });

    await prisma.$transaction(async (tx) => {
      await tx.creditCardInvoice.deleteMany({
        where: { userId: req.userId, creditCardId: id },
      });
      await tx.creditCard.delete({ where: { id } });
    });

    return res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao excluir cartao de credito.",
      details: String(err),
    });
  }
});

app.get("/credit-cards/:id/invoices", auth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "id invalido." });

    const card = await prisma.creditCard.findFirst({
      where: { id, userId: req.userId },
      select: { id: true, name: true, closingDay: true },
    });
    if (!card) return res.status(404).json({ error: "Cartao nao encontrado." });

    const months = parseHistoryMonths(req.query?.months, 24);
    const items = await listCreditCardInvoices(req.userId, id, months);

    const summary = items.reduce(
      (acc, item) => {
        acc.totalAmount += item.totalAmount;
        acc.paidAmount += item.paidAmount;
        acc.outstandingAmount += item.outstandingAmount;
        if (item.status === "paid") acc.paidInvoices += 1;
        else acc.openInvoices += 1;
        return acc;
      },
      {
        totalAmount: 0,
        paidAmount: 0,
        outstandingAmount: 0,
        openInvoices: 0,
        paidInvoices: 0,
      },
    );

    return res.json({
      card: {
        id: card.id,
        name: card.name,
        closingDay: card.closingDay,
      },
      summary: {
        totalAmount: roundMoney(summary.totalAmount),
        paidAmount: roundMoney(summary.paidAmount),
        outstandingAmount: roundMoney(summary.outstandingAmount),
        openInvoices: summary.openInvoices,
        paidInvoices: summary.paidInvoices,
      },
      items,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao carregar faturas do cartao.",
      details: String(err),
    });
  }
});

app.post("/credit-cards/:id/invoices", auth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "id invalido." });

    const card = await prisma.creditCard.findFirst({
      where: { id, userId: req.userId },
      select: { id: true, closingDay: true },
    });
    if (!card) return res.status(404).json({ error: "Cartao nao encontrado." });

    const year = parseBudgetYear(req.body?.year);
    const month = parseBudgetMonth(req.body?.month);
    const totalAmount = parseNonNegativeAmount(req.body?.totalAmount);
    const paidAmount = parseNonNegativeAmount(req.body?.paidAmount, 0);

    if (!year) return res.status(400).json({ error: "year invalido." });
    if (!month) return res.status(400).json({ error: "month invalido." });
    if (totalAmount === null) {
      return res.status(400).json({ error: "totalAmount deve ser um numero maior ou igual a zero." });
    }
    if (paidAmount === null) {
      return res.status(400).json({ error: "paidAmount deve ser um numero maior ou igual a zero." });
    }
    if (paidAmount > totalAmount) {
      return res.status(400).json({ error: "paidAmount nao pode ser maior que totalAmount." });
    }

    let closingDate = monthClosingDate(year, month, card.closingDay);
    if (
      Object.prototype.hasOwnProperty.call(req.body ?? {}, "closingDate") &&
      req.body?.closingDate !== null &&
      req.body?.closingDate !== ""
    ) {
      const parsed = new Date(req.body.closingDate);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ error: "closingDate invalida." });
      }
      closingDate = parsed;
    }

    const saved = await prisma.creditCardInvoice.upsert({
      where: {
        userId_creditCardId_year_month: {
          userId: req.userId,
          creditCardId: id,
          year,
          month,
        },
      },
      create: {
        userId: req.userId,
        creditCardId: id,
        year,
        month,
        totalAmount,
        paidAmount,
        closingDate,
      },
      update: {
        totalAmount,
        paidAmount,
        closingDate,
      },
    });

    return res.json(toCreditCardInvoicePayload(saved));
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao salvar fatura do cartao.",
      details: String(err),
    });
  }
});

app.put("/credit-cards/:id/invoices/:invoiceId/payment", auth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const invoiceId = parseId(req.params.invoiceId);
    if (!id || !invoiceId) return res.status(400).json({ error: "id invalido." });

    const amount = parsePositiveAmount(req.body?.amount);
    if (!amount) return res.status(400).json({ error: "amount deve ser positivo." });

    const invoice = await prisma.creditCardInvoice.findFirst({
      where: { id: invoiceId, userId: req.userId, creditCardId: id },
    });
    if (!invoice) return res.status(404).json({ error: "Fatura nao encontrada." });

    const summary = summarizeInvoiceAmounts(invoice.totalAmount, invoice.paidAmount);
    if (summary.outstandingAmount <= 0) {
      return res.status(409).json({ error: "A fatura ja esta totalmente paga." });
    }

    const appliedAmount = Math.min(amount, summary.outstandingAmount);
    const updated = await prisma.creditCardInvoice.update({
      where: { id: invoice.id },
      data: {
        paidAmount: { increment: appliedAmount },
      },
    });

    return res.json({
      requestedAmount: roundMoney(amount),
      appliedAmount: roundMoney(appliedAmount),
      invoice: toCreditCardInvoicePayload(updated),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao registrar pagamento da fatura.",
      details: String(err),
    });
  }
});

app.post("/credit-cards/:id/installments", auth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "id invalido." });

    const card = await prisma.creditCard.findFirst({
      where: { id, userId: req.userId },
      select: {
        id: true,
        name: true,
        closingDay: true,
        autoInstallments: true,
      },
    });
    if (!card) return res.status(404).json({ error: "Cartao nao encontrado." });
    if (!card.autoInstallments) {
      return res
        .status(409)
        .json({ error: "Parcelamento automatico desativado para este cartao." });
    }

    const totalAmount = parsePositiveAmount(req.body?.totalAmount);
    const installments = Number(req.body?.installments);
    const current = currentYearMonth();
    const startYear = parseBudgetYear(req.body?.startYear, current.year);
    const startMonth = parseBudgetMonth(req.body?.startMonth, current.month);
    const description = String(req.body?.description ?? "").trim();

    if (!totalAmount) return res.status(400).json({ error: "totalAmount deve ser positivo." });
    if (!Number.isInteger(installments) || installments < 2 || installments > 48) {
      return res.status(400).json({ error: "installments deve ser um inteiro entre 2 e 48." });
    }
    if (!startYear || !startMonth) {
      return res.status(400).json({ error: "startYear/startMonth invalidos." });
    }

    const installmentValues = splitInstallments(totalAmount, installments);
    const scheduled = [];

    await prisma.$transaction(async (tx) => {
      for (let index = 0; index < installmentValues.length; index += 1) {
        const installmentAmount = installmentValues[index];
        const period = shiftYearMonth(startYear, startMonth, index);
        const closingDate = monthClosingDate(period.year, period.month, card.closingDay);

        await tx.creditCardInvoice.upsert({
          where: {
            userId_creditCardId_year_month: {
              userId: req.userId,
              creditCardId: id,
              year: period.year,
              month: period.month,
            },
          },
          create: {
            userId: req.userId,
            creditCardId: id,
            year: period.year,
            month: period.month,
            totalAmount: installmentAmount,
            paidAmount: 0,
            closingDate,
          },
          update: {
            totalAmount: { increment: installmentAmount },
            closingDate,
          },
        });

        scheduled.push({
          installmentNumber: index + 1,
          installments,
          amount: roundMoney(installmentAmount),
          year: period.year,
          month: period.month,
          monthKey: toMonthKey(period.year, period.month),
        });
      }
    });

    return res.json({
      ok: true,
      cardId: card.id,
      cardName: card.name,
      description: description || null,
      totalAmount: roundMoney(totalAmount),
      installments,
      startYear,
      startMonth,
      startMonthKey: toMonthKey(startYear, startMonth),
      schedule: scheduled,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao aplicar parcelamento automatico.",
      details: String(err),
    });
  }
});

// Tags
app.get("/tags", auth, async (req, res) => {
  try {
    const tags = await prisma.tag.findMany({
      where: { userId: req.userId },
      orderBy: [{ name: "asc" }],
    });
    return res.json(tags.map((tag) => toTagPayload(tag)));
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao listar tags.",
      details: String(err),
    });
  }
});

app.post("/tags", auth, async (req, res) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    const color = String(req.body?.color ?? "#64748b").trim() || "#64748b";
    if (!name) return res.status(400).json({ error: "name e obrigatorio." });

    const created = await prisma.tag.create({
      data: {
        userId: req.userId,
        name: name.slice(0, 40),
        color: color.slice(0, 20),
      },
    });

    await writeAuditLog(prisma, {
      userId: req.userId,
      entityType: "tag",
      entityId: created.id,
      action: "created",
      afterData: toTagPayload(created),
    });

    return res.status(201).json(toTagPayload(created));
  } catch (err) {
    if (err?.code === "P2002") {
      return res.status(409).json({ error: "Ja existe uma tag com esse nome." });
    }
    console.error(err);
    return res.status(500).json({
      error: "Falha ao criar tag.",
      details: String(err),
    });
  }
});

app.put("/tags/:id", auth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "id invalido." });

    const existing = await prisma.tag.findFirst({
      where: { id, userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: "Tag nao encontrada." });

    const name = String(req.body?.name ?? existing.name).trim();
    const color = String(req.body?.color ?? existing.color).trim() || existing.color;
    if (!name) return res.status(400).json({ error: "name e obrigatorio." });

    const updated = await prisma.tag.update({
      where: { id },
      data: {
        name: name.slice(0, 40),
        color: color.slice(0, 20),
      },
    });

    await writeAuditLog(prisma, {
      userId: req.userId,
      entityType: "tag",
      entityId: updated.id,
      action: "updated",
      beforeData: toTagPayload(existing),
      afterData: toTagPayload(updated),
    });

    return res.json(toTagPayload(updated));
  } catch (err) {
    if (err?.code === "P2002") {
      return res.status(409).json({ error: "Ja existe uma tag com esse nome." });
    }
    console.error(err);
    return res.status(500).json({
      error: "Falha ao atualizar tag.",
      details: String(err),
    });
  }
});

app.delete("/tags/:id", auth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "id invalido." });

    const existing = await prisma.tag.findFirst({
      where: { id, userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: "Tag nao encontrada." });

    await prisma.transactionTag.deleteMany({
      where: { userId: req.userId, tagId: id },
    });
    await prisma.tag.delete({ where: { id } });

    await writeAuditLog(prisma, {
      userId: req.userId,
      entityType: "tag",
      entityId: id,
      action: "deleted",
      beforeData: toTagPayload(existing),
    });

    return res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao excluir tag.",
      details: String(err),
    });
  }
});

app.put("/transactions/:id/tags", auth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "id invalido." });

    const existing = await prisma.transaction.findFirst({
      where: { id, userId: req.userId },
      select: { id: true, type: true, value: true, description: true, date: true },
    });
    if (!existing) return res.status(404).json({ error: "Transacao nao encontrada." });

    const tagNames = parseTagNames(req.body?.tags);
    await prisma.$transaction(async (tx) => {
      await replaceTransactionTags(tx, req.userId, id, tagNames);
    });

    const loaded = await loadTransactionOrFail(req.userId, id);
    await writeAuditLog(prisma, {
      userId: req.userId,
      transactionId: id,
      entityType: "transaction",
      entityId: id,
      action: "tags_updated",
      beforeData: existing,
      afterData: {
        tags: loaded.tags,
      },
    });

    return res.json(toTransactionPayload(loaded));
  } catch (err) {
    if (err?.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error(err);
    return res.status(500).json({
      error: "Falha ao atualizar tags da transacao.",
      details: String(err),
    });
  }
});

// Anexos de comprovante
app.post("/transactions/:id/attachments", auth, async (req, res) => {
  try {
    const transactionId = parseId(req.params.id);
    if (!transactionId) return res.status(400).json({ error: "id invalido." });

    const transaction = await prisma.transaction.findFirst({
      where: { id: transactionId, userId: req.userId },
      select: { id: true },
    });
    if (!transaction) {
      return res.status(404).json({ error: "Transacao nao encontrada." });
    }

    const attachment = parseAttachmentPayload(req.body);
    if (!attachment) {
      return res.status(400).json({
        error: `Anexo invalido. Tamanho maximo: ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB.`,
      });
    }

    const created = await prisma.transactionAttachment.create({
      data: {
        transactionId,
        userId: req.userId,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        contentBase64: attachment.contentBase64,
      },
      select: {
        id: true,
        transactionId: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
    });

    await writeAuditLog(prisma, {
      userId: req.userId,
      transactionId,
      entityType: "transactionAttachment",
      entityId: created.id,
      action: "created",
      afterData: created,
    });

    return res.status(201).json(created);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao anexar comprovante.",
      details: String(err),
    });
  }
});

app.get("/transactions/:id/attachments/:attachmentId", auth, async (req, res) => {
  try {
    const transactionId = parseId(req.params.id);
    const attachmentId = parseId(req.params.attachmentId);
    if (!transactionId || !attachmentId) {
      return res.status(400).json({ error: "id invalido." });
    }

    const attachment = await prisma.transactionAttachment.findFirst({
      where: {
        id: attachmentId,
        transactionId,
        userId: req.userId,
      },
      select: {
        id: true,
        transactionId: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        contentBase64: true,
        createdAt: true,
      },
    });

    if (!attachment) {
      return res.status(404).json({ error: "Anexo nao encontrado." });
    }

    return res.json(attachment);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao carregar anexo.",
      details: String(err),
    });
  }
});

app.delete("/transactions/:id/attachments/:attachmentId", auth, async (req, res) => {
  try {
    const transactionId = parseId(req.params.id);
    const attachmentId = parseId(req.params.attachmentId);
    if (!transactionId || !attachmentId) {
      return res.status(400).json({ error: "id invalido." });
    }

    const attachment = await prisma.transactionAttachment.findFirst({
      where: {
        id: attachmentId,
        transactionId,
        userId: req.userId,
      },
    });
    if (!attachment) {
      return res.status(404).json({ error: "Anexo nao encontrado." });
    }

    await prisma.transactionAttachment.delete({ where: { id: attachmentId } });

    await writeAuditLog(prisma, {
      userId: req.userId,
      transactionId,
      entityType: "transactionAttachment",
      entityId: attachmentId,
      action: "deleted",
      beforeData: {
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
      },
    });

    return res.json({ ok: true, id: attachmentId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao remover anexo.",
      details: String(err),
    });
  }
});

// Transacoes recorrentes automaticas
app.get("/transactions/recurring", auth, async (req, res) => {
  try {
    const rules = await prisma.recurringTransaction.findMany({
      where: { userId: req.userId },
      include: {
        account: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
      orderBy: [{ active: "desc" }, { nextRunAt: "asc" }],
    });
    return res.json(rules.map((rule) => toRecurringTransactionPayload(rule)));
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao listar recorrencias de transacao.",
      details: String(err),
    });
  }
});

app.post("/transactions/recurring", auth, async (req, res) => {
  try {
    const type = String(req.body?.type ?? "expense");
    if (!isTransactionType(type)) {
      return res.status(400).json({ error: "type deve ser income ou expense." });
    }

    const value = parsePositiveAmount(req.body?.value);
    if (!value) return res.status(400).json({ error: "value deve ser positivo." });

    const accountId = parseId(req.body?.accountId);
    const categoryId = parseId(req.body?.categoryId);
    if (!accountId || !categoryId) {
      return res.status(400).json({ error: "accountId e categoryId sao obrigatorios." });
    }

    const [account, category] = await Promise.all([
      prisma.account.findFirst({ where: { id: accountId, userId: req.userId } }),
      prisma.category.findFirst({ where: { id: categoryId, userId: req.userId } }),
    ]);
    if (!account || !category) {
      return res.status(404).json({ error: "Conta ou categoria nao encontrada." });
    }
    if (String(category.type) !== type) {
      return res.status(400).json({
        error: "Tipo da categoria deve combinar com tipo da transacao.",
      });
    }

    const rawFrequency = normalizeText(req.body?.frequency || "monthly");
    if (!RECURRING_FREQUENCIES.has(rawFrequency)) {
      return res.status(400).json({ error: "frequency invalida." });
    }
    const frequency = parseRecurringFrequency(rawFrequency, "monthly");
    const interval = parsePositiveInt(req.body?.interval, 1, 1, 120);
    const startDate = parseIsoDate(req.body?.startDate, new Date());
    const endDate = parseIsoDate(req.body?.endDate, null);
    if (endDate && startDate > endDate) {
      return res.status(400).json({ error: "endDate deve ser maior que startDate." });
    }

    const dayOfMonth =
      frequency === "monthly" || frequency === "yearly"
        ? parseDayOfMonth(req.body?.dayOfMonth, startDate.getDate())
        : null;
    const dayOfWeek = frequency === "weekly" ? parseDayOfWeek(req.body?.dayOfWeek, null) : null;
    const description = String(req.body?.description ?? "").trim() || null;

    const installmentsTotal =
      req.body?.installmentsTotal === undefined || req.body?.installmentsTotal === null
        ? null
        : parsePositiveInt(req.body?.installmentsTotal, null, 1, 360);
    const installmentsRemaining =
      installmentsTotal === null
        ? null
        : parsePositiveInt(req.body?.installmentsRemaining, installmentsTotal, 0, 360);
    if (
      req.body?.installmentsTotal !== undefined &&
      req.body?.installmentsTotal !== null &&
      !installmentsTotal
    ) {
      return res.status(400).json({ error: "installmentsTotal invalido." });
    }

    let nextRunAt = alignDateForRule(startDate, frequency, dayOfMonth, dayOfWeek);
    const now = new Date();
    let guard = 0;
    while (nextRunAt < now && guard < 120) {
      const next = nextDateByFrequency(nextRunAt, frequency, interval, dayOfMonth, dayOfWeek);
      if (!next) break;
      nextRunAt = next;
      guard += 1;
    }

    const created = await prisma.recurringTransaction.create({
      data: {
        userId: req.userId,
        accountId,
        categoryId,
        type,
        value: roundMoney(value),
        description,
        frequency,
        interval,
        dayOfMonth,
        dayOfWeek,
        startDate,
        endDate,
        nextRunAt,
        installmentsTotal,
        installmentsRemaining,
        active: true,
      },
      include: {
        account: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
    });

    await writeAuditLog(prisma, {
      userId: req.userId,
      entityType: "recurringTransaction",
      entityId: created.id,
      action: "created",
      afterData: toRecurringTransactionPayload(created),
    });

    return res.status(201).json(toRecurringTransactionPayload(created));
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao criar transacao recorrente.",
      details: String(err),
    });
  }
});

app.put("/transactions/recurring/:id", auth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "id invalido." });

    const existing = await prisma.recurringTransaction.findFirst({
      where: { id, userId: req.userId },
      include: {
        account: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
    });
    if (!existing) return res.status(404).json({ error: "Recorrencia nao encontrada." });

    const type = req.body?.type ? String(req.body.type) : existing.type;
    if (!isTransactionType(type)) {
      return res.status(400).json({ error: "type deve ser income ou expense." });
    }

    const value =
      req.body?.value === undefined || req.body?.value === null
        ? existing.value
        : parsePositiveAmount(req.body?.value);
    if (!value) return res.status(400).json({ error: "value deve ser positivo." });

    const accountId =
      req.body?.accountId === undefined || req.body?.accountId === null
        ? existing.accountId
        : parseId(req.body?.accountId);
    const categoryId =
      req.body?.categoryId === undefined || req.body?.categoryId === null
        ? existing.categoryId
        : parseId(req.body?.categoryId);
    if (!accountId || !categoryId) {
      return res.status(400).json({ error: "accountId e categoryId sao obrigatorios." });
    }

    const [account, category] = await Promise.all([
      prisma.account.findFirst({ where: { id: accountId, userId: req.userId } }),
      prisma.category.findFirst({ where: { id: categoryId, userId: req.userId } }),
    ]);
    if (!account || !category) {
      return res.status(404).json({ error: "Conta ou categoria nao encontrada." });
    }
    if (String(category.type) !== type) {
      return res.status(400).json({
        error: "Tipo da categoria deve combinar com tipo da transacao.",
      });
    }

    const frequency = req.body?.frequency
      ? parseRecurringFrequency(req.body?.frequency, "")
      : existing.frequency;
    if (!RECURRING_FREQUENCIES.has(frequency)) {
      return res.status(400).json({ error: "frequency invalida." });
    }
    const interval =
      req.body?.interval === undefined || req.body?.interval === null
        ? existing.interval
        : parsePositiveInt(req.body?.interval, null, 1, 120);
    if (!interval) return res.status(400).json({ error: "interval invalido." });

    const startDate = parseIsoDate(req.body?.startDate, existing.startDate);
    const endDate = parseIsoDate(req.body?.endDate, existing.endDate);
    if (endDate && startDate > endDate) {
      return res.status(400).json({ error: "endDate deve ser maior que startDate." });
    }

    const dayOfMonth =
      frequency === "monthly" || frequency === "yearly"
        ? parseDayOfMonth(req.body?.dayOfMonth, existing.dayOfMonth ?? startDate.getDate())
        : null;
    const dayOfWeek =
      frequency === "weekly"
        ? parseDayOfWeek(req.body?.dayOfWeek, existing.dayOfWeek)
        : null;
    const active =
      req.body?.active === undefined || req.body?.active === null
        ? existing.active
        : Boolean(req.body?.active);
    const description =
      req.body?.description === undefined
        ? existing.description
        : String(req.body?.description ?? "").trim() || null;
    const installmentsTotal =
      req.body?.installmentsTotal === undefined
        ? existing.installmentsTotal
        : parsePositiveInt(req.body?.installmentsTotal, null, 1, 360);
    const installmentsRemaining =
      req.body?.installmentsRemaining === undefined
        ? existing.installmentsRemaining
        : parsePositiveInt(
            req.body?.installmentsRemaining,
            installmentsTotal ?? existing.installmentsRemaining ?? 0,
            0,
            360,
          );
    if (
      req.body?.installmentsTotal !== undefined &&
      req.body?.installmentsTotal !== null &&
      !installmentsTotal
    ) {
      return res.status(400).json({ error: "installmentsTotal invalido." });
    }

    let nextRunAt = parseIsoDate(req.body?.nextRunAt, null);
    if (!nextRunAt) {
      nextRunAt = alignDateForRule(startDate, frequency, dayOfMonth, dayOfWeek);
      const now = new Date();
      let guard = 0;
      while (nextRunAt < now && guard < 120) {
        const next = nextDateByFrequency(nextRunAt, frequency, interval, dayOfMonth, dayOfWeek);
        if (!next) break;
        nextRunAt = next;
        guard += 1;
      }
    }

    const updated = await prisma.recurringTransaction.update({
      where: { id },
      data: {
        accountId,
        categoryId,
        type,
        value: roundMoney(value),
        description,
        frequency,
        interval,
        dayOfMonth,
        dayOfWeek,
        startDate,
        endDate,
        nextRunAt,
        installmentsTotal,
        installmentsRemaining,
        active,
      },
      include: {
        account: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
    });

    await writeAuditLog(prisma, {
      userId: req.userId,
      entityType: "recurringTransaction",
      entityId: id,
      action: "updated",
      beforeData: toRecurringTransactionPayload(existing),
      afterData: toRecurringTransactionPayload(updated),
    });

    return res.json(toRecurringTransactionPayload(updated));
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao atualizar transacao recorrente.",
      details: String(err),
    });
  }
});

app.delete("/transactions/recurring/:id", auth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "id invalido." });

    const existing = await prisma.recurringTransaction.findFirst({
      where: { id, userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: "Recorrencia nao encontrada." });

    await prisma.recurringTransaction.delete({ where: { id } });

    await writeAuditLog(prisma, {
      userId: req.userId,
      entityType: "recurringTransaction",
      entityId: id,
      action: "deleted",
      beforeData: {
        type: existing.type,
        value: existing.value,
        frequency: existing.frequency,
      },
    });

    return res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao excluir recorrencia.",
      details: String(err),
    });
  }
});

app.post("/transactions/recurring/run", auth, async (req, res) => {
  try {
    const recurringSummary = await processRecurringTransactions(req.userId);
    return res.json({ ok: true, recurringSummary });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao executar recorrencias.",
      details: String(err),
    });
  }
});

// Parcelamento automatico de transacoes com geracao de parcelas futuras
app.post("/transactions/installments", auth, async (req, res) => {
  try {
    const type = String(req.body?.type ?? "expense");
    if (!isTransactionType(type)) {
      return res.status(400).json({ error: "type deve ser income ou expense." });
    }

    const totalAmount = parsePositiveAmount(req.body?.totalAmount);
    if (!totalAmount) {
      return res.status(400).json({ error: "totalAmount deve ser positivo." });
    }

    const installments = parsePositiveInt(req.body?.installments, null, 2, 120);
    if (!installments) {
      return res.status(400).json({ error: "installments deve estar entre 2 e 120." });
    }

    const accountId = parseId(req.body?.accountId);
    const categoryId = parseId(req.body?.categoryId);
    if (!accountId || !categoryId) {
      return res.status(400).json({ error: "accountId e categoryId sao obrigatorios." });
    }

    const [account, category] = await Promise.all([
      prisma.account.findFirst({ where: { id: accountId, userId: req.userId } }),
      prisma.category.findFirst({ where: { id: categoryId, userId: req.userId } }),
    ]);
    if (!account || !category) {
      return res.status(404).json({ error: "Conta ou categoria nao encontrada." });
    }
    if (String(category.type) !== type) {
      return res.status(400).json({
        error: "Tipo da categoria deve combinar com tipo da transacao.",
      });
    }

    const startDate = parseIsoDate(req.body?.startDate, new Date());
    const description = String(req.body?.description ?? "").trim();
    const tagNames = parseTagNames(req.body?.tags);
    const values = splitInstallments(totalAmount, installments);
    const startDay = startDate.getDate();
    const groupRef = `installments:${req.userId}:${Date.now()}`;

    const created = await prisma.$transaction(async (tx) => {
      const createdIds = [];
      for (let index = 0; index < values.length; index += 1) {
        const installmentDate = shiftDateMonths(startDate, index, startDay);
        const label = `${index + 1}/${installments}`;
        const transaction = await tx.transaction.create({
          data: {
            userId: req.userId,
            type,
            value: roundMoney(values[index]),
            description: description ? `${description} (${label})` : `Parcela ${label}`,
            date: installmentDate,
            accountId,
            categoryId,
            externalRef: `${groupRef}:${index + 1}`,
            isRecurringGenerated: true,
          },
          include: TRANSACTION_INCLUDE,
        });

        if (tagNames.length > 0) {
          await replaceTransactionTags(tx, req.userId, transaction.id, tagNames);
        }

        createdIds.push(transaction.id);
      }

      return tx.transaction.findMany({
        where: { id: { in: createdIds } },
        include: TRANSACTION_INCLUDE,
        orderBy: [{ date: "asc" }, { id: "asc" }],
      });
    });

    await writeAuditLog(prisma, {
      userId: req.userId,
      entityType: "transactionInstallments",
      entityId: groupRef,
      action: "created",
      metadata: {
        installments,
        totalAmount: roundMoney(totalAmount),
        transactionIds: created.map((item) => item.id),
        accountId,
        categoryId,
      },
    });

    return res.status(201).json({
      ok: true,
      totalAmount: roundMoney(totalAmount),
      installments,
      transactions: created.map((item) => toTransactionPayload(item)),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao gerar parcelas automaticas.",
      details: String(err),
    });
  }
});

// Transferencia automatica recorrente
app.get("/accounts/transfer-recurring", auth, async (req, res) => {
  try {
    const rules = await prisma.recurringTransfer.findMany({
      where: { userId: req.userId },
      include: {
        fromAccount: { select: { id: true, name: true } },
        toAccount: { select: { id: true, name: true } },
      },
      orderBy: [{ active: "desc" }, { nextRunAt: "asc" }],
    });
    return res.json(rules.map((rule) => toRecurringTransferPayload(rule)));
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao listar transferencias recorrentes.",
      details: String(err),
    });
  }
});

app.post("/accounts/transfer-recurring", auth, async (req, res) => {
  try {
    const fromAccountId = parseId(req.body?.fromAccountId);
    const toAccountId = parseId(req.body?.toAccountId);
    const amount = parsePositiveAmount(req.body?.amount);

    if (!fromAccountId || !toAccountId) {
      return res.status(400).json({ error: "fromAccountId e toAccountId sao obrigatorios." });
    }
    if (fromAccountId === toAccountId) {
      return res.status(400).json({ error: "Origem e destino devem ser diferentes." });
    }
    if (!amount) return res.status(400).json({ error: "amount deve ser positivo." });

    const [fromAccount, toAccount] = await Promise.all([
      prisma.account.findFirst({ where: { id: fromAccountId, userId: req.userId } }),
      prisma.account.findFirst({ where: { id: toAccountId, userId: req.userId } }),
    ]);
    if (!fromAccount || !toAccount) {
      return res.status(404).json({ error: "Conta de origem ou destino nao encontrada." });
    }

    const rawFrequency = normalizeText(req.body?.frequency || "monthly");
    if (!RECURRING_FREQUENCIES.has(rawFrequency)) {
      return res.status(400).json({ error: "frequency invalida." });
    }
    const frequency = parseRecurringFrequency(rawFrequency, "monthly");
    const interval = parsePositiveInt(req.body?.interval, 1, 1, 120);
    const startDate = parseIsoDate(req.body?.startDate, new Date());
    const endDate = parseIsoDate(req.body?.endDate, null);
    if (endDate && startDate > endDate) {
      return res.status(400).json({ error: "endDate deve ser maior que startDate." });
    }

    let nextRunAt = new Date(startDate);
    const now = new Date();
    let guard = 0;
    while (nextRunAt < now && guard < 120) {
      const next = nextDateByFrequency(nextRunAt, frequency, interval);
      if (!next) break;
      nextRunAt = next;
      guard += 1;
    }

    const created = await prisma.recurringTransfer.create({
      data: {
        userId: req.userId,
        fromAccountId,
        toAccountId,
        amount: roundMoney(amount),
        description: String(req.body?.description ?? "").trim() || null,
        frequency,
        interval,
        startDate,
        endDate,
        nextRunAt,
        active: true,
      },
      include: {
        fromAccount: { select: { id: true, name: true } },
        toAccount: { select: { id: true, name: true } },
      },
    });

    await writeAuditLog(prisma, {
      userId: req.userId,
      entityType: "recurringTransfer",
      entityId: created.id,
      action: "created",
      afterData: toRecurringTransferPayload(created),
    });

    return res.status(201).json(toRecurringTransferPayload(created));
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao criar transferencia recorrente.",
      details: String(err),
    });
  }
});

app.put("/accounts/transfer-recurring/:id", auth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "id invalido." });

    const existing = await prisma.recurringTransfer.findFirst({
      where: { id, userId: req.userId },
      include: {
        fromAccount: { select: { id: true, name: true } },
        toAccount: { select: { id: true, name: true } },
      },
    });
    if (!existing) return res.status(404).json({ error: "Regra nao encontrada." });

    const fromAccountId =
      req.body?.fromAccountId === undefined || req.body?.fromAccountId === null
        ? existing.fromAccountId
        : parseId(req.body?.fromAccountId);
    const toAccountId =
      req.body?.toAccountId === undefined || req.body?.toAccountId === null
        ? existing.toAccountId
        : parseId(req.body?.toAccountId);
    const amount =
      req.body?.amount === undefined || req.body?.amount === null
        ? existing.amount
        : parsePositiveAmount(req.body?.amount);

    if (!fromAccountId || !toAccountId) {
      return res.status(400).json({ error: "fromAccountId e toAccountId sao obrigatorios." });
    }
    if (fromAccountId === toAccountId) {
      return res.status(400).json({ error: "Origem e destino devem ser diferentes." });
    }
    if (!amount) return res.status(400).json({ error: "amount deve ser positivo." });

    const [fromAccount, toAccount] = await Promise.all([
      prisma.account.findFirst({ where: { id: fromAccountId, userId: req.userId } }),
      prisma.account.findFirst({ where: { id: toAccountId, userId: req.userId } }),
    ]);
    if (!fromAccount || !toAccount) {
      return res.status(404).json({ error: "Conta de origem ou destino nao encontrada." });
    }

    const frequency = req.body?.frequency
      ? parseRecurringFrequency(req.body?.frequency, "")
      : existing.frequency;
    if (!RECURRING_FREQUENCIES.has(frequency)) {
      return res.status(400).json({ error: "frequency invalida." });
    }
    const interval =
      req.body?.interval === undefined || req.body?.interval === null
        ? existing.interval
        : parsePositiveInt(req.body?.interval, null, 1, 120);
    if (!interval) return res.status(400).json({ error: "interval invalido." });

    const startDate = parseIsoDate(req.body?.startDate, existing.startDate);
    const endDate = parseIsoDate(req.body?.endDate, existing.endDate);
    if (endDate && startDate > endDate) {
      return res.status(400).json({ error: "endDate deve ser maior que startDate." });
    }

    const active =
      req.body?.active === undefined || req.body?.active === null
        ? existing.active
        : Boolean(req.body?.active);
    const description =
      req.body?.description === undefined
        ? existing.description
        : String(req.body?.description ?? "").trim() || null;

    let nextRunAt = parseIsoDate(req.body?.nextRunAt, null);
    if (!nextRunAt) {
      nextRunAt = new Date(startDate);
      const now = new Date();
      let guard = 0;
      while (nextRunAt < now && guard < 120) {
        const next = nextDateByFrequency(nextRunAt, frequency, interval);
        if (!next) break;
        nextRunAt = next;
        guard += 1;
      }
    }

    const updated = await prisma.recurringTransfer.update({
      where: { id },
      data: {
        fromAccountId,
        toAccountId,
        amount: roundMoney(amount),
        description,
        frequency,
        interval,
        startDate,
        endDate,
        nextRunAt,
        active,
      },
      include: {
        fromAccount: { select: { id: true, name: true } },
        toAccount: { select: { id: true, name: true } },
      },
    });

    await writeAuditLog(prisma, {
      userId: req.userId,
      entityType: "recurringTransfer",
      entityId: id,
      action: "updated",
      beforeData: toRecurringTransferPayload(existing),
      afterData: toRecurringTransferPayload(updated),
    });

    return res.json(toRecurringTransferPayload(updated));
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao atualizar transferencia recorrente.",
      details: String(err),
    });
  }
});

app.delete("/accounts/transfer-recurring/:id", auth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "id invalido." });

    const existing = await prisma.recurringTransfer.findFirst({
      where: { id, userId: req.userId },
      include: {
        fromAccount: { select: { id: true, name: true } },
        toAccount: { select: { id: true, name: true } },
      },
    });
    if (!existing) return res.status(404).json({ error: "Regra nao encontrada." });

    await prisma.recurringTransfer.delete({ where: { id } });
    await writeAuditLog(prisma, {
      userId: req.userId,
      entityType: "recurringTransfer",
      entityId: id,
      action: "deleted",
      beforeData: toRecurringTransferPayload(existing),
    });

    return res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao excluir transferencia recorrente.",
      details: String(err),
    });
  }
});

app.post("/accounts/transfer-recurring/run", auth, async (req, res) => {
  try {
    const summary = await processRecurringTransfers(req.userId);
    return res.json({ ok: true, summary });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao executar transferencias recorrentes.",
      details: String(err),
    });
  }
});

// Importacao CSV / OFX
app.post("/imports/csv", auth, async (req, res) => {
  try {
    const content = String(req.body?.content ?? "");
    const fileName = String(req.body?.fileName ?? "import.csv");
    if (!content.trim()) {
      return res.status(400).json({ error: "Arquivo CSV vazio." });
    }

    const entries = parseCsvEntries(content);
    if (entries.length === 0) {
      return res.status(400).json({
        error: "Nao foi possivel extrair lancamentos do CSV.",
      });
    }

    const imported = await importBankEntries({
      userId: req.userId,
      sourceType: "csv",
      fileName,
      entries,
    });

    return res.status(201).json({
      ok: true,
      ...imported,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao importar CSV.",
      details: String(err),
    });
  }
});

app.post("/imports/ofx", auth, async (req, res) => {
  try {
    const content = String(req.body?.content ?? "");
    const fileName = String(req.body?.fileName ?? "import.ofx");
    if (!content.trim()) {
      return res.status(400).json({ error: "Arquivo OFX vazio." });
    }

    const entries = parseOfxEntries(content);
    if (entries.length === 0) {
      return res.status(400).json({
        error: "Nao foi possivel extrair lancamentos do OFX.",
      });
    }

    const imported = await importBankEntries({
      userId: req.userId,
      sourceType: "ofx",
      fileName,
      entries,
    });

    return res.status(201).json({
      ok: true,
      ...imported,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao importar OFX.",
      details: String(err),
    });
  }
});

// Conciliacao bancaria
app.get("/reconciliation/entries", auth, async (req, res) => {
  try {
    const status = String(req.query?.status ?? "").trim().toLowerCase();
    const limit = parsePositiveInt(req.query?.limit, 200, 1, 1000);
    const where = { userId: req.userId };
    if (RECONCILIATION_STATUSES.has(status)) {
      where.status = status;
    }

    const entries = await prisma.bankStatementEntry.findMany({
      where,
      include: {
        importBatch: {
          select: { id: true, sourceType: true, fileName: true, createdAt: true },
        },
        matchedTransaction: {
          select: {
            id: true,
            type: true,
            value: true,
            description: true,
            date: true,
            accountId: true,
            categoryId: true,
          },
        },
      },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: limit,
    });

    return res.json(entries);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao listar conciliacao bancaria.",
      details: String(err),
    });
  }
});

app.post("/reconciliation/auto", auth, async (req, res) => {
  try {
    const limit = parsePositiveInt(req.body?.limit ?? req.query?.limit, 200, 1, 1000);
    const summary = await autoReconcileEntries(req.userId, limit);
    return res.json({
      ok: true,
      ...summary,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha na conciliacao automatica.",
      details: String(err),
    });
  }
});

app.post("/reconciliation/:id/match", auth, async (req, res) => {
  try {
    const entryId = parseId(req.params.id);
    const transactionId = parseId(req.body?.transactionId);
    if (!entryId || !transactionId) {
      return res.status(400).json({ error: "entryId e transactionId sao obrigatorios." });
    }

    const [entry, transaction] = await Promise.all([
      prisma.bankStatementEntry.findFirst({
        where: { id: entryId, userId: req.userId },
      }),
      prisma.transaction.findFirst({
        where: { id: transactionId, userId: req.userId },
      }),
    ]);
    if (!entry) return res.status(404).json({ error: "Lancamento importado nao encontrado." });
    if (!transaction) return res.status(404).json({ error: "Transacao nao encontrada." });

    const updated = await prisma.bankStatementEntry.update({
      where: { id: entryId },
      data: {
        matchedTransactionId: transactionId,
        matchedAt: new Date(),
        status: "reconciled",
      },
      include: {
        matchedTransaction: {
          select: {
            id: true,
            type: true,
            value: true,
            description: true,
            date: true,
          },
        },
      },
    });

    await writeAuditLog(prisma, {
      userId: req.userId,
      transactionId,
      entityType: "reconciliation",
      entityId: entryId,
      action: "manual_match",
      beforeData: {
        matchedTransactionId: entry.matchedTransactionId,
        status: entry.status,
      },
      afterData: {
        matchedTransactionId: transactionId,
        status: "reconciled",
      },
    });

    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao conciliar manualmente.",
      details: String(err),
    });
  }
});

app.post("/reconciliation/:id/unmatch", auth, async (req, res) => {
  try {
    const entryId = parseId(req.params.id);
    if (!entryId) return res.status(400).json({ error: "id invalido." });

    const entry = await prisma.bankStatementEntry.findFirst({
      where: { id: entryId, userId: req.userId },
    });
    if (!entry) return res.status(404).json({ error: "Lancamento importado nao encontrado." });

    const updated = await prisma.bankStatementEntry.update({
      where: { id: entryId },
      data: {
        matchedTransactionId: null,
        matchedAt: null,
        status: "pending",
      },
    });

    await writeAuditLog(prisma, {
      userId: req.userId,
      entityType: "reconciliation",
      entityId: entryId,
      action: "unmatched",
      beforeData: {
        matchedTransactionId: entry.matchedTransactionId,
        status: entry.status,
      },
      afterData: {
        matchedTransactionId: null,
        status: "pending",
      },
    });

    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao desfazer conciliacao.",
      details: String(err),
    });
  }
});

app.post("/reconciliation/:id/create-transaction", auth, async (req, res) => {
  try {
    const entryId = parseId(req.params.id);
    const accountId = parseId(req.body?.accountId);
    const categoryId = parseId(req.body?.categoryId);
    if (!entryId || !accountId || !categoryId) {
      return res.status(400).json({ error: "entryId, accountId e categoryId sao obrigatorios." });
    }

    const [entry, account, category] = await Promise.all([
      prisma.bankStatementEntry.findFirst({
        where: { id: entryId, userId: req.userId },
      }),
      prisma.account.findFirst({
        where: { id: accountId, userId: req.userId },
      }),
      prisma.category.findFirst({
        where: { id: categoryId, userId: req.userId },
      }),
    ]);

    if (!entry) return res.status(404).json({ error: "Lancamento importado nao encontrado." });
    if (!account || !category) {
      return res.status(404).json({ error: "Conta ou categoria nao encontrada." });
    }

    const type = transactionTypeFromAmount(entry.amount);
    const value = transactionValueFromAmount(entry.amount);
    if (String(category.type) !== type) {
      return res.status(400).json({
        error: "Tipo da categoria deve combinar com o tipo do lancamento importado.",
      });
    }

    const externalRef = `bank-entry:${entry.id}`;
    let transaction = await prisma.transaction.findFirst({
      where: { userId: req.userId, externalRef },
      include: TRANSACTION_INCLUDE,
    });

    if (!transaction) {
      transaction = await prisma.transaction.create({
        data: {
          userId: req.userId,
          type,
          value,
          description: entry.description || null,
          date: entry.date,
          accountId,
          categoryId,
          externalRef,
        },
        include: TRANSACTION_INCLUDE,
      });
    }

    const updatedEntry = await prisma.bankStatementEntry.update({
      where: { id: entry.id },
      data: {
        matchedTransactionId: transaction.id,
        matchedAt: new Date(),
        status: "reconciled",
      },
      include: {
        matchedTransaction: true,
      },
    });

    await writeAuditLog(prisma, {
      userId: req.userId,
      transactionId: transaction.id,
      entityType: "reconciliation",
      entityId: entryId,
      action: "created_transaction_from_entry",
      afterData: {
        transactionId: transaction.id,
        entryId,
      },
    });

    return res.status(201).json({
      entry: updatedEntry,
      transaction: toTransactionPayload(transaction),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao criar transacao a partir da conciliacao.",
      details: String(err),
    });
  }
});

// Deteccao de duplicidade
app.get("/transactions/duplicates", auth, async (req, res) => {
  try {
    await processRecurringTransactions(req.userId);

    const days = Number(req.query?.days);
    const where = { userId: req.userId };
    if (Number.isInteger(days) && days > 0) {
      const since = new Date();
      since.setDate(since.getDate() - days);
      where.date = { gte: since };
    }

    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: [{ date: "desc" }, { id: "desc" }],
    });
    const groups = detectTransactionDuplicates(transactions);

    return res.json({
      groupsCount: groups.length,
      transactionsCount: transactions.length,
      groups,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao detectar duplicidades.",
      details: String(err),
    });
  }
});

// Historico de alteracoes (audit log)
app.get("/audit-logs", auth, async (req, res) => {
  try {
    const limit = parsePositiveInt(req.query?.limit, 100, 1, 1000);
    const entityType = String(req.query?.entityType ?? "").trim();

    const where = { userId: req.userId };
    if (entityType) where.entityType = entityType;

    const logs = await prisma.auditLog.findMany({
      where,
      include: {
        transaction: {
          select: {
            id: true,
            type: true,
            value: true,
            description: true,
            date: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: limit,
    });

    return res.json(logs);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao listar audit log.",
      details: String(err),
    });
  }
});

app.post("/automations/run", auth, async (req, res) => {
  try {
    const [recurringTransactions, recurringTransfers] = await Promise.all([
      processRecurringTransactions(req.userId),
      processRecurringTransfers(req.userId),
    ]);

    return res.json({
      ok: true,
      recurringTransactions,
      recurringTransfers,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Falha ao executar automacoes.",
      details: String(err),
    });
  }
});

// Conta
app.post("/accounts", auth, async (req, res) => {
  try {
    const { name, type, balance } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "name is required" });
    }
    if (!type || !String(type).trim()) {
      return res.status(400).json({ error: "type is required" });
    }

    const b = balance === undefined || balance === null ? 0 : Number(balance);
    if (!Number.isFinite(b)) {
      return res.status(400).json({ error: "balance must be a number" });
    }

    console.log("POST /accounts body:", req.body);

    const account = await prisma.account.create({
      data: {
        name: String(name).trim(),
        type: String(type).trim(),
        balance: b,
        userId: req.userId,
      },
    });

    res.json(account);
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: "Failed to create account", details: String(err) });
  }
});

app.get("/accounts", auth, async (req, res) => {
  try {
    await processRecurringTransfers(req.userId);
    const accounts = await prisma.account.findMany({
      where: { userId: req.userId },
    });
    res.json(accounts);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Falha ao listar contas.",
      details: String(err),
    });
  }
});

app.post("/accounts/transfer", auth, async (req, res) => {
  try {
    const fromAccountId = parseId(req.body?.fromAccountId);
    const toAccountId = parseId(req.body?.toAccountId);
    const amount = Number(req.body?.amount);

    if (!fromAccountId || !toAccountId) {
      return res.status(400).json({ error: "fromAccountId e toAccountId sao obrigatorios." });
    }
    if (fromAccountId === toAccountId) {
      return res.status(400).json({ error: "Origem e destino devem ser contas diferentes." });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "amount deve ser um numero positivo." });
    }

    let updatedFrom = null;
    let updatedTo = null;

    await prisma.$transaction(async (tx) => {
      const [fromAccount, toAccount] = await Promise.all([
        tx.account.findFirst({
          where: { id: fromAccountId, userId: req.userId },
        }),
        tx.account.findFirst({
          where: { id: toAccountId, userId: req.userId },
        }),
      ]);

      if (!fromAccount || !toAccount) {
        throw requestError(404, "Conta de origem ou destino nao encontrada.");
      }

      if (Number(fromAccount.balance) < amount) {
        throw requestError(409, "Saldo insuficiente na conta de origem.");
      }

      [updatedFrom, updatedTo] = await Promise.all([
        tx.account.update({
          where: { id: fromAccountId },
          data: { balance: { decrement: amount } },
        }),
        tx.account.update({
          where: { id: toAccountId },
          data: { balance: { increment: amount } },
        }),
      ]);
    });

    await writeAuditLog(prisma, {
      userId: req.userId,
      entityType: "accountTransfer",
      entityId: `${fromAccountId}:${toAccountId}:${Date.now()}`,
      action: "executed",
      metadata: {
        amount: roundMoney(amount),
        fromAccountId,
        toAccountId,
      },
    });

    return res.json({
      ok: true,
      amount,
      fromAccount: updatedFrom,
      toAccount: updatedTo,
    });
  } catch (err) {
    if (err?.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error(err);
    return res.status(500).json({
      error: "Nao foi possivel transferir saldo entre contas.",
      details: String(err),
    });
  }
});

app.put("/accounts/:id", auth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid id" });

    const existing = await prisma.account.findFirst({
      where: { id, userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: "Account not found" });

    const { name, type, balance } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "name is required" });
    }
    if (!type || !String(type).trim()) {
      return res.status(400).json({ error: "type is required" });
    }

    const b = Number(balance);
    if (!Number.isFinite(b)) {
      return res.status(400).json({ error: "balance must be a number" });
    }

    const updated = await prisma.account.update({
      where: { id },
      data: {
        name: String(name).trim(),
        type: String(type).trim(),
        balance: b,
      },
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: "Failed to update account", details: String(err) });
  }
});

app.delete("/accounts/:id", auth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({
        error: "Nao foi possivel excluir conta.",
        reason: "Identificador da conta invalido.",
      });
    }

    const existing = await prisma.account.findFirst({
      where: { id, userId: req.userId },
    });
    if (!existing) {
      return res.status(404).json({
        error: "Nao foi possivel excluir conta.",
        reason: "Conta nao encontrada para este usuario.",
      });
    }

    const linkedCount = await prisma.transaction.count({
      where: { userId: req.userId, accountId: id },
    });
    if (linkedCount > 0) {
      return res.status(409).json({
        error: "Nao foi possivel excluir conta.",
        reason: `A conta possui ${linkedCount} transacao(oes) vinculada(s). Exclua ou recategorize essas transacoes antes.`,
        linkedTransactions: linkedCount,
      });
    }

    const [recurringTransactionsCount, recurringTransfersCount] = await Promise.all([
      prisma.recurringTransaction.count({
        where: { userId: req.userId, accountId: id },
      }),
      prisma.recurringTransfer.count({
        where: {
          userId: req.userId,
          OR: [{ fromAccountId: id }, { toAccountId: id }],
        },
      }),
    ]);

    if (recurringTransactionsCount > 0 || recurringTransfersCount > 0) {
      return res.status(409).json({
        error: "Nao foi possivel excluir conta.",
        reason: "Existem automacoes recorrentes vinculadas a esta conta.",
        linkedRecurringTransactions: recurringTransactionsCount,
        linkedRecurringTransfers: recurringTransfersCount,
      });
    }

    await prisma.accountLimit.deleteMany({
      where: { userId: req.userId, accountId: id },
    });
    await prisma.account.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    if (err?.code === "P2003") {
      return res.status(409).json({
        error: "Nao foi possivel excluir conta.",
        reason: "Existem transacoes vinculadas a esta conta.",
      });
    }
    console.error(err);
    res
      .status(500)
      .json({
        error: "Nao foi possivel excluir conta.",
        reason: "Erro interno do servidor ao excluir conta.",
        details: String(err),
      });
  }
});

// Categoria
app.post("/categories", auth, async (req, res) => {
  try {
    const { name, color, type } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "name is required" });
    }
    if (!color || !String(color).trim()) {
      return res.status(400).json({ error: "color is required" });
    }
    if (!isTransactionType(type)) {
      return res.status(400).json({ error: "type must be 'income' or 'expense'" });
    }

    const category = await prisma.category.create({
      data: {
        name: String(name).trim(),
        color: String(color).trim(),
        type: String(type),
        userId: req.userId,
      },
    });
    res.json(category);
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: "Failed to create category", details: String(err) });
  }
});

app.get("/categories", auth, async (req, res) => {
  const categories = await prisma.category.findMany({
    where: { userId: req.userId },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  res.json(categories);
});

app.put("/categories/:id", auth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid id" });

    const existing = await prisma.category.findFirst({
      where: { id, userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: "Category not found" });

    const { name, color, type } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "name is required" });
    }
    if (!color || !String(color).trim()) {
      return res.status(400).json({ error: "color is required" });
    }
    if (!isTransactionType(type)) {
      return res.status(400).json({ error: "type must be 'income' or 'expense'" });
    }

    const updated = await prisma.category.update({
      where: { id },
      data: {
        name: String(name).trim(),
        color: String(color).trim(),
        type: String(type),
      },
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: "Failed to update category", details: String(err) });
  }
});

app.delete("/categories/:id", auth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({
        error: "Nao foi possivel excluir categoria.",
        reason: "Identificador da categoria invalido.",
      });
    }

    const existing = await prisma.category.findFirst({
      where: { id, userId: req.userId },
    });
    if (!existing) {
      return res.status(404).json({
        error: "Nao foi possivel excluir categoria.",
        reason: "Categoria nao encontrada para este usuario.",
      });
    }

    const linkedCount = await prisma.transaction.count({
      where: { userId: req.userId, categoryId: id },
    });
    if (linkedCount > 0) {
      return res.status(409).json({
        error: "Nao foi possivel excluir categoria.",
        reason: `A categoria possui ${linkedCount} transacao(oes) vinculada(s). Exclua ou recategorize essas transacoes antes.`,
        linkedTransactions: linkedCount,
      });
    }

    const linkedRecurringCount = await prisma.recurringTransaction.count({
      where: { userId: req.userId, categoryId: id },
    });
    if (linkedRecurringCount > 0) {
      return res.status(409).json({
        error: "Nao foi possivel excluir categoria.",
        reason: "Existem transacoes recorrentes vinculadas a esta categoria.",
        linkedRecurringTransactions: linkedRecurringCount,
      });
    }

    await prisma.categoryBudget.deleteMany({
      where: { userId: req.userId, categoryId: id },
    });
    await prisma.category.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    if (err?.code === "P2003") {
      return res.status(409).json({
        error: "Nao foi possivel excluir categoria.",
        reason: "Existem transacoes vinculadas a esta categoria.",
      });
    }
    console.error(err);
    res
      .status(500)
      .json({
        error: "Nao foi possivel excluir categoria.",
        reason: "Erro interno do servidor ao excluir categoria.",
        details: String(err),
      });
  }
});

// Metas
app.post("/goals", auth, async (req, res) => {
  try {
    const { name, targetValue, currentValue, deadline } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "name is required" });
    }

    const target = Number(targetValue);
    const current =
      currentValue === undefined || currentValue === null ? 0 : Number(currentValue);
    if (!Number.isFinite(target) || target <= 0) {
      return res.status(400).json({ error: "targetValue must be a positive number" });
    }
    if (!Number.isFinite(current) || current < 0) {
      return res.status(400).json({ error: "currentValue must be a non-negative number" });
    }

    const parsedDeadline = new Date(deadline);
    if (Number.isNaN(parsedDeadline.getTime())) {
      return res.status(400).json({ error: "deadline must be a valid ISO date string" });
    }

    const goal = await prisma.goal.create({
      data: {
        name: String(name).trim(),
        targetValue: target,
        currentValue: current,
        deadline: parsedDeadline,
        userId: req.userId,
      },
    });

    res.json(goal);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create goal", details: String(err) });
  }
});

app.get("/goals", auth, async (req, res) => {
  try {
    const goals = await prisma.goal.findMany({
      where: { userId: req.userId },
      orderBy: { deadline: "asc" },
    });
    res.json(goals);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list goals", details: String(err) });
  }
});

app.put("/goals/:id", auth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid id" });

    const existing = await prisma.goal.findFirst({
      where: { id, userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: "Goal not found" });

    const { name, targetValue, currentValue, deadline } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "name is required" });
    }

    const target = Number(targetValue);
    const current = Number(currentValue);
    if (!Number.isFinite(target) || target <= 0) {
      return res.status(400).json({ error: "targetValue must be a positive number" });
    }
    if (!Number.isFinite(current) || current < 0) {
      return res.status(400).json({ error: "currentValue must be a non-negative number" });
    }

    const parsedDeadline = new Date(deadline);
    if (Number.isNaN(parsedDeadline.getTime())) {
      return res.status(400).json({ error: "deadline must be a valid ISO date string" });
    }

    const updated = await prisma.goal.update({
      where: { id },
      data: {
        name: String(name).trim(),
        targetValue: target,
        currentValue: current,
        deadline: parsedDeadline,
      },
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update goal", details: String(err) });
  }
});

app.delete("/goals/:id", auth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid id" });

    const existing = await prisma.goal.findFirst({
      where: { id, userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: "Goal not found" });

    await prisma.goal.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete goal", details: String(err) });
  }
});

// Cadastro
app.post("/register", async (req, res) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    const email = String(req.body?.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password ?? "");

    if (!name) return res.status(400).json({ error: "Nome e obrigatorio." });
    if (!email) return res.status(400).json({ error: "Email e obrigatorio." });
    if (!password) return res.status(400).json({ error: "Senha e obrigatoria." });
    if (password.length < 6) {
      return res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres." });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Email invalido." });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "Ja existe uma conta com este email." });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, password: hash },
      select: { id: true, name: true, email: true },
    });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    res.status(201).json({ token, user });
  } catch (err) {
    if (err?.code === "P2002") {
      return res.status(409).json({ error: "Ja existe uma conta com este email." });
    }
    console.error(err);
    res.status(500).json({ error: "Falha ao criar conta.", details: String(err) });
  }
});

// Login
app.post("/login", async (req, res) => {
  try {
    const email = String(req.body?.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password ?? "");

    if (!email || !password) {
      return res.status(400).json({ error: "Email e senha sao obrigatorios." });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ error: "Usuario nao encontrado." });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: "Senha invalida." });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Falha no login.", details: String(err) });
  }
});

// Criar Transação
app.post("/transactions", auth, async (req, res) => {
  try {
    const { type, value, description, date, accountId, categoryId } = req.body;
    const tagNames = parseTagNames(req.body?.tags);

    if (!isTransactionType(type)) {
      return res.status(400).json({ error: "type must be 'income' or 'expense'" });
    }

    const v = Number(value);
    if (!Number.isFinite(v) || v <= 0) {
      return res.status(400).json({ error: "value must be a positive number" });
    }

    const aId = Number(accountId);
    const cId = Number(categoryId);
    if (!Number.isInteger(aId) || !Number.isInteger(cId)) {
      return res.status(400).json({ error: "accountId and categoryId must be integers" });
    }

    const d = new Date(date);
    if (Number.isNaN(d.getTime())) {
      return res.status(400).json({ error: "date must be a valid ISO date string" });
    }

    const [acc, cat] = await Promise.all([
      prisma.account.findFirst({ where: { id: aId, userId: req.userId } }),
      prisma.category.findFirst({ where: { id: cId, userId: req.userId } }),
    ]);

    if (!acc) return res.status(400).json({ error: "Invalid accountId for this user" });
    if (!cat) return res.status(400).json({ error: "Invalid categoryId for this user" });
    if (cat.type !== type) {
      return res.status(400).json({ error: "Category type must match transaction type" });
    }

    const created = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          type,
          value: roundMoney(v),
          description: description ?? null,
          date: d,
          userId: req.userId,
          accountId: aId,
          categoryId: cId,
        },
      });

      if (tagNames.length > 0) {
        await replaceTransactionTags(tx, req.userId, transaction.id, tagNames);
      }

      return tx.transaction.findUnique({
        where: { id: transaction.id },
        include: TRANSACTION_INCLUDE,
      });
    });

    await writeAuditLog(prisma, {
      userId: req.userId,
      transactionId: created.id,
      entityType: "transaction",
      entityId: created.id,
      action: "created",
      afterData: {
        type: created.type,
        value: created.value,
        description: created.description,
        date: created.date,
        accountId: created.accountId,
        categoryId: created.categoryId,
        tags: created.tags?.map((item) => item?.tag?.name).filter(Boolean),
      },
    });

    res.json(toTransactionPayload(created));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create transaction", details: String(err) });
  }
});

// Listar Transações
app.put("/transactions/:id", auth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid id" });

    const existing = await prisma.transaction.findFirst({
      where: { id, userId: req.userId },
      include: TRANSACTION_INCLUDE,
    });
    if (!existing) return res.status(404).json({ error: "Transaction not found" });

    const { type, value, description, date, accountId, categoryId } = req.body;

    if (!isTransactionType(type)) {
      return res
        .status(400)
        .json({ error: "type must be 'income' or 'expense'" });
    }

    const v = Number(value);
    if (!Number.isFinite(v) || v <= 0) {
      return res.status(400).json({ error: "value must be a positive number" });
    }

    const aId = Number(accountId);
    const cId = Number(categoryId);
    if (!Number.isInteger(aId) || !Number.isInteger(cId)) {
      return res
        .status(400)
        .json({ error: "accountId and categoryId must be integers" });
    }

    const d = new Date(date);
    if (Number.isNaN(d.getTime())) {
      return res
        .status(400)
        .json({ error: "date must be a valid ISO date string" });
    }

    const [acc, cat] = await Promise.all([
      prisma.account.findFirst({ where: { id: aId, userId: req.userId } }),
      prisma.category.findFirst({ where: { id: cId, userId: req.userId } }),
    ]);

    if (!acc) return res.status(400).json({ error: "Invalid accountId for this user" });
    if (!cat) return res.status(400).json({ error: "Invalid categoryId for this user" });
    if (cat.type !== type) {
      return res.status(400).json({ error: "Category type must match transaction type" });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id },
        data: {
          type,
          value: roundMoney(v),
          description: description ?? null,
          date: d,
          accountId: aId,
          categoryId: cId,
        },
      });

      if (Object.prototype.hasOwnProperty.call(req.body, "tags")) {
        const tagNames = parseTagNames(req.body?.tags);
        await replaceTransactionTags(tx, req.userId, id, tagNames);
      }

      return tx.transaction.findUnique({
        where: { id },
        include: TRANSACTION_INCLUDE,
      });
    });

    await writeAuditLog(prisma, {
      userId: req.userId,
      transactionId: id,
      entityType: "transaction",
      entityId: id,
      action: "updated",
      beforeData: {
        type: existing.type,
        value: existing.value,
        description: existing.description,
        date: existing.date,
        accountId: existing.accountId,
        categoryId: existing.categoryId,
        tags: existing.tags?.map((item) => item?.tag?.name).filter(Boolean),
      },
      afterData: {
        type: updated.type,
        value: updated.value,
        description: updated.description,
        date: updated.date,
        accountId: updated.accountId,
        categoryId: updated.categoryId,
        tags: updated.tags?.map((item) => item?.tag?.name).filter(Boolean),
      },
    });

    res.json(toTransactionPayload(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update transaction", details: String(err) });
  }
});

app.delete("/transactions/:id", auth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid id" });

    const existing = await prisma.transaction.findFirst({
      where: { id, userId: req.userId },
      include: TRANSACTION_INCLUDE,
    });
    if (!existing) return res.status(404).json({ error: "Transaction not found" });

    await prisma.transaction.delete({ where: { id } });

    await writeAuditLog(prisma, {
      userId: req.userId,
      transactionId: id,
      entityType: "transaction",
      entityId: id,
      action: "deleted",
      beforeData: {
        type: existing.type,
        value: existing.value,
        description: existing.description,
        date: existing.date,
        accountId: existing.accountId,
        categoryId: existing.categoryId,
        tags: existing.tags?.map((item) => item?.tag?.name).filter(Boolean),
      },
    });

    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete transaction", details: String(err) });
  }
});

app.get("/transactions", auth, async (req, res) => {
  try {
    await processRecurringTransactions(req.userId);

    const transactions = await prisma.transaction.findMany({
      where: { userId: req.userId },
      include: TRANSACTION_INCLUDE,
      orderBy: [{ date: "desc" }, { id: "desc" }],
    });

    res.json(transactions.map((item) => toTransactionPayload(item)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list transactions", details: String(err) });
  }
});

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`Backend rodando em http://${HOST}:${PORT}`);
});
