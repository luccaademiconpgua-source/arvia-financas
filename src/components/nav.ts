import {
  ArrowLeftRight,
  CreditCard,
  Landmark,
  LayoutDashboard,
  Link2,
  BarChart3,
  Car,
  CalendarClock,
  ScanLine,
  Settings as SettingsIcon,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };

export const sidebarGroups: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Menu",
    items: [
      { to: "/", label: "Visão geral", icon: LayoutDashboard, end: true },
      { to: "/transacoes", label: "Transações", icon: ArrowLeftRight },
      { to: "/escanear", label: "Escanear nota", icon: ScanLine },
      { to: "/cartoes", label: "Cartões", icon: CreditCard },
      { to: "/contas", label: "Contas", icon: Landmark },
      { to: "/veiculos", label: "Veículos", icon: Car },
    ],
  },
  {
    title: "Planejamento",
    items: [
      { to: "/contas-fixas", label: "Contas fixas", icon: CalendarClock },
      { to: "/metas", label: "Metas", icon: Target },
      { to: "/dividas", label: "Dívidas", icon: Wallet },
    ],
  },
  {
    title: "Análises",
    items: [
      { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
      { to: "/conexoes", label: "Open Finance", icon: Link2 },
    ],
  },
];

export const moreItems: NavItem[] = [
  { to: "/contas-fixas", label: "Contas fixas", icon: CalendarClock },
  { to: "/veiculos", label: "Veículos", icon: Car },
  { to: "/contas", label: "Contas", icon: Landmark },
  { to: "/metas", label: "Metas", icon: Target },
  { to: "/dividas", label: "Dívidas", icon: Wallet },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/conexoes", label: "Open Finance", icon: Link2 },
  { to: "/ajustes", label: "Ajustes", icon: SettingsIcon },
];
