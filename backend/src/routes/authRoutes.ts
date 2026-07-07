import { Router, Response } from "express";
import User from "../models/User";
import { verifyFirebaseToken, AuthedRequest } from "../middleware/verifyFirebaseToken";

const router = Router();

// POST /api/auth/sync
// Called once right after Firebase login/signup on the frontend.
// Verifies the ID token, then creates or updates the matching MongoDB user doc.
router.post("/sync", verifyFirebaseToken, async (req: AuthedRequest, res: Response) => {
  try {
    const { uid, email, name } = req.firebaseUser!;

    const user = await User.findOneAndUpdate(
      { firebaseUid: uid },
      {
        firebaseUid: uid,
        email: email ?? "",
        displayName: name ?? "",
        lastLoginAt: new Date(),
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

export default router;
