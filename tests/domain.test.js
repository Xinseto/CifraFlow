import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isChordToken,
  classifyLine,
  parseLineSegments,
  transposeChord,
  transposeText
} from '../src/domain/chord-parser.js';
import {
  STANDARD_GUITAR_STRINGS,
  detectPitch,
  analyzeFrequency
} from '../src/domain/tuner-dsp.js';
import {
  createAutoScrollState,
  toggleAutoScroll,
  adjustAutoScrollSpeed,
  computeScrollDeltaPx
} from '../src/domain/autoscroll-engine.js';

test('ChordParser - identifica acordes simples, compostos, com pestana e baixo invertido', () => {
  const validChords = [
    'G', 'C9', 'Em', 'Bm7', 'G/B', 'F#m', 'A4', 'A#', 'Dm7(9)',
    'C#m7(b5)', 'Bb7M', 'D/F#', 'Asus2', 'E7(9+)', 'F7M(9)', 'Gm6', 'B5'
  ];
  for (const chord of validChords) {
    assert.equal(isChordToken(chord), true, `Esperava que "${chord}" fosse reconhecido como acorde`);
  }

  const invalidWords = [
    'Há', 'caminho', 'para', 'adoração', 'Morrer', 'mundo', 'Deus',
    'espirituais', 'vontades', 'brotar', 'violão', 'ritmo', 'capotraste'
  ];
  for (const word of invalidWords) {
    assert.equal(isChordToken(word), false, `Não esperava que "${word}" fosse reconhecido como acorde`);
  }
});

test('ChordParser - distingue linhas de acordes e linhas de letra com "E" ou "A"', () => {
  assert.equal(classifyLine('G                            Em'), 'chord-line');
  assert.equal(classifyLine('           G/B              Am'), 'chord-line');
  assert.equal(classifyLine('     E   E  A'), 'chord-line');
  assert.equal(classifyLine('D          A    Bm  E     E  A'), 'chord-line');
  assert.equal(classifyLine('[Solo] Am  Dm  G  G  E  D  E  A'), 'mixed-line');
  assert.equal(classifyLine('Intro: G-D-Em-C'), 'mixed-line');
  assert.equal(classifyLine('Introdução: G (2X)'), 'mixed-line');
  assert.equal(classifyLine('Tom: Sol (G)'), 'mixed-line');

  assert.equal(classifyLine('Há um caminho para a adoração'), 'lyric-line');
  assert.equal(classifyLine('E o adorar'), 'lyric-line');
  assert.equal(classifyLine('E me entregar (2X)'), 'lyric-line');
  assert.equal(classifyLine('Adorar a Deus, viver no seu altar'), 'lyric-line');
});

test('ChordParser - preserva rigorosamente o alinhamento monoespaçado ao segmentar linha', () => {
  const rawLine = '           G/B              Am';
  const segments = parseLineSegments(rawLine);
  const reconstructed = segments.map((s) => s.text).join('');
  assert.equal(reconstructed, rawLine);

  const chordSegments = segments.filter((s) => s.type === 'chord').map((s) => s.text);
  assert.deepEqual(chordSegments, ['G/B', 'Am']);
});

test('ChordParser - transpõe acordes mantendo espaçamento original', () => {
  assert.equal(transposeChord('G', 2), 'A');
  assert.equal(transposeChord('Em', 2), 'F#m');
  assert.equal(transposeChord('G/B', 2), 'A/C#');
  assert.equal(transposeChord('Dm7(9)', 2), 'Em7(9)');

  const sample = 'G        Em\nHá um caminho';
  const transposed = transposeText(sample, 2);
  assert.equal(transposed, 'A        F#m\nHá um caminho');
});

test('TunerDSP - detecta frequência fundamental das 6 cordas do violão (E2 a E4) e calcula cents', () => {
  const sampleRate = 44100;
  const bufferSize = 4096;

  for (const stringInfo of STANDARD_GUITAR_STRINGS) {
    const buffer = new Float32Array(bufferSize);
    for (let i = 0; i < bufferSize; i++) {
      const t = i / sampleRate;
      buffer[i] = 0.7 * Math.sin(2 * Math.PI * stringInfo.freq * t) +
                  0.25 * Math.sin(2 * Math.PI * (stringInfo.freq * 2) * t);
    }

    const detectedHz = detectPitch(buffer, sampleRate);
    assert.ok(detectedHz > 0, `Falha ao detectar pitch para ${stringInfo.label}`);
    assert.ok(
      Math.abs(detectedHz - stringInfo.freq) < 0.8,
      `Esperado ~${stringInfo.freq}Hz para ${stringInfo.label}, obtido ${detectedHz}Hz`
    );

    const analysis = analyzeFrequency(detectedHz);
    assert.equal(analysis.closestString.id, stringInfo.id);
    assert.ok(Math.abs(analysis.cents) <= 5, `Cents fora da faixa afinada: ${analysis.cents}`);
    assert.equal(analysis.status, 'tuned');
  }

  // Teste de corda frouxa (bemol) e apertada (sustenido) na corda A2 (110 Hz)
  const flatAnalysis = analyzeFrequency(108.0); // ~ -31.8 cents
  assert.equal(flatAnalysis.noteName, 'A');
  assert.ok(flatAnalysis.cents < -15);
  assert.equal(flatAnalysis.status, 'flat');

  const sharpAnalysis = analyzeFrequency(112.0); // ~ +31.2 cents
  assert.equal(sharpAnalysis.noteName, 'A');
  assert.ok(sharpAnalysis.cents > 15);
  assert.equal(sharpAnalysis.status, 'sharp');
});

test('AutoScrollEngine - inicia em velocidade 1, ajusta com - e + e calcula deslocamento suave', () => {
  let state = createAutoScrollState();
  assert.equal(state.speed, 1);
  assert.equal(state.active, false);

  state = toggleAutoScroll(state);
  assert.equal(state.active, true);

  const deltaSpeed1 = computeScrollDeltaPx(state, 1000);
  assert.ok(deltaSpeed1 > 0);

  state = adjustAutoScrollSpeed(state, 1);
  assert.equal(state.speed, 2);

  const deltaSpeed2 = computeScrollDeltaPx(state, 1000);
  assert.ok(deltaSpeed2 > deltaSpeed1);

  // Não deve cair abaixo de 1
  state = adjustAutoScrollSpeed(state, -5);
  assert.equal(state.speed, 1);
});
