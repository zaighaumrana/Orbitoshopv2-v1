const validationInstallKey = Symbol.for('orbitoshop.numericInputValidation')
const feedbackByInput = new WeakMap()
let feedbackId = 0

export function sanitizeNumericValue(value, mode = 'decimal') {
  const raw = String(value ?? '')
  if (mode === 'digits' || mode === 'integer') return raw.replace(/\D/g, '')

  const signed = mode.startsWith('signed-')
  const decimal = mode.endsWith('decimal')
  const sign = signed && raw.trimStart().startsWith('-') ? '-' : ''
  let body = raw.replace(/[^\d.]/g, '')
  if (!decimal) return sign + body.replace(/\./g, '')

  const decimalIndex = body.indexOf('.')
  if (decimalIndex !== -1) {
    body = body.slice(0, decimalIndex + 1) + body.slice(decimalIndex + 1).replace(/\./g, '')
  }
  return sign + body
}

function validationMode(input) {
  if (input.dataset.numeric) return input.dataset.numeric
  if (input.type !== 'number') return null

  const integer = input.step === '1'
  const min = input.getAttribute('min')
  const signed = min === null || Number(min) < 0
  return `${signed ? 'signed-' : ''}${integer ? 'integer' : 'decimal'}`
}

function feedbackMessage(input, mode) {
  return input.dataset.numericMessage || (mode === 'digits' ? 'Numbers only' : 'Enter numbers only')
}

function positionFeedback(note, input) {
  const rect = input.getBoundingClientRect()
  const below = rect.bottom + 4
  const noteHeight = note.offsetHeight || 24
  const top = below + noteHeight <= window.innerHeight - 8
    ? below
    : Math.max(8, rect.top - noteHeight - 4)
  const maxLeft = Math.max(8, window.innerWidth - (note.offsetWidth || 130) - 8)
  note.style.left = `${Math.min(Math.max(8, rect.left), maxLeft)}px`
  note.style.top = `${top}px`
}

function showNumericFeedback(input, message) {
  const existing = feedbackByInput.get(input)
  if (existing?.timer) clearTimeout(existing.timer)

  let note = existing?.note
  if (!note?.isConnected) {
    note = document.createElement('span')
    note.id = `numeric-input-note-${++feedbackId}`
    note.className = 'numeric-input-note'
    note.setAttribute('role', 'status')
    note.setAttribute('aria-live', 'polite')
    document.body.append(note)
  }
  note.textContent = message
  // The invalid insertion was rejected; the remaining value is not necessarily
  // invalid. Keep existing field-validation state intact and announce the note.
  positionFeedback(note, input)

  const timer = window.setTimeout(() => {
    note.remove()
    feedbackByInput.delete(input)
  }, 1300)
  feedbackByInput.set(input, { note, timer })
}

function insertSanitizedFragment(input, fragment) {
  if (!fragment || typeof input.setRangeText !== 'function') return false
  try {
    const start = input.selectionStart
    const end = input.selectionEnd
    if (typeof start !== 'number' || typeof end !== 'number') return false
    input.setRangeText(fragment, start, end, 'end')
    input.dispatchEvent(new Event('input', { bubbles:true }))
    return true
  } catch {
    return false
  }
}

export function installNumericInputValidation() {
  if (typeof document === 'undefined' || globalThis[validationInstallKey]) return
  globalThis[validationInstallKey] = true

  document.addEventListener('paste', event => {
    const input = event.target
    if (!(input instanceof HTMLInputElement)) return
    const mode = validationMode(input)
    if (!mode) return
    const pasted = event.clipboardData?.getData('text')
    if (pasted == null || sanitizeNumericValue(pasted, mode) === pasted) return
    event.preventDefault()
    // Reject an invalid monetary paste as a whole: stripping punctuation could
    // silently change its amount. Digit-string identifiers can retain digits.
    if (mode === 'digits') insertSanitizedFragment(input, sanitizeNumericValue(pasted, mode))
    showNumericFeedback(input, feedbackMessage(input, mode))
  }, true)

  // Physical-key fallback for browsers that suppress beforeinput on type=number.
  // Paste/mobile input is still enforced by beforeinput + input below.
  document.addEventListener('keydown', event => {
    const input = event.target
    if (!(input instanceof HTMLInputElement) || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
    // Synthetic keydown events may omit key; only character strings belong here.
    if (typeof event.key !== 'string' || event.key.length !== 1) return
    const mode = validationMode(input)
    if (!mode || sanitizeNumericValue(event.key, mode) === event.key) return
    event.preventDefault()
    showNumericFeedback(input, feedbackMessage(input, mode))
  }, true)

  document.addEventListener('beforeinput', event => {
    const input = event.target
    if (!(input instanceof HTMLInputElement) || event.isComposing) return
    const mode = validationMode(input)
    if (!mode || !event.inputType?.startsWith('insert') || event.data === null) return

    const sanitized = sanitizeNumericValue(event.data, mode)
    if (sanitized === event.data) return
    event.preventDefault()
    if (mode === 'digits') insertSanitizedFragment(input, sanitized)
    showNumericFeedback(input, feedbackMessage(input, mode))
  }, true)

  const validateValue = event => {
    const input = event.target
    if (!(input instanceof HTMLInputElement) || event.isComposing) return
    const mode = validationMode(input)
    if (!mode) return

    const original = input.value
    const sanitized = sanitizeNumericValue(original, mode)
    if (sanitized === original) return

    let cursor = null
    try {
      if (typeof input.selectionStart === 'number') {
        cursor = sanitizeNumericValue(original.slice(0, input.selectionStart), mode).length
      }
    } catch {}
    input.value = sanitized
    if (cursor !== null) {
      try { input.setSelectionRange(cursor, cursor) } catch {}
    }
    showNumericFeedback(input, feedbackMessage(input, mode))
  }
  document.addEventListener('input', validateValue, true)
  document.addEventListener('compositionend', validateValue, true)
}
