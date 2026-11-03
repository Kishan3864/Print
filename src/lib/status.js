// Order status model shared by shop + customer screens.

export const STATUSES = ['new', 'proof_sent', 'approved', 'changes_requested', 'printing', 'ready', 'delivered', 'cancelled'];

export const STATUS_LABEL = {
  new: 'New',
  proof_sent: 'Proof sent',
  approved: 'Approved',
  changes_requested: 'Changes requested',
  printing: 'Printing',
  ready: 'Ready',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

// What a customer sees for each status (tracking page headline).
export const STATUS_CUSTOMER_TEXT = {
  new: 'We have received your files. The shop will check them shortly.',
  proof_sent: 'Your proof is ready. Please check it and approve, or ask for changes.',
  approved: 'You approved the proof. It goes to print next.',
  changes_requested: 'Your change request was sent to the shop. They will send a new proof.',
  printing: 'Your order is being printed.',
  ready: 'Your order is ready for pickup.',
  delivered: 'Order delivered. Thank you!',
  cancelled: 'This order was cancelled. Contact the shop if this is unexpected.',
};

// Status changes a shop can make with a button (proof upload separately moves to proof_sent).
export const TRANSITIONS = {
  new: ['printing', 'cancelled'],
  proof_sent: ['approved', 'changes_requested', 'printing', 'cancelled'],
  approved: ['printing', 'cancelled'],
  changes_requested: ['printing', 'cancelled'],
  printing: ['ready', 'cancelled'],
  ready: ['delivered', 'printing', 'cancelled'],
  delivered: ['ready'],
  cancelled: ['new'],
};

// Button labels for the shop's status actions.
export const ACTION_LABEL = {
  approved: 'Mark approved',
  changes_requested: 'Mark changes requested',
  printing: 'Start printing',
  ready: 'Mark ready',
  delivered: 'Mark delivered',
  cancelled: 'Cancel order',
  new: 'Reopen order',
};

// A proof can be uploaded while the job is not yet printing.
export const PROOF_ALLOWED = new Set(['new', 'proof_sent', 'changes_requested', 'approved']);

export const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to);

// Dashboard tabs. `statuses: null` = everything.
export const TABS = [
  { key: 'active', label: 'Active', statuses: ['new', 'proof_sent', 'approved', 'changes_requested', 'printing', 'ready'] },
  { key: 'new', label: 'New', statuses: ['new'] },
  { key: 'proof_sent', label: 'Waiting approval', statuses: ['proof_sent'] },
  { key: 'changes_requested', label: 'Changes', statuses: ['changes_requested'] },
  { key: 'approved', label: 'Approved', statuses: ['approved'] },
  { key: 'printing', label: 'Printing', statuses: ['printing'] },
  { key: 'ready', label: 'Ready', statuses: ['ready'] },
  { key: 'delivered', label: 'Delivered', statuses: ['delivered'] },
  { key: 'cancelled', label: 'Cancelled', statuses: ['cancelled'] },
  { key: 'all', label: 'All', statuses: null },
];

// Customer-facing progress timeline.
const STEPS = [
  { key: 'received', label: 'Received' },
  { key: 'proof', label: 'Proof' },
  { key: 'approved', label: 'Approved' },
  { key: 'printing', label: 'Printing' },
  { key: 'ready', label: 'Ready' },
  { key: 'delivered', label: 'Delivered' },
];
const STEP_INDEX = { new: 0, proof_sent: 1, changes_requested: 1, approved: 2, printing: 3, ready: 4, delivered: 5 };

/**
 * [{key,label,state:'done'|'current'|'todo'|'skipped'}] – for cancelled orders every step is 'todo'
 * except received. Jobs printed without a proof show the proof/approved steps as 'skipped'.
 */
export function timelineSteps(status, { hadProof = true } = {}) {
  if (status === 'cancelled') return STEPS.map((s, i) => ({ ...s, state: i === 0 ? 'done' : 'todo' }));
  const at = STEP_INDEX[status] ?? 0;
  return STEPS.map((s, i) => {
    let state = i < at ? 'done' : i === at ? (status === 'delivered' ? 'done' : 'current') : 'todo';
    if (!hadProof && state === 'done' && (s.key === 'proof' || s.key === 'approved')) state = 'skipped';
    return { ...s, state };
  });
}

// Shop account states.
export const SHOP_STATE_LABEL = {
  pending: 'Awaiting payment',
  active: 'Active',
  paused: 'Paused',
  expired: 'Expired',
  rejected: 'Rejected',
};
export const PLANS = ['starter', 'pro', 'business'];
export const PLAN_LABEL = { starter: 'Starter', pro: 'Pro', business: 'Business' };
