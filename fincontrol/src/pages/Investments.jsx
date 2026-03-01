import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { money } from "../lib/finance";

const EXPENSE_COLORS = ["#2563eb", "#0ea5e9", "#14b8a6", "#22c55e", "#84cc16"];
const PROFILE_OPTIONS = {
  conservador: [
    { name: "Renda fixa", value: 70 },
    { name: "Fundos imobiliarios", value: 15 },
    { name: "Acoes", value: 10 },
    { name: "Caixa", value: 5 },
  ],
  moderado: [
    { name: "Renda fixa", value: 45 },
    { name: "Fundos imobiliarios", value: 20 },
    { name: "Acoes", value: 30 },
    { name: "Caixa", value: 5 },
  ],
  arrojado: [
    { name: "Renda fixa", value: 25 },
    { name: "Fundos imobiliarios", value: 15 },
    { name: "Acoes", value: 55 },
    { name: "Caixa", value: 5 },
  ],
};
const LS_PORTFOLIO = "fincontrol:investmentPortfolio:v1";
const PORTFOLIO_TYPES = [
  { value: "fixed_income", label: "Renda fixa" },
  { value: "stocks", label: "Acoes" },
  { value: "fiis", label: "FIIs" },
  { value: "crypto", label: "Cripto" },
  { value: "funds", label: "Fundos" },
  { value: "international", label: "Exterior" },
  { value: "other", label: "Outros" },
];

function createPortfolioId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function sanitizePortfolioItem(rawItem) {
  const id = String(rawItem?.id ?? createPortfolioId()).trim();
  const name = String(rawItem?.name ?? "").trim();
  const type = String(rawItem?.type ?? "other").trim();
  const quantity = Number(rawItem?.quantity);
  const averagePrice = Number(rawItem?.averagePrice);
  const currentPrice = Number(rawItem?.currentPrice);

  if (!name) return null;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (!Number.isFinite(averagePrice) || averagePrice < 0) return null;
  if (!Number.isFinite(currentPrice) || currentPrice < 0) return null;

  const normalizedType = PORTFOLIO_TYPES.some((item) => item.value === type)
    ? type
    : "other";

  return {
    id: id || createPortfolioId(),
    name,
    type: normalizedType,
    quantity,
    averagePrice,
    currentPrice,
  };
}

function loadPortfolioFromStorage() {
  try {
    const raw = localStorage.getItem(LS_PORTFOLIO);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizePortfolioItem).filter(Boolean);
  } catch {
    return [];
  }
}

function portfolioTypeLabel(value) {
  return PORTFOLIO_TYPES.find((item) => item.value === value)?.label || "Outros";
}

function parseNumber(value, fallback = 0) {
  const cleaned = String(value ?? "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function percent(value, digits = 2) {
  if (!Number.isFinite(value)) return "-";
  return `${value.toFixed(digits)}%`;
}

function monthKey(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function monthsToLabel(months) {
  if (!Number.isFinite(months) || months <= 0) return "-";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years <= 0) return `${rest} mes(es)`;
  if (rest <= 0) return `${years} ano(s)`;
  return `${years} ano(s) e ${rest} mes(es)`;
}

async function fetchSelic() {
  const response = await fetch(
    "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json",
  );
  if (!response.ok) throw new Error("SELIC indisponivel");
  const payload = await response.json();
  const value = parseNumber(payload?.[0]?.valor, NaN);
  if (!Number.isFinite(value)) throw new Error("SELIC invalida");
  return value;
}

async function fetchUsdBrl() {
  const response = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL");
  if (!response.ok) throw new Error("USD/BRL indisponivel");
  const payload = await response.json();
  const quote = payload?.USDBRL;
  const price = Number(quote?.bid);
  const variation = Number(quote?.pctChange);
  if (!Number.isFinite(price)) throw new Error("USD/BRL invalido");
  return {
    price,
    variation: Number.isFinite(variation) ? variation : null,
  };
}

async function fetchBitcoinBrl() {
  const response = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=brl&include_24hr_change=true",
  );
  if (!response.ok) throw new Error("BTC indisponivel");
  const payload = await response.json();
  const price = Number(payload?.bitcoin?.brl);
  const variation = Number(payload?.bitcoin?.brl_24h_change);
  if (!Number.isFinite(price)) throw new Error("BTC invalido");
  return {
    price,
    variation: Number.isFinite(variation) ? variation : null,
  };
}

