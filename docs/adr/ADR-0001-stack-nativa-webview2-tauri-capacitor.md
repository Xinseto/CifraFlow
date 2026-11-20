---
tipo: adr
id: ADR-0001
titulo: Stack Nativa Desktop (Win32/WebView2 + Tauri v2) e Mobile Android (.apk via Capacitor/Tauri)
status: aprovado
data: 2026-11-20
---

# ADR-0001: Arquitetura Híbrida Nativa Desktop (WebView2 / Tauri v2) + Android APK

## Contexto
O projeto **CifraFlow** exige:
1. Execução **100% local e offline** como aplicativo nativo de desktop (Windows e Ubuntu Linux), sem rodar dentro de abas de navegador web.
2. Acesso nativo ao sistema de arquivos do sistema operacional (diálogo nativo `Open Folder` do Windows Explorer, leitura recursiva de `.txt`, criação e salvamento direto no arquivo `.txt` original em disco).
3. Acesso nativo de baixa latência ao **microfone** para o afinador cromático/violão em tempo real e síntese local das 6 cordas (`E2 - A2 - D3 - G3 - B3 - E4`).
4. Compilação futura direta para **`.apk` Android** a partir da mesma base de código de UI e domínio, sem reescrever a interface.

## Decisão
Adotar uma arquitetura de **Monolito Modular em ES2022 (`src/domain`, `src/application`, `src/infrastructure`, `src/ui`)** empacotada sobre o motor nativo **Microsoft Edge WebView2 (`CifraFlow.exe` compilado nativamente via C#/Win32 no Windows)** e configurada com manifestos **Tauri v2 (`src-tauri/tauri.conf.json`)** e **Capacitor Android (`capacitor.config.json`)** para geração do `.apk`.

## Justificativa e Benefícios
- **Binário Nativo Leve e Imediato (`CifraFlow.exe`):** Compila instantaneamente no Windows usando o compilador nativo do sistema (`csc.exe` + `Microsoft.Web.WebView2`), gerando um executável desktop real (`< 1 MB`), com barra de título escura nativa (DWM), diálogo nativo `IFileOpenDialog` (`Select folder` idêntico ao print de referência) e permissão nativa de microfone.
- **Mesma Base de Código para Android (`.apk`):** Toda a interface responsiva (Sidebar recolhível no PC / Drawer + Bottom Nav no Mobile), o parser de acordes, o auto-scroll e o DSP do afinador rodam inalterados no WebView do Android empacotado via Capacitor ou Tauri Mobile.
- **Testabilidade Determinística (TDD):** As regras de negócio em `src/domain/` são 100% puras e testáveis em milissegundos via `node --test`.
