import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const restaurants = pgTable("restaurants", {
  id: serial().primaryKey(),
  name: text().notNull(),
  location: text().notNull().default(""),
  cuisine: text().notNull().default(""),
  description: text().notNull().default(""),
  imageUrl: text("image_url").notNull().default(""),
  phone: text().notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const meals = pgTable(
  "meals",
  {
    id: serial().primaryKey(),
    restaurantId: integer("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    name: text().notNull(),
    category: text().notNull().default("Main"),
    description: text().notNull().default(""),
    price: integer().notNull().default(0),
    imageUrl: text("image_url").notNull().default(""),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("meals_restaurant_id_idx").on(t.restaurantId)]
);
