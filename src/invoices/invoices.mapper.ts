const normalizeSerials = (item: any) => {
  const serials = [
    item.serialNumber,
    ...(Array.isArray(item.serialNumbers) ? item.serialNumbers : []),
  ]
    .map((serial: any) => String(serial || '').trim())
    .filter(Boolean);

  return Array.from(new Set(serials));
};

export const mapInvoiceToFrontend = (invoice: any) => ({
  id: invoice.id,
  invoiceNumber: invoice.invoiceNumber || invoice.id,
  customerId: invoice.customerId || undefined,
  customerName: invoice.customerName || invoice.customer?.name || '',
  customerEmail: invoice.customerEmail || invoice.customer?.email || '',
  customerPhone: invoice.customerPhone || invoice.customer?.phone || '',
  items: (invoice.items || []).map((item: any) => {
    const serialNumbers = normalizeSerials(item);

    return {
      id: item.id,
      productId: item.productId || '',
      productName: item.productName || item.product?.name || '',
      productSku: item.productSku || item.product?.sku || item.productId || '',
      // Never falls back to item.product?.description — this is the
      // invoice's own saved copy (or null if intentionally left blank).
      productDescription: item.productDescription ?? null,
      serialNumber: item.serialNumber || (serialNumbers.length === 1 ? serialNumbers[0] : undefined),
      serialNumbers,
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
      taxRate: Number(item.taxRate || 0),
      discount: Number(item.discount || 0),
      total: Number(item.total || 0),
      product: item.product ? { id: item.product.id, sku: item.product.sku, name: item.product.name } : (item.productId ? { id: item.productId, sku: item.productSku || item.productId, name: item.productName || '' } : undefined),
    };
  }),
  subtotal: Number(invoice.subtotal || 0),
  taxAmount: Number(invoice.taxAmount || 0),
  discountAmount: Number(invoice.discountAmount || 0),
  shippingCost: Number(invoice.shippingCost || 0),
  total: Number(invoice.total || 0),
  status: String(invoice.status || 'PENDING').toLowerCase(),
  // Phase – Sales Improvements: 'product' (default) or 'service'.
  invoiceType: String(invoice.invoiceType || 'PRODUCT').toLowerCase(),
  paymentMethod: invoice.paymentMethod || 'cash',
  bankAccount: invoice.bankAccount || null,
  financialAccountId: invoice.financialAccountId || null,
  template: invoice.template || '',
  // Null only for invoices created before this feature — frontend falls
  // back to the template's default text in that case (backward compat).
  termsAndConditions: invoice.termsAndConditions ?? null,
  invoiceDate: invoice.invoiceDate,
  notes: invoice.notes || '',
  poNumber: invoice.poNumber || null,
  dueDate: invoice.dueDate,
  paidAt: invoice.paidAt,
  createdAt: invoice.createdAt,
  updatedAt: invoice.updatedAt,
  createdBy: invoice.createdBy || '',
});
