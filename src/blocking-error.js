/** Presentation only: never used to decide whether an operation is allowed. */
export function blockingErrorCopy(message) {
  const detail = String(message || 'The action could not be completed.')
    .replace(/^(?:Error placing order|Error recording payment|Sale error|Delivery error|Summary error|Settle error|Return error|Adjustment error|Cancellation error|Decision error|Error):\s*/i, '')
  if (/Initial payment cannot exceed the repair invoice\.?/i.test(detail)) {
    return { title:'Payment Too High', message:'The advance cannot be more than the repair total. Enter a smaller amount.' }
  }
  if (/Cash received is less than the sale total/i.test(detail)) {
    return { title:'Incomplete Cash Payment', message:'Enter the full cash received amount, or choose Udhar for the remaining balance.' }
  }
  return { title:'Unable to Continue', message:detail }
}
