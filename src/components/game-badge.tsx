import type { BadgeVariant } from "@/components/ui/badge";
import { Badge } from "@/components/ui/badge";
import type { LibraryControllerSupport, LibraryProtonDbTier } from "@/lib/filters-state";
import { CONTROLLER_SUPPORT_OPTIONS, PROTON_DB_TIER_OPTIONS } from "@/lib/filters-state";

const PROTON_TIER_VARIANTS: Record<LibraryProtonDbTier, BadgeVariant> = {
  NATIVE: "success",
  PLATINUM: "success",
  GOLD: "warning",
  SILVER: "muted",
  BRONZE: "danger",
  BORKED: "danger",
  UNKNOWN: "muted",
};

export function protonTierLabel(tier: LibraryProtonDbTier | null | undefined): string {
  if (!tier) return "Sin datos";
  return PROTON_DB_TIER_OPTIONS.find((option) => option.value === tier)?.label ?? tier;
}

export function controllerSupportLabel(
  support: LibraryControllerSupport | null | undefined,
): string {
  if (!support) return "—";
  return CONTROLLER_SUPPORT_OPTIONS.find((option) => option.value === support)?.label ?? support;
}

export function ProtonDbBadge({
  tier,
  className,
}: {
  tier: LibraryProtonDbTier | null;
  className?: string;
}) {
  const value: LibraryProtonDbTier = tier ?? "UNKNOWN";
  const variant = PROTON_TIER_VARIANTS[value] ?? "muted";
  return (
    <Badge variant={variant} className={className}>
      {protonTierLabel(value)}
    </Badge>
  );
}

export function ControllerBadge({
  support,
  className,
}: {
  support: LibraryControllerSupport | null;
  className?: string;
}) {
  const value: LibraryControllerSupport | null = support;
  const variant: BadgeVariant =
    value === "full" ? "success" : value === "partial" ? "warning" : "muted";
  return (
    <Badge variant={variant} className={className}>
      {value === "full"
        ? "Mando total"
        : value === "partial"
          ? "Mando parcial"
          : value === "none"
            ? "Sin mando"
            : "—"}
    </Badge>
  );
}
