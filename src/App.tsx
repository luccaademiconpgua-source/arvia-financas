import { useEffect, useState } from "react";
import { Route, Routes } from "react-router";
import { Shell } from "./components/Shell";
import { useAuth } from "./store/auth";
import { Home } from "./routes/Home";
import { Transactions } from "./routes/Transactions";
import { Scan } from "./routes/Scan";
import { CardDetail, Cards } from "./routes/Cards";
import { Accounts } from "./routes/Accounts";
import { Goals } from "./routes/Goals";
import { Debts } from "./routes/Debts";
import { Reports } from "./routes/Reports";
import { Connections } from "./routes/Connections";
import { Vehicles } from "./routes/Vehicles";
import { Recurring } from "./routes/Recurring";
import { Budget } from "./routes/Budget";
import { Wallet as WalletPage } from "./routes/Wallet";
import { Kitchen } from "./routes/Kitchen";
import { Settle } from "./routes/Settle";
import { NetWorth } from "./routes/NetWorth";
import { MonthSummary } from "./routes/MonthSummary";
import { Assistant } from "./routes/Assistant";
import { Agenda } from "./routes/Agenda";
import { Settings } from "./routes/Settings";
import { NotFound } from "./routes/NotFound";
import { Login } from "./routes/Login";
import { HouseSetup } from "./routes/HouseSetup";
import { NewPasswordForm } from "./components/NewPasswordForm";

export function App() {
  const { loading, session, household, init, recovering, setRecovering } = useAuth();
  const [skipHouse, setSkipHouse] = useState(() => {
    try {
      return localStorage.getItem("arvia-skip-house") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    void init();
  }, [init]);

  if (loading) return <p className="p-4 text-muted">Abrindo o Arvia…</p>;
  if (!session) return <Login linkExpired={recovering} />;
  if (recovering) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-8">
        <div>
          <h1 className="text-3xl font-semibold text-brand-dark">Arvia</h1>
          <p className="mt-1 text-sm text-muted">Crie a sua senha nova para {session.user.email}.</p>
        </div>
        <NewPasswordForm
          cta="Salvar e entrar"
          onDone={() => {
            window.history.replaceState(null, "", "/");
            setRecovering(false);
          }}
        />
      </main>
    );
  }
  if (!household && !skipHouse) {
    return (
      <HouseSetup
        onSkip={() => {
          try {
            localStorage.setItem("arvia-skip-house", "1");
          } catch {
            /* sem armazenamento: o aviso volta na próxima visita */
          }
          setSkipHouse(true);
        }}
      />
    );
  }

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Home />} />
        <Route path="transacoes" element={<Transactions />} />
        <Route path="escanear" element={<Scan />} />
        <Route path="cartoes" element={<Cards />} />
        <Route path="cartoes/:id" element={<CardDetail />} />
        <Route path="contas" element={<Accounts />} />
        <Route path="metas" element={<Goals />} />
        <Route path="dividas" element={<Debts />} />
        <Route path="relatorios" element={<Reports />} />
        <Route path="conexoes" element={<Connections />} />
        <Route path="veiculos" element={<Vehicles />} />
        <Route path="contas-fixas" element={<Recurring />} />
        <Route path="orcamento" element={<Budget />} />
        <Route path="carteira" element={<WalletPage />} />
        <Route path="compras" element={<Kitchen />} />
        <Route path="acerto" element={<Settle />} />
        <Route path="patrimonio" element={<NetWorth />} />
        <Route path="resumo" element={<MonthSummary />} />
        <Route path="assistente" element={<Assistant />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="ajustes" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
