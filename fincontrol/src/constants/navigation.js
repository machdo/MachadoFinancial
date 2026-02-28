import {
  LayoutDashboard,
  ArrowLeftRight,
  Tags,
  Wallet,
  User,
  Target,
  BarChart3,
  CandlestickChart,
} from "lucide-react";

export const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "transactions", label: "Transacoes", icon: ArrowLeftRight },
  { key: "categories", label: "Categorias", icon: Tags },
  { key: "accounts", label: "Contas", icon: Wallet },
  { key: "goals", label: "Metas", icon: Target },
  { key: "investments", label: "Investimentos", icon: CandlestickChart },
  { key: "reports", label: "Relatorios", icon: BarChart3 },
  { key: "profile", label: "Minha conta", icon: User },
];
