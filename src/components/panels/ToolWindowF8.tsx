import React, { useState } from 'react';

export const ToolWindowF8: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const [quantizeGrid, setQuantizeGrid] = useState('1/16');
  const [quantizeAmount, setQuantizeAmount] = useState(100);
  const [humanizeAmt, setHumanizeAmt] = useState(10);
  const [velocityMode, setVelocityMode] = useState<'set' | 'scale' | 'ramp'>('scale');
  const [velocityVal, setVelocityVal] = useState(100);
  const [smoothAmt, setSmoothAmt] = useState(50);

  return (
    <div className="absolute top-16 right-4 z-50 w-80 bg-[#1e1b4b]/95 backdrop-blur-md border-2 border-cyan-500 rounded-xl shadow-2xl p-4 text-cyan-100 font-mono select-none animate-in fade-in zoom-in-95 duration-200">
      <div className="flex items-center justify-between pb-2 border-b border-cyan-800 mb-3">
        <span className="text-xs font-black tracking-widest text-cyan-300 uppercase">F8 // SURGICAL EDITING TOOLS</span>
        <button onClick={onClose} className="text-xs text-cyan-400 hover:text-white font-bold px-1.5 py-0.5 bg-cyan-900/60 rounded border border-cyan-600">✕</button>
      </div>

      <div className="space-y-4 text-xs">
        {/* Quantize Tool */}
        <div className="bg-neutral-900/80 p-2.5 rounded border border-cyan-800/60 space-y-2">
          <div className="flex items-center justify-between font-bold text-cyan-200">
            <span>QUANTIZE & TIMING</span>
            <select value={quantizeGrid} onChange={(e) => setQuantizeGrid(e.target.value)} className="bg-neutral-800 border border-neutral-700 text-[10px] px-1.5 py-0.5 rounded text-cyan-300">
              <option value="1/4">1/4 Beat</option>
              <option value="1/8">1/8 Note</option>
              <option value="1/16">1/16 Note</option>
              <option value="1/32">1/32 Note</option>
              <option value="1/128">1/128 Fine</option>
            </select>
          </div>
          <div className="flex items-center justify-between text-[10px] text-cyan-400">
            <span>Amount: {quantizeAmount}%</span>
            <input type="range" min="0" max="100" value={quantizeAmount} onChange={(e) => setQuantizeAmount(Number(e.target.value))} className="w-36 accent-cyan-400" />
          </div>
          <div className="flex items-center justify-between text-[10px] text-cyan-400">
            <span>Humanize: {humanizeAmt}%</span>
            <input type="range" min="0" max="100" value={humanizeAmt} onChange={(e) => setHumanizeAmt(Number(e.target.value))} className="w-36 accent-cyan-400" />
          </div>
        </div>

        {/* Velocity Tool */}
        <div className="bg-neutral-900/80 p-2.5 rounded border border-cyan-800/60 space-y-2">
          <div className="flex items-center justify-between font-bold text-cyan-200">
            <span>VELOCITY TRANSFORM</span>
            <select value={velocityMode} onChange={(e) => setVelocityMode(e.target.value as any)} className="bg-neutral-800 border border-neutral-700 text-[10px] px-1.5 py-0.5 rounded text-cyan-300">
              <option value="set">Set Fixed Value</option>
              <option value="scale">Scale Velocity</option>
              <option value="ramp">Velocity Ramp</option>
            </select>
          </div>
          <div className="flex items-center justify-between text-[10px] text-cyan-400">
            <span>Value / Scale: {velocityVal}</span>
            <input type="range" min="1" max="127" value={velocityVal} onChange={(e) => setVelocityVal(Number(e.target.value))} className="w-36 accent-cyan-400" />
          </div>
        </div>

        {/* Automation Smoothing */}
        <div className="bg-neutral-900/80 p-2.5 rounded border border-cyan-800/60 space-y-2">
          <div className="flex items-center justify-between font-bold text-cyan-200">
            <span>AUTOMATION CLEANUP</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-cyan-400">
            <span>Smoothing: {smoothAmt}%</span>
            <input type="range" min="0" max="100" value={smoothAmt} onChange={(e) => setSmoothAmt(Number(e.target.value))} className="w-36 accent-cyan-400" />
          </div>
        </div>
      </div>
    </div>
  );
};
