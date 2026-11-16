CREATE TABLE "meals" (
	"id" serial PRIMARY KEY,
	"restaurant_id" integer NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'Main' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"image_url" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurants" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"cuisine" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image_url" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "meals_restaurant_id_idx" ON "meals" ("restaurant_id");--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_restaurant_id_restaurants_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE;