const crypto = require('crypto');
const pool = require('../config/db');

const shipmentCode = () =>
  `SHP-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

const makeOtp = () => String(crypto.randomInt(100000, 1000000));
const hashOtp = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');

const inTransaction = async (work) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const value = await work(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const problem = (message, status = 400) => Object.assign(new Error(message), { status });

const addEvent = async (client, shipmentId, actorId, status, note) => {
  await client.query(
    `INSERT INTO shipment_events (shipment_id, actor_user_id, status, note)
     VALUES ($1, $2, $3, $4)`,
    [shipmentId, actorId || null, status, note || null]
  );
};

const notify = async (client, shipmentId, userId, kind, message) => {
  if (!userId) return;
  await client.query(
    `INSERT INTO delivery_notifications (shipment_id, recipient_user_id, kind, message)
     VALUES ($1, $2, $3, $4)`,
    [shipmentId, userId, kind, message]
  );
};

const getZones = async (activeOnly = true) => {
  const result = await pool.query(
    `SELECT id, name, city, barangay, delivery_fee, active
     FROM delivery_zones
     WHERE ($1::boolean = FALSE OR active = TRUE)
     ORDER BY city, barangay`,
    [activeOnly]
  );
  return result.rows;
};

const createZone = async ({ name, city, barangay, deliveryFee }) => {
  const result = await pool.query(
    `INSERT INTO delivery_zones (name, city, barangay, delivery_fee)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [name, city, barangay, deliveryFee]
  );
  return result.rows[0];
};

const updateZone = async (id, { name, city, barangay, deliveryFee, active }) => {
  const result = await pool.query(
    `UPDATE delivery_zones SET name = $1, city = $2, barangay = $3,
       delivery_fee = $4, active = $5, updated_at = CURRENT_TIMESTAMP
     WHERE id = $6 RETURNING *`,
    [name, city, barangay, deliveryFee, active, id]
  );
  return result.rows[0] || null;
};

const listVehicles = async () => {
  const result = await pool.query('SELECT * FROM vehicles ORDER BY active DESC, plate_number');
  return result.rows;
};

const createVehicle = async ({ plateNumber, description }) => {
  const result = await pool.query(
    `INSERT INTO vehicles (plate_number, description) VALUES ($1, $2) RETURNING *`,
    [plateNumber, description || null]
  );
  return result.rows[0];
};

const updateVehicle = async (id, { plateNumber, description, active }) => {
  const result = await pool.query(
    `UPDATE vehicles SET plate_number = $1, description = $2, active = $3,
       updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *`,
    [plateNumber, description || null, active, id]
  );
  return result.rows[0] || null;
};

const listRiders = async () => {
  const result = await pool.query(`
    SELECT u.id, u.name, u.email, rp.phone, rp.active, rp.availability,
           v.id AS vehicle_id, v.plate_number, v.description AS vehicle_description,
           COALESCE(workload.open_count, 0)::int AS workload,
           COALESCE(performance.delivered, 0)::int AS delivered_count,
           COALESCE(performance.failed, 0)::int AS failed_count,
           CASE WHEN COALESCE(performance.delivered, 0) + COALESCE(performance.failed, 0) = 0 THEN 0
             ELSE ROUND(100.0 * performance.delivered /
               (performance.delivered + performance.failed))::int END AS success_rate,
           COALESCE(zones.coverage, '[]'::json) AS coverage
    FROM users u
    JOIN rider_profiles rp ON rp.user_id = u.id
    LEFT JOIN vehicles v ON v.id = rp.vehicle_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS open_count FROM rider_assignments a
      WHERE a.rider_user_id = u.id AND a.state IN ('assigned', 'accepted')
    ) workload ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*) FILTER (WHERE a.result = 'delivered') AS delivered,
             COUNT(*) FILTER (WHERE a.result = 'failed') AS failed
      FROM delivery_attempts a WHERE a.rider_user_id = u.id
    ) performance ON TRUE
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object('id', z.id, 'name', z.name) ORDER BY z.name) AS coverage
      FROM rider_zone_coverage c JOIN delivery_zones z ON z.id = c.delivery_zone_id
      WHERE c.rider_user_id = u.id
    ) zones ON TRUE
    WHERE u.role = 'delivery-person'
    ORDER BY rp.active DESC, u.name
  `);
  return result.rows;
};

const createRider = async ({ name, email, passwordHash, phone, vehicleId, zoneIds = [] }) =>
  inTransaction(async (client) => {
    const user = await client.query(
      `INSERT INTO users (name, email, password, role)
       VALUES ($1, $2, $3, 'delivery-person') RETURNING id, name, email, role`,
      [name, email, passwordHash]
    );
    const rider = user.rows[0];
    await client.query(
      `INSERT INTO rider_profiles (user_id, phone, vehicle_id) VALUES ($1, $2, $3)`,
      [rider.id, phone || null, vehicleId || null]
    );
    for (const zoneId of zoneIds) {
      await client.query(
        `INSERT INTO rider_zone_coverage (rider_user_id, delivery_zone_id) VALUES ($1, $2)`,
        [rider.id, zoneId]
      );
    }
    return { ...rider, phone: phone || null, vehicle_id: vehicleId || null, active: true, availability: 'available' };
  });

