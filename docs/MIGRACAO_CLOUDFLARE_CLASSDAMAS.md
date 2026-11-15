# ClassDamas — migração independente para Cloudflare Workers + D1

## Situação verificada

O **ClassDamas** está publicado no Cloudflare Workers + D1 exclusivo `classdamas-db` em `https://classdamas.jean-silveira35.workers.dev/online.html`. As migrações e o teste público da API foram aprovados. O Railway continua preservado como contingência: **não desligar nem apagar o banco antigo** até decidir sobre a migração de histórico.

A interface atual inclui as **quatro abas do visual aprovado**: Minha Casa, Desafios, Partida e Rankings. Usa castelos oficiais, brasões HD das três casas e seis heróis (incluindo a **Maga Engenheira**, do grupo 6), preservando as regras das damas e os dados D1. Rankings: Turmas, Grupos e Alunos; a classificação por turmas agrega os resultados individuais, sem modificar o ranking original dos grupos.

O Torneio das Três Casas V2 permanece **em outro repositório, Worker e banco de dados**. Na inspeção da `main` do repositório V2, ainda não havia implementação Cloudflare commitada. Esta migração das damas não escreve no repositório nem no banco do torneio.

## Arquitetura

| Recurso | Serviço |
|---|---|
| Interface e artes (brasões, casas e 6 heróis oficiais) | Cloudflare Workers Static Assets |
| API `/api?action=...` | Cloudflare Worker `classdamas` |
| Banco de partidas, sessões, convites e ranking | Cloudflare D1 **`classdamas-db`** |
| Bot fácil, médio e difícil | JavaScript no navegador (sem requisições por jogada) |
| Código-fonte e publicação automática | Repositório GitHub `drjcs2020/ClassDamas` |

A interface existente continua usando `online-config.js`, cujo modo de origem igual comunica com a API do próprio Worker sem CORS externo. Os retratos oficiais são incorporados ao pacote de assets no build e passam a ser distribuídos pelo Cloudflare, evitando depender do GitHub Raw durante a partida.

## Ativação uma única vez (sem instalar nada no Windows)

