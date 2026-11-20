'use server';

import { revalidatePath } from 'next/cache';
import { assertAuthenticated } from '@/lib/auth';


// ---------------------------------------------------------------------------
// FEED SYNCHRONIZATION & PRODUCT APPROVAL ACTIONS
// ---------------------------------------------------------------------------

export async function getFeedConfigAction() {
  await assertAuthenticated();
  const { getFeedConfig } = await import('@/lib/feedSync');
  const user = await assertAuthenticated();
  const config = await getFeedConfig();
  return user.role === 'admin' ? config : { ...config, url: '', cronSecret: '' };
}

export async function saveFeedConfigAction(data: {
  url: string;
  autoApplySafe: boolean;
  priceThresholdPercent: number;
  checkEanValidity: boolean;
  cronSecret?: string;
}) {
  await assertAuthenticated(true);
  const { saveFeedConfig } = await import('@/lib/feedSync');
  const res = await saveFeedConfig(data);
  revalidatePath('/import');
  revalidatePath('/settings');
  return res;
}

export async function triggerFeedSyncAction(overrideUrl?: string) {
  await assertAuthenticated(true);
  const { syncProductsFromFeed } = await import('@/lib/feedSync');
  const result = await syncProductsFromFeed(overrideUrl);
  revalidatePath('/import');
  revalidatePath('/products');
  revalidatePath('/');
  return result;
}

export async function getPendingApprovalsAction() {
  await assertAuthenticated();
  const { getPendingApprovals } = await import('@/lib/feedSync');
  return await getPendingApprovals();
}

export async function getPendingApprovalsCountAction() {
  await assertAuthenticated();
  const { getPendingApprovalsCount } = await import('@/lib/feedSync');
  return await getPendingApprovalsCount();
}

export async function approvePendingProductAction(
  id: string,
  overrides?: {
    name?: string;
    description?: string;
    brand?: string;
    price?: number;
    ean?: string;
  }
) {
  await assertAuthenticated();
  const { approvePendingProduct } = await import('@/lib/feedSync');
  const res = await approvePendingProduct(id, overrides);
  revalidatePath('/import');
  revalidatePath('/products');
  revalidatePath('/');
  return res;
}

export async function rejectPendingProductAction(id: string) {
  await assertAuthenticated();
  const { rejectPendingProduct } = await import('@/lib/feedSync');
  const res = await rejectPendingProduct(id);
  revalidatePath('/import');
  return res;
}

export async function approveAllPendingProductsAction(ids?: string[]) {
  await assertAuthenticated();
  const { approveAllPendingProducts } = await import('@/lib/feedSync');
  const res = await approveAllPendingProducts(ids);
  revalidatePath('/import');
  revalidatePath('/products');
  revalidatePath('/');
  return res;
}

export async function rejectAllPendingProductsAction(ids?: string[]) {
  await assertAuthenticated();
  const { rejectAllPendingProducts } = await import('@/lib/feedSync');
  const res = await rejectAllPendingProducts(ids);
  revalidatePath('/import');
  return res;
}

export async function getSyncLogsAction(limit: number = 10) {
  await assertAuthenticated();
  const { getSyncLogs } = await import('@/lib/feedSync');
  return await getSyncLogs(limit);
}
