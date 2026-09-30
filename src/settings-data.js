// Both Business Settings and first-run setup use account-admin's allowlisted path.
export async function settingsUpdates(form) {
  const data = Object.fromEntries(new FormData(form))
  const mapping = { name:'shop_name', address:'shop_address', phone:'shop_phone', email:'shop_email',
    primaryColor:'primary_color', secondaryColor:'secondary_color', currency:'currency',
    taxRate:'tax_rate', invoicePrefix:'invoice_prefix', ticketPrefix:'ticket_prefix',
    receiptFooter:'terms_text', businessDescription:'shop_description' }
  const updates = {}
  for (const [field, key] of Object.entries(mapping)) {
    if (!Object.hasOwn(data, field)) continue
    updates[key] = field === 'taxRate' ? Number(data[field]) : String(data[field]).trim()
    if (field.endsWith('Prefix')) updates[key] = updates[key].toUpperCase()
  }
  const file = form.querySelector('[name="logo"]')?.files?.[0]
  if (file) {
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 512 * 1024) throw new Error('Choose a PNG, JPEG or WebP logo under 512 KB.')
    updates.shop_logo = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Logo could not be read.')); reader.readAsDataURL(file)
    })
  }
  return updates
}
