function formatFee(charge, feeFlag) {
  if (charge) {
    const trimmed = charge.trim();
    const match = trimmed.match(/^([0-9]+(?:\.[0-9]+)?)\s+GBP\/day$/i);
    if (match) return `Costs £${match[1]} per day`;
    return `Costs ${trimmed}`;
  }
  if (feeFlag) return "Fee";
  return null;
}

export { formatFee };
