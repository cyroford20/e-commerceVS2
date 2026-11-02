-- ============================================
-- Sample products for the Vape Shop
-- Run AFTER schema.sql
-- Images live in public/products/
-- ============================================

INSERT INTO products (name, category, price, stock, image_url) VALUES
  ('Iced Mango Disposable', 'Disposable', 499.00, 50, '/products/08782fa5-820e-470f-a14a-eb8e4acb3413.jfif'),
  ('Cool Mint Pod Kit', 'Pod System', 1299.00, 30, '/products/20182b12-13db-43c4-8933-6129b7b77bd5.jfif'),
  ('Berry Blast E-Liquid 30ml', 'E-Liquid', 350.00, 100, '/products/297a97eb-ee0a-4e4c-8ccc-447178d1feb9.jfif'),
  ('Vanilla Custard Salt Nic', 'Salt Nic', 450.00, 80, '/products/5d065c8d-3e69-477b-9ac5-c657a8315b5e.jfif'),
  ('Mesh Coil Replacement (5pcs)', 'Coils', 299.00, 60, '/products/7235678a-401e-438c-b191-dce8abfc96cf.jfif'),
  ('USB-C Vape Charger', 'Accessories', 199.00, 40, '/products/86811bc1-903f-4a2c-8fc8-6ef8f96cd7fa.jfif'),
  ('Grape Ice Disposable', 'Disposable', 499.00, 45, '/products/91a22c8b-064a-42cb-90f5-262200ebb1c8.jfif'),
  ('Starter Kit Bundle', 'Pod System', 1899.00, 20, '/products/cd3f6c65-9770-4d59-847d-fc088eceef13.jfif')
ON CONFLICT DO NOTHING;

INSERT INTO products (name, category, price, stock, image_url)
SELECT source.name, source.category, source.price, source.stock, source.image_url
FROM (VALUES
  ('Rose Ice Pod Kit', 'Pod System', 1499.00, 25, '/products/20182b12-13db-43c4-8933-6129b7b77bd5.jfif'),
  ('Midnight Box Mod', 'Mod Device', 2199.00, 15, '/products/cd3f6c65-9770-4d59-847d-fc088eceef13.jfif'),
  ('Peach Lychee E-Liquid 30ml', 'E-Liquid', 375.00, 70, '/products/297a97eb-ee0a-4e4c-8ccc-447178d1feb9.jfif'),
  ('Watermelon Freeze Salt Nic', 'Salt Nic', 475.00, 65, '/products/91a22c8b-064a-42cb-90f5-262200ebb1c8.jfif'),
  ('Coffee Tobacco E-Liquid 30ml', 'E-Liquid', 399.00, 55, '/products/5d065c8d-3e69-477b-9ac5-c657a8315b5e.jfif'),
  ('Ceramic Coil Replacement (5pcs)', 'Coils', 349.00, 45, '/products/7235678a-401e-438c-b191-dce8abfc96cf.jfif'),
  ('Mesh Coil Replacement (3pcs)', 'Coils', 249.00, 50, '/products/7235678a-401e-438c-b191-dce8abfc96cf.jfif'),
  ('Premium USB-C Fast Charger', 'Accessories', 299.00, 35, '/products/86811bc1-903f-4a2c-8fc8-6ef8f96cd7fa.jfif'),
  ('Spare 18650 Battery', 'Accessories', 499.00, 30, '/products/86811bc1-903f-4a2c-8fc8-6ef8f96cd7fa.jfif'),
  ('Replacement Drip Tip', 'Accessories', 149.00, 80, '/products/86811bc1-903f-4a2c-8fc8-6ef8f96cd7fa.jfif')
) AS source(name, category, price, stock, image_url)
WHERE NOT EXISTS (
  SELECT 1 FROM products existing WHERE existing.name = source.name
);
