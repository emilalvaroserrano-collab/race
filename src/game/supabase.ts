import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);

export type RaceRow = {
  id: string;
  race_number: number;
  phase: "betting" | "racing";
  countdown_start_ms: number | null;
  created_at: string;
};

export type BetRow = {
  id: string;
  race_id: string;
  phone: string;
  kind: string;
  a: number;
  b: number;
  amount: number;
  created_at: string;
};

export type ProfileRow = {
  id: string;
  phone: string;
  pass: string;
  role: "admin" | "player";
  balance: number;
  created_at: string;
};
