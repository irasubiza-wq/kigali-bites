import { Hono, type Context, type Next } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { meals, restaurants } from "../../db/schema.ts";

// The site's existing Firebase project (same as the client config in index.html).
const FIREBASE_PROJECT_ID = "kigali-bites-43044";
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

// Short-lived cache of admin lookups (a cache only — the source of truth is Firestore).
const adminCache = new Map<string, { isAdmin: boolean; expires: number }>();

async function isFirebaseAdmin(uid: string, idToken: string): Promise<boolean> {
  const cached = adminCache.get(uid);
  if (cached && cached.expires > Date.now()) return cached.isAdmin;

  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${encodeURIComponent(uid)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
  let admin = false;
  if (res.ok) {
    const docData = (await res.json()) as { fields?: { isAdmin?: { booleanValue?: boolean } } };
    admin = docData.fields?.isAdmin?.booleanValue === true;
  }
  adminCache.set(uid, { isAdmin: admin, expires: Date.now() + 60_000 });
  return admin;
}

async function requireAdmin(c: Context, next: Next) {
  const header = c.req.header("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return c.json({ error: "Please sign in as an admin." }, 401);

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID,
    });
    const uid = payload.sub;
    if (!uid || !(await isFirebaseAdmin(uid, token))) {
      return c.json({ error: "Admin access required." }, 403);
    }
  } catch {
    return c.json({ error: "Your session has expired. Please sign in again." }, 401);
  }
  await next();
}

const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const toId = (v: string) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

function restaurantInput(body: Record<string, unknown>) {
  return {
    name: str(body.name, 200),
    location: str(body.location, 200),
    cuisine: str(body.cuisine, 200),
    description: str(body.description),
    imageUrl: str(body.imageUrl, 1000),
    phone: str(body.phone, 50),
  };
}

function mealInput(body: Record<string, unknown>) {
  const price = Math.round(Number(body.price));
  return {
    name: str(body.name, 200),
    category: str(body.category, 100) || "Main",
    description: str(body.description),
    price: Number.isFinite(price) && price >= 0 ? price : -1,
    imageUrl: str(body.imageUrl, 1000),
  };
}

async function readJson(c: Context): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

const app = new Hono();

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Something went wrong. Please try again." }, 500);
});

// ---------- Public directory ----------

app.get("/api/restaurants", async (c) => {
  const rows = await db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      location: restaurants.location,
      cuisine: restaurants.cuisine,
      description: restaurants.description,
      imageUrl: restaurants.imageUrl,
      phone: restaurants.phone,
      mealCount: sql<number>`(select count(*)::int from "meals" m where m."restaurant_id" = "restaurants"."id")`,
    })
    .from(restaurants)
    .orderBy(asc(restaurants.name));
  return c.json(rows);
});

app.get("/api/restaurants/:id", async (c) => {
  const id = toId(c.req.param("id"));
  if (!id) return c.json({ error: "Restaurant not found" }, 404);
  const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, id));
  if (!restaurant) return c.json({ error: "Restaurant not found" }, 404);
  const menu = await db
    .select()
    .from(meals)
    .where(eq(meals.restaurantId, id))
    .orderBy(asc(meals.category), asc(meals.name));
  return c.json({ ...restaurant, meals: menu });
});

// ---------- Admin (requires Firebase admin account) ----------

app.use("/api/admin/*", requireAdmin);

app.get("/api/admin/restaurants", async (c) => {
  const rows = await db.select().from(restaurants).orderBy(desc(restaurants.createdAt));
  const allMeals = await db.select().from(meals).orderBy(asc(meals.name));
  return c.json(rows.map((r) => ({ ...r, meals: allMeals.filter((m) => m.restaurantId === r.id) })));
});

app.post("/api/admin/restaurants", async (c) => {
  const data = restaurantInput(await readJson(c));
  if (!data.name) return c.json({ error: "Restaurant name is required." }, 400);
  const [row] = await db.insert(restaurants).values(data).returning();
  return c.json(row, 201);
});

app.put("/api/admin/restaurants/:id", async (c) => {
  const id = toId(c.req.param("id"));
  if (!id) return c.json({ error: "Restaurant not found" }, 404);
  const data = restaurantInput(await readJson(c));
  if (!data.name) return c.json({ error: "Restaurant name is required." }, 400);
  const [row] = await db.update(restaurants).set(data).where(eq(restaurants.id, id)).returning();
  if (!row) return c.json({ error: "Restaurant not found" }, 404);
  return c.json(row);
});

app.delete("/api/admin/restaurants/:id", async (c) => {
  const id = toId(c.req.param("id"));
  if (!id) return c.json({ error: "Restaurant not found" }, 404);
  await db.delete(restaurants).where(eq(restaurants.id, id));
  return c.json({ ok: true });
});

app.post("/api/admin/restaurants/:id/meals", async (c) => {
  const restaurantId = toId(c.req.param("id"));
  if (!restaurantId) return c.json({ error: "Restaurant not found" }, 404);
  const [exists] = await db.select({ id: restaurants.id }).from(restaurants).where(eq(restaurants.id, restaurantId));
  if (!exists) return c.json({ error: "Restaurant not found" }, 404);
  const data = mealInput(await readJson(c));
  if (!data.name) return c.json({ error: "Meal name is required." }, 400);
  if (data.price < 0) return c.json({ error: "Please enter a valid price." }, 400);
  const [row] = await db.insert(meals).values({ ...data, restaurantId }).returning();
  return c.json(row, 201);
});

app.put("/api/admin/meals/:id", async (c) => {
  const id = toId(c.req.param("id"));
  if (!id) return c.json({ error: "Meal not found" }, 404);
  const data = mealInput(await readJson(c));
  if (!data.name) return c.json({ error: "Meal name is required." }, 400);
  if (data.price < 0) return c.json({ error: "Please enter a valid price." }, 400);
  const [row] = await db.update(meals).set(data).where(eq(meals.id, id)).returning();
  if (!row) return c.json({ error: "Meal not found" }, 404);
  return c.json(row);
});

app.delete("/api/admin/meals/:id", async (c) => {
  const id = toId(c.req.param("id"));
  if (!id) return c.json({ error: "Meal not found" }, 404);
  await db.delete(meals).where(eq(meals.id, id));
  return c.json({ ok: true });
});

export const config = {
  path: ["/api/restaurants", "/api/restaurants/*", "/api/admin/*"],
};

export default app;
