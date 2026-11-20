/**
 * Camada de Aplicação: Controlador Principal do CifraFlow (AppController)
 * Orquestra:
 * - Seleção de pasta nativa ("Open Folder") e listagem recursiva de .txt
 * - Leitor monoespaçado com destaque de acordes em Laranja (#FF7A00), 1/2 colunas e transposição
 * - Rolagem automática flutuante (- / 1 / +)
 * - Editor integrado (.txt) com salvamento direto no arquivo original em disco
 * - Afinador de Violão (Microfone em tempo real + Síntese acústica das 6 cordas)
 * - Tema Dark / Light e Configurações persistentes
 */

import { parseLineSegments, transposeText } from '../domain/chord-parser.js';
import {
  CHROMATIC_NOTES,
  TUNING_PRESETS,
  STANDARD_GUITAR_STRINGS
} from '../domain/tuner-dsp.js';
import {
  createAutoScrollState,
  toggleAutoScroll,
  adjustAutoScrollSpeed,
  computeScrollDeltaPx
} from '../domain/autoscroll-engine.js';
import { HostBridge } from '../infrastructure/host-bridge.js';
import { AudioEngine } from '../infrastructure/audio-engine.js';
import { TunerGaugeRenderer } from '../ui/tuner-gauge.js';

export class AppController {
  constructor() {
    this.bridge = new HostBridge();
    this.audio = new AudioEngine((pitchData) => this.handlePitchUpdate(pitchData));
    this.gauge = null;

    this.state = {
      activeTab: 'reader',
      files: [],
      filteredFiles: [],
      searchQuery: '',
      currentFolder: '',
      currentFile: null,
      rawContent: '',
      transposeSemitones: 0,
      editorDirty: false,
      settings: {
        theme: 'dark',
        chordColor: '#FF7A00',
        fontSize: 16,
        columns: 1,
        scrollSpeed: 1
      },
      autoScroll: createAutoScrollState(1),
      tuner: {
        mode: 'chromatic', // 'chromatic' | 'string' | 'eartrain'
        presetId: 'standard',
        selectedStringIdx: 0
      }
    };

    this.lastScrollFrameTime = 0;
    this.scrollAccumulator = 0;
    this.scrollRafId = null;
  }

  async init() {
    this.gauge = new TunerGaugeRenderer(document.getElementById('tuner-gauge-canvas'));
    this.bindEvents();
    this.renderTunerStringsAndNotes();
    this.gauge.draw();

    const initData = await this.bridge.init();
    this.state.settings = { ...this.state.settings, ...(initData.settings || {}) };
    this.state.autoScroll = createAutoScrollState(this.state.settings.scrollSpeed || 1);
    this.state.currentFolder = initData.currentFolder || '';
    this.state.files = initData.files || [];

    this.applySettingsToDOM();
    this.updateFolderHeader();
    this.filterSongs('');

    if (this.state.files.length > 0) {
      const remembered = this.state.files.find((f) => f.fullPath === this.state.settings.lastFile);
      await this.selectSong(remembered || this.state.files[0]);
    } else {
      this.renderEmptyReaderState();
    }

    const platformEl = document.getElementById('platform-indicator');
    if (platformEl) {
      platformEl.textContent =
        initData.platform === 'windows-native-desktop'
          ? 'Windows Desktop Nativo • 100% Offline'
          : 'Modo Local Multiplataforma • 100% Offline';
    }
  }

