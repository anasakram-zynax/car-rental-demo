'use client';

import { useEffect } from 'react';
import { useLanguage } from '@/context/LanguageContext';

export function HtmlDirectionSetter() {
  const { selectedLanguage, direction } = useLanguage();

  useEffect(() => {
    document.documentElement.lang = selectedLanguage.code;
    document.documentElement.dir = direction.toLowerCase();
  }, [selectedLanguage.code, direction]);

  return null;
}
