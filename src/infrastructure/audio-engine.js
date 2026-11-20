/**
 * Camada de Infraestrutura: Motor de Áudio Local (AudioEngine)
 * 1. Captura do Microfone em Tempo Real (WebAudio API + AnalyserNode 4096 amostras)
 * 2. Síntese Acústica de Corda de Violão 100% Offline (Harmônicos + Ressonância de Caixa)
 * 3. Modo de Simulação de Pitch para Teste e Treino Auditivo
 */

import { detectPitch, analyzeFrequency } from '../domain/tuner-dsp.js';

export class AudioEngine {
  constructor(onPitchCallback) {
    this.onPitchCallback = onPitchCallback;
    this.audioCtx = null;
    this.mediaStream = null;
    this.sourceNode = null;
    this.analyser = null;
    this.buffer = null;
    this.isListening = false;
    this.rafId = null;
    this.smoothedFreq = 0;
    this.simulatedFreq = null;
    this.tunerOptions = { mode: 'chromatic', presetId: 'standard', lockedString: null };
  }

  setTunerOptions(options) {
    this.tunerOptions = { ...this.tunerOptions, ...options };
    if (this.simulatedFreq) {
      this._emitAnalysis(this.simulatedFreq, true);
    }
  }

  _ensureContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  async startMicrophone() {
    if (this.isListening) return { active: true };
    this.simulatedFreq = null;

    const ctx = this._ensureContext();
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        autoGainControl: false,
        noiseSuppression: false
      }
    });

    this.sourceNode = ctx.createMediaStreamSource(this.mediaStream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 4096;
    this.analyser.smoothingTimeConstant = 0.1;
    this.sourceNode.connect(this.analyser);

    this.buffer = new Float32Array(this.analyser.fftSize);
    this.isListening = true;
    this.smoothedFreq = 0;
    this._loop();
    return { active: true };
  }

  stopMicrophone() {
    this.isListening = false;
    this.simulatedFreq = null;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch (_) {}
      this.sourceNode = null;
    }
    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
      }
      this.mediaStream = null;
    }
  }

  _loop() {
    if (!this.isListening || !this.analyser) return;

    this.analyser.getFloatTimeDomainData(this.buffer);
    const rawFreq = detectPitch(this.buffer, this.audioCtx.sampleRate);

    if (rawFreq > 0) {
      if (this.smoothedFreq <= 0 || Math.abs(rawFreq - this.smoothedFreq) / this.smoothedFreq > 0.08) {
        this.smoothedFreq = rawFreq;
      } else {
        this.smoothedFreq = this.smoothedFreq * 0.72 + rawFreq * 0.28;
      }
      this._emitAnalysis(this.smoothedFreq, false);
    } else {
      this._emitAnalysis(-1, false);
    }

    this.rafId = requestAnimationFrame(() => this._loop());
  }

  _emitAnalysis(freqHz, isSimulated) {
    if (!this.onPitchCallback) return;
    if (freqHz <= 0) {
      this.onPitchCallback({ detected: false, isSimulated });
      return;
    }
    const result = analyzeFrequency(freqHz, this.tunerOptions);
    if (result) {
      this.onPitchCallback({
        detected: true,
        isSimulated,
        ...result
      });
    }
  }

  /**
   * Sintetiza o som realista de uma corda de violão dedilhada (100% offline).
   * Combina fundamental + série harmônica com decaimento exponencial natural de corda de aço/nylon.
   */
  playReferenceNote(freqHz = 82.41, durationSec = 2.4) {
    const ctx = this._ensureContext();
    const now = ctx.currentTime;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.linearRampToValueAtTime(0.42, now + 0.012);
    masterGain.gain.exponentialRampToValueAtTime(0.0008, now + durationSec);

    // Filtro passa-baixa para simular a ressonância quente do tampo de madeira do violão
    const bodyFilter = ctx.createBiquadFilter();
    bodyFilter.type = 'lowpass';
    bodyFilter.frequency.setValueAtTime(Math.min(freqHz * 7.5, 4200), now);
    bodyFilter.frequency.exponentialRampToValueAtTime(Math.max(freqHz * 2.2, 400), now + durationSec * 0.85);

    bodyFilter.connect(masterGain);
    masterGain.connect(ctx.destination);

    const harmonics = [
      { ratio: 1.0, amp: 0.60, decay: 1.0 },
      { ratio: 2.0, amp: 0.28, decay: 0.75 },
      { ratio: 3.0, amp: 0.14, decay: 0.55 },
      { ratio: 4.0, amp: 0.07, decay: 0.40 },
      { ratio: 5.0, amp: 0.03, decay: 0.25 }
    ];

    for (const h of harmonics) {
      const osc = ctx.createOscillator();
      const hGain = ctx.createGain();
      osc.type = h.ratio === 1.0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freqHz * h.ratio, now);

      hGain.gain.setValueAtTime(h.amp, now);
      hGain.gain.exponentialRampToValueAtTime(0.0005, now + durationSec * h.decay);

      osc.connect(hGain);
      hGain.connect(bodyFilter);
      osc.start(now);
      osc.stop(now + durationSec);
    }
  }

  /**
   * Simula a leitura de uma frequência no afinador (e toca o som correspondente).
   */
  simulatePitch(freqHz) {
    this.simulatedFreq = freqHz;
    this.playReferenceNote(freqHz, 1.8);
    this._emitAnalysis(freqHz, true);
  }
}
