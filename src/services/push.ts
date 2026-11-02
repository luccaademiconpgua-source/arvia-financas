import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useRefresh } from "../store/refresh";

// Chave pública VAPID (a privada fica no cofre do Supabase).
const VAPID_PUBLIC = "BJDXZm9z7xROpDIDQ6sHcM0ONEW_iVQR3JcIzfekA4rOPiQnup4lWpNtWIffuTFbX_99qBM6zMkYkMHvkFlCWOg";

export type AppAlert = { key: string; kind: string; severity: number; title: string; body: string; url: string };

/** Avisos de agora (contas, faturas, orçamento, despensa, carro), para o sino. */
export function useAlerts() {
  const version = useRefresh((s) => s.version);
  const [alerts, setAlerts] = useState<AppAlert[]>([]);
  useEffect(() => {
    let alive = true;
    void supabase.rpc("my_alerts").then(({ data }) => alive && setAlerts((data ?? []) as AppAlert[]));
    return () => {
      alive = false;
    };
  }, [version]);
  return alerts;
}

export type PushState = "indisponivel" | "precisa-instalar" | "bloqueado" | "desligado" | "ligado";

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export async function pushState(): Promise<PushState> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return isIos() && !isStandalone() ? "precisa-instalar" : "indisponivel";
  }
  if (Notification.permission === "denied") return "bloqueado";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "ligado" : "desligado";
}

function keyBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function enablePush(): Promise<void> {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Sem permissão, a Arvia não consegue mandar notificações. Libere nas configurações do navegador.");
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) }));
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 300) }, { onConflict: "endpoint" });
  if (error) throw new Error(error.message);
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}

export async function testPush(): Promise<number> {
  const { data, error } = await supabase.functions.invoke("push", { body: { action: "test" } });
  if (error) throw new Error("Não consegui mandar o teste agora.");
  return Number((data as { devices?: number }).devices ?? 0);
}
