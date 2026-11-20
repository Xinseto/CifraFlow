/**
 * Módulo de Domínio Puro: Motor de Rolagem Automática (Auto-Scroll)
 * Padrão inicial em velocidade 1, controle contínuo com (-) e (+).
 */

export const MIN_SCROLL_SPEED = 1;
export const MAX_SCROLL_SPEED = 15;
export const DEFAULT_SCROLL_SPEED = 1;

// Velocidade base (em pixels por segundo) para o nível 1.
// Diminua este número para deixar a rolagem mais lenta (ex: 2, 3, 4) ou aumente para deixar mais rápida.
export const BASE_PX_PER_SECOND = 4;

/**
 * Cria o estado inicial da rolagem automática (velocidade inicial = 1).
 */
export function createAutoScrollState(initialSpeed = DEFAULT_SCROLL_SPEED) {
  return {
    active: false,
    speed: clampSpeed(initialSpeed)
  };
}

function clampSpeed(speed) {
  const num = Number(speed) || DEFAULT_SCROLL_SPEED;
  return Math.max(MIN_SCROLL_SPEED, Math.min(MAX_SCROLL_SPEED, Math.round(num)));
}

/**
 * Alterna Play/Pause da rolagem automática.
 */
export function toggleAutoScroll(state, forceActive) {
  const nextActive = typeof forceActive === 'boolean' ? forceActive : !state.active;
  return {
    ...state,
    active: nextActive
  };
}

/**
 * Incrementa (+) ou decrementa (-) a velocidade gradualmente entre 1 e 15.
 */
export function adjustAutoScrollSpeed(state, delta) {
  return {
    ...state,
    speed: clampSpeed(state.speed + delta)
  };
}

/**
 * Calcula quantos pixels a tela deve rolar no intervalo dtMs (em milissegundos).
 * Curva suave calibrada para leitura musical:
 * Velocidade 1 = ~14 px/s (lenta/balada), Velocidade 5 = ~46 px/s, Velocidade 15 = ~170 px/s.
 */
export function computeScrollDeltaPx(state, dtMs) {
  if (!state || !state.active || dtMs <= 0) return 0;
  const pxPerSecond = state.speed * BASE_PX_PER_SECOND;
  return (pxPerSecond * dtMs) / 1000;
}
