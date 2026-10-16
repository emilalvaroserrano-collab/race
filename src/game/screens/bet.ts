// Bet screen: simple (wins/place/show) and forecast (exacta) pages, chips,
// money panels, pager, start. Geometry measured from the original (see spec).
import {
  BET_WINDOW_S,
  BetKind,
  CHIP_VALUES,
  CURRENCY,
  FONT_DIGI,
  FONT_IMPACT,
  FONT_MOTOR,
  MIN_BET,
  Odds,
  TRAPS,
  fmtMoney,
  fmtOdds,
} from "../constants";
import { Game, Screen } from "../engine";
import { HORSE_A_FRAMES, THUMB_FRAME } from "../horseFrames";
import { drawCentered, drawStateHalf, text } from "../ui";
import { renderMsgDialog } from "./dialogs";
import { MenuScreen } from "./menu";
import { RaceScreen } from "./race";

const PANEL = { x: 51, y: 170, w: 943, h: 508 };

// Simple page columns (design px, panel-local + PANEL.x)
const L_TRAP = { x0: 71, x1: 184 };
const L_COLS = [239.5, 350.5, 462.5]; // WINS/PLACE/SHOW centers, left group
const R_TRAP = { x0: 519, x1: 632 };
const R_COLS = [687.5, 798.5, 910.5];
const ROWS = [256, 374, 492, 610];
const HEADERS = ["TRAP", "WINS", "PLACE", "SHOW"];

// Forecast: 4 columns x 14 rows. Column c holds groups (c, c+4).
// Column starts are panel-relative (match the baked dividers at 20/244/468/692).
const FC_COL_X0 = [20, 244, 468, 692]; // 224-wide columns
const FC_ROW_Y0 = 13; // panel-relative; absolute first row = 183
const FC_ROW_PITCH = 37;

const RIGHT_X = 1036;
const RIGHT_W = 146;

export class BetScreen implements Screen {
  private warn: string | null = null;
  /** Betting window: crowd money trickles in, then the pool locks. */
  private endsAt = 0;
  private autoFired = false;
  private trickleAcc = 0;

  constructor(private game: Game) {}

  enter(): void {
    // Betting phase: BGM + announcer narration. Both cut at race lock.
    this.game.sound.musicMode = "bet";
    this.game.sound.soundtrack(true);
    this.game.sound.announcer();
    this.endsAt = performance.now() + BET_WINDOW_S * 1000;
    this.autoFired = false;
    this.trickleAcc = 0;
  }
  exit(): void {
    this.game.sound.soundtrack(false);
    this.game.sound.stopAnnouncer();
  }
  update(dt: number): void {
    const st = this.game.state;
    // Simulated punters keep betting while the window is open → the
    // estimated multipliers move live.
    this.trickleAcc += dt;
    while (this.trickleAcc >= 2.5) {
      this.trickleAcc -= 2.5;
      st.pool.trickle(st.strength);
    }
    // Auto-start (lock the pool) when the window closes.
    if (!this.autoFired && performance.now() >= this.endsAt) {
      this.autoFired = true;
      this.tryStart();
    }
  }

  /** Seconds left before bets lock. */
  private secondsLeft(): number {
    return Math.max(0, (this.endsAt - performance.now()) / 1000);
  }

  // ---------- shared chrome ----------

  private corners(ctx: CanvasRenderingContext2D): void {
    const g = this.game;
    const B = g.buttons;
    const mk = (x: number, kind: "fs" | "au" | "x") => {
      const b = {
        x, y: 48, w: 55, h: 56,
        onTap: () => {
          if (kind === "fs") {
            g.sound.click();
            g.fullscreen(!document.fullscreenElement);
          } else if (kind === "au") {
            g.sound.click();
            g.sound.muted = !g.sound.muted;
            g.state.muted = g.sound.muted;
            g.sound.soundtrack(!g.sound.muted);
          } else {
            g.sound.click();
            g.show(new MenuScreen(g));
          }
        },
      };
      B.add(b);
      const s = B.isPressed(b) ? 0.92 : 1;
      const cx = b.x + 27.5;
      const cy = b.y + 28;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      ctx.translate(-cx, -cy);
      if (kind === "fs") drawStateHalf(ctx, g.assets, "but_fullscreen", document.fullscreenElement ? 1 : 0, b.x, b.y);
      else if (kind === "au") drawStateHalf(ctx, g.assets, "audio_icon", g.sound.muted ? 1 : 0, b.x, b.y);
      else ctx.drawImage(g.assets.img("but_exit"), b.x, b.y, b.w, b.h);
      ctx.restore();
    };
    mk(1113, "fs");
    mk(1169, "au");
    mk(1225, "x");
  }

