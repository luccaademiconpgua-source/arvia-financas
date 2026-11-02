import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "./index.css";
import { App } from "./App";
import { usePrefs } from "./store/prefs";
import { registerSW } from "virtual:pwa-register";

try {
  // "Modo ao abrir" vale só quando o app abre numa sessão nova do navegador
  if (!sessionStorage.getItem("arvia-booted")) {
    usePrefs.setState((s) => ({ mode: s.startMode }));
    sessionStorage.setItem("arvia-booted", "1");
  }
} catch {
  /* sem sessionStorage: mantém o último modo */
}
registerSW({ immediate: true });

const root = document.getElementById("root");
if (!root) throw new Error("Elemento #root não encontrado");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
