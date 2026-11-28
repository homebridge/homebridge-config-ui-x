import type { Algorithm } from 'jsonwebtoken'

/**
 * The algorithm every token is signed with, and the only one a check accepts. jsonwebtoken accepts every HMAC
 * algorithm when it is given no list, so a token signed with HS384 or HS512 and the same secret passed as well.
 */
export const JWT_ALGORITHM: Algorithm = 'HS256'
