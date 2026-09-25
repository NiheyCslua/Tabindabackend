export const mapProductToFrontend = (product: any) => ({
  id: product.id,
  sku: product.sku || product.id,
  barcode: product.barcode || product.upc || '',
  serialNumber: product.serialNumber || '',
  serialNumbers: Array.isArray(product.serialNumbers)
    ? product.serialNumbers
    : product.serialNumber
      ? [product.serialNumber]
      : [],
  name: product.name,
  description: product.description || '',
  category: product.category || 'General',
  subcategory: product.subcategory || '',
  brand: product.brand || '',
  vendorId: product.vendorId || '',
  vendorName: product.vendorName || '',
  costPrice: Number(product.costPrice || 0),
  sellingPrice: Number(product.sellingPrice || 0),
  taxRate: Number(product.taxRate || 0),
  quantity: Number(product.quantity || 0),
  reorderLevel: Number(product.reorderLevel || 0),
  maxStock: Number(product.maxStock || 0),
  status: product.status || 'active',
  image: product.image || '',
  images: Array.isArray(product.images) ? product.images : [],
  variants: Array.isArray(product.variants) ? product.variants : [],
  createdAt: product.createdAt,
  updatedAt: product.updatedAt,
});
