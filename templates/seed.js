require("dotenv").config();

const fs = require("fs");
const path = require("path");
const axios = require("axios");

async function getDirectusClient() {
  const baseURL = process.env.DIRECTUS_URL || "http://localhost:8055";
  const token = process.env.DIRECTUS_ADMIN_TOKEN;
  const email = process.env.DIRECTUS_ADMIN_EMAIL;
  const password = process.env.DIRECTUS_ADMIN_PASSWORD;

  if (!token && (!email || !password)) {
    throw new Error("Укажите DIRECTUS_ADMIN_TOKEN или DIRECTUS_ADMIN_EMAIL и DIRECTUS_ADMIN_PASSWORD");
  }

  const directus = axios.create({ baseURL });

  let accessToken = token;
  if (!accessToken) {
    const {
      data: { data }
    } = await directus.post("/auth/login", { email, password });
    accessToken = data.access_token;
  }

  directus.defaults.headers.common = {
    Authorization: `Bearer ${accessToken}`
  };

  return directus;
}

async function getExistingIds(directus, name) {
  try {
    const { data } = await directus.get(`/items/${name}`, {
      params: { fields: "id", limit: -1 }
    });
    const rows = data?.data || [];
    return new Set(rows.map((row) => String(row.id)));
  } catch (error) {
    const details = error.response?.data || error.message || error;
    console.error(`Failed to read existing ids from ${name}:`, details);
    return new Set();
  }
}

async function seedCollection(directus, name, items) {
  if (!items || !items.length) return;
  try {
    const { data } = await directus.post(`/items/${name}`, items);
    console.log(`Seeded ${name}:`, data.data?.length ?? data.length ?? items.length);
  } catch (error) {
    const details = error.response?.data || error.message || error;
    console.error(`Failed to seed ${name}:`, details);
    throw error;
  }
}

async function main() {
  const dataPath = path.join(__dirname, "data.json");
  const raw = fs.readFileSync(dataPath, "utf-8");
  const { data } = JSON.parse(raw);

  const directus = await getDirectusClient();

  // Порядок важен из-за внешних ключей
  const existingCategories = await getExistingIds(directus, "categories");
  const categoriesToInsert = (data.categories || []).filter(({ id }) => !existingCategories.has(String(id)));
  await seedCollection(directus, "categories", categoriesToInsert);

  const existingSubcategories = await getExistingIds(directus, "subcategories");
  const subcategoriesToInsert = (data.subcategories || []).filter(({ id }) => !existingSubcategories.has(String(id)));
  await seedCollection(directus, "subcategories", subcategoriesToInsert);

  // Продукты: убираем legacy_id перед вставкой, запоминаем соответствие legacy_id -> новый uuid
  const productsRaw = data.product || [];
  const payloads = productsRaw.map((p) => {
    const { legacy_id, ...rest } = p;
    return { legacy_id: legacy_id || null, payload: rest };
  });

  let productIdMap = new Map();
  if (payloads.length) {
    const { data: productResp } = await directus.post("/items/product", payloads.map(({ payload }) => payload));
    const created = productResp?.data || productResp || [];
    productIdMap = new Map(payloads.map((p, idx) => [p.legacy_id || p.payload.name || String(idx), created[idx]?.id]));
    console.log("Seeded product:", created.length);
  }

  const existingProps = await getExistingIds(directus, "product_properties");
  const propsToInsert = (data.product_properties || [])
    .filter(({ id }) => !existingProps.has(String(id)))
    .map((prop) => {
      const mapped = { ...prop };
      if (prop.product && productIdMap.has(prop.product)) {
        mapped.product = productIdMap.get(prop.product);
      }
      return mapped;
    })
    .filter((p) => p.product);
  await seedCollection(directus, "product_properties", propsToInsert);

  console.log("Данные загружены.");
}

main().catch((error) => {
  console.error("Seeding failed:", error.response?.data || error.message || error);
  process.exit(1);
});

