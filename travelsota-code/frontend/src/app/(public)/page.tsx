'use client';

import { useMemo, useState, useRef, useCallback, useEffect, type FormEvent, type PointerEvent } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import { useReducedData } from '@/hooks/useReducedData';
import type { FlightSearchFormState } from '@/components/search/FlightSearchForm';
import { SearchSection } from '@/components/search/SearchSection';
import { SearchModeSwitcher } from '@/components/search/SearchModeSwitcher';
// Below-fold sections split out: their JS + data fetch off first paint.
const FeaturedHotelsSection = dynamic(
  () => import('@/features/home/components/FeaturedHotelsSection').then((m) => m.FeaturedHotelsSection),
  { ssr: false, loading: () => <div className="mx-auto max-w-7xl px-4 py-10"><div className="h-64 animate-pulse rounded-[22px] bg-zinc-100" /></div> },
);
const FeaturedFlightsSection = dynamic(
  () => import('@/features/home/components/FeaturedFlightsSection').then((m) => m.FeaturedFlightsSection),
  { ssr: false, loading: () => <div className="mx-auto max-w-7xl px-4 py-10"><div className="h-44 animate-pulse rounded-[22px] bg-zinc-100" /></div> },
);
const FeaturedToursSection = dynamic(
  () => import('@/features/home/components/FeaturedToursSection').then((m) => m.FeaturedToursSection),
  { ssr: false, loading: () => <div className="mx-auto max-w-7xl px-4 py-10"><div className="h-64 animate-pulse rounded-[22px] bg-zinc-100" /></div> },
);
import type { FormState, RoomForm } from '@/features/hotels/types/search-form';
import { useAuth } from '@/hooks/useAuth';
import { storeSearchBridge } from '@/lib/search-bridge';
import { useSiteBranding } from '@/components/common/BrandingProvider';
import { optimizedImageUrl } from '@/features/admin/api/admin-settings';

type SearchMode = 'flights' | 'hotels';

const ease = [0.16, 1, 0.3, 1] as const;

// Module-synced hero backgrounds — admin-configurable via General Settings
// (Cloudinary, f_auto/q_auto delivery), falling back to the bundled scenes
// (now WebP, ~89% smaller than the legacy PNG).
const flightHeroImage = '/images/home/hero-travel-collage.webp';
const hotelHeroImage = '/images/home/hero-aerial-beach.webp';

// White plane glyph — drawn in white so it reads clearly against the colorful hero collage.
const planeGlyph =
  'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z';

