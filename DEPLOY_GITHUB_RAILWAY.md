# Publicação contínua — Dama ClassMana

**Objetivo:** Um repositório GitHub exclusivo e um projeto Railway exclusivo. Nada de ZIP, CMD ou Node.js no computador dos alunos.

## Arquitetura

`GitHub (main)` → `Railway (novo serviço)` → `https://DOMINIO-EXCLUSIVO/` (jogo e API no mesmo link). O SQLite fica em volume persistente **exclusivo**, montado em `/data`.

## Primeira publicação (uma única vez)

1. Usar o repositório independente existente [`drjcs2020/ClassDamas`](https://github.com/drjcs2020/ClassDamas). Não reutilizar o repositório do arco e flecha.
2. Enviar os arquivos-fonte desta pasta para a branch `main`.
3. No Railway, criar **novo projeto**, conectar **somente** este novo repositório à `main`, e habilitar auto-deploy.
4. Criar **novo volume** Railway e montar em `/data` neste serviço, **nunca** no serviço do torneio.
5. Definir no Railway `DAMA_DB_PATH=/data/dama-classmana.sqlite` e `DAMA_TEACHER_PASSWORD_SHA256` (SHA-256 de senha forte do professor; não publicar senha no GitHub). Manter o banco fora do repositório.
6. Gerar domínio HTTPS público exclusivo no Railway, e acessar `https://DOMINIO-EXCLUSIVO/`: página inicial já abre o jogo de damas conectado à API no mesmo domínio.
7. Testar em **dois navegadores/dispositivos**: alunos de grupos distintos selecionam nome → desafia → recebe → aceita → alterna jogadas → resultado confirmado → rankings.

## Atualizações

Todas as próximas alterações de código vão para a `main` deste repositório; o Railway faz o deploy do novo commit. **Não há ZIP nem instalação para alunos.**

## Atenção

- Não ativar GitHub Pages inicialmente: o Railway servirá o jogo e a API juntos, o que evita CORS e duas URLs diferentes. O GitHub ficará como repositório-fonte de todo o sistema.
- Nenhum código de estudante/PIN é requerido; apenas seleção de Casa e nome.
- Artes: o jogo busca os seis `hero_*.png` oficiais do repositório `classmana-batalha-dos-monstros-V2`. Não há arqueiros.
- Não apontar para o banco, API ou volume do torneio de arco e flecha.
- Não incluir `data/`, `.env` nem banco SQLite no GitHub. `data/` está no `.gitignore`.
- Cadastros são uma cópia inicial dos arquivos públicos do torneio. Alterações futuras exigirão sincronização controlada, sem escrever no torneio.
