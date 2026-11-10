'use client';

import { useEffect, useState } from 'react';
import { COLORS, DARK_COLORS } from '@/lib/constants';
import { toTint } from '@/lib/utils/colorTint';
import {
  type GuestKeyKind,
  getGuestKey,
  setGuestKey,
  GUEST_KEY_REQUIRED_EVENT,
} from '@/lib/guestKeys';

interface GuestApiKeyModalProps {
  isDarkMode?: boolean;
}

const COPY: Record<GuestKeyKind, { title: string; help: string; link: string; linkLabel: string }> = {
  gemini: {
    title: 'AI explanations use your own key',
    help: 'In guest mode, AI explanations run on your personal Google Gemini API key. It is stored only in this browser and sent solely to make your request.',
    link: 'https://aistudio.google.com/apikey',
    linkLabel: 'Get a free Gemini API key',
  },
  tts: {
    title: 'Audio uses your own key',
    help: 'In guest mode, text-to-speech runs on your personal Google Cloud TTS API key. It is stored only in this browser and sent solely to make your request.',
    link: 'https://console.cloud.google.com/apis/credentials',
    linkLabel: 'Get a Google Cloud TTS API key',
  },
  translate: {
    title: 'Translation uses your own key',
    help: 'In guest mode, translation runs on your personal Google Cloud Translation API key. It is stored only in this browser and sent solely to make your request.',
    link: 'https://console.cloud.google.com/apis/credentials',
    linkLabel: 'Get a Google Cloud Translation API key',
  },
};

export default function GuestApiKeyModal({ isDarkMode = false }: GuestApiKeyModalProps) {
  const [kind, setKind] = useState<GuestKeyKind | null>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as { kind: GuestKeyKind };
      setKind(detail.kind);
      setValue(getGuestKey(detail.kind) || '');
    };
    window.addEventListener(GUEST_KEY_REQUIRED_EVENT, handler);
    return () => window.removeEventListener(GUEST_KEY_REQUIRED_EVENT, handler);
  }, []);

  if (!kind) return null;

  const copy = COPY[kind];

  const theme = isDarkMode
    ? {
        card: DARK_COLORS.SURFACE,
        title: DARK_COLORS.TEXT,
        help: DARK_COLORS.TEXT_MUTED,
        inputBg: DARK_COLORS.BASE,
        inputBorder: DARK_COLORS.NEUTRAL,
        cancelBg: 'transparent',
        cancelText: DARK_COLORS.TEXT,
        primary: DARK_COLORS.PRIMARY,
        onPrimary: DARK_COLORS.BASE,
      }
    : {
        card: COLORS.SURFACE,
        title: COLORS.INK,
        help: COLORS.SECONDARY,
        inputBg: COLORS.SURFACE,
        inputBorder: COLORS.NEUTRAL,
        cancelBg: 'transparent',
        cancelText: COLORS.INK,
        primary: COLORS.PRIMARY,
        onPrimary: COLORS.SURFACE,
      };

  const handleSave = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setGuestKey(kind, trimmed);
    setKind(null);
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      style={{ backgroundColor: toTint(COLORS.INK, isDarkMode ? 60 : 40) }}
      onClick={() => setKind(null)}
    >
      <div
        className="w-full max-w-md p-6"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.title}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-mincho font-bold text-lg tracking-[0.04em] mb-2" style={{ color: theme.title }}>
          {copy.title}
        </h2>
        <p className="text-sm mb-4 leading-relaxed" style={{ color: theme.help }}>
          {copy.help}
        </p>

        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
          }}
          placeholder="Paste your API key"
          autoFocus
          className="w-full px-3 py-2.5 text-sm mb-3 focus:outline-2"
          style={{
            border: `1px solid ${theme.inputBorder}`,
            backgroundColor: theme.inputBg,
            color: theme.title,
            outlineColor: theme.primary,
          }}
        />

        <a
          href={copy.link}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-bold underline underline-offset-4 interactive-link"
          style={{ color: theme.primary }}
        >
          {copy.linkLabel}
        </a>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={() => setKind(null)}
            className="min-h-11 px-5 text-sm font-bold interactive-page-btn"
            style={{
              backgroundColor: theme.cancelBg,
              border: `1px solid ${theme.inputBorder}`,
              color: theme.cancelText,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!value.trim()}
            className="min-h-11 px-5 text-sm font-bold disabled:opacity-40 interactive-btn"
            style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
          >
            Save key
          </button>
        </div>
      </div>
    </div>
  );
}
