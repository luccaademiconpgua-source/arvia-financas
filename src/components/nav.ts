import {
  ArrowLeftRight,
  CreditCard,
  Landmark,
  LayoutDashboard,
  Link2,
  BarChart3,
  Car,
  CalendarClock,
  Gauge,
  WalletCards,
  ShoppingCart,
  Handshake,
  Gem,
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
      { to: "/compras", label: "Compras e cozinha", icon: ShoppingCart },
      { to: "/cartoes", label: "Cartões", icon: CreditCard },
      { to: "/carteira", label: "Carteira", icon: WalletCards },
      { to: "/patrimonio", label: "Patrimônio", icon: Gem },
      { to: "/contas", label: "Contas", icon: Landmark },
      { to: "/veiculos", label: "Veículos", icon: Car },
    ],
  },
  {
    title: "Planejamento",
    items: [
      { to: "/orcamento", label: "Orçamento", icon: Gauge },
      { to: "/contas-fixas", label: "Contas fixas", icon: CalendarClock },
      { to: "/metas", label: "Metas", icon: Target },
      { to: "/dividas", label: "Dívidas", icon: Wallet },
      { to: "/acerto", label: "Acerto da casa", icon: Handshake },
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
  { to: "/compras", label: "Compras e cozinha", icon: ShoppingCart },
  { to: "/carteira", label: "Carteira", icon: WalletCards },
  { to: "/patrimonio", label: "Patrimônio", icon: Gem },
  { to: "/acerto", label: "Acerto da casa", icon: Handshake },
  { to: "/orcamento", label: "Orçamento", icon: Gauge },
  { to: "/contas-fixas", label: "Contas fixas", icon: CalendarClock },
  { to: "/veiculos", label: "Veículos", icon: Car },
  { to: "/contas", label: "Contas", icon: Landmark },
  { to: "/metas", label: "Metas", icon: Target },
  { to: "/dividas", label: "Dívidas", icon: Wallet },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/conexoes", label: "Open Finance", icon: Link2 },
  { to: "/ajustes", label: "Ajustes", icon: SettingsIcon },
];
