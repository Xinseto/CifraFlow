/**
 * Módulo de Domínio Puro: DSP do Afinador de Violão (Cromático + Afinações de Violão)
 * Detecção de pitch via NSDF/Autocorrelação + Interpolação Parabólica e cálculo em cents.
 */

export const CHROMATIC_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const STANDARD_GUITAR_STRINGS = [
  { id: 'E2', stringNumber: 6, note: 'E', octave: 2, freq: 82.41, label: '6ª Corda (Mi grave — E2)' },
  { id: 'A2', stringNumber: 5, note: 'A', octave: 2, freq: 110.00, label: '5ª Corda (Lá — A2)' },
  { id: 'D3', stringNumber: 4, note: 'D', octave: 3, freq: 146.83, label: '4ª Corda (Ré — D3)' },
  { id: 'G3', stringNumber: 3, note: 'G', octave: 3, freq: 196.00, label: '3ª Corda (Sol — G3)' },
  { id: 'B3', stringNumber: 2, note: 'B', octave: 3, freq: 246.94, label: '2ª Corda (Si — B3)' },
  { id: 'E4', stringNumber: 1, note: 'E', octave: 4, freq: 329.63, label: '1ª Corda (Mi aguda — E4)' }
];

export const TUNING_PRESETS = {
  standard: {
    id: 'standard',
    name: 'Violão padrão — E A D G B E',
    strings: STANDARD_GUITAR_STRINGS
  },
  dropD: {
    id: 'dropD',
    name: 'Drop D — D A D G B E',
    strings: [
      { id: 'D2', stringNumber: 6, note: 'D', octave: 2, freq: 73.42, label: '6ª Corda (Ré grave — D2)' },
      ...STANDARD_GUITAR_STRINGS.slice(1)
    ]
  },
  halfStepDown: {
    id: 'halfStepDown',
    name: 'Meio Tom Abaixo (Eb) — D# G# C# F# A# D#',
    strings: [
      { id: 'D#2', stringNumber: 6, note: 'D#', octave: 2, freq: 77.78, label: '6ª Corda (D#2)' },
      { id: 'G#2', stringNumber: 5, note: 'G#', octave: 2, freq: 103.83, label: '5ª Corda (G#2)' },
      { id: 'C#3', stringNumber: 4, note: 'C#', octave: 3, freq: 138.59, label: '4ª Corda (C#3)' },
      { id: 'F#3', stringNumber: 3, note: 'F#', octave: 3, freq: 185.00, label: '3ª Corda (F#3)' },
      { id: 'A#3', stringNumber: 2, note: 'A#', octave: 3, freq: 233.08, label: '2ª Corda (A#3)' },
      { id: 'D#4', stringNumber: 1, note: 'D#', octave: 4, freq: 311.13, label: '1ª Corda (D#4)' }
    ]
  }
};

/**
 * Calcula RMS do sinal de áudio para filtrar ruído de fundo (Noise Gate).
 */
export function computeRms(buffer) {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  return Math.sqrt(sum / buffer.length);
}

/**
 * Calcula a função de diferença quadrática normalizada (NSDF / McLeod Pitch Method)
 * para um lag tau específico.
 */
function computeNsdfAtLag(buffer, size, tau) {
  let acf = 0;
  let div = 0;
  for (let i = 0; i < size - tau; i++) {
    const a = buffer[i];
    const b = buffer[i + tau];
    acf += a * b;
    div += a * a + b * b;
  }
  return div > 0 ? (2 * acf) / div : 0;
}

/**
 * Interpolação parabólica entre (tau-1, tau, tau+1) para precisão sub-sample (< 0.2 cents).
 */
function interpolatePeakLag(nsdf, peakTau) {
  if (peakTau <= 1 || peakTau >= nsdf.length - 1) return peakTau;
  const y1 = nsdf[peakTau - 1];
  const y2 = nsdf[peakTau];
  const y3 = nsdf[peakTau + 1];
  const denom = y1 - 2 * y2 + y3;
  return Math.abs(denom) > 1e-9 ? peakTau + (0.5 * (y1 - y3)) / denom : peakTau;
}

