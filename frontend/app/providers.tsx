'use client';

import { useEffect } from 'react';
import { Provider, useSelector } from 'react-redux';
import { store, RootState } from '@/store';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';

function ThemeSync() {
  const theme    = useSelector((s: RootState) => s.ui.theme);
  const language = useSelector((s: RootState) => s.ui.language);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    i18n.changeLanguage(language);
  }, [language]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <I18nextProvider i18n={i18n}>
        <ThemeSync />
        {children}
      </I18nextProvider>
    </Provider>
  );
}
