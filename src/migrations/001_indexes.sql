-- Created by assistant: safe, idempotent indexes
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_sku     ON products(sku);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_channel    ON sales(channel);
CREATE INDEX IF NOT EXISTS idx_sales_barcode    ON sales(barcode);