/**
 * Detecta a frequência fundamental f0 (em Hz) de um buffer Float32Array.
 * Retorna -1 se o sinal estiver abaixo do limiar de silêncio ou sem periodicidade clara.
 */
export function detectPitch(buffer, sampleRate = 44100) {
  if (!buffer || buffer.length < 512 || computeRms(buffer) < 0.008) return -1;

  const minFreq = 55;   // A1
  const maxFreq = 1000; // B5
  const minLag = Math.floor(sampleRate / maxFreq);
  const maxLag = Math.min(Math.ceil(sampleRate / minFreq), Math.floor(buffer.length / 2));
  const windowSize = Math.min(buffer.length, maxLag * 2);

  const nsdf = new Float32Array(maxLag + 2);
  for (let tau = minLag; tau <= maxLag + 1; tau++) {
    nsdf[tau] = computeNsdfAtLag(buffer, windowSize, tau);
  }

  const bestLag = findFirstKeyMaximum(nsdf, minLag, maxLag);
  if (bestLag <= 0) return -1;

  const refinedLag = interpolatePeakLag(nsdf, bestLag);
  return sampleRate / refinedLag;
}

/**
 * Encontra o primeiro pico significativo acima de 85% do máximo global (evita erro de oitava).
 */
function findFirstKeyMaximum(nsdf, minLag, maxLag) {
  let globalMax = 0;
  for (let tau = minLag; tau <= maxLag; tau++) {
    if (nsdf[tau] > globalMax) globalMax = nsdf[tau];
  }
  if (globalMax < 0.45) return -1;

  const threshold = globalMax * 0.85;
  for (let tau = minLag + 1; tau < maxLag; tau++) {
    if (nsdf[tau] >= threshold && nsdf[tau] >= nsdf[tau - 1] && nsdf[tau] >= nsdf[tau + 1]) {
      return tau;
    }
  }
  return -1;
}

/**
 * Encontra a corda do violão mais próxima da frequência medida.
 */
function findClosestGuitarString(freqHz, strings) {
  let best = strings[0];
  let minDistance = Infinity;
  for (const s of strings) {
    const centsDist = Math.abs(1200 * Math.log2(freqHz / s.freq));
    if (centsDist < minDistance) {
      minDistance = centsDist;
      best = s;
    }
  }
  return best;
}

/**
 * Analisa uma frequência (Hz) retornando nota cromática, oitava, corda alvo,
 * desvio em cents (-50 a +50) e status ('flat' | 'tuned' | 'sharp').
 */
export function analyzeFrequency(freqHz, options = {}) {
  if (!freqHz || freqHz <= 0) return null;

  const a4 = options.a4 || 440;
  const preset = TUNING_PRESETS[options.presetId] || TUNING_PRESETS.standard;
  const midiFloat = 69 + 12 * Math.log2(freqHz / a4);
  const midiNearest = Math.round(midiFloat);
  const noteName = CHROMATIC_NOTES[((midiNearest % 12) + 12) % 12];
  const octave = Math.floor(midiNearest / 12) - 1;
  const chromaticTargetFreq = a4 * Math.pow(2, (midiNearest - 69) / 12);

  const closestString = options.lockedString || findClosestGuitarString(freqHz, preset.strings);
  const targetFreq = options.mode === 'string' ? closestString.freq : chromaticTargetFreq;
  const rawCents = 1200 * Math.log2(freqHz / targetFreq);
  const cents = Math.max(-50, Math.min(50, Math.round(rawCents * 10) / 10));
  const status = Math.abs(cents) <= 5 ? 'tuned' : cents < 0 ? 'flat' : 'sharp';

  return {
    freqHz: Math.round(freqHz * 100) / 100,
    targetFreq: Math.round(targetFreq * 100) / 100,
    noteName: options.mode === 'string' ? closestString.note : noteName,
    octave: options.mode === 'string' ? closestString.octave : octave,
    fullNote: options.mode === 'string' ? closestString.id : `${noteName}${octave}`,
    cents,
    rawCents: Math.round(rawCents * 10) / 10,
    status,
    closestString
  };
}
