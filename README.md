# ClassMana — Damas dos Heróis (Cloudflare Workers + D1)

**Migração Cloudflare preparada e testada com D1 local; publicação na sua conta Cloudflare ainda não ativada.** O Railway permanece temporariamente no ar como contingência, com seu banco preservado. O Torneio das Três Casas V2 não foi alterado.

➡️ **[Guia de ativação Cloudflare — sem ZIP e sem instalar nada no Windows](docs/MIGRACAO_CLOUDFLARE_CLASSDAMAS.md)**

➡️ **[Testes Cloudflare Workers + D1](.github/workflows/cloudflare-tests.yml)**

➡️ **[Automação de deploy Cloudflare (desativada até configurar a conta)](.github/workflows/cloudflare-deploy.yml)**


**Repositório independente.** Interface de damas, duelos persistentes, rankings de alunos e seis grupos, API Node.js/SQLite e administração do professor. O Torneio de Arco e Flecha V2 não é alterado.

**Para alunos:** [abrir o ClassDamas](https://classmana-duel-api-production.up.railway.app/), selecionar turma e nome, entrar em **Duelo** ou **Treino com robô**. **Sem senha, login ou PIN.**

- **Duelo na própria turma (modo principal):** colegas do 4º A, 4º B ou 4º C, inclusive da mesma equipe, trocam convites pelo sininho. É preciso aceitar para começar; as jogadas alternadas são validadas pelo servidor. Convites podem ficar pendentes até o destinatário abrir o jogo.
- **Evento entre turmas (excepcional):** continuar podendo selecionar qualquer Casa adversária. O botão de convite só é liberado quando o aluno de outra turma está **online**; no aceite, o desafiante também precisa estar online. O sistema não joga no lugar de ninguém.
- **Treino contra robô:** dificuldades **fácil, médio e difícil**, sem depender de alunos online. O treino não modifica o ranking oficial.
- **Presença e atualização:** o navegador envia sinal de presença periódico; o sino e o tabuleiro verificam atualizações automaticamente a cada poucos segundos. Isso é atualização por consulta à API, não WebSocket.

**Para manutenção:** editar a branch `main` no GitHub. Quando a implantação Cloudflare for ativada com os Secrets necessários, os próximos pushes atualizarão o Worker automaticamente. Nenhum ZIP é necessário.

**Railway temporário (ainda não desligar):** reaproveitamos exclusivamente o serviço Railway da versão antiga (V1) para o ClassDamas, sem tocar no projeto do Torneio V2. Origem do serviço: `drjcs2020/ClassDamas` na `main`. Domínio: https://classmana-duel-api-production.up.railway.app/. O banco exclusivo é o arquivo `/data/classdamas.sqlite` em volume persistente. Verifique a implantação mais recente no Railway após alterações.

A migração completa para Cloudflare está documentada no [guia próprio](docs/MIGRACAO_CLOUDFLARE_CLASSDAMAS.md). O documento de Railway é apenas histórico da hospedagem anterior.

## Estrutura

- `online.html`, `online-app.js`, `online.css`, `online-v3.css` — interface, seleção de Casas, sininho, duelos e ranking.
- `bot-ai.js` — motor de treino local com fácil, médio e difícil.
- `cloudflare/worker.mjs` — API Cloudflare com o contrato do frontend e banco D1 exclusivo.
- `cloudflare/migrations/0001_init.sql` — esquema D1 versionado.
- `scripts/build-cloudflare.mjs` — pacote seguro de assets, incluindo retratos oficiais.
- `scripts/test-cloudflare.mjs` — teste end-to-end usando Wrangler + D1 local.
- `duel-api/server.mjs` — servidor Node/SQLite legado para contingência até desligar o Railway.
- `duel-api/roster.json`, `duel-api/teams.json` — alunos e seis grupos oficiais.
- `regras.js` — regras de damas brasileiras compartilhadas entre interface e servidor.
- `index.html`, `app.js`, `styles.css` — treino local (fora do ranking oficial).
- `tests/` — testes automatizados.

## Testes executados

`npm test` (16 testes das regras e equipes) e `npm run test:online` (partidas HTTP persistentes, reinício da API, ranking, temporadas, colegas da mesma equipe e desafios entre turmas condicionados à presença). Os testes usam bancos isolados e não modificam produção. O CI também executa `npm run cf:test` com o runtime Cloudflare e D1 local.

## Arte oficial

Os seis retratos oficiais da Batalha dos Monstros V2 são incorporados ao pacote durante o build para distribuição por Cloudflare Static Assets. A interface tem fallback temporário se a arte estiver indisponível.

## Privacidade e integridade

A seleção de nome é intencionalmente sem senha como no Torneio das Três Casas. Não é comprovação de identidade — acompanhar uso escolar. Os resultados são confirmados pela API após movimentos válidos; treino local não entra no ranking. O professor usa credencial administrativa separada, configurada por Secret no Cloudflare. O uso escolar sem senha de aluno não comprova identidade; recomenda-se supervisão.