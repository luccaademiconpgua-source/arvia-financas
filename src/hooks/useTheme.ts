import { useEffect } from "react";
import { usePrefs } from "../store/prefs";

/** Mantém data-theme no <html> e a cor da barra do celular de acordo com a preferência. */
export function useThemeSync() {
  const theme = usePrefs((s) => s.theme);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const t = theme === "sistema" ? (mq.matches ? "escuro" : "claro") : theme;
      document.documentElement.dataset.theme = t;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "escuro" ? "#09090b" : "#134E4A");
    };
    apply();
    if (theme !== "sistema") return;
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
}
