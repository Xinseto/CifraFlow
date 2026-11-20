---
tipo: sdd-tasks
projeto: CifraFlow
versao: 1.0.0
atualizado: 2026-11-20
---

# SDD Fase 3: Quebra Atômica de Tarefas (Tasks) — CifraFlow

- [x] **TASK-01:** Inicializar repositório Git com `.gitattributes` (normalização LF) e `.gitignore`, além da documentação SDD (`Spec`, `Plan`, `Tasks`, `ADR-0001`).
- [ ] **TASK-02 (TDD Domínio):** Escrever suíte de testes unitários (`tests/domain.test.js`) para `ChordParser`, `TunerDSP` e `AutoScrollEngine` (Fase RED) e implementar os módulos de domínio puro com CC $\le 5$ até atingir 100% de aprovação (Fase GREEN).
- [ ] **TASK-03 (Infraestrutura & Áudio):** Implementar `HostBridge` (comunicação nativa Windows WebView2 / Linux / Android APK) e `AudioEngine` (captura de microfone em tempo real + sintetizador acústico Karplus-Strong para as 6 cordas do violão).
- [ ] **TASK-04 (UI/UX Completa & Responsiva):** Implementar a interface completa inspirada no CifraFlow da Google Play e nos 3 prints de referência (Sidebar/Drawer com `Open Folder`, Leitor monoespaçado 1/2 colunas com acordes em Laranja `#FF7A00`, Auto-Scroll flutuante `- / 1 / +`, Editor `.txt` com salvamento direto, Afinador semicircular com agulha em cents e Tema Dark/Light).
- [ ] **TASK-05 (Host Nativo Desktop & Build Android APK):** Compilar o executável desktop nativo `CifraFlow.exe` (C# Win32 + WebView2 + `IFileOpenDialog` nativo), scripts multiplataforma (`run-desktop.ps1`, `run-desktop.sh`, `build-apk.ps1`) e manifesto Capacitor/Tauri v2 para geração do `.apk` Android.
- [ ] **TASK-06 (Quality Gate & Validação E2E):** Validar suíte de testes, Complexidade Ciclomática $\le 5$, execução real do aplicativo desktop com a pasta de cifras do usuário e commits atômicos finais.
