const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { pool, initializeDatabase, withTransaction } = require("./lib/database");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const APP_BASE_PATH = "/reservation";
const PUBLIC_DIR = path.join(__dirname, "public");

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const PIN_PATTERN = /^\d{4,8}$/;
const MAX_RESERVATION_MINUTES = 4 * 60;

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidDate(value) {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year
    && date.getUTCMonth() === (month - 1)
    && date.getUTCDate() === day
  );
}

function isValidTime(value) {
  if (!TIME_PATTERN.test(value)) {
    return false;
  }

  const [hours, minutes] = value.split(":").map(Number);

  return (
    Number.isInteger(hours)
    && Number.isInteger(minutes)
    && hours >= 0
    && hours <= 23
    && minutes >= 0
    && minutes <= 59
  );
}

function toMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours * 60) + minutes;
}

function normalizeDbDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

function normalizeDbTime(value) {
  if (!value) {
    return null;
  }

  const raw = String(value).trim();
  if (!raw.includes(":")) {
    return null;
  }

  const [hours, minutes] = raw.split(":");
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function mapSpaceRow(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    capacity: Number(row.capacity),
    openTime: normalizeDbTime(row.open_time),
    closeTime: normalizeDbTime(row.close_time)
  };
}

function mapReservationRow(row) {
  return {
    id: row.id,
    spaceId: row.space_id,
    date: normalizeDbDate(row.date),
    startTime: normalizeDbTime(row.start_time),
    endTime: normalizeDbTime(row.end_time),
    residentName: row.resident_name,
    roomNumber: row.room_number,
    note: row.note || "",
    cancellationPinHash: row.cancellation_pin_hash,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
  };
}

function toPublicReservation(reservation) {
  const { cancellationPinHash, ...publicReservation } = reservation;
  return publicReservation;
}

function hasAvailabilityWindow(space) {
  return isValidTime(space.openTime) && isValidTime(space.closeTime);
}

function sameText(first, second) {
  return normalizeString(first).toLowerCase() === normalizeString(second).toLowerCase();
}

function hashText(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function buildReservationWhereClause(filters, activeOnly) {
  const conditions = [];
  const values = [];

  if (filters.spaceId) {
    values.push(filters.spaceId);
    conditions.push(`space_id = $${values.length}`);
  }

  if (filters.date) {
    values.push(filters.date);
    conditions.push(`date = $${values.length}::date`);
  }

  if (filters.roomNumber) {
    values.push(filters.roomNumber.toLowerCase());
    conditions.push(`LOWER(room_number) = $${values.length}`);
  }

  if (activeOnly) {
    conditions.push("(date > CURRENT_DATE OR (date = CURRENT_DATE AND end_time >= CURRENT_TIME))");
  }

  if (conditions.length === 0) {
    return { whereSql: "", values };
  }

  return {
    whereSql: `WHERE ${conditions.join(" AND ")}`,
    values
  };
}

app.use(express.json());
app.get("/", (_req, res) => {
  res.redirect(APP_BASE_PATH);
});
app.get(APP_BASE_PATH, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});
app.use(APP_BASE_PATH, express.static(PUBLIC_DIR));

app.get(`${APP_BASE_PATH}/api/health`, (_req, res) => {
  res.json({ status: "ok" });
});

app.get(`${APP_BASE_PATH}/api/spaces`, async (_req, res, next) => {
  try {
    const result = await pool.query(
      `
        SELECT id, name, description, capacity, open_time, close_time
        FROM spaces
        ORDER BY id ASC
      `
    );

    res.json(result.rows.map(mapSpaceRow));
  } catch (error) {
    next(error);
  }
});

app.get(`${APP_BASE_PATH}/api/reservations`, async (req, res, next) => {
  try {
    const activeOnly = normalizeString(req.query.activeOnly).toLowerCase() === "true";
    const filters = {
      spaceId: normalizeString(req.query.spaceId),
      date: normalizeString(req.query.date),
      roomNumber: normalizeString(req.query.roomNumber)
    };

    if (filters.date && !isValidDate(filters.date)) {
      return res.status(400).json({ error: "Invalid date filter. Use YYYY-MM-DD format." });
    }

    const { whereSql, values } = buildReservationWhereClause(filters, activeOnly);

    const result = await pool.query(
      `
        SELECT
          id,
          space_id,
          date,
          start_time,
          end_time,
          resident_name,
          room_number,
          note,
          cancellation_pin_hash,
          created_at
        FROM reservations
        ${whereSql}
        ORDER BY date ASC, start_time ASC
      `,
      values
    );

    res.json(result.rows.map(mapReservationRow).map(toPublicReservation));
  } catch (error) {
    next(error);
  }
});

