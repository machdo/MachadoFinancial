-- Add category type to separate income and expense categories
ALTER TABLE "Category"
ADD COLUMN "type" TEXT NOT NULL DEFAULT 'expense';
