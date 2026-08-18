import { Badge, type BadgeTone } from '@/components/ui/Badge';

/**
 * Order status as a labelled badge.
 *
 * Status is a free-text column in the schema, so an unrecognised value must render as itself
 * rather than falling through to nothing — a blank badge would hide the actual state.
 */

const TONES: Record<string, BadgeTone> = {
  placed: 'info',
  shipped: 'warning',
  delivered: 'success',
  cancelled: 'danger',
};

const LABELS: Record<string, string> = {
  placed: 'Order placed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export function OrderStatusBadge({ status }: { status: string }) {
  return <Badge tone={TONES[status] ?? 'neutral'}>{LABELS[status] ?? status}</Badge>;
}
