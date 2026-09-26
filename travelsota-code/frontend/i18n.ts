import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

const ACTIVE_LOCALES = ['en', 'ar'];
const DEFAULT_LOCALE = 'en';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;

  const locale =
    cookieLocale && ACTIVE_LOCALES.includes(cookieLocale)
      ? cookieLocale
      : DEFAULT_LOCALE;

  return {
    locale,
    timeZone: 'Asia/Riyadh',
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
