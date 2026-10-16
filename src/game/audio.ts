// Mute-aware sound effects. Audio starts muted like the original
// (audio_enable_on_startup: false).
import { Assets, SoundName } from "./assets";

export class Sound {
  muted = true;
  /**
   * Which screen family is showing: "bgm" (menu), "bet" (BGM + announcer),
   * or "race" (crowd bed only). Honored by resume().
   */
  musicMode: "bgm" | "bet" | "race" = "bgm";

  constructor(private assets: Assets) {}

  private el(name: SoundName): HTMLAudioElement | undefined {
    return this.assets.sounds.get(name);
  }

  play(name: SoundName): void {
    if (this.muted) return;
    const a = this.el(name);
    if (!a) return;
    try {
      a.muted = false;
      a.currentTime = 0;
      void a.play();
    } catch {
      /* autoplay policy */
    }
  }

  click(): void {
    this.play("click.mp3");
  }

  chip(): void {
    this.play("chip.mp3");
  }

  /** Track ambience (crowd + running) bed. Loops; safe to call every tap. */
  raceBed(on: boolean, restart = false): void {
    const a = this.el("start_race.mp3");
    if (!a) return;
    try {
      a.loop = true;
      a.volume = 0.85;
      a.muted = this.muted || !on;
      if (on && !this.muted) {
        if (a.paused) {
          if (restart || a.currentTime <= 0) a.currentTime = 0;
          void a.play();
        }
      } else if (!a.paused) {
        a.pause();
      }
    } catch {
      /* autoplay policy */
    }
  }

  /** One-shot announcer voice-over for the race intro. */
  announcer(): void {
    if (this.muted) return;
    const a = this.el("race_intro.mp3");
    if (!a) return;
    try {
      a.loop = false;
      a.volume = 1;
      a.muted = false;
      a.currentTime = 0;
      void a.play();
    } catch {
      /* autoplay policy */
    }
  }

  stopAnnouncer(): void {
    const a = this.el("race_intro.mp3");
    if (a && !a.paused) {
      try {
        a.pause();
      } catch {
        /* ignore */
      }
    }
  }

  /** Re-assert whatever should be audible now (call on user taps). */
  resume(): void {
    if (this.muted) return;
    if (this.musicMode === "race") {
      this.raceBed(true);
      return;
    }
    this.soundtrack(true);
    if (this.musicMode !== "bet") return;
    // Heal a never-started betting announcer (its enter() play may have
    // predated the first user gesture). Never restarts mid/late playback.
    const a = this.el("race_intro.mp3");
    if (a && a.paused && !a.ended && a.currentTime < 1) {
      try {
        a.loop = false;
        a.volume = 1;
        a.muted = false;
        void a.play();
      } catch {
        /* autoplay policy */
      }
    }
  }

  photo(): void {
    this.play("photo.mp3");
  }

  soundtrack(on: boolean): void {
    const a = this.el("soundtrack.mp3");
    if (!a) return;
    try {
      a.loop = true;
      a.muted = this.muted || !on;
      if (on && !this.muted && a.paused) void a.play();
      if (!on && !a.paused) a.pause();
    } catch {
      /* ignore */
    }
  }
}