const updateRider = async (id, { name, phone, vehicleId, active, availability, zoneIds }) =>
  inTransaction(async (client) => {
    const user = await client.query(
      `UPDATE users SET name = $1 WHERE id = $2 AND role = 'delivery-person'
       RETURNING id, name, email, role`,
      [name, id]
    );
    if (!user.rows[0]) return null;
    if (!active || availability === 'unavailable') {
      const inProgress = await client.query(`SELECT shipment_code FROM shipments
        WHERE rider_user_id = $1 AND status IN (
          'rider_assigned', 'accepted_by_rider', 'picked_up', 'out_for_delivery'
        ) LIMIT 1`, [id]);
      if (inProgress.rows[0]) {
        throw problem(`Reassign shipment ${inProgress.rows[0].shipment_code} before deactivating or marking this rider unavailable.`, 409);
      }
    }
    await client.query(
      `UPDATE rider_profiles SET phone = $1, vehicle_id = $2, active = $3,
       availability = $4, updated_at = CURRENT_TIMESTAMP WHERE user_id = $5`,
      [phone || null, vehicleId || null, active, availability, id]
    );
    if (Array.isArray(zoneIds)) {
      await client.query('DELETE FROM rider_zone_coverage WHERE rider_user_id = $1', [id]);
      for (const zoneId of zoneIds) {
        await client.query(
          `INSERT INTO rider_zone_coverage (rider_user_id, delivery_zone_id) VALUES ($1, $2)`,
          [id, zoneId]
        );
      }
    }
    return { ...user.rows[0], phone: phone || null, vehicle_id: vehicleId || null, active, availability };
  });