app.post(`${APP_BASE_PATH}/api/reservations`, async (req, res, next) => {
  try {
    const payload = {
      spaceId: normalizeString(req.body.spaceId),
      date: normalizeString(req.body.date),
      startTime: normalizeString(req.body.startTime),
      endTime: normalizeString(req.body.endTime),
      residentName: normalizeString(req.body.residentName),
      roomNumber: normalizeString(req.body.roomNumber),
      cancellationPin: normalizeString(req.body.cancellationPin),
      note: normalizeString(req.body.note)
    };

    const requiredFields = [
      ["spaceId", payload.spaceId],
      ["date", payload.date],
      ["startTime", payload.startTime],
      ["endTime", payload.endTime],
      ["residentName", payload.residentName],
      ["roomNumber", payload.roomNumber],
      ["cancellationPin", payload.cancellationPin]
    ];

    const missingField = requiredFields.find(([, value]) => !value);
    if (missingField) {
      return res.status(400).json({ error: `Missing required field: ${missingField[0]}` });
    }

    if (!isValidDate(payload.date)) {
      return res.status(400).json({ error: "Invalid date. Use YYYY-MM-DD format." });
    }

    if (!isValidTime(payload.startTime) || !isValidTime(payload.endTime)) {
      return res.status(400).json({ error: "Invalid time. Use HH:MM format." });
    }

    const startMinutes = toMinutes(payload.startTime);
    const endMinutes = toMinutes(payload.endTime);

    if (startMinutes >= endMinutes) {
      return res.status(400).json({ error: "End time must be after start time." });
    }

    if ((endMinutes - startMinutes) > MAX_RESERVATION_MINUTES) {
      return res.status(400).json({ error: "A reservation cannot be longer than 4 hours." });
    }

    if (!PIN_PATTERN.test(payload.cancellationPin)) {
      return res.status(400).json({ error: "Cancellation PIN must be 4 to 8 digits." });
    }

    const spaceResult = await pool.query(
      `
        SELECT id, name, open_time, close_time
        FROM spaces
        WHERE id = $1
      `,
      [payload.spaceId]
    );

    if (spaceResult.rowCount === 0) {
      return res.status(404).json({ error: "Space not found." });
    }

    const selectedSpace = mapSpaceRow(spaceResult.rows[0]);

    if (hasAvailabilityWindow(selectedSpace)) {
      const openingMinutes = toMinutes(selectedSpace.openTime);
      const closingMinutes = toMinutes(selectedSpace.closeTime);

      if (startMinutes < openingMinutes || endMinutes > closingMinutes) {
        return res.status(400).json({
          error: `This space is available between ${selectedSpace.openTime} and ${selectedSpace.closeTime}.`
        });
      }
    }

    const createdReservation = await withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${payload.spaceId}:${payload.date}`]);

      const overlapResult = await client.query(
        `
          SELECT 1
          FROM reservations
          WHERE
            space_id = $1
            AND date = $2::date
            AND $3::time < end_time
            AND $4::time > start_time
          LIMIT 1
        `,
        [payload.spaceId, payload.date, payload.startTime, payload.endTime]
      );

      if (overlapResult.rowCount > 0) {
        const overlapError = new Error("The selected time slot is already booked.");
        overlapError.status = 409;
        throw overlapError;
      }

      const insertResult = await client.query(
        `
          INSERT INTO reservations (
            id,
            space_id,
            date,
            start_time,
            end_time,
            resident_name,
            room_number,
            note,
            cancellation_pin_hash
          )
          VALUES ($1, $2, $3::date, $4::time, $5::time, $6, $7, $8, $9)
          RETURNING
            id,
            space_id,
            date,
            start_time,
            end_time,
            resident_name,
            room_number,
            note,
            cancellation_pin_hash,
            created_at
        `,
        [
          crypto.randomUUID(),
          payload.spaceId,
          payload.date,
          payload.startTime,
          payload.endTime,
          payload.residentName,
          payload.roomNumber,
          payload.note,
          hashText(payload.cancellationPin)
        ]
      );

      return mapReservationRow(insertResult.rows[0]);
    });

    return res.status(201).json({
      message: "Reservation confirmed.",
      reservation: toPublicReservation(createdReservation)
    });
  } catch (error) {
    next(error);
  }
});

app.delete(`${APP_BASE_PATH}/api/reservations/:id`, async (req, res, next) => {
  try {
    const reservationId = normalizeString(req.params.id);
    const cancellationPin = normalizeString(req.body.cancellationPin);
    const roomNumber = normalizeString(req.body.roomNumber);
    const residentName = normalizeString(req.body.residentName);

    if (!reservationId) {
      return res.status(400).json({ error: "Invalid reservation ID." });
    }

    if (!cancellationPin) {
      return res.status(400).json({ error: "Cancellation PIN is required." });
    }

    if (!PIN_PATTERN.test(cancellationPin)) {
      return res.status(400).json({ error: "Cancellation PIN must be 4 to 8 digits." });
    }

    if (!roomNumber) {
      return res.status(400).json({ error: "Room number is required." });
    }

    if (!residentName) {
      return res.status(400).json({ error: "Full name is required." });
    }

    const deleted = await withTransaction(async (client) => {
      const reservationResult = await client.query(
        `
          SELECT
            id,
            resident_name,
            room_number,
            cancellation_pin_hash
          FROM reservations
          WHERE id = $1
          FOR UPDATE
        `,
        [reservationId]
      );

      if (reservationResult.rowCount === 0) {
        const notFound = new Error("Reservation not found.");
        notFound.status = 404;
        throw notFound;
      }

      const reservation = reservationResult.rows[0];

      if (reservation.cancellation_pin_hash !== hashText(cancellationPin)) {
        const unauthorized = new Error("Wrong cancellation PIN.");
        unauthorized.status = 401;
        throw unauthorized;
      }

      if (!sameText(reservation.room_number, roomNumber) || !sameText(reservation.resident_name, residentName)) {
        const forbidden = new Error("Only the reservation owner can cancel this booking.");
        forbidden.status = 403;
        throw forbidden;
      }

      const deleteResult = await client.query(
        `
          DELETE FROM reservations
          WHERE id = $1
          RETURNING id
        `,
        [reservationId]
      );

      return deleteResult.rows[0];
    });

    res.json({
      message: "Reservation deleted.",
      id: deleted.id
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const statusCode = error.status || 500;
  console.error(error);
  res.status(statusCode).json({
    error: statusCode === 500 ? "Internal server error." : error.message
  });
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}${APP_BASE_PATH}`);
    });
  })
  .catch((error) => {
    console.error("Unable to start server:", error);
    process.exit(1);
  });
