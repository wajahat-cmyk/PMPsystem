import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const SECRET = process.env.SESSION_SECRET!;

export interface TokenPayload {
  username: string;
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, SECRET) as TokenPayload;
}

export function createToken(username: string): string {
  return jwt.sign({ username }, SECRET, { expiresIn: "7d" });
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}
