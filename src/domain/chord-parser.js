/**
 * Módulo de Domínio Puro: Parser Inteligente e Transpositor de Acordes Musicais
 * Complexidade Ciclomática por função <= 5 (Padrão Quality Gate Segundo Cérebro)
 */

const CHORD_REGEX =
  /^[A-G](?:#|b|♯|♭)?(?:m|maj|min|dim|aug|sus|add|M|°|º)?(?:[0-9]{1,2})?(?:M|m|sus[24]?|dim|aug|add[0-9]{1,2}|\([#b+-]?[0-9]{1,2}[#b+-Mm]?(?:[/,][#b+-]?[0-9]{1,2}[#b+-Mm]?)*\)|\/[0-9]{1,2}|[+-])*(?:\/[A-G](?:#|b|♯|♭)?)?$/;

const SECTION_BRACKET_REGEX = /^\[[^\]]+\]$/;
const MIXED_HEADER_PREFIX_REGEX =
  /^(?:intro(?:du[cç][aã]o)?|tom|solo|refr[aã]o|ponte|final|interl[uú]dio|passagem|riff|base)\b[:\s-]*/i;
const REPEAT_MARKER_REGEX = /^\(?[0-9]+x\)?$/i;

const CHROMATIC_SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_TO_INDEX = {
  C: 0, 'B#': 0,
  'C#': 1, Db: 1, 'C♯': 1, 'D♭': 1,
  D: 2,
  'D#': 3, Eb: 3, 'D♯': 3, 'E♭': 3,
  E: 4, Fb: 4,
  F: 5, 'E#': 5,
  'F#': 6, Gb: 6, 'F♯': 6, 'G♭': 6,
  G: 7,
  'G#': 8, Ab: 8, 'G♯': 8, 'A♭': 8,
  A: 9,
  'A#': 10, Bb: 10, 'A♯': 10, 'B♭': 10,
  B: 11, Cb: 11
};

const PORTUGUESE_LYRIC_STOPWORDS = new Set([
  'um', 'uma', 'para', 'que', 'com', 'por', 'sem', 'não', 'nao', 'mas',
  'como', 'mais', 'seu', 'sua', 'meus', 'olhos', 'deus', 'vida', 'amor',
  'caminho', 'porta', 'abrir', 'mundo', 'viver', 'adorar', 'altar',
  'entregar', 'semente', 'brotar', 'vontades', 'morrer', 'hoje', 'preciso'
]);

function cleanChordWrapper(rawToken) {
  let token = rawToken.replace(/^[,.;:!?]+|[,.;:!?]+$/g, '');
  if ((token.startsWith('(') && token.endsWith(')')) || (token.startsWith('[') && token.endsWith(']'))) {
    token = token.slice(1, -1);
  }
  return token;
}

/**
 * Verifica se uma string isolada é um acorde musical válido.
 */
export function isChordToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return false;
  const cleaned = cleanChordWrapper(rawToken);
  if (!cleaned || cleaned.length > 16) return false;
  return CHORD_REGEX.test(cleaned);
}

/**
 * Conta quantos tokens de uma linha são acordes, marcadores ou palavras comuns.
 */
function analyzeLineTokens(trimmedLine) {
  const rawTokens = trimmedLine.split(/[\s|-]+/).filter(Boolean);
  let chordCount = 0;
  let lyricWordCount = 0;
  let markerCount = 0;

  for (const token of rawTokens) {
    if (SECTION_BRACKET_REGEX.test(token) || REPEAT_MARKER_REGEX.test(token)) {
      markerCount++;
    } else if (isChordToken(token)) {
      chordCount++;
    } else if (PORTUGUESE_LYRIC_STOPWORDS.has(token.toLowerCase()) || /[áéíóúâêôãõç]/i.test(token) || token.length >= 3) {
      lyricWordCount++;
    }
  }

  return { total: rawTokens.length, chordCount, lyricWordCount, markerCount };
}

/**
 * Classifica uma linha do arquivo .txt em:
 * 'empty' | 'section-line' | 'chord-line' | 'mixed-line' | 'lyric-line'
 */
export function classifyLine(line) {
  const trimmed = (line || '').trim();
  if (!trimmed) return 'empty';
  if (SECTION_BRACKET_REGEX.test(trimmed)) return 'section-line';

  const stats = analyzeLineTokens(trimmed);
  if (stats.chordCount > 0 && stats.lyricWordCount === 0 && stats.markerCount === 0 && !trimmed.includes(':')) {
    return 'chord-line';
  }

  const hasHeaderPrefix = MIXED_HEADER_PREFIX_REGEX.test(trimmed) || /^\[[^\]]+\]/.test(trimmed);
  if (stats.chordCount > 0 && (hasHeaderPrefix || (stats.lyricWordCount === 0 && stats.markerCount > 0))) {
    return 'mixed-line';
  }

  return 'lyric-line';
}

/**
 * Divide uma linha preservando 100% dos espaços originais para fonte monoespaçada.
 * Retorna array de { text, type: 'space' | 'chord' | 'section' | 'text' }
 */
export function parseLineSegments(line) {
  const lineType = classifyLine(line);
  if (lineType === 'lyric-line' || lineType === 'empty') {
    return [{ text: line, type: 'text', lineType }];
  }
  if (lineType === 'section-line') {
    return [{ text: line, type: 'section', lineType }];
  }

  const parts = line.match(/(\[[^\]]+\]|\s+|[^\s[\]-]+|-)/g) || [line];
  return parts.map((part) => ({
    text: part,
    type: resolveSegmentType(part),
    lineType
  }));
}

function resolveSegmentType(part) {
  if (/^\s+$/.test(part)) return 'space';
  if (SECTION_BRACKET_REGEX.test(part)) return 'section';
  if (isChordToken(part)) return 'chord';
  return 'text';
}

/**
 * Transpõe uma nota raiz individual (ex.: 'G' + 2 -> 'A', 'F#' + 1 -> 'G').
 */
function transposeRootNote(noteStr, semitones) {
  const idx = NOTE_TO_INDEX[noteStr];
  if (idx === undefined) return noteStr;
  const nextIdx = ((idx + semitones) % 12 + 12) % 12;
  return CHROMATIC_SHARPS[nextIdx];
}

/**
 * Transpõe um acorde completo (incluindo baixo invertido como G/B -> A/C#).
 */
export function transposeChord(chordToken, semitones) {
  if (!semitones || !isChordToken(chordToken)) return chordToken;
  return chordToken.replace(/^([A-G](?:#|b|♯|♭)?)(.*?)(\/[A-G](?:#|b|♯|♭)?)?$/, (_, root, quality, bass) => {
    const newRoot = transposeRootNote(root, semitones);
    const newBass = bass ? '/' + transposeRootNote(bass.slice(1), semitones) : '';
    return `${newRoot}${quality}${newBass}`;
  });
}

/**
 * Transpõe todas as linhas de acordes de um texto mantendo alinhamento espacial.
 */
export function transposeText(fullText, semitones) {
  if (!semitones || !fullText) return fullText;
  return fullText
    .split(/\r?\n/)
    .map((line) => transposeSingleLine(line, semitones))
    .join('\n');
}

function transposeSingleLine(line, semitones) {
  const segments = parseLineSegments(line);
  return segments
    .map((seg) => (seg.type === 'chord' ? transposeChord(seg.text, semitones) : seg.text))
    .join('');
}
