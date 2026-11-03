import {
  ArrowLeftRight,
  BarChart3,
  CalendarCheck,
  CalendarClock,
  Car,
  CreditCard,
  Gauge,
  Gem,
  Handshake,
  Landmark,
  LayoutDashboard,
  Link2,
  Newspaper,
  ScanLine,
  Settings as SettingsIcon,
  ShoppingCart,
  Sparkles,
  Target,
  Wallet,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import type { Mode } from "../types";

/** only: aparece só nesse modo (Compras, Veículos e Acerto são da Casa). */
export type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean; only?: Mode };
export type NavGroup = { title: string; items: NavItem[]; only?: Mode };

export const navGroups: NavGroup[] = [
  {
    title: "Menu",
    items: [
      { to: "/", label: "Visão geral", icon: LayoutDashboard, end: true },
      { to: "/assistente", label: "Assistente", icon: Sparkles },
      { to: "/agenda", label: "Agenda", icon: CalendarCheck },
      { to: "/transacoes", label: "Transações", icon: ArrowLeftRight },
      { to: "/escanear", label: "Escanear nota", icon: ScanLine },
      { to: "/cartoes", label: "Cartões", icon: CreditCard },
      { to: "/carteira", label: "Carteira", icon: WalletCards },
      { to: "/contas", label: "Contas", icon: Landmark },
      { to: "/patrimonio", label: "Patrimônio", icon: Gem },
    ],
  },
  {
    title: "Casa",
    only: "casa",
    items: [
      { to: "/compras", label: "Compras e cozinha", icon: ShoppingCart },
      { to: "/veiculos", label: "Veículos", icon: Car },
      { to: "/acerto", label: "Acerto da casa", icon: Handshake },
    ],
  },
  {
    title: "Planejamento",
    items: [
      { to: "/orcamento", label: "Orçamento", icon: Gauge },
      { to: "/contas-fixas", label: "Contas fixas", icon: CalendarClock },
      { to: "/metas", label: "Metas", icon: Target },
      { to: "/dividas", label: "Dívidas", icon: Wallet },
    ],
  },
  {
    title: "Análises",
    items: [
      { to: "/resumo", label: "Resumo do mês", icon: Newspaper },
      { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
      { to: "/conexoes", label: "Open Finance", icon: Link2 },
      { to: "/ajustes", label: "Ajustes", icon: SettingsIcon, only: undefined },
    ],
  },
];

/** Grupos visíveis no modo atual (o grupo Casa só aparece no modo Casa). */
export const groupsFor = (mode: Mode, exclude: string[] = []) =>
  navGroups
    .filter((g) => !g.only || g.only === mode)
    .map((g) => ({ ...g, items: g.items.filter((i) => (!i.only || i.only === mode) && !exclude.includes(i.to)) }))
    .filter((g) => g.items.length > 0);

/** Páginas que pertencem à Casa: abrir uma delas troca o modo para Casa. */
export const casaRoutes = ["/compras", "/veiculos", "/acerto"];
