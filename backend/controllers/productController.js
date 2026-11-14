const productModel = require('../models/productModel');

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

// GET /api/products/barcode/:barcode
const getProductByBarcode = async (req, res) => {
  try {
    const product = await productModel.getByBarcode(req.params.barcode);
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
    const product = await productModel.getById(req.params.id);

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
  if (!Number.isFinite(price) || price <= 0) {
    return { error: 'Price must be greater than 0.' };
  }
  if (!Number.isInteger(stock) || stock < 0) {
    return { error: 'Stock must be a whole number, 0 or more.' };
  }
  if (barcode.length > 64) {
    return { error: 'Barcode must be 64 characters or fewer.' };
  }

  return {
    value: {
      name,
      category,
      price,
      stock,
      image_url,
      barcode: barcode || null,
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
      return res.status(400).json({ message: 'A product with this barcode already exists.' });
    }
    console.error('Create product error:', error);
    res.status(500).json({ message: 'Server error creating product.' });
  }
};

// PUT /api/products/:id
const updateProduct = async (req, res) => {
  try {
    const parsed = parseProduct(req.body);
    if (parsed.error) {
      return res.status(400).json({ message: parsed.error });
    }

    const product = await productModel.update(req.params.id, parsed.value);
    if (!product) {
      return res.status(404).json({ message: 'Product not found.' });
    }

    res.json(product);
  } catch (error) {
    if (error.code === '23505' && error.constraint?.includes('barcode')) {
      return res.status(400).json({ message: 'A product with this barcode already exists.' });
    }
    console.error('Update product error:', error);
    res.status(500).json({ message: 'Server error updating product.' });
  }
};

// DELETE /api/products/:id
const deleteProduct = async (req, res) => {
  try {
    const product = await productModel.remove(req.params.id);
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
  getProductById,
  getProductByBarcode,
  createProduct,
  updateProduct,
  deleteProduct,
};
