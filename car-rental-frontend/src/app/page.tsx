import {
  ArrowRight,
  CalendarCheck,
  CarFront,
  CheckCircle2,
  Clock3,
  MapPin,
  ReceiptText,
  Route,
  Search,
  Star,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { FadeUp, Reveal } from "@/components/motion";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { PageContainer } from "@/components/ui/page-container";

const benefits = [
  {
    title: "Clear pricing",
    description:
      "See the daily rental rate or fixed transfer price before you continue to booking.",
    icon: ReceiptText,
  },
  {
    title: "The right service",
    description:
      "Choose a self-directed rental or a driver-included transfer for a listed route.",
    icon: Route,
  },
  {
    title: "Easy booking lookup",
    description:
      "Return to My Booking whenever you need to review an existing reservation.",
    icon: CalendarCheck,
  },
] as const;

const steps = [
  {
    title: "Choose your service",
    description: "Start with a rental car or a fixed-route transfer.",
  },
  {
    title: "Compare the fleet",
    description: "Review vehicle details, capacity, pricing, and availability.",
  },
  {
    title: "Complete your booking",
    description: "Enter the required trip and contact details, then confirm.",
  },
] as const;

const reviews = [
  {
    name: "Ayesha K.",
    context: "Weekend rental",
    text: "The daily rate and vehicle details were easy to understand, and the booking steps felt quick and focused.",
  },
  {
    name: "Hamza M.",
    context: "Airport transfer",
    text: "Choosing a fixed route was straightforward. I could see the transfer price clearly before confirming.",
  },
  {
    name: "Sara A.",
    context: "Family trip",
    text: "Passenger and baggage information made it simple to choose a car that worked for our plans.",
  },
  {
    name: "Omar R.",
    context: "Business traveler",
    text: "The flow was clean from car selection to confirmation, and finding the booking again was just as easy.",
  },
] as const;

export default function Home() {
  return (
    <div className="home-theme flex min-h-svh flex-col overflow-x-clip bg-background text-foreground">
      <Header />
      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-[#d9e4f2] bg-[#f7faff]">
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-55 [background-image:linear-gradient(rgba(18,97,201,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(18,97,201,0.055)_1px,transparent_1px)] [background-size:48px_48px]"
          />
          <PageContainer className="relative grid gap-10 pt-14 pb-12 sm:pt-18 sm:pb-14 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.68fr)] lg:items-center lg:gap-14 lg:pt-20 lg:pb-18">
            <div className="max-w-2xl">
              <FadeUp>
                <p className="inline-flex items-center gap-2 rounded-full border border-[#c7d9ee] bg-white px-3 py-1.5 text-xs font-semibold tracking-[0.08em] text-primary uppercase shadow-sm">
                  <CarFront aria-hidden="true" size={15} />
                  Rental cars &amp; transfers
                </p>
              </FadeUp>
              <FadeUp delay={0.04}>
                <h1 className="mt-5 text-balance text-4xl leading-[1.08] font-semibold tracking-[-0.045em] sm:text-5xl lg:text-[3.65rem]">
                  Your next journey starts with the right car.
                </h1>
              </FadeUp>
              <FadeUp delay={0.08}>
                <p className="mt-5 max-w-xl text-base leading-7 text-muted sm:text-lg sm:leading-8">
                  Browse daily rentals or choose a fixed-route transfer with a
                  driver. Northstar keeps vehicle details, pricing, and booking
                  steps in one clear flow.
                </p>
              </FadeUp>
              <FadeUp delay={0.12}>
                <div className="mt-7 flex flex-col gap-3 min-[430px]:flex-row">
                  <Link
                    href="/cars"
                    className={buttonStyles({ size: "lg", variant: "primary" })}
                  >
                    Browse all cars <ArrowRight aria-hidden="true" size={18} />
                  </Link>
                  <Link
                    href="/my-bookings"
                    className={buttonStyles({ size: "lg", variant: "secondary" })}
                  >
                    Find my booking
                  </Link>
                </div>
              </FadeUp>
            </div>

            <FadeUp delay={0.1} className="hidden lg:block">
              <div className="relative mx-auto max-w-md overflow-hidden rounded-[1.25rem] border border-[#c8daee] bg-white p-7 shadow-[0_22px_55px_rgba(24,62,112,0.13)]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.12em] text-primary uppercase">
                      Plan your route
                    </p>
                    <p className="mt-1 text-lg font-semibold">Drive your way</p>
                  </div>
                  <span className="grid size-11 place-items-center rounded-xl bg-[#e9f2ff] text-primary">
                    <CarFront aria-hidden="true" size={23} />
                  </span>
                </div>
                <div className="relative mt-8 rounded-xl bg-[#f4f7fb] px-5 py-7">
                  <div className="absolute top-1/2 right-10 left-10 h-px bg-[#aac3e2]" />
                  <div className="relative flex items-center justify-between">
                    <span className="grid size-9 place-items-center rounded-full border-4 border-[#e7f0fb] bg-primary text-white">
                      <MapPin aria-hidden="true" size={15} />
                    </span>
                    <CarFront
                      aria-hidden="true"
                      className="z-10 rounded-md bg-[#f4f7fb] px-2 text-[#16335f]"
                      size={50}
                    />
                    <span className="grid size-9 place-items-center rounded-full border-4 border-[#e7f0fb] bg-[#16335f] text-white">
                      <CheckCircle2 aria-hidden="true" size={15} />
                    </span>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl border border-border p-3.5">
                    <p className="text-xs text-muted">Rental</p>
                    <p className="mt-1 font-semibold">Daily flexibility</p>
                  </div>
                  <div className="rounded-xl border border-border p-3.5">
                    <p className="text-xs text-muted">Transfer</p>
                    <p className="mt-1 font-semibold">Fixed route</p>
                  </div>
                </div>
              </div>
            </FadeUp>
          </PageContainer>

          <PageContainer className="relative pb-14 sm:pb-18">
            <FadeUp delay={0.15}>
              <div className="rounded-[1.1rem] border border-[#d5deea] bg-white p-5 shadow-[0_16px_42px_rgba(25,50,88,0.11)] sm:p-6 lg:p-7">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold tracking-[-0.025em]">
                    What do you need?
                  </h2>
                  <InfoTooltip label="Choose a service to open the existing car catalog with that option selected." />
                </div>
                <p className="mt-1 text-sm text-muted">
                  Go straight to the service that matches your trip.
                </p>
                <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-stretch">
                  <Link
                    href="/cars?serviceType=rental"
                    className="group flex min-h-20 items-center gap-4 rounded-xl border border-border bg-white px-4 py-3.5 outline-none transition-[border-color,box-shadow,background-color] hover:border-[#a9c3e5] hover:bg-[#f8fbff] focus-visible:ring-4 focus-visible:ring-[var(--ring)] sm:px-5"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e9f2ff] text-primary">
                      <CarFront aria-hidden="true" size={21} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">Rental car</span>
                      <span className="mt-0.5 block text-sm text-muted">Browse cars priced per day</span>
                    </span>
                    <ArrowRight aria-hidden="true" className="text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary" size={18} />
                  </Link>
                  <Link
                    href="/cars?serviceType=transfer"
                    className="group flex min-h-20 items-center gap-4 rounded-xl border border-border bg-white px-4 py-3.5 outline-none transition-[border-color,box-shadow,background-color] hover:border-[#a9c3e5] hover:bg-[#f8fbff] focus-visible:ring-4 focus-visible:ring-[var(--ring)] sm:px-5"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#eef1f6] text-[#16335f]">
                      <Route aria-hidden="true" size={21} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">Transfer ride</span>
                      <span className="mt-0.5 block text-sm text-muted">Choose a listed fixed-price route</span>
                    </span>
                    <ArrowRight aria-hidden="true" className="text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary" size={18} />
                  </Link>
                  <Link
                    href="/cars"
                    className={buttonStyles({ className: "h-auto min-h-14 lg:min-w-36", size: "lg" })}
                  >
                    <Search aria-hidden="true" size={18} /> Search cars
                  </Link>
                </div>
              </div>
            </FadeUp>
          </PageContainer>
        </section>

        <section aria-labelledby="journeys-heading" className="bg-white pb-16 sm:pb-20 pt-10">
          <PageContainer>
            <Reveal className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold text-primary">Made for the journey</p>
              <h2 id="journeys-heading" className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                A clearer way to choose how you travel.
              </h2>
              <p className="mt-4 leading-7 text-muted">
                Compare real vehicle information, choose the right service, and keep the price visible as you book.
              </p>
            </Reveal>

            <div className="mt-10 grid gap-6 lg:gap-8">
              <Reveal>
                <article className="grid overflow-hidden rounded-[1.1rem] border border-border bg-[#f7f9fc] shadow-card lg:grid-cols-2 lg:items-stretch">
                  <div className="relative min-h-64 overflow-hidden sm:min-h-80 lg:min-h-[25rem]">
                    <Image
                      src="/home/rental-on-road.jpg"
                      alt="A rental SUV driving along a tree-lined road"
                      fill
                      sizes="(max-width: 1023px) 100vw, 50vw"
                      className="object-cover object-center transition-transform duration-500 hover:scale-[1.02]"
                    />
                    <span className="absolute bottom-4 left-4 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-[#10203d] shadow-sm">
                      Daily rentals
                    </span>
                  </div>
                  <div className="flex flex-col justify-center p-6 sm:p-9 lg:p-12">
                    <p className="text-sm font-semibold text-primary">Freedom for the full trip</p>
                    <h3 className="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
                      Pick a rental around your plans.
                    </h3>
                    <p className="mt-4 leading-7 text-muted">
                      Review vehicle capacity, transmission, fuel type, amenities, daily pricing, and availability before choosing pickup and return times.
                    </p>
                    <ul className="mt-6 grid gap-3 text-sm text-foreground sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                      {["Daily price shown clearly", "Vehicle details together", "Pickup and return dates", "Availability checked when booking"].map((item) => (
                        <li key={item} className="flex items-start gap-2.5">
                          <CheckCircle2 aria-hidden="true" className="mt-0.5 shrink-0 text-primary" size={17} />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <Link href="/cars?serviceType=rental" className="mt-7 inline-flex w-fit items-center gap-2 rounded font-semibold text-primary outline-none hover:underline focus-visible:ring-4 focus-visible:ring-[var(--ring)]">
                      Browse rental cars <ArrowRight aria-hidden="true" size={17} />
                    </Link>
                  </div>
                </article>
              </Reveal>

              <Reveal>
                <article className="grid overflow-hidden rounded-[1.1rem] border border-border bg-[#10203d] text-white shadow-card lg:grid-cols-2 lg:items-stretch">
                  <div className="flex flex-col justify-center p-6 sm:p-9 lg:p-12">
                    <p className="text-sm font-semibold text-[#8dbbfa]">Comfort from point to point</p>
                    <h3 className="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
                      Choose a transfer with the route already defined.
                    </h3>
                    <p className="mt-4 leading-7 text-white/70">
                      Select an available pickup and destination package, see its fixed price, choose your pickup time, and travel with a driver.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold">
                      <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1.5">Listed routes</span>
                      <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1.5">Fixed package price</span>
                      <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1.5">With driver</span>
                    </div>
                    <Link href="/cars?serviceType=transfer" className="mt-7 inline-flex w-fit items-center gap-2 rounded font-semibold text-white outline-none hover:underline focus-visible:ring-4 focus-visible:ring-white/35">
                      Browse transfer rides <ArrowRight aria-hidden="true" size={17} />
                    </Link>
                  </div>
                  <div className="relative min-h-64 overflow-hidden sm:min-h-80 lg:order-last lg:min-h-[25rem]">
                    <Image
                      src="/home/transfer-comfort-car.jpg"
                      alt="A comfortable dark sedan outside a modern building"
                      fill
                      sizes="(max-width: 1023px) 100vw, 50vw"
                      className="object-cover object-center transition-transform duration-500 hover:scale-[1.02]"
                      loading="eager"
                    />
                    <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#10203d]/30 to-transparent lg:bg-gradient-to-r" />
                    <span className="absolute right-4 bottom-4 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-[#10203d] shadow-sm">
                      Fixed-route transfers
                    </span>
                  </div>
                </article>
              </Reveal>
            </div>
          </PageContainer>
        </section>

        <section aria-labelledby="benefits-heading" className="border-y border-border bg-[#f7f9fc] py-16 sm:py-20">
          <PageContainer>
            <Reveal className="text-center">
              <p className="text-sm font-semibold text-primary">The essentials, kept clear</p>
              <h2 id="benefits-heading" className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                Built for straightforward booking.
              </h2>
            </Reveal>
            <div className="mt-9 grid gap-4 md:grid-cols-3">
              {benefits.map(({ description, icon: Icon, title }, index) => (
                <Reveal key={title} delay={index * 0.04}>
                  <Card className="h-full bg-white" padding="md">
                    <span className="grid size-11 place-items-center rounded-xl bg-[#edf4fd] text-primary">
                      <Icon aria-hidden="true" size={21} />
                    </span>
                    <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
                  </Card>
                </Reveal>
              ))}
            </div>
          </PageContainer>
        </section>

        <section aria-labelledby="reviews-heading" className="bg-[#f7faff] py-16 sm:py-20">
          <PageContainer>
            <Reveal className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold text-primary">Customer experiences</p>
                <h2 id="reviews-heading" className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                  Journeys that felt simple from the start.
                </h2>
                <p className="mt-4 leading-7 text-muted">
                  A few short stories about booking clarity, vehicle choice, and transfer convenience.
                </p>
              </div>
              <div className="flex items-center gap-1 text-primary" aria-label="Five out of five stars">
                {Array.from({ length: 5 }, (_, index) => (
                  <Star key={index} aria-hidden="true" size={18} fill="currentColor" />
                ))}
              </div>
            </Reveal>

            <div className="mt-9 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {reviews.map((review, index) => (
                <Reveal key={review.name} delay={index * 0.04}>
                  <figure className="flex h-full flex-col rounded-card border border-[#d5e1ef] bg-white p-5 shadow-card sm:p-6">
                    <div className="flex gap-0.5 text-[#e4a11b]" aria-hidden="true">
                      {Array.from({ length: 5 }, (_, starIndex) => (
                        <Star key={starIndex} size={15} fill="currentColor" />
                      ))}
                    </div>
                    <blockquote className="mt-5 flex-1 text-sm leading-6 text-foreground">
                      “{review.text}”
                    </blockquote>
                    <figcaption className="mt-6 border-t border-border pt-4">
                      <p className="font-semibold text-foreground">{review.name}</p>
                      <p className="mt-0.5 text-xs text-muted">{review.context}</p>
                    </figcaption>
                  </figure>
                </Reveal>
              ))}
            </div>
          </PageContainer>
        </section>

        <section aria-labelledby="steps-heading" className="bg-white py-16 sm:py-20">
          <PageContainer className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
            <Reveal>
              <p className="text-sm font-semibold text-primary">How it works</p>
              <h2 id="steps-heading" className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                From search to confirmation in three steps.
              </h2>
              <p className="mt-4 leading-7 text-muted">
                The booking flow keeps the vehicle, trip, and customer details together from start to finish.
              </p>
            </Reveal>
            <div className="grid gap-3">
              {steps.map((step, index) => (
                <Reveal key={step.title} delay={index * 0.04}>
                  <div className="flex gap-4 rounded-card border border-border bg-white p-5 sm:items-center sm:p-6">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-white">
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="font-semibold">{step.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-muted">{step.description}</p>
                    </div>
                    {index === 0 ? <MapPin aria-hidden="true" className="ml-auto hidden text-[#afbdd0] sm:block" size={21} /> : null}
                    {index === 1 ? <Search aria-hidden="true" className="ml-auto hidden text-[#afbdd0] sm:block" size={21} /> : null}
                    {index === 2 ? <Clock3 aria-hidden="true" className="ml-auto hidden text-[#afbdd0] sm:block" size={21} /> : null}
                  </div>
                </Reveal>
              ))}
            </div>
          </PageContainer>
        </section>

        <section className="bg-white pb-16 sm:pb-20">
          <PageContainer>
            <Reveal>
              <div className="flex flex-col items-start justify-between gap-7 rounded-[1.1rem] bg-[#10203d] px-6 py-10 text-white sm:px-9 sm:py-12 lg:flex-row lg:items-center lg:px-12">
                <div className="max-w-2xl">
                  <p className="text-sm font-semibold text-[#8dbbfa]">Ready when you are</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Find the car that fits your trip.</h2>
                  <p className="mt-3 leading-7 text-white/70">Browse the current fleet and continue through the existing booking experience.</p>
                </div>
                <Link href="/cars" className={buttonStyles({ className: "border-white bg-white text-[#10203d] hover:bg-[#edf3fb]", size: "lg", variant: "secondary" })}>
                  Browse cars <ArrowRight aria-hidden="true" size={18} />
                </Link>
              </div>
            </Reveal>
          </PageContainer>
        </section>
      </main>
      <Footer />
    </div>
  );
}