const getDashboard = async () => {
  const [summary, riders, cod, daily, weekly, monthly] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'ready_for_delivery')::int AS ready,
      COUNT(*) FILTER (WHERE status = 'rider_assigned')::int AS assigned,
      COUNT(*) FILTER (WHERE status IN ('accepted_by_rider','picked_up','out_for_delivery'))::int AS active,
      COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
      COUNT(*) FILTER (WHERE status = 'delivery_failed')::int AS failed,
      COUNT(*) FILTER (WHERE status = 'return_to_warehouse')::int AS returned,
      ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'delivered') /
        NULLIF(COUNT(*) FILTER (WHERE status IN ('delivered','delivery_failed')), 0))::int AS success_rate,
      ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'delivery_failed') /
        NULLIF(COUNT(*) FILTER (WHERE status IN ('delivered','delivery_failed')), 0))::int AS failure_rate,
      COALESCE(SUM(delivery_fee) FILTER (WHERE status = 'delivered'), 0)::numeric AS delivery_fees_collected
      FROM shipments`),
    pool.query(`SELECT COUNT(*) FILTER (WHERE active AND availability = 'available')::int AS available,
      COUNT(*) FILTER (WHERE active AND availability <> 'available')::int AS unavailable
      FROM rider_profiles`),
    pool.query(`SELECT COALESCE(SUM(expected_amount), 0)::numeric AS expected,
      COALESCE(SUM(actual_amount), 0)::numeric AS actual,
      COALESCE(SUM(discrepancy), 0)::numeric AS discrepancy
      FROM cod_transactions WHERE transaction_type = 'collection' AND recorded_at >= CURRENT_DATE`),
    pool.query(`SELECT DATE_TRUNC('day', created_at) AS day,
      COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
      COUNT(*) FILTER (WHERE status = 'delivery_failed')::int AS failed
      FROM shipment_events WHERE status IN ('delivered', 'delivery_failed')
        AND created_at >= CURRENT_DATE - INTERVAL '6 days'
      GROUP BY DATE_TRUNC('day', created_at) ORDER BY day`),
    pool.query(`SELECT DATE_TRUNC('week', created_at) AS period,
      COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
      COUNT(*) FILTER (WHERE status = 'delivery_failed')::int AS failed
      FROM shipment_events WHERE status IN ('delivered', 'delivery_failed')
        AND created_at >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 weeks'
      GROUP BY DATE_TRUNC('week', created_at) ORDER BY period`),
    pool.query(`SELECT DATE_TRUNC('month', created_at) AS period,
      COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
      COUNT(*) FILTER (WHERE status = 'delivery_failed')::int AS failed
      FROM shipment_events WHERE status IN ('delivered', 'delivery_failed')
        AND created_at >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
      GROUP BY DATE_TRUNC('month', created_at) ORDER BY period`),
  ]);
  return {
    ...summary.rows[0], ...riders.rows[0], cod: cod.rows[0],
    daily: daily.rows, weekly: weekly.rows, monthly: monthly.rows,
  };
};

const listShipments = async ({ status = '', search = '' } = {}) => {
  const result = await pool.query(`
    SELECT s.*, o.total AS order_total, o.payment_method, o.payment_status,
           o.delivery_address, o.delivery_phone, o.delivery_instructions, o.created_at AS order_created_at,
           u.id AS customer_id, u.name AS customer_name, u.email AS customer_email,
           rp.phone AS rider_phone, rider.name AS rider_name, rider.email AS rider_email,
           v.plate_number, z.name AS zone_name, z.city, z.barangay,
           COALESCE(events.items, '[]'::json) AS history,
           COALESCE(attempts.items, '[]'::json) AS attempts,
           COALESCE(assignments.items, '[]'::json) AS assignment_history,
           tracking.latitude AS latitude, tracking.longitude AS longitude,
           tracking.accuracy AS location_accuracy, tracking.recorded_at AS location_recorded_at
    FROM shipments s
    JOIN orders o ON o.id = s.order_id
    LEFT JOIN users u ON u.id = o.user_id
    LEFT JOIN users rider ON rider.id = s.rider_user_id
    LEFT JOIN rider_profiles rp ON rp.user_id = rider.id
    LEFT JOIN vehicles v ON v.id = rp.vehicle_id
    LEFT JOIN delivery_zones z ON z.id = s.delivery_zone_id
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object('id', e.id, 'status', e.status, 'note', e.note,
        'created_at', e.created_at, 'actor_name', actor.name) ORDER BY e.created_at, e.id) AS items
      FROM shipment_events e LEFT JOIN users actor ON actor.id = e.actor_user_id
      WHERE e.shipment_id = s.id
    ) events ON TRUE
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object('id', a.id, 'result', a.result,
        'failure_reason', a.failure_reason, 'notes', a.notes,
        'rescheduled_for', a.rescheduled_for, 'attempted_at', a.attempted_at) ORDER BY a.attempted_at DESC) AS items
      FROM delivery_attempts a WHERE a.shipment_id = s.id
    ) attempts ON TRUE
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object('id', a.id, 'rider_name', r.name,
        'assigned_by', dispatcher.name, 'state', a.state, 'assigned_at', a.assigned_at,
        'accepted_at', a.accepted_at, 'ended_at', a.ended_at) ORDER BY a.assigned_at DESC) AS items
      FROM rider_assignments a
      JOIN users r ON r.id = a.rider_user_id
      LEFT JOIN users dispatcher ON dispatcher.id = a.assigned_by
      WHERE a.shipment_id = s.id
    ) assignments ON TRUE
    LEFT JOIN LATERAL (
      SELECT latitude, longitude, accuracy, recorded_at FROM delivery_tracking
      WHERE shipment_id = s.id ORDER BY recorded_at DESC LIMIT 1
    ) tracking ON TRUE
    WHERE ($1 = '' OR s.status = $1)
      AND ($2 = '' OR s.shipment_code ILIKE '%' || $2 || '%'
        OR u.name ILIKE '%' || $2 || '%' OR o.delivery_address ILIKE '%' || $2 || '%'
        OR o.delivery_phone ILIKE '%' || $2 || '%')
    ORDER BY s.created_at DESC
    LIMIT 500
  `, [status, search]);
  return result.rows;
};

const assignRider = async (shipmentId, riderId, assignedBy) =>
  inTransaction(async (client) => {
    const shipmentResult = await client.query(
      `SELECT s.*, o.user_id, o.total, o.delivery_fee FROM shipments s
       JOIN orders o ON o.id = s.order_id WHERE s.id = $1 FOR UPDATE OF s`,
      [shipmentId]
    );
    const shipment = shipmentResult.rows[0];
    if (!shipment) throw problem('Shipment not found.', 404);
    if (!['ready_for_delivery', 'rider_assigned', 'delivery_failed', 'rescheduled', 'return_to_warehouse'].includes(shipment.status)) {
      throw problem('This shipment cannot be assigned in its current status.', 409);
    }
    const riderResult = await client.query(
      `SELECT u.id, rp.active, rp.availability FROM users u
       JOIN rider_profiles rp ON rp.user_id = u.id
       WHERE u.id = $1 AND u.role = 'delivery-person' FOR UPDATE OF rp`,
      [riderId]
    );
    const rider = riderResult.rows[0];
    if (!rider || !rider.active || rider.availability !== 'available') {
      throw problem('Select an active, available rider.', 409);
    }
    if (shipment.delivery_zone_id) {
      const coverage = await client.query(
        `SELECT 1 FROM rider_zone_coverage WHERE rider_user_id = $1`, [riderId]
      );
      if (coverage.rowCount) {
        const zoneMatch = await client.query(
          `SELECT 1 FROM rider_zone_coverage WHERE rider_user_id = $1 AND delivery_zone_id = $2`,
          [riderId, shipment.delivery_zone_id]
        );
        if (!zoneMatch.rowCount) throw problem('This rider does not cover the shipment zone.', 409);
      }
    }
    const busy = await client.query(
      `SELECT 1 FROM shipments WHERE rider_user_id = $1
       AND status IN ('accepted_by_rider', 'picked_up', 'out_for_delivery') AND id <> $2 LIMIT 1`,
      [riderId, shipmentId]
    );
    if (busy.rowCount) throw problem('This rider already has an active delivery.', 409);

    await client.query(
      `UPDATE rider_assignments SET state = 'reassigned', ended_at = CURRENT_TIMESTAMP
       WHERE shipment_id = $1 AND state IN ('assigned', 'accepted')`,
      [shipmentId]
    );
    if (shipment.rider_user_id && shipment.rider_user_id !== riderId) {
      await client.query(`UPDATE rider_profiles SET availability = 'available', updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND active = TRUE AND availability = 'busy'`, [shipment.rider_user_id]);
    }
    await client.query(
      `INSERT INTO rider_assignments (shipment_id, rider_user_id, assigned_by)
       VALUES ($1, $2, $3)`,
      [shipmentId, riderId, assignedBy]
    );
    await client.query(
      `UPDATE shipments SET rider_user_id = $1, status = 'rider_assigned',
       updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [riderId, shipmentId]
    );
    await client.query(`UPDATE orders SET delivery_person_id = $1,
      delivery_person = (SELECT name FROM users WHERE id = $1), delivery_status = 'rider_assigned'
      WHERE id = $2`, [riderId, shipment.order_id]);
    await addEvent(client, shipmentId, assignedBy, 'rider_assigned', 'Rider assigned to shipment');
    await notify(client, shipmentId, riderId, 'assignment', `Shipment ${shipment.shipment_code} was assigned to you.`);
    await notify(client, shipmentId, shipment.user_id, 'status', `A rider was assigned to shipment ${shipment.shipment_code}.`);
    if (!shipment.otp_hash || !shipment.otp_expires_at || new Date(shipment.otp_expires_at) <= new Date()) {
      const otp = makeOtp();
      await client.query(`UPDATE shipments SET otp_hash = $1,
        otp_expires_at = CURRENT_TIMESTAMP + INTERVAL '48 hours' WHERE id = $2`,
      [hashOtp(otp), shipmentId]);
      await notify(client, shipmentId, shipment.user_id, 'delivery_otp',
        `Your delivery verification code is ${otp}. Share it with the rider only at handover.`);
    }
    return { id: shipmentId, rider_user_id: riderId, status: 'rider_assigned' };
  });