1. Abra [Cloudflare Dashboard](https://dash.cloudflare.com/), na conta em que pretende hospedar os jogos. Escolha o plano **Workers Free** e consulte os limites antes de publicar.
2. O banco D1 **`classdamas-db`** será criado automaticamente pela publicação, caso ainda não exista. Se já existir, o fluxo verifica seu ID e **não cria outro**. Nunca utiliza o banco do Torneio V2.
3. No Cloudflare, crie um token de API com acesso **restrito à conta escolhida**, permitindo **Workers Scripts Edit** (ou a função Workers necessária para criar o Worker) e **D1 Edit**. Copie o **Account ID** da sua conta. Guarde o token exclusivamente nos Secrets do GitHub, nunca no código ou no chat.
4. Em [GitHub → ClassDamas → Settings → Secrets and variables → Actions](https://github.com/drjcs2020/ClassDamas/settings/secrets/actions), crie estes **Repository secrets**:
   - `CLOUDFLARE_ACCOUNT_ID`: ID da conta Cloudflare.
   - `CLOUDFLARE_API_TOKEN`: token com as permissões acima.
   - `CLOUDFLARE_D1_DATABASE_ID` *(opcional)*: UUID esperado de **classdamas-db**; se informado e não conferir com a conta, a publicação é interrompida. O primeiro deploy precisa apenas dos dois Secrets obrigatórios.
5. Para **publicar pela primeira vez**, não é necessário criar uma variável: abra [Actions → Publicar ClassDamas no Cloudflare](https://github.com/drjcs2020/ClassDamas/actions/workflows/cloudflare-deploy.yml) e execute **Run workflow** na branch `main`. O fluxo exige os dois Secrets acima; sem eles, falha claramente sem executar modificações.
6. **Somente após o primeiro teste dar certo**, para ativar publicação automática a cada push, abra a aba **Variables** do GitHub Actions e crie `CLOUDFLARE_DEPLOY_ENABLED=true`. Antes disso, apenas a execução manual publica no Cloudflare. A automação gera os assets, cria/localiza apenas `classdamas-db`, confere o UUID remoto, aplica as migrações e publica o Worker.
7. Ao concluir, o GitHub Actions mostrará o endereço público do tipo `https://classdamas.<seu-subdominio>.workers.dev`. No mesmo endereço, a API `/api?action=ping` deverá responder `provider: cloudflare` e `database: cloudflare-d1`.

**Atenção:** o arquivo `wrangler.jsonc` do repositório contém um UUID fictício de **desenvolvimento local**. O workflow resolve o UUID do banco pelo nome via Cloudflare, confirma que corresponde ao `classdamas-db` da conta e troca o UUID no runner, sem gravá-lo no Git. Não publicar com o UUID fictício.

### Painel do professor (opcional)

A API reserva a variável de ambiente secreta `DAMA_TEACHER_PASSWORD_SHA256` para autenticar somente o professor; os alunos não possuem senha nem PIN. Após publicar, adicione no Cloudflare Worker uma **Secret** com o hash SHA-256 hexadecimal da senha do professor. Nunca salve a senha em texto claro no GitHub.

Sem esse Secret, as partidas de alunos funcionam normalmente, mas o login administrativo devolve 503 até ser configurado.

## O que a nova API preserva

- Seleção de turma e nome a partir dos arquivos oficiais `duel-api/roster.json` e `duel-api/teams.json`.
- Convites para colegas da própria turma, mesmo quando não estão conectados, inclusive da mesma equipe.
- O sininho mostra convites pendentes; aceitar/recusar depende do aluno desafiado.
- Evento entre turmas: destinatário precisa estar online para ser desafiado; desafiante também precisa estar online no aceite.
- Um único tabuleiro persistente por duelo, turnos obrigatórios, captura obrigatória, coroação e versionamento para impedir jogadas simultâneas.
- Ranking individual e dos seis grupos, histórico de movimentos, temporadas e painel administrativo.
- Treino independente contra o robô, sem contabilizar pontos oficiais.

A tela usa `sync` (quando a API responde `provider: cloudflare`) para agrupar notificações, presença, tabuleiro e ranking em menos requisições. Partidas ativas atualizam aproximadamente a cada 6 segundos; a espera por convites, aproximadamente a cada 25 segundos, com a aba visível. Isso é polling, não WebSocket, e não substitui as decisões do adversário real.

## Verificações antes de desligar Railway

1. O job [Cloudflare — testes locais](https://github.com/drjcs2020/ClassDamas/actions/workflows/cloudflare-tests.yml) precisa estar verde.
2. No URL Cloudflare, confira o ping, roster de 78 alunos, sininho e duelo A vs A em dois navegadores distintos.
3. Confira uma partida dentro da mesma equipe e um evento entre casas apenas com ambos conectados.
4. Confira o robô em três níveis, sem ranking.
5. Confira a conta do professor e o histórico, se necessário.
6. **Não excluir o Railway nem seus volumes até decidir sobre a transferência do histórico.**

### Dados existentes no Railway

A migração de **código** não transfere automaticamente os resultados já registrados no arquivo SQLite `/data/classdamas.sqlite` do Railway. A base D1 nova começa sem partidas, e a classificação inicial também é nova. Para preservar histórico existente, é necessário exportar o banco antigo e fazer uma importação controlada **antes de desligar o Railway**, com comparação de totais, partidas e temporadas.

Não usamos o banco do Torneio das Três Casas como fonte nem destino da migração das damas.

## Limites do plano gratuito

O Workers Free tem cota de **100.000 chamadas diárias por conta** e limite de CPU por requisição. D1 Free também aplica limites diários de linhas lidas e escritas: ao exceder, as operações podem falhar até a próxima renovação UTC. A frequência de sincronização reduz consumo, mas **o plano grátis não garante capacidade para qualquer quantidade de jogadores ou partidas simultâneas**.

Consulte as fontes oficiais:
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/d1/reference/migrations/
- https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
- https://developers.cloudflare.com/workers/static-assets/
