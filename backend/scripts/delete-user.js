require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function printHelp() {
  console.log(`
Uso:
  npm run admin:delete-user -- --email usuario@dominio.com --yes
  npm run admin:delete-user -- --id 123 --yes

Opcoes:
  --email <valor>   Exclui por email
  --id <valor>      Exclui por id numerico
  --yes             Confirma exclusao (obrigatorio para executar)
  --dry-run         Mostra o que seria removido, sem excluir
  --help            Exibe esta ajuda
`);
}

function databaseHostFromEnv() {
  try {
    const raw = String(process.env.DATABASE_URL || "").trim();
    if (!raw) return "";
    return new URL(raw).hostname;
  } catch {
    return "";
  }
}

function parseArgs(argv) {
  const options = {
    email: "",
    id: null,
    yes: false,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];

    if (item === "--help" || item === "-h") {
      options.help = true;
      continue;
    }

    if (item === "--yes") {
      options.yes = true;
      continue;
    }

    if (item === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (item === "--email") {
      options.email = String(argv[i + 1] || "").trim().toLowerCase();
      i += 1;
      continue;
    }

    if (item === "--id") {
      const parsed = Number(argv[i + 1]);
      options.id = Number.isInteger(parsed) ? parsed : null;
      i += 1;
      continue;
    }
  }

  return options;
}

async function getUser(target) {
  if (target.email) {
    return prisma.user.findUnique({
      where: { email: target.email },
      select: { id: true, name: true, email: true, createdAt: true },
    });
  }

  return prisma.user.findUnique({
    where: { id: target.id },
    select: { id: true, name: true, email: true, createdAt: true },
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (!args.email && !args.id) {
    console.error("Informe --email ou --id.");
    printHelp();
    process.exitCode = 1;
    return;
  }

  const user = await getUser(args);

  if (!user) {
    console.error("Usuario nao encontrado.");
    process.exitCode = 1;
    return;
  }

  const [transactionCount, goalCount, accountCount, categoryCount] = await Promise.all([
    prisma.transaction.count({ where: { userId: user.id } }),
    prisma.goal.count({ where: { userId: user.id } }),
    prisma.account.count({ where: { userId: user.id } }),
    prisma.category.count({ where: { userId: user.id } }),
  ]);

  console.log("Usuario alvo:");
  console.log(`  id: ${user.id}`);
  console.log(`  nome: ${user.name}`);
  console.log(`  email: ${user.email}`);
  console.log(`  criadoEm: ${user.createdAt.toISOString()}`);
  console.log("");
  console.log("Dados que serao removidos:");
  console.log(`  transacoes: ${transactionCount}`);
  console.log(`  metas: ${goalCount}`);
  console.log(`  contas: ${accountCount}`);
  console.log(`  categorias: ${categoryCount}`);

  if (args.dryRun) {
    console.log("");
    console.log("Dry-run: nenhuma alteracao foi aplicada.");
    return;
  }

  if (!args.yes) {
    console.log("");
    console.log("Abortado: adicione --yes para confirmar a exclusao.");
    process.exitCode = 1;
    return;
  }

  await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { userId: user.id } }),
    prisma.goal.deleteMany({ where: { userId: user.id } }),
    prisma.account.deleteMany({ where: { userId: user.id } }),
    prisma.category.deleteMany({ where: { userId: user.id } }),
    prisma.user.delete({ where: { id: user.id } }),
  ]);

  console.log("");
  console.log("Usuario e dados relacionados removidos com sucesso.");
}

main()
  .catch((error) => {
    console.error("Falha ao excluir usuario:");
    console.error(error);

    const message = String(error?.message || "");
    if (message.includes("Can't reach database server")) {
      const host = databaseHostFromEnv();
      console.error("");
      console.error("Diagnostico rapido:");
      if (host) {
        console.error(`- Host atual da DATABASE_URL: ${host}`);
      }
      console.error(
        "- Se voce estiver rodando local, use a External Database URL do Render (com sslmode=require).",
      );
      console.error(
        "- Se quiser usar URL interna do Render, execute este script dentro do ambiente do Render.",
      );
    }

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