const autoAssignRider = async (shipmentId, assignedBy) =>
  inTransaction(async (client) => {
    const shipmentResult = await client.query(
      `SELECT s.*, o.user_id FROM shipments s JOIN orders o ON o.id = s.order_id
       WHERE s.id = $1 FOR UPDATE OF s`, [shipmentId]
    );
    const shipment = shipmentResult.rows[0];
    if (!shipment) throw problem('Shipment not found.', 404);
    if (!['ready_for_delivery', 'rider_assigned', 'delivery_failed', 'rescheduled', 'return_to_warehouse'].includes(shipment.status)) {
      throw problem('This shipment cannot be assigned in its current status.', 409);
    }
    const candidates = await client.query(
      `SELECT rp.user_id, COUNT(a.id)::int AS workload
       FROM rider_profiles rp
       JOIN users u ON u.id = rp.user_id AND u.role = 'delivery-person'
       LEFT JOIN rider_assignments a ON a.rider_user_id = rp.user_id AND a.state = 'assigned'
       WHERE rp.active = TRUE AND rp.availability = 'available'
         AND NOT EXISTS (SELECT 1 FROM shipments busy WHERE busy.rider_user_id = rp.user_id
           AND busy.status IN ('accepted_by_rider', 'picked_up', 'out_for_delivery'))
         AND (NOT EXISTS (SELECT 1 FROM rider_zone_coverage c WHERE c.rider_user_id = rp.user_id)
           OR EXISTS (SELECT 1 FROM rider_zone_coverage c WHERE c.rider_user_id = rp.user_id
             AND c.delivery_zone_id = $1))
       GROUP BY rp.user_id ORDER BY workload, rp.user_id LIMIT 1`,
      [shipment.delivery_zone_id]
    );
    if (!candidates.rows[0]) throw problem('No available rider covers this delivery zone.', 409);
    const riderId = candidates.rows[0].user_id;
    await client.query(`UPDATE rider_assignments SET state = 'reassigned', ended_at = CURRENT_TIMESTAMP
      WHERE shipment_id = $1 AND state IN ('assigned', 'accepted')`, [shipmentId]);
    if (shipment.rider_user_id && shipment.rider_user_id !== riderId) {
      await client.query(`UPDATE rider_profiles SET availability = 'available', updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND active = TRUE AND availability = 'busy'`, [shipment.rider_user_id]);
    }
    await client.query(`INSERT INTO rider_assignments (shipment_id, rider_user_id, assigned_by)
      VALUES ($1, $2, $3)`, [shipmentId, riderId, assignedBy]);
    await client.query(`UPDATE shipments SET rider_user_id = $1, status = 'rider_assigned', updated_at = CURRENT_TIMESTAMP
      WHERE id = $2`, [riderId, shipmentId]);
    await client.query(`UPDATE orders SET delivery_person_id = $1,
      delivery_person = (SELECT name FROM users WHERE id = $1), delivery_status = 'rider_assigned'
      WHERE id = $2`, [riderId, shipment.order_id]);
    await addEvent(client, shipmentId, assignedBy, 'rider_assigned', 'Automatically assigned to the least-loaded available rider');
    await notify(client, shipmentId, riderId, 'assignment', `A new shipment was assigned to you.`);
    await notify(client, shipmentId, shipment.user_id, 'status', 'A rider was assigned to your delivery.');
    if (!shipment.otp_hash || !shipment.otp_expires_at || new Date(shipment.otp_expires_at) <= new Date()) {
      const otp = makeOtp();
      await client.query(`UPDATE shipments SET otp_hash = $1,
        otp_expires_at = CURRENT_TIMESTAMP + INTERVAL '48 hours' WHERE id = $2`,
      [hashOtp(otp), shipmentId]);
      await notify(client, shipmentId, shipment.user_id, 'delivery_otp',
        `Your delivery verification code is ${otp}. Share it with the rider only at handover.`);
    }
    return { id: shipmentId, rider_user_id: riderId, status: 'rider_assigned' };
  });

