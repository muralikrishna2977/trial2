import jwt from "jsonwebtoken";

const TOKEN_TTL = "7d";

export function signToken(user) {
  return jwt.sign({ id: user._id.toString(), email: user.email }, process.env.JWT_SECRET, {
    expiresIn: TOKEN_TTL,
  });
}

// Returns the user id from a valid token, or null.
function verifyToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET).id ?? null;
  } catch {
    return null;
  }
}

// Express middleware: requires "Authorization: Bearer <token>" and sets req.userId.
// Routes must use req.userId — never a user id sent in the request body.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const userId = verifyToken(token);
  if (!userId) return res.status(401).json({ message: "Not authenticated" });
  req.userId = userId;
  next();
}

// Socket.IO middleware: requires { auth: { token } } in the handshake and sets socket.data.userId.
export function socketAuth(socket, next) {
  const userId = verifyToken(socket.handshake.auth?.token);
  if (!userId) return next(new Error("unauthorized"));
  socket.data.userId = userId;
  next();
}