function getDate(daysFromNow: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

export default function HomePage() {
  const router = useRouter();
  const tFlights = useTranslations('Flights');
  const tHotels = useTranslations('Hotels');
  const tHome = useTranslations('Home');
  const { user } = useAuth();
  const prefersReducedMotion = useReducedMotion();
  const prefersReducedData = useReducedData();
  const [hotelImageMounted, setHotelImageMounted] = useState(false);
  const [hotelImageReady, setHotelImageReady] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>('flights');
  const [flightError, setFlightError] = useState<string | null>(null);
  const [hotelError, setHotelError] = useState<string | null>(null);
  const [flightForm, setFlightForm] = useState<FlightSearchFormState>({
    origin: '',
    destination: '',
    departureDate: getDate(14),
    tripType: 'round_trip',
    returnDate: getDate(21),
    cabinClass: 'Economy',
    adults: 1,
    originSuggestion: null,
    destinationSuggestion: null,
    legs: [
      { origin: '', destination: '', departureDate: getDate(14) },
      { origin: '', destination: '', departureDate: getDate(21) },
    ],
    legSuggestions: [null, null],
  });
  const [hotelForm, setHotelForm] = useState<FormState>({
    checkIn: getDate(14),
    checkOut: getDate(17),
    destinationName: '',
    selectedDestinationCode: '',
    selectedDestination: null,
    hotelName: '',
    selectedHotel: null,
    roomsList: [{ adults: '2', children: '0', childAges: '' }],
    nationality: 'AE',
  });

  // Module-synced hero — mount the Hotels background only when the visitor first opens the Hotels
  // tab, so the extra image never hits the wire for visitors who only use flights.
  // (Render-time state adjustment — the React-blessed alternative to an effect for this.)
  if (searchMode === 'hotels' && !hotelImageMounted) {
    setHotelImageMounted(true);
  }

  const [heroVisible, setHeroVisible] = useState(true);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(([entry]) => {
      setHeroVisible(entry.isIntersecting);
    }, { threshold: 0.05 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Static fallback: no animation layer for reduced-motion, low-bandwidth, or off-screen visitors.
  const showHeroMotion = heroVisible && !prefersReducedMotion && !prefersReducedData;
  // Reduced-motion users get an instant switch instead of a crossfade.
  const imageTransition = prefersReducedMotion ? '' : 'transition-opacity duration-700 ease-out';

  // Admin-curated hero images. Branding is SSR-delivered via the root layout
  // (BrandingProvider seeds from the server bundle — warm cache, backend fetch,
  // or the visitor's branding cookie). While NOT ready we render the gradient
  // skeleton and NO image at all: a bundled default here is exactly the
  // "glimpse of default hero" flash. Once ready, admins without a custom hero
  // legitimately get the bundled scene (that's the configured state, not a flash).
  const { bundle, ready: brandingReady } = useSiteBranding();
  const heroBackgrounds = bundle.hero;
  const flightHeroSrc =
    brandingReady && heroBackgrounds.flights ? optimizedImageUrl(heroBackgrounds.flights) : brandingReady ? flightHeroImage : null;
  const hotelHeroSrc =
    brandingReady && heroBackgrounds.hotels ? optimizedImageUrl(heroBackgrounds.hotels) : brandingReady ? hotelHeroImage : null;

  // Pointer parallax — CSS vars on the section, layers translate off them.
  // Transform-only (no React state) so it never re-renders the tree.
  const sectionRef = useRef<HTMLElement | null>(null);
  const parallaxRaf = useRef<number | null>(null);
  const handleHeroPointerMove = useCallback((e: PointerEvent<HTMLElement>) => {
    if (prefersReducedMotion || !sectionRef.current) return;
    const rect = sectionRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const py = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    if (parallaxRaf.current != null) return;
    parallaxRaf.current = requestAnimationFrame(() => {
      parallaxRaf.current = null;
      sectionRef.current?.style.setProperty('--hero-px', px.toFixed(3));
      sectionRef.current?.style.setProperty('--hero-py', py.toFixed(3));
    });
  }, [prefersReducedMotion]);
  const handleHeroPointerLeave = useCallback(() => {
    sectionRef.current?.style.setProperty('--hero-px', '0');
    sectionRef.current?.style.setProperty('--hero-py', '0');
  }, []);

  const minHotelDate = useMemo(() => getDate(1), []);
  const isAgent = user?.userType === 'AGENT';

  function handleFlightSearch() {
    setFlightError(null);

    if (flightForm.tripType === 'multi_city') {
      if (!flightForm.legs || flightForm.legs.length < 2) {
        setFlightError(tFlights('multiCityMinLegs'));
        return;
      }
      for (let i = 0; i < flightForm.legs.length; i++) {
        const leg = flightForm.legs[i];
        const originCode = leg.origin.trim().toUpperCase();
        const destCode = leg.destination.trim().toUpperCase();
        if (!originCode || originCode.length !== 3) {
          setFlightError(tFlights('legOriginRequired', { index: i + 1 }));
          return;
        }
        if (!destCode || destCode.length !== 3) {
          setFlightError(tFlights('legDestinationRequired', { index: i + 1 }));
          return;
        }
        if (!leg.departureDate) {
          setFlightError(tFlights('legDateRequired', { index: i + 1 }));
          return;
        }
      }
      const params = new URLSearchParams();
      params.set('tripType', 'multi_city');
      params.set('cabinClass', flightForm.cabinClass);
      params.set('adults', String(flightForm.adults));
      params.set('legs', JSON.stringify(flightForm.legs.map((leg) => ({
        origin: leg.origin.trim().toUpperCase(),
        destination: leg.destination.trim().toUpperCase(),
        departureDate: leg.departureDate,
      }))));
      router.push(`/flights/search?${params.toString()}`);
      return;
    }

    if (!flightForm.origin || !flightForm.originSuggestion) {
      setFlightError(tFlights('selectOrigin'));
      return;
    }
    if (!flightForm.destination || !flightForm.destinationSuggestion) {
      setFlightError(tFlights('selectDestination'));
      return;
    }
    if (!flightForm.departureDate) {
      setFlightError(tFlights('departureDateRequired'));
      return;
    }
    if (flightForm.tripType === 'round_trip' && !flightForm.returnDate) {
      setFlightError(tFlights('returnDateRequired'));
      return;
    }

    storeSearchBridge('flights', {
      originSuggestion: flightForm.originSuggestion,
      destinationSuggestion: flightForm.destinationSuggestion,
    });

    const params = new URLSearchParams();
    params.set('origin', flightForm.originSuggestion?.code ?? flightForm.origin);
    params.set('destination', flightForm.destinationSuggestion?.code ?? flightForm.destination);
    params.set('departureDate', flightForm.departureDate);
    params.set('tripType', flightForm.tripType);
    params.set('cabinClass', flightForm.cabinClass);
    params.set('adults', String(flightForm.adults));
    if (flightForm.tripType === 'round_trip' && flightForm.returnDate) {
      params.set('returnDate', flightForm.returnDate);
    }
    router.push(`/flights/search?${params.toString()}`);
  }

  function handleHotelSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHotelError(null);

    if (!hotelForm.destinationName && !hotelForm.hotelName) {
      setHotelError(tHotels('destinationRequired'));
      return;
    }
    if (hotelForm.destinationName && !hotelForm.selectedDestination && !hotelForm.selectedHotel) {
      setHotelError(tHotels('selectDestinationRequired'));
      return;
    }
    if (hotelForm.hotelName && !hotelForm.selectedHotel) {
      setHotelError(tHotels('selectHotelRequired'));
      return;
    }

    storeSearchBridge('hotels', {
      selectedDestination: hotelForm.selectedDestination,
      selectedHotel: hotelForm.selectedHotel,
    });

    const params = new URLSearchParams();
    params.set('destinationName', hotelForm.destinationName);
    params.set('selectedDestinationCode', hotelForm.selectedDestinationCode);
    params.set('hotelName', hotelForm.hotelName);
    params.set('checkIn', hotelForm.checkIn);
    params.set('checkOut', hotelForm.checkOut);
    params.set('nationality', hotelForm.nationality);
    params.set('rooms', JSON.stringify(hotelForm.roomsList));
    router.push(`/hotels/search?${params.toString()}`);
  }

  function updateHotelField<K extends keyof FormState>(key: K, value: string) {
    setHotelForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateHotelRoom(index: number, key: keyof RoomForm, value: string) {
    setHotelForm((prev) => {
      const roomsList = [...prev.roomsList];
      roomsList[index] = { ...roomsList[index], [key]: value };
      return { ...prev, roomsList };
    });
  }

  return (
    <div className="min-h-dvh bg-white text-charcoal antialiased">
      <section
        ref={sectionRef}
        onPointerMove={handleHeroPointerMove}
        onPointerLeave={handleHeroPointerLeave}
        className="relative flex min-h-[70vh] flex-col items-center justify-center overflow-hidden px-4 pb-16 pt-24 sm:min-h-[72vh] sm:px-6 lg:min-h-[80vh] lg:px-8"
      >
        {/* Module-synced backgrounds — Flights shows the collage, Hotels crossfades to the resort scene.
            Admin can override either image per-module from General Settings (Cloudinary originals,
            served f_auto/q_auto). Until branding resolves, a brand-gradient skeleton shows instead
            of any default image (no FOUC). */}
        <div className="absolute inset-0 z-0" aria-hidden="true">
          <div className="absolute inset-0 bg-gradient-to-br from-brand-teal-800 via-brand-teal-900 to-[#011a20]" />
          {/* LCP image: only when branding is resolved (SSR bundle or the
              branding cookie made it ready BEFORE first paint in every normal
              path) — otherwise the gradient skeleton above IS the first paint.
              No default image is ever painted then swapped. */}
          {flightHeroSrc && (
            <Image
              src={flightHeroSrc}
              alt=""
              fill
              priority
              sizes="100vw"
              className={`object-cover ${imageTransition} ${searchMode === 'hotels' && hotelImageReady ? 'opacity-0' : 'opacity-100'}`}
            />
          )}
          {hotelImageMounted && hotelHeroSrc && (
            <Image
              src={hotelHeroSrc}
              alt=""
              fill
              sizes="100vw"
              loading="lazy"
              onLoad={() => setHotelImageReady(true)}
              className={`object-cover ${imageTransition} ${searchMode === 'hotels' && hotelImageReady ? 'opacity-100' : 'opacity-0'}`}
            />
          )}
        </div>

        {/* Readability scrim — calms any admin-uploaded image behind the headline,
            routes and form without dimming the scene itself. */}
        <div className="absolute inset-x-0 top-0 z-[1] h-[65%] bg-gradient-to-b from-black/45 via-black/15 to-transparent" aria-hidden="true" />

        {/* "Flight corridors at dusk" — aurora ribbon, twinkling waypoint constellation and
            banking aircraft on gradient routes, tied to the Flights tab. The layer drifts
            subtly against the pointer for depth, fades out in Hotels mode and is skipped
            entirely for reduced-motion / low-bandwidth visitors (static fallback). */}
        {showHeroMotion && searchMode === 'flights' && (
          <div
            className={`pointer-events-none absolute inset-x-0 top-0 z-[2] h-[42%] min-h-[170px] ${imageTransition} [filter:drop-shadow(0_2px_5px_rgba(0,0,0,0.55))] opacity-100`}
            aria-hidden="true"
          >
            {/* Aurora ribbon — layered light drifting behind the routes */}
            <div className="hero-aurora absolute -top-16 left-[-10%] h-[70%] w-[70%] rounded-full opacity-70 blur-3xl" />
            <div className="hero-aurora-slow absolute -top-10 right-[-8%] h-[60%] w-[55%] rounded-full opacity-40 blur-3xl" />

            <svg
              className="absolute inset-0 h-full w-full overflow-visible will-change-transform"
              style={{ transform: 'translate3d(calc(var(--hero-px, 0) * -12px), calc(var(--hero-py, 0) * -7px), 0)' }}
              viewBox="0 0 1440 260"
              fill="none"
              preserveAspectRatio="xMidYMid slice"
            >
              <defs>
                <path id="hero-route-main" d="M 60 180 C 340 70, 720 48, 1300 150" />
                <path id="hero-route-sub" d="M 200 236 C 520 188, 880 184, 1230 226" />
                <path id="hero-route-top" d="M 300 -20 C 600 44, 1000 38, 1240 -18" />
                <radialGradient id="hero-plane-glow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="rgba(190,255,244,0.55)" />
                  <stop offset="100%" stopColor="rgba(190,255,244,0)" />
                </radialGradient>
                <linearGradient id="hero-contrail" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="rgba(255,255,255,0)" />
                  <stop offset="70%" stopColor="rgba(214,246,255,0.4)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0.95)" />
                </linearGradient>
                <linearGradient id="hero-route-stroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.7)" />
                  <stop offset="55%" stopColor="rgba(168,240,255,0.6)" />
                  <stop offset="100%" stopColor="rgba(255,214,170,0.65)" />
                </linearGradient>
              </defs>

              {/* Waypoint constellation — fixed scatter, each star breathing on its own clock */}
              <g fill="#ffffff">
                <circle cx="150" cy="60" r="1.6"><animate attributeName="opacity" values="0.1;0.8;0.1" dur="3.2s" repeatCount="indefinite" /></circle>
                <circle cx="330" cy="130" r="1.2"><animate attributeName="opacity" values="0.15;0.7;0.15" dur="4.1s" begin="0.6s" repeatCount="indefinite" /></circle>
                <circle cx="480" cy="40" r="1.8"><animate attributeName="opacity" values="0.1;0.9;0.1" dur="2.7s" begin="1.2s" repeatCount="indefinite" /></circle>
                <circle cx="640" cy="110" r="1.3"><animate attributeName="opacity" values="0.12;0.75;0.12" dur="3.8s" begin="0.3s" repeatCount="indefinite" /></circle>
                <circle cx="820" cy="30" r="1.5"><animate attributeName="opacity" values="0.1;0.85;0.1" dur="3.4s" begin="1.8s" repeatCount="indefinite" /></circle>
                <circle cx="960" cy="150" r="1.2"><animate attributeName="opacity" values="0.15;0.65;0.15" dur="4.4s" begin="0.9s" repeatCount="indefinite" /></circle>
                <circle cx="1080" cy="70" r="1.7"><animate attributeName="opacity" values="0.1;0.8;0.1" dur="2.9s" begin="2.2s" repeatCount="indefinite" /></circle>
                <circle cx="1200" cy="190" r="1.3"><animate attributeName="opacity" values="0.12;0.7;0.12" dur="3.6s" begin="1.5s" repeatCount="indefinite" /></circle>
                <circle cx="240" cy="210" r="1.4"><animate attributeName="opacity" values="0.1;0.6;0.1" dur="4.8s" begin="2.6s" repeatCount="indefinite" /></circle>
                <circle cx="760" cy="200" r="1.2"><animate attributeName="opacity" values="0.12;0.65;0.12" dur="3.9s" begin="0.4s" repeatCount="indefinite" /></circle>
                <circle cx="560" cy="170" r="1.1"><animate attributeName="opacity" values="0.1;0.6;0.1" dur="5s" begin="1.1s" repeatCount="indefinite" /></circle>
                <circle cx="1330" cy="60" r="1.5"><animate attributeName="opacity" values="0.1;0.8;0.1" dur="3.1s" begin="2s" repeatCount="indefinite" /></circle>
              </g>

              {/* Main corridor — flowing gradient dash */}
              <path
                d="M 60 180 C 340 70, 720 48, 1300 150"
                stroke="url(#hero-route-stroke)"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeDasharray="1 10"
              >
                <animate attributeName="stroke-dashoffset" from="0" to="-22" dur="7s" repeatCount="indefinite" />
              </path>
              <path
                d="M 200 236 C 520 188, 880 184, 1230 226"
                stroke="rgba(255,255,255,0.45)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeDasharray="0.5 14"
              />
              <path
                d="M 300 -20 C 600 44, 1000 38, 1240 -18"
                stroke="rgba(255,255,255,0.4)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeDasharray="0.5 12"
              />

              {/* City nodes — DXB / JFK / LHR with pulsing rings and micro-uppercase labels */}
              <g>
                <circle cx="60" cy="180" r="7" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5">
                  <animate attributeName="opacity" values="0.2;0.9;0.2" dur="3s" repeatCount="indefinite" />
                  <animate attributeName="r" values="5;11;5" dur="3s" repeatCount="indefinite" />
                </circle>
                <circle cx="60" cy="180" r="2.6" fill="#ffffff" />
                <text x="72" y="185" fill="rgba(255,255,255,0.95)" fontSize="11" fontWeight="600" letterSpacing="1.5" fontFamily="'DM Sans', ui-sans-serif, system-ui, sans-serif">DXB</text>
              </g>
              <g>
                <circle cx="1300" cy="150" r="7" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5">
                  <animate attributeName="opacity" values="0.2;0.9;0.2" dur="3s" begin="1.5s" repeatCount="indefinite" />
                  <animate attributeName="r" values="5;11;5" dur="3s" begin="1.5s" repeatCount="indefinite" />
                </circle>
                <circle cx="1300" cy="150" r="2.6" fill="#ffffff" />
                <text x="1312" y="155" fill="rgba(255,255,255,0.95)" fontSize="11" fontWeight="600" letterSpacing="1.5" fontFamily="'DM Sans', ui-sans-serif, system-ui, sans-serif">JFK</text>
              </g>
              <g>
                <circle cx="1230" cy="226" r="6" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.4">
                  <animate attributeName="opacity" values="0.2;0.85;0.2" dur="3.6s" begin="0.8s" repeatCount="indefinite" />
                  <animate attributeName="r" values="4;9;4" dur="3.6s" begin="0.8s" repeatCount="indefinite" />
                </circle>
                <circle cx="1230" cy="226" r="2.2" fill="#ffffff" />
                <text x="1242" y="231" fill="rgba(255,255,255,0.9)" fontSize="10" fontWeight="600" letterSpacing="1.5" fontFamily="'DM Sans', ui-sans-serif, system-ui, sans-serif">LHR</text>
              </g>

              {/* Main aircraft — long fading contrail, DXB → JFK */}
              <g>
                <animateMotion dur="16s" repeatCount="indefinite" rotate="auto">
                  <mpath href="#hero-route-main" />
                </animateMotion>
                <path d="M -150 10 L -12 2" stroke="url(#hero-contrail)" strokeWidth="3" strokeLinecap="round" />
                <circle cx="0" cy="0" r="34" fill="url(#hero-plane-glow)" />
                <g transform="translate(-19,-19) scale(1.55)">
                  <path
                    d={planeGlyph}
                    fill="#ffffff"
                    stroke="#0d3f4c"
                    strokeOpacity="0.35"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              </g>

              {/* Medium aircraft on the lower corridor */}
              <g opacity="0.9">
                <animateMotion dur="26s" repeatCount="indefinite" rotate="auto">
                  <mpath href="#hero-route-sub" />
                </animateMotion>
                <path d="M -90 7 L -10 1" stroke="url(#hero-contrail)" strokeWidth="2.2" strokeLinecap="round" />
                <circle cx="0" cy="0" r="22" fill="url(#hero-plane-glow)" />
                <g transform="translate(-12,-12) scale(1)">
                  <path
                    d={planeGlyph}
                    fill="#ffffff"
                    stroke="#0d3f4c"
                    strokeOpacity="0.4"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              </g>

              {/* Small aircraft passing overhead */}
              <g opacity="0.7">
                <animateMotion dur="34s" repeatCount="indefinite" rotate="auto">
                  <mpath href="#hero-route-top" />
                </animateMotion>
                <circle cx="0" cy="0" r="14" fill="url(#hero-plane-glow)" />
                <g transform="translate(-8,-8) scale(0.65)">
                  <path
                    d={planeGlyph}
                    fill="#ffffff"
                    stroke="#0d3f4c"
                    strokeOpacity="0.45"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              </g>
            </svg>
          </div>
        )}

        {/* "Golden hour drift" — sun rays, rising light motes and a slow shimmer sweep,
            tied to the Hotels tab. Same gating + fade pattern as the flights layer. */}
        {showHeroMotion && searchMode === 'hotels' && (
          <div
            className={`pointer-events-none absolute inset-0 z-[2] ${imageTransition} [filter:drop-shadow(0_1px_3px_rgba(0,0,0,0.45))] opacity-100`}
            aria-hidden="true"
          >
            {/* Sun rays breathing from the top */}
            <div className="hero-ray hero-ray-1 absolute -top-[20%] left-[12%] h-[75%] w-[16%] rotate-[16deg]" />
            <div className="hero-ray hero-ray-2 absolute -top-[20%] left-[38%] h-[85%] w-[12%] rotate-[6deg]" />
            <div className="hero-ray hero-ray-3 absolute -top-[20%] right-[16%] h-[70%] w-[18%] -rotate-[12deg]" />

            {/* Rising light motes */}
            {[
              { left: '8%', size: 6, dur: 22, delay: 0 },
              { left: '18%', size: 4, dur: 28, delay: -8 },
              { left: '27%', size: 9, dur: 19, delay: -14 },
              { left: '36%', size: 5, dur: 26, delay: -4 },
              { left: '47%', size: 7, dur: 23, delay: -18 },
              { left: '56%', size: 4, dur: 30, delay: -10 },
              { left: '64%', size: 8, dur: 21, delay: -2 },
              { left: '73%', size: 5, dur: 27, delay: -12 },
              { left: '81%', size: 6, dur: 24, delay: -6 },
              { left: '90%', size: 9, dur: 20, delay: -16 },
            ].map((mote, i) => (
              <span
                key={i}
                className="hero-mote absolute bottom-[-12px] rounded-full"
                style={{
                  left: mote.left,
                  width: mote.size,
                  height: mote.size,
                  animationDuration: `${mote.dur}s`,
                  animationDelay: `${mote.delay}s`,
                }}
              />
            ))}

            {/* Slow shimmer sweep across the scene */}
            <div className="hero-shimmer absolute inset-y-0 w-[38%] -skew-x-12" />

            {/* Parallax drift — opposite direction to the flights layer for depth */}
            <div
              className="absolute inset-0 will-change-transform"
              style={{ transform: 'translate3d(calc(var(--hero-px, 0) * 8px), calc(var(--hero-py, 0) * 5px), 0)' }}
            >
              <div className="hero-cloud absolute left-[-15%] top-[18%] h-[14%] w-[45%] rounded-full opacity-[0.16] blur-2xl" />
              <div className="hero-cloud-slow absolute right-[-12%] top-[42%] h-[12%] w-[40%] rounded-full opacity-[0.12] blur-2xl" />
            </div>
          </div>
        )}


        {/* Search — one short H1, the form is the CTA (OTA-standard hero). */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease }}
          className="relative z-30 mx-auto flex w-full max-w-6xl flex-col items-center"
        >
          <div className="flex flex-col items-center">
            {/* Single-sentence H1 — swaps with the module via pure CSS (no hydration surface). */}
            <h1
              key={searchMode}
              className="hero-h1 mb-3 text-center text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-[2.75rem] lg:leading-tight"
            >
              {searchMode === 'flights' ? tHome('heroFlightsTitle') : tHome('heroHotelsTitle')}
            </h1>
            <SearchModeSwitcher searchMode={searchMode} onSearchModeChange={setSearchMode} />
          </div>
          <div id="search-section" className="mt-4 w-full scroll-mt-28">
            <SearchSection
              searchMode={searchMode}
              onSearchModeChange={setSearchMode}
              flightForm={flightForm}
              onFlightFormChange={(updates) => setFlightForm((prev) => ({ ...prev, ...updates }))}
              onFlightSearch={handleFlightSearch}
              flightError={flightError}
              hotelForm={hotelForm}
              onHotelFieldChange={updateHotelField}
              onHotelRoomChange={updateHotelRoom}
              onHotelSubmit={handleHotelSubmit}
              onHotelFormSet={setHotelForm}
              hotelMinDate={minHotelDate}
              hotelError={hotelError}
              isAgent={isAgent}
              showInternalSwitcher={false}
            />
          </div>
        </motion.div>
      </section>

      <FeaturedHotelsSection />
      <FeaturedFlightsSection />
      <FeaturedToursSection />
    </div>
  );
}
