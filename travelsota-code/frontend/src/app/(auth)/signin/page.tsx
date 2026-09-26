import SignInForm from "@/components/auth/SignInForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your TravelsOTA account to manage bookings, view itineraries, and access travel support.",
  openGraph: {
    title: "Sign In | TravelsOTA",
  },
};

export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  return <SignInForm searchParams={searchParams} />;
}
