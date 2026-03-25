export async function hashPassword(plain: string): Promise<string> {
  return Bun.password.hash(plain, {
    algorithm: 'argon2id',
    memoryCost: 4,
    timeCost: 3,
  });
}

export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return Bun.password.verify(plain, hashed);
}
