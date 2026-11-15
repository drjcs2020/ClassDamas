/**
 * API exclusiva do Dama ClassMana.
 * Cloudflare Workers + Static Assets servem o jogo e a API no MESMO domínio.
 * Enquanto a produção Cloudflare não for ativada, Railway ainda serve como contingência.
 * Em GitHub Pages, configure DAMA_API_PUBLIC_URL para um backend próprio.
 * Nunca apontar para a API do torneio de arco e flecha.
 */
const DAMA_API_PUBLIC_URL = '';
const sameOrigin = typeof location !== 'undefined' &&
  /^https?:$/.test(location.protocol) && !location.hostname.endsWith('.github.io');
export const DAMA_API_URL = DAMA_API_PUBLIC_URL || (sameOrigin ? `${location.origin}/api` : '');
