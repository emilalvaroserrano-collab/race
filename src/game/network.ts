import { supabase } from "./supabase";
import type { RaceRow, BetRow } from "./supabase";
import type { BetKind } from "./constants";

export class Network {
  race: RaceRow | null = null;
  bets: BetRow[] = [];
  phone: string | null = null;
  private racesChannel: ReturnType<typeof supabase.channel> | null = null;
  private betsChannel: ReturnType<typeof supabase.channel> | null = null;
  public onChange: () => void = () => {};

  async init(): Promise<void> {
    await this.loadCurrentRace();
    this.subRaces();
    if (this.race) this.subBets(this.race.id);
  }

  async loadCurrentRace(): Promise<void> {
    const { data } = await supabase
      .from("races")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      this.race = data as RaceRow;
    } else {
      this.race = await this.createRace(1);
    }
    await this.loadBets();
  }

  async createRace(num: number): Promise<RaceRow> {
    const { data } = await supabase
      .from("races")
      .insert({ race_number: num, phase: "betting", countdown_start_ms: null })
      .select()
      .single();
    return data as RaceRow;
  }

  async loadBets(): Promise<void> {
    if (!this.race) return;
    const { data } = await supabase
      .from("bets")
      .select("*")
      .eq("race_id", this.race.id)
      .order("created_at", { ascending: true });
    this.bets = (data as BetRow[]) ?? [];
  }

  async auth(phone: string): Promise<void> {
    this.phone = phone;
  }

  async placeBet(kind: BetKind, a: number, b: number, amount: number): Promise<void> {
    if (!this.race || this.race.phase !== "betting" || !this.phone) return;
    if (!Number.isFinite(amount) || amount <= 0) return;
    await supabase.from("bets").insert({
      race_id: this.race.id,
      phone: this.phone,
      kind,
      a,
      b: b < 0 ? -1 : b,
      amount,
    });
    // try to start countdown if 2+ distinct horses have bets
    await this.tryStartCountdown();
  }

  private async tryStartCountdown(): Promise<void> {
    if (!this.race || this.race.countdown_start_ms) return;
    const horsess = new Set<number>();
    for (const bt of this.bets) {
      horsess.add(bt.a);
      if (bt.b >= 0) horsess.add(bt.b);
    }
    if (horsess.size < 2) return;
    const start = Date.now();
    // atomic: only set if still null
    const { data, error } = await supabase
      .from("races")
      .update({ countdown_start_ms: start })
      .eq("id", this.race.id)
      .is("countdown_start_ms", null)
      .select();
    if (!error && data && data.length > 0) {
      this.race = { ...this.race, countdown_start_ms: start };
      this.onChange();
    } else {
      // someone else set it; reload
      await this.loadCurrentRace();
    }
  }

  async clearBets(): Promise<void> {
    if (!this.race || !this.phone) return;
    await supabase
      .from("bets")
      .delete()
      .eq("race_id", this.race.id)
      .eq("phone", this.phone);
  }

  async nextRace(): Promise<void> {
    const num = (this.race?.race_number ?? 0) + 1;
    const r = await this.createRace(num);
    this.race = r;
    this.bets = [];
    this.unsubBets();
    this.subBets(r.id);
    await this.loadBets();
    this.onChange();
  }

  // ticked from update loop
  tick(): void {
    if (!this.race) return;
    // If race countdown has elapsed, transition to racing
    if (
      this.race.phase === "betting" &&
      this.race.countdown_start_ms !== null
    ) {
      const elapsed = Date.now() - this.race.countdown_start_ms;
      if (elapsed >= 60_000) {
        // try to mark racing
        void this.markRacing();
      }
    }
  }

  private async markRacing(): Promise<void> {
    if (!this.race || this.race.phase !== "betting") return;
    const { data } = await supabase
      .from("races")
      .update({ phase: "racing" })
      .eq("id", this.race.id)
      .eq("phase", "betting")
      .select();
    if (data && data.length > 0) {
      this.race = { ...this.race, phase: "racing" };
      this.onChange();
    } else {
      this.loadCurrentRace().then(() => this.onChange());
    }
  }

  // countdown seconds left
  secondsLeft(): number {
    if (!this.race || this.race.countdown_start_ms === null) return 0;
    const elapsed = (Date.now() - this.race.countdown_start_ms) / 1000;
    return Math.max(0, 60 - elapsed);
  }

  countdownActive(): boolean {
    return this.race !== null && this.race.countdown_start_ms !== null;
  }

  myBets(): BetRow[] {
    if (!this.phone) return [];
    return this.bets.filter((b) => b.phone === this.phone);
  }

  horsesWithBets(): number[] {
    const s = new Set<number>();
    for (const b of this.bets) {
      s.add(b.a);
      if (b.b >= 0) s.add(b.b);
    }
    return [...s];
  }

  poolTotal(): number {
    return this.bets.reduce((s, b) => s + b.amount, 0);
  }

  isRacing(): boolean {
    return this.race?.phase === "racing";
  }

  private subRaces(): void {
    this.racesChannel = supabase
      .channel("races_channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "races" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const r = payload.new as RaceRow;
            // new race superseded
            this.race = r;
            this.subBets(r.id);
          } else if (payload.eventType === "UPDATE") {
            const r = payload.new as RaceRow;
            if (this.race && r.id === this.race.id) this.race = r;
          }
          this.loadBets();
          this.onChange();
        },
      )
      .subscribe();
  }

  private subBets(raceId: string): void {
    this.unsubBets();
    this.betsChannel = supabase
      .channel(`bets_${raceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bets", filter: `race_id=eq.${raceId}` },
        async () => {
          await this.loadBets();
          // try starting countdown when a new bet comes in
          if (this.race?.phase === "betting" && !this.race.countdown_start_ms) {
            await this.tryStartCountdown();
          }
          this.onChange();
        },
      )
      .subscribe();
  }

  private unsubBets(): void {
    if (this.betsChannel) {
      supabase.removeChannel(this.betsChannel);
      this.betsChannel = null;
    }
  }
}

// kept for legacy type compat
export const BetKindCompat = "win";
