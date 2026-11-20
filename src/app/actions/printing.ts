'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { validateTemplate } from '@/lib/inputValidation';
import { logActivity } from '@/lib/activity';
import { assertAuthenticated } from '@/lib/auth';


// --- PRINT JOBS ACTIONS ---

export async function getPrintJobs() {
  await assertAuthenticated();
  try {
    return await prisma.printJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20, // Limit to last 20 jobs for display
    });
  } catch (error) {
    console.error('Error fetching print jobs:', error);
    throw new Error('Data se nepodařilo načíst. Zkuste to znovu.');
  }
}

export async function savePrintJob(
  products: { productId: string; sku: string; name: string; price: number | null; quantity: number }[],
  startPosition: number,
  snapshot?: { template: { id: string; name: string; fieldsConfig: string; fontConfig: string; layoutConfig: string }; fonts: Record<string, number> }
) {
  await assertAuthenticated();
  try {
    if (snapshot) validateTemplate(JSON.parse(snapshot.template.fieldsConfig), JSON.parse(snapshot.template.fontConfig), JSON.parse(snapshot.template.layoutConfig));
    if (snapshot && JSON.stringify(snapshot).length > 750000) throw new Error('Snímek šablony je příliš velký.');
    if (!Number.isInteger(startPosition) || startPosition < 1 || startPosition > 5000 || !Array.isArray(products) || products.length > 10000 || products.some(p => !Number.isInteger(p.quantity) || p.quantity < 1 || p.quantity > 10000) || products.reduce((sum, p) => sum + p.quantity, 0) > 10000) throw new Error('Neplatné nebo příliš velké tiskové zadání.');
    if (JSON.stringify(products).length > 900000) throw new Error('Tisková úloha je příliš velká. Rozdělte ji na menší části.');
    const job = await prisma.printJob.create({
      data: {
        products: JSON.stringify(products),
        snapshot: snapshot ? JSON.stringify(snapshot) : null,
        startPosition,
      },
    });
    const totalQty = products.reduce((sum, p) => sum + p.quantity, 0);
    await logActivity('PRINT_JOB_CREATE', `Vytištěno ${totalQty} etiket, počáteční pozice: ${startPosition}`);
    revalidatePath('/');
    return { success: true, job };
  } catch (error: any) {
    console.error('Error saving print job:', error);
    return { success: false, error: error.message || 'Nepodařilo se uložit tiskovou úlohu.' };
  }
}

export async function getPrintJobById(id: string) {
  await assertAuthenticated();
  try {
    return await prisma.printJob.findUnique({
      where: { id },
    });
  } catch (error) {
    console.error(`Error fetching print job by ID ${id}:`, error);
    return null;
  }
}