  private rightColumn(ctx: CanvasRenderingContext2D): void {
    const g = this.game;
    const st = g.state;
    const B = g.buttons;
    const A = g.assets;

    // CLEAR BET
    const cb = {
      x: RIGHT_X, y: 272, w: RIGHT_W, h: 38,
      onTap: () => {
        if (st.totalBet > 0) {
          g.sound.click();
          st.clearBets();
        }
      },
    };
    B.add(cb);
    {
      const s = B.isPressed(cb) ? 0.95 : 1;
      ctx.save();
      ctx.translate(RIGHT_X + RIGHT_W / 2, 291);
      ctx.scale(s, s);
      ctx.translate(-(RIGHT_X + RIGHT_W / 2), -291);
      ctx.drawImage(A.img("but_clear_bet"), RIGHT_X, 272, RIGHT_W, 38);
      text(ctx, "CLEAR BET", RIGHT_X + RIGHT_W / 2, 292, { font: FONT_IMPACT, size: 26, color: "#ffffff" });
      ctx.restore();
    }

    text(ctx, `MIN BET: 1${CURRENCY}`, RIGHT_X + RIGHT_W / 2, 324, { font: FONT_DIGI, size: 19, color: "#ffe14d" });
    text(ctx, `MAX BET: 100${CURRENCY}`, RIGHT_X + RIGHT_W / 2, 345, { font: FONT_DIGI, size: 19, color: "#ffe14d" });

    // BET + MONEY readouts
    const readout = (y: number, label: string, value: string) => {
      ctx.drawImage(A.img("money_panel"), RIGHT_X, y, RIGHT_W, 49);
      text(ctx, label, RIGHT_X + 14, y + 9, { font: FONT_MOTOR, size: 13, color: "#9fd0ff", align: "left" });
      text(ctx, value, RIGHT_X + RIGHT_W / 2, y + 30, { font: FONT_DIGI, size: 32, color: "#ffe14d" });
    };
    readout(361, "BET", `${CURRENCY}${st.totalBet}`);
    readout(422, "MONEY", `${CURRENCY}${st.money}`);
    // Live pool total under the wallet.
    text(ctx, `POOL ${CURRENCY}${st.pool.total()}`, RIGHT_X + RIGHT_W / 2, 478, {
      font: FONT_DIGI, size: 16, color: "#9fd0ff",
    });

    // Chips
    ctx.drawImage(A.img("fiche_panel"), RIGHT_X, 483, RIGHT_W, 97);
    CHIP_VALUES.forEach((v, i) => {
      const cx = RIGHT_X + 23 + (i % 3) * 50;
      const cy = 507 + Math.floor(i / 3) * 46;
      const b = {
        x: cx - 22, y: cy - 22, w: 44, h: 44,
        onTap: () => {
          g.sound.click();
          st.selectedChip = i;
        },
      };
      B.add(b);
      if (st.selectedChip === i) drawCentered(ctx, A.img("fiche_highlight"), cx, cy, 59, 59);
      drawCentered(ctx, A.img(`fiche_${i}`), cx, cy, 43, 44);
      text(ctx, String(v), cx, cy + 1, { font: FONT_IMPACT, size: 21, color: "#ffffff" });
    });

    // START RACE
    const st2 = {
      x: RIGHT_X, y: 595, w: RIGHT_W, h: 71,
      onTap: () => this.tryStart(),
    };
    B.add(st2);
    {
      const s = B.isPressed(st2) ? 0.95 : 1;
      drawCentered(ctx, A.img("but_start_race"), RIGHT_X + RIGHT_W / 2, 630.5, RIGHT_W * s, 71 * s);
    }
    // Betting window countdown (auto-locks the pool) or broke hint.
    if (st.money < MIN_BET && st.totalBet < MIN_BET) {
      text(ctx, "NO BALANCE", RIGHT_X + RIGHT_W / 2, 588, {
        font: FONT_DIGI, size: 16, color: "#ff7b7b",
      });
    } else {
      const s = Math.ceil(this.secondsLeft());
      text(ctx, `LOCK ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`, RIGHT_X + RIGHT_W / 2, 588, {
        font: FONT_DIGI, size: 16, color: "#ffe14d",
      });
    }
  }

