import React from 'react';
import { useTranslation } from 'react-i18next';

export default function LanguageSwitcher({ className = '' }) {
  const { i18n } = useTranslation();
  const current = i18n.language?.startsWith('fr') ? 'fr' : 'en';

  const toggle = (lang) => {
    if (lang !== current) {
      i18n.changeLanguage(lang);
    }
  };

  return (
    <div className={`flex items-center gap-1 text-xs font-medium select-none ${className}`}>
      <button
        onClick={() => toggle('en')}
        className={`px-1.5 py-0.5 rounded transition-colors ${
          current === 'en'
            ? 'bg-violet-600 text-white'
            : 'text-gray-400 hover:text-gray-200'
        }`}
        aria-label="Switch to English"
      >
        EN
      </button>
      <span className="text-gray-600">|</span>
      <button
        onClick={() => toggle('fr')}
        className={`px-1.5 py-0.5 rounded transition-colors ${
          current === 'fr'
            ? 'bg-violet-600 text-white'
            : 'text-gray-400 hover:text-gray-200'
        }`}
        aria-label="Passer en français"
      >
        FR
      </button>
    </div>
  );
}
