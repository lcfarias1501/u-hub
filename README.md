# U-Hub — Nerd & Gamer Command Center

Electron 44 · React 19 · TypeScript · Tailwind v4 · electron-vite 6

## Instalando (para amigos)

Baixe o arquivo do seu sistema em **[Releases](https://github.com/lcfarias1501/u-hub/releases/latest)**.
O app não tem assinatura paga da Apple/Microsoft, então o sistema pede uma confirmação na primeira vez:

- **macOS** — baixe `U-Hub-x.y.z-mac-arm64.dmg` (M1/M2/M3/M4) ou `…-mac-x64.dmg` (Intel) e arraste para Aplicativos.
  Ao abrir, o macOS vai bloquear. Vá em **Ajustes do Sistema → Privacidade e Segurança**, role até o aviso do U-Hub
  e clique **Abrir Mesmo Assim**. Se aparecer *“está danificado”*, rode uma vez no Terminal:
  `xattr -dr com.apple.quarantine /Applications/U-Hub.app`
- **Windows** — rode `U-Hub-x.y.z-win-setup.exe`. No aviso do SmartScreen, clique **Mais informações → Executar assim mesmo**.
- **Linux** — baixe o `.AppImage`, dê permissão (`chmod +x`) e execute.

Atualizações: no Windows/Linux o app baixa sozinho e mostra *“reiniciar”* no topo. No macOS aparece *“baixar”*,
que abre a página da nova versão (atualização automática no Mac exige certificado pago).

**Spotify:** peça para o Lucas adicionar o e-mail da sua conta Spotify no app dele (o app está em modo de
desenvolvimento do Spotify, que só aceita contas liberadas). Controlar o player exige Premium.

## Publicando uma versão

Toda versão precisa de notas no [`CHANGELOG.md`](CHANGELOG.md) — o CI recusa a tag sem elas.

1. Durante o desenvolvimento, registre cada mudança em `## [Não lançado]` (Adicionado / Melhorado / Corrigido).
2. Para lançar: renomeie a seção para `## [0.4.0] - AAAA-MM-DD`, atualize `version` no `package.json` e faça commit.
3. `git tag v0.4.0 && git push origin main --tags`
4. O GitHub Actions (`.github/workflows/release.yml`) confere as notas, gera os instaladores de Mac, Windows e Linux,
   publica no Release e usa a seção do changelog como texto da release. O app mostra as mesmas notas em "Novidades".

Para conferir as notas de uma versão localmente: `node scripts/release-notes.mjs 0.4.0`

Configuração única no GitHub: **Settings → Secrets and variables → Actions → Variables** → `SPOTIFY_CLIENT_ID`
com o Client ID do seu app do Spotify. Para liberar um amigo: dashboard do Spotify → seu app → **User Management**.

```bash
npm install
npm run dev        # app com HMR
npm run build      # build de produção em out/
npm run dist       # gera instaladores locais em dist/ (sem publicar)
npm run typecheck
```

## Estrutura

```
src/
  main/        processo principal: janela, IPC, systeminformation, launcher (child_process), storage
  preload/     ponte segura (contextBridge) → window.uhub
  shared/      tipos compartilhados (StoreSchema, VaultEntry, Launcher…)
  renderer/src/
    components/  Sidebar, TopBar, Panel, Modal, CopyButton
    hooks/       usePersistentState (electron-store), useModHotkeys
    lib/         systemFeed (histórico 60s), audioEngine (rádio + analyser), format
    views/       PerformanceView, VaultView, MediaView, QuestView
```

## Atalhos

| Atalho | Ação |
| --- | --- |
| ⌘/Ctrl + 1–4 | Trocar de aba |
| ⌘/Ctrl + B | Recolher/expandir sidebar |
| ⌘/Ctrl + K | Buscar no Vault |
| ⌘/Ctrl + N | Nova credencial (no Vault) |

## Notas

- **Vault**: gravado como um blob criptografado com `safeStorage` (Keychain no macOS / DPAPI no Windows).
  Sem chaveiro disponível, cai para AES-256-GCM com chave local em `userData/vault.key`.
  Senhas copiadas são limpas do clipboard após 30s.
- **Launcher**: o renderer só envia o *id* do atalho; o main resolve o alvo e executa via
  `execFile`/`spawn` sem shell. URLs aceitam apenas http(s), steam, discord, spotify, battlenet, minecraft.
- **Rádio**: o main injeta `Access-Control-Allow-Origin` em respostas de mídia para o
  `AnalyserNode` conseguir ler o stream (necessário para o visualizador).
- **Spotify (aba Media → CONTROLE)**: controle remoto via Web API com login OAuth PKCE.
  Builds com `MAIN_VITE_SPOTIFY_CLIENT_ID` (CI ou `.env.local`) já vêm com Client ID; o usuário só clica em *Conectar*.
  Sem ele (ou para usar um app próprio):
  1. Crie um app em https://developer.spotify.com/dashboard (marque *Web API*).
  2. Redirect URI: `http://127.0.0.1:43821/callback` (porta fixa, ver `SPOTIFY_REDIRECT_URI` em `src/shared/types.ts`).
  3. Cole o Client ID no U-Hub e clique em *Conectar Spotify* — o login abre no navegador.
  Tokens ficam selados com `safeStorage`. Comandos de player exigem **Premium**; contas Free veem o que está tocando.
  O áudio sai do app do Spotify (Mac, celular, caixa de som); o U-Hub controla. A aba EMBED continua disponível.
