/**
 * API exclusiva do Dama ClassMana.
 * Hospedagem recomendada: Railway serve o jogo e a API no MESMO domínio.
 * Em GitHub Pages, configure a URL da API no valor DAMA_API_PUBLIC_URL.
 * Nunca apontar para a API do torneio de arco e flecha.
 */
const DAMA_API_PUBLIC_URL = '';
const sameOrigin = typeof location !== 'undefined' &&
  /^https?:$/.test(location.protocol) && !location.hostname.endsWith('.github.io');
export const DAMA_API_URL = DAMA_API_PUBLIC_URL || (sameOrigin ? `${location.origin}/api` : '');
