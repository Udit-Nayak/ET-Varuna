import { Request, Response, NextFunction } from "express";
import admin from "../config/firebase";

export interface AuthedRequest extends Request {
  firebaseUser?: admin.auth.DecodedIdToken;
}

export const verifyFirebaseToken = async (
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or malformed Authorization header" });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.firebaseUser = decoded;
    next();
  } catch (err) {
    console.error("Token verification failed:", err);
    res.status(401).json({ error: "Invalid or expired token" });
  }
};
