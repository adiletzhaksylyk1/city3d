"use strict";

function parseBbox(bboxStr) {
  if (!bboxStr || typeof bboxStr !== "string") {
    throw new Error("bbox parameter is required");
  }

  const parts = bboxStr.split(",").map(Number);

  if (parts.length !== 4 || parts.some(isNaN)) {
    throw new Error(
      "bbox must be four comma-separated numbers: minLon,minLat,maxLon,maxLat"
    );
  }

  const [minLon, minLat, maxLon, maxLat] = parts;

  if (minLon >= maxLon) throw new Error("minLon must be less than maxLon");
  if (minLat >= maxLat) throw new Error("minLat must be less than maxLat");
  if (minLon < -180 || maxLon > 180) throw new Error("Longitude out of range [-180, 180]");
  if (minLat < -90  || maxLat > 90)  throw new Error("Latitude out of range [-90, 90]");

  // Sanity: reject absurdly large bboxes that would load the whole planet
  const lonSpan = maxLon - minLon;
  const latSpan = maxLat - minLat;
  if (lonSpan > 5 || latSpan > 5) {
    throw new Error("bbox is too large (max 5° per axis). Use a smaller viewport.");
  }

  return { minLon, minLat, maxLon, maxLat };
}

function validateBbox(req, res, next) {
  try {
    req.bbox = parseBbox(req.query.bbox);
    next();
  } catch (err) {
    res.status(400).json({
      error: "Invalid bbox parameter",
      message: err.message,
      example: "/api/buildings?bbox=71.4,51.1,71.5,51.2",
    });
  }
}

function validateLod(req, res, next) {
  const lodStr = req.query.lod;
  if (lodStr === undefined) {
    req.lod = null;   // no filter
    return next();
  }

  const lod = parseInt(lodStr, 10);
  if (isNaN(lod) || lod < 0 || lod > 4) {
    return res.status(400).json({
      error: "Invalid lod parameter",
      message: "lod must be an integer between 0 and 4",
    });
  }

  req.lod = lod;
  next();
}

module.exports = { validateBbox, validateLod, parseBbox };
