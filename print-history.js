const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const dotenv = require("dotenv");
dotenv.config();

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const history = await prisma.watchHistory.findMany({
    orderBy: { updatedAt: "desc" },
    take: 5
  });
  console.log(JSON.stringify(history, null, 2));
}

main()
  .catch(console.error)
  .finally(() => pool.end());
