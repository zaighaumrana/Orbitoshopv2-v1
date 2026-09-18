const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz'
const DIGITS = '23456789'
const SYMBOLS = '!@#$%'

function randomIndex(size) {
  const limit = 256 - (256 % size)
  const byte = new Uint8Array(1)
  do { crypto.getRandomValues(byte) } while (byte[0] >= limit)
  return byte[0] % size
}

/** Existing 10-character UX, now cryptographic and always policy-compatible. */
export function generateTempPassword() {
  const alphabet = LETTERS + DIGITS + SYMBOLS
  const chars = [LETTERS[randomIndex(LETTERS.length)], DIGITS[randomIndex(DIGITS.length)], SYMBOLS[randomIndex(SYMBOLS.length)]]
  while (chars.length < 10) chars.push(alphabet[randomIndex(alphabet.length)])
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}
