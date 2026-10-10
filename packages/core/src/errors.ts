import type { DeliveryOutcome } from './types.js';

/** Adapters report known transport failure separately from an unacknowledged request. */
export class AdapterDeliveryError extends Error {
  readonly outcome: Exclude<DeliveryOutcome, { status: 'delivered' }>;
  constructor(outcome: Exclude<DeliveryOutcome, { status: 'delivered' }>) {
    super(outcome.status === 'failed' ? outcome.error.message : outcome.reason);
    this.name = 'AdapterDeliveryError';
    this.outcome = outcome;
  }
}
