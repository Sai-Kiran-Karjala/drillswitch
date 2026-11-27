// Demo stubs for INC-2041.
type Customer = { id: string; region: string };

export async function redirectTo3DSecureV1(customer: Customer, amount: number) {
  return { redirect: `/pay/3ds-v1?customer=${customer.id}&amount=${amount}` };
}

export async function redirectTo3DSecureV2(customer: Customer, amount: number) {
  // The EU card issuers' ACS rejects this redirect's challenge format, which is the incident.
  return { redirect: `/pay/3ds-v2?customer=${customer.id}&amount=${amount}` };
}

export async function chargeCard(customerId: string, amount: number) {
  return { charged: amount, customerId };
}
