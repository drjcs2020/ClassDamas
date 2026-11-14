# ClassMana — Damas dos Heróis (GitHub + Railway)

**Repositório independente.** Interface de damas, duelos persistentes, rankings de alunos e seis grupos, API Node.js/SQLite e administração do professor. O Torneio de Arco e Flecha V2 não é alterado.

**Para alunos:** abrir o link público do Railway, escolher Casa e nome, desafiar ou aceitar convite, jogar. **Sem senha, login ou PIN.**

**Para manutenção:** editar a branch `main` no GitHub. Quando o serviço Railway estiver conectado, cada push fará o deploy automaticamente. Não baixar ZIP.

**Status de publicação:** código e testes enviados ao GitHub. A implantação da API no Railway está **pendente**: a conta respondeu `Free plan resource provision limit exceeded` ao tentar criar um projeto novo. Ainda não há endereço público para duelos entre computadores.

Veja [`DEPLOY_GITHUB_RAILWAY.md`](DEPLOY_GITHUB_RAILWAY.md) para a configuração inicial e os cuidados com o volume SQLite.

## Estrutura

- `online.html`, `online-app.js`, `online.css` — jogo de damas online e rankings.
- `duel-api/server.mjs` — servidor HTTP/API e SQLite independente.
- `duel-api/roster.json`, `duel-api/teams.json` — alunos e seis grupos oficiais.
- `regras.js` — regras de damas brasileiras compartilhadas entre interface e servidor.
- `index.html`, `app.js`, `styles.css` — treino local (fora do ranking oficial).
- `tests/` — testes automatizados.

## Testes executados

`npm test` (16 testes das regras e equipes) e `npm run test:online` (duelo HTTP persistente, 49 jogadas, reinício da API, ranking, temporadas). Os testes utilizam SQLite temporário e não modificam banco de produção.

## Arte oficial

As seis imagens oficiais da Batalha dos Monstros V2 são referenciadas diretamente do GitHub; a interface usa apenas seus rostos nas peças. Se a origem estiver indisponível, uma sigla aparece temporariamente, nunca um arqueiro.

## Privacidade e integridade

A seleção de nome é intencionalmente sem senha como no Torneio das Três Casas. Não é comprovação de identidade — acompanhar uso escolar. Os resultados são confirmados pela API após movimentos válidos; treino local não entra no ranking. O professor possui credencial separada, configurada exclusivamente no Railway.