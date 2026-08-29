"use server";

import { revalidatePath } from "next/cache";
import {
  createPackage,
  createProduct,
  createService,
  deactivateCatalogItem,
  updatePackage,
  updateProduct,
  updateService,
} from "@/server/catalog/mutations";

export async function createProductAction(formData: FormData) {
  const result = await createProduct({
    name: String(formData.get("name") ?? ""),
    category: String(formData.get("category") ?? ""),
    brand: String(formData.get("brand") ?? ""),
    sku: String(formData.get("sku") ?? ""),
    price: String(formData.get("price") ?? ""),
    stockQty: String(formData.get("stockQty") ?? ""),
    minQty: String(formData.get("minQty") ?? ""),
    forSale: formData.get("forSale") === "on",
  });
  if (result.ok) revalidatePath("/produtos");
  return result;
}

export async function updateProductAction(id: string, formData: FormData) {
  const result = await updateProduct(id, {
    name: String(formData.get("name") ?? ""),
    category: String(formData.get("category") ?? ""),
    brand: String(formData.get("brand") ?? ""),
    sku: String(formData.get("sku") ?? ""),
    price: String(formData.get("price") ?? ""),
    stockQty: String(formData.get("stockQty") ?? ""),
    minQty: String(formData.get("minQty") ?? ""),
    forSale: formData.get("forSale") === "on",
  });
  if (result.ok) revalidatePath("/produtos");
  return result;
}

export async function createServiceAction(formData: FormData) {
  const result = await createService({
    name: String(formData.get("name") ?? ""),
    durationMin: String(formData.get("durationMin") ?? ""),
    price: String(formData.get("price") ?? ""),
    commissionPct: String(formData.get("commissionPct") ?? ""),
    bookableOnline: formData.get("bookableOnline") === "on",
  });
  if (result.ok) revalidatePath("/servicos");
  return result;
}

export async function updateServiceAction(id: string, formData: FormData) {
  const result = await updateService(id, {
    name: String(formData.get("name") ?? ""),
    durationMin: String(formData.get("durationMin") ?? ""),
    price: String(formData.get("price") ?? ""),
    commissionPct: String(formData.get("commissionPct") ?? ""),
    bookableOnline: formData.get("bookableOnline") === "on",
  });
  if (result.ok) revalidatePath("/servicos");
  return result;
}

export async function createPackageAction(formData: FormData) {
  const result = await createPackage({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    price: String(formData.get("price") ?? ""),
    bookableOnline: formData.get("bookableOnline") === "on",
  });
  if (result.ok) revalidatePath("/pacotes");
  return result;
}

export async function updatePackageAction(id: string, formData: FormData) {
  const result = await updatePackage(id, {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    price: String(formData.get("price") ?? ""),
    bookableOnline: formData.get("bookableOnline") === "on",
  });
  if (result.ok) revalidatePath("/pacotes");
  return result;
}

export async function deactivateCatalogAction(
  kind: "product" | "service" | "package",
  id: string
) {
  const result = await deactivateCatalogItem(kind, id);
  if (result.ok) {
    revalidatePath("/produtos");
    revalidatePath("/servicos");
    revalidatePath("/pacotes");
  }
  return result;
}