const updateShipmentEta = async (shipmentId, assignedBy, estimatedAt) => inTransaction(async (client) => {
  const eta = new Date(estimatedAt);
  if (Number.isNaN(eta.getTime()) || eta <= new Date()) {
    throw problem('Estimated delivery must be a valid future date and time.');
  }
  const result = await client.query(`SELECT s.*, o.user_id FROM shipments s
    JOIN orders o ON o.id = s.order_id WHERE s.id = $1 FOR UPDATE OF s`, [shipmentId]);
  const shipment = result.rows[0];
  if (!shipment) throw problem('Shipment not found.', 404);
  if (['delivered', 'cancelled', 'return_to_warehouse'].includes(shipment.status)) {
    throw problem('ETA cannot be changed for a completed shipment.', 409);
  }
  await client.query(`UPDATE shipments SET estimated_delivery_at = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [estimatedAt, shipmentId]);
  await addEvent(client, shipmentId, assignedBy, 'eta_updated', 'Estimated delivery time updated');
  await notify(client, shipmentId, shipment.user_id, 'eta', `Estimated delivery: ${new Date(estimatedAt).toLocaleString()}`);
  return { id: shipmentId, estimated_delivery_at: estimatedAt };
});

const listRiderShipments = async (riderId) => {
  const result = await pool.query(`
    SELECT s.*, (s.rider_user_id = $1) AS is_current_assignment,
      o.total AS order_total, o.payment_method, o.delivery_address, o.delivery_phone, o.delivery_instructions,
      o.user_id AS customer_id, customer.name AS customer_name, customer.email AS customer_email,
      proof.photo_filename,
      COALESCE(events.items, '[]'::json) AS history,
      tracking.latitude AS latitude, tracking.longitude AS longitude,
      tracking.accuracy AS location_accuracy, tracking.recorded_at AS location_recorded_at
    FROM shipments s JOIN orders o ON o.id = s.order_id
    LEFT JOIN users customer ON customer.id = o.user_id
    LEFT JOIN proof_of_delivery proof ON proof.shipment_id = s.id
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object('id', e.id, 'status', e.status, 'note', e.note,
        'created_at', e.created_at) ORDER BY e.created_at, e.id) AS items
      FROM shipment_events e WHERE e.shipment_id = s.id
    ) events ON TRUE
    LEFT JOIN LATERAL (
      SELECT latitude, longitude, accuracy, recorded_at FROM delivery_tracking
      WHERE shipment_id = s.id ORDER BY recorded_at DESC LIMIT 1
    ) tracking ON TRUE
    WHERE s.rider_user_id = $1 OR EXISTS (
      SELECT 1 FROM rider_assignments past WHERE past.shipment_id = s.id AND past.rider_user_id = $1
    )
    ORDER BY s.updated_at DESC LIMIT 100`, [riderId]);
  return result.rows;
};

const acceptShipment = async (shipmentId, riderId) => inTransaction(async (client) => {
  const result = await client.query(
    `SELECT s.*, o.user_id FROM shipments s JOIN orders o ON o.id = s.order_id
     WHERE s.id = $1 AND s.rider_user_id = $2 FOR UPDATE OF s`, [shipmentId, riderId]
  );
  const shipment = result.rows[0];
  if (!shipment || shipment.status !== 'rider_assigned') throw problem('This shipment is not available to accept.', 409);
  const busy = await client.query(`SELECT 1 FROM shipments WHERE rider_user_id = $1
    AND status IN ('accepted_by_rider', 'picked_up', 'out_for_delivery') AND id <> $2 LIMIT 1`, [riderId, shipmentId]);
  if (busy.rowCount) throw problem('Finish your current delivery before accepting another.', 409);
  await client.query(`UPDATE shipments SET status = 'accepted_by_rider', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [shipmentId]);
  await client.query(`UPDATE orders SET delivery_status = 'accepted_by_rider', delivery_accepted_at = CURRENT_TIMESTAMP WHERE id = $1`, [shipment.order_id]);
  await client.query(`UPDATE rider_assignments SET state = 'accepted', accepted_at = CURRENT_TIMESTAMP
    WHERE shipment_id = $1 AND rider_user_id = $2 AND state = 'assigned'`, [shipmentId, riderId]);
  await client.query(`UPDATE rider_profiles SET availability = 'busy', updated_at = CURRENT_TIMESTAMP WHERE user_id = $1`, [riderId]);
  await addEvent(client, shipmentId, riderId, 'accepted_by_rider', 'Rider accepted delivery assignment');
  await notify(client, shipmentId, shipment.user_id, 'status', 'Your rider accepted the delivery assignment.');
  return { ...shipment, status: 'accepted_by_rider' };
});

