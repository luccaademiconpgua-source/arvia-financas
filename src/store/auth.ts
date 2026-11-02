import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { useData } from "./data";

export type Profile = { id: string; name: string; householdId: string | null; transferNames: string[] };
export type Household = { id: string; name: string; inviteCode: string };

type AuthState = {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  household: Household | null;
  members: Profile[];
  init: () => Promise<void>;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
};

async function loadProfile(userId: string) {
  const { data: rows } = await supabase.from("profiles").select("id,name,household_id,transfer_names");
  const all: Profile[] = (rows ?? []).map((r) => ({ id: r.id as string, name: r.name as string, householdId: (r.household_id as string | null) ?? null, transferNames: (r.transfer_names as string[] | null) ?? [] }));
  const me = all.find((p) => p.id === userId) ?? null;
  let household: Household | null = null;
  if (me?.householdId) {
    const { data } = await supabase.from("households").select("id,name,invite_code").eq("id", me.householdId).maybeSingle();
    if (data) household = { id: data.id as string, name: data.name as string, inviteCode: data.invite_code as string };
  }
  return { profile: me, household, members: all.filter((p) => me?.householdId && p.householdId === me.householdId) };
}

export const useAuth = create<AuthState>((set, get) => ({
  loading: true,
  session: null,
  profile: null,
  household: null,
  members: [],
  init: async () => {
    const { data } = await supabase.auth.getSession();
    const apply = async (session: Session | null) => {
      if (!session) {
        useData.getState().clear();
        return set({ session: null, profile: null, household: null, members: [], loading: false });
      }
      const extra = await loadProfile(session.user.id);
      set({ session, ...extra, loading: false });
    };
    await apply(data.session);
    supabase.auth.onAuthStateChange((_event, session) => {
      // adiar: não chamar o Supabase de dentro do callback
      setTimeout(() => void apply(session), 0);
    });
  },
  reload: async () => {
    const s = get().session;
    if (s) set(await loadProfile(s.user.id));
  },
  signOut: async () => {
    await supabase.auth.signOut();
  },
}));
