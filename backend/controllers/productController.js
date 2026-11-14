const productModel = require('../models/productModel');
const parseId = (value) => {
  if (!/^[1-9]\d*$/.test(String(value || ''))) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
};

// GET /api/products
const getAllProducts = async (req, res) => {
  try {
    const products = await productModel.getAll();
    res.json(products);
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ message: 'Server error fetching products.' });
  }
};

const getOwnerProducts = async (req, res) => {
  try {
    res.json(await productModel.getAll({ includeInactive: true }));
  } catch (error) {
    console.error('Get owner products error:', error);
    res.status(500).json({ message: 'Server error fetching products.' });
  }
};

// GET /api/products/barcode?code=...
const getProductByBarcode = async (req, res) => {
  try {
    const rawBarcode = typeof req.query.code === 'string' ? req.query.code : req.params.barcode;
    const barcode = typeof rawBarcode === 'string' ? rawBarcode.trim() : '';
    if (!barcode || barcode.length > 64 || /[\u0000-\u001f\u007f]/.test(barcode)) {
      return res.status(400).json({ message: 'Provide a valid barcode of 1 to 64 characters.' });
    }
    const product = await productModel.getByBarcode(barcode);
    if (!product) {
      return res.status(404).json({ message: 'Product not found for this barcode.' });
    }
    res.json(product);
  } catch (error) {
    console.error('Get product by barcode error:', error);
    res.status(500).json({ message: 'Server error fetching product.' });
  }
};

// GET /api/products/:id
const getProductById = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid product ID.' });
    const product = await productModel.getById(id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found.' });
    }

    res.json(product);
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ message: 'Server error fetching product.' });
  }
};

const parseProduct = (body) => {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  const price = Number(body.price);
  const stock = Number(body.stock);
  const image_url = typeof body.image_url === 'string' ? body.image_url.trim() : '';
  const barcode = typeof body.barcode === 'string' ? body.barcode.trim() : '';

  if (!name) {
    return { error: 'Product name is required.' };
  }
  if (name.length > 100 || category.length > 50) {
    return { error: 'Product name must be 100 characters or fewer and category 50 characters or fewer.' };
  }
  if (!Number.isFinite(price) || price <= 0 || price > 99999999.99) {
    return { error: 'Price must be greater than 0 and within the supported range.' };
  }
  if (!Number.isSafeInteger(stock) || stock < 0 || stock > 2147483647) {
    return { error: 'Stock must be a whole number, 0 or more.' };
  }
  if (barcode.length > 64 || /[\u0000-\u001f\u007f]/.test(barcode)) {
    return { error: 'Barcode must be 64 characters or fewer and contain no control characters.' };
  }
  if (body.active !== undefined && typeof body.active !== 'boolean') {
    return { error: 'Product active status must be true or false.' };
  }

  return {
    value: {
      name,
      category,
      price,
      stock,
      image_url,
      barcode: barcode || null,
      active: body.active,
    },
  };
};

// POST /api/products
const createProduct = async (req, res) => {
  try {
    const parsed = parseProduct(req.body);
    if (parsed.error) {
      return res.status(400).json({ message: parsed.error });
    }

    const product = await productModel.create(parsed.value);
    res.status(201).json(product);
  } catch (error) {
    if (error.code === '23505' && error.constraint?.includes('barcode')) {
      const conflict = await productModel.getBarcodeConflict(String(req.body.barcode || '').trim()).catch(() => null);
      return res.status(409).json({
        message: conflict
          ? `This barcode is already assigned to ${conflict.name} (product #${conflict.id}).`
          : 'A product with this barcode already exists.',
        conflict_product: conflict ? { id: conflict.id, name: conflict.name } : null,
      });
    }
    console.error('Create product error:', error);
    res.status(500).json({ message: 'Server error creating product.' });
  }
};

// PUT /api/products/:id
const updateProduct = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid product ID.' });
    const parsed = parseProduct(req.body);
    if (parsed.error) {
      return res.status(400).json({ message: parsed.error });
    }

    const product = await productModel.update(id, parsed.value);
    if (!product) {
      return res.status(404).json({ message: 'Product not found.' });
    }

    res.json(product);
  } catch (error) {
    if (error.code === '23505' && error.constraint?.includes('barcode')) {
      const conflict = await productModel.getBarcodeConflict(String(req.body.barcode || '').trim()).catch(() => null);
      return res.status(409).json({
        message: conflict && conflict.id !== id
          ? `This barcode is already assigned to ${conflict.name} (product #${conflict.id}).`
          : 'A product with this barcode already exists.',
        conflict_product: conflict && conflict.id !== id
          ? { id: conflict.id, name: conflict.name } : null,
      });
    }
    console.error('Update product error:', error);
    res.status(500).json({ message: 'Server error updating product.' });
  }
};

// DELETE /api/products/:id
const deleteProduct = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid product ID.' });
    const product = await productModel.remove(id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found.' });
    }
    res.json({ message: 'Product deleted.' });
  } catch (error) {
    if (error.code === '23503') {
      return res.status(400).json({
        message: 'This product is already on an order, so it cannot be deleted.',
      });
    }
    console.error('Delete product error:', error);
    res.status(500).json({ message: 'Server error deleting product.' });
  }
};

module.exports = {
  getAllProducts,
  getOwnerProducts,
  getProductById,
  getProductByBarcode,
  createProduct,
  updateProduct,
  deleteProduct,
};