  bindEvents() {
    // Menu Lateral (Sidebar / Drawer)
    document.getElementById('btn-toggle-sidebar')?.addEventListener('click', () => this.toggleSidebar());
    document.getElementById('btn-close-drawer')?.addEventListener('click', () => this.toggleSidebar(false));
    document.getElementById('sidebar-backdrop')?.addEventListener('click', () => this.toggleSidebar(false));

    // Open Folder (Sidebar + Topbar)
    document.getElementById('btn-open-folder')?.addEventListener('click', () => this.handleOpenFolder());
    document.getElementById('btn-topbar-open-folder')?.addEventListener('click', () => this.handleOpenFolder());

    // Busca de Cifras
    document.getElementById('input-search-song')?.addEventListener('input', (e) => {
      this.filterSongs(e.target.value);
    });

    // Criar Nova Cifra (.txt)
    document.getElementById('btn-new-song')?.addEventListener('click', () => this.openNewSongModal());
    document.getElementById('btn-cancel-new-song')?.addEventListener('click', () => this.closeNewSongModal());
    document.getElementById('btn-confirm-new-song')?.addEventListener('click', () => this.handleCreateNewSong());

    // Navegação entre Abas (Topbar + Mobile Bottom Nav)
    document.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => this.switchTab(btn.getAttribute('data-tab')));
    });

    // Alternância Rápida de Tema Dark / Light
    document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
      const nextTheme = this.state.settings.theme === 'dark' ? 'light' : 'dark';
      this.updateSetting('theme', nextTheme);
    });

    // Controles do Leitor (Toolbar + Rolagem Automática Flutuante - / 1 / +)
    document.getElementById('btn-scroll-speed-toggle')?.addEventListener('click', () => this.handleToggleAutoScroll());
    document.getElementById('btn-toolbar-play')?.addEventListener('click', () => this.handleToggleAutoScroll());
    document.getElementById('btn-toolbar-scroll-status')?.addEventListener('click', () => this.handleToggleAutoScroll());
    document.getElementById('btn-scroll-speed-plus')?.addEventListener('click', () => this.handleAdjustScrollSpeed(1));
    document.getElementById('btn-scroll-speed-minus')?.addEventListener('click', () => this.handleAdjustScrollSpeed(-1));

    document.getElementById('btn-toolbar-top')?.addEventListener('click', () => {
      const container = document.getElementById('reader-scroll-container');
      if (container) container.scrollTop = 0;
    });

    document.getElementById('btn-font-minus')?.addEventListener('click', () => {
      this.updateSetting('fontSize', Math.max(12, this.state.settings.fontSize - 1));
    });
    document.getElementById('btn-font-plus')?.addEventListener('click', () => {
      this.updateSetting('fontSize', Math.min(28, this.state.settings.fontSize + 1));
    });

    document.getElementById('btn-transpose-down')?.addEventListener('click', () => this.adjustTranspose(-1));
    document.getElementById('btn-transpose-up')?.addEventListener('click', () => this.adjustTranspose(1));
    document.getElementById('btn-transpose-reset')?.addEventListener('click', () => this.adjustTranspose(0, true));

    document.getElementById('btn-toggle-columns')?.addEventListener('click', () => {
      const nextCols = this.state.settings.columns === 2 ? 1 : 2;
      this.updateSetting('columns', nextCols);
    });

    document.getElementById('btn-go-edit')?.addEventListener('click', () => this.switchTab('editor'));

    // Editor (.txt)
    const textarea = document.getElementById('txt-editor-textarea');
    textarea?.addEventListener('input', () => {
      this.state.editorDirty = textarea.value !== this.state.rawContent;
      this.updateEditorDirtyBadge();
      this.renderChordSheet(textarea.value, 'editor-live-preview');
    });

    document.getElementById('btn-save-txt')?.addEventListener('click', () => this.handleSaveCurrentTxt());
    document.getElementById('btn-revert-txt')?.addEventListener('click', () => this.handleRevertEditor());

    document.querySelectorAll('.quick-chord-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const snippet = (btn.getAttribute('data-insert') || '').replace('\\n', '\n');
        this.insertAtCursor(snippet);
      });
    });

    // Afinador de Violão
    document.getElementById('btn-mic-toggle')?.addEventListener('click', () => this.handleToggleMicrophone());
    document.getElementById('select-tuning-preset')?.addEventListener('change', (e) => {
      this.state.tuner.presetId = e.target.value;
      this.state.tuner.selectedStringIdx = 0;
      this.syncTunerOptions();
      this.renderTunerStringsAndNotes();
    });

    document.getElementById('btn-mode-chromatic')?.addEventListener('click', () => this.setTunerMode('chromatic'));
    document.getElementById('btn-mode-string')?.addEventListener('click', () => this.setTunerMode('string'));
    document.getElementById('btn-mode-eartrain')?.addEventListener('click', () => this.setTunerMode('eartrain'));

    document.getElementById('btn-prev-string')?.addEventListener('click', () => this.stepSelectedString(-1));
    document.getElementById('btn-next-string')?.addEventListener('click', () => this.stepSelectedString(1));
    document.getElementById('btn-play-reference')?.addEventListener('click', () => this.playSelectedStringReference());

    // Simulador DSP de precisão (Bemol / Afinada / Sustenido)
    document.getElementById('btn-sim-flat')?.addEventListener('click', () => this.simulateCurrentString(-24));
    document.getElementById('btn-sim-tuned')?.addEventListener('click', () => this.simulateCurrentString(0));
    document.getElementById('btn-sim-sharp')?.addEventListener('click', () => this.simulateCurrentString(26));

    // Configurações
    document.querySelectorAll('.color-swatch').forEach((swatch) => {
      swatch.addEventListener('click', () => {
        const color = swatch.getAttribute('data-color');
        if (color) this.updateSetting('chordColor', color);
      });
    });

    document.getElementById('input-custom-chord-color')?.addEventListener('input', (e) => {
      this.updateSetting('chordColor', e.target.value);
    });

    document.getElementById('input-font-size-range')?.addEventListener('input', (e) => {
      this.updateSetting('fontSize', Number(e.target.value));
    });

    document.getElementById('btn-set-dark')?.addEventListener('click', () => this.updateSetting('theme', 'dark'));
    document.getElementById('btn-set-light')?.addEventListener('click', () => this.updateSetting('theme', 'light'));
    document.getElementById('btn-set-col1')?.addEventListener('click', () => this.updateSetting('columns', 1));
    document.getElementById('btn-set-col2')?.addEventListener('click', () => this.updateSetting('columns', 2));

    // Atalhos de Teclado Globais (Ctrl+S para salvar, Espaço no leitor para Auto-Scroll, Ctrl+B para sidebar)
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (this.state.activeTab === 'editor' || this.state.editorDirty) {
          this.handleSaveCurrentTxt();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        this.toggleSidebar();
      } else if (
        e.code === 'Space' &&
        this.state.activeTab === 'reader' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        this.handleToggleAutoScroll();
      }
    });
  }

  toggleSidebar(forceState) {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (!sidebar) return;

    const isCurrentlyCollapsed = sidebar.classList.contains('collapsed');
    const shouldExpand = typeof forceState === 'boolean' ? forceState : isCurrentlyCollapsed;

    if (shouldExpand) {
      sidebar.classList.remove('collapsed');
      if (window.innerWidth <= 860) backdrop?.classList.remove('hidden');
    } else {
      sidebar.classList.add('collapsed');
      backdrop?.classList.add('hidden');
    }
  }

  switchTab(tabId) {
    this.state.activeTab = tabId;
    document.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });

    const views = ['reader', 'editor', 'tuner', 'settings'];
    for (const v of views) {
      const el = document.getElementById(`view-${v}`);
      if (el) el.classList.toggle('hidden', v !== tabId);
    }

    if (tabId !== 'reader' && this.state.autoScroll.active) {
      this.handleToggleAutoScroll(false);
    }

    if (tabId === 'tuner' && this.gauge) {
      setTimeout(() => this.gauge.draw(), 30);
    }
  }

  async handleOpenFolder() {
    try {
      const res = await this.bridge.openFolderDialog();
      if (!res || res.cancelled) return;

      this.state.currentFolder = res.folderPath;
      this.state.files = res.files || [];
      this.updateFolderHeader();
      this.filterSongs(this.state.searchQuery);

      this.state.settings.lastFolder = res.folderPath;
      await this.bridge.saveSettings(this.state.settings);

      if (this.state.files.length > 0) {
        await this.selectSong(this.state.files[0]);
        this.showToast(`Pasta carregada: ${this.state.files.length} cifra(s) .txt encontrada(s).`);
      } else {
        this.renderEmptyReaderState();
        this.showToast('Nenhum arquivo .txt encontrado nesta pasta.');
      }
    } catch (err) {
      this.showToast(`Erro ao abrir pasta: ${err.message}`);
    }
  }

  updateFolderHeader() {
    const folderText = document.getElementById('folder-path-text');
    const countBadge = document.getElementById('song-count-badge');
    if (folderText) {
      folderText.textContent = this.state.currentFolder || 'Nenhuma pasta selecionada';
      folderText.title = this.state.currentFolder || '';
    }
    if (countBadge) {
      countBadge.textContent = String(this.state.files.length);
    }
  }

  filterSongs(query) {
    this.state.searchQuery = (query || '').trim().toLowerCase();
    if (!this.state.searchQuery) {
      this.state.filteredFiles = [...this.state.files];
    } else {
      this.state.filteredFiles = this.state.files.filter(
        (f) =>
          f.name.toLowerCase().includes(this.state.searchQuery) ||
          (f.relativePath && f.relativePath.toLowerCase().includes(this.state.searchQuery))
      );
    }
    this.renderSongList();
  }

  renderSongList() {
    const listEl = document.getElementById('song-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (this.state.filteredFiles.length === 0) {
      const empty = document.createElement('div');
      empty.style.padding = '18px 12px';
      empty.style.textAlign = 'center';
      empty.style.color = 'var(--text-muted)';
      empty.style.fontSize = '0.82rem';
      empty.textContent = 'Nenhuma cifra .txt encontrada.';
      listEl.appendChild(empty);
      return;
    }

    for (const file of this.state.filteredFiles) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `song-item${this.state.currentFile?.fullPath === file.fullPath ? ' active' : ''}`;
      const displayName = file.name.replace(/\.txt$/i, '');
      const subFolder =
        file.relativePath && file.relativePath !== file.name
          ? file.relativePath.replace(/[\\/][^\\/]+$/, '')
          : 'Arquivo .txt local';

      btn.innerHTML = `
        <div class="song-item-info">
          <span class="song-item-title"></span>
          <span class="song-item-sub"></span>
        </div>
        <span class="song-ext-pill">.txt</span>
      `;
      btn.querySelector('.song-item-title').textContent = displayName;
      btn.querySelector('.song-item-sub').textContent = subFolder;

      btn.addEventListener('click', () => {
        this.selectSong(file);
        if (window.innerWidth <= 860) this.toggleSidebar(false);
      });

      listEl.appendChild(btn);
    }
  }

  async selectSong(file) {
    if (!file) return;
    try {
      const content = await this.bridge.readTextFile(file.fullPath);
      this.state.currentFile = file;
      this.state.rawContent = content;
      this.state.transposeSemitones = 0;
      this.state.editorDirty = false;
      this.updateEditorDirtyBadge();

      // Atualiza cabeçalho
      const titleEl = document.getElementById('current-song-title');
      const subEl = document.getElementById('current-song-sub');
      if (titleEl) titleEl.textContent = file.name.replace(/\.txt$/i, '');
      if (subEl) subEl.textContent = file.relativePath || file.fullPath;

      // Atualiza Leitor
      this.refreshReaderSheet();
      const scrollContainer = document.getElementById('reader-scroll-container');
      if (scrollContainer) scrollContainer.scrollTop = 0;

      // Atualiza Editor
      const textarea = document.getElementById('txt-editor-textarea');
      const editorPath = document.getElementById('editor-file-path');
      if (textarea) textarea.value = content;
      if (editorPath) editorPath.textContent = file.fullPath;
      this.renderChordSheet(content, 'editor-live-preview');

      // Persiste último arquivo aberto
      this.state.settings.lastFile = file.fullPath;
      await this.bridge.saveSettings(this.state.settings);
      this.renderSongList();
    } catch (err) {
      this.showToast(`Erro ao ler arquivo: ${err.message}`);
    }
  }

  refreshReaderSheet() {
    const textToRender =
      this.state.transposeSemitones !== 0
        ? transposeText(this.state.rawContent, this.state.transposeSemitones)
        : this.state.rawContent;

    this.renderChordSheet(textToRender, 'chord-sheet-content');

    const transposeBadge = document.getElementById('btn-transpose-reset');
    if (transposeBadge) {
      const s = this.state.transposeSemitones;
      transposeBadge.textContent = `Tom: ${s > 0 ? `+${s}` : s}`;
    }
  }

  /**
   * Renderiza a cifra em fonte monoespaçada preservando 100% dos espaços e destacando acordes.
   */
  renderChordSheet(text, targetElementId) {
    const container = document.getElementById(targetElementId);
    if (!container) return;
    container.innerHTML = '';

    const lines = (text || '').split(/\r?\n/);
    const fragment = document.createDocumentFragment();

    for (const line of lines) {
      const lineDiv = document.createElement('div');
      lineDiv.className = 'sheet-line';

      if (!line) {
        lineDiv.textContent = '\u00A0';
        fragment.appendChild(lineDiv);
        continue;
      }

      const segments = parseLineSegments(line);
      for (const seg of segments) {
        if (seg.type === 'chord') {
          const span = document.createElement('span');
          span.className = 'chord-token';
          span.textContent = seg.text;
          span.title = `Acorde ${seg.text} (Clique para ouvir referência)`;
          span.addEventListener('click', () => this.playChordRootTone(seg.text));
          lineDiv.appendChild(span);
        } else if (seg.type === 'section') {
          const span = document.createElement('span');
          span.className = 'section-token';
          span.textContent = seg.text;
          lineDiv.appendChild(span);
        } else {
          lineDiv.appendChild(document.createTextNode(seg.text));
        }
      }

      fragment.appendChild(lineDiv);
    }

    container.appendChild(fragment);
  }

  renderEmptyReaderState() {
    const container = document.getElementById('chord-sheet-content');
    if (!container) return;
    container.innerHTML = `
      <div class="sheet-line"><span class="section-token">[CifraFlow — Bem-vindo]</span></div>
      <div class="sheet-line">&nbsp;</div>
      <div class="sheet-line">Clique no botão laranja <span class="chord-token">Open Folder</span> para selecionar</div>
      <div class="sheet-line">a sua pasta local de cifras em formato <span class="chord-token">.txt</span>.</div>
    `;
  }

  playChordRootTone(chordStr) {
    const match = /^([A-G](?:#|b)?)/.exec(chordStr);
    if (!match) return;
    const root = match[1];
    const noteFreqs = {
      C: 130.81, 'C#': 138.59, Db: 138.59,
      D: 146.83, 'D#': 155.56, Eb: 155.56,
      E: 164.81, F: 174.61, 'F#': 185.00, Gb: 185.00,
      G: 196.00, 'G#': 207.65, Ab: 207.65,
      A: 220.00, 'A#': 233.08, Bb: 233.08, B: 246.94
    };
    if (noteFreqs[root]) {
      this.audio.playReferenceNote(noteFreqs[root], 1.8);
    }
  }

  adjustTranspose(delta, reset = false) {
    if (reset) {
      this.state.transposeSemitones = 0;
    } else {
      this.state.transposeSemitones = ((this.state.transposeSemitones + delta + 18) % 12) - 6;
    }
    this.refreshReaderSheet();
  }

  /* ==========================================================================
     Rolagem Automática (Auto-Scroll: - / 1 / +)
     ========================================================================== */
  handleToggleAutoScroll(forceActive) {
    this.state.autoScroll = toggleAutoScroll(this.state.autoScroll, forceActive);
    this.syncAutoScrollUI();

    if (this.state.autoScroll.active) {
      this.lastScrollFrameTime = performance.now();
      this.scrollAccumulator = 0;
      this.runAutoScrollLoop();
    } else if (this.scrollRafId) {
      cancelAnimationFrame(this.scrollRafId);
      this.scrollRafId = null;
    }
  }

  handleAdjustScrollSpeed(delta) {
    this.state.autoScroll = adjustAutoScrollSpeed(this.state.autoScroll, delta);
    this.state.settings.scrollSpeed = this.state.autoScroll.speed;
    this.bridge.saveSettings(this.state.settings);
    this.syncAutoScrollUI();
  }

  syncAutoScrollUI() {
    const { active, speed } = this.state.autoScroll;
    const speedValEl = document.getElementById('scroll-speed-value');
    const primaryCircle = document.getElementById('btn-scroll-speed-toggle');
    const statusBtn = document.getElementById('btn-toolbar-scroll-status');
    const playLabel = document.getElementById('toolbar-play-label');
    const captionEl = document.getElementById('autoscroll-caption');

    if (speedValEl) speedValEl.textContent = String(speed);
    if (primaryCircle) primaryCircle.classList.toggle('scrolling-active', active);
    if (statusBtn) {
      statusBtn.textContent = active ? `Rolagem ON (Vel. ${speed})` : 'Rolagem OFF';
      statusBtn.classList.toggle('active', active);
    }
    if (playLabel) {
      playLabel.textContent = active ? '⏸ Pausar' : '▶ Play/Pause';
    }
    if (captionEl) {
      captionEl.textContent = active ? `Rolando (Vel. ${speed})` : 'Rolagem automática';
    }
  }

  runAutoScrollLoop() {
    if (!this.state.autoScroll.active) return;

    const now = performance.now();
    const dtMs = Math.min(100, Math.max(0, now - this.lastScrollFrameTime));
    this.lastScrollFrameTime = now;

    const container = document.getElementById('reader-scroll-container');
    if (container) {
      this.scrollAccumulator += computeScrollDeltaPx(this.state.autoScroll, dtMs);
      if (this.scrollAccumulator >= 0.5) {
        const wholePx = this.scrollAccumulator;
        container.scrollTop += wholePx;
        this.scrollAccumulator = 0;

        // Pausa automaticamente ao atingir o fim da cifra
        if (container.scrollTop + container.clientHeight >= container.scrollHeight - 2) {
          this.handleToggleAutoScroll(false);
          return;
        }
      }
    }

    this.scrollRafId = requestAnimationFrame(() => this.runAutoScrollLoop());
  }

  /* ==========================================================================
     Editor Integrado (.txt) e Salvamento em Disco
     ========================================================================== */
  updateEditorDirtyBadge() {
    const dot = document.getElementById('editor-dirty-dot');
    const msg = document.getElementById('editor-status-msg');
    if (dot) dot.classList.toggle('hidden', !this.state.editorDirty);
    if (msg) {
      msg.textContent = this.state.editorDirty
        ? '● Alterações não salvas (Pressione Ctrl+S para salvar no disco)'
        : '✓ Sincronizado com o arquivo .txt no disco';
    }
  }

  async handleSaveCurrentTxt() {
    if (!this.state.currentFile) {
      this.showToast('Nenhum arquivo .txt aberto para salvar.');
      return;
    }
    const textarea = document.getElementById('txt-editor-textarea');
    if (!textarea) return;

    try {
      const updatedText = textarea.value;
      await this.bridge.writeTextFile(this.state.currentFile.fullPath, updatedText);
      this.state.rawContent = updatedText;
      this.state.editorDirty = false;
      this.updateEditorDirtyBadge();
      this.refreshReaderSheet();
      this.showToast(`Salvo com sucesso em "${this.state.currentFile.name}"!`);
    } catch (err) {
      this.showToast(`Falha ao salvar arquivo: ${err.message}`);
    }
  }

  handleRevertEditor() {
    const textarea = document.getElementById('txt-editor-textarea');
    if (!textarea) return;
    textarea.value = this.state.rawContent;
    this.state.editorDirty = false;
    this.updateEditorDirtyBadge();
    this.renderChordSheet(this.state.rawContent, 'editor-live-preview');
    this.showToast('Alterações descartadas.');
  }

  insertAtCursor(snippet) {
    const textarea = document.getElementById('txt-editor-textarea');
    if (!textarea) return;
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const val = textarea.value;
    textarea.value = val.slice(0, start) + snippet + val.slice(end);
    textarea.selectionStart = textarea.selectionEnd = start + snippet.length;
    textarea.focus();
    textarea.dispatchEvent(new Event('input'));
  }

  openNewSongModal() {
    const modal = document.getElementById('modal-new-song');
    const input = document.getElementById('input-new-song-name');
    modal?.classList.remove('hidden');
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 30);
    }
  }

  closeNewSongModal() {
    document.getElementById('modal-new-song')?.classList.add('hidden');
  }

  async handleCreateNewSong() {
    const input = document.getElementById('input-new-song-name');
    const rawName = (input?.value || '').trim();
    if (!rawName) {
      this.showToast('Informe um nome para a nova cifra .txt.');
      return;
    }

    const titleUpper = rawName.replace(/\.txt$/i, '').toUpperCase();
    const templateContent = `${titleUpper}\nTom: G\n\n[Intro] G  D  Em  C\n\nG                  D\nDigite a letra da música aqui\nEm                 C\nMantendo os acordes alinhados acima\n`;

    try {
      const res = await this.bridge.createTextFile(rawName, templateContent);
      this.closeNewSongModal();
      if (res && res.files) {
        this.state.files = res.files;
        this.updateFolderHeader();
        this.filterSongs('');
        if (res.createdFile) {
          await this.selectSong(res.createdFile);
          this.switchTab('editor');
          this.showToast(`Arquivo "${res.createdFile.name}" criado!`);
        }
      }
    } catch (err) {
      this.showToast(`Erro ao criar cifra: ${err.message}`);
    }
  }

  /* ==========================================================================
     Afinador de Violão (Microfone + Síntese Local das 6 Cordas)
     ========================================================================== */
  getCurrentTuningStrings() {
    const preset = TUNING_PRESETS[this.state.tuner.presetId] || TUNING_PRESETS.standard;
    return preset.strings || STANDARD_GUITAR_STRINGS;
  }

  renderTunerStringsAndNotes() {
    const stringsRow = document.getElementById('tuner-strings-row');
    const chromaticRow = document.getElementById('tuner-chromatic-row');
    const strings = this.getCurrentTuningStrings();

    if (stringsRow) {
      stringsRow.innerHTML = '';
      strings.forEach((s, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `string-pill-btn${this.state.tuner.selectedStringIdx === idx ? ' active' : ''}`;
        btn.dataset.stringId = s.id;
        btn.innerHTML = `<span>${s.note}</span><small>${s.id}</small>`;
        btn.title = `${s.label} (${s.freq} Hz) — Clique para ouvir o som da corda`;
        btn.addEventListener('click', () => {
          this.state.tuner.selectedStringIdx = idx;
          this.syncTunerOptions();
          this.renderTunerStringsAndNotes();
          this.audio.playReferenceNote(s.freq, 2.4);
          if (!this.audio.isListening) {
            this.audio.simulatePitch(s.freq);
          }
        });
        stringsRow.appendChild(btn);
      });
    }

    if (chromaticRow) {
      chromaticRow.innerHTML = '';
      for (const note of CHROMATIC_NOTES) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chromatic-note-chip';
        chip.dataset.note = note;
        chip.textContent = note;
        chip.title = `Ouvir referência de ${note}`;
        chip.addEventListener('click', () => {
          const semitoneFromA4 = CHROMATIC_NOTES.indexOf(note) - 9;
          const freq = 220 * Math.pow(2, semitoneFromA4 / 12);
          this.audio.simulatePitch(freq);
        });
        chromaticRow.appendChild(chip);
      }
    }
  }

  setTunerMode(mode) {
    this.state.tuner.mode = mode;
    document.getElementById('btn-mode-chromatic')?.classList.toggle('active', mode === 'chromatic');
    document.getElementById('btn-mode-string')?.classList.toggle('active', mode === 'string');
    document.getElementById('btn-mode-eartrain')?.classList.toggle('active', mode === 'eartrain');

    const titleEl = document.getElementById('tuner-mode-title');
    const subEl = document.getElementById('tuner-mode-subtitle');
    const strings = this.getCurrentTuningStrings();
    const targetString = strings[this.state.tuner.selectedStringIdx] || strings[0];

    if (mode === 'chromatic') {
      if (titleEl) titleEl.textContent = 'Modo cromático';
      if (subEl) subEl.textContent = 'Detecta qualquer nota automaticamente';
    } else if (mode === 'string') {
      if (titleEl) titleEl.textContent = 'Modo corda a corda';
      if (subEl) subEl.textContent = `Foco: ${targetString.label} (${targetString.freq} Hz)`;
    } else {
      if (titleEl) titleEl.textContent = 'Modo treinar ouvido';
      if (subEl) subEl.textContent = 'Clique em "Ouvir nota" ou nas cordas para afinar de ouvido';
      this.playSelectedStringReference();
    }
    this.syncTunerOptions();
  }

  syncTunerOptions() {
    const strings = this.getCurrentTuningStrings();
    const lockedString =
      this.state.tuner.mode === 'string'
        ? strings[this.state.tuner.selectedStringIdx] || strings[0]
        : null;

    this.audio.setTunerOptions({
      mode: this.state.tuner.mode === 'string' ? 'string' : 'chromatic',
      presetId: this.state.tuner.presetId,
      lockedString
    });
  }

  stepSelectedString(delta) {
    const strings = this.getCurrentTuningStrings();
    this.state.tuner.selectedStringIdx =
      (this.state.tuner.selectedStringIdx + delta + strings.length) % strings.length;
    this.syncTunerOptions();
    this.renderTunerStringsAndNotes();
    this.playSelectedStringReference();
  }

  playSelectedStringReference() {
    const strings = this.getCurrentTuningStrings();
    const current = strings[this.state.tuner.selectedStringIdx] || strings[0];
    this.audio.playReferenceNote(current.freq, 2.4);
    if (!this.audio.isListening) {
      this.audio.simulatePitch(current.freq);
    }
  }

  simulateCurrentString(centsOffset) {
    const strings = this.getCurrentTuningStrings();
    const current = strings[this.state.tuner.selectedStringIdx] || strings[0];
    const simulatedHz = current.freq * Math.pow(2, centsOffset / 1200);
    this.audio.simulatePitch(simulatedHz);
  }

  async handleToggleMicrophone() {
    const btn = document.getElementById('btn-mic-toggle');
    const label = document.getElementById('mic-btn-label');

    if (this.audio.isListening) {
      this.audio.stopMicrophone();
      btn?.classList.remove('listening');
      if (label) label.textContent = '🎙️ Ativar Microfone';
      this.showToast('Microfone desativado.');
      return;
    }

    try {
      await this.audio.startMicrophone();
      btn?.classList.add('listening');
      if (label) label.textContent = '🎙️ Microfone Ativo (Ouvindo)';
      this.showToast('Microfone ativado! Toque uma corda do violão.');
    } catch (err) {
      this.showToast(`Não foi possível acessar o microfone: ${err.message}`);
    }
  }

  handlePitchUpdate(data) {
    const noteEl = document.getElementById('tuner-detected-note');
    const freqEl = document.getElementById('tuner-freq-hz');
    const centsEl = document.getElementById('tuner-cents-badge');
    const guideEl = document.getElementById('tuner-guidance-text');

    if (!data || !data.detected) {
      return;
    }

    if (noteEl) {
      noteEl.textContent = data.fullNote;
      noteEl.classList.toggle('tuned', data.status === 'tuned');
    }
    if (freqEl) {
      freqEl.textContent = `${data.freqHz.toFixed(2)} Hz`;
    }
    if (centsEl) {
      const sign = data.cents > 0 ? '+' : '';
      centsEl.textContent = `${sign}${data.cents.toFixed(1)} cents`;
    }
    if (guideEl) {
      if (data.status === 'tuned') {
        guideEl.textContent = `✓ Corda ${data.closestString.id} afinada no centro! (${data.targetFreq} Hz)`;
        guideEl.style.color = '#4ade80';
      } else if (data.status === 'flat') {
        guideEl.textContent = `♭ Corda Frouxa (Bemol) — Aperte a corda até ${data.closestString.id} (${data.targetFreq} Hz)`;
        guideEl.style.color = '#fb923c';
      } else {
        guideEl.textContent = `♯ Corda Apertada (Sustenido) — Afrouxe a corda até ${data.closestString.id} (${data.targetFreq} Hz)`;
        guideEl.style.color = '#f87171';
      }
    }

    this.gauge?.update(data.cents, data.status);

    // Destaca nota cromática e corda mais próxima
    document.querySelectorAll('.chromatic-note-chip').forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.note === data.noteName);
    });
    document.querySelectorAll('.string-pill-btn').forEach((btn) => {
      const isClosest = btn.dataset.stringId === data.closestString.id;
      btn.classList.toggle('active', isClosest);
      btn.classList.toggle('tuned', isClosest && data.status === 'tuned');
    });
  }

  /* ==========================================================================
     Configurações e Tema Dark / Light
     ========================================================================== */
  updateSetting(key, value) {
    this.state.settings[key] = value;
    this.applySettingsToDOM();
    this.bridge.saveSettings(this.state.settings);
  }

  applySettingsToDOM() {
    const { theme, chordColor, fontSize, columns } = this.state.settings;

    // 1. Tema Dark / Light
    document.documentElement.setAttribute('data-theme', theme);
    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    document.getElementById('btn-set-dark')?.classList.toggle('active', theme === 'dark');
    document.getElementById('btn-set-light')?.classList.toggle('active', theme === 'light');

    // 2. Cor dos Acordes
    document.documentElement.style.setProperty('--chord-color', chordColor);
    const colorInput = document.getElementById('input-custom-chord-color');
    if (colorInput) colorInput.value = chordColor;
    document.querySelectorAll('.color-swatch').forEach((sw) => {
      sw.classList.toggle('active', sw.getAttribute('data-color')?.toLowerCase() === chordColor.toLowerCase());
    });

    // 3. Tamanho da Fonte Monoespaçada
    document.documentElement.style.setProperty('--chord-font-size', `${fontSize}px`);
    const fontBadge = document.getElementById('reader-font-badge');
    const fontRange = document.getElementById('input-font-size-range');
    const settingsFontVal = document.getElementById('settings-font-size-val');
    if (fontBadge) fontBadge.textContent = `${fontSize}px`;
    if (fontRange) fontRange.value = String(fontSize);
    if (settingsFontVal) settingsFontVal.textContent = `${fontSize}px`;

    // 4. Layout de Colunas (1 ou 2 colunas)
    const sheetEl = document.getElementById('chord-sheet-content');
    const colsLabel = document.getElementById('columns-label');
    const toggleColsBtn = document.getElementById('btn-toggle-columns');
    if (sheetEl) sheetEl.classList.toggle('two-columns', columns === 2);
    if (colsLabel) colsLabel.textContent = columns === 2 ? '☷ 2 Colunas' : '☷ 1 Coluna';
    if (toggleColsBtn) toggleColsBtn.classList.toggle('active', columns === 2);
    document.getElementById('btn-set-col1')?.classList.toggle('active', columns === 1);
    document.getElementById('btn-set-col2')?.classList.toggle('active', columns === 2);

    // 5. Velocidade de Auto-Scroll
    this.syncAutoScrollUI();
  }

  showToast(message) {
    const toast = document.getElementById('toast-notification');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
    }, 3200);
  }
}

// Inicializa o aplicativo quando o DOM estiver pronto
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const app = new AppController();
    window.cifraFlowApp = app;
    app.init();
  });
}
