'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { validateTemplate } from '@/lib/inputValidation';
import { logActivity } from '@/lib/activity';
import { assertAuthenticated } from '@/lib/auth';


// --- TEMPLATE ACTIONS ---

export async function getTemplates() {
  await assertAuthenticated();
  try {
    let templates = await prisma.labelTemplate.findMany({
      orderBy: [
        { sortOrder: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    if (templates.length === 0) {
      // Auto-seed výchozí šablona Spoko S060630380
      const defaultFields = {
        showName: true,
        showSku: true,
        showBrand: true,
        showPrice: true,
        showSafetyText: true,
        showContactText: true,
        showEan: false,
        showNote: false,
        showSkuIcon: true,
        showSafetyIcon: true,
        showContactIcon: true,
      };

      const defaultFonts = {
        fontFamily: 'Roboto',
        nameFontSize: 9.5,
        skuFontSize: 6.5,
        brandFontSize: 7,
        priceFontSize: 11,
        bodyFontSize: 6,
        nameFontBold: true,
        priceFontBold: true,
        textAlignment: 'left',
        brandColor: '#64748b',
        nameColor: '#0f172a',
        priceColor: '#dc2626',
        bodyColor: '#334155',
      };

      const defaultLayout = {
        labelWidth: 63.5,
        labelHeight: 38.1,
        topMargin: 15.15,
        leftMargin: 7.25,
        horizontalGap: 2.5,
        verticalGap: 0,
        columns: 3,
        rows: 7,
        dualLayout: false,
        labelRotation: 0,
        customIcons: [],
      };

      const seeded = await prisma.labelTemplate.create({
        data: {
          name: 'Standardní 3×7 – 63,5×38,1 mm (výchozí)',
          fieldsConfig: JSON.stringify(defaultFields),
          fontConfig: JSON.stringify(defaultFonts),
          layoutConfig: JSON.stringify(defaultLayout),
        },
      });
      templates = [seeded];
    } else {
      // Doplnit chybějící klíče u starých šablon (zpětná kompatibilita)
      const fontDefaults: Record<string, unknown> = {
        textAlignment: 'left',
        brandColor: '#64748b',
        nameColor: '#0f172a',
        priceColor: '#dc2626',
        bodyColor: '#334155',
      };
      const fieldDefaults: Record<string, unknown> = {
        showSkuIcon: true,
        showSafetyIcon: true,
        showContactIcon: true,
      };
      const layoutDefaults: Record<string, unknown> = {
        dualLayout: false,
        labelRotation: 0,
        customIcons: [],
      };

      for (const t of templates) {
        const fonts = JSON.parse(t.fontConfig);
        const fields = JSON.parse(t.fieldsConfig);
        const layout = JSON.parse(t.layoutConfig);
        let needsUpdate = false;

        for (const [k, v] of Object.entries(fontDefaults)) {
          if (!(k in fonts)) { fonts[k] = v; needsUpdate = true; }
        }
        for (const [k, v] of Object.entries(fieldDefaults)) {
          if (!(k in fields)) { fields[k] = v; needsUpdate = true; }
        }
        for (const [k, v] of Object.entries(layoutDefaults)) {
          if (!(k in layout)) { layout[k] = v; needsUpdate = true; }
        }

        if (needsUpdate) {
          await prisma.labelTemplate.update({
            where: { id: t.id },
            data: {
              fontConfig: JSON.stringify(fonts),
              fieldsConfig: JSON.stringify(fields),
              layoutConfig: JSON.stringify(layout),
            },
          });
          t.fontConfig = JSON.stringify(fonts);
          t.fieldsConfig = JSON.stringify(fields);
          t.layoutConfig = JSON.stringify(layout);
        }
      }
    }

    return templates;
  } catch (error) {
    console.error('Error fetching templates:', error);
    throw new Error('Data se nepodařilo načíst. Zkuste to znovu.');
  }
}

export async function getTemplateById(id: string) {
  await assertAuthenticated();
  try {
    return await prisma.labelTemplate.findUnique({
      where: { id },
    });
  } catch (error) {
    console.error(`Error fetching template by ID ${id}:`, error);
    return null;
  }
}

export async function saveTemplate(
  id: string | null,
  name: string,
  fieldsConfig: object,
  fontConfig: object,
  layoutConfig: object
) {
  await assertAuthenticated();
  try {
    validateTemplate(fieldsConfig, fontConfig, layoutConfig);
    if (!name.trim() || name.length > 100) throw new Error('Vyplňte název šablony (max. 100 znaků).');
    const fieldsStr = JSON.stringify(fieldsConfig);
    const fontStr = JSON.stringify(fontConfig);
    const layoutStr = JSON.stringify(layoutConfig);

    let template;
    let actionType = 'TEMPLATE_CREATE';
    let detailMsg = '';
    if (id) {
      actionType = 'TEMPLATE_UPDATE';
      template = await prisma.labelTemplate.update({
        where: { id },
        data: {
          name,
          fieldsConfig: fieldsStr,
          fontConfig: fontStr,
          layoutConfig: layoutStr,
        },
      });
      detailMsg = `Upravena šablona: ${name}`;
    } else {
      template = await prisma.labelTemplate.create({
        data: {
          name,
          fieldsConfig: fieldsStr,
          fontConfig: fontStr,
          layoutConfig: layoutStr,
        },
      });
      detailMsg = `Vytvořena šablona: ${name}`;
    }

    await logActivity(actionType, detailMsg);
    revalidatePath('/templates');
    revalidatePath('/print');
    revalidatePath('/');
    return { success: true, template };
  } catch (error: any) {
    console.error('Error saving template:', error);
    return { success: false, error: error.message || 'Nepodařilo se uložit šablonu.' };
  }
}

export async function deleteTemplate(id: string) {
  await assertAuthenticated();
  try {
    const template = await prisma.labelTemplate.findUnique({ where: { id } });
    await prisma.labelTemplate.delete({
      where: { id },
    });
    if (template) {
      await logActivity('TEMPLATE_DELETE', `Smazána šablona: ${template.name}`);
    }
    revalidatePath('/templates');
    revalidatePath('/print');
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error(`Error deleting template ${id}:`, error);
    return { success: false, error: error.message || 'Nepodařilo se smazat šablonu.' };
  }
}

export async function duplicateTemplate(id: string) {
  await assertAuthenticated();
  try {
    const original = await prisma.labelTemplate.findUnique({
      where: { id },
    });
    if (!original) {
      return { success: false, error: 'Šablona nebyla nalezena.' };
    }

    const duplicated = await prisma.labelTemplate.create({
      data: {
        name: `${original.name} - kopie`,
        fieldsConfig: original.fieldsConfig,
        fontConfig: original.fontConfig,
        layoutConfig: original.layoutConfig,
      },
    });

    await logActivity('TEMPLATE_DUPLICATE', `Duplikována šablona ${original.name} jako ${duplicated.name}`);
    revalidatePath('/templates');
    revalidatePath('/print');
    revalidatePath('/');
    return { success: true, template: duplicated };
  } catch (error: any) {
    console.error('Error duplicating template:', error);
    return { success: false, error: error.message || 'Nepodařilo se duplikovat šablonu.' };
  }
}

export async function updateTemplateOrder(orderedIds: string[]) {
  await assertAuthenticated();
  try {
    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.labelTemplate.update({
          where: { id },
          data: { sortOrder: index },
        })
      )
    );
    revalidatePath('/templates');
    revalidatePath('/print');
    return { success: true };
  } catch (error: any) {
    console.error('Error updating template order:', error);
    return { success: false, error: error.message || 'Nepodařilo se uložit pořadí šablon.' };
  }
}

export async function setDefaultTemplate(id: string) {
  await assertAuthenticated();
  try {
    await prisma.$transaction([
      prisma.labelTemplate.updateMany({
        data: { isDefault: false },
      }),
      prisma.labelTemplate.update({
        where: { id },
        data: { isDefault: true },
      }),
    ]);
    revalidatePath('/templates');
    revalidatePath('/print');
    return { success: true };
  } catch (error: any) {
    console.error('Error setting default template:', error);
    return { success: false, error: error.message || 'Nepodařilo se nastavit výchozí šablonu.' };
  }
}
