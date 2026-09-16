export function calculateAccountSettlement(
  amountCents: number,
  accountBalanceCents: number
) {
  const amount = Math.max(0, Math.round(amountCents));
  const availableCredit = Math.max(0, Math.round(accountBalanceCents));
  const creditAppliedCents = Math.min(availableCredit, amount);

  return {
    amountCents: amount,
    creditAppliedCents,
    debtCents: amount - creditAppliedCents,
    accountDeltaCents: -amount,
  };
}

export function discountKeepsSettledAmount(input: {
  totalCents: number;
  discountCents: number;
  paidCents: number;
  debtCents: number;
}) {
  const netCents = Math.max(
    0,
    Math.round(input.totalCents) - Math.max(0, Math.round(input.discountCents))
  );
  const settledCents =
    Math.max(0, Math.round(input.paidCents)) +
    Math.max(0, Math.round(input.debtCents));
  return netCents >= settledCents;
}