function simulateCompound(principal, contribution, annualRate, years) {
  const validYears = Math.max(0, Math.floor(years * 12)) / 12;
  const months = Math.max(0, Math.round(validYears * 12));
  const monthlyRate = annualRate / 100 / 12;

  let invested = principal;
  let balance = principal;
  const series = [{ period: "Hoje", invested, balance }];

  for (let month = 1; month <= months; month += 1) {
    if (month > 1 || contribution > 0) {
      balance += contribution;
      invested += contribution;
    }
    balance *= 1 + monthlyRate;

    if (month % 12 === 0 || month === months) {
      const yearNumber = Math.ceil(month / 12);
      series.push({
        period: `Ano ${yearNumber}`,
        invested,
        balance,
      });
    }
  }

  return {
    months,
    invested,
    balance,
    interest: balance - invested,
    series,
  };
}

function solveMonthsToTarget({
  currentCapital,
  monthlyContribution,
  targetCapital,
  monthlyRate,
}) {
  if (targetCapital <= currentCapital) return 0;
  if (monthlyContribution <= 0 && monthlyRate <= 0) return null;

  let capital = currentCapital;
  for (let month = 1; month <= 1200; month += 1) {
    capital = capital * (1 + monthlyRate) + monthlyContribution;
    if (capital >= targetCapital) return month;
  }
  return null;
}

function formatCurrencyOrDash(value) {
  if (!Number.isFinite(value)) return "-";
  return money(value);
}

function variationClass(value) {
  if (!Number.isFinite(value) || value === 0) {
    return "text-slate-500 dark:text-slate-400";
  }
  return value > 0
    ? "text-emerald-600 dark:text-emerald-300"
    : "text-rose-600 dark:text-rose-300";
}

