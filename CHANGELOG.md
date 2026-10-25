# Novidades do U-Hub

Todas as mudanças de cada versão. Formato: cada versão tem uma seção `## [x.y.z] - AAAA-MM-DD`
com os grupos **Adicionado**, **Melhorado** e **Corrigido**.

> Regra de release: a tag `vX.Y.Z` só é publicada se esta página tiver a seção `## [X.Y.Z]`.
> O texto da seção vira as notas da release no GitHub e a tela de "Novidades" dentro do app.
> Durante o desenvolvimento, as mudanças vão em `## [Não lançado]` e são renomeadas na hora do release.

## [Não lançado]

## [0.7.0] - 2026-10-25

### Adicionado
- **Conta U-Hub** (opcional): crie com e-mail e senha ou entre com o Discord; dá para vincular o Discord depois. Recuperação de senha pelo e-mail, terminando dentro do app.
- **Sincronização na nuvem**: com a conta, configurações, módulos, cores, atalhos, Quest Log, Launcher, rádios, playlists, categorias do Vault e lista de desejos voltam sozinhos em outro computador e ficam iguais entre computadores. No primeiro login de um computador que já tem dados, o app pergunta o que manter. Senhas do Vault, tokens e histórico nunca vão para a nuvem — para levar o Vault, use Exportar backup.
- **Apresentação**: "Já tenho uma conta" traz suas configurações da nuvem e pula as etapas; a etapa de perfil oferece criar conta.
- **Amigos**: perfil online (nome, @usuário e avatar), com um código de amigo para compartilhar.
  - Adicione amigos por @usuário ou código; aceite, recuse ou cancele pedidos.
  - Lista de amigos com status em tempo real: jogando (jogo, capa e há quanto tempo), online, ausente ou offline, e a rádio que cada um está ouvindo.
  - Privacidade: escolha se mostra o jogo e a música, ou fique invisível. Só seus amigos podem ver seu status.
  - Notificações de pedidos de amizade, novas amizades e quando um amigo começa a jogar (Configurações → Notificações → Amigos).

## [0.6.0] - 2026-10-24

### Adicionado
- **Apresentação do U-Hub** na primeira vez que o app é aberto: boas-vindas, perfil (opcional), escolha dos módulos que aparecem na barra lateral, cor de destaque com prévia ao vivo, conexões (Spotify, status no Discord, jogos detectados, região das lojas) e preferências do dia a dia (barra de menus, abrir com o sistema, notificações, atalhos). Dá para pular a qualquer momento e refazer em Configurações → Perfil.
- **Perfil**: apelido e avatar (ícone + cor), mostrados no topo do app. Editável em Configurações → Perfil.

## [0.5.0] - 2026-10-24

### Adicionado
- **Atalhos globais** (Configurações → Atalhos), funcionando com o U-Hub em segundo plano: mostrar/esconder o app, tocar/pausar, próxima e anterior (controlam o que estiver tocando — rádio ou Spotify) e volume da rádio. Grave qualquer combinação; o app avisa se ela já estiver em uso por outro programa.
- **Status no Discord** (Configurações → Discord): mostra no seu perfil o jogo aberto, com capa e cronômetro da sessão, ou a rádio tocando ("Ouvindo U-Hub"). Opções para mostrar jogos, rádio, status ocioso e o botão "Baixar U-Hub". Usa o Discord desktop do computador, sem login, e reconecta sozinho quando o Discord é aberto.

## [0.4.0] - 2026-10-17

### Adicionado
- **Biblioteca de jogos**: detecta jogos instalados da Steam e da Epic, com capas oficiais, e permite adicionar qualquer jogo ou app manualmente.
- **Tempo de jogo**: o U-Hub percebe quando um jogo está aberto (mesmo minimizado) e registra o tempo por dia; banner "Jogando agora" com cronômetro da sessão, estatísticas de hoje / 7 dias / jogo mais jogado e gráfico de atividade de 7 ou 30 dias.
- **Ofertas & Notícias**:
  - Jogos grátis da Epic (agora e os próximos) com link para resgatar.
  - Promoções da Steam com desconto e preço na moeda da sua região.
  - Lista de desejos com busca na Steam, menor preço visto e alerta quando o jogo entra em promoção ou chega no preço que você definir.
  - Notícias: anúncios oficiais e patch notes dos seus jogos da Steam e da lista de desejos, mais sites de games (IGN Brasil, Adrenaline; dá para adicionar qualquer feed RSS).
