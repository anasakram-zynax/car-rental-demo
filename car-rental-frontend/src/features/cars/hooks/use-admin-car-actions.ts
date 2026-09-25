"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { removeCar } from "@/features/cars/api/car/remove-car";
import { createCar, updateCar } from "@/features/cars/api/car/save-car";
import { adminCarsQueryKeys } from "@/features/cars/hooks/use-admin-cars";
import type {
  CreateCarInput,
  UpdateCarInput,
} from "@/features/cars/types/car.types";

function useInvalidateAdminCars() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: adminCarsQueryKeys.all });
}

export function useRemoveCar() {
  const invalidateAdminCars = useInvalidateAdminCars();
  return useMutation({
    mutationFn: removeCar,
    retry: false,
    onSuccess: invalidateAdminCars,
  });
}

export function useUpdateCarStatus() {
  const invalidateAdminCars = useInvalidateAdminCars();
  return useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: "active" | "inactive";
    }) => updateCar(id, { status }),
    retry: false,
    onSuccess: invalidateAdminCars,
  });
}

export function useCreateCar() {
  const invalidateAdminCars = useInvalidateAdminCars();
  return useMutation({
    mutationFn: (input: CreateCarInput) => createCar(input),
    retry: false,
    onSuccess: invalidateAdminCars,
  });
}

export function useUpdateCar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCarInput }) =>
      updateCar(id, input),
    retry: false,
    onSuccess: (_, { id }) =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin", "cars", "detail", id],
        }),
        queryClient.invalidateQueries({ queryKey: adminCarsQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ["cars", "detail", id] }),
      ]),
  });
}
