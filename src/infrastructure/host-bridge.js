/**
 * Camada de Infraestrutura: Ponte Nativa Multiplataforma (HostBridge)
 * Suporta:
 * 1. Windows/Linux Nativo Desktop (WebView2 / PyWebView / Tauri v2)
 * 2. Android Nativo (.apk via Capacitor / Android JavascriptInterface)
 * 3. Fallback FileSystem Local (webkitdirectory / File System Access API)
 */

const DEFAULT_SETTINGS = {
  theme: 'dark',
  chordColor: '#FF7A00',
  fontSize: 16,
  columns: 1,
  lastFolder: '',
  lastFile: '',
  scrollSpeed: 1
};

const SAMPLE_SONGS = [
  {
    name: 'Adorar a Deus - 4 por 1.txt',
    relativePath: 'Adorar a Deus - 4 por 1.txt',
    fullPath: 'sample://Adorar a Deus - 4 por 1.txt',
    content: `ADORAR A DEUS - Quatro Por Um
Tom: Lá (A)
RITMO PARA VIOLÃO:
↓↓ ↑↑ ↓↓ ↓↑

Introdução: A  F#m  D  E (2X)

A                            F#m
Há um caminho para a adoração
                                       D
Há uma porta que tem que se abrir
           A                Bm
Abrir os meus olhos espirituais
     E   E    A
Para que eu possa ver

A                                    F#m
Há uma semente que têm que brotar
                                         D
Existem vontades que têm que morrer
            A                            Bm
Morrer para o mundo e viver para DEUS
   E  E  A
E o adorar

A        E      F#m
Adorar a Deus, viver no seu altar
D        A    Bm  E     E  A
Adorar a DEUS  e me entregar

[Solo] Am  Dm  G  G  E  D   E    A

A        E      F#m
Adorar a Deus, viver no seu altar
D        A    Bm  E     E  A
Adorar a DEUS  e me entregar (2X)`
  }
];

export class HostBridge {
  constructor() {
    this.pendingRequests = new Map();
    this.reqCounter = 0;
    this.virtualFiles = new Map();
    this.currentFolder = '';
    this._setupWebView2Listener();
  }

