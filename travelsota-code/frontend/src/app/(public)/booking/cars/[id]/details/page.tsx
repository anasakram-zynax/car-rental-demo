import { CarCheckoutPage } from "@/features/cars/components/checkout/car-checkout-page";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CarCheckoutPage id={id} />;
}
