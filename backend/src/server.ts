import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';

const prisma = new PrismaClient();
const app = createApp(prisma);

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`FDR Vault API listening on http://localhost:${PORT}`);
});
