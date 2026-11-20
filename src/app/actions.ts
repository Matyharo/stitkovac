// Keep existing client imports stable while domain modules own their actions.
export { requireAuthenticatedSession, login, logout, getUsers, createUser, deleteUser, changeUserPassword } from './actions/auth';
export { getActivityLogs } from './actions/logs';
export { getTemplates, getTemplateById, saveTemplate, deleteTemplate, duplicateTemplate, updateTemplateOrder, setDefaultTemplate } from './actions/templates';
export { getPrintJobs, savePrintJob, getPrintJobById } from './actions/printing';
export { getContactRules, saveContactRule, deleteContactRule, applyContactRulesToAllProducts, updateContactTextByBrand, applyContactRulesToBatch } from './actions/contacts';
export { saveImportedProducts, analyzeImportedProducts } from './actions/imports';
export { getProducts, getProductById, updateProduct, deleteProduct, deleteProducts, createProduct, clearAllProducts, seedSampleProducts, getProductIds, getProductPage } from './actions/products';
export { getFeedConfigAction, saveFeedConfigAction, triggerFeedSyncAction, getPendingApprovalsAction, getPendingApprovalsCountAction, approvePendingProductAction, rejectPendingProductAction, approveAllPendingProductsAction, rejectAllPendingProductsAction, getSyncLogsAction } from './actions/feed';
export { suggestProductSafetyTextAction, shortenAndSaveProductNameAction, updateProductShortNameAction, previewBulkSafetyAction, applyBulkSafetyAction, createSafetyCategoryAction } from './actions/safety';
export type { ImportProductInput } from './actions/imports';
