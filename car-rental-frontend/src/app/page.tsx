import {
  ArrowRight,
  ArrowUpRight,
  CalendarCheck,
  CarFront,
  LayoutDashboard,
  ReceiptText,
  Route,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { GradientWavesBackground } from "@/components/backgrounds";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { FadeUp, HoverLift, Reveal, ScaleFade } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/ui/page-container";

const benefits = [
  {
    title: "A car for every route",
    description:
      "Move between practical city cars, comfortable touring options, and larger vehicles with ease.",
    icon: CarFront,
  },
  {
    title: "Clear daily pricing",
    description:
      "Review the rate and rental details upfront, with no distracting offers or confusing steps.",
    icon: ReceiptText,
  },
  {
    title: "A simpler reservation",
    description:
      "Choose your dates, provide the driver details, and confirm the journey in one focused flow.",
    icon: CalendarCheck,
  },
] as const;

export default function Home() {
  return (
    <GradientWavesBackground>
      <Header />
      <main>
        <section className="relative flex min-h-[calc(100svh-4rem)] items-center overflow-hidden py-16 sm:py-20 lg:py-24">
          <PageContainer className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.08fr)_minmax(24rem,0.72fr)] lg:gap-16">
            <div className="max-w-3xl">
              <FadeUp>
                <Badge variant="accent" className="gap-1.5 bg-white/60 backdrop-blur-sm">
                  <Sparkles aria-hidden="true" size={13} />
                  Curated for the road ahead
                </Badge>
              </FadeUp>
              <FadeUp delay={0.06}>
                <h1 className="mt-7 text-balance text-5xl leading-[0.98] font-semibold tracking-[-0.06em] text-foreground sm:text-6xl lg:text-7xl xl:text-[5.25rem]">
                  Make the drive part of the destination.
                </h1>
              </FadeUp>
              <FadeUp delay={0.12}>
                <p className="mt-7 max-w-2xl text-pretty text-base leading-7 text-muted sm:text-lg sm:leading-8">
                  Discover a considered fleet, transparent daily rates, and a
                  rental experience designed to keep every journey moving.
                </p>
              </FadeUp>
              <FadeUp delay={0.18}>
                <div className="mt-9 flex flex-col gap-3 min-[430px]:flex-row">
                  <Link
                    href="/cars"
                    className={buttonStyles({ size: "lg", variant: "primary" })}
                  >
                    Browse cars
                    <ArrowRight aria-hidden="true" size={18} />
                  </Link>
                  <Link
                    href="/admin"
                    className={buttonStyles({ size: "lg", variant: "secondary" })}
                  >
                    Open admin
                    <ArrowUpRight aria-hidden="true" size={17} />
                  </Link>
                </div>
              </FadeUp>
            </div>

            <ScaleFade delay={0.16} className="mx-auto w-full max-w-lg lg:mx-0">
              <div className="relative [perspective:1200px]">
                <div
                  aria-hidden="true"
                  className="absolute -inset-5 translate-x-3 translate-y-5 rounded-[1.5rem] border border-white/60 bg-white/25 shadow-[0_30px_80px_rgba(23,38,44,0.12)] backdrop-blur-sm"
                />
                <Card
                  variant="glass"
                  padding="lg"
                  className="relative overflow-hidden border-white/80 bg-white/68 shadow-[0_28px_80px_rgba(23,38,44,0.17)] lg:[transform:rotateY(-4deg)_rotateX(2deg)]"
                >
                  <div
                    aria-hidden="true"
                    className="absolute -top-20 -right-16 size-56 rounded-full bg-accent-secondary/10 blur-3xl"
                  />
                  <div className="relative flex items-start justify-between gap-5">
                    <div>
                      <p className="text-xs font-semibold tracking-[0.2em] text-muted uppercase">
                        Northstar collection
                      </p>
                      <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
                        Choose for the journey.
                      </h2>
                    </div>
                    <span className="grid size-12 shrink-0 place-items-center rounded-card border border-white/80 bg-primary text-primary-foreground shadow-lg">
                      <CarFront aria-hidden="true" size={23} strokeWidth={1.7} />
                    </span>
                  </div>

                  <div className="relative mt-10 overflow-hidden rounded-card border border-white/75 bg-white/55 p-5 shadow-inner">
                    <div aria-hidden="true" className="absolute inset-x-5 top-1/2 h-px bg-border" />
                    <div aria-hidden="true" className="absolute top-1/2 left-7 size-2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_0_6px_rgba(155,116,65,0.12)]" />
                    <div aria-hidden="true" className="absolute top-1/2 right-7 size-2 -translate-y-1/2 rounded-full bg-accent-secondary shadow-[0_0_0_6px_rgba(48,93,104,0.12)]" />
                    <div className="relative grid min-h-28 place-items-center">
                      <Route aria-hidden="true" className="text-accent-secondary" size={38} strokeWidth={1.35} />
                    </div>
                  </div>

                  <div className="relative mt-6 grid grid-cols-3 gap-2 text-center text-xs font-semibold text-muted sm:gap-3 sm:text-sm">
                    {["City", "Touring", "Utility"].map((category) => (
                      <span
                        key={category}
                        className="rounded-control border border-white/75 bg-white/55 px-2 py-3"
                      >
                        {category}
                      </span>
                    ))}
                  </div>
                </Card>
              </div>
            </ScaleFade>
          </PageContainer>
        </section>

        <section aria-labelledby="entry-heading" className="py-20 sm:py-24">
          <PageContainer>
            <Reveal className="max-w-2xl">
              <p className="text-sm font-semibold tracking-[0.18em] text-accent uppercase">
                Explore the demo
              </p>
              <h2
                id="entry-heading"
                className="mt-3 text-balance text-3xl font-semibold tracking-[-0.045em] sm:text-4xl"
              >
                Two clear ways into the experience.
              </h2>
              <p className="mt-4 leading-7 text-muted">
                Browse as a customer or open the management workspace directly.
                This demo intentionally has no authentication layer.
              </p>
            </Reveal>

            <div className="mt-10 grid gap-5 md:grid-cols-2">
              <Reveal>
                <HoverLift className="h-full">
                  <Card
                    variant="elevated"
                    padding="lg"
                    className="relative h-full overflow-hidden border-white/90"
                  >
                    <div className="absolute inset-y-0 left-0 w-1 bg-accent" aria-hidden="true" />
                    <div className="flex h-full flex-col">
                      <div className="flex items-center justify-between gap-4">
                        <Badge>Customer</Badge>
                        <span className="grid size-11 place-items-center rounded-control bg-accent/10 text-accent">
                          <CarFront aria-hidden="true" size={21} />
                        </span>
                      </div>
                      <h3 className="mt-8 text-2xl font-semibold tracking-[-0.035em]">
                        Find the right car
                      </h3>
                      <p className="mt-3 max-w-xl leading-7 text-muted">
                        Browse available cars, inspect vehicle details, choose
                        rental dates, and create a booking.
                      </p>
                      <Link
                        href="/cars"
                        className={buttonStyles({
                          className: "mt-8 w-fit",
                          variant: "secondary",
                        })}
                      >
                        Browse cars
                        <ArrowRight aria-hidden="true" size={17} />
                      </Link>
                    </div>
                  </Card>
                </HoverLift>
              </Reveal>

              <Reveal delay={0.06}>
                <HoverLift className="h-full">
                  <Card
                    variant="elevated"
                    padding="lg"
                    className="relative h-full overflow-hidden border-white/90"
                  >
                    <div className="absolute inset-y-0 left-0 w-1 bg-accent-secondary" aria-hidden="true" />
                    <div className="flex h-full flex-col">
                      <div className="flex items-center justify-between gap-4">
                        <Badge>Admin</Badge>
                        <span className="grid size-11 place-items-center rounded-control bg-accent-secondary/10 text-accent-secondary">
                          <LayoutDashboard aria-hidden="true" size={21} />
                        </span>
                      </div>
                      <h3 className="mt-8 text-2xl font-semibold tracking-[-0.035em]">
                        Manage the operation
                      </h3>
                      <p className="mt-3 max-w-xl leading-7 text-muted">
                        Manage the vehicle catalog, create and edit cars, and
                        oversee booking and payment statuses.
                      </p>
                      <Link
                        href="/admin"
                        className={buttonStyles({
                          className: "mt-8 w-fit",
                          variant: "secondary",
                        })}
                      >
                        Admin dashboard
                        <ArrowUpRight aria-hidden="true" size={17} />
                      </Link>
                    </div>
                  </Card>
                </HoverLift>
              </Reveal>
            </div>
          </PageContainer>
        </section>

        <section aria-labelledby="intro-heading" className="border-y border-border/70 bg-white/42 py-20 sm:py-24">
          <PageContainer className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <Reveal>
              <p className="text-sm font-semibold tracking-[0.18em] text-accent uppercase">
                The Northstar approach
              </p>
              <h2
                id="intro-heading"
                className="mt-3 text-balance text-3xl font-semibold tracking-[-0.045em] sm:text-4xl"
              >
                Rental, with the noise removed.
              </h2>
            </Reveal>
            <Reveal delay={0.05} className="max-w-2xl text-base leading-8 text-muted sm:text-lg">
              <p>
                Northstar brings together a curated mix of vehicle categories
                for city days, longer routes, and everything between. Each step
                keeps the essentials visible—from the daily price to the details
                of the drive—so booking feels direct, considered, and convenient.
              </p>
            </Reveal>
          </PageContainer>
        </section>

        <section aria-labelledby="benefits-heading" className="py-20 sm:py-24">
          <PageContainer>
            <Reveal className="max-w-2xl">
              <p className="text-sm font-semibold tracking-[0.18em] text-accent uppercase">
                Built around the essentials
              </p>
              <h2
                id="benefits-heading"
                className="mt-3 text-balance text-3xl font-semibold tracking-[-0.045em] sm:text-4xl"
              >
                Less friction between you and the road.
              </h2>
            </Reveal>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {benefits.map(({ description, icon: Icon, title }, index) => (
                <Reveal key={title} delay={index * 0.05}>
                  <Card className="h-full" padding="md">
                    <span className="grid size-11 place-items-center rounded-control border border-border bg-surface-elevated text-accent-secondary shadow-sm">
                      <Icon aria-hidden="true" size={20} strokeWidth={1.75} />
                    </span>
                    <h3 className="mt-6 text-lg font-semibold tracking-[-0.025em]">
                      {title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
                  </Card>
                </Reveal>
              ))}
            </div>
          </PageContainer>
        </section>

        <section className="pb-8 sm:pb-12">
          <PageContainer>
            <Reveal>
              <div className="relative overflow-hidden rounded-[1.35rem] border border-white/10 bg-primary px-6 py-12 text-primary-foreground shadow-elevated sm:px-10 sm:py-14 lg:px-14">
                <div
                  aria-hidden="true"
                  className="absolute -top-32 right-0 size-80 rounded-full bg-accent-secondary/35 blur-3xl"
                />
                <div className="relative flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-end">
                  <div className="max-w-2xl">
                    <p className="text-sm font-semibold tracking-[0.18em] text-[#d7bd91] uppercase">
                      Your next route starts here
                    </p>
                    <h2 className="mt-4 text-balance text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
                      Find a car that fits the journey.
                    </h2>
                    <p className="mt-4 max-w-xl leading-7 text-white/68">
                      Explore the fleet and move from selection to reservation
                      through one clear customer experience.
                    </p>
                  </div>
                  <Link
                    href="/cars"
                    className={buttonStyles({
                      className:
                        "border-white bg-white text-primary shadow-lg hover:border-white hover:bg-[#f1f3f4]",
                      size: "lg",
                      variant: "secondary",
                    })}
                  >
                    Browse cars
                    <ArrowRight aria-hidden="true" size={18} />
                  </Link>
                </div>
              </div>
            </Reveal>
          </PageContainer>
        </section>

        <Footer />
      </main>
    </GradientWavesBackground>
  );
}
