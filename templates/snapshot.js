require("dotenv").config();

const { build } = require("directus-data-model");

const STATUS_INTERFACE_CHOICES = [
  { text: "$t:published", value: "published" },
  { text: "$t:draft", value: "draft" },
  { text: "$t:archived", value: "archived" }
];

const STATUS_DISPLAY_CHOICES = [
  {
    background: "var(--theme--primary-background)",
    color: "var(--theme--primary)",
    foreground: "var(--theme--primary)",
    text: "$t:published",
    value: "published"
  },
  {
    background: "var(--theme--background-normal)",
    color: "var(--theme--foreground)",
    foreground: "var(--theme--foreground)",
    text: "$t:draft",
    value: "draft"
  },
  {
    background: "var(--theme--warning-background)",
    color: "var(--theme--warning)",
    foreground: "var(--theme--warning)",
    text: "$t:archived",
    value: "archived"
  }
];

function buildSnapshotModel() {
  return build((builder) => {
    const categories = builder.collection("categories").accountability("all");
    categories.primary_key("id", "integer").hidden().readonly().width("full");
    categories.string("name").interface("input").required().width("full");
    categories.text("description").interface("input-multiline").width("full");
    categories.integer("order").interface("input").width("full");
    categories.foreign("parent", "categories", null, { on_delete: "SET NULL" }).width("full");
    const categoryImage = categories.uuid("image").interface("file-image").special("file").width("full");
    categoryImage.relation("directus_files").on_delete("SET NULL");

    const product = builder.collection("product").archive("status", "archived", "draft").accountability("all");
    product.primary_key("id", "uuid").hidden().readonly().unique().width("full");
    product
      .string("status")
      .default("draft")
      .notNullable()
      .interface("select-dropdown", { choices: STATUS_INTERFACE_CHOICES })
      .display("labels", { showAsDot: true, choices: STATUS_DISPLAY_CHOICES })
      .width("full");
    product.string("name").interface("input").required().width("full");
    product.float("price").interface("input").required().width("full");
    const productImage = product.uuid("image").interface("file-image").special("file").width("full");
    productImage.relation("directus_files").on_delete("SET NULL");
    product.string("url").interface("input").width("full");
    product.foreign("category", "categories", null, { on_delete: "SET NULL" }).width("full");
    product.o2m("properties", { template: "{{name}}" }).width("full");

    const productProperties = builder.collection("product_properties").accountability("all");
    productProperties.primary_key("id", "integer").hidden().readonly().width("full");
    productProperties
      .foreign("product", "product", "properties", { on_delete: "SET NULL", one_deselect_action: "nullify" })
      .hidden(true)
      .width("full");
    productProperties.string("name").interface("input").required().width("full");
    productProperties.string("value").interface("input").width("full");
    productProperties
      .string("type")
      .interface("select-dropdown", {
        choices: [
          { text: "string", value: "string" },
          { text: "number", value: "number" },
          { text: "boolean", value: "boolean" }
        ]
      })
      .width("full");
  });
}

async function main() {
  const baseURL = process.env.DIRECTUS_URL || "http://localhost:8055";
  const token = process.env.DIRECTUS_ADMIN_TOKEN;
  const email = process.env.DIRECTUS_ADMIN_EMAIL;
  const password = process.env.DIRECTUS_ADMIN_PASSWORD;

  if (!token && (!email || !password)) {
    throw new Error("Set DIRECTUS_ADMIN_TOKEN or DIRECTUS_ADMIN_EMAIL and DIRECTUS_ADMIN_PASSWORD");
  }

  const model = buildSnapshotModel();

  const result = await model.fetch(baseURL, token || email, token ? undefined : password);

  console.log("Collections created", result.collections);
  console.log("Relations created", result.relations);
}

main().catch((error) => {
  console.error("Failed to push schema", error.response?.data || error.message || error);
  process.exit(1);
});