  private tryStart(): void {
    const g = this.game;
    if (!g.state.canStart()) {
      g.sound.click();
      this.warn = "YOUR BET IS LOWER THAN THE MINIMUM ONE!!";
      return;
    }
    g.sound.click();
    g.show(new RaceScreen(g));
  }

  // ---------- simple page ----------

  /** Draw a trap badge from the bibs sheet. */
  private badge(ctx: CanvasRenderingContext2D, trap: number, cx: number, cy: number, size: number): void {
    const sx = (trap % 4) * 72;
    const sy = Math.floor(trap / 4) * 72;
    ctx.drawImage(this.game.assets.img("bibs"), sx, sy, 72, 72, cx - size / 2, cy - size / 2, size, size);
  }

  private betCellButton(kind: BetKind, a: number, b: number, x: number, y: number, w: number, h: number): void {
    this.game.buttons.add({
      x: x - w / 2, y: y - h / 2, w, h,
      onTap: () => {
        if (this.game.state.addBet(kind, a, b)) this.game.sound.chip();
        else this.game.sound.click();
      },
    });
  }

  private simpleRow(ctx: CanvasRenderingContext2D, trap: number, y: number, trapBox: { x0: number; x1: number }, cols: number[], kinds: BetKind[], odds: Odds): void {
    const g = this.game;
    const st = g.state;
    const A = g.assets;
    const tCx = (trapBox.x0 + trapBox.x1) / 2;

    // Horse thumb (3/4 view gallop pose from the packed _a sheet)
    const hs = A.img(`horse_${trap + 1}_a`);
    const [fx, fy, fw, fh] = HORSE_A_FRAMES[trap + 1][THUMB_FRAME];
    const tw = 120;
    const th = (tw / fw) * fh;
    ctx.drawImage(hs, fx, fy, fw, fh, tCx - tw / 2, y - 52, tw, th);
    // Badge overlapping top-left of thumb
    this.badge(ctx, trap, trapBox.x0 + 20, y - 30, 36);
    // Name
    text(ctx, TRAPS[trap].name, tCx, y + 66, { font: FONT_MOTOR, size: 17, color: "#ffffff" });

    cols.forEach((cx, i) => {
      const kind = kinds[i];
      const amt = st.cellAmount(kind, trap);
      // Empty-cell coin icon (odds bars are baked into the panel)
      if (amt <= 0) drawCentered(ctx, A.img("bet_place"), cx, y - 18, 68, 53);
      else {
        // Placed: chip icon + amount
        drawCentered(ctx, A.img(`fiche_${st.cellChipIdx(kind, trap)}`), cx, y - 18, 43, 44);
        text(ctx, fmtMoney(amt), cx, y + 12, { font: FONT_IMPACT, size: 20, color: "#ffffff" });
      }
      if (kind === "win") {
        // Live pari-mutuel price: moves as crowd + player money lands.
        const e = st.pool.est(trap);
        text(ctx, e > 0 ? `x${e.toFixed(2)}` : "-", cx, y + 43, {
          font: FONT_IMPACT, size: 26, color: "#ffe14d",
        });
      } else {
        const o = kind === "place" ? odds.place[trap] : odds.show[trap];
        text(ctx, fmtOdds(o), cx, y + 43, { font: FONT_IMPACT, size: 30, color: "#ffffff" });
      }
      this.betCellButton(kind, trap, -1, cx, y - 10, 76, 100);
    });
  }

