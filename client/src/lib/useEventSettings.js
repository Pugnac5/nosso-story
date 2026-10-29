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
  root.style.setProperty('--rose', primary);
  root.style.setProperty('--rose-dark', mixHex(primary, '#000000', 0.22));
  root.style.setProperty('--rose-pale', mixHex(primary, background, 0.88));
  root.style.setProperty('--canvas', background);
  root.style.setProperty('--ink', text);
  root.style.setProperty('--muted', mixHex(text, background, 0.42));
  document.body.style.backgroundColor = background;
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