  _setupWebView2Listener() {
    if (typeof window !== 'undefined' && window.chrome && window.chrome.webview) {
      window.chrome.webview.addEventListener('message', (event) => {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data && data.id && this.pendingRequests.has(data.id)) {
          const { resolve, reject } = this.pendingRequests.get(data.id);
          this.pendingRequests.delete(data.id);
          if (data.error) reject(new Error(data.error));
          else resolve(data.result);
        }
      });
    }
  }

  isNativeWebView2() {
    return Boolean(typeof window !== 'undefined' && window.chrome && window.chrome.webview);
  }

  isAndroidBridge() {
    return Boolean(typeof window !== 'undefined' && window.CifraFlowAndroid);
  }

  _callNative(action, payload = {}) {
    if (!this.isNativeWebView2()) {
      return Promise.reject(new Error('Native WebView2 host indisponível'));
    }
    return new Promise((resolve, reject) => {
      const id = `req_${++this.reqCounter}_${Date.now()}`;
      this.pendingRequests.set(id, { resolve, reject });
      window.chrome.webview.postMessage(JSON.stringify({ id, action, payload }));
    });
  }

  async init() {
    const localSettings = this._loadLocalSettings();
    if (this.isNativeWebView2()) {
      try {
        const hostState = await this._callNative('init', {});
        const mergedSettings = { ...DEFAULT_SETTINGS, ...localSettings, ...(hostState.settings || {}) };
        this.currentFolder = hostState.currentFolder || mergedSettings.lastFolder || '';
        return {
          platform: 'windows-native-desktop',
          settings: mergedSettings,
          currentFolder: this.currentFolder,
          files: hostState.files || []
        };
      } catch (_) {
        // Continua para modo local se o host falhar
      }
    }

    for (const s of SAMPLE_SONGS) {
      this.virtualFiles.set(s.fullPath, { ...s });
    }
    return {
      platform: this.isAndroidBridge() ? 'android-apk' : 'local-hybrid',
      settings: { ...DEFAULT_SETTINGS, ...localSettings },
      currentFolder: 'Demonstracao Local (Use "Open Folder" para abrir sua pasta)',
      files: Array.from(this.virtualFiles.values()).map((f) => ({
        name: f.name,
        relativePath: f.relativePath,
        fullPath: f.fullPath
      }))
    };
  }

  async openFolderDialog() {
    if (this.isNativeWebView2()) {
      const res = await this._callNative('openFolderDialog', {
        initialFolder: this.currentFolder
      });
      if (res && !res.cancelled) {
        this.currentFolder = res.folderPath;
      }
      return res;
    }

    if (this.isAndroidBridge() && window.CifraFlowAndroid.openFolder) {
      const json = window.CifraFlowAndroid.openFolder();
      return JSON.parse(json);
    }

    return this._openFallbackDirectoryPicker();
  }

  async scanDirectory(folderPath) {
    if (this.isNativeWebView2()) {
      const res = await this._callNative('scanDirectory', { folderPath });
      this.currentFolder = res.folderPath || folderPath;
      return res;
    }
    return {
      cancelled: false,
      folderPath: this.currentFolder,
      files: Array.from(this.virtualFiles.values()).map((f) => ({
        name: f.name,
        relativePath: f.relativePath,
        fullPath: f.fullPath
      }))
    };
  }

  async readTextFile(fullPath) {
    if (this.isNativeWebView2() && !fullPath.startsWith('sample://')) {
      const res = await this._callNative('readTextFile', { fullPath });
      return res.content;
    }
    const virtual = this.virtualFiles.get(fullPath);
    if (virtual) {
      if (virtual.fileHandle) {
        return await virtual.fileHandle.text();
      }
      return virtual.content;
    }
    throw new Error(`Arquivo não encontrado: ${fullPath}`);
  }

  async writeTextFile(fullPath, content) {
    if (this.isNativeWebView2() && !fullPath.startsWith('sample://')) {
      return await this._callNative('writeTextFile', { fullPath, content });
    }
    const virtual = this.virtualFiles.get(fullPath);
    if (virtual) {
      virtual.content = content;
      return { success: true, fullPath };
    }
    throw new Error(`Não foi possível salvar em: ${fullPath}`);
  }

  async createTextFile(fileName, content) {
    const cleanName = fileName.toLowerCase().endsWith('.txt') ? fileName.trim() : `${fileName.trim()}.txt`;
    if (this.isNativeWebView2() && this.currentFolder && !this.currentFolder.startsWith('Demonstracao')) {
      return await this._callNative('createTextFile', {
        folderPath: this.currentFolder,
        fileName: cleanName,
        content
      });
    }

    const fullPath = `sample://${cleanName}`;
    this.virtualFiles.set(fullPath, {
      name: cleanName,
      relativePath: cleanName,
      fullPath,
      content
    });
    return {
      success: true,
      createdFile: { name: cleanName, relativePath: cleanName, fullPath },
      files: Array.from(this.virtualFiles.values()).map((f) => ({
        name: f.name,
        relativePath: f.relativePath,
        fullPath: f.fullPath
      }))
    };
  }

  async saveSettings(settings) {
    try {
      localStorage.setItem('cifraflow_settings', JSON.stringify(settings));
    } catch (_) {
      // Ignora em ambiente sem storage
    }
    if (this.isNativeWebView2()) {
      try {
        await this._callNative('saveSettings', { settings });
      } catch (_) {
        // Fallback silencioso para localStorage
      }
    }
  }

  _loadLocalSettings() {
    try {
      const raw = localStorage.getItem('cifraflow_settings');
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  _openFallbackDirectoryPicker() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.webkitdirectory = true;
      input.multiple = true;
      input.accept = '.txt,text/plain';

      input.onchange = async () => {
        const selectedFiles = Array.from(input.files || []).filter((f) =>
          f.name.toLowerCase().endsWith('.txt')
        );
        if (selectedFiles.length === 0) {
          resolve({ cancelled: true, files: [] });
          return;
        }
        this.virtualFiles.clear();
        const firstRel = selectedFiles[0].webkitRelativePath || selectedFiles[0].name;
        const rootFolder = firstRel.includes('/') ? firstRel.split('/')[0] : 'Pasta Selecionada';
        this.currentFolder = rootFolder;

        const list = [];
        for (const file of selectedFiles) {
          const relPath = file.webkitRelativePath || file.name;
          const fullPath = `local://${relPath}`;
          const text = await file.text();
          this.virtualFiles.set(fullPath, {
            name: file.name,
            relativePath: relPath,
            fullPath,
            content: text,
            fileHandle: file
          });
          list.push({ name: file.name, relativePath: relPath, fullPath });
        }
        list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        resolve({
          cancelled: false,
          folderPath: rootFolder,
          files: list
        });
      };

      input.click();
    });
  }
}
