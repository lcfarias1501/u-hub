# Novidades do U-Hub

Todas as mudanças de cada versão. Formato: cada versão tem uma seção `## [x.y.z] - AAAA-MM-DD`
com os grupos **Adicionado**, **Melhorado** e **Corrigido**.

> Regra de release: a tag `vX.Y.Z` só é publicada se esta página tiver a seção `## [X.Y.Z]`.
> O texto da seção vira as notas da release no GitHub e a tela de "Novidades" dentro do app.
> Durante o desenvolvimento, as mudanças vão em `## [Não lançado]` e são renomeadas na hora do release.

## [Não lançado]

## [0.8.0] - 2026-10-27

### Adicionado
- **E-mail**: novo módulo para ler e enviar e-mails pelo U-Hub, com sua própria conta (Gmail, iCloud, Yahoo, Zoho ou qualquer IMAP/SMTP). A senha fica criptografada no computador e nunca vai para a nuvem.
  - Várias contas, com pastas (Entrada, Enviados, Arquivo, Lixeira…), busca e contador de não lidos na barra lateral.
  - Escrever, responder, responder a todos e encaminhar, com anexos, assinatura e sugestão de contatos.
  - **Categorias com regras automáticas** ("de fulano", "do domínio @loja.com", "assunto contém…"), organizando os e-mails dentro do U-Hub sem mexer nas pastas da conta. Já vem com Jogos, Códigos & segurança e Compras. "Categorizar" num e-mail cria a regra do remetente com um clique.
  - **Códigos de verificação** (Steam Guard, Epic, bancos…) detectados com botão "Copiar código" na lista, no e-mail e na notificação.
  - **Keys de jogos** detectadas com "Salvar no Vault".
  - Imagens externas bloqueadas por padrão (evitam rastreamento de leitura), com "Mostrar" ou "Sempre deste remetente".
  - Notificação de e-mail novo em tempo real, por conta: todos, só das categorias que notificam, ou nenhum.
- **Notícias** virou um módulo próprio, separado de Ofertas:
  - Categorias além de jogos: Tecnologia, Mundo, Esportes, Música, Cinema & Séries, Ciência e Economia, cada uma com fontes brasileiras e portuguesas já configuradas. Escolha quais seguir.
  - **Ouvir as notícias**: o U-Hub lê em voz alta uma matéria inteira ou um jornal falado com as manchetes (ou as matérias completas) da categoria. Ao ouvir uma matéria, as seguintes da lista entram na fila. Barra de reprodução com pausar, parágrafo anterior/próximo, notícia anterior/próxima, velocidade e escolha de voz, que continua tocando em qualquer tela; o leitor acompanha a matéria que está sendo lida. A rádio abaixa sozinha enquanto ele fala.
  - **Leitor dentro do app**: abre a matéria em modo leitura, sem anúncios. O parágrafo que está sendo lido fica destacado, e dá para ouvir a partir de qualquer parágrafo. Quando o site não permite, mostra o resumo com "Abrir no site".
  - **Adicionar fonte é só colar o endereço do site**: o U-Hub encontra o feed sozinho, mostra as últimas manchetes e você escolhe a categoria. Feeds Atom agora também funcionam.
  - Notícias e patch notes dos seus jogos da Steam continuam em Jogos, com os filtros Patches e Meus jogos.
- **Apresentação**: escolha dos assuntos de notícias na etapa de conexões.
- **Filmes & Séries**: novo módulo para descobrir o que assistir, com dados do TMDB.
  - Início com destaque da semana e prateleiras: em alta, nos seus streamings, nos cinemas, séries em alta e os mais bem avaliados.
  - **Explorar** com filtros: filmes ou séries, gêneros, duração (ou duração do episódio), onde assistir, época e nota mínima; ordene por populares, mais bem avaliados ou mais recentes.
  - Ficha completa: sinopse, classificação indicativa, duração, elenco, direção, temporadas e episódios, vídeos e recomendações.
  - **Trailer dentro do app** (YouTube), com a rádio abaixando enquanto toca.
  - **Onde assistir** na sua região (streaming, grátis, alugar e comprar, dados da JustWatch), com destaque para os serviços que você assina ("Meus streamings").
  - **Minha lista**: "Quero ver" e "Já vi" com sua nota; sincroniza com a conta U-Hub.
  - **Chegou no streaming**: notificação quando algo da sua lista "Quero ver" fica disponível nos seus streamings.
  - **Me surpreenda**: sorteia um título bem avaliado com os filtros escolhidos.
  - Busca por filmes e séries.

### Melhorado
- **Apresentação**: a escolha de módulos foi redesenhada em três grupos (Jogos, Seu dia, PC & mídia), com "marcar todos" por grupo, e cabe na tela sem rolar.
- **Ofertas** ficou só com jogos grátis, promoções e lista de desejos.
- Vozes baixadas no sistema ("Aprimorada", "Premium", "Natural") são escolhidas automaticamente e marcadas com ★; um botão leva às configurações do sistema para baixá-las.
- Notícias atualizam a cada 30 minutos (antes, 3 horas) e na hora em que você segue uma categoria ou adiciona uma fonte.
- Títulos de notícias com acentos e símbolos aparecem certos em sites que usam outra codificação de texto.

### Corrigido
- **Vault**: se o Vault salvo não puder ser aberto neste computador (pasta de dados vinda de outro computador ou usuário), ele aparece como bloqueado em vez de vazio. Antes, salvar uma credencial nova nessa situação apagava as antigas. Restaurar um backup resolve; "Começar um Vault vazio" guarda o antigo como arquivo.
- **Lista de desejos** com conta em dois computadores de regiões diferentes: os preços ficam por computador e o preço-alvo não é mais zerado pelo outro computador.
- **Spotify**: contas não liberadas no app do Spotify (modo de desenvolvimento) mostram o que fazer, em vez de um erro técnico.
- **E-mail**: notificações duplicadas quando chegavam vários e-mails seguidos; vários de uma vez viram uma notificação só.
- **E-mail**: e-mails que chegam enquanto a conexão caiu (suspensão, Wi-Fi) agora são notificados quando ela volta.
- **E-mail**: as categorias procuram na caixa de entrada inteira, não só nos 40 e-mails mais recentes.
- **E-mail**: editar uma conta não causa mais uma reconexão extra 30 segundos depois.
- **Amigos**: abrir o app não dispara mais uma notificação "está jogando" para cada amigo que já estava jogando.
- Clicar numa notificação depois de fechar a janela (Mac) reabre o U-Hub na tela certa.
- Teclas de mídia e o atalho de tocar/pausar controlam a leitura das notícias enquanto ela está tocando.

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
