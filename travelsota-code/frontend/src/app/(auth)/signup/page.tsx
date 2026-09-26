import SignUpForm from "@/components/auth/SignUpForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign Up",
  description: "Create a free TravelsOTA account and start booking flights and hotels worldwide with real-time pricing.",
  openGraph: {
    title: "Sign Up | TravelsOTA",
  },
};

export default function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return <SignUpFormWrapper searchParams={searchParams} />;
}

async function SignUpFormWrapper({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const role = (params?.role as string) === 'agent' ? 'agent' : 'customer';
  return <SignUpForm role={role} searchParams={searchParams} />;
}
