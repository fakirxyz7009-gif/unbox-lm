import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Initialize GoogleGenAI server-side with telemetry header
const apiKey = process.env.GEMINI_API_KEY || '';
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// 1. AI Device & Chain Generator
app.post('/api/gemini/device-spawn', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!ai) {
      // Fallback generator when API key is missing
      return res.json(getFallbackChain(prompt));
    }

    const systemInstruction = `You are an elite modular synthesizer and studio rack engineer for "Unboxed" DAW.
Available devices:
Synthesizers:
- "subtractor" (Dual-osc analog synth, punchy leads/basses/pads)
- "thor" (Polysonic synth, rich complex textures)
- "europa" (Shapeshifting wavetable synth, futuristic pads & leads)
- "monotone" (Analog bass synth, deep punchy low-end)
Drums & Samplers:
- "redrum" (16-step drum computer with 8 voices: kick, snare, claps, hi-hats, toms)
- "mimic" (8-pad creative sampler)
Sequencers & Modulators:
- "matrix" (16-step pattern sequencer with note, gate, and curve CV)
- "pulsar" (Dual LFO CV modulator)
Effects:
- "scream4" (Distortion, tape warmth, saturation)
- "rv7000" (Flagship convolution reverb)
- "echo" (Stereo delay with feedback and damping)
- "mclass_eq" (4-band mastering EQ)
- "mclass_comp" (Mastering compressor)
- "mclass_max" (Master limiter / maximizer)
- "spider_audio" (Audio splitter/merger)
- "spider_cv" (CV splitter/inverter)

Given the user prompt, configure a complete working rack patch.
Respond with JSON matching the schema:
{
  "rackName": string,
  "description": string,
  "bpm": number,
  "devices": [
    {
      "type": string,
      "customName": string,
      "parameters": Record<string, number | string | boolean>
    }
  ],
  "audioConnections": [
    {
      "sourceDeviceIndex": number,
      "sourceJack": string,
      "targetDeviceIndex": number,
      "targetJack": string
    }
  ],
  "cvConnections": [
    {
      "sourceDeviceIndex": number,
      "sourceJack": string,
      "targetDeviceIndex": number,
      "targetJack": string,
      "amount": number
    }
  ],
  "matrixPattern": {
    "notes": number[],
    "gates": boolean[],
    "curveCV": number[]
  }
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Create a modular rack setup for: "${prompt}". Return valid JSON matching the schema.`,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '{}';
    const parsed = JSON.parse(text);
    return res.json(parsed);
  } catch (error: any) {
    console.error('Error generating device chain:', error);
    // Provide algorithmic fallback
    const { prompt } = req.body;
    return res.json(getFallbackChain(prompt || 'Synthesizer & Effects'));
  }
});

// 2. AI Sound Designer Engine
app.post('/api/generate-sound', async (req, res) => {
  if (!ai) return res.status(500).json({ error: 'API key not configured' });
  const { prompt } = req.body;
  try {
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseModalities: ['AUDIO'],
        systemInstruction: "You are an isolated, high-fidelity sound design synthesizer. Output ONLY raw audio bytes matching the prompt. No text, no intros, no silence.",
      },
    });

    const audioPart = result.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
    if (!audioPart || !audioPart.inlineData || !audioPart.inlineData.data) throw new Error('No audio generated');

    const buffer = Buffer.from(audioPart.inlineData.data as string, 'base64');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(buffer);
  } catch (error) {
    console.error('AI Synthesis Error:', error);
    res.status(500).json({ error: 'Generation failed' });
  }
});

