import { Router, Response } from "express";
import User from "../models/User";
import { verifyFirebaseToken, AuthedRequest } from "../middleware/verifyFirebaseToken";

const router = Router();

// POST /api/auth/sync
// Called once right after Firebase login/signup on the frontend.
// Verifies the ID token, then creates or updates the matching MongoDB user doc.
router.post("/sync", verifyFirebaseToken, async (req: AuthedRequest, res: Response) => {
  try {
    const { uid, email, name, picture } = req.firebaseUser!;
    const existing = await User.findOne({ firebaseUid: uid }).lean();

    const user = await User.findOneAndUpdate(
      { firebaseUid: uid },
      {
        $set: {
          firebaseUid: uid,
          email: email ?? "",
          displayName: existing?.displayName || name || "",
          photoURL: typeof picture === "string" ? picture : undefined,
          lastLoginAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({ user });
  } catch (err) {
    console.error("Auth sync failed:", err);
    res.status(500).json({ error: "Failed to sync user" });
  }
});

// GET /api/auth/me
// Returns the logged-in user's MongoDB profile. Used by the dashboard on load.
router.get("/me", verifyFirebaseToken, async (req: AuthedRequest, res: Response) => {
  try {
    const user = await User.findOne({ firebaseUid: req.firebaseUser!.uid });
    if (!user) {
      res.status(404).json({ error: "User not found in database" });
      return;
    }
    res.status(200).json({ user });
  } catch (err) {
    console.error("Fetching user failed:", err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// PATCH /api/auth/me
// Updates the operator profile collected during onboarding and shown on /profile.
router.patch("/me", verifyFirebaseToken, async (req: AuthedRequest, res: Response) => {
  try {
    const displayName = String(req.body.displayName ?? "").trim();
    const phone = String(req.body.phone ?? "").trim();
    const occupation = String(req.body.occupation ?? "").trim();
    const email = req.firebaseUser!.email ?? String(req.body.email ?? "").trim();

    if (!displayName || !email || !phone || !occupation) {
      res.status(400).json({ error: "Name, email, phone, and occupation are required" });
      return;
    }

    const user = await User.findOneAndUpdate(
      { firebaseUid: req.firebaseUser!.uid },
      {
        $set: {
          firebaseUid: req.firebaseUser!.uid,
          email,
          displayName,
          phone,
          occupation,
          photoURL: typeof req.firebaseUser!.picture === "string" ? req.firebaseUser!.picture : undefined,
          isProfileComplete: true,
          lastLoginAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({ user });
  } catch (err) {
    console.error("Profile update failed:", err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

export default router;
