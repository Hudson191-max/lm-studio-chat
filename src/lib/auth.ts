import crypto from 'crypto'

const SCRYPT_KEYLEN = 64

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex')
  const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, { N: 16384 })
  return `${salt}:${derivedKey.toString('hex')}`
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [salt, key] = hash.split(':')
  const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, { N: 16384 })
  return crypto.timingSafeEqual(Buffer.from(key, 'hex'), derivedKey)
}