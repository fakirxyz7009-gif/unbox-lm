import React, { useEffect, useState, useRef } from 'react';
import { AudioConnection, CVConnection } from '../audio/types.ts';
import { Zap, X, ArrowRight, CheckCircle2 } from 'lucide-react';

interface CablePatchBayProps {
  rackRef: React.RefObject<HTMLDivElement | null>;
  audioConnections: AudioConnection[];
  cvConnections: CVConnection[];
  activeConnectingJack: { deviceId: string; portId: string; type: string } | null;
  activeSourceDeviceName?: string;
  activeSourcePortName?: string;
  onCancelConnecting?: () => void;
  onDisconnectAudio: (id: string) => void;
  onDisconnectCV: (id: string) => void;
  isBackView: boolean;
}

interface Point {
  x: number;
  y: number;
}

export const CablePatchBay: React.FC<CablePatchBayProps> = ({
  rackRef,
  audioConnections,
  cvConnections,
  activeConnectingJack,
  activeSourceDeviceName,
  activeSourcePortName,
  onCancelConnecting,
  onDisconnectAudio,
  onDisconnectCV,
  isBackView,
}) => {
  const [jackPositions, setJackPositions] = useState<Map<string, Point>>(new Map());
  const [mousePos, setMousePos] = useState<Point>({ x: 0, y: 0 });
  const [hoveredCableId, setHoveredCableId] = useState<string | null>(null);

  // Recalculate jack positions on resize/render/scroll
  const updatePositions = () => {
    if (!rackRef.current || !isBackView) return;
    const rackRect = rackRef.current.getBoundingClientRect();
    const newPositions = new Map<string, Point>();

    const jackElements = rackRef.current.querySelectorAll('[data-jack-id]');
    jackElements.forEach((el) => {
      const id = el.getAttribute('data-jack-id');
      if (id) {
        const rect = el.getBoundingClientRect();
        newPositions.set(id, {
          x: rect.left - rackRect.left + rect.width / 2,
          y: rect.top - rackRect.top + rect.height / 2,
        });
      }
    });

    setJackPositions(newPositions);
  };

  const [swayPhase, setSwayPhase] = useState<number>(0);

  useEffect(() => {
    if (!isBackView) return;
    updatePositions();
    const t1 = setTimeout(updatePositions, 120);
    const t2 = setTimeout(updatePositions, 320);
    const t3 = setTimeout(updatePositions, 540);
    window.addEventListener('resize', updatePositions);

    let rafId: number;
    const start = performance.now();
    const animateSway = (now: number) => {
      const elapsed = (now - start) / 1000;
      setSwayPhase(elapsed);
      rafId = requestAnimationFrame(animateSway);
    };
    rafId = requestAnimationFrame(animateSway);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updatePositions);
    };
  }, [isBackView, audioConnections, cvConnections]);

  // Track mouse position when dragging a cable
  useEffect(() => {
    if (!activeConnectingJack || !rackRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!rackRef.current) return;
      const rackRect = rackRef.current.getBoundingClientRect();
      setMousePos({
        x: e.clientX - rackRect.left,
        y: e.clientY - rackRect.top,
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [activeConnectingJack]);

  if (!isBackView) return null;

  // Helper to construct realistic catenary curve with sag + gentle physics pendulum sway
  const getSagPath = (p1: Point, p2: Point, seed: number = 0) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const sag = Math.min(185, 42 + dist * 0.24);
    const swayX = Math.sin(swayPhase * 1.9 + seed * 1.7) * Math.min(10, 3 + dist * 0.015);
    const swayY = Math.cos(swayPhase * 1.3 + seed) * 2.5;
    const midX = (p1.x + p2.x) / 2 + swayX;
    const midY = Math.max(p1.y, p2.y) + sag + swayY;
    return `M ${p1.x} ${p1.y} Q ${midX} ${midY}, ${p2.x} ${p2.y}`;
  };

  const isCV = activeConnectingJack?.type.startsWith('cv');

  return (
    <>
      {/* Floating Active Cable Guidance HUD */}
      {activeConnectingJack && (
        <div className="sticky top-2 z-40 w-full mb-3 px-4 py-2 rounded-lg bg-neutral-900 border-2 border-emerald-500 shadow-2xl flex items-center justify-between text-xs font-mono animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center space-x-2.5">
            <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center animate-pulse">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="flex items-center space-x-2 font-bold text-neutral-100">
                <span className="text-amber-400 uppercase">PATCH CABLE READY:</span>
                <span>
                  {activeSourceDeviceName || activeConnectingJack.deviceId} &rarr; {activeSourcePortName || activeConnectingJack.portId}
                </span>
                <span className={`px-1.5 py-0.2 rounded text-[10px] uppercase ${isCV ? 'bg-amber-950 text-amber-300' : 'bg-sky-950 text-sky-300'}`}>
                  {isCV ? 'Control Voltage' : 'Audio Signal'}
                </span>
              </div>
              <p className="text-[11px] text-emerald-300 mt-0.5">
                &bull; Click any <strong>green pulsing jack</strong> below to plug the cable in. Invalid jacks are locked.
              </p>
            </div>
          </div>

          <button
            onClick={onCancelConnecting}
            className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-600 hover:text-white flex items-center space-x-1 shadow transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            <span>Cancel Wire</span>
          </button>
        </div>
      )}

      {/* SVG Canvas for Physical Rubber Cables */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-30 overflow-visible"
        style={{ filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.6))' }}
      >
        {/* Render Audio Cables */}
        {audioConnections.map((conn) => {
          const srcKey = `${conn.sourceDeviceId}:${conn.sourcePortId}`;
          const tgtKey = `${conn.targetDeviceId}:${conn.targetPortId}`;
          const p1 = jackPositions.get(srcKey);
          const p2 = jackPositions.get(tgtKey);

          if (!p1 || !p2) return null;

          const pathD = getSagPath(p1, p2);
          const isHovered = hoveredCableId === conn.id;

          return (
            <g
              key={conn.id}
              className="cursor-pointer pointer-events-auto group"
              onMouseEnter={() => setHoveredCableId(conn.id)}
              onMouseLeave={() => setHoveredCableId(null)}
              onClick={(e) => {
                e.stopPropagation();
                onDisconnectAudio(conn.id);
              }}
            >
              {/* Cable shadow */}
              <path
                d={pathD}
                fill="none"
                stroke="#000000"
                strokeWidth="9"
                strokeOpacity="0.45"
                strokeLinecap="round"
                transform="translate(2, 6)"
              />
              {/* Main colored rubber jacket */}
              <path
                d={pathD}
                fill="none"
                stroke={conn.color}
                strokeWidth={isHovered ? 8 : 6}
                strokeLinecap="round"
                className="transition-all duration-100"
              />
              {/* 3D cylindrical specular highlight */}
              <path
                d={pathD}
                fill="none"
                stroke="rgba(255, 255, 255, 0.45)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              {/* Plug barrels at each end */}
              <circle cx={p1.x} cy={p1.y} r="6" fill="#262626" stroke="#a3a3a3" strokeWidth="2" />
              <circle cx={p2.x} cy={p2.y} r="6" fill="#262626" stroke="#a3a3a3" strokeWidth="2" />
            </g>
          );
        })}

        {/* Render CV Cables */}
        {cvConnections.map((conn) => {
          const srcKey = `${conn.sourceDeviceId}:${conn.sourcePortId}`;
          const tgtKey = `${conn.targetDeviceId}:${conn.targetPortId}`;
          const p1 = jackPositions.get(srcKey);
          const p2 = jackPositions.get(tgtKey);

          if (!p1 || !p2) return null;

          const pathD = getSagPath(p1, p2);
          const isHovered = hoveredCableId === conn.id;

          return (
            <g
              key={conn.id}
              className="cursor-pointer pointer-events-auto group"
              onMouseEnter={() => setHoveredCableId(conn.id)}
              onMouseLeave={() => setHoveredCableId(null)}
              onClick={(e) => {
                e.stopPropagation();
                onDisconnectCV(conn.id);
              }}
            >
              {/* Shadow */}
              <path
                d={pathD}
                fill="none"
                stroke="#000000"
                strokeWidth="7"
                strokeOpacity="0.45"
                strokeLinecap="round"
                transform="translate(2, 5)"
              />
              {/* CV Cable sheath */}
              <path
                d={pathD}
                fill="none"
                stroke={conn.color}
                strokeWidth={isHovered ? 6 : 4.5}
                strokeLinecap="round"
                className="transition-all duration-100"
              />
              {/* Highlight */}
              <path
                d={pathD}
                fill="none"
                stroke="rgba(255, 255, 255, 0.6)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              {/* Plug barrels */}
              <circle cx={p1.x} cy={p1.y} r="5" fill="#1e293b" stroke={conn.color} strokeWidth="1.8" />
              <circle cx={p2.x} cy={p2.y} r="5" fill="#1e293b" stroke={conn.color} strokeWidth="1.8" />
            </g>
          );
        })}

        {/* Interactive Drag Cable (when actively connecting) */}
        {activeConnectingJack && (
          (() => {
            const startKey = `${activeConnectingJack.deviceId}:${activeConnectingJack.portId}`;
            const p1 = jackPositions.get(startKey);
            if (!p1) return null;
            const pathD = getSagPath(p1, mousePos);

            return (
              <g className="pointer-events-none">
                <path
                  d={pathD}
                  fill="none"
                  stroke="#000000"
                  strokeWidth="7"
                  strokeOpacity="0.4"
                  strokeLinecap="round"
                  transform="translate(2, 4)"
                />
                <path
                  d={pathD}
                  fill="none"
                  stroke={isCV ? '#06b6d4' : '#10b981'}
                  strokeWidth="5.5"
                  strokeLinecap="round"
                  strokeDasharray="6 3"
                  className="animate-pulse"
                />
                <circle cx={p1.x} cy={p1.y} r="6" fill="#222" stroke="#fff" strokeWidth="2" />
                <circle cx={mousePos.x} cy={mousePos.y} r="6" fill={isCV ? '#06b6d4' : '#10b981'} stroke="#fff" strokeWidth="2" />
              </g>
            );
          })()
        )}
      </svg>
    </>
  );
};