  private simplePage(ctx: CanvasRenderingContext2D): void {
    const g = this.game;
    const A = g.assets;
    ctx.drawImage(A.img("simple_bet_panel"), PANEL.x, PANEL.y, PANEL.w, PANEL.h);
    HEADERS.forEach((h, i) => {
      const xs = [127.5, L_COLS[0], L_COLS[1], L_COLS[2]];
      text(ctx, h, xs[i], PANEL.y + 22, { font: FONT_IMPACT, size: 30, color: "#ffffff", spacing: 2 });
    });
    HEADERS.forEach((h, i) => {
      const xs = [575.5, R_COLS[0], R_COLS[1], R_COLS[2]];
      text(ctx, h, xs[i], PANEL.y + 22, { font: FONT_IMPACT, size: 30, color: "#ffffff", spacing: 2 });
    });
    const kinds: BetKind[] = ["win", "place", "show"];
    for (let r = 0; r < 4; r++) {
      this.simpleRow(ctx, r, ROWS[r], L_TRAP, L_COLS, kinds, g.state.odds);
      this.simpleRow(ctx, r + 4, ROWS[r], R_TRAP, R_COLS, kinds, g.state.odds);
    }
  }

  // ---------- forecast page ----------

  private forecastPage(ctx: CanvasRenderingContext2D): void {
    const g = this.game;
    const A = g.assets;
    ctx.drawImage(A.img("forecast_panel"), PANEL.x, PANEL.y, PANEL.w, 509);
    for (let c = 0; c < 4; c++) {
      const x0 = PANEL.x + FC_COL_X0[c];
      for (let r = 0; r < 14; r++) {
        const a = r < 7 ? c : c + 4;
        const b = orderIndex(a, r % 7);
        const y = PANEL.y + FC_ROW_Y0 + r * FC_ROW_PITCH;
        this.badge(ctx, a, x0 + 31, y, 30);
        text(ctx, "x", x0 + 57, y, { font: FONT_IMPACT, size: 19, color: "#ffffff" });
        this.badge(ctx, b, x0 + 81, y, 30);
        const o = g.state.odds.forecast[a][b];
        drawCentered(ctx, A.img("odd_bg"), x0 + 131, y, 92, 36);
        text(ctx, fmtOdds(o), x0 + 131, y - 1, { font: FONT_IMPACT, size: 24, color: "#ffffff" });
        const amt = g.state.cellAmount("forecast", a, b);
        if (amt <= 0) drawCentered(ctx, A.img("bet_place"), x0 + 189, y, 52, 41);
        else {
          drawCentered(ctx, A.img(`fiche_${g.state.cellChipIdx("forecast", a, b)}`), x0 + 189, y - 8, 34, 35);
          text(ctx, fmtMoney(amt), x0 + 189, y + 14, { font: FONT_IMPACT, size: 15, color: "#ffffff" });
        }
        this.betCellButton("forecast", a, b, x0 + 112, y, 210, 35);
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    const g = this.game;
    const A = g.assets;
    ctx.drawImage(A.img("bg_bet_panel"), 0, 0, 1280, 876);

    g.buttons.clear();
    if (g.state.betPage === 0) this.simplePage(ctx);
    else this.forecastPage(ctx);

    // Pager arrows
    const prev = {
      x: 36, y: 358, w: 33, h: 135,
      onTap: () => {
        g.sound.click();
        g.state.betPage = g.state.betPage === 0 ? 1 : 0;
      },
    };
    const next = {
      x: 1096, y: 358, w: 33, h: 135,
      onTap: () => {
        g.sound.click();
        g.state.betPage = g.state.betPage === 0 ? 1 : 0;
      },
    };
    g.buttons.add(prev);
    g.buttons.add(next);
    ctx.drawImage(A.img("arrow_left"), prev.x, prev.y, 33, 135);
    ctx.drawImage(A.img("arrow_right"), next.x, next.y, 33, 135);

    this.rightColumn(ctx);
    this.corners(ctx);

    if (this.warn) {
      const w = this.warn;
      renderMsgDialog(ctx, g, g.buttons, w, () => {
        this.warn = null;
      });
    }
  }

  pointerDown(): void {}
  pointerUp(): void {}
}

/** b-th opponent of a (skipping a itself). */
function orderIndex(a: number, k: number): number {
  let n = -1;
  for (let i = 0; i < 8; i++) {
    if (i === a) continue;
    n++;
    if (n === k) return i;
  }
  return (a + 1) % 8;
}
