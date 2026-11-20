---
tipo: sdd-spec
projeto: CifraFlow
versao: 1.0.0
atualizado: 2026-11-20
status: aprovado
---

# SDD Fase 1: Especificação Técnica (Spec) — CifraFlow

## 1. Contexto e Motivação
O **CifraFlow** é um aplicativo **100% local e offline** (nativo para desktop Windows/Linux, sem depender de navegador externo, e preparado para empacotamento `.apk` Android a partir da mesma base de código) projetado para violonistas e músicos. Seu propósito é permitir a leitura ergonômica de cifras musicais em arquivos `.txt`, organização de repertório por pastas locais, edição direta em disco, rolagem automática contínua e afinação de violão em tempo real via microfone ou síntese acústica de referência.

## 2. Requisitos Funcionais (RF)
- **RF-01 (Open Folder & Repertório Local):** Abrir o seletor nativo de pastas do sistema operacional (`IFileOpenDialog` / `FOS_PICKFOLDERS` no Windows, `zenity`/nativo no Linux, SAF no Android), listar todos os arquivos `.txt` (incluindo subpastas), permitir busca instantânea por nome, criação de novas cifras `.txt` e persistência automática do último diretório aberto.
- **RF-02 (Leitor Monoespaçado & Parser Inteligente de Acordes):** Renderizar cifras `.txt` em fonte monoespaçada preservando rigorosamente o alinhamento espacial entre acordes e sílabas. Identificar e destacar automaticamente acordes musicais (`G`, `C9`, `Em`, `Bm7`, `G/B`, `F#m`, `A4`, `A#`, `Dm7(9)`, `C#m7(b5)`, etc.) sem falsos positivos em palavras da letra em português, usando cor padrão **Laranja** (`#FF7A00` / `#F97316`), configurável pelo usuário, com suporte a visualização em **1 ou 2 colunas** e transposição de tom (`-1/2` / `+1/2`).
- **RF-03 (Rolagem Automática / Auto-Scroll):** Widget flutuante ergonômico (inspirado nos prints de referência) contendo botão de ativação/velocidade (iniciando em `1`) e botões circulares `+` e `-` para ajuste contínuo e suave da velocidade em tempo real.
- **RF-04 (Afinador de Violão Cromático e Padrão):** Detecção de frequência fundamental ($f_0$) em tempo real via microfone com algoritmo de autocorrelação YIN/NSDF + interpolação parabólica, exibindo nota detectada, frequência em `Hz`, desvio em `cents` ($[-50, +50]$) em medidor analógico semicircular (`♭`, centro verde, `♯`), seletor das 6 cordas (`E2 - A2 - D3 - G3 - B3 - E4`) e sintetizador acústico local (Karplus-Strong) para ouvir a nota de referência de cada corda.
- **RF-05 (Editor `.txt` Integrado):** Aba dedicada para edição da cifra aberta com salvamento atômico diretamente no arquivo `.txt` original no disco e atualização imediata do leitor.
- **RF-06 (Temas Dark e Light & Personalização):** Alternância rápida entre **Dark Mode** (palco/noturno, padrão inspirado no CifraFlow da Google Play) e **Light Mode**, além de seletor de cor dos acordes e tamanho da fonte.
- **RF-07 (Responsividade Desktop + Mobile):** Menu lateral recolhível no desktop que se converte automaticamente em gaveta (drawer) e barra de navegação inferior/compacta em proporções estreitas de smartphone, sem sobreposição ou corte de controles.

## 3. Requisitos Não-Funcionais (RNF)
- **RNF-01 (Execução 100% Offline):** Zero dependência de CDN externa ou APIs em nuvem.
- **RNF-02 (Complexidade Ciclomática):** Funções de domínio com Complexidade Ciclomática de McCabe $\le 5$ (limite máximo do Quality Gate $\le 10$).
- **RNF-03 (Desempenho):** Tempo de parsing de cifra $< 5\text{ ms}$ por música; taxa de atualização do medidor do afinador e auto-scroll a $60\text{ FPS}$ sem travamentos de GC.
- **RNF-04 (Interoperabilidade):** Compatível com Windows (`CifraFlow.exe` nativo WebView2), Ubuntu Linux e build Android `.apk` (via Capacitor / Tauri v2 Mobile).

## 4. Critérios de Aceite (Gherkin)
- **Cenário 1 — Destaque de Acordes sem Falsos Positivos:**
  - *Given* um arquivo `.txt` com linhas de acordes (`G  Em  C9  G/B  Am  Dm7(9)`) e linhas de letra (`E o adorar`, `Há um caminho para a adoração`)
  - *When* o leitor processa o texto
  - *Then* as linhas de acordes têm cada acorde envolvido em `<span class="chord">` na cor laranja `#FF7A00` com espaçamento idêntico ao original, e as palavras da letra (`E`, `a`, `para`) permanecem como texto de letra sem destaque indevido.
- **Cenário 2 — Auto-Scroll (`-` / `1` / `+`):**
  - *Given* uma cifra aberta no Leitor
  - *When* o usuário aciona a rolagem automática na velocidade `1` e clica em `+`
  - *Then* a velocidade sobe para `2` e a rolagem vertical acelera suavemente em tempo real.
- **Cenário 3 — Afinador de Violão (Cálculo de Cents):**
  - *Given* um sinal de áudio senoidal/harmônico de $82.41\text{ Hz}$
  - *When* o motor DSP analisa o buffer de áudio
  - *Then* identifica a nota `E2` (6ª corda) com desvio de $0\text{ cents}$ (status `Afinado`).
