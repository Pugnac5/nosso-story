import { useCallback, useEffect, useState } from 'react';
import { fetchWithRetry } from './fetchWithRetry.js';

export const DEFAULT_EVENT_SETTINGS = {
  couple_names: 'Nosso casamento',
  logo_url: null,
  primary_color: '#A64E68',
  background_color: '#FBF8F4',
  text_color: '#30272C',
  slideshow_interval_seconds: 7,
  slideshow_transition: 'fade',
  story_refresh_seconds: 10,
  gallery_layout: 'grid',
  auto_publish: true,
  event_tagline: 'CADA OLHAR CONTA UMA HISTÓRIA',
  hero_title: 'O grande dia,',
  hero_highlight: 'do jeito que vocês viveram.',
  hero_description: 'Registre os momentos espontâneos, escreva uma mensagem e compartilhe a lembrança com todos os convidados.',
  registration_title: 'Vamos começar pelo seu nome.',
  registration_description: 'O cadastro é rapidinho. Seu nome identifica as fotos que você compartilhar; o WhatsApp é obrigatório para permitir a recuperação do acesso e nunca será exibido publicamente.',
  registration_form_title: 'Participar do casamento',
  registration_form_description: 'Preencha os campos abaixo para liberar a câmera.',
  footer_text: 'Uma foto, uma lembrança, uma história inteira.',
  font_preset: 'editorial',
  spacing_preset: 'comfortable',
  background_preset: 'plain',
  card_style: 'soft',
};

function mixHex(colorA, colorB, ratio) {
  const a = colorA.match(/^#([0-9a-f]{6})$/i)?.[1];
  const b = colorB.match(/^#([0-9a-f]{6})$/i)?.[1];
  if (!a || !b) return colorA;
  const result = [0, 2, 4].map((index) => {
    const left = parseInt(a.slice(index, index + 2), 16);
    const right = parseInt(b.slice(index, index + 2), 16);
    return Math.round(left * (1 - ratio) + right * ratio).toString(16).padStart(2, '0');
  });
  return `#${result.join('')}`;
}

export function applyEventTheme(settings) {
  const root = document.documentElement;
  const primary = settings.primary_color || DEFAULT_EVENT_SETTINGS.primary_color;
  const background = settings.background_color || DEFAULT_EVENT_SETTINGS.background_color;
  const text = settings.text_color || DEFAULT_EVENT_SETTINGS.text_color;
  const fontPresets = {
    editorial: { body: "'DM Sans', Arial, sans-serif", display: "'Playfair Display', Georgia, serif" },
    modern: { body: "Inter, 'Segoe UI', Arial, sans-serif", display: "Inter, 'Segoe UI', Arial, sans-serif" },
    classic: { body: "Georgia, 'Times New Roman', serif", display: "Georgia, 'Times New Roman', serif" },
    rounded: { body: "'Trebuchet MS', Arial, sans-serif", display: "'Trebuchet MS', Arial, sans-serif" },
  };
  const fonts = fontPresets[settings.font_preset] || fontPresets.editorial;
  const spacing = ['compact', 'comfortable', 'airy'].includes(settings.spacing_preset) ? settings.spacing_preset : 'comfortable';
  const backgroundPreset = ['plain', 'soft-gradient', 'warm'].includes(settings.background_preset) ? settings.background_preset : 'plain';
  const cardStyle = ['soft', 'outlined', 'flat'].includes(settings.card_style) ? settings.card_style : 'soft';

  root.dataset.fontPreset = settings.font_preset || 'editorial';
  root.dataset.spacingPreset = spacing;
  root.dataset.backgroundPreset = backgroundPreset;
  root.dataset.cardStyle = cardStyle;
  root.style.fontFamily = fonts.body;
  root.style.setProperty('--font-body', fonts.body);
  root.style.setProperty('--serif', fonts.display);
  root.style.setProperty('--rose', primary);
  root.style.setProperty('--rose-dark', mixHex(primary, '#000000', 0.22));
  root.style.setProperty('--rose-pale', mixHex(primary, background, 0.88));
  root.style.setProperty('--canvas', background);
  root.style.setProperty('--ink', text);
  root.style.setProperty('--muted', mixHex(text, background, 0.42));
  document.body.style.backgroundColor = background;
  document.body.style.backgroundImage = backgroundPreset === 'soft-gradient'
    ? `linear-gradient(135deg, ${background} 0%, ${mixHex(background, primary, 0.10)} 100%)`
    : backgroundPreset === 'warm'
      ? `linear-gradient(180deg, ${background} 0%, ${mixHex(background, '#D7BBAE', 0.12)} 100%)`
      : 'none';
  document.body.style.color = text;
  document.title = `${settings.couple_names || 'Nosso casamento'} | Nosso Story`;
}

export function useEventSettings() {
  const [settings, setSettings] = useState(DEFAULT_EVENT_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);

  const refreshSettings = useCallback(async () => {
    try {
      const response = await fetchWithRetry('/api/settings', { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Não foi possível carregar as configurações do evento.');
      const payload = await response.json();
      setSettings({ ...DEFAULT_EVENT_SETTINGS, ...(payload.settings || {}) });
    } catch {
      // Mantém o tema padrão se a API de configurações estiver temporariamente indisponível.
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => { refreshSettings(); }, [refreshSettings]);
  useEffect(() => { applyEventTheme(settings); }, [settings]);

  return { settings, setSettings, settingsLoading, refreshSettings };
}
