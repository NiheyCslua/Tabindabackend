export function mapCustomerToFrontend(customer: any) {
  const totalPurchases = Array.isArray(customer.invoices)
    ? customer.invoices.filter((invoice: any) => invoice.status === 'PAID').reduce((sum: number, invoice: any) => sum + Number(invoice.total || 0), 0)
    : Number(customer.totalPurchases || 0);
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone || '',
    company: customer.company || '',
    address: customer.address || '',
    city: customer.city || '',
    state: customer.state || '',
    zipCode: customer.zipCode || '',
    country: customer.country || '',
    creditLimit: Number(customer.creditLimit || 0),
    totalPurchases,
    status: customer.status || 'active',
    notes: customer.notes || '',
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}
