// Bet screen: 8 horse cards with easy quick-bet buttons + custom amount.
// Uses Supabase for centralized wagering.
import { CURRENCY, TRAPS } from "../constants";
import { Game, Screen } from "../engine";
import { Auth } from "../auth";
import { RaceScreen } from "./race";

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

export class BetScreen implements Screen {
  private raceNumber = 0;
  private countdown = 0;


  constructor(private game: Game) {
    this.game.net.onChange = () => {};
    void this.game.net.loadCurrentRace().then(() => {
      this.refresh();
    });
  }

  enter(): void {
    this.game.sound.musicMode = "bet";
    this.game.sound.soundtrack(true);
    this.game.sound.announcer();
    el("bet-overlay")?.classList.remove("hidden");
    this.renderCards();
    this.wireOverlay();
    this.refresh();
  }

  exit(): void {
    this.game.sound.soundtrack(false);
    this.game.sound.stopAnnouncer();
    this.game.net.onChange = () => {};
    el("bet-overlay")?.classList.add("hidden");
    // unwind event handlers by re-cloning inputs is overkill; just leave
  }

  update(): void {
    this.game.net.tick();
    this.countdown = this.game.net.secondsLeft();
    const left = Math.ceil(this.countdown);
    const cd = el("bet-countdown");
    if (cd) cd.textContent = this.countdown > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "WAITING";
    if (el("bet-race")) el("bet-race")!.textContent = String(this.game.net.race?.race_number ?? this.raceNumber);
    if (el("bet-bal")) el("bet-bal")!.textContent = this.game.state.money.toFixed(2);
    if (this.game.net.isRacing()) {
      this.game.show(new RaceScreen(this.game));
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    const g = this.game;
    const A = g.assets;
    ctx.drawImage(A.img("bg_bet_panel"), 0, 0, 1280, 876);
    // minimal title
  }

  pointerDown(): void {}
  pointerUp(): void {}

  private refresh(): void {
    this.raceNumber = this.game.net.race?.race_number ?? this.raceNumber;
    if (el("bet-race")) el("bet-race")!.textContent = String(this.raceNumber);
    if (el("bet-bal")) el("bet-bal")!.textContent = this.game.state.money.toFixed(2);
  }

  private renderCards(): void {
    const grid = el<HTMLElement>("bet-grid");
    if (!grid) return;
    grid.innerHTML = "";
    for (let i = 0; i < 8; i++) {
      const card = document.createElement("div");
      card.className = "bethorse";
      card.dataset.trap = String(i);
      const name = TRAPS[i]?.name ?? `Horse ${i + 1}`;
      const backed = this.game.net.horsesWithBets().includes(i);
      const thumb = `<img src="/sprites/horse_${i + 1}_a.png" onerror="this.style.display='none'" />`;
      const quickBtns = [10, 20, 50]
        .map((amt) => `<button data-amt="${amt}" data-trap="${i}">${CURRENCY}${amt}</button>`)
        .join("");
      card.innerHTML = `${thumb}<div class="name">${name}</div><div class="quick">${quickBtns}</div><div class="backed">${backed ? "● LIVE" : ""}</div>`;
      grid.appendChild(card);
    }

    const horseSelect = el<HTMLSelectElement>("bet-horse");
    if (horseSelect) {
      horseSelect.innerHTML = "";
      for (let i = 0; i < 8; i++) {
        const opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = TRAPS[i]?.name ?? `Horse ${i + 1}`;
        horseSelect.appendChild(opt);
      }
    }

    // quick bet handlers
    grid.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const trap = parseInt(btn.getAttribute("data-trap") ?? "0", 10);
        const amt = parseInt(btn.getAttribute("data-amt") ?? "0", 10);
        void this.placeBet(trap, amt);
      });
    });
  }

  private wireOverlay(): void {
    const amt = el<HTMLInputElement>("bet-amt");
    const confirm = el<HTMLButtonElement>("bet-confirm");
    const horseSel = el<HTMLSelectElement>("bet-horse");
    const msg = el<HTMLElement>("bet-msg");
    if (amt && confirm) {
      const handler = () => {
        const val = parseFloat(amt.value || "0");
        const ok = isFinite(val) && val > 0 && val <= this.game.state.money;
        confirm.style.display = ok ? "block" : "none";
      };
      amt.addEventListener("input", handler);
      confirm.addEventListener("click", () => {
        const val = parseFloat(amt.value || "0");
        const trap = parseInt(horseSel?.value ?? "0", 10);
        if (val <= 0 || val > this.game.state.money) {
          if (msg) msg.textContent = "Insufficient balance.";
          return;
        }
        void this.placeBet(trap, val).then(() => {
          amt.value = "";
          confirm.style.display = "none";
        });
      });
    }

  }

  private async placeBet(trap: number, amount: number): Promise<void> {
    const g = this.game;
    const msg = el<HTMLElement>("bet-msg");
    if (g.state.money < amount) {
      if (msg) msg.textContent = "Not enough balance.";
      return;
    }
    if (amount <= 0) return;
    // deduct balance
    g.state.money = Math.round((g.state.money - amount) * 100) / 100;
    Auth.adjustBalance(g.state.phone ?? "09123456789", -amount);
    // send bet to supabase
    await g.net.placeBet("win" as any, trap, -1, amount);
    if (msg) msg.textContent = `Bet placed: ₱${amount} on ${TRAPS[trap]?.name ?? "trap " + trap}.`;
    this.refresh();
  }
}