const updateRiderShipment = async (shipmentId, riderId, input) => inTransaction(async (client) => {
  const shipmentResult = await client.query(
    `SELECT s.*, o.user_id, o.total AS order_total, o.delivery_fee AS order_delivery_fee,
       o.payment_method FROM shipments s JOIN orders o ON o.id = s.order_id
     WHERE s.id = $1 AND s.rider_user_id = $2 FOR UPDATE OF s`, [shipmentId, riderId]
  );
  const shipment = shipmentResult.rows[0];
  if (!shipment) throw problem('Assigned shipment not found.', 404);
  const { status, note, failureReason, rescheduledFor, otp, recipientName, proofConfirmed, actualCod, photoFilename } = input;
  const validNext = {
    accepted_by_rider: ['picked_up'],
    picked_up: ['out_for_delivery'],
    out_for_delivery: ['delivered', 'delivery_failed'],
    delivery_failed: ['rescheduled', 'return_to_warehouse'],
  };
  if (!validNext[shipment.status]?.includes(status)) throw problem('This status change is not allowed.', 409);

  if (status === 'delivered') {
    if (typeof otp !== 'string' || !shipment.otp_hash || new Date(shipment.otp_expires_at) < new Date()) {
      throw problem('A valid, unexpired customer OTP is required.');
    }
    const suppliedHash = Buffer.from(hashOtp(otp));
    const savedHash = Buffer.from(shipment.otp_hash);
    if (suppliedHash.length !== savedHash.length || !crypto.timingSafeEqual(suppliedHash, savedHash)) {
      throw problem('The customer OTP does not match.');
    }
    if (typeof recipientName !== 'string' || recipientName.trim().length < 2 || recipientName.trim().length > 100) {
      throw problem('Enter a recipient name between 2 and 100 characters before confirming delivery.');
    }
    if (proofConfirmed !== true && proofConfirmed !== 'true') {
      throw problem('Confirm that the order was handed to the recipient.');
    }
    if (shipment.payment_method === 'cod' &&
        (!Number.isFinite(Number(actualCod)) || Number(actualCod) < 0 || Number(actualCod) > 99999999.99)) {
      throw problem('Enter the cash amount collected for this COD order.');
    }
    await client.query(`INSERT INTO proof_of_delivery (shipment_id, recipient_name, photo_filename, confirmed_by)
      VALUES ($1, $2, $3, $4)`, [shipmentId, recipientName.trim(), photoFilename || null, riderId]);
    await client.query(`INSERT INTO delivery_attempts (shipment_id, rider_user_id, result)
      VALUES ($1, $2, 'delivered')`, [shipmentId, riderId]);
    if (shipment.payment_method === 'cod') {
      const expected = Number(shipment.expected_cod);
      await client.query(`UPDATE shipments SET actual_cod = $1 WHERE id = $2`, [Number(actualCod), shipmentId]);
      await client.query(`INSERT INTO cod_transactions
        (shipment_id, rider_user_id, transaction_type, expected_amount, actual_amount, notes)
        VALUES ($1, $2, 'collection', $3, $4, $5)`,
      [shipmentId, riderId, expected, Number(actualCod), note || null]);
      await client.query(`UPDATE orders SET payment_status = 'collected' WHERE id = $1`, [shipment.order_id]);
    }
  }

  if (status === 'delivery_failed') {
    const reasons = ['customer_unavailable', 'customer_unreachable', 'incorrect_address', 'customer_rejected', 'other'];
    if (!reasons.includes(failureReason)) throw problem('Choose a valid reason for the failed delivery.');
    await client.query(`INSERT INTO delivery_attempts (shipment_id, rider_user_id, result, failure_reason, notes)
      VALUES ($1, $2, 'failed', $3, $4)`, [shipmentId, riderId, failureReason, note || null]);
  }

  if (status === 'rescheduled') {
    const newDeliveryDate = new Date(rescheduledFor);
    if (!rescheduledFor || Number.isNaN(newDeliveryDate.getTime()) || newDeliveryDate <= new Date()) {
      throw problem('Choose a valid delivery date and time in the future.');
    }
  }
  if (status === 'rescheduled') {
    await client.query(`UPDATE delivery_attempts SET rescheduled_for = $1
      WHERE id = (SELECT id FROM delivery_attempts WHERE shipment_id = $2 ORDER BY attempted_at DESC LIMIT 1)`,
    [rescheduledFor, shipmentId]);
  }

  await client.query(`UPDATE shipments SET status = $1,
    rider_user_id = CASE WHEN $1 IN ('rescheduled','return_to_warehouse') THEN NULL ELSE rider_user_id END,
    updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [status, shipmentId]);
  await client.query(`UPDATE orders SET delivery_status = $1,
    delivery_person_id = CASE WHEN $1 IN ('rescheduled','return_to_warehouse') THEN NULL ELSE delivery_person_id END,
    delivery_person = CASE WHEN $1 IN ('rescheduled','return_to_warehouse') THEN NULL ELSE delivery_person END
    WHERE id = $2`, [status, shipment.order_id]);
  if (status === 'rescheduled') {
    const replacementOtp = makeOtp();
    await client.query(`UPDATE shipments SET otp_hash = $1,
      otp_expires_at = CURRENT_TIMESTAMP + INTERVAL '48 hours' WHERE id = $2`,
    [hashOtp(replacementOtp), shipmentId]);
    await notify(client, shipmentId, shipment.user_id, 'delivery_otp',
      `Your rescheduled delivery code is ${replacementOtp}. Share it with the rider only at handover.`);
  }
  if (['rescheduled', 'return_to_warehouse', 'delivered'].includes(status)) {
    await client.query(`UPDATE rider_assignments SET state = 'completed', ended_at = CURRENT_TIMESTAMP
      WHERE shipment_id = $1 AND rider_user_id = $2 AND state IN ('assigned','accepted')`, [shipmentId, riderId]);
    await client.query(`UPDATE rider_profiles SET availability = 'available', updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND active = TRUE AND availability = 'busy'`, [riderId]);
  }
  const eventNote = note || (status === 'delivery_failed'
    ? `Unsuccessful delivery: ${failureReason.replaceAll('_', ' ')}`
    : status === 'delivered' ? 'Delivery verified with customer OTP' : `Shipment moved to ${status.replaceAll('_', ' ')}`);
  await addEvent(client, shipmentId, riderId, status, eventNote);
  const customerMessage = status === 'delivered'
    ? `Shipment ${shipment.shipment_code} was delivered.`
    : status === 'delivery_failed'
      ? `A delivery attempt for ${shipment.shipment_code} was unsuccessful.`
      : `Shipment ${shipment.shipment_code} is now ${status.replaceAll('_', ' ')}.`;
  await notify(client, shipmentId, shipment.user_id, 'status', customerMessage);
  return { ...shipment, status };
});

const createShipmentForOrder = async (client, order, zoneId, deliveryFee, paymentMethod) => {
  const otp = makeOtp();
  const created = await client.query(
    `INSERT INTO shipments (shipment_code, order_id, delivery_zone_id, status, delivery_fee,
       expected_cod, otp_hash, otp_expires_at)
     VALUES ($1, $2, $3, 'ready_for_delivery', $4, $5, $6, CURRENT_TIMESTAMP + INTERVAL '48 hours')
     RETURNING id, shipment_code, status`,
    [shipmentCode(), order.id, zoneId, deliveryFee, paymentMethod === 'cod' ? Number(order.total) : 0, hashOtp(otp)]
  );
  const shipment = created.rows[0];
  await addEvent(client, shipment.id, order.user_id, 'ready_for_delivery', 'Shipment created from online order');
  if (paymentMethod === 'cod') {
    await notify(client, shipment.id, order.user_id, 'delivery_otp', `Your delivery verification code is ${otp}. Share it with the rider only when your order arrives.`);
  }
  return { ...shipment, delivery_otp: paymentMethod === 'cod' ? otp : null };
};

const listNotifications = async (userId) => {
  const result = await pool.query(`SELECT id, shipment_id, kind, message, read_at, created_at
    FROM delivery_notifications WHERE recipient_user_id = $1 ORDER BY created_at DESC LIMIT 100`, [userId]);
  return result.rows;
};

const markNotificationRead = async (notificationId, userId) => {
  const result = await pool.query(`UPDATE delivery_notifications SET read_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND recipient_user_id = $2 RETURNING id`, [notificationId, userId]);
  return result.rowCount > 0;
};

const recordTracking = async (shipmentId, riderId, { latitude, longitude, accuracy }) => inTransaction(async (client) => {
  const shipment = await client.query(`SELECT s.id FROM shipments s WHERE s.id = $1
    AND s.rider_user_id = $2 AND s.status = 'out_for_delivery' FOR UPDATE`, [shipmentId, riderId]);
  if (!shipment.rowCount) return null;
  const result = await client.query(`INSERT INTO delivery_tracking
    (shipment_id, rider_user_id, latitude, longitude, accuracy)
    VALUES ($1, $2, $3, $4, $5) RETURNING latitude, longitude, accuracy, recorded_at`,
  [shipmentId, riderId, latitude, longitude, accuracy || null]);
  await client.query(`DELETE FROM delivery_tracking WHERE shipment_id = $1 AND id NOT IN
    (SELECT id FROM delivery_tracking WHERE shipment_id = $1 ORDER BY recorded_at DESC LIMIT 100)`, [shipmentId]);
  return result.rows[0];
});

const getTracking = async (shipmentId) => {
  const result = await pool.query(`SELECT t.latitude, t.longitude, t.accuracy, t.recorded_at,
      o.user_id AS customer_id, s.rider_user_id, o.delivery_address
    FROM delivery_tracking t JOIN shipments s ON s.id = t.shipment_id
    JOIN orders o ON o.id = s.order_id
    WHERE t.shipment_id = $1 ORDER BY t.recorded_at DESC LIMIT 1`, [shipmentId]);
  return result.rows[0] || null;
};

const getShipmentForCustomer = async (orderId, userId) => {
  const result = await pool.query(`SELECT s.*, o.user_id, o.delivery_address,
      o.delivery_phone, o.payment_method, o.payment_status
    FROM shipments s JOIN orders o ON o.id = s.order_id
    WHERE o.id = $1 AND o.user_id = $2`, [orderId, userId]);
  return result.rows[0] || null;
};

const getShipmentProof = async (shipmentId) => {
  const result = await pool.query(`SELECT p.photo_filename, o.user_id,
      s.rider_user_id, s.id AS shipment_id
    FROM proof_of_delivery p JOIN shipments s ON s.id = p.shipment_id
    JOIN orders o ON o.id = s.order_id WHERE p.shipment_id = $1`, [shipmentId]);
  return result.rows[0] || null;
};

const remitCod = async (shipmentId, adminId, actualAmount, notes) => inTransaction(async (client) => {
  const result = await client.query(`SELECT s.*, o.user_id FROM shipments s JOIN orders o ON o.id = s.order_id
    WHERE s.id = $1 FOR UPDATE OF s`, [shipmentId]);
  const shipment = result.rows[0];
  if (!shipment || shipment.status !== 'delivered' || shipment.actual_cod == null) {
    throw problem('A delivered COD shipment is required before remittance.', 409);
  }
  if (shipment.cod_remitted_at) throw problem('COD for this shipment has already been remitted.', 409);
  const riderId = await client.query(`SELECT rider_user_id FROM rider_assignments
    WHERE shipment_id = $1 ORDER BY assigned_at DESC LIMIT 1`, [shipmentId]);
  const courierId = riderId.rows[0]?.rider_user_id;
  if (!courierId) throw problem('No rider collection record exists.', 409);
  await client.query(`INSERT INTO cod_transactions
    (shipment_id, rider_user_id, transaction_type, expected_amount, actual_amount, notes)
    VALUES ($1, $2, 'remittance', $3, $4, $5)`,
  [shipmentId, courierId, Number(shipment.actual_cod), actualAmount, notes || null]);
  await client.query(`UPDATE shipments SET cod_remitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [shipmentId]);
  await client.query(`UPDATE orders SET payment_status = 'remitted' WHERE id = $1`, [shipment.order_id]);
  await addEvent(client, shipmentId, adminId, 'cod_remitted', `COD remitted: ${actualAmount}`);
  return { shipment_id: shipmentId, expected_amount: shipment.actual_cod, actual_amount: actualAmount };
});

