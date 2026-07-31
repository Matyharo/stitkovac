import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Seed Default Admin User (Password: stitkovac2026)
  // Pre-calculated bcrypt hash for "stitkovac2026"
  const defaultPasswordHash = '$2a$10$w8gZ9Y3q7pS4k4bL2p5N4.y.r3.z6.A.b.c.d.e.f.g.h.i.j'; 

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      name: 'Ing. Matouš Ferstl',
      passwordHash: defaultPasswordHash,
      role: 'admin',
    },
  });

  // 2. Seed Default Label Template (Avery L7160 3x7 A4 Grid)
  const existingDefaultTemplate = await prisma.labelTemplate.findFirst({
    where: { isDefault: true },
  });

  if (!existingDefaultTemplate) {
    await prisma.labelTemplate.create({
      data: {
        name: 'Standardní Avery L7160 (3×7 A4)',
        isDefault: true,
        sortOrder: 1,
        fieldsConfig: JSON.stringify({
          showName: true,
          showSku: true,
          showBrand: true,
          showPrice: true,
          showSafetyText: true,
          showContactText: true,
          showEan: true,
          showNote: false,
          showSafetyIcon: true,
          showContactIcon: true,
        }),
        fontConfig: JSON.stringify({
          fontFamily: 'Roboto',
          nameFontSize: 9.5,
          skuFontSize: 6.5,
          brandFontSize: 7.0,
          priceFontSize: 11.0,
          bodyFontSize: 6.0,
          nameFontBold: true,
          priceFontBold: true,
          textAlignment: 'left',
          brandColor: '#64748b',
          nameColor: '#0f172a',
          priceColor: '#dc2626',
          bodyColor: '#334155',
        }),
        layoutConfig: JSON.stringify({
          labelWidth: 63.5,
          labelHeight: 38.1,
          topMargin: 15.15,
          leftMargin: 7.25,
          horizontalGap: 2.5,
          verticalGap: 0,
          columns: 3,
          rows: 7,
          labelRotation: 0,
          dualLayout: false,
        }),
      },
    });
  }

  // 3. Seed Sample Products
  const sampleProducts = [
    {
      sku: 'PRD-UT-001',
      name: 'Čisticí utěrky z mikrovlákna Premium (40x40 cm)',
      brand: 'EcoClean Pro',
      price: 189.0,
      safetyText: 'Zevní použití. Skladujte v suchu. Uchovávejte mimo dosah dětí.',
      contactText: 'Distributor s.r.o., IČO: 07996811, Praha',
      ean: '8594001230012',
      note: 'Vlajkový produkt pro úklid',
    },
    {
      sku: 'PRD-KEM-002',
      name: 'Organický dezinfekční sprej na povrchy 500 ml',
      brand: 'BioShield',
      price: 249.0,
      safetyText: 'Dráždí oči. Zabraňte kontaktu s očima a kůží. Při zasažení vypláchněte vodou.',
      contactText: 'Distributor s.r.o., IČO: 07996811, Praha',
      ean: '8594001230029',
      note: 'Certifikováno pro potavinářství',
    },
    {
      sku: 'PRD-KAF-003',
      name: 'Pražená zrnková káva Espresso Select 1000g',
      brand: 'AromaCraft',
      price: 490.0,
      safetyText: 'Obsahuje kofein. Nevhodné pro děti a těhotné ženy. Skladujte v temnu.',
      contactText: 'Distributor s.r.o., IČO: 07996811, Praha',
      ean: '8594001230036',
      note: '100% Arabica ze Selva Central',
    },
    {
      sku: 'PRD-OIL-004',
      name: 'Přírodní esenciální olej Levandule 10 ml',
      brand: 'PureNaturals',
      price: 159.0,
      safetyText: 'Neužívejte vnitřně. Zabraňte přímému kontaktu s očima. Hořlavina.',
      contactText: 'Distributor s.r.o., IČO: 07996811, Praha',
      ean: '8594001230043',
      note: '100% přírodní síla z Francie',
    },
    {
      sku: 'PRD-GEL-005',
      name: 'Ochranná sada univerzálních štítků (100 ks)',
      brand: 'Štítkovač Office',
      price: 99.0,
      safetyText: 'Chraňte před vlhkostí a přímým slunečním zářením.',
      contactText: 'Distributor s.r.o., IČO: 07996811, Praha',
      ean: '8594001230050',
      note: 'Avery L7160 kompatibilní',
    },
  ];

  for (const prod of sampleProducts) {
    await prisma.product.upsert({
      where: { sku: prod.sku },
      update: prod,
      create: prod,
    });
  }

  // 4. Log Seed Execution
  await prisma.activityLog.create({
    data: {
      username: 'system',
      action: 'DATABASE_SEED',
      details: 'Vložena výchozí šablona etiket a 5 ukázkových produktů.',
    },
  });

  console.log('✅ Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
