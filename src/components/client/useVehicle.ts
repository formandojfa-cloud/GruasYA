"use client";

import { useLocalStorage } from "@/lib/hooks";
import type { ClientSelf, VehicleKind } from "@/lib/types";
import { STORAGE_VEHICLE } from "./constants";

export type VehicleDraft = { vehicleKind: VehicleKind; vehicleLabel: string; plate: string };

const DEFAULT: VehicleDraft = { vehicleKind: "SEDAN", vehicleLabel: "", plate: "" };

/**
 * Vehículo elegido para pedir: se recuerda en el teléfono y, si no hay nada
 * guardado, se toma el primero de la cuenta (/api/me → vehicles).
 */
export function useVehicle(me: ClientSelf | null): [VehicleDraft, (v: VehicleDraft) => void] {
  const [stored, setStored] = useLocalStorage<VehicleDraft | null>(STORAGE_VEHICLE, null);
  const fromAccount = me?.vehicles[0];
  const value: VehicleDraft =
    stored ?? (fromAccount ? { vehicleKind: fromAccount.kind, vehicleLabel: fromAccount.label, plate: fromAccount.plate } : DEFAULT);
  return [value, setStored];
}