const getCodSummary = async (from, to) => {
  const result = await pool.query(`SELECT u.id AS rider_user_id, u.name AS rider_name,
      COUNT(*) FILTER (WHERE c.transaction_type = 'collection')::int AS collections,
      COALESCE(SUM(c.expected_amount) FILTER (WHERE c.transaction_type = 'collection'), 0)::numeric AS expected,
      COALESCE(SUM(c.actual_amount) FILTER (WHERE c.transaction_type = 'collection'), 0)::numeric AS collected,
      COALESCE(SUM(c.discrepancy) FILTER (WHERE c.transaction_type = 'collection'), 0)::numeric AS discrepancy,
      COALESCE(SUM(c.actual_amount) FILTER (WHERE c.transaction_type = 'remittance'), 0)::numeric AS remitted
    FROM cod_transactions c JOIN users u ON u.id = c.rider_user_id
    WHERE c.recorded_at >= $1::date AND c.recorded_at < ($2::date + INTERVAL '1 day')
    GROUP BY u.id, u.name ORDER BY u.name`, [from, to]);
  return result.rows;
};

module.exports = {
  problem,
  getZones,
  createZone,
  updateZone,
  listVehicles,
  createVehicle,
  updateVehicle,
  listRiders,
  createRider,
  updateRider,
  getDashboard,
  listShipments,
  assignRider,
  autoAssignRider,
  updateShipmentEta,
  listRiderShipments,
  acceptShipment,
  updateRiderShipment,
  createShipmentForOrder,
  listNotifications,
  markNotificationRead,
  recordTracking,
  getTracking,
  getShipmentForCustomer,
  getShipmentProof,
  remitCod,
  getCodSummary,
};
