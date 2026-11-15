const test = require('node:test');
const assert = require('node:assert/strict');
const { requireRole } = require('../utils/roleAuthorization');

const response = () => ({
  statusCode: null,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

test('store-owner authorization permits owners and rejects other roles', () => {
  const middleware = requireRole('store-owner');
  const ownerResponse = response();
  let ownerNext = false;
  middleware({ user: { role: 'store-owner' } }, ownerResponse, () => { ownerNext = true; });
  assert.equal(ownerNext, true);

  const customerResponse = response();
  let customerNext = false;
  middleware({ user: { role: 'customer' } }, customerResponse, () => { customerNext = true; });
  assert.equal(customerNext, false);
  assert.equal(customerResponse.statusCode, 403);
});
