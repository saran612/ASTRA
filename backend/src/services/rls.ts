import { PrismaClient, Prisma } from '@prisma/client';
import { Role } from '@fdr-vault/shared';

export interface UserContext {
  id: string;
  role: Role;
  region?: string | null;
  institutionId?: string | null;
}

/**
 * Executes a callback within a PostgreSQL transaction where session-local
 * RLS context variables are set using set_config(..., true).
 * This guarantees PostgreSQL Row-Level Security policies evaluate correctly.
 */
export async function withRlsContext<T>(
  prisma: PrismaClient,
  user: UserContext,
  callback: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // Switch to non-superuser app_user to disable superuser RLS bypass
    await tx.$executeRawUnsafe(`SET LOCAL ROLE app_user`);
    await tx.$executeRawUnsafe(
      `SELECT
        set_config('app.current_user_id', $1, true),
        set_config('app.current_role', $2, true),
        set_config('app.current_region', $3, true),
        set_config('app.current_institution_id', $4, true)`,
      user.id,
      user.role,
      user.region || '',
      user.institutionId || ''
    );
    return callback(tx);
  });
}
