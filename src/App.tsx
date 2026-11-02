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
import { Settings } from "./routes/Settings";
import { NotFound } from "./routes/NotFound";
import { Login } from "./routes/Login";
import { HouseSetup } from "./routes/HouseSetup";

export function App() {
  const { loading, session, household, init } = useAuth();
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
  if (!session) return <Login />;
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
        <Route path="ajustes" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