// 2. Musically Relevant Preset Generator
app.post('/api/gemini/generate-preset', async (req, res) => {
  try {
    const { deviceType, prompt } = req.body;
    if (!deviceType || !prompt) {
      return res.status(400).json({ error: 'Device type and prompt are required' });
    }

    if (!ai) {
      return res.json(getFallbackPreset(deviceType, prompt));
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Generate a musically expressive preset for rack device "${deviceType}" based on user prompt: "${prompt}".
Output pure JSON object:
{
  "presetName": string,
  "category": string,
  "description": string,
  "parameters": Record<string, number | string | boolean>
}`,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (error) {
    console.error('Error generating preset:', error);
    const { deviceType, prompt } = req.body;
    return res.json(getFallbackPreset(deviceType, prompt));
  }
});

// 3. AI Mixing & Mastering Assistant
app.post('/api/gemini/mix-master-assistant', async (req, res) => {
  try {
    const { sessionInfo, userGoal } = req.body;

    if (!ai) {
      return res.json(getFallbackMasteringAdvice(userGoal || 'Mastering'));
    }

    const systemInstruction = `You are a legendary Grammy-winning audio mastering engineer and DSP acoustician.
Analyze the provided session structure, stems, dynamic levels, and target genre/goal.
Provide intelligent, actionable audio mixing and mastering recommendations, EQ cuts/boosts, compression ratios, and a ready-to-apply 1-click mastering preset for the MClass Master Section.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Session context: ${JSON.stringify(sessionInfo)}. Goal: "${userGoal || 'Universal Radio Polish'}". Provide analysis and 1-click preset.
Output format JSON:
{
  "summary": string,
  "trackRecommendations": [
    { "track": string, "issue": string, "solution": string, "suggestedEQ": string }
  ],
  "masterBusAnalysis": {
    "dynamicRange": string,
    "perceivedLoudness": string,
    "tonalBalance": string
  },
  "oneClickPreset": {
    "name": string,
    "eqLowGain": number,
    "eqMidGain": number,
    "eqHighGain": number,
    "compThreshold": number,
    "compRatio": number,
    "compAttack": number,
    "compRelease": number,
    "stereoWidth": number,
    "limiterCeiling": number,
    "warmthDrive": number
  }
}`,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (error) {
    console.error('Error generating mix analysis:', error);
    return res.json(getFallbackMasteringAdvice(req.body.userGoal || 'Rock Studio'));
  }
});

// Fallback generators
function getFallbackChain(prompt: string) {
  const lower = prompt.toLowerCase();
  const isBass = lower.includes('bass') || lower.includes('acid') || lower.includes('sub');
  const isAmbient = lower.includes('ambient') || lower.includes('pad') || lower.includes('dream');

  if (isBass) {
    return {
      rackName: 'Gritty Acid Bass Machine',
      description: 'Dual-oscillator Subtractor driving Scream 4 tape saturation with Matrix step modulation.',
      bpm: 128,
      devices: [
        {
          type: 'subtractor',
          customName: 'Subtractor Bass 01',
          parameters: { osc1Type: 'sawtooth', osc2Type: 'square', cutoff: 850, resonance: 4.8, attack: 0.01, decay: 0.25, sustain: 0.4, release: 0.2 },
        },
        {
          type: 'scream4',
          customName: 'Scream 4 Demolition',
          parameters: { drive: 6.5, warmth: 0.75, tone: 5200, mix: 0.85 },
        },
        {
          type: 'echo',
          customName: 'The Echo Slapback',
          parameters: { time: 0.187, feedback: 0.35, damp: 4500, pingPong: true, mix: 0.3 },
        },
        {
          type: 'matrix',
          customName: 'Matrix Bass Arp',
          parameters: { numSteps: 16, resolution: '1/16' },
        },
      ],
      audioConnections: [
        { sourceDeviceIndex: 0, sourceJack: 'audio_out_l', targetDeviceIndex: 1, targetJack: 'audio_in_l' },
        { sourceDeviceIndex: 0, sourceJack: 'audio_out_r', targetDeviceIndex: 1, targetJack: 'audio_in_r' },
        { sourceDeviceIndex: 1, sourceJack: 'audio_out_l', targetDeviceIndex: 2, targetJack: 'audio_in_l' },
        { sourceDeviceIndex: 1, sourceJack: 'audio_out_r', targetDeviceIndex: 2, targetJack: 'audio_in_r' },
      ],
      cvConnections: [
        { sourceDeviceIndex: 3, sourceJack: 'curve_cv', targetDeviceIndex: 0, targetJack: 'cv_cutoff', amount: 0.7 },
        { sourceDeviceIndex: 3, sourceJack: 'gate_cv', targetDeviceIndex: 0, targetJack: 'cv_gate', amount: 1.0 },
      ],
      matrixPattern: {
        notes: [0, 0, 12, 0, 3, 0, 7, 10, 0, 12, 0, 15, 7, 0, 3, 2],
        gates: [true, false, true, false, true, true, false, true, true, false, true, false, true, false, true, true],
        curveCV: [0.9, 0.2, 0.8, 0.1, 0.6, 0.7, 0.1, 0.9, 0.8, 0.1, 0.7, 0.3, 0.9, 0.2, 0.5, 0.4],
      },
    };
  }

  return {
    rackName: 'Nebula Dreamscape',
    description: 'Europa Wavetable Pad soaked in RV7000 Reverb with Pulsar LFO modulation.',
    bpm: 110,
    devices: [
      {
        type: 'europa',
        customName: 'Europa Astral Pad',
        parameters: { wavetableIndex: 2, morph: 0.65, cutoff: 1400, resonance: 2.2, unison: 0.8, attack: 0.4, decay: 1.5, sustain: 0.8, release: 1.8 },
      },
      {
        type: 'echo',
        customName: 'The Echo Space Delay',
        parameters: { time: 0.375, feedback: 0.55, damp: 7000, pingPong: true, mix: 0.4 },
      },
      {
        type: 'rv7000',
        customName: 'RV7000 Hall Reverb',
        parameters: { preset: 'Hall', decay: 4.5, size: 0.85, damping: 6500, mix: 0.5 },
      },
      {
        type: 'pulsar',
        customName: 'Pulsar Slow Modulator',
        parameters: { rate1: 0.4, depth1: 0.8, shape1: 'sine', rate2: 1.2, depth2: 0.5, shape2: 'triangle' },
      },
    ],
    audioConnections: [
      { sourceDeviceIndex: 0, sourceJack: 'audio_out_l', targetDeviceIndex: 1, targetJack: 'audio_in_l' },
      { sourceDeviceIndex: 0, sourceJack: 'audio_out_r', targetDeviceIndex: 1, targetJack: 'audio_in_r' },
      { sourceDeviceIndex: 1, sourceJack: 'audio_out_l', targetDeviceIndex: 2, targetJack: 'audio_in_l' },
      { sourceDeviceIndex: 1, sourceJack: 'audio_out_r', targetDeviceIndex: 2, targetJack: 'audio_in_r' },
    ],
    cvConnections: [
      { sourceDeviceIndex: 3, sourceJack: 'lfo1_out', targetDeviceIndex: 0, targetJack: 'cv_cutoff', amount: 0.5 },
      { sourceDeviceIndex: 3, sourceJack: 'lfo2_out', targetDeviceIndex: 1, targetJack: 'cv_time', amount: 0.3 },
    ],
    matrixPattern: {
      notes: [0, 4, 7, 11, 14, 11, 7, 4, 2, 5, 9, 12, 16, 12, 9, 5],
      gates: [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
      curveCV: [0.5, 0.4, 0.6, 0.3, 0.7, 0.4, 0.6, 0.3, 0.8, 0.5, 0.7, 0.4, 0.9, 0.6, 0.7, 0.5],
    },
  };
}

function getFallbackPreset(deviceType: string, prompt: string) {
  return {
    presetName: `${deviceType.toUpperCase()} - Studio Polish`,
    category: 'Custom AI Voice',
    description: `Engineered preset responding to "${prompt}".`,
    parameters: {
      cutoff: 1650,
      resonance: 3.2,
      drive: 4.5,
      attack: 0.05,
      decay: 0.4,
      sustain: 0.6,
      release: 0.7,
      mix: 0.45,
    },
  };
}

function getFallbackMasteringAdvice(genre: string) {
  return {
    summary: `Mastering profile optimized for "${genre}". Balanced bottom-end weight, transparent mid-range clarity, and pristine harmonic stereo extension.`,
    trackRecommendations: [
      {
        track: 'Kick & Bass Stem',
        issue: 'Sub-bass energy crowding 120Hz-220Hz mud region.',
        solution: 'Apply -2.2dB parametric notch around 180Hz and sidechain compress against kick.',
        suggestedEQ: 'Dip -2.2dB @ 180Hz, Q=1.8',
      },
      {
        track: 'Lead Synth / Guitars',
        issue: 'Harsh resonance in high-mids when distortion drives hard.',
        solution: 'Gentle shelf roll-off at 8.5kHz and smooth tube saturation.',
        suggestedEQ: 'Tame -1.5dB @ 3.4kHz',
      },
      {
        track: 'Drums / Bus',
        issue: 'Snare transient needs punch to cut through dense mix.',
        solution: 'Use slow attack compressor (30ms) to let transient through, followed by 4:1 ratio.',
        suggestedEQ: 'Boost +1.8dB @ 4.5kHz',
      },
    ],
    masterBusAnalysis: {
      dynamicRange: '9.4 LUFS (Optimal Commercial Punch)',
      perceivedLoudness: '-11.2 LUFS Integrated',
      tonalBalance: 'Linear Pink Noise Curve with +1.5dB Low Shelf warmth',
    },
    oneClickPreset: {
      name: 'Analog Studio Master',
      eqLowGain: 1.8,
      eqMidGain: -0.8,
      eqHighGain: 1.4,
      compThreshold: -16,
      compRatio: 2.5,
      compAttack: 25,
      compRelease: 120,
      stereoWidth: 1.25,
      limiterCeiling: -0.2,
      warmthDrive: 2.4,
    },
  };
}

// Full-stack Vite setup: mount Vite dev middleware
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Unboxed DAW server running on http://localhost:${PORT}`);
  });
}

startServer();