- **Notificações do sistema** para jogos grátis novos, alertas de preço e patches dos jogos que você jogou nos últimos 30 dias.
- **Configurações → Geral → Região das lojas**: escolha a região/moeda dos preços (automático segue a região do sistema).
- **Novidades**: depois de atualizar, o app mostra o que mudou; o histórico fica em Configurações → Dados & Sobre.
- **Central de notificações**: sino no topo com contador de não lidas; lista com filtro de não lidas, marcar todas como lidas e limpar. Clicar abre a tela certa do app (ou o link).
- **Resumo de sessão**: ao fechar um jogo depois de 10 minutos ou mais, fica registrado quanto você jogou.
- **Configurações → Notificações**: escolha quais tipos aparecem como notificação do sistema, "Não perturbe enquanto joga", som e contador de não lidas no ícone do Dock.

### Melhorado
- Telas abertas passam a refletir na hora dados alterados em segundo plano (ex.: preços da lista de desejos).

### Corrigido
- Menus flutuantes (seletor de dispositivos do Spotify e outros) abriam fora de posição.

## [0.3.0] - 2026-10-16

### Adicionado
- **Menu na barra de menus** (com "Manter na barra de menus ao fechar" ativo): um clique no ícone abre o player de Rádio/Spotify com capa, progresso e controles, junto com as opções de sempre (Abrir U-Hub, módulos, Configurações, Sair). Clique direito mantém o menu nativo.
- A rádio aparece no **"Agora Tocando" do macOS** e responde às **teclas de mídia** do teclado (⏭ ⏮ trocam de estação).

### Melhorado
- O volume da rádio fica sincronizado entre a aba Media e o menu da barra de menus.
- Sliders com o visual do app.

### Corrigido
- Volume do Spotify "voltava" para o valor antigo por um instante depois de mudar.
- Aviso falso "Unexpected token … is not valid JSON" ao dar play/pause no Spotify.

## [0.2.0] - 2026-10-16

### Adicionado
- **Categorias do Vault personalizáveis**: crie, renomeie, troque ícone e cor, reordene arrastando e exclua (as credenciais vão para "Outros"). Dá para criar uma categoria direto no editor de credencial.
- **Configurações** (engrenagem no topo ou ⌘,):
  - Módulos: mostrar/ocultar e reordenar a barra lateral; atalhos ⌘1…⌘N seguem a ordem.
  - Geral: abrir com o sistema, iniciar minimizado, aba inicial, manter na barra de menus/bandeja ao fechar.
  - Aparência: cor de destaque, escala da interface, estado da barra lateral ao iniciar, reduzir animações.
  - Dados & Sobre: versão e verificação de atualizações, conta do Spotify, backup/restauração (Vault opcional, protegido por senha), pasta de dados e apagar tudo.

### Melhorado
- Quick Launcher ganhou mais ícones e cores.

## [0.1.1] - 2026-10-15

### Melhorado
- **Desempenho**: uso de CPU parado caiu de ~9–13% para ~1,5%; minimizado, ~0,4%. Coleta de dados pausa em segundo plano, animações contínuas removidas, visualizador e Spotify só trabalham quando visíveis.

### Corrigido
- Card arrastado no Quest Log não acompanhava o mouse (e modais deslocados).
- Botão "Add" do Quest Log sem resposta com o campo vazio — agora indica onde digitar.

## [0.1.0] - 2026-10-15

### Adicionado
- Primeira versão: Performance (CPU, núcleos, RAM, rede, bateria, status), Vault criptografado, rádio lofi/synthwave com visualizador, controle do Spotify, Quest Log em kanban e Quick Launcher.
