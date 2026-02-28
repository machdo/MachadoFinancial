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

function isTransactionType(value) {
  return value === "income" || value === "expense";
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? "").trim());
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
      await tx.transaction.deleteMany({ where: { userId: req.userId } });
      await tx.goal.deleteMany({ where: { userId: req.userId } });
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
  const accounts = await prisma.account.findMany({
    where: { userId: req.userId },
  });
  res.json(accounts);
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

    // Validações mínimas
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

    // (Opcional, mas recomendado) garantir que account/category pertencem ao usuário
    const [acc, cat] = await Promise.all([
      prisma.account.findFirst({ where: { id: aId, userId: req.userId } }),
      prisma.category.findFirst({ where: { id: cId, userId: req.userId } }),
    ]);

    if (!acc)
      return res.status(400).json({ error: "Invalid accountId for this user" });
    if (!cat)
      return res
        .status(400)
        .json({ error: "Invalid categoryId for this user" });
    if (cat.type !== type) {
      return res.status(400).json({
        error: "Category type must match transaction type",
      });
    }

    const transaction = await prisma.transaction.create({
      data: {
        type,
        value: v,
        description: description ?? null,
        date: d,
        userId: req.userId,
        accountId: aId,
        categoryId: cId,
      },
    });

    res.json(transaction);
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: "Failed to create transaction", details: String(err) });
  }
});

// Listar Transações
app.put("/transactions/:id", auth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid id" });

    const existing = await prisma.transaction.findFirst({
      where: { id, userId: req.userId },
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

    if (!acc)
      return res.status(400).json({ error: "Invalid accountId for this user" });
    if (!cat)
      return res
        .status(400)
        .json({ error: "Invalid categoryId for this user" });
    if (cat.type !== type) {
      return res.status(400).json({
        error: "Category type must match transaction type",
      });
    }

    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        type,
        value: v,
        description: description ?? null,
        date: d,
        accountId: aId,
        categoryId: cId,
      },
      include: { category: true },
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: "Failed to update transaction", details: String(err) });
  }
});

app.delete("/transactions/:id", auth, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid id" });

    const existing = await prisma.transaction.findFirst({
      where: { id, userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: "Transaction not found" });

    await prisma.transaction.delete({ where: { id } });
    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: "Failed to delete transaction", details: String(err) });
  }
});

app.get("/transactions", auth, async (req, res) => {
  const transactions = await prisma.transaction.findMany({
    where: { userId: req.userId },
    include: { category: true },
  });
  res.json(transactions);
});

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`Backend rodando em http://${HOST}:${PORT}`);
});
