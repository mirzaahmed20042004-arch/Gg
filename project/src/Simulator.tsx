import { useEffect, useRef, useState, type ReactNode } from "react";
import { Armchair, ArrowBigUp, ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, DoorClosed, DoorOpen, Expand, Footprints, Hand, Loader2, Moon, PersonStanding, Plane, Sun, Zap } from "lucide-react";
import { createSimulator, type Action, type SimApi, type SimState } from "./three/simulator";
import { cn } from "./utils/cn";

const REACH = 46; // px of joystick travel

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const PROMPT_ICON: Record<string, ReactNode> = {
  "Open door": <DoorOpen className="h-5 w-5" />,
  "Close door": <DoorClosed className="h-5 w-5" />,
  Sit: <Armchair className="h-5 w-5" />,
  "Stand up": <PersonStanding className="h-5 w-5" />,
};

export default function Simulator() {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<SimApi | null>(null);
  const stickRef = useRef<HTMLDivElement>(null);
  const pointerId = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<SimState>({ prompt: null, crouching: false, sitting: false, night: false, jet: false });
  const [knob, setKnob] = useState({ x: 0, y: 0, on: false });
  const [altitude, setAltitude] = useState({ value: 0, on: false });
  const [landscapeFallback, setLandscapeFallback] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const altitudePointer = useRef<number | null>(null);
  const altitudeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const api = createSimulator(host, { onReady: () => setReady(true), onState: setState });
    apiRef.current = api;
    return () => {
      api.dispose();
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    const syncFullscreen = () => {
      if (!document.fullscreenElement) {
        setLandscape(false);
        setLandscapeFallback(false);
        try { screen.orientation?.unlock?.(); } catch { /* browser may not expose orientation lock */ }
      }
    };
    const syncViewport = () => {
      if (landscape && window.innerWidth >= window.innerHeight) setLandscapeFallback(false);
      else if (landscape && !document.fullscreenElement && window.innerHeight > window.innerWidth) setLandscapeFallback(true);
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    window.addEventListener("resize", syncViewport);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      window.removeEventListener("resize", syncViewport);
    };
  }, [landscape]);

  const toggleLandscape = async () => {
    if (landscape) {
      setLandscape(false);
      setLandscapeFallback(false);
      try { await document.exitFullscreen(); } catch { /* not in fullscreen */ }
      try { screen.orientation?.unlock?.(); } catch { /* optional API */ }
      return;
    }
    try {
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    } catch { /* embedded browsers can deny fullscreen */ }
    const orientation = screen.orientation as ScreenOrientation & { lock?: (value: "landscape") => Promise<void> };
    try {
      // Do not await this promise: embedded browsers sometimes never settle it.
      void orientation.lock?.("landscape").catch(() => undefined);
    } catch { /* use the CSS rotate fallback if the browser denies orientation lock */ }
    setLandscape(true);
    // Some embedded browsers resolve orientation.lock without actually rotating their viewport.
    setLandscapeFallback(window.innerHeight > window.innerWidth);
  };

  const steer = (cx: number, cy: number) => {
    const el = stickRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let dx = cx - (r.left + r.width / 2);
    let dy = cy - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > REACH) {
      dx = (dx / d) * REACH;
      dy = (dy / d) * REACH;
    }
    setKnob({ x: dx, y: dy, on: true });
    apiRef.current?.setMove(dx / REACH, -dy / REACH);
  };
  const release = (e: React.PointerEvent) => {
    if (pointerId.current !== e.pointerId) return;
    pointerId.current = null;
    setKnob({ x: 0, y: 0, on: false });
    apiRef.current?.setMove(0, 0);
  };
  const act = (a: Action) => apiRef.current?.act(a);
  const setAltitudeAt = (clientY: number) => {
    const el = altitudeRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const value = clamp((rect.top + rect.height / 2 - clientY) / (rect.height * 0.38), -1, 1);
    setAltitude({ value, on: true });
    apiRef.current?.setAltitude(value);
  };
  const releaseAltitude = (e: React.PointerEvent) => {
    if (altitudePointer.current !== e.pointerId) return;
    altitudePointer.current = null;
    setAltitude({ value: 0, on: false });
    apiRef.current?.setAltitude(0);
  };

  return (
    <div className={`relative h-dvh w-full touch-none select-none overflow-hidden bg-[#0b1420] text-white ${landscapeFallback ? "landscape-fallback" : ""} ${landscape ? "landscape-mode" : ""}`}>
      <div ref={hostRef} className="absolute inset-0" />

      {/* contextual prompt: open / close / sit / stand */}
      {state.prompt && (
        <button
          key={state.prompt}
          onPointerDown={(e) => {
            e.preventDefault();
            act("interact");
          }}
          className="prompt-pop absolute bottom-[190px] left-1/2 z-20 flex items-center gap-2.5 rounded-full border border-amber-200/50 bg-black/55 px-5 py-3 text-sm font-semibold tracking-wide text-amber-100 shadow-[0_10px_40px_rgba(0,0,0,0.45)] backdrop-blur-md active:brightness-125 md:bottom-12 md:text-base"
        >
          {PROMPT_ICON[state.prompt]}
          {state.prompt}
        </button>
      )}

      {/* only two global controls: daylight and large landscape view */}
      {!state.jet && (
        <div className="absolute right-4 top-4 z-20 flex gap-2 md:right-7 md:top-7">
          <button
            onPointerDown={(e) => { e.preventDefault(); apiRef.current?.toggleDay(); }}
            aria-label={state.night ? "Switch to day" : "Switch to night"}
            aria-pressed={state.night}
            className="screen-control"
          >
            {state.night ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </button>
          <button
            onPointerDown={(e) => { e.preventDefault(); void toggleLandscape(); }}
            aria-label={landscape ? "Exit landscape view" : "Open landscape view"}
            aria-pressed={landscape}
            className="screen-control"
          >
            <Expand className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* joystick */}
      <div
        ref={stickRef}
        role="application"
        aria-label="Movement joystick"
        onPointerDown={(e) => {
          e.preventDefault();
          pointerId.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          steer(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => pointerId.current === e.pointerId && steer(e.clientX, e.clientY)}
        onPointerUp={release}
        onPointerCancel={release}
        className="absolute bottom-[max(env(safe-area-inset-bottom),20px)] left-5 z-20 grid h-[132px] w-[132px] place-items-center rounded-full border border-white/20 bg-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur-md md:left-8 md:h-[150px] md:w-[150px]"
      >
        <div aria-hidden className="absolute inset-[30px] rounded-full border border-white/10" />
        <div
          className={cn(
            "h-[58px] w-[58px] rounded-full border border-white/50 bg-gradient-to-br from-white/90 to-white/55 shadow-[0_6px_18px_rgba(0,0,0,0.4)]",
            !knob.on && "transition-transform duration-150"
          )}
          style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
        />
      </div>

      {/* walking actions are replaced by altitude + Jet Off while airborne */}
      <div className="absolute bottom-[max(env(safe-area-inset-bottom),20px)] right-4 z-20 flex max-w-[min(54vw,270px)] flex-wrap justify-end gap-2 md:right-8 md:gap-3">
        {!state.jet ? (
          <>
            <Btn label="Clap" onPress={() => act("clap")}><Hand className="h-5 w-5" /></Btn>
            <Btn label="Kick" onPress={() => act("kick")}><Footprints className="h-5 w-5" /></Btn>
            <Btn label="Punch" onPress={() => act("punch")}><Zap className="h-5 w-5" /></Btn>
            <Btn label={state.crouching ? "Stand" : "Crouch"} active={state.crouching} onPress={() => act("crouch")}>
              {state.crouching ? <ChevronsUp className="h-5 w-5" /> : <ChevronsDown className="h-5 w-5" />}
            </Btn>
            <Btn label="Jump" wide onPress={() => act("jump")}><ArrowBigUp className="h-6 w-6" /></Btn>
            <Btn label="Jet On" wide onPress={() => apiRef.current?.toggleJet()}><Plane className="h-5 w-5" /></Btn>
          </>
        ) : (
          <>
            <div
              ref={altitudeRef}
              role="application"
              aria-label="Jet altitude control"
              onPointerDown={(e) => { e.preventDefault(); altitudePointer.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); setAltitudeAt(e.clientY); }}
              onPointerMove={(e) => altitudePointer.current === e.pointerId && setAltitudeAt(e.clientY)}
              onPointerUp={releaseAltitude}
              onPointerCancel={releaseAltitude}
              className="altitude-control"
            >
              <span className="altitude-label top-2"><ArrowUp className="h-4 w-4" />UP</span>
              <span className="altitude-track" />
              <span className="altitude-knob" style={{ transform: `translate(-50%, calc(-50% + ${-altitude.value * 30}px))` }} />
              <span className="altitude-label bottom-2"><ArrowDown className="h-4 w-4" />DOWN</span>
            </div>
            <Btn label="Jet Off" wide active onPress={() => apiRef.current?.toggleJet()}><Plane className="h-5 w-5" /></Btn>
          </>
        )}
      </div>

      {!ready && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-[#0b1420]">
          <Loader2 className="spin-slow h-8 w-8 text-amber-200" />
          <p className="text-[11px] font-semibold tracking-[0.35em] text-slate-300">FRERE HALL</p>
        </div>
      )}
    </div>
  );
}

function Btn({ label, onPress, active, wide, children }: { label: string; onPress: () => void; active?: boolean; wide?: boolean; children: ReactNode }) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      onPointerDown={(e) => {
        e.preventDefault();
        onPress();
      }}
      className={cn(
        "flex h-[56px] flex-col items-center justify-center gap-0.5 rounded-2xl border text-[9px] font-bold uppercase tracking-[0.14em] shadow-[0_10px_28px_rgba(0,0,0,0.35)] backdrop-blur-md transition-transform active:scale-90 md:h-[64px] md:text-[10px]",
        wide ? "w-[122px] md:w-[146px]" : "w-[56px] md:w-[64px]",
        active ? "border-amber-200/70 bg-amber-400/30 text-amber-100" : "border-white/20 bg-black/30 text-white"
      )}
    >
      {children}
      {label}
    </button>
  );
}
