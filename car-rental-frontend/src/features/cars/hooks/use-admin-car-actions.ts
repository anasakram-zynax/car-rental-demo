"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { removeCar } from "@/features/cars/api/car/remove-car";
import { updateCarStatus } from "@/features/cars/api/car/save-car";
import { adminCarsQueryKeys } from "@/features/cars/hooks/use-admin-cars";

function useInvalidateAdminCars() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: adminCarsQueryKeys.all });
}

export function useRemoveCar() {
  const invalidateAdminCars = useInvalidateAdminCars();
  return useMutation({ mutationFn: removeCar, retry: false, onSuccess: invalidateAdminCars });
}

export function useUpdateCarStatus() {
  const invalidateAdminCars = useInvalidateAdminCars();
  return useMutation({ mutationFn: ({ id, status }: { id: string; status: "active" | "inactive" }) => updateCarStatus(id, status), retry: false, onSuccess: invalidateAdminCars });
}