export default function Investments({ transactions = [], categories = [] }) {
  const [marketData, setMarketData] = useState({
    selic: null,
    usd: null,
    btc: null,
    updatedAt: null,
  });
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketWarning, setMarketWarning] = useState("");

  const [principalRaw, setPrincipalRaw] = useState("5000");
  const [monthlyContributionRaw, setMonthlyContributionRaw] = useState("1000");
  const [annualRateRaw, setAnnualRateRaw] = useState("12");
  const [yearsRaw, setYearsRaw] = useState("10");

  const [desiredIncomeRaw, setDesiredIncomeRaw] = useState("5000");
  const [passiveYieldRaw, setPassiveYieldRaw] = useState("10");
  const [currentCapitalRaw, setCurrentCapitalRaw] = useState("10000");
  const [passiveContributionRaw, setPassiveContributionRaw] = useState("1200");

  const [profile, setProfile] = useState("moderado");
  const [reductionPercentRaw, setReductionPercentRaw] = useState("10");
  const [smartRateRaw, setSmartRateRaw] = useState("11");
  const [smartYearsRaw, setSmartYearsRaw] = useState("8");
  const [portfolio, setPortfolio] = useState(() => loadPortfolioFromStorage());
  const [portfolioName, setPortfolioName] = useState("");
  const [portfolioType, setPortfolioType] = useState("fixed_income");
  const [portfolioQuantityRaw, setPortfolioQuantityRaw] = useState("1");
  const [portfolioAveragePriceRaw, setPortfolioAveragePriceRaw] = useState("");
  const [portfolioCurrentPriceRaw, setPortfolioCurrentPriceRaw] = useState("");
  const [portfolioEditingId, setPortfolioEditingId] = useState("");
  const [portfolioError, setPortfolioError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadMarketData() {
      setMarketLoading(true);
      setMarketWarning("");

      const [selicResult, usdResult, btcResult] = await Promise.allSettled([
        fetchSelic(),
        fetchUsdBrl(),
        fetchBitcoinBrl(),
      ]);

      if (!mounted) return;

      const failures = [selicResult, usdResult, btcResult].filter(
        (result) => result.status === "rejected",
      ).length;

      setMarketData({
        selic: selicResult.status === "fulfilled" ? selicResult.value : null,
        usd: usdResult.status === "fulfilled" ? usdResult.value : null,
        btc: btcResult.status === "fulfilled" ? btcResult.value : null,
        updatedAt: new Date(),
      });

      if (failures > 0) {
        setMarketWarning(
          failures === 3
            ? "Nao foi possivel atualizar os indicadores externos agora."
            : "Alguns indicadores externos nao puderam ser atualizados.",
        );
      }

      setMarketLoading(false);
    }

    loadMarketData();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_PORTFOLIO, JSON.stringify(portfolio));
    } catch {
      // Ignora falha de escrita no storage do navegador.
    }
  }, [portfolio]);

  const monthlyFlow = useMemo(() => {
    const map = new Map();
    for (const transaction of transactions) {
      const key = monthKey(transaction.date);
      if (!key) continue;
      const current = map.get(key) ?? { month: key, income: 0, expense: 0 };
      if (transaction.type === "income") current.income += transaction.value;
      if (transaction.type === "expense") current.expense += transaction.value;
      map.set(key, current);
    }

    return Array.from(map.values())
      .sort((a, b) => (a.month > b.month ? 1 : -1))
      .slice(-6)
      .map((item) => ({ ...item, balance: item.income - item.expense }));
  }, [transactions]);

  const averageSurplus = useMemo(() => {
    if (monthlyFlow.length === 0) return 0;
    const recent = monthlyFlow.slice(-3);
    const total = recent.reduce((sum, item) => sum + item.balance, 0);
    return total / recent.length;
  }, [monthlyFlow]);

  const recommendedContribution = Math.max(0, averageSurplus * 0.35);

  const topExpenseCategories = useMemo(() => {
    const ninetyDays = 1000 * 60 * 60 * 24 * 90;
    const map = new Map();
    const referenceTimestamp = transactions.reduce((max, transaction) => {
      const timestamp = new Date(transaction.date).getTime();
      if (Number.isNaN(timestamp)) return max;
      return Math.max(max, timestamp);
    }, 0);
    if (referenceTimestamp <= 0) return [];

    for (const transaction of transactions) {
      if (transaction.type !== "expense") continue;
      const dt = new Date(transaction.date).getTime();
      if (Number.isNaN(dt)) continue;
      if (referenceTimestamp - dt > ninetyDays) continue;

      map.set(
        transaction.categoryId,
        (map.get(transaction.categoryId) ?? 0) + transaction.value,
      );
    }

    return Array.from(map.entries())
      .map(([categoryId, total]) => {
        const category = categories.find((item) => item.id === categoryId);
        return {
          category: category?.name ?? `Categoria ${categoryId}`,
          total,
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [transactions, categories]);

  const principal = Math.max(0, parseNumber(principalRaw, 0));
  const monthlyContribution = Math.max(0, parseNumber(monthlyContributionRaw, 0));
  const annualRate = Math.max(0, parseNumber(annualRateRaw, 0));
  const years = Math.max(0, parseNumber(yearsRaw, 0));

  const compound = useMemo(
    () => simulateCompound(principal, monthlyContribution, annualRate, years),
    [principal, monthlyContribution, annualRate, years],
  );

  const desiredIncome = Math.max(0, parseNumber(desiredIncomeRaw, 0));
  const passiveYield = Math.max(0, parseNumber(passiveYieldRaw, 0));
  const currentCapital = Math.max(0, parseNumber(currentCapitalRaw, 0));
  const passiveContribution = Math.max(0, parseNumber(passiveContributionRaw, 0));

  const monthlyPassiveRate = useMemo(() => {
    if (passiveYield <= 0) return 0;
    return (1 + passiveYield / 100) ** (1 / 12) - 1;
  }, [passiveYield]);

  const requiredCapital = useMemo(() => {
    if (desiredIncome <= 0 || monthlyPassiveRate <= 0) return 0;
    return desiredIncome / monthlyPassiveRate;
  }, [desiredIncome, monthlyPassiveRate]);

  const monthsToGoal = useMemo(
    () =>
      solveMonthsToTarget({
        currentCapital,
        monthlyContribution: passiveContribution,
        targetCapital: requiredCapital,
        monthlyRate: monthlyPassiveRate,
      }),
    [currentCapital, passiveContribution, requiredCapital, monthlyPassiveRate],
  );

  const reductionPercent = Math.max(0, Math.min(100, parseNumber(reductionPercentRaw, 0)));
  const smartRate = Math.max(0, parseNumber(smartRateRaw, 0));
  const smartYears = Math.max(0, parseNumber(smartYearsRaw, 0));

  const totalTopExpenses = topExpenseCategories.reduce((sum, item) => sum + item.total, 0);
  const projectedMonthlyCut = (totalTopExpenses / 3) * (reductionPercent / 100);

  const smartProjection = useMemo(
    () => simulateCompound(0, projectedMonthlyCut, smartRate, smartYears),
    [projectedMonthlyCut, smartRate, smartYears],
  );

  const allocation = PROFILE_OPTIONS[profile] ?? PROFILE_OPTIONS.moderado;
  const portfolioRows = useMemo(() => {
    return portfolio
      .map((item) => {
        const quantity = Number(item.quantity) || 0;
        const averagePrice = Number(item.averagePrice) || 0;
        const currentPrice = Number(item.currentPrice) || 0;
        const invested = quantity * averagePrice;
        const currentValue = quantity * currentPrice;
        const result = currentValue - invested;
        const resultPercent = invested > 0 ? (result / invested) * 100 : 0;

        return {
          ...item,
          quantity,
          averagePrice,
          currentPrice,
          invested,
          currentValue,
          result,
          resultPercent,
        };
      })
      .sort((a, b) => b.currentValue - a.currentValue);
  }, [portfolio]);

  const portfolioTotals = useMemo(() => {
    const invested = portfolioRows.reduce((sum, item) => sum + item.invested, 0);
    const currentValue = portfolioRows.reduce((sum, item) => sum + item.currentValue, 0);
    const result = currentValue - invested;
    const resultPercent = invested > 0 ? (result / invested) * 100 : 0;

    return { invested, currentValue, result, resultPercent };
  }, [portfolioRows]);

  const portfolioByType = useMemo(() => {
    const map = new Map();
    for (const item of portfolioRows) {
      map.set(item.type, (map.get(item.type) ?? 0) + item.currentValue);
    }

    return Array.from(map.entries())
      .map(([type, value]) => ({ type, name: portfolioTypeLabel(type), value }))
      .sort((a, b) => b.value - a.value);
  }, [portfolioRows]);
  const portfolioChartData = useMemo(
    () => portfolioByType.filter((item) => item.value > 0),
    [portfolioByType],
  );

  function resetPortfolioForm() {
    setPortfolioName("");
    setPortfolioType("fixed_income");
    setPortfolioQuantityRaw("1");
    setPortfolioAveragePriceRaw("");
    setPortfolioCurrentPriceRaw("");
    setPortfolioEditingId("");
  }

  function startPortfolioEdit(item) {
    setPortfolioError("");
    setPortfolioEditingId(item.id);
    setPortfolioName(item.name);
    setPortfolioType(item.type);
    setPortfolioQuantityRaw(String(item.quantity));
    setPortfolioAveragePriceRaw(String(item.averagePrice).replace(".", ","));
    setPortfolioCurrentPriceRaw(String(item.currentPrice).replace(".", ","));
  }

  function cancelPortfolioEdit() {
    setPortfolioError("");
    resetPortfolioForm();
  }

  function handlePortfolioDelete(itemId) {
    const confirmed = window.confirm("Deseja excluir este ativo da carteira?");
    if (!confirmed) return;

    setPortfolio((previous) => previous.filter((item) => item.id !== itemId));
    if (portfolioEditingId === itemId) {
      resetPortfolioForm();
    }
  }

  function handlePortfolioSubmit(event) {
    event.preventDefault();
    setPortfolioError("");

    const name = String(portfolioName || "").trim();
    const quantity = parseNumber(portfolioQuantityRaw, NaN);
    const averagePrice = parseNumber(portfolioAveragePriceRaw, NaN);
    const currentPrice = parseNumber(portfolioCurrentPriceRaw, NaN);

    if (!name) {
      setPortfolioError("Informe o nome do ativo.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setPortfolioError("Quantidade deve ser maior que zero.");
      return;
    }
    if (!Number.isFinite(averagePrice) || averagePrice < 0) {
      setPortfolioError("Preco medio invalido.");
      return;
    }
    if (!Number.isFinite(currentPrice) || currentPrice < 0) {
      setPortfolioError("Preco atual invalido.");
      return;
    }

    const payload = {
      id: portfolioEditingId || createPortfolioId(),
      name,
      type: portfolioType,
      quantity,
      averagePrice,
      currentPrice,
    };
    const sanitized = sanitizePortfolioItem(payload);
    if (!sanitized) {
      setPortfolioError("Nao foi possivel salvar o ativo com os dados informados.");
      return;
    }

    setPortfolio((previous) => {
      if (!portfolioEditingId) return [sanitized, ...previous];
      return previous.map((item) => (item.id === portfolioEditingId ? sanitized : item));
    });
    resetPortfolioForm();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard
          title="SELIC"
          value={
            marketLoading
              ? "Atualizando..."
              : marketData.selic !== null
                ? percent(marketData.selic)
                : "-"
          }
          subtitle="Taxa anual"
        />
        <SummaryCard
          title="USD/BRL"
          value={marketLoading ? "Atualizando..." : formatCurrencyOrDash(marketData.usd?.price)}
          subtitle={
            <span className={variationClass(marketData.usd?.variation)}>
              {marketData.usd?.variation !== null && marketData.usd?.variation !== undefined
                ? `${marketData.usd.variation > 0 ? "+" : ""}${percent(marketData.usd.variation)}`
                : "Sem variacao"}
            </span>
          }
        />
        <SummaryCard
          title="Bitcoin (BRL)"
          value={marketLoading ? "Atualizando..." : formatCurrencyOrDash(marketData.btc?.price)}
          subtitle={
            <span className={variationClass(marketData.btc?.variation)}>
              {marketData.btc?.variation !== null && marketData.btc?.variation !== undefined
                ? `${marketData.btc.variation > 0 ? "+" : ""}${percent(marketData.btc.variation)}`
                : "Sem variacao"}
            </span>
          }
        />
        <SummaryCard
          title="Aporte sugerido"
          value={money(recommendedContribution)}
          subtitle="35% da media de saldo mensal"
        />
      </div>

      {marketWarning && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {marketWarning}
        </div>
      )}

      {marketData.updatedAt && (
        <div className="text-xs text-slate-500 dark:text-slate-400">
          Indicadores atualizados em{" "}
          {marketData.updatedAt.toLocaleString("pt-BR", {
            day: "2-digit",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
          .
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Simulador de juros compostos"
            subtitle="Projeta patrimonio com aporte mensal e taxa anual."
          />
          <div className="grid gap-2 md:grid-cols-4">
            <InputMoney
              label="Valor inicial"
              value={principalRaw}
              onChange={setPrincipalRaw}
              placeholder="5000"
            />
            <InputMoney
              label="Aporte mensal"
              value={monthlyContributionRaw}
              onChange={setMonthlyContributionRaw}
              placeholder="1000"
            />
            <InputNumber
              label="Taxa anual (%)"
              value={annualRateRaw}
              onChange={setAnnualRateRaw}
              placeholder="12"
            />
            <InputNumber
              label="Prazo (anos)"
              value={yearsRaw}
              onChange={setYearsRaw}
              placeholder="10"
            />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <InlineStat title="Total investido" value={money(compound.invested)} />
            <InlineStat title="Juros acumulados" value={money(compound.interest)} tone="emerald" />
            <InlineStat title="Patrimonio final" value={money(compound.balance)} tone="blue" />
          </div>

          <div className="mt-4 h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={compound.series}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis />
                <Tooltip formatter={(value) => money(value)} />
                <Line type="monotone" dataKey="invested" name="Capital investido" dot={false} />
                <Line
                  type="monotone"
                  dataKey="balance"
                  name="Patrimonio"
                  dot={false}
                  stroke="#16a34a"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Renda passiva"
            subtitle="Calcula capital alvo e tempo estimado para atingir a meta."
          />

          <div className="space-y-2">
            <InputMoney
              label="Renda desejada por mes"
              value={desiredIncomeRaw}
              onChange={setDesiredIncomeRaw}
              placeholder="5000"
            />
            <InputNumber
              label="Rentabilidade anual liquida (%)"
              value={passiveYieldRaw}
              onChange={setPassiveYieldRaw}
              placeholder="10"
            />
            <InputMoney
              label="Capital atual"
              value={currentCapitalRaw}
              onChange={setCurrentCapitalRaw}
              placeholder="10000"
            />
            <InputMoney
              label="Novo aporte mensal"
              value={passiveContributionRaw}
              onChange={setPassiveContributionRaw}
              placeholder="1200"
            />
          </div>

          <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
            <InfoRow label="Capital necessario" value={money(requiredCapital)} />
            <InfoRow
              label="Tempo estimado para meta"
              value={monthsToGoal === null ? "Nao atinge com parametros atuais" : monthsToLabel(monthsToGoal)}
            />
            <InfoRow
              label="Renda passiva no cenario 1"
              value={money((compound.balance * monthlyPassiveRate) || 0)}
            />
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Aporte inteligente por corte de gastos"
            subtitle="Baseado nas suas maiores categorias de despesa (ultimos 90 dias)."
          />

          <div className="grid gap-2 md:grid-cols-3">
            <InputNumber
              label="Reducao de gastos (%)"
              value={reductionPercentRaw}
              onChange={setReductionPercentRaw}
              placeholder="10"
            />
            <InputNumber
              label="Taxa anual (%)"
              value={smartRateRaw}
              onChange={setSmartRateRaw}
              placeholder="11"
            />
            <InputNumber
              label="Prazo (anos)"
              value={smartYearsRaw}
              onChange={setSmartYearsRaw}
              placeholder="8"
            />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <InlineStat title="Aporte extra estimado/mes" value={money(projectedMonthlyCut)} tone="blue" />
            <InlineStat title="Total aportado" value={money(smartProjection.invested)} />
            <InlineStat title="Patrimonio projetado" value={money(smartProjection.balance)} tone="emerald" />
          </div>

          <div className="mt-4 h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topExpenseCategories}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category" />
                <YAxis />
                <Tooltip formatter={(value) => money(value)} />
                <Bar dataKey="total" name="Despesa (90 dias)">
                  {topExpenseCategories.map((item, index) => (
                    <Cell key={item.category} fill={EXPENSE_COLORS[index % EXPENSE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {topExpenseCategories.length === 0 && (
            <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Sem despesas suficientes para gerar recomendacao automatica.
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Alocacao por perfil"
            subtitle="Distribuicao de carteira sugerida para iniciar."
          />
          <div className="flex flex-wrap gap-2">
            {Object.keys(PROFILE_OPTIONS).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setProfile(key)}
                className={[
                  "rounded-lg border px-3 py-1 text-xs font-medium transition",
                  profile === key
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900",
                ].join(" ")}
              >
                {key}
              </button>
            ))}
          </div>

          <div className="mt-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={allocation} dataKey="value" nameKey="name" outerRadius={80} label />
                <Tooltip formatter={(value) => `${value}%`} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 space-y-2">
            {allocation.map((item, index) => (
              <div
                key={item.name}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800"
              >
                <span className="inline-flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: EXPENSE_COLORS[index % EXPENSE_COLORS.length] }}
                  />
                  {item.name}
                </span>
                <strong>{item.value}%</strong>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Carteira de investimentos"
            subtitle="Gerencie ativos, acompanhe desempenho e mantenha sua posicao atualizada."
          />

          <form onSubmit={handlePortfolioSubmit} className="grid gap-2 md:grid-cols-5">
            <label className="block md:col-span-2">
              <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">Ativo</div>
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
                value={portfolioName}
                onChange={(event) => setPortfolioName(event.target.value)}
                placeholder="Ex: Tesouro Selic, PETR4, BTC"
              />
            </label>
            <label className="block">
              <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">Tipo</div>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
                value={portfolioType}
                onChange={(event) => setPortfolioType(event.target.value)}
              >
                {PORTFOLIO_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            <InputNumber
              label="Quantidade"
              value={portfolioQuantityRaw}
              onChange={setPortfolioQuantityRaw}
              placeholder="1"
            />
            <InputMoney
              label="Preco medio (R$)"
              value={portfolioAveragePriceRaw}
              onChange={setPortfolioAveragePriceRaw}
              placeholder="100,00"
            />
            <InputMoney
              label="Preco atual (R$)"
              value={portfolioCurrentPriceRaw}
              onChange={setPortfolioCurrentPriceRaw}
              placeholder="102,50"
            />
            <div className="flex items-end gap-2 md:col-span-2">
              <button
                type="submit"
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
              >
                {portfolioEditingId ? "Salvar ativo" : "Adicionar ativo"}
              </button>
              {portfolioEditingId && (
                <button
                  type="button"
                  onClick={cancelPortfolioEdit}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>

          {portfolioError && (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
              {portfolioError}
            </div>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="px-2 py-2">Ativo</th>
                  <th className="px-2 py-2">Tipo</th>
                  <th className="px-2 py-2">Qtd.</th>
                  <th className="px-2 py-2">Investido</th>
                  <th className="px-2 py-2">Valor atual</th>
                  <th className="px-2 py-2">Resultado</th>
                  <th className="px-2 py-2">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {portfolioRows.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-slate-100 text-slate-700 dark:border-slate-900 dark:text-slate-200"
                  >
                    <td className="px-2 py-2 font-medium">{item.name}</td>
                    <td className="px-2 py-2">{portfolioTypeLabel(item.type)}</td>
                    <td className="px-2 py-2">{item.quantity.toLocaleString("pt-BR")}</td>
                    <td className="px-2 py-2">{money(item.invested)}</td>
                    <td className="px-2 py-2">{money(item.currentValue)}</td>
                    <td className={["px-2 py-2 font-semibold", variationClass(item.result)].join(" ")}>
                      {money(item.result)} ({percent(item.resultPercent)})
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startPortfolioEdit(item)}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePortfolioDelete(item.id)}
                          className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/30"
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {portfolioRows.length === 0 && (
            <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Nenhum ativo cadastrado ainda. Adicione o primeiro ativo para montar sua carteira.
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Resumo da carteira"
            subtitle="Visao consolidada de valor investido, valor atual e resultado."
          />

          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
            <InfoRow label="Total investido" value={money(portfolioTotals.invested)} />
            <InfoRow label="Valor atual" value={money(portfolioTotals.currentValue)} />
            <InfoRow
              label="Resultado total"
              value={`${money(portfolioTotals.result)} (${percent(portfolioTotals.resultPercent)})`}
            />
          </div>

          <div className="mt-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={portfolioChartData}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={80}
                  label={(entry) => entry.name}
                >
                  {portfolioChartData.map((item, index) => (
                    <Cell key={item.type} fill={EXPENSE_COLORS[index % EXPENSE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => money(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {portfolioChartData.length === 0 && (
            <div className="text-sm text-slate-500 dark:text-slate-400">
              Sem dados suficientes para exibir a distribuicao da carteira.
            </div>
          )}

          <div className="mt-2 space-y-2">
            {portfolioByType.map((item, index) => (
              <div
                key={item.type}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800"
              >
                <span className="inline-flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: EXPENSE_COLORS[index % EXPENSE_COLORS.length] }}
                  />
                  {item.name}
                </span>
                <strong>{money(item.value)}</strong>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}

function Card({ children, className = "" }) {
  return (
    <section
      className={[
        "min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950",
        className,
      ].join(" ")}
    >
      {children}
    </section>
  );
}

function CardHeader({ title, subtitle }) {
  return (
    <div className="mb-3">
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</div>
    </div>
  );
}

function SummaryCard({ title, value, subtitle }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="text-xs text-slate-500 dark:text-slate-400">{title}</div>
      <div className="mt-1 break-words text-lg font-semibold sm:text-xl">{value}</div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtitle}</div>
    </div>
  );
}

function InlineStat({ title, value, tone = "slate" }) {
  const tones = {
    slate: "text-slate-700 dark:text-slate-200",
    emerald: "text-emerald-700 dark:text-emerald-200",
    blue: "text-blue-700 dark:text-blue-200",
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-xs text-slate-500 dark:text-slate-400">{title}</div>
      <div className={["text-sm font-semibold", tones[tone] ?? tones.slate].join(" ")}>{value}</div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <strong className="text-right text-slate-800 dark:text-slate-100">{value}</strong>
    </div>
  );
}

function InputMoney({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <input
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="decimal"
        placeholder={placeholder}
      />
    </label>
  );
}

function InputNumber({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <input
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600/30 dark:border-slate-800 dark:bg-slate-950"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="decimal"
        placeholder={placeholder}
      />
    </label>
  );
}
