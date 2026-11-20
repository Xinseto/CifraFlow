# CifraFlow — Leitor de Cifras `.txt` & Afinador de Violão (100% Local)

Aplicativo **100% local e offline** (nativo para Desktop Windows/Linux, sem rodar em navegador externo, e preparado para compilação de **`.apk` Android** a partir da mesma base de código) para leitura, organização, edição de cifras musicais em `.txt` e afinação de violão em tempo real.

---

## Como Executar no Desktop

### Windows (Janela Nativa Win32 + WebView2)
Dê duplo-clique em **`CifraFlow.bat`** na raiz do projeto ou execute via PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-desktop.ps1
```

### Ubuntu Linux
```bash
chmod +x ./scripts/run-desktop.sh
./scripts/run-desktop.sh
```

---

## Como Executar a Suíte de Testes (TDD)
```powershell
node --test tests/domain.test.js
```

---

## Como Gerar o `.apk` para Android (Mesma Base de Código `src/`)
O projeto já inclui os manifestos `capacitor.config.json` e `src-tauri/tauri.conf.json` apontando para o núcleo modular `src/`:
```powershell
# No Windows:
powershell -ExecutionPolicy Bypass -File .\scripts\build-apk.ps1

# No Ubuntu Linux:
./scripts/build-apk.sh
```

---

## Arquitetura (Monolito Modular + Clean Architecture)
- **`src/domain/`**: Regras de negócio puras e determinísticas (zero dependências de UI/SO, Complexidade Ciclomática $\le 5$):
  - `chord-parser.js`: Tokenizador, classificador e transpositor inteligente de acordes musicais.
  - `tuner-dsp.js`: Detecção de frequência fundamental ($f_0$) via autocorrelação NSDF/YIN + interpolação parabólica e cálculo de desvio em `cents`.
  - `autoscroll-engine.js`: Máquina de estados e curva de velocidade contínua da rolagem automática (`1` a `15`, controles `-` / `1` / `+`).
- **`src/infrastructure/`**:
  - `host-bridge.js`: Ponte nativa multiplataforma (WebView2 C# no Windows, PyWebView/Tauri no Linux, Capacitor no Android `.apk`).
  - `audio-engine.js`: Captura de microfone em tempo real (`AudioContext` + `AnalyserNode`) e sintetizador acústico offline das 6 cordas do violão (`E2 - A2 - D3 - G3 - B3 - E4`).
- **`src/application/` & `src/ui/`**:
  - Controlador reativo (`app-controller.js`), renderizador Canvas 60 FPS do medidor do afinador (`tuner-gauge.js`) e interface responsiva Dark/Light (`index.html`, `styles.css`).
- **`native-host/CifraFlowHost.cs`**:
  - Host nativo Windows em C# com barra de título escura (DWM), seletor de pastas nativo do Windows Explorer (`IFileOpenDialog` com `FOS_PICKFOLDERS`), leitura de `.txt` com detecção automática de encoding (UTF-8 e Windows-1252) e salvamento direto em disco.
